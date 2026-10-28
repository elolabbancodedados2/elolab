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
import { Shield, Search, FileJson, AlertTriangle, Users, LifeBuoy, CheckCircle2, Trash2, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useBuscaPacientes } from '@/hooks/useBuscaPacientes';
import { LoadingButton } from '@/components/ui/loading-button';
import { ListSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState, friendlyErrorMessage } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  ANONIMIZACAO_LGPD_HABILITADA,
  ESCOPOS_EXPORTACAO_LGPD,
  concluirExportacaoLgpd,
  exportPatientData,
  registrarSolicitacaoExclusaoLgpd,
  type EscopoExportacaoLgpd,
} from '@/lib/lgpdCompliance';
import { AnonimizarPacienteDialog } from '@/components/lgpd/AnonimizarPacienteDialog';
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
  const [pacienteExclusao, setPacienteExclusao] = useState<PacienteLGPD | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState('');
  const [anonimizarPaciente, setAnonimizarPaciente] = useState<{ id: string; nome: string } | null>(null);

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
      toast.error(friendlyErrorMessage(err, 'Não foi possível exportar os dados.'));
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

  // A exclusão automática está suspensa (CLIN-QA-004): a tela só registra o
  // pedido como tarefa urgente para tratamento manual e não apaga nada.
  const registrarExclusao = async () => {
    const paciente = pacienteExclusao;
    if (!paciente || !motivoExclusao.trim()) return;
    if (!profile?.clinica_id) {
      toast.error('Não foi possível identificar a clínica. Entre novamente e tente outra vez.');
      return;
    }
    setIsProcessing(true);
    try {
      await registrarSolicitacaoExclusaoLgpd({
        pacienteId: paciente.id,
        pacienteNome: paciente.nome,
        clinicaId: profile.clinica_id,
        motivo: motivoExclusao,
      });
      toast.success(`Solicitação de exclusão de ${paciente.nome} registrada em Tarefas para tratamento manual.`);
      setPacienteExclusao(null);
      setMotivoExclusao('');
    } catch (err: unknown) {
      console.error(err);
      toast.error(friendlyErrorMessage(err, 'Não foi possível registrar a solicitação.'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 p-2 sm:p-6">
      <PageHeader
        title="Direitos do Titular (LGPD)"
        description={searchTerm.trim() && !isLoading && !isDebouncing && !error
          ? `${filtered.length} titular${filtered.length === 1 ? '' : 'es'} encontrado${filtered.length === 1 ? '' : 's'} · Lei 13.709/2018`
          : 'Consultar dados e orientar o atendimento a solicitações do titular (Lei 13.709/2018)'}
        icon={<Shield />}
        actions={(
          <>
            <Button asChild variant="outline" className="gap-2 rounded-full">
              <Link to="/pacientes"><Users aria-hidden="true" className="h-4 w-4" /> Pacientes</Link>
            </Button>
            <Button asChild className="gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
              <Link to="/suporte"><LifeBuoy aria-hidden="true" className="h-4 w-4" /> Solicitar análise ao suporte</Link>
            </Button>
          </>
        )}
      />

      <Alert className="rounded-2xl border-[#BFD8EE] bg-[#F3F8FC]">
        <AlertTriangle className="h-4 w-4 !text-[#1080CA]" />
        <AlertDescription>
          Cada exportação recebe um protocolo e gera um registro de auditoria da clínica antes de preparar o arquivo JSON para download. Escolha as categorias pedidas pelo titular; o cadastro é sempre incluído. O pedido continua pendente até a clínica confirmar a entrega ao titular. Anexos do prontuário de até 30 MB no total são incluídos no JSON em Base64; arquivos externos e outros documentos vinculados por módulos específicos ainda exigem conferência manual. Armazene o arquivo em local seguro e compartilhe apenas com pessoas autorizadas.
          <span className="mt-2 block font-medium">A exclusão automática de dados está suspensa. O pedido de exclusão do titular fica registrado em Tarefas para tratamento manual pelo encarregado de dados, e nenhum dado é apagado por esta tela.</span>
        </AlertDescription>
      </Alert>

      <Card aria-busy={isLoading || isDebouncing} className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base">Buscar Paciente</CardTitle>
          <CardDescription>Por nome, CPF ou email</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
              aria-label="Buscar paciente por nome, CPF ou e-mail"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite nome, CPF ou email..."
              className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
            />
          </div>

          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {(isLoading || isDebouncing) && <ListSkeleton items={4} />}
            {!isLoading && !isDebouncing && error && (
              <ErrorState compact error={error} onRetry={() => refetch()} />
            )}
            {!isLoading && !isDebouncing && !error && !searchTerm && pacientes.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                  <Users className="h-6 w-6" />
                </span>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Nenhum paciente cadastrado ainda. Cadastre uma ficha antes de atender uma solicitação do titular.
                </p>
                <Button asChild className="rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
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
                className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-[#9CC7EC] hover:bg-[#F3F8FC] sm:flex-row sm:items-center sm:justify-between"
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
                    className="h-9 gap-1.5 rounded-full text-xs"
                    onClick={() => abrirEscopo(p)}
                    disabled={isProcessing}
                    title="Exportar dados (portabilidade)"
                  >
                    <FileJson aria-hidden="true" className="h-4 w-4" />
                    Exportar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 rounded-full text-xs"
                    onClick={() => { setMotivoExclusao(''); setPacienteExclusao(p); }}
                    disabled={isProcessing}
                    title="Registrar pedido de exclusão (direito ao esquecimento)"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    Solicitar exclusão
                  </Button>
                  {/* Anonimização transacional (CLIN-QA-004): só com a trava ligada. */}
                  {ANONIMIZACAO_LGPD_HABILITADA && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 rounded-full text-xs"
                      onClick={() => setAnonimizarPaciente({ id: p.id, nome: p.nome })}
                      disabled={isProcessing}
                      title="Anonimizar o cadastro (preserva o prontuário)"
                    >
                      <UserX aria-hidden="true" className="h-4 w-4" />
                      Anonimizar
                    </Button>
                  )}
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

      <Dialog open={!!pacienteExclusao} onOpenChange={(open) => { if (!open && !isProcessing) setPacienteExclusao(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar solicitação de exclusão</DialogTitle>
            <DialogDescription>
              O pedido de exclusão de dados de {pacienteExclusao?.nome} será registrado como tarefa urgente para tratamento manual pelo encarregado de dados. Nenhum dado é apagado agora: a exclusão automática está suspensa até existir um processo que preserve o prontuário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-exclusao">Motivo informado pelo titular</Label>
            <Textarea id="motivo-exclusao" value={motivoExclusao} maxLength={1000} onChange={e => setMotivoExclusao(e.target.value)} placeholder="Ex.: pedido do titular por escrito, protocolo de atendimento." />
            <p className="text-[11px] text-muted-foreground">Não inclua dados clínicos.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setPacienteExclusao(null)} disabled={isProcessing}>Cancelar</Button>
            <LoadingButton className="rounded-full" onClick={() => void registrarExclusao()} disabled={!motivoExclusao.trim()} isLoading={isProcessing} loadingText="Registrando...">
              Registrar solicitação
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ANONIMIZACAO_LGPD_HABILITADA && (
        <AnonimizarPacienteDialog
          paciente={anonimizarPaciente}
          clinicaId={profile?.clinica_id}
          open={!!anonimizarPaciente}
          onOpenChange={(aberto) => { if (!aberto) setAnonimizarPaciente(null); }}
          onConcluido={() => { void refetch(); }}
        />
      )}
    </div>
  );
}
