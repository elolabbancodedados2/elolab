import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, Search, FileJson, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useBuscaPacientes } from '@/hooks/useBuscaPacientes';
import { LoadingButton } from '@/components/ui/loading-button';
import { ListSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ESCOPOS_EXPORTACAO_LGPD, concluirExportacaoLgpd, exportPatientData, type EscopoExportacaoLgpd } from '@/lib/lgpdCompliance';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { formatDateTimePreference } from '@/lib/formatters';

type PacienteLGPD = { id: string; nome: string; cpf: string | null; email: string | null };
type PedidoPendente = { id: string; protocolo: string | null; requested_at: string; escopo: string[] | null; pacientes: { nome: string } | null };

const TODOS_ESCOPOS = ESCOPOS_EXPORTACAO_LGPD.map(e => e.id);
const rotuloEscopo = (id: string) => ESCOPOS_EXPORTACAO_LGPD.find(e => e.id === id)?.rotulo ?? id;

export default function LgpdPacientes() {
  const { profile } = useSupabaseAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const { data: resultadoBusca, refetch, isLoading, error, isDebouncing } = useBuscaPacientes(searchTerm, {
    limite: 30,
    select: 'id,nome,cpf,email',
  });
  const pacientes = resultadoBusca?.pacientes ?? [];
  const [isProcessing, setIsProcessing] = useState(false);
  const [pacienteEscopo, setPacienteEscopo] = useState<PacienteLGPD | null>(null);
  const [escopo, setEscopo] = useState<EscopoExportacaoLgpd[]>(TODOS_ESCOPOS);
  const [pedidoConclusao, setPedidoConclusao] = useState<PedidoPendente | null>(null);
  const [evidencia, setEvidencia] = useState('');

  const pendentes = useQuery({
    queryKey: ['lgpd-exportacoes-pendentes', profile?.clinica_id ?? null],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error: erro } = await supabase
        .from('lgpd_access_request_log')
        .select('id,protocolo,requested_at,escopo,pacientes(nome)')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .eq('request_type', 'export')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true })
        .limit(100);
      if (erro) throw erro;
      return (data ?? []) as unknown as PedidoPendente[];
    },
  });

  const filtered = pacientes.filter((p: PacienteLGPD) => {
    // O titular que pede seus dados pela LGPD informa o CPF do próprio
    // documento, sem máscara. Não achá-lo aqui é descumprir prazo legal.
    return pacienteCorresponde(p, searchTerm);
  });

  const abrirEscopo = (paciente: PacienteLGPD) => {
    setEscopo(TODOS_ESCOPOS);
    setPacienteEscopo(paciente);
  };

  const alternarEscopo = (id: EscopoExportacaoLgpd, marcado: boolean) => {
    setEscopo(atual => marcado ? [...new Set([...atual, id])] : atual.filter(item => item !== id));
  };

  const handleExport = async () => {
    const paciente = pacienteEscopo;
    if (!paciente) return;
    setIsProcessing(true);
    try {
      const data = await exportPatientData(paciente.id, escopo);
      const protocolo = (data.exportacao as { protocolo?: string | null } | undefined)?.protocolo ?? null;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lgpd-export-${protocolo ?? paciente.nome.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setPacienteEscopo(null);
      toast.success(`JSON de ${paciente.nome} preparado${protocolo ? ` · protocolo ${protocolo}` : ''}`, { description: 'O pedido segue pendente até a clínica confirmar a entrega ao titular abaixo.' });
      void pendentes.refetch();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar dados');
    } finally {
      setIsProcessing(false);
    }
  };

  const evidenciaValida = evidencia.trim().length >= 20 && evidencia.trim().length <= 1000;
  const concluir = async () => {
    if (!pedidoConclusao || !evidenciaValida) return;
    setIsProcessing(true);
    try {
      const { protocolo } = await concluirExportacaoLgpd(pedidoConclusao.id, evidencia);
      toast.success(`Entrega do protocolo ${protocolo} confirmada`);
      setPedidoConclusao(null);
      setEvidencia('');
      void pendentes.refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível confirmar a entrega.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 p-2 sm:p-6">
      <PageHeader
        title="Direitos do Titular (LGPD)"
        description="Consultar dados e orientar o atendimento a solicitações do titular (Lei 13.709/2018)"
        icon={<Shield />}
        actions={(
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/suporte">Solicitar análise ao suporte</Link>
          </Button>
        )}
      />

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Cada exportação recebe um protocolo e gera um registro de auditoria da clínica antes de preparar o arquivo JSON para download. Escolha as categorias pedidas pelo titular; o cadastro é sempre incluído. O pedido continua pendente até a clínica confirmar a entrega ao titular. Anexos do prontuário de até 30 MB no total são incluídos no JSON em Base64; arquivos externos e outros documentos vinculados por módulos específicos ainda exigem conferência manual. Armazene o arquivo em local seguro e compartilhe apenas com pessoas autorizadas.
          <span className="mt-2 block font-medium">A exclusão de dados não pode ser concluída por esta tela neste momento. Solicite análise ao suporte antes de confirmar o atendimento ao titular.</span>
        </AlertDescription>
      </Alert>

      <Card aria-busy={isLoading || isDebouncing}>
        <CardHeader>
          <CardTitle>Buscar Paciente</CardTitle>
          <CardDescription>Por nome, CPF ou email</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
              aria-label="Buscar paciente por nome, CPF ou e-mail"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite nome, CPF ou email..."
              className="pl-10"
            />
          </div>

          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {(isLoading || isDebouncing) && <ListSkeleton items={4} />}
            {!isLoading && !isDebouncing && error && (
              <ErrorState compact error={error} onRetry={() => refetch()} />
            )}
            {!isLoading && !isDebouncing && !error && !searchTerm && pacientes.length === 0 && (
              <div className="space-y-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum paciente cadastrado ainda. Cadastre uma ficha antes de atender uma solicitação do titular.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/pacientes">Ir para Pacientes</Link>
                </Button>
              </div>
            )}
            {!isLoading && !isDebouncing && !error && searchTerm && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum paciente encontrado para "{searchTerm}". Verifique a grafia ou tente pelo CPF.
              </p>
            )}
            {!isLoading && !isDebouncing && !error && resultadoBusca?.incompleta && (
              <p className="text-xs text-muted-foreground" role="status">
                Há mais de 30 resultados. Refine a busca para localizar outro titular.
              </p>
            )}
            {!isLoading && !isDebouncing && !error && filtered.map((p: PacienteLGPD) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 p-3 border rounded-lg hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.cpf || 'sem CPF'} {p.email ? ` · ${p.email}` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-full text-xs"
                    onClick={() => abrirEscopo(p)}
                    disabled={isProcessing}
                    title="Exportar dados (portabilidade)"
                  >
                    <FileJson className="h-4 w-4 mr-1" />
                    Exportar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exportações aguardando entrega</CardTitle>
          <CardDescription>Confirme quando o arquivo chegar ao titular. A confirmação fica na trilha de auditoria.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pendentes.isLoading && <ListSkeleton items={2} />}
          {pendentes.error && <ErrorState compact error={pendentes.error} onRetry={() => { void pendentes.refetch(); }} />}
          {pendentes.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma exportação pendente.</p>}
          {pendentes.data?.map(pedido => (
            <div key={pedido.id} className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{pedido.protocolo ?? 'Sem protocolo'} · {pedido.pacientes?.nome ?? 'Paciente'}</p>
                <p className="text-xs text-muted-foreground">
                  Pedido em {formatDateTimePreference(pedido.requested_at)} · {(pedido.escopo ?? TODOS_ESCOPOS).map(rotuloEscopo).join(', ')}
                </p>
              </div>
              <Button size="sm" className="h-9 shrink-0 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110" onClick={() => { setEvidencia(''); setPedidoConclusao(pedido); }}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Confirmar entrega
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!pacienteEscopo} onOpenChange={(open) => { if (!open && !isProcessing) setPacienteEscopo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escopo da exportação</DialogTitle>
            <DialogDescription>Selecione o que o titular pediu para {pacienteEscopo?.nome}. O cadastro sempre acompanha o arquivo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {ESCOPOS_EXPORTACAO_LGPD.map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox
                  id={`escopo-${item.id}`}
                  checked={item.id === 'cadastro' || escopo.includes(item.id)}
                  disabled={item.id === 'cadastro'}
                  onCheckedChange={(value) => alternarEscopo(item.id, value === true)}
                />
                <Label htmlFor={`escopo-${item.id}`} className="text-sm font-normal">{item.rotulo}</Label>
                {item.id === 'cadastro' && <Badge variant="outline" className="rounded-full text-[10px]">sempre</Badge>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setPacienteEscopo(null)} disabled={isProcessing}>Cancelar</Button>
            <LoadingButton className="rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={() => void handleExport()} isLoading={isProcessing} loadingText="Exportando...">
              <FileJson className="mr-1 h-4 w-4" />
              Gerar arquivo
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pedidoConclusao} onOpenChange={(open) => { if (!open && !isProcessing) setPedidoConclusao(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar entrega ao titular</DialogTitle>
            <DialogDescription>Protocolo {pedidoConclusao?.protocolo ?? '—'}. Depois de confirmado, o pedido não volta a ficar pendente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="evidencia-entrega">Como a entrega foi feita</Label>
            <Textarea id="evidencia-entrega" value={evidencia} maxLength={1000} onChange={e => setEvidencia(e.target.value)} placeholder="Ex.: arquivo entregue pessoalmente ao titular em pendrive criptografado, com recibo assinado." />
            <p className="text-[11px] text-muted-foreground">Entre 20 e 1.000 caracteres. Não inclua dados clínicos.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setPedidoConclusao(null)} disabled={isProcessing}>Cancelar</Button>
            <LoadingButton className="rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={() => void concluir()} disabled={!evidenciaValida} isLoading={isProcessing} loadingText="Confirmando...">
              Confirmar entrega
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
