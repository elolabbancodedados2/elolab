import { formatWithDatePreference as format } from '@/lib/datePreference';
import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, ArrowRightLeft, FileText, Clock, CheckCircle2,
  Eye, Loader2, Stethoscope, User, Send, Edit, RefreshCw, MessageCircle, X,
} from 'lucide-react';

import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useMedicos } from '@/hooks/useSupabaseData';
import { useBuscaPacientes, usePacienteResumo } from '@/hooks/useBuscaPacientes';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { linkWhatsApp } from '@/lib/whatsapp';
import { EncaminhamentoMedico } from '@/components/clinical/EncaminhamentoMedico';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { ErrorState } from '@/components/ErrorState';
import { normalizarTexto, pacienteCorresponde } from '@/lib/buscaPaciente';
import { PageHeader } from '@/components/PageHeader';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { registrarAcessoDocumentoClinico } from '@/lib/clinicalDocumentAudit';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface EncaminhamentoData {
  id: string;
  paciente_id: string;
  prontuario_id: string | null;
  medico_origem_id: string;
  medico_destino_id: string | null;
  especialidade_destino: string;
  tipo: string | null;
  urgencia: string | null;
  motivo: string;
  hipotese_diagnostica: string | null;
  cid_principal: string | null;
  exames_realizados: string | null;
  tratamento_atual: string | null;
  informacoes_adicionais: string | null;
  status: string | null;
  data_encaminhamento: string | null;
  data_atendimento: string | null;
  contra_referencia: string | null;
  data_contra_referencia: string | null;
  created_at: string | null;
  updated_at: string | null;
  paciente?: { nome: string; nome_social?: string | null; cpf?: string | null; telefone?: string | null; email?: string | null } | null;
  medico_origem?: { nome: string | null; crm: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'border-warning/30 bg-warning/10 text-warning' },
  em_andamento: { label: 'Em Andamento', className: 'border-info/30 bg-info/10 text-info' },
  concluido: { label: 'Concluído', className: 'border-success/30 bg-success/10 text-success' },
  cancelado: { label: 'Cancelado', className: 'border-border bg-muted text-muted-foreground' },
};

