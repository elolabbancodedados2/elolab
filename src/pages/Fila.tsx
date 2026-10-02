import { Switch } from '@/components/ui/switch';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { nomeMedico } from '@/lib/formatters';
import { formatCurrency } from '@/lib/formatters';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Play, Check, Loader2, Clock, ArrowUp, ArrowDown,
  Users, CheckCircle2, Bell, XCircle, Stethoscope, AlertTriangle,
  RefreshCw, Timer, LockOpen,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FinalizarAtendimentoDialog } from '@/components/fila/FinalizarAtendimentoDialog';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { checkinComCobranca } from '@/lib/checkinWithBilling';
import { autoFinalizarAtendimento } from '@/lib/workflowAutomation';
import { atomicStartAppointment as autoIniciarAtendimento } from '@/lib/operationalTransitions';
import { useFilaAtendimento, useAgendamentos, usePacientes, useMedicos, useSalas } from '@/hooks/useSupabaseData';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { podeAtender, saldoDevedor } from '@/lib/liberacaoAtendimento';
import { passouPelaTriagem } from '@/lib/liberacaoTriagem';
import { ordenarFilaPorPrioridade } from '@/lib/filaPrioridade';
import { podeIniciarAgendamento, separarFilaAtivaPorData } from '@/lib/filaPorData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ListSkeleton } from '@/components/ui/loading-skeleton';
import { canalUnico } from '@/lib/realtimeCanal';

