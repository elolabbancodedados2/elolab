import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Shield, Search, FileJson, AlertTriangle, Users, LifeBuoy, CheckCircle2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';

type PacienteLGPD = { id: string; nome: string; cpf: string | null; email: string | null };
type PedidoPendente = { id: string; protocolo: string | null; requested_at: string; escopo: string[] | null; pacientes: { nome: string } | null };

const TODOS_ESCOPOS = ESCOPOS_EXPORTACAO_LGPD.map(e => e.id);
const rotuloEscopo = (id: string) => ESCOPOS_EXPORTACAO_LGPD.find(e => e.id === id)?.rotulo ?? id;
const descricaoEscopo: Record<EscopoExportacaoLgpd, string> = {
  cadastro: 'Dados cadastrais, consentimentos e registros de acesso do titular.',
  agenda: 'Agendamentos, fila, retornos e tarefas vinculadas ao titular.',
  clinico: 'Prontuários, prescrições, documentos e exames.',
  anexos: 'Arquivos anexados ao prontuário, incluídos no pacote em Base64.',
  financeiro: 'Lançamentos, pagamentos, notas fiscais e dados de convênio.',
  comunicacao: 'Conversas e mensagens de WhatsApp relacionadas ao titular.',
  auditoria: 'Eventos de auditoria associados aos registros exportados.',
};