const URGENCIA_CONFIG: Record<string, { label: string; className: string }> = {
  eletivo: { label: 'Eletivo', className: 'border-border bg-muted text-muted-foreground' },
  normal: { label: 'Normal', className: 'border-success/30 bg-success/10 text-success' },
  urgente: { label: 'Urgente', className: 'border-warning/30 bg-warning/10 text-warning' },
  emergencia: { label: 'Emergência', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
};

type FiltroStatus = 'todos' | 'pendente' | 'em_andamento' | 'concluido' | 'cancelado';

export default function Encaminhamentos({ creationPage = false }: { creationPage?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { referralId } = useParams();
  const [params] = useSearchParams();
  const taskPage = creationPage || !!referralId;
  const completed = useRef(false);
  const initializedRecord = useRef('');
  const updateLock = useRef(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>(() => location.state?.referralFilters?.search || '');
  const [patientSearchTerm, setPatientSearchTerm] = useState<string>(() => location.state?.referralFilters?.patientSearch || '');
  const [statusFilter, setStatusFilter] = useState<FiltroStatus>(() => location.state?.referralFilters?.status || 'todos');
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(() => params.get('paciente') || location.state?.referralFilters?.patientId || null);
  const [contraRefText, setContraRefText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const { medicoId, currentMedico, isLoading: loadingMedico, error: medicoError, refetch: refetchMedico } = useCurrentMedico();
  const referralFilters = { search: searchTerm, status: statusFilter, patientSearch: patientSearchTerm, patientId: selectedPacienteId };
  const returnTo = /^\/documentos-clinicos(?:\?|$)/.test(location.state?.returnTo || '')
    ? location.state.returnTo : '/documentos-clinicos?tab=encaminhamentos';
  const leaveTask = () => navigate(returnTo, { replace: true, state: { referralFilters } });
  const openTask = (path: string) => {
    const source = taskPage ? returnTo : `${location.pathname}${location.search}`;
    if (!taskPage) navigate(source, { replace: true, state: { referralFilters } });
    navigate(path, { state: { returnTo: source, referralFilters } });
  };
  const recordKey = ['encaminhamento-pagina', profile?.clinica_id, user?.id, referralId, location.key];
  const recordQuery = useQuery({
    queryKey: recordKey,
    enabled: !!referralId && !!profile?.clinica_id && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('encaminhamentos')
        .select('*, paciente:pacientes(nome,nome_social,cpf,telefone,email), medico_origem:medicos!encaminhamentos_medico_origem_id_fkey(nome, crm)')
        .eq('id', referralId!).eq('clinica_id', profile!.clinica_id!).maybeSingle();
      if (error) throw error;
      if (data) await registrarAcessoDocumentoClinico('encaminhamento', data.id, 'visualizacao');
      return data as EncaminhamentoData | null;
    },
    retry: false, staleTime: Infinity, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const selectedEnc = recordQuery.data;
  const setSelectedEnc = (record: EncaminhamentoData) => queryClient.setQueryData(recordKey, record);
  useEffect(() => {
    if (selectedEnc && initializedRecord.current !== selectedEnc.id) {
      initializedRecord.current = selectedEnc.id;
      setContraRefText(selectedEnc.contra_referencia || '');
    }
  }, [selectedEnc]);
  const medicosQuery = useMedicos();
  const pacientesBuscaQuery = useBuscaPacientes(patientSearchTerm, { limite: 50 });
  const pacientesBusca = pacientesBuscaQuery.data?.pacientes ?? [];
  const pacienteSelecionadoQuery = usePacienteResumo(selectedPacienteId);
  const medicos = medicosQuery.data || [];

  const encaminhamentosQuery = useQuery({
    queryKey: ['encaminhamentos', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('encaminhamentos')
        .select(`*, paciente:pacientes(nome,nome_social,cpf,telefone,email), medico_origem:medicos!encaminhamentos_medico_origem_id_fkey(nome, crm)`)
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as EncaminhamentoData[];
    },
    enabled: !taskPage && !!user && !!profile?.clinica_id,
  });
  const encaminhamentos = encaminhamentosQuery.data || [];
  const podeAtualizarEncaminhamento = (enc: EncaminhamentoData) => Boolean(
    profile?.roles?.includes('admin')
    || (medicoId && (enc.medico_origem_id === medicoId || enc.medico_destino_id === medicoId))
  );

  const statusHistoryQuery = useQuery({
    queryKey: ['encaminhamento-status-history', profile?.clinica_id ?? null, selectedEnc?.id ?? null],
    enabled: !!referralId && !!selectedEnc?.id && !!profile?.clinica_id,
    queryFn: async () => {
      if (!selectedEnc?.id || !profile?.clinica_id) return [];
      const { data, error } = await (supabase as any)
        .from('encaminhamento_status_history')
        .select('id,status_anterior,status_novo,usuario_id,usuario_nome,comentario,data_mudanca')
        .eq('encaminhamento_id', selectedEnc.id)
        .order('data_mudanca', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, any>>;
    },
  });

  const isLoading = (!taskPage && encaminhamentosQuery.isLoading) || medicosQuery.isLoading || loadingMedico;

  const getPacienteNome = (id: string) => {
    const paciente = encaminhamentos.find(enc => enc.paciente_id === id)?.paciente
      ?? pacientesBusca.find(p => p.id === id);
    return (paciente as any)?.nome_social || paciente?.nome || '—';
  };
  const getMedicoNome = (id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `${nomeMedico(m.nome || m.crm)}` : '—';
  };

  const filteredEncaminhamentos = useMemo(() => {
    return encaminhamentos.filter(enc => {
      const paciente = enc.paciente;
      const termo = normalizarTexto(searchTerm);
      const matchesSearch = !termo ||
        (!!paciente && pacienteCorresponde(paciente, searchTerm)) ||
        normalizarTexto(enc.especialidade_destino || '').includes(termo) ||
        normalizarTexto(enc.motivo || '').includes(termo);
      const matchesStatus = statusFilter === 'todos' || enc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [encaminhamentos, searchTerm, statusFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: encaminhamentos.length,
    pendentes: encaminhamentos.filter(e => e.status === 'pendente').length,
    emAndamento: encaminhamentos.filter(e => e.status === 'em_andamento').length,
    concluidos: encaminhamentos.filter(e => e.status === 'concluido').length,
    comContraRef: encaminhamentos.filter(e => !!e.contra_referencia).length,
  }), [encaminhamentos]);

  const temFiltro = !!searchTerm || statusFilter !== 'todos';
  const limparFiltros = () => {
    setSearchTerm('');
    setStatusFilter('todos');
  };

  const mensagemWhatsApp = (enc: EncaminhamentoData) => {
    const nome = String(enc.paciente?.nome_social || enc.paciente?.nome || '').split(' ')[0];
    const esp = enc.especialidade_destino || '';
    return `Olá${nome ? `, ${nome}` : ''}! Sobre seu encaminhamento${esp ? ` para ${esp}` : ''}: entre em contato com a clínica para agendar o atendimento com o especialista.`;
  };

  // Pacientes with encaminhamentos for sidebar
  const pacientesComEnc = useMemo(() => {
    const countMap = new Map<string, number>();
    encaminhamentos.forEach(e => countMap.set(e.paciente_id, (countMap.get(e.paciente_id) || 0) + 1));
    return [...pacientesBusca].sort((a, b) => {
        const ca = countMap.get(a.id) || 0;
        const cb = countMap.get(b.id) || 0;
        return cb - ca;
      });
  }, [pacientesBusca, encaminhamentos]);

  const selectedPaciente = selectedPacienteId
    ? pacienteSelecionadoQuery.data ?? pacientesBusca.find(p => p.id === selectedPacienteId) ?? null
    : null;
  const pacienteEncaminhamentos = selectedPacienteId
    ? encaminhamentos.filter(e => e.paciente_id === selectedPacienteId)
    : [];

  const handleView = (enc: EncaminhamentoData) => openTask(`/encaminhamentos/${enc.id}`);

  const handleUpdateEncStatus = async (id: string, newStatus: string) => {
    if (updateLock.current) return;
    if (!profile?.clinica_id) return toast.error('Clínica não identificada.');
    const current = selectedEnc?.id === id ? selectedEnc : encaminhamentos.find(enc => enc.id === id);
    if (current && !podeAtualizarEncaminhamento(current)) {
      return toast.error('Somente os médicos envolvidos ou a administração podem atualizar este encaminhamento.');
    }
    const expectedStatuses = newStatus === 'em_andamento' ? ['pendente'] : ['pendente', 'em_andamento'];
    if (!current || !expectedStatuses.includes(current.status || '')) {
      return toast.error('O encaminhamento mudou de estado. Atualize a lista e tente novamente.');
    }
    updateLock.current = true;
    setIsUpdating(true);
    try {
      const updateData: Record<string, any> = { status: newStatus };
      if (newStatus === 'em_andamento') updateData.data_atendimento = todaySaoPauloDateOnly();
      const { data, error } = await (supabase as any).from('encaminhamentos').update(updateData)
        .eq('id', id).eq('clinica_id', profile.clinica_id).in('status', expectedStatuses).select('id, updated_at').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O encaminhamento foi alterado em outra sessão. Atualize a lista antes de tentar novamente.');
      queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] });
      void queryClient.invalidateQueries({ queryKey: ['encaminhamento-status-history', profile.clinica_id, id] });
      if (selectedEnc?.id === id) setSelectedEnc({ ...selectedEnc, ...updateData, updated_at: data.updated_at });
      if (newStatus === 'cancelado') setContraRefText('');
      toast.success(`Status atualizado para "${STATUS_CONFIG[newStatus]?.label || newStatus}"`);
    } catch (e) { toast.error('Erro ao atualizar status', { description: mensagemDeErro(e) }); }
    finally { updateLock.current = false; setIsUpdating(false); }
  };

  const handleSaveContraRef = async () => {
    if (updateLock.current) return;
    if (!selectedEnc || !contraRefText.trim()) return;
    if (!podeAtualizarEncaminhamento(selectedEnc)) return toast.error('Você não pode atualizar este encaminhamento.');
    if (!profile?.clinica_id) return toast.error('Clínica não identificada.');
    if (selectedEnc.status === 'concluido' || selectedEnc.status === 'cancelado') return toast.error('Este encaminhamento não aceita nova contra-referência.');
    if (!selectedEnc.updated_at) return toast.error('Não foi possível confirmar a versão deste encaminhamento. Atualize a lista e abra o registro novamente.');
    if (contraRefText.trim().length > 10000) return toast.error('A contra-referência deve ter no máximo 10.000 caracteres.');
    updateLock.current = true;
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.from('encaminhamentos').update({
        contra_referencia: contraRefText,
        data_contra_referencia: todaySaoPauloDateOnly(),
        status: 'concluido',
        data_atendimento: selectedEnc.data_atendimento || todaySaoPauloDateOnly(),
      }).eq('id', selectedEnc.id).eq('clinica_id', profile.clinica_id)
        .eq('updated_at', selectedEnc.updated_at)
        .in('status', ['pendente', 'em_andamento']).select('id, updated_at').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O encaminhamento foi alterado em outra sessão. Seu texto continua nesta tela; atualize o registro e confira o histórico antes de salvar novamente.');
      queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] });
      void queryClient.invalidateQueries({ queryKey: ['encaminhamento-status-history', profile.clinica_id, selectedEnc.id] });
      setSelectedEnc({ ...selectedEnc, contra_referencia: contraRefText, data_contra_referencia: todaySaoPauloDateOnly(), data_atendimento: selectedEnc.data_atendimento || todaySaoPauloDateOnly(), status: 'concluido', updated_at: data.updated_at });
      toast.success('Contra-referência registrada! Encaminhamento concluído.');
    } catch (e) { toast.error('Erro ao salvar contra-referência', { description: mensagemDeErro(e) }); }
    finally { updateLock.current = false; setIsUpdating(false); }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const referralQueries = taskPage ? [medicosQuery] : [encaminhamentosQuery, medicosQuery];
  const failedReferralQuery = referralQueries.find(query => query.isError);
  if (failedReferralQuery) {
    return <ErrorState title="Não foi possível carregar encaminhamentos" error={failedReferralQuery.error} onRetry={() => { for (const query of referralQueries) void query.refetch(); }} />;
  }

  if (medicoError) return <ErrorState title="Não foi possível conferir seu vínculo médico" error={medicoError} onRetry={() => void refetchMedico()} />;
  if (referralId && recordQuery.isError && !selectedEnc) return <div className="space-y-4"><Button variant="outline" onClick={leaveTask}>Voltar aos encaminhamentos</Button><ErrorState title="Não foi possível abrir o encaminhamento" error={recordQuery.error} onRetry={() => void recordQuery.refetch()} /></div>;
  if (referralId && recordQuery.isLoading) return <div role="status" className="py-8">Conferindo acesso ao encaminhamento…</div>;
  if (referralId && !selectedEnc) return <div className="space-y-4"><h1 className="text-2xl font-semibold">Encaminhamento indisponível</h1><p>O registro não foi encontrado ou não está disponível para seu perfil nesta clínica.</p><Button variant="outline" onClick={leaveTask}>Voltar aos encaminhamentos</Button></div>;
  if (creationPage) return <section className="mx-auto max-w-4xl space-y-6">
    <Button variant="ghost" onClick={leaveTask}>← Voltar aos encaminhamentos</Button>
    <header className="space-y-2 border-b pb-5"><h1 className="text-2xl font-semibold tracking-tight">Novo Encaminhamento</h1><p className="text-sm text-muted-foreground">Identifique o paciente e informe o contexto necessário para o especialista dar continuidade ao cuidado.</p></header>
    {!medicoId || currentMedico?.ativo === false ? <div className="space-y-3"><p role="alert">É necessário um médico de origem ativo vinculado ao seu usuário para criar encaminhamentos.</p><Button asChild variant="outline"><Link to="/equipe">Consultar equipe</Link></Button></div>
      : !selectedPacienteId ? <div className="space-y-2"><label htmlFor="encaminhamento-paciente">Paciente</label><PacienteCombobox id="encaminhamento-paciente" value="" onChange={id => setSelectedPacienteId(id)} /></div>
      : pacienteSelecionadoQuery.isError ? <ErrorState title="Não foi possível carregar o paciente" error={pacienteSelecionadoQuery.error} onRetry={() => void pacienteSelecionadoQuery.refetch()} />
      : pacienteSelecionadoQuery.isLoading ? <p role="status">Carregando paciente…</p>
      : !selectedPaciente ? <p role="alert">Paciente indisponível. Volte ao histórico para selecionar outra ficha.</p>
      : <><dl className="grid gap-4 border-b pb-5 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Paciente</dt><dd className="font-medium">{selectedPaciente.nome_social || selectedPaciente.nome}</dd></div><div><dt className="text-xs text-muted-foreground">Médico de origem</dt><dd className="font-medium">{getMedicoNome(medicoId)}</dd></div></dl>
        <EncaminhamentoMedico creationPage pacienteId={selectedPaciente.id} pacienteNome={selectedPaciente.nome_social || selectedPaciente.nome} medicoOrigemId={medicoId} encaminhamentos={[]} onNew={() => {}} onView={() => {}} onBack={leaveTask} onEncaminhamentoCriado={() => { void queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] }); leaveTask(); }} />
      </>}
  </section>;

  return (
    <div className="space-y-6">
      {!taskPage && <>
      <PageHeader
        title="Encaminhamentos"
        description={stats.total > 0
          ? `${stats.total} encaminhamento${stats.total === 1 ? '' : 's'} · ${stats.pendentes} pendente${stats.pendentes === 1 ? '' : 's'}${stats.emAndamento > 0 ? ` · ${stats.emAndamento} em andamento` : ''} · ${stats.concluidos} concluído${stats.concluidos === 1 ? '' : 's'}`
          : 'Referências e contra-referências médicas'}
        icon={<ArrowRightLeft />}
        actions={(
          <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void encaminhamentosQuery.refetch()} aria-label="Atualizar encaminhamentos" title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      />

      {/* Indicadores (filtram a lista por status) */}
      <section role="group" aria-label="Resumo dos encaminhamentos" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {([
          { key: 'pendente', icon: Clock, label: 'Pendentes', value: stats.pendentes, caption: 'aguardando início', color: 'text-white', surface: 'bg-white/15', escuro: true },
          { key: 'em_andamento', icon: Stethoscope, label: 'Em andamento', value: stats.emAndamento, caption: 'em atendimento', color: 'text-info', surface: 'bg-info/10', escuro: false },
          { key: 'concluido', icon: CheckCircle2, label: 'Concluídos', value: stats.concluidos, caption: `${stats.comContraRef} com contra-ref.`, color: 'text-success', surface: 'bg-success/10', escuro: false },
          { key: 'todos', icon: ArrowRightLeft, label: 'Total', value: stats.total, caption: 'todos os status', color: 'text-foreground', surface: 'bg-muted', escuro: false },
        ] as const).map(s => {
          const Icon = s.icon;
          const ativo = statusFilter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => setStatusFilter(ativo && s.key !== 'todos' ? 'todos' : s.key)}
              className={cn(
                'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                s.escuro && 'border-transparent bg-gradient-primary text-white',
                ativo && !s.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                ativo && s.escuro && 'ring-2 ring-[#1080CA]/60',
              )}
            >
              <div className="flex min-h-[96px] items-center gap-3 p-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.surface)}>
                  <Icon aria-hidden="true" className={cn('h-5 w-5', s.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className={cn('truncate text-xs font-semibold', s.escuro ? 'text-white/80' : 'text-foreground')}>{s.label}</h3>
                    <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</span>
                  </div>
                  <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Main Content */}
      <div className={cn('grid gap-6', medicoId ? 'lg:grid-cols-3' : 'grid-cols-1')}>
        {/* Patient List */}
        {medicoId && (
        <Card className="rounded-2xl border-border/60 shadow-xs lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-4 w-4 text-[#1080CA]" />
              Pacientes
            </CardTitle>
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Buscar paciente por nome, CPF ou telefone"
                placeholder="Buscar por nome, CPF ou telefone..."
                value={patientSearchTerm}
                onChange={(e) => setPatientSearchTerm(e.target.value)}
                className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {pacientesBuscaQuery.isError ? (
                <div className="p-4">
                  <ErrorState compact title="Não foi possível buscar pacientes" error={pacientesBuscaQuery.error} onRetry={() => void pacientesBuscaQuery.refetch()} />
                </div>
              ) : pacientesBuscaQuery.isFetching || pacientesBuscaQuery.isDebouncing ? (
                <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">Buscando pacientes…</p>
              ) : pacientesComEnc.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <p>{patientSearchTerm ? 'Nenhum paciente corresponde à busca.' : 'Nenhum paciente cadastrado.'}</p>
                  {patientSearchTerm && <Button variant="link" onClick={() => setPatientSearchTerm('')}>Limpar busca</Button>}
                </div>
              ) : pacientesComEnc.map((paciente) => {
                const qtd = encaminhamentos.filter(e => e.paciente_id === paciente.id).length;
                return (
                  <div
                    key={paciente.id}
                    className={cn(
                      'p-3 border-b cursor-pointer hover:bg-[#F3F8FC]/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1080CA]',
                      selectedPacienteId === paciente.id && 'bg-[#1080CA]/10 border-l-2 border-l-[#1080CA]',
                    )}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedPacienteId === paciente.id}
                    onClick={() => setSelectedPacienteId(paciente.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedPacienteId(paciente.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">{(paciente as any).nome_social || paciente.nome}</p>
                      {qtd > 0 && (
                        <Badge variant="secondary" className="rounded-full text-[10px] tabular-nums">{qtd}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </ScrollArea>
            {!pacientesBuscaQuery.isError && !pacientesBuscaQuery.isFetching && pacientesBuscaQuery.data?.incompleta && (
              <p role="status" className="border-t px-4 py-2 text-xs text-muted-foreground">
                {patientSearchTerm.trim()
                  ? 'Há mais pacientes com esse resultado. Refine a busca para localizar o próximo.'
                  : 'Mostrando os 50 pacientes mais recentes. Pesquise para localizar outros.'}
              </p>
            )}
          </CardContent>
        </Card>
        )}

        {/* Referral Panel */}
        <div className={cn(medicoId ? 'lg:col-span-2' : 'mx-auto w-full max-w-3xl')}>
          {selectedPacienteId && pacienteSelecionadoQuery.isError ? (
            <ErrorState
              title="Não foi possível carregar o paciente selecionado"
              description="Atualize os dados antes de criar ou consultar encaminhamentos para evitar usar uma ficha incorreta."
              error={pacienteSelecionadoQuery.error}
              onRetry={() => void pacienteSelecionadoQuery.refetch()}
            />
          ) : selectedPacienteId && pacienteSelecionadoQuery.isFetching && !selectedPaciente ? (
            <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="py-16 text-center text-sm text-muted-foreground">Carregando a ficha do paciente…</CardContent></Card>
          ) : selectedPaciente && medicoId ? (
            <EncaminhamentoMedico
              onNew={() => openTask(`/documentos-clinicos/novo-encaminhamento?paciente=${selectedPaciente.id}`)}
              onView={id => openTask(`/encaminhamentos/${id}`)}
              onBack={leaveTask}
              pacienteId={selectedPaciente.id}
              pacienteNome={(selectedPaciente as any).nome_social || selectedPaciente.nome}
              medicoOrigemId={medicoId}
              encaminhamentos={pacienteEncaminhamentos}
              onEncaminhamentoCriado={() => queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] })}
            />
          ) : (
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardContent className={cn('text-center', medicoId ? 'py-16' : 'py-8')}>
                <div className="text-center text-muted-foreground">
                  <ArrowRightLeft aria-hidden="true" className="mx-auto mb-3 h-10 w-10 text-[#1080CA] opacity-40" />
                  <p className="font-medium">
                    {!medicoId
                      ? 'Seu usuário não está vinculado a um cadastro médico ativo. Um médico identificado precisa constar como origem do encaminhamento.'
                      : 'Selecione um paciente para gerenciar encaminhamentos'}
                  </p>
                  {!medicoId && profile?.roles?.includes('admin') && (
                    <Button asChild variant="outline" size="sm" className="mt-4 rounded-full">
                      <Link to="/equipe">Gerenciar corpo clínico</Link>
                    </Button>
                  )}
                  {!medicoId && !profile?.roles?.includes('admin') && (
                    <p className="mt-2 text-sm">Peça ao administrador para revisar seu vínculo com o cadastro médico da clínica.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* All Referrals Table */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Todos os Encaminhamentos <span className="text-muted-foreground">({filteredEncaminhamentos.length})</span></CardTitle>
              <div className="relative w-full sm:w-80">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar encaminhamentos por paciente, CPF, especialidade ou motivo"
                  placeholder="Paciente, CPF, especialidade ou motivo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Filtrar por status" className="flex flex-wrap items-center gap-1.5">
                {([
                  { key: 'todos', label: 'Todos' },
                  { key: 'pendente', label: 'Pendente' },
                  { key: 'em_andamento', label: 'Em andamento' },
                  { key: 'concluido', label: 'Concluído' },
                  { key: 'cancelado', label: 'Cancelado' },
                ] as const).map(opt => {
                  const ativo = statusFilter === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => setStatusFilter(opt.key)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                        ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {temFiltro && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltros}>
                    <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                  </Button>
                )}
              </div>
              <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{filteredEncaminhamentos.length} de {encaminhamentos.length}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead className="hidden md:table-cell">Médico Origem</TableHead>
                  <TableHead className="hidden md:table-cell">Urgência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Contra-ref.</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEncaminhamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                        <ArrowRightLeft className="h-7 w-7" />
                      </span>
                      <p className="font-semibold text-foreground">{encaminhamentos.length === 0 ? 'Nenhum encaminhamento registrado' : 'Nenhum resultado para esses filtros'}</p>
                      <p className="mt-1 text-sm">{encaminhamentos.length === 0 ? 'Selecione um paciente para criar o primeiro encaminhamento' : 'Nenhum encaminhamento corresponde à busca e ao status selecionado'}</p>
                      {temFiltro && (
                        <Button size="sm" variant="outline" className="mt-4 rounded-full" onClick={limparFiltros}>
                          Limpar filtros
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEncaminhamentos.map((enc) => {
                    const statusCfg = STATUS_CONFIG[enc.status || 'pendente'] || STATUS_CONFIG.pendente;
                    const urgCfg = URGENCIA_CONFIG[enc.urgencia || 'normal'] || URGENCIA_CONFIG.normal;
                    const nomePaciente = enc.paciente?.nome_social || enc.paciente?.nome || getPacienteNome(enc.paciente_id);
                    const whatsapp = linkWhatsApp(enc.paciente?.telefone, mensagemWhatsApp(enc));
                    const podeAtualizar = podeAtualizarEncaminhamento(enc);
                    return (
                      <TableRow key={enc.id} className="transition-colors hover:bg-[#F3F8FC]/70">
                        <TableCell className="tabular-nums text-sm">
                          {enc.data_encaminhamento
                            ? format(parseDateOnly(enc.data_encaminhamento)!, 'dd/MM/yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell className="font-medium">{nomePaciente}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{enc.especialidade_destino}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {enc.medico_origem?.nome ? `${nomeMedico(enc.medico_origem.nome)}` : getMedicoNome(enc.medico_origem_id)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className={cn('rounded-full', urgCfg.className)}>{urgCfg.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('rounded-full', statusCfg.className)}>{statusCfg.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {enc.contra_referencia ? (
                            <Badge variant="outline" className="rounded-full border-success/30 bg-success/10 text-success">Sim</Badge>
                          ) : (
                            <Badge variant="outline" className="rounded-full text-muted-foreground">Não</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {whatsapp && (
                              <Button aria-label={`Avisar ${nomePaciente} pelo WhatsApp`} asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Avisar ${nomePaciente} pelo WhatsApp`} title="Avisar pelo WhatsApp">
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <Button variant="outline" className="h-9 gap-1.5 rounded-full text-xs" onClick={() => handleView(enc)} aria-label={`Ver encaminhamento de ${nomePaciente}`} disabled={isUpdating}>
                              <Eye className="h-4 w-4" />Ver
                            </Button>
                            {enc.status === 'pendente' && podeAtualizar && (
                              <Button className="h-9 gap-1.5 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110" onClick={() => handleUpdateEncStatus(enc.id, 'em_andamento')} disabled={isUpdating} aria-label={`Iniciar encaminhamento de ${nomePaciente}`}>
                                Iniciar
                              </Button>
                            )}
                            {enc.status === 'em_andamento' && podeAtualizar && (
                              <Button className="h-9 gap-1.5 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" onClick={() => { handleView(enc); }} disabled={isUpdating} aria-label={`Registrar contra-referência de ${nomePaciente}`}>
                                <Edit className="h-3.5 w-3.5" />Contra-ref.
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      </>}
      {referralId && <section className="mx-auto max-w-4xl space-y-6">
        <UnsavedChangesGuard dirty={contraRefText !== (selectedEnc?.contra_referencia || '')} busy={isUpdating} completed={completed} />
        <Button variant="ghost" onClick={leaveTask}>← Voltar aos encaminhamentos</Button>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-5"><h1 className="text-2xl font-semibold tracking-tight">Detalhes do Encaminhamento</h1><Button variant="outline" disabled={isUpdating || recordQuery.isFetching} onClick={() => void recordQuery.refetch()}>Atualizar registro</Button></header>
          {recordQuery.isError && <ErrorState compact title="Não foi possível atualizar o registro" error={recordQuery.error} onRetry={() => void recordQuery.refetch()} />}
          {selectedEnc && (
            <div className="space-y-5 break-words text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Paciente</p>
                  <p className="font-medium">{selectedEnc.paciente?.nome_social || selectedEnc.paciente?.nome || getPacienteNome(selectedEnc.paciente_id)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Especialidade</p>
                  <p className="font-medium">{selectedEnc.especialidade_destino}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Data</p>
                  <p>{selectedEnc.data_encaminhamento ? format(parseDateOnly(selectedEnc.data_encaminhamento)!, 'dd/MM/yyyy') : '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Urgência</p>
                  <Badge variant="outline" className={cn('rounded-full', URGENCIA_CONFIG[selectedEnc.urgencia || 'normal']?.className)}>
                    {URGENCIA_CONFIG[selectedEnc.urgencia || 'normal']?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge variant="outline" className={cn('rounded-full', STATUS_CONFIG[selectedEnc.status || 'pendente']?.className)}>
                    {STATUS_CONFIG[selectedEnc.status || 'pendente']?.label}
                  </Badge>
                </div>
                {selectedEnc.cid_principal && (
                  <div>
                    <p className="text-muted-foreground text-xs">CID Principal</p>
                    <p>{selectedEnc.cid_principal}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Motivo</p>
                <p className="whitespace-pre-wrap border-l-2 border-border py-2 pl-4">{selectedEnc.motivo}</p>
              </div>
              {selectedEnc.hipotese_diagnostica && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Hipótese Diagnóstica</p>
                  <p className="whitespace-pre-wrap border-l-2 border-border py-2 pl-4">{selectedEnc.hipotese_diagnostica}</p>
                </div>
              )}
              {selectedEnc.tratamento_atual && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Tratamento Atual</p>
                  <p className="whitespace-pre-wrap border-l-2 border-border py-2 pl-4">{selectedEnc.tratamento_atual}</p>
                </div>
              )}

              {selectedEnc.exames_realizados && <div><p className="text-xs text-muted-foreground">Exames Realizados</p><p className="whitespace-pre-wrap border-l-2 py-2 pl-4">{selectedEnc.exames_realizados}</p></div>}
              {selectedEnc.informacoes_adicionais && <div><p className="text-xs text-muted-foreground">Informações Adicionais</p><p className="whitespace-pre-wrap border-l-2 py-2 pl-4">{selectedEnc.informacoes_adicionais}</p></div>}
              <Separator />

              <section className="space-y-2" aria-label="Histórico de status">
                <p className="text-xs font-semibold text-muted-foreground">Histórico do encaminhamento</p>
                {statusHistoryQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando histórico…</p>
                ) : statusHistoryQuery.isError ? (
                  <ErrorState compact title="Não foi possível carregar o histórico" error={statusHistoryQuery.error} onRetry={() => void statusHistoryQuery.refetch()} />
                ) : statusHistoryQuery.data?.length ? (
                  <ol className="space-y-2 border-l pl-3">
                    {statusHistoryQuery.data.map((evento: Record<string, any>) => {
                      const anterior = evento.status_anterior
                        ? STATUS_CONFIG[evento.status_anterior]?.label || evento.status_anterior
                        : null;
                      const novo = STATUS_CONFIG[evento.status_novo]?.label || evento.status_novo;
                      return (
                        <li key={evento.id} className="relative text-xs">
                          <p className="font-medium">{anterior ? `${anterior} → ${novo}` : novo}</p>
                          {evento.comentario && <p className="text-muted-foreground">{evento.comentario}</p>}
                          <p className="text-muted-foreground">
                            {evento.usuario_nome || 'Usuário da clínica'} · {format(new Date(evento.data_mudanca), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-xs text-muted-foreground">Ainda não há alterações de status registradas.</p>
                )}
              </section>

              <Separator />

              {/* Contra-referência section */}
              {(selectedEnc.status === 'concluido' || selectedEnc.status === 'cancelado') && contraRefText && contraRefText !== (selectedEnc.contra_referencia || '') && <div className="space-y-2 border-l-2 border-warning pl-4"><p role="alert">O registro foi encerrado em outra sessão. Seu texto não foi salvo; copie-o antes de sair, se necessário.</p><label htmlFor="retorno-preservado">Texto não salvo</label><Textarea id="retorno-preservado" readOnly value={contraRefText} rows={6} /></div>}
              {selectedEnc.contra_referencia ? (
                <div>
                  <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-success" /> Contra-referência
                    {selectedEnc.data_contra_referencia && (
                      <span className="ml-auto text-[10px]">{format(parseDateOnly(selectedEnc.data_contra_referencia)!, 'dd/MM/yyyy')}</span>
                    )}
                  </p>
                  <p className="bg-success/5 border border-success/20 rounded-lg p-3">{selectedEnc.contra_referencia}</p>
                </div>
              ) : selectedEnc.status !== 'cancelado' && selectedEnc.status !== 'concluido' && podeAtualizarEncaminhamento(selectedEnc) ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium flex items-center gap-1">
                    <Send className="h-3 w-3" /> Registrar Contra-referência
                  </p>
                  <label htmlFor="contra-referencia-text" className="sr-only">Texto da contra-referência</label>
                  <Textarea
                    id="contra-referencia-text"
                    placeholder="Informe o retorno do especialista, condutas sugeridas, diagnóstico final..."
                    value={contraRefText}
                    onChange={e => setContraRefText(e.target.value)}
                    rows={6}
                    maxLength={10000}
                    disabled={isUpdating}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveContraRef}
                    disabled={!contraRefText.trim() || isUpdating}
                    className="gap-1.5 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110"
                  >
                    {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Salvar e Concluir
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {/* Status actions in footer */}
          {selectedEnc && selectedEnc.status !== 'concluido' && selectedEnc.status !== 'cancelado' && podeAtualizarEncaminhamento(selectedEnc) && (
            <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
              {selectedEnc.status === 'pendente' && (
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleUpdateEncStatus(selectedEnc.id, 'em_andamento')} disabled={isUpdating}>
                  Marcar Em Andamento
                </Button>
              )}
              <Button variant="ghost" size="sm" className="rounded-full text-destructive" onClick={() => setConfirmCancel(true)} disabled={isUpdating}>
                Cancelar Encaminhamento
              </Button>
            </div>
          )}
        <Button variant="outline" onClick={leaveTask}>Voltar aos encaminhamentos</Button>
        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancelar encaminhamento?</AlertDialogTitle><AlertDialogDescription>O encaminhamento será encerrado como cancelado. Uma contra-referência ainda não salva será descartada. O histórico será preservado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Manter encaminhamento</AlertDialogCancel><AlertDialogAction onClick={() => selectedEnc && void handleUpdateEncStatus(selectedEnc.id, 'cancelado')}>Confirmar cancelamento</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </section>}
    </div>
  );
}