// ─── Helpers ───────────────────────────────────────────────
function calcularEspera(horarioChegada: string | null): string {
  if (!horarioChegada) return '—';
  const mins = Math.floor((Date.now() - new Date(horarioChegada).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

function corEspera(horarioChegada: string | null): string {
  if (!horarioChegada) return 'text-muted-foreground';
  const mins = Math.floor((Date.now() - new Date(horarioChegada).getTime()) / 60000);
  if (mins < 15) return 'text-success';
  if (mins < 30) return 'text-warning';
  return 'text-destructive font-semibold';
}

const STATUS_CONFIG = {
  aguardando: { label: 'Aguardando', color: 'bg-warning/10 text-warning border-warning/20' },
  em_atendimento: { label: 'Em Atendimento', color: 'bg-primary/10 text-primary border-primary/20' },
  finalizado: { label: 'Finalizado', color: 'bg-success/10 text-success border-success/20' },
  chamado: { label: 'Chamado', color: 'bg-info/10 text-info border-info/20' },
};

const PRIORIDADE_CONFIG = {
  normal: { label: 'Normal', dot: 'bg-muted-foreground' },
  preferencial: { label: 'Preferencial', dot: 'bg-warning' },
  urgente: { label: 'Urgente', dot: 'bg-destructive animate-pulse' },
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const cardAnim = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
};

// ─── Queue Card ────────────────────────────────────────────
function FilaCard({ item, pos, pacienteNome, medicoNome, salaNome, canRemove, onIniciar, onFinalizar, onChamar, onRemover, onAbrirProntuario, now }: {
  item: any; pos: number; pacienteNome: string; medicoNome: string; salaNome: string;
  canRemove: boolean;
  onIniciar: () => void; onFinalizar: () => void; onChamar: () => void; onRemover: () => void;
  /** Volta ao prontuário de quem já está em atendimento (aba fechada, recarga). */
  onAbrirProntuario?: () => void;
  now: number;
}) {
  const status = item.status as keyof typeof STATUS_CONFIG;
  const prioridade = (item.prioridade || 'normal') as keyof typeof PRIORIDADE_CONFIG;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.aguardando;
  const prioCfg = PRIORIDADE_CONFIG[prioridade] ?? PRIORIDADE_CONFIG.normal;

  return (
    <motion.div variants={cardAnim} layout>
      <div className={cn(
        'rounded-2xl border bg-card transition-all duration-200',
        status === 'em_atendimento' && 'border-primary/40 shadow-lg shadow-primary/10 ring-1 ring-primary/20',
        status === 'finalizado' && 'opacity-60',
      )}>
        <div className="flex items-center gap-4 p-4">
          {/* Position badge */}
          <div className={cn(
            'h-12 w-12 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold',
            status === 'em_atendimento' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}>
            {pos}
          </div>

          {/* Patient info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-base truncate">{pacienteNome}</p>
              {prioridade !== 'normal' && (
                <div className="flex items-center gap-1">
                  <span className={cn('h-2 w-2 rounded-full', prioCfg.dot)} />
                  <span className="text-[11px] text-muted-foreground">{prioCfg.label}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Stethoscope className="h-3.5 w-3.5" />
                {medicoNome}
              </span>
              {salaNome !== '-' && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{salaNome}</span>
              )}
            </div>
          </div>

          {/* Timer */}
          <div className="text-right shrink-0 mr-2">
            <p className={cn('text-sm font-medium tabular-nums', corEspera(item.horario_chegada))}>
              <Timer className="h-3.5 w-3.5 inline mr-1" />
              {calcularEspera(item.horario_chegada)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {item.horario_chegada ? format(new Date(item.horario_chegada), 'HH:mm', { locale: ptBR }) : '—'}
            </p>
          </div>

          {/* Status badge */}
          <Badge className={cn('text-xs shrink-0 border', cfg.color)}>{cfg.label}</Badge>
        </div>

        {/* Actions */}
        {status !== 'finalizado' && (
          <div className="flex items-center gap-2 px-4 pb-3 pt-1 border-t border-border/50">
            {status === 'aguardando' && (
              <>
                <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={onChamar}>
                  <Bell className="h-3.5 w-3.5" /> Chamar
                </Button>
                <Button size="sm" variant="default" className="gap-1.5 h-7 text-xs bg-primary" onClick={onIniciar}>
                  <Play className="h-3.5 w-3.5" /> Iniciar
                </Button>
              </>
            )}
            {status === 'chamado' && (
              <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={onIniciar}>
                <Play className="h-3.5 w-3.5" /> Iniciar Atendimento
              </Button>
            )}
            {status === 'em_atendimento' && onAbrirProntuario && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={onAbrirProntuario}>
                <FileText className="h-3.5 w-3.5" /> Abrir prontuário
              </Button>
            )}
            {status === 'em_atendimento' && (
              <Button size="sm" variant="default" className="gap-1.5 h-7 text-xs bg-success text-white hover:bg-success/90" onClick={onFinalizar}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar
              </Button>
            )}
            {canRemove && (
              <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs text-destructive ml-auto" onClick={onRemover} aria-label="Remover da fila">
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function Fila() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] = useState('');
  const [selectedPrioridade, setSelectedPrioridade] = useState('normal');
  const [isSaving, setIsSaving] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  /**
   * Finalização pendente, esperando a resposta sobre retorno.
   *
   * O retorno é decidido AQUI, no momento em que o profissional fecha a
   * consulta e sabe se o paciente volta — não numa aba do prontuário que
   * alguém precisa lembrar de abrir. A finalização já sabia agendar retorno; o
   * parâmetro existia e nenhuma tela passava, e o resultado foi ZERO retornos
   * em 18 atendimentos finalizados.
   */
  const [finalizando, setFinalizando] = useState<{ filaId: string; agendamentoId: string; nome: string } | null>(null);
  /**
   * Liberação excepcional da trava de pagamento/triagem.
   *
   * O banco aceita `liberado_sem_pagamento`/`liberado_sem_triagem` com
   * justificativa obrigatória desde a migration 20260814210000 — a escapatória
   * para emergência, idoso sem cartão, paciente antigo sem a carteira — mas
   * NENHUMA tela gravava esses campos. Com a trava ligada, a única saída era
   * desligar a trava da clínica inteira. Este dialog é o botão que faltava.
   */
  const [liberando, setLiberando] = useState<{ tipo: 'pagamento' | 'triagem'; agendamentoId: string; nome: string } | null>(null);
  const [motivoLiberacao, setMotivoLiberacao] = useState('');
  const [salvandoLiberacao, setSalvandoLiberacao] = useState(false);
  const [now, setNow] = useState(Date.now());

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { profile, hasAnyRole } = useSupabaseAuth();
  const { medicoId: meuMedicoId, isMedicoOnly } = useCurrentMedico();
  const [apenasMeusEscolhido, setApenasMeus] = useState<boolean | null>(null);
  const apenasMeus = apenasMeusEscolhido ?? isMedicoOnly;
  const canRemoveFromQueue = hasAnyRole(['admin', 'recepcao']);
  const podeVerValorCobranca = hasAnyRole(['admin', 'recepcao']);
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: fila = [], isLoading: loadingFila } = useFilaAtendimento();
  const { data: agendamentos = [], isLoading: loadingAgendamentos } = useAgendamentos(today);
  const { data: pacientes = [] } = usePacientes();
  const { data: medicos = [] } = useMedicos();
  const { data: salas = [] } = useSalas();
  const idsAgendamentosHoje = agendamentos.map(ag => ag.id);

  /**
   * Saldo devedor dos atendimentos do dia.
   *
   * A fila não carregava lançamento nenhum: o profissional não tinha como saber
   * se o paciente passou pelo balcão, e "Iniciar" chamava qualquer um.
   */
  const { data: cobrancas = [] } = useQuery({
    queryKey: ['fila-cobrancas', profile?.clinica_id, idsAgendamentosHoje],
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!profile?.clinica_id || idsAgendamentosHoje.length === 0) return [];
      const { data, error } = await supabase
        .from('lancamentos')
        .select('agendamento_id, valor, valor_pago, desconto, acrescimo')
        .eq('clinica_id', profile.clinica_id)
        .eq('tipo', 'receita')
        .in('agendamento_id', idsAgendamentosHoje)
        .not('status', 'in', '("cancelado","estornado")');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.clinica_id && idsAgendamentosHoje.length > 0 && podeVerValorCobranca,
  });

  /** A clínica ligou a trava de pagamento e/ou a de triagem? */
  const { data: clinicaConfig, isLoading: carregandoRegrasClinica, isError: erroRegrasClinica } = useQuery({
    queryKey: ['clinica-exige-pagamento', profile?.clinica_id],
    staleTime: 30_000,
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const { data, error } = await (supabase as any)
        .from('clinicas').select('exigir_pagamento_previo, exigir_triagem')
        .eq('id', profile.clinica_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.clinica_id,
  });

  const travaLigada = Boolean(clinicaConfig?.exigir_pagamento_previo);
  const triagemLigada = Boolean(clinicaConfig?.exigir_triagem);

  /**
   * O RLS financeiro oculta cobranÃ§as de consulta de mÃ©dicos e enfermagem.
   * A RPC retorna apenas a decisÃ£o de liberaÃ§Ã£o, sem expor valores ou itens
   * financeiros, e usa as mesmas regras do bloqueio no banco.
   */
  const { data: liberacoesPagamento = [], isLoading: verificandoPagamento, isError: erroVerificacaoPagamento } = useQuery({
    queryKey: ['fila-liberacao-pagamento', profile?.clinica_id, idsAgendamentosHoje],
    queryFn: async () => {
      if (!profile?.clinica_id || idsAgendamentosHoje.length === 0) return [];
      const { data, error } = await supabase.rpc('verificar_pagamento_fila', {
        p_agendamento_ids: idsAgendamentosHoje,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.clinica_id && travaLigada && idsAgendamentosHoje.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  /**
   * Quem já tem triagem hoje. Só busca quando a clínica usa triagem — nas
   * outras a consulta seria peso morto em toda abertura da fila.
   */
  const { data: triagensFeitas = [] } = useQuery({
    queryKey: ['fila-triagens', profile?.clinica_id],
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('triagens')
        .select('agendamento_id')
        .eq('clinica_id', profile!.clinica_id!)
        .not('agendamento_id', 'is', null);
      if (error) throw error;
      return (data ?? []).map((t: any) => t.agendamento_id as string);
    },
    enabled: !!profile?.clinica_id && triagemLigada,
  });

  const triagensPorAgendamento = useMemo(
    () => new Set(triagensFeitas),
    [triagensFeitas],
  );

  const saldoDoAgendamento = (agendamentoId: string) =>
    saldoDevedor(agendamentoId, cobrancas as any);

  /** Espelha o trigger do banco; ver src/lib/liberacaoAtendimento.ts. */
  const podeAtenderAgendamento = (agendamentoId: string) => {
    const filaItem = fila.find(f => f.agendamento_id === agendamentoId && f.status !== 'finalizado');
    if (filaItem?.cobranca_estado === 'pendente') return false;
    if (carregandoRegrasClinica || erroRegrasClinica) return false;
    if (travaLigada) {
      return liberacoesPagamento.some(l => l.agendamento_id === agendamentoId && l.pode_atender);
    }
    return podeAtender(
      agendamentoId,
      agendamentos.find(a => a.id === agendamentoId) as any,
      cobrancas as any,
      travaLigada,
    );
  };

  /** Espelha o trigger da triagem; ver src/lib/liberacaoTriagem.ts. */
  const passouPelaTriagemAgendamento = (agendamentoId: string) =>
    passouPelaTriagem(
      agendamentoId,
      agendamentos.find(a => a.id === agendamentoId) as any,
      triagensPorAgendamento,
      triagemLigada,
    );

  const isLoading = loadingFila || loadingAgendamentos || carregandoRegrasClinica;

  // Realtime subscription for instant queue updates
  useEffect(() => {
    const channel = supabase
      .channel(canalUnico('fila-realtime'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_atendimento' }, () => {
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
        queryClient.invalidateQueries({ queryKey: ['fila-liberacao-pagamento', profile?.clinica_id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, () => {
        queryClient.invalidateQueries({ queryKey: ['fila-cobrancas', profile?.clinica_id] });
        queryClient.invalidateQueries({ queryKey: ['fila-liberacao-pagamento', profile?.clinica_id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'triagens' }, () => {
        queryClient.invalidateQueries({ queryKey: ['fila-triagens', profile?.clinica_id] });
      })
      .subscribe();

    // Timer update every 30s for wait time display
    const interval = setInterval(() => setNow(Date.now()), 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [queryClient, profile?.clinica_id]);

  const agendamentosDisponiveis = agendamentos.filter(ag =>
    ['confirmado', 'agendado', 'aguardando'].includes(ag.status || '') &&
    !fila.some(f => f.agendamento_id === ag.id)
  );

  // 'concluido' é o pós-consulta fechado na Recepção: não é ninguém
  // "aguardando". Antes o filtro só excluía 'finalizado' e concluídos de
  // QUALQUER dia voltavam como cards fantasma com o badge "Aguardando".
  const dataPorAgendamento = new Map(agendamentos.map(ag => [ag.id, ag.data]));
  // Médico vê, por padrão, só os próprios pacientes; admin/recepção/enfermagem
  // veem a fila da clínica. Antes o médico via a fila de todos os colegas.
  const medicoDoItem = (item: any) =>
    (agendamentos.find(a => a.id === item.agendamento_id) as any)?.medico_id ?? item.agendamentos?.medico_id ?? null;
  const filaVisivel = apenasMeus && meuMedicoId ? fila.filter(f => medicoDoItem(f) === meuMedicoId) : fila;
  const filaPorData = separarFilaAtivaPorData(filaVisivel, today, dataPorAgendamento);
  const dataDoAgendamentoNaFila = (item: (typeof fila)[number]) =>
    item.agendamentos?.data ?? dataPorAgendamento.get(item.agendamento_id);
  const statusAgendamentoNaFila = (item: (typeof fila)[number]) =>
    item.agendamentos?.status ?? agendamentos.find(a => a.id === item.agendamento_id)?.status;
  const filaHojeEncerrada = filaPorData.hoje.filter(item =>
    !podeIniciarAgendamento(statusAgendamentoNaFila(item)),
  );
  const filaParaRevisar = [...filaPorData.outrosDias, ...filaHojeEncerrada];
  const filaAtivaCompleta = ordenarFilaPorPrioridade(
    filaPorData.hoje.filter(item => podeIniciarAgendamento(statusAgendamentoNaFila(item))),
  );

  /**
   * A lista de trabalho do profissional: só quem pode ser chamado.
   *
   * Quem está devendo não some — vai para `filaAguardandoPagamento`, logo
   * abaixo. Esconder faria o médico perguntar "cadê o paciente que acabei de
   * ver na sala de espera"; separar responde antes da pergunta existir.
   *
   * Com a trava desligada `podeAtenderAgendamento` devolve sempre true, então a
   * fila fica idêntica à de hoje.
   */
  const filaAguardandoPagamento = filaAtivaCompleta.filter(f => !podeAtenderAgendamento(f.agendamento_id));
  // Quem pagou mas ainda não passou pela enfermagem. Mesma ideia: aparece
  // separado, com o motivo, em vez de sumir da tela.
  const filaAguardandoTriagem = filaAtivaCompleta.filter(
    f => podeAtenderAgendamento(f.agendamento_id) && !passouPelaTriagemAgendamento(f.agendamento_id)
  );
  const filaAtiva = filaAtivaCompleta.filter(
    f => podeAtenderAgendamento(f.agendamento_id) && passouPelaTriagemAgendamento(f.agendamento_id)
  );

  // Só os finalizados HOJE: ordenar por updated_at sem filtro de data trazia
  // os cinco últimos de qualquer dia — semana passada incluso.
  const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0);
  const filaFinalizada = filaVisivel
    .filter(f => f.status === 'finalizado' && new Date(f.updated_at || f.created_at || 0) >= inicioDoDia)
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
    .slice(0, 5);

  const getPacienteNome = (agId: string) => {
    const ag = agendamentos.find(a => a.id === agId) as any;
    const agDaFila = fila.find(f => f.agendamento_id === agId)?.agendamentos;
    return ag?.pacientes?.nome ?? agDaFila?.pacientes?.nome ??
      pacientes.find(p => p.id === (ag?.paciente_id ?? agDaFila?.paciente_id))?.nome ?? 'Desconhecido';
  };

  const getMedicoNome = (agId: string) => {
    const ag = agendamentos.find(a => a.id === agId) as any;
    const agDaFila = fila.find(f => f.agendamento_id === agId)?.agendamentos;
    const med = ag?.medicos ?? agDaFila?.medicos ??
      medicos.find(m => m.id === (ag?.medico_id ?? agDaFila?.medico_id));
    return med ? `${nomeMedico(med.nome || med.crm)}` : '—';
  };

  const getSalaNome = (salaId: string | null) =>
    salaId ? (salas.find(s => s.id === salaId)?.nome ?? '-') : '-';

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
    queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    queryClient.invalidateQueries({ queryKey: ['fila-cobrancas', profile?.clinica_id] });
    queryClient.invalidateQueries({ queryKey: ['fila-triagens', profile?.clinica_id] });
    queryClient.invalidateQueries({ queryKey: ['clinica-exige-pagamento', profile?.clinica_id] });
    queryClient.invalidateQueries({ queryKey: ['fila-liberacao-pagamento', profile?.clinica_id] });
  };

  const handleAddToFila = async () => {
    if (!selectedAgendamento) { toast.error('Selecione um agendamento.'); return; }

    setIsSaving(true);
    try {
      const agendamento = agendamentos.find((item) => item.id === selectedAgendamento);
      const paciente = agendamento && pacientes.find((item) => item.id === agendamento.paciente_id);
      if (!agendamento || !paciente) {
        throw new Error('Não foi possível carregar os dados do agendamento. Atualize a tela e tente novamente.');
      }
      const prioridade = ['normal', 'preferencial', 'urgente'].includes(selectedPrioridade)
        ? selectedPrioridade as 'normal' | 'preferencial' | 'urgente'
        : 'normal';
      const result = await checkinComCobranca({
        agendamentoId: agendamento.id,
        pacienteId: agendamento.paciente_id,
        pacienteNome: paciente.nome || 'Paciente',
        convenioId: paciente.convenio_id,
        tipoConsulta: agendamento.tipo,
        tipoExame: ['exame', 'exames'].includes(String(agendamento.tipo || '').toLocaleLowerCase('pt-BR'))
          ? agendamento.observacoes
          : null,
        clinicaId: profile?.clinica_id,
      }, prioridade);
      if (!result.success) throw new Error(result.message);
      refresh();
      setIsAddOpen(false);
      setSelectedAgendamento('');
      setSelectedPrioridade('normal');
      if (result.actions.length === 0) {
        toast.info('Este agendamento já estava na fila.');
      } else {
        toast.success('Paciente adicionado à fila!', {
          description: prioridade === 'normal' ? undefined : `Prioridade ${prioridade} aplicada.`,
        });
      }
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // TTS voice call helper
  const chamarPacienteVoz = (pacienteNome: string, salaNome: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const texto = `Paciente ${pacienteNome}, por favor dirija-se ${salaNome === '-' ? 'à recepção' : `à ${salaNome}`}.`;
    for (let i = 0; i < 2; i++) {
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.9;
      utterance.volume = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt-BR')) || voices.find(v => v.lang.startsWith('pt'));
      if (ptVoice) utterance.voice = ptVoice;
      window.speechSynthesis.speak(utterance);
    }
  };

  /**
   * Finaliza de verdade, já sabendo se agenda retorno.
   *
   * `dias` nulo = sem retorno. A finalização desfaz tudo se o retorno não puder
   * ser criado, então o "sim" aqui é uma promessa que o banco cumpre ou
   * cancela inteira.
   */
  const confirmarFinalizacao = async (dias: number | null) => {
    if (!finalizando) return;
    const { filaId, agendamentoId } = finalizando;
    const ag = agendamentos.find(a => a.id === agendamentoId);
    if (!ag) { setFinalizando(null); return; }

    const pac = pacientes.find(p => p.id === ag.paciente_id);
    const result = await autoFinalizarAtendimento({
      agendamentoId,
      filaId,
      pacienteId: ag.paciente_id,
      pacienteNome: pac?.nome || 'Paciente',
      medicoId: ag.medico_id,
      convenioId: pac?.convenio_id,
      tipoConsulta: ag.tipo,
      tipoExame: ['exame', 'exames'].includes(String(ag.tipo || '').toLocaleLowerCase('pt-BR'))
        ? ag.observacoes : null,
      clinicaId: profile?.clinica_id,
      agendarRetorno: dias !== null,
      diasRetorno: dias ?? undefined,
    });

    setFinalizando(null);
    refresh();

    if (!result.success) {
      toast.error('Não foi possível finalizar o atendimento', { description: result.message });
      return;
    }
    toast.success(`✅ Atendimento finalizado — ${pac?.nome || 'Paciente'}`, {
      description: result.actions.join(' • '),
      duration: 8000,
      action: { label: 'Abrir Caixa', onClick: () => navigate('/caixa') },
    });
  };

  const updateStatus = async (id: string, status: string, agendamentoId?: string) => {
    // Voice call when chamado
    if (status === 'chamado' && agendamentoId) {
      const ag = agendamentos.find(a => a.id === agendamentoId) as any;
      if (!ag || !podeIniciarAgendamento(ag.status) || ag.status === 'em_atendimento') {
        refresh();
        toast.error('Este agendamento está encerrado ou não está disponível para chamada.');
        return;
      }
      // A sala vem do agendamento (definida na Agenda). Gravá-la na fila aqui
      // faz o Painel TV anunciar "Maria, Sala 1" — antes a coluna sala_id da
      // fila nunca era escrita por ninguém e a TV sempre dizia "Recepção".
      const { data: chamadaAtualizada, error: errFila } = await supabase
        .from('fila_atendimento').update({ status, sala_id: ag?.sala_id ?? null })
        .eq('id', id).eq('status', 'aguardando').select('id');
      if (errFila) {
        toast.error('Não foi possível chamar o paciente. Tente novamente.', { description: mensagemDeErro(errFila) });
        return;
      }

      if (!chamadaAtualizada?.length) {
        refresh();
        toast.warning('A fila mudou. Atualize a tela antes de chamar este paciente.');
        return;
      }

      const item = fila.find(f => f.id === id);
      const nome = getPacienteNome(agendamentoId);
      const sala = getSalaNome(ag?.sala_id ?? item?.sala_id ?? null);
      chamarPacienteVoz(nome, sala);
      refresh();
      toast.success('📢 Paciente chamado!');
      return;
    }

    // Use centralized workflow for iniciar/finalizar
    if (status === 'em_atendimento' && agendamentoId) {
      const ag = agendamentos.find(a => a.id === agendamentoId);
      const result = await autoIniciarAtendimento(
        agendamentoId, id, ag?.paciente_id || '', ag?.medico_id || ''
      );
      refresh();
      // Agora que o workflow propaga erro de verdade, o success é confiável —
      // antes ele vinha true mesmo quando nada era gravado.
      if (!result.success) {
        toast.error('Não foi possível iniciar o atendimento', { description: result.message });
        return;
      }
      // Somente perfil clínico deve abrir/editar o prontuário. Recepção e
      // enfermagem apenas movem o paciente no fluxo operacional.
      if (ag?.paciente_id && hasAnyRole(['admin', 'medico'])) {
        navigate(`/prontuarios?paciente=${ag.paciente_id}&agendamento=${agendamentoId}`);
      } else if (ag?.paciente_id) {
        toast.info('Atendimento iniciado. O médico responsável deve abrir o prontuário.');
      } else {
        toast.success('▶ Atendimento iniciado', { description: result.actions.join(' • ') });
      }
      return;
    }

    if (status === 'finalizado' && agendamentoId) {
      // Finalizar não acontece direto: abre a pergunta do retorno, e
      // `confirmarFinalizacao` faz o trabalho com a resposta em mãos. É aqui
      // que o profissional sabe se o paciente volta — depois de finalizado ele
      // sai da fila e o momento passa.
      setFinalizando({ filaId: id, agendamentoId, nome: getPacienteNome(agendamentoId) });
      return;
    }

    // Fallback for other statuses.
    // Os dois updates tinham o erro descartado: numa falha de permissão a tela
    // só chamava refresh() e o card voltava ao estado anterior, sem explicação.
    // O paciente seguia na fila e no painel da sala de espera.
    const { error: erroFila } = await supabase
      .from('fila_atendimento').update({ status }).eq('id', id);

    if (erroFila) {
      toast.error('Não foi possível mudar o status na fila.', {
        description: erroFila.message,
      });
      refresh();
      return;
    }

    if (agendamentoId) {
      const agStatus = status === 'em_atendimento' ? 'em_atendimento' : status === 'finalizado' ? 'finalizado' : 'aguardando';
      const { error: erroAg } = await supabase
        .from('agendamentos').update({ status: agStatus }).eq('id', agendamentoId);

      if (erroAg) {
        toast.warning('A fila foi atualizada, mas o agendamento não acompanhou.', {
          description: `${erroAg.message}. A agenda pode mostrar este paciente com status antigo.`,
        });
      }
    }
    refresh();
  };

  const handleRemover = async (id: string) => {
    const item = fila.find(f => f.id === id);
    const { data, error } = await supabase.from('fila_atendimento').delete()
      .eq('id', id)
      .eq('status', String(item?.status ?? ''))
      .select('id');
    setRemoveId(null);
    if (error) {
      toast.error('Falha ao remover da fila', { description: mensagemDeErro(error) });
      return;
    }
    if (!data?.length) {
      refresh();
      toast.warning(canRemoveFromQueue
        ? 'O estado do paciente mudou. A fila foi atualizada.'
        : 'Seu perfil nao pode remover itens da fila.');
      return;
    }
    // Remover durante o chamado ou o atendimento deixava o agendamento preso
    // em 'em_atendimento' para sempre: o card sumia da fila, não aparecia em
    // AtendimentosEmAberto (que só lista dias anteriores) e não podia ser
    // re-adicionado. Voltar a 'aguardando' dá saída: o paciente pode ser
    // re-chamado, ou cancelado na Agenda se foi embora.
    if (item?.status === 'em_atendimento' && item.agendamento_id) {
      const { data: agAtualizado, error: agErr } = await supabase
        .from('agendamentos').update({ status: 'aguardando' })
        .eq('id', item.agendamento_id).eq('status', 'em_atendimento').select('id');
      if (agErr) {
        toast.warning('A fila removeu o item, mas o agendamento continuou em andamento.', {
          description: `${mensagemDeErro(agErr)} Verifique a agenda deste paciente.`,
        });
      } else if (!agAtualizado?.length) {
        toast.warning('A fila foi removida, mas o agendamento mudou durante a operacao. Atualize a agenda.');
      } else {
        toast.info('Paciente removido da fila', {
          description: 'O agendamento voltou a "aguardando" — pode ser re-chamado ou cancelado na Agenda.',
        });
      }
    } else {
      toast.info('Paciente removido da fila');
    }
    refresh();
  };

  /**
   * Grava a liberação excepcional da trava (pagamento ou triagem) com
   * justificativa — espelhando as colunas e a constraint do banco
   * (migration 20260814210000 / 20260814250000).
   */
  const handleLiberar = async () => {
    if (!liberando) return;
    const motivo = motivoLiberacao.trim();
    if (motivo.length < 5) {
      toast.error('Descreva o motivo da liberação (mínimo 5 caracteres).');
      return;
    }
    setSalvandoLiberacao(true);
    try {
      const { error } = liberando.tipo === 'pagamento'
        ? await supabase
            .from('agendamentos')
            .update({
              liberado_sem_pagamento: true,
              liberado_sem_pagamento_por: profile?.id,
              liberado_sem_pagamento_em: new Date().toISOString(),
              motivo_liberacao: motivo,
            })
            .eq('id', liberando.agendamentoId)
        : await supabase
            .from('agendamentos')
            .update({
              liberado_sem_triagem: true,
              liberado_sem_triagem_por: profile?.id,
              liberado_sem_triagem_em: new Date().toISOString(),
              liberado_sem_triagem_motivo: motivo,
            })
            .eq('id', liberando.agendamentoId);
      if (error) throw error;
      toast.success(`${liberando.nome} liberado${liberando.tipo === 'pagamento' ? ' do pagamento' : ' da triagem'}.`, {
        description: 'A liberação fica registrada com autor, data e justificativa.',
      });
      setLiberando(null);
      setMotivoLiberacao('');
      refresh();
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
    } catch (e: any) {
      toast.error('Não foi possível liberar.', { description: mensagemDeErro(e) });
    } finally {
      setSalvandoLiberacao(false);
    }
  };

  // Stats
  const stats = {
    // "Chamado" ainda não entrou no consultório: conta como aguardando, senão
    // o número não bate com os cards da tela (achado de UX).
    aguardando: filaAtiva.filter(f => f.status === 'aguardando' || f.status === 'chamado').length,
    emAtendimento: filaAtiva.filter(f => f.status === 'em_atendimento').length,
    finalizadosHoje: filaFinalizada.length,
    urgentes: filaAtiva.filter(f => f.prioridade === 'urgente').length,
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Fila de Atendimento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })} • Atualiza automaticamente
          </p>
        </div>
        <div className="flex gap-2">
          {meuMedicoId && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={apenasMeus} onCheckedChange={(v) => setApenasMeus(v)} aria-label="Mostrar só meus pacientes" />
              Só meus pacientes
            </label>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={refresh} aria-label="Atualizar fila">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button className="gap-2" onClick={() => setIsAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Adicionar à Fila
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Aguardando', value: stats.aguardando, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'Em Atendimento', value: stats.emAtendimento, icon: Play, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Finalizados Hoje', value: stats.finalizadosHoje, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Urgentes', value: stats.urgentes, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
        ].map(s => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
            <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon className={cn('h-5 w-5', s.color)} />
            </div>
            <div>
              <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Queue */}
      {isLoading ? (
        <ListSkeleton items={4} />
      ) : filaAtiva.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-14 w-14 text-muted-foreground/20 mb-4" />
              <p className="font-semibold text-lg">Fila vazia</p>
              <p className="text-sm text-muted-foreground mt-1 mb-6">Nenhum paciente aguardando atendimento</p>
              <Button onClick={() => setIsAddOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" /> Adicionar Paciente
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filaAtiva.map((item, idx) => (
              <FilaCard
                key={item.id}
                item={item}
                pos={idx + 1}
                pacienteNome={getPacienteNome(item.agendamento_id)}
                medicoNome={getMedicoNome(item.agendamento_id)}
                salaNome={getSalaNome(item.sala_id)}
                canRemove={canRemoveFromQueue}
                now={now}
                onChamar={() => updateStatus(item.id, 'chamado', item.agendamento_id)}
                onIniciar={() => updateStatus(item.id, 'em_atendimento', item.agendamento_id)}
                onFinalizar={() => updateStatus(item.id, 'finalizado', item.agendamento_id)}
                onRemover={() => setRemoveId(item.id)}
                onAbrirProntuario={(() => {
                  const ag = agendamentos.find(a => a.id === item.agendamento_id);
                  return ag?.paciente_id && hasAnyRole(['admin', 'medico'])
                    ? () => navigate(`/prontuarios?paciente=${ag.paciente_id}&agendamento=${item.agendamento_id}`)
                    : undefined;
                })()}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {filaParaRevisar.length > 0 && (
        <section aria-labelledby="fila-fora-do-dia" className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
          <div>
            <h2 id="fila-fora-do-dia" className="text-sm font-semibold">Itens fora da fila ativa</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Agendamentos de outros dias ou já encerrados não entram na chamada de hoje. Revise-os com a recepção.
            </p>
          </div>
          <ul className="space-y-2">
            {filaParaRevisar.map(item => {
              const dataAgendamento = dataDoAgendamentoNaFila(item);
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{getPacienteNome(item.agendamento_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {dataAgendamento ? format(new Date(`${dataAgendamento}T12:00:00`), 'dd/MM/yyyy') : 'Agendamento sem data'}
                      {' · Agenda: '}{statusAgendamentoNaFila(item) ?? 'indisponível'}
                      {' · Fila: '}{STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]?.label ?? item.status}
                    </p>
                  </div>
                  {canRemoveFromQueue && (
                    <Button
                      size="sm" variant="outline" className="min-h-9 gap-1.5 text-destructive"
                      onClick={() => setRemoveId(item.id)}
                      aria-label={`Remover ${getPacienteNome(item.agendamento_id)} da fila`}
                    >
                      <XCircle className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ─── Aguardando pagamento ───
          Fora da lista de chamada, mas à vista: o paciente está fisicamente na
          sala de espera e o profissional precisa saber por que não pode chamá-lo.
          Só aparece quando a clínica ligou a trava. */}
      {filaAguardandoPagamento.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-2">
          <p className="text-xs font-medium text-warning flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            {filaAguardandoPagamento.length === 1
              ? (filaAguardandoPagamento[0].cobranca_estado === 'pendente'
                ? '1 paciente aguardando confirmação da cobrança ou pagamento'
                : '1 paciente aguardando pagamento')
              : `${filaAguardandoPagamento.length} pacientes aguardando cobrança ou pagamento`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {erroRegrasClinica
              ? 'Não é possível validar as regras da clínica; atualize antes de continuar.'
              : erroVerificacaoPagamento
                ? 'Não é possível confirmar o pagamento agora. Tente atualizar a fila.'
                : <>Não podem ser chamados até passarem pelo balcão. A recepção resolve em
                    Recepção &rarr; Balcão{hasAnyRole(['admin', 'medico']) && ', ou um médico libera com justificativa'}.</>}
          </p>
          {erroRegrasClinica && (
            <p className="text-xs text-destructive" role="alert">
              Não foi possível carregar as regras de liberação. Atualize antes de iniciar atendimentos.
            </p>
          )}
          {verificandoPagamento && (
            <p className="text-xs text-muted-foreground" role="status">Verificando a liberação dos atendimentos...</p>
          )}
          {erroVerificacaoPagamento && (
            <p className="text-xs text-destructive" role="alert">
              Não foi possível validar o pagamento agora. Atualize a fila antes de tentar novamente.
            </p>
          )}
          <div className="space-y-1.5 pt-1">
            {filaAguardandoPagamento.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-sm bg-background/60 rounded-lg px-3 py-2">
                <span className="font-medium truncate">{getPacienteNome(item.agendamento_id)}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn('text-xs tabular-nums', corEspera(item.horario_chegada))}>
                    <Timer className="h-3 w-3 inline mr-1" />
                    {calcularEspera(item.horario_chegada)}
                  </span>
                  <Badge variant="outline" className="text-[10px] border-warning/40 text-warning tabular-nums">
                    {item.cobranca_estado === 'pendente'
                      ? 'Confirmando cobrança'
                      : verificandoPagamento
                        ? 'Verificando pagamento'
                        : erroVerificacaoPagamento
                          ? 'Validação indisponível'
                          : podeVerValorCobranca
                            ? `${formatCurrency(saldoDoAgendamento(item.agendamento_id))}`
                            : 'Pendente no balcão'}
                  </Badge>
                  {item.cobranca_estado !== 'pendente' && hasAnyRole(['admin', 'medico']) && (
                    <Button
                      size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]"
                      disabled={salvandoLiberacao}
                      onClick={() => setLiberando({
                        tipo: 'pagamento',
                        agendamentoId: item.agendamento_id,
                        nome: getPacienteNome(item.agendamento_id),
                      })}
                    >
                      <LockOpen className="h-3 w-3" /> Liberar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Aguardando triagem ───
          Pagou, está na sala de espera, e falta a enfermagem. Mesmo motivo da
          seção acima: sumir da fila faz o profissional procurar o paciente. */}
      {filaAguardandoTriagem.length > 0 && (
        <div className="rounded-xl border border-info/30 bg-info/5 p-4 space-y-2">
          <p className="text-xs font-medium text-info flex items-center gap-2">
            <Stethoscope className="h-3.5 w-3.5" />
            {filaAguardandoTriagem.length === 1
              ? '1 paciente aguardando triagem'
              : `${filaAguardandoTriagem.length} pacientes aguardando triagem`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Já pagaram. A enfermagem registra os sinais vitais em Triagem e eles
            entram na fila de chamada{hasAnyRole(['admin', 'medico']) && ' — ou um médico libera com justificativa'}.
          </p>
          <div className="space-y-1.5 pt-1">
            {filaAguardandoTriagem.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-sm bg-background/60 rounded-lg px-3 py-2">
                <span className="font-medium truncate">{getPacienteNome(item.agendamento_id)}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('text-xs tabular-nums', corEspera(item.horario_chegada))}>
                    <Timer className="h-3 w-3 inline mr-1" />
                    {calcularEspera(item.horario_chegada)}
                  </span>
                  {hasAnyRole(['admin', 'medico']) && (
                    <Button
                      size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]"
                      disabled={salvandoLiberacao}
                      onClick={() => setLiberando({
                        tipo: 'triagem',
                        agendamentoId: item.agendamento_id,
                        nome: getPacienteNome(item.agendamento_id),
                      })}
                    >
                      <LockOpen className="h-3 w-3" /> Liberar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finalizados do dia */}
      {filaFinalizada.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Finalizados hoje
          </p>
          <div className="space-y-1.5">
            {filaFinalizada.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border px-4 py-2.5 opacity-60 bg-card">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <p className="text-sm font-medium flex-1">{getPacienteNome(item.agendamento_id)}</p>
                <p className="text-xs text-muted-foreground">{getMedicoNome(item.agendamento_id)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add to Queue Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Adicionar à Fila
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Agendamento</Label>
              <Select value={selectedAgendamento} onValueChange={setSelectedAgendamento}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar agendamento..." />
                </SelectTrigger>
                <SelectContent>
                  {agendamentosDisponiveis.length === 0 ? (
                    <SelectItem value="none" disabled>Nenhum agendamento disponível</SelectItem>
                  ) : agendamentosDisponiveis.map(ag => {
                    const pac = pacientes.find(p => p.id === (ag as any).paciente_id);
                    return (
                      <SelectItem key={ag.id} value={ag.id}>
                        {pac?.nome ?? 'Paciente'} — {ag.hora_inicio?.slice(0, 5)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={selectedPrioridade} onValueChange={setSelectedPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="preferencial">Preferencial (idoso/gestante)</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddToFila} disabled={isSaving || !selectedAgendamento} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm removal dialog */}
      <AlertDialog open={!!removeId} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
            <AlertDialogDescription>
              O paciente será removido da fila de atendimento. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeId && handleRemover(removeId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* ─── Retorno ───
          Perguntado no fechamento porque é aqui que o profissional sabe se o
          paciente volta. A tela de retorno existia no prontuário, numa aba que
          é preciso lembrar de abrir — e o resultado foi zero retornos em 18
          atendimentos. Agora é o componente compartilhado, com trava de duplo
          clique, e usado por TODAS as vias de finalização. */}
      <FinalizarAtendimentoDialog
        open={!!finalizando}
        pacienteNome={finalizando?.nome ?? ''}
        onClose={() => setFinalizando(null)}
        onConfirm={confirmarFinalizacao}
      />

      {/* ─── Liberação excepcional ───
          Emergência, idoso sem cartão, paciente antigo: com a trava ligada,
          não havia saída sem desligar a trava da clínica inteira. O banco
          já aceitava a liberação com justificativa — faltava o botão. */}
      <Dialog open={!!liberando} onOpenChange={a => { if (!a && !salvandoLiberacao) { setLiberando(null); setMotivoLiberacao(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Liberar {liberando?.tipo === 'pagamento' ? 'do pagamento' : 'da triagem'} — {liberando?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O paciente poderá ser chamado mesmo {liberando?.tipo === 'pagamento' ? 'com saldo em aberto' : 'sem passar pela enfermagem'}.
              A justificativa fica registrada com autor e horário — é o que impede a liberação de virar rotina.
            </p>
            <div className="space-y-1">
              <Label htmlFor="motivo-liberacao">Justificativa (obrigatória)</Label>
              <Textarea
                id="motivo-liberacao"
                placeholder="Ex.: paciente idoso sem cartão na emergência"
                value={motivoLiberacao}
                onChange={e => setMotivoLiberacao(e.target.value)}
                rows={3}
              />
              {motivoLiberacao.trim().length > 0 && motivoLiberacao.trim().length < 5 && (
                <p className="text-xs text-destructive">Mínimo de 5 caracteres.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={salvandoLiberacao} onClick={() => { setLiberando(null); setMotivoLiberacao(''); }}>
              Cancelar
            </Button>
            <Button
              disabled={salvandoLiberacao || motivoLiberacao.trim().length < 5}
              onClick={handleLiberar}
              className="gap-1.5"
            >
              {salvandoLiberacao && <Loader2 className="h-4 w-4 animate-spin" />}
              Liberar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