export default function LgpdPacientes() {
  const { profile } = useSupabaseAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tela = searchParams.get('tela');
  const paginaExportacao = tela === 'exportar';
  const paginaEntrega = tela === 'entrega';
  const concluido = useRef(false);
  const scrollDaLista = useRef<number | null>(null);
  const telaAnterior = useRef(tela);
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

  useEffect(() => {
    if (telaAnterior.current === tela) return;
    const conteudo = document.getElementById('main-content');
    if (conteudo) conteudo.scrollTo(0, tela ? 0 : scrollDaLista.current ?? 0);
    if (!tela) {
      setPacienteEscopo(null);
      setPedidoConclusao(null);
      setEscopo(TODOS_ESCOPOS);
      setEvidencia('');
    }
    telaAnterior.current = tela;
  }, [tela]);

  const alternarEscopo = (id: EscopoExportacaoLgpd, marcado: boolean) => {
    setEscopo(atual => TODOS_ESCOPOS.filter(item => item === 'cadastro' || (item === id ? marcado : atual.includes(item))));
  };

  const definirTela = (proxima: 'exportar' | 'entrega') => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('tela', proxima);
      return next;
    });
  };

  const voltarParaLista = () => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    next.delete('tela');
    return next;
  });

  const descartarRascunho = () => {
    setPacienteEscopo(null);
    setPedidoConclusao(null);
    setEscopo(TODOS_ESCOPOS);
    setEvidencia('');
  };

  const abrirEscopo = (paciente: PacienteLGPD) => {
    if (!tela) scrollDaLista.current = document.getElementById('main-content')?.scrollTop ?? 0;
    concluido.current = false;
    setEscopo(TODOS_ESCOPOS);
    setPacienteEscopo(paciente);
    definirTela('exportar');
  };

  const abrirEntrega = (pedido: PedidoPendente) => {
    if (!tela) scrollDaLista.current = document.getElementById('main-content')?.scrollTop ?? 0;
    concluido.current = false;
    setEvidencia('');
    setPedidoConclusao(pedido);
    definirTela('entrega');
    void pendentes.refetch();
  };

  const escopoAlterado = JSON.stringify(escopo) !== JSON.stringify(TODOS_ESCOPOS);
  const evidenciaAlterada = evidencia.length > 0;
  const pedidoAindaPendente = Boolean(pedidoConclusao && pendentes.data?.some(pedido => pedido.id === pedidoConclusao.id));

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
      concluido.current = true;
      setPacienteEscopo(null);
      voltarParaLista();
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
    if (!pedidoConclusao || !evidenciaValida || !pedidoAindaPendente) return;
    setIsProcessing(true);
    try {
      const { protocolo } = await concluirExportacaoLgpd(pedidoConclusao.id, evidencia);
      concluido.current = true;
      toast.success(`Entrega do protocolo ${protocolo} confirmada`);
      setPedidoConclusao(null);
      setEvidencia('');
      voltarParaLista();
      void pendentes.refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível confirmar a entrega.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (paginaExportacao) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 pb-28 sm:p-6" data-testid="lgpd-export-page">
        <UnsavedChangesGuard dirty={escopoAlterado} busy={isProcessing} completed={concluido} onDiscard={descartarRascunho} />
        <PageHeader
          title="Escopo da exportação"
          description="Selecione as categorias solicitadas pelo titular. O cadastro e os consentimentos acompanham todas as exportações."
          icon={<FileJson />}
          actions={<Button variant="outline" className="min-h-11 rounded-xl" onClick={voltarParaLista}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar à lista</Button>}
        />
        {pacienteEscopo ? (
          <>
            <section aria-label="Titular da solicitação" className="border-b border-border pb-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Titular</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{pacienteEscopo.nome}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{pacienteEscopo.cpf || 'CPF não informado'}{pacienteEscopo.email ? ` · ${pacienteEscopo.email}` : ''}</p>
            </section>
            <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Confira o pedido antes de gerar</AlertTitle>
              <AlertDescription>O arquivo contém dados pessoais e pode conter informações clínicas. Armazene-o com segurança e compartilhe somente com pessoas autorizadas. Gerar o arquivo registra o protocolo; a entrega ainda precisa ser confirmada.</AlertDescription>
            </Alert>
            <fieldset className="space-y-0 divide-y divide-border rounded-xl border border-border bg-card" aria-describedby="lgpd-scope-help">
              <legend className="sr-only">Categorias de dados para exportar</legend>
              {ESCOPOS_EXPORTACAO_LGPD.map(item => (
                <div key={item.id} className="flex min-h-16 items-start gap-3 px-4 py-3">
                  <Checkbox
                    id={`escopo-${item.id}`}
                    className="mt-0.5"
                    checked={item.id === 'cadastro' || escopo.includes(item.id)}
                    disabled={item.id === 'cadastro' || isProcessing}
                    onCheckedChange={value => alternarEscopo(item.id, value === true)}
                  />
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`escopo-${item.id}`} className="cursor-pointer text-sm font-medium">{item.rotulo}</Label>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{descricaoEscopo[item.id]}</p>
                  </div>
                  {item.id === 'cadastro' && <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">Sempre incluído</Badge>}
                </div>
              ))}
            </fieldset>
            <p id="lgpd-scope-help" className="text-sm text-muted-foreground">A seleção segue o escopo da solicitação. O arquivo é preparado no navegador após os registros de auditoria serem confirmados.</p>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="outline" className="min-h-11 rounded-xl" onClick={voltarParaLista} disabled={isProcessing}>Cancelar</Button>
              <LoadingButton className="min-h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => void handleExport()} isLoading={isProcessing} loadingText="Preparando arquivo...">
                <FileJson aria-hidden="true" className="mr-2 h-4 w-4" />Gerar arquivo JSON
              </LoadingButton>
            </div>
          </>
        ) : (
          <Alert data-testid="lgpd-export-expired">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Seleção não disponível</AlertTitle>
            <AlertDescription>Por segurança, os dados do titular não são mantidos na URL nem restaurados após atualizar a página. Volte à lista e selecione a pessoa novamente.</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  if (paginaEntrega) {
    const pedidoPendenteCarregando = pendentes.isLoading || pendentes.isFetching;
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 pb-28 sm:p-6" data-testid="lgpd-delivery-page">
        <UnsavedChangesGuard dirty={evidenciaAlterada} busy={isProcessing} completed={concluido} onDiscard={descartarRascunho} />
        <PageHeader
          title="Confirmar entrega ao titular"
          description="Registre a evidência depois que o arquivo tiver sido entregue. Essa confirmação encerra o pedido e entra na trilha de auditoria."
          icon={<CheckCircle2 />}
          actions={<Button variant="outline" className="min-h-11 rounded-xl" onClick={voltarParaLista}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar à lista</Button>}
        />
        {!pedidoConclusao ? (
          <Alert data-testid="lgpd-delivery-expired">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Solicitação não selecionada</AlertTitle>
            <AlertDescription>Por segurança, a solicitação e os dados do titular não são salvos na URL. Volte à lista e abra o protocolo novamente.</AlertDescription>
          </Alert>
        ) : pedidoPendenteCarregando ? (
          <ListSkeleton items={2} />
        ) : pendentes.error ? (
          <ErrorState error={pendentes.error} onRetry={() => { void pendentes.refetch(); }} />
        ) : !pedidoAindaPendente ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Este pedido não está mais pendente</AlertTitle>
            <AlertDescription>Atualize a lista antes de continuar. A confirmação só pode ser registrada enquanto o protocolo estiver pendente.</AlertDescription>
          </Alert>
        ) : (
          <>
            <section aria-label="Resumo do pedido" className="space-y-3 border-b border-border pb-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Protocolo</p>
                <p className="mt-1 font-semibold text-foreground">{pedidoConclusao.protocolo ?? 'Sem protocolo'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Titular</p>
                <p className="mt-1 font-medium text-foreground">{pedidoConclusao.pacientes?.nome ?? 'Paciente'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Solicitado em</p>
                <p className="mt-1 text-sm text-foreground">{formatDateTimePreference(pedidoConclusao.requested_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Escopo registrado</p>
                <p className="mt-1 text-sm leading-6 text-foreground">{(pedidoConclusao.escopo ?? TODOS_ESCOPOS).map(rotuloEscopo).join(', ')}</p>
              </div>
            </section>
            <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Esta ação encerra o pedido</AlertTitle>
              <AlertDescription>Confirme somente depois de concluir a entrega. A evidência deve descrever o canal ou comprovante, sem incluir dados clínicos do titular.</AlertDescription>
            </Alert>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="evidencia-entrega">Evidência da entrega</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{evidencia.length}/1000</span>
              </div>
              <Textarea id="evidencia-entrega" value={evidencia} maxLength={1000} aria-invalid={evidencia.trim().length > 0 && !evidenciaValida} aria-describedby="evidencia-ajuda" onChange={e => setEvidencia(e.target.value)} placeholder="Ex.: arquivo entregue pessoalmente ao titular com recibo assinado." className="min-h-32 rounded-xl" />
              <p id="evidencia-ajuda" className="text-xs text-muted-foreground">Informe entre 20 e 1.000 caracteres. Não inclua dados clínicos.</p>
              {evidencia.trim().length > 0 && !evidenciaValida && <p className="text-xs text-destructive" role="alert">A evidência deve conter entre 20 e 1.000 caracteres.</p>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="outline" className="min-h-11 rounded-xl" onClick={voltarParaLista} disabled={isProcessing}>Cancelar</Button>
              <LoadingButton className="min-h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => void concluir()} disabled={!evidenciaValida || !pedidoAindaPendente} isLoading={isProcessing} loadingText="Registrando entrega...">
                Confirmar entrega
              </LoadingButton>
            </div>
          </>
        )}
      </div>
    );
  }

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

      <Alert className="rounded-2xl border-border bg-secondary">
        <AlertTriangle className="h-4 w-4 !text-primary" />
        <AlertDescription>
          Cada exportação recebe um protocolo e gera um registro de auditoria da clínica antes de preparar o arquivo JSON para download. Escolha as categorias pedidas pelo titular; o cadastro é sempre incluído. O pedido continua pendente até a clínica confirmar a entrega ao titular. Anexos do prontuário de até 30 MB no total são incluídos no JSON em Base64; arquivos externos e outros documentos vinculados por módulos específicos ainda exigem conferência manual. Armazene o arquivo em local seguro e compartilhe apenas com pessoas autorizadas.
          <span className="mt-2 block font-medium">A exclusão de dados não pode ser concluída por esta tela neste momento. Solicite análise ao suporte antes de confirmar o atendimento ao titular.</span>
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
              className="h-10 rounded-full pl-9 focus-visible:ring-primary"
            />
          </div>

          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
            {(isLoading || isDebouncing) && <ListSkeleton items={4} />}
            {!isLoading && !isDebouncing && error && (
              <ErrorState compact error={error} onRetry={() => refetch()} />
            )}
            {!isLoading && !isDebouncing && !error && !searchTerm && pacientes.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
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
                className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-[#9CC7EC] hover:bg-secondary sm:flex-row sm:items-center sm:justify-between"
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
              <Button size="sm" className="h-9 shrink-0 rounded-lg bg-primary text-xs text-primary-foreground hover:bg-primary/90" onClick={() => abrirEntrega(pedido)}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Confirmar entrega
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

    </div>
  );
}
