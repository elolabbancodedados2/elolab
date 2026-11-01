import { formatCurrency } from '@/lib/formatters';
import { Fragment, useState, useMemo, useEffect, useRef } from 'react';
import { printReceiptPdf, type ReceiptData } from '@/lib/pdfReceipt';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createAutoBilling } from '@/lib/autoBilling';
import { autoConfirmarPagamento } from '@/lib/workflowAutomation';
import { checkinComCobranca } from '@/lib/checkinWithBilling';
import { primeiraFalhaCheckin, validarCheckin } from '@/lib/checkinValidacao';
import { chamarPacienteNaFila } from '@/lib/filaChamada';
import { EsperaIndicador } from '@/components/fila/EsperaIndicador';
import { atomicConcludeQueue, atomicMarkNoShow, atomicStartAppointment as autoIniciarAtendimento } from '@/lib/operationalTransitions';
import { linkWhatsApp } from '@/lib/whatsapp';
import { ChecklistRecepcao } from '@/components/recepcao/ChecklistRecepcao';
import { ErrorState } from '@/components/ErrorState';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { PageHeader } from '@/components/PageHeader';
import { AtendimentosEmAberto } from '@/components/recepcao/AtendimentosEmAberto';
import { useAgendamentosPeriodo, useMedicos, useSalas } from '@/hooks/useSupabaseData';
import { usePacienteResumo } from '@/hooks/useBuscaPacientes';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { cn, sanitizeText } from '@/lib/utils';
import {
  UserCheck, Clock, Play, Check, Banknote, QrCode, CreditCard,
  Landmark, Search, Bell, ChevronRight, Users, Stethoscope,
  DollarSign, ArrowRight, Loader2, CheckCircle2, AlertTriangle,
  Timer, Phone, XCircle, Receipt, Eye, CalendarPlus, FileText,
  FlaskConical, RotateCcw, ClipboardCheck, ClipboardList, Lock as LockIcon, LockOpen, Activity,
  UserPlus, DoorOpen, MessageCircle, UserX, ArrowUpDown, Hourglass, Link2, Printer,
  LayoutGrid, List, Mail, CalendarClock, CalendarDays, MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { minutosAgoraSaoPaulo, proximaVagaLivre } from '@/lib/proximaVagaLivre';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { pacienteCorresponde, normalizarTexto } from '@/lib/buscaPaciente';
import { calcularSaldoPagamento, montarPagamentos, resumirPagamentos, somaDasExtras, validarValorRecebido } from '@/lib/pagamentoDividido';
import { patientStep } from '@/lib/receptionWorkflow';
import { passouPelaTriagem } from '@/lib/liberacaoTriagem';
import { useRegrasLiberacaoClinica } from '@/hooks/useRegrasLiberacaoClinica';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { canalUnico } from '@/lib/realtimeCanal';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { getReceptionReturnPath } from '@/lib/receptionReturnPath';
import { printReceptionTicket, receptionTicketCode } from '@/lib/receptionTicket';

// ─── Constants ──────────────────────────────────────────
const FORMAS_PAGAMENTO = [
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote, color: 'text-success' },
  { value: 'pix', label: 'PIX', icon: QrCode, color: 'text-info' },
  { value: 'credito', label: 'Crédito', icon: CreditCard, color: 'text-primary' },
  { value: 'debito', label: 'Débito', icon: CreditCard, color: 'text-warning' },
  { value: 'transferencia', label: 'Transferência', icon: Landmark, color: 'text-muted-foreground' },
];

const STEP_LABELS = ['Check-in', 'Balcão', 'Atendimento', 'Finalizado', 'Concluído'] as const;

type CaixaEstadoPersistido = {
  aberto?: boolean;
  data?: string;
  valorAbertura?: number;
  operador?: string;
};

function isCaixaAbertoHoje(estado: CaixaEstadoPersistido | null | undefined, today: string): boolean {
  return Boolean(estado?.aberto === true && estado?.data === today);
}

function lerCacheCaixa(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}

function salvarCacheCaixa(chave: string, estado: CaixaEstadoPersistido): void {
  try { localStorage.setItem(chave, JSON.stringify(estado)); } catch { /* cache opcional; o banco é a fonte de verdade */ }
}

function limparCacheCaixa(chave: string): void {
  try { localStorage.removeItem(chave); } catch { /* cache opcional; o banco é a fonte de verdade */ }
}

function readCaixaEstadoLocal(userId?: string, clinicaId?: string, today = todaySaoPauloDateOnly()): CaixaEstadoPersistido | null {
  const keys = [
    userId ? `caixa_estado_${userId}` : null,
    clinicaId ? `caixa_estado_clinica_${clinicaId}` : null,
  ].filter(Boolean) as string[];

  for (const key of keys) {
    const raw = lerCacheCaixa(key);
    if (!raw) continue;
    try {
      const estado = JSON.parse(raw) as CaixaEstadoPersistido;
      if (isCaixaAbertoHoje(estado, today)) return estado;
    } catch {
      // ignore malformed local cache
    }
  }

  return null;
}

function horaDaClinica(instant: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** Encaixe registrado um pouco depois da chegada ainda é aceito. */
const TOLERANCIA_ENCAIXE_PASSADO_MIN = 15;

function horaDeMinutos(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minutosDaHora(hora: string | null | undefined): number | null {
  if (!hora || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(hora)) return null;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function dataHoraDaClinica(instant: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant).replace(',', ' às');
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

// ─── Main Component ─────────────────────────────────────
export default function Recepcao({ onOpenCaixa, task }: { onOpenCaixa?: () => void; task?: 'walk-in' | 'payment' } = {}) {
  const navigate = useNavigate();
  const { lancamentoId } = useParams<{ lancamentoId: string }>();
  const queryClient = useQueryClient();
  const { profile, hasAnyRole } = useSupabaseAuth();
  const podeRegistrarTriagem = hasAnyRole(['admin', 'medico', 'enfermagem']);
  const podeGerenciarRecepcao = hasAnyRole(['admin', 'recepcao']);
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('todos');
  const [viewMode, setViewMode] = useState<'fluxo' | 'linha' | 'lista'>('fluxo');
  const [selectedAgendamentoId, setSelectedAgendamentoId] = useState<string | null>(null);
  const [medicoFiltro, setMedicoFiltro] = useState('todos');
  const [ordenacao, setOrdenacao] = useState<'horario' | 'espera'>('horario');
  const [marcandoFalta, setMarcandoFalta] = useState<{ agId: string; nome: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingCheckinId, setProcessingCheckinId] = useState<string | null>(null);
  const [savingPriorityId, setSavingPriorityId] = useState<string | null>(null);
   const [selectedLancamento, setSelectedLancamento] = useState<any>(null);
   const [selectedPacienteBalcao, setSelectedPacienteBalcao] = useState<any>(null);
   const [formaPagamento, setFormaPagamento] = useState('');
   const [desconto, setDesconto] = useState(0);
   const [acrescimo, setAcrescimo] = useState(0);
   const [valorReceberAgora, setValorReceberAgora] = useState('');
   /**
    * Formas ADICIONAIS, para o pagamento dividido.
    *
    * A primeira forma continua sendo `formaPagamento` — assim o caso comum
    * (uma forma só) não muda em nada, nem na tela nem para quem já usa. Quem
    * precisa dividir ("R$ 200 no Pix e o resto no cartão") acrescenta linhas
    * aqui, e só então o valor da primeira passa a ser o restante.
    */
   const [formasExtras, setFormasExtras] = useState<Array<{ forma: string; valor: number }>>([]);
   /**
    * Identifica ESTA tentativa de pagamento no servidor.
    *
    * Vai para `registrar_pagamento`, que recusa a segunda chamada com a mesma
    * chave. É o que faz clique duplo, botão travado e refresh no meio do
    * caminho não virarem duas cobranças.
    */
   const [chaveIdempotencia, setChaveIdempotencia] = useState('');
   const [obsPagamento, setObsPagamento] = useState('');
   const [paymentDirty, setPaymentDirty] = useState(false);
   const paymentFormSeededId = useRef<string | null>(null);
   const paymentCompleted = useRef(false);
   const [now, setNow] = useState(Date.now());
   const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
   const [pendingAction, setPendingAction] = useState<{type: string; agId?: string; filaId?: string} | null>(null);
   /**
    * Encaixe: paciente que chegou sem agendamento. Antes a recepcionista
    * tinha que ir até a Agenda, criar a consulta e voltar para fazer o
    * check-in — três navegações no meio de um balcão cheio. Aqui o caminho
    * é um só: busca, médico, tipo e pronto.
    */
   const [encaixePacienteId, setEncaixePacienteId] = useState('');
   const [encaixeMedicoId, setEncaixeMedicoId] = useState('');
   const [encaixeTipo, setEncaixeTipo] = useState('');
   // Vazio = "agora" (acompanha o relógio). Preenchido = horário escolhido.
   const [encaixeHora, setEncaixeHora] = useState('');
   const [sugestaoEncaixe, setSugestaoEncaixe] = useState<string | null>(null);
   const [salvandoEncaixe, setSalvandoEncaixe] = useState(false);
   const encaixeCompleted = useRef(false);
   const encaixeSubmitLock = useRef(false);

  const location = useLocation();
  const returnTo = getReceptionReturnPath(`${location.pathname}${location.search}`, location.state);
  const abrirEncaixe = () => navigate('/recepcao/encaixe', { state: { returnTo: `${location.pathname}${location.search}` } });
  const abrirCadastroPaciente = () => navigate('/pacientes/novo', { state: { returnTo: '/recepcao' } });
  const abrirPortalPaciente = (patientId: string) => navigate(`/pacientes/${encodeURIComponent(patientId)}/portal/link`, {
    state: { patientId, returnTo: '/recepcao' },
  });
  const abrirPassagemDeTurno = () => navigate('/fila', { state: { openHandoff: true, returnTo: '/recepcao' } });
  const registrarPendencia = () => navigate('/tarefas/nova', {
    state: {
      returnTo: '/recepcao',
      receptionPrefill: {
        titulo: 'Pendência da Recepção',
        descricao: 'Descreva a pendência administrativa para o próximo responsável.',
        prioridade: 'media',
        data_vencimento: today,
        categoria: 'Administrativo',
      },
    },
  });

  async function alterarPrioridade(filaId: string, prioridade: string) {
    if (!podeGerenciarRecepcao || !profile?.clinica_id || !['normal', 'preferencial', 'urgente'].includes(prioridade)) return;
    setSavingPriorityId(filaId);
    try {
      const { data, error } = await supabase.from('fila_atendimento').update({ prioridade })
        .eq('id', filaId).eq('clinica_id', profile.clinica_id).in('status', ['aguardando', 'chamado'])
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este paciente não está mais aguardando na fila. Atualize a Recepção.');
      await queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      toast.success('Prioridade atualizada.');
    } catch (error) {
      toast.error('Não foi possível atualizar a prioridade.', {
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setSavingPriorityId(null);
    }
  }

  async function imprimirSenha(filaId: string, horarioChegada: string | null | undefined) {
    try {
      const aberta = await printReceptionTicket(filaId, horarioChegada ? horaDaClinica(new Date(horarioChegada)) : horaDaClinica(new Date()));
      if (!aberta) toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para imprimir a senha.');
    } catch (error) {
      toast.error('Não foi possível gerar a senha.', { description: mensagemDeErro(error) });
    }
  }
  const abrirFinalizacao = (
    agendamentoId: string,
    origem: 'recepcao' | 'atendimentos-abertos',
    filaId?: string,
  ) => {
    const query = new URLSearchParams({ origem });
    if (filaId) query.set('filaId', filaId);
    navigate(`/atendimentos/${agendamentoId}/finalizar?${query.toString()}`, {
      state: { returnTo: `${location.pathname}${location.search}` },
    });
  };

  // Refresh timer every 30s
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  // "/" foca a busca, como na Agenda e nas Tarefas.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '');
      const modalAberto = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if (event.key === '/' && !typing && !modalAberto && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && target === searchRef.current && search) setSearch('');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [search]);

  // Data
  // Só o dia de hoje: a recepção não usa o histórico, e o realtime refaz esta
  // consulta a cada mudança na agenda — antes era a tabela inteira, com joins.
  const agendaHojeQuery = useAgendamentosPeriodo(today, today, { resumoRecepcao: true, suppressGlobalErrorToast: true });
  const { data: agendamentos = [], isLoading: loadingAg } = agendaHojeQuery;
  const {
    data: pacienteEncaixe,
    isLoading: carregandoPacienteEncaixe,
    isError: erroPacienteEncaixe,
    refetch: recarregarPacienteEncaixe,
  } = usePacienteResumo(encaixePacienteId);
  const pagamentoLancamentoQuery = useQuery({
    queryKey: ['recepcao-pagamento', profile?.clinica_id, lancamentoId],
    enabled: task === 'payment' && !!profile?.clinica_id && !!lancamentoId,
    meta: { suppressGlobalErrorToast: true },
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('*')
        .eq('id', lancamentoId)
        .eq('clinica_id', profile!.clinica_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const pacientePagamentoQuery = usePacienteResumo(pagamentoLancamentoQuery.data?.paciente_id);
  useEffect(() => {
    const lancamento = pagamentoLancamentoQuery.data;
    if (task !== 'payment' || !lancamentoId || !lancamento || paymentFormSeededId.current === lancamentoId) return;
    if (lancamento.paciente_id && (pacientePagamentoQuery.isLoading || pacientePagamentoQuery.isError)) return;
    paymentFormSeededId.current = lancamentoId;
    paymentCompleted.current = false;
    setPaymentDirty(false);
    setSelectedLancamento(lancamento);
    setSelectedPacienteBalcao(pacientePagamentoQuery.data ?? null);
    setFormaPagamento('');
    setDesconto(Number(lancamento.desconto || 0));
    setAcrescimo(Number(lancamento.acrescimo || 0));
    setValorReceberAgora(calcularSaldoPagamento(
      Number(lancamento.valor || 0),
      Number(lancamento.desconto || 0),
      Number(lancamento.acrescimo || 0),
      Number(lancamento.valor_pago || 0),
    ).toFixed(2));
    setObsPagamento('');
    setFormasExtras([]);
    setChaveIdempotencia(crypto.randomUUID());
  }, [task, lancamentoId, pagamentoLancamentoQuery.data, pacientePagamentoQuery.data, pacientePagamentoQuery.isLoading, pacientePagamentoQuery.isError]);
  const medicosQuery = useMedicos({ suppressGlobalErrorToast: true });
  const { data: medicos = [] } = medicosQuery;
  const { data: salas = [] } = useSalas();

  const filaRecepcaoQuery = useQuery({
    queryKey: ['fila_atendimento', profile?.id ?? null, profile?.clinica_id ?? null],
    meta: { suppressGlobalErrorToast: true },
    queryFn: async () => {
      if (!profile?.clinica_id) {
        console.warn('Clinic ID not found - cannot fetch fila_atendimento');
        return [];
      }
      const { data, error } = await supabase
        .from('fila_atendimento')
        .select('*')
        .eq('clinica_id', profile.clinica_id)
        .order('posicao');
      if (error) throw error;
      return data || [];
    },
  });
  const filaItems = useMemo(() => filaRecepcaoQuery.data ?? [], [filaRecepcaoQuery.data]);

  const agendamentoIdsHoje = useMemo(() => agendamentos.map((ag: any) => ag.id), [agendamentos]);
  const {
    data: lancamentos = [],
    isSuccess: lancamentosResolvidos,
    isError: lancamentosErro,
    error: erroLancamentos,
  } = useQuery({
    queryKey: ['lancamentos_hoje', profile?.id ?? null, profile?.clinica_id ?? null, today, agendamentoIdsHoje],
    meta: { suppressGlobalErrorToast: true },
    queryFn: async () => {
      if (!profile?.clinica_id || agendamentoIdsHoje.length === 0) {
        return [];
      }
      const { data, error } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('clinica_id', profile.clinica_id)
        .eq('tipo', 'receita')
        .in('agendamento_id', agendamentoIdsHoje);
      if (error) throw error;
      return data || [];
    },
  });

  // Check if caixa is open — single source of truth: caixa_diario table
  const { refetch: refetchCaixa } = useQuery({
    queryKey: ['caixa-estado-recepcao', profile?.clinica_id],
    meta: { suppressGlobalErrorToast: true },
    initialData: () => Boolean(readCaixaEstadoLocal(profile?.id, profile?.clinica_id)),
    queryFn: async () => {
      if (!profile?.clinica_id) return false;
      const todayStr = todaySaoPauloDateOnly();

      // localStorage is an initial display hint only. Every action re-reads the
      // database so a close from another terminal takes effect immediately.
      const { data: caixa, error } = await supabase
        .from('caixa_diario')
        .select('id, aberto, data')
        .eq('data', todayStr)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (error) throw error;

      if (caixa?.aberto) {
        // Sync to localStorage for fast reads
        const estado: CaixaEstadoPersistido = { aberto: true, data: todayStr, operador: profile?.nome };
        const clinicaKey = `caixa_estado_clinica_${profile.clinica_id}`;
        const userKey = `caixa_estado_${profile.id}`;
        salvarCacheCaixa(clinicaKey, estado);
        salvarCacheCaixa(userKey, estado);
        return true;
      }

      // Caixa is closed — clear localStorage
      const clinicaKey = `caixa_estado_clinica_${profile.clinica_id}`;
      const userKey = `caixa_estado_${profile.id}`;
      limparCacheCaixa(clinicaKey);
      limparCacheCaixa(userKey);
      return false;
    },
    enabled: !!profile?.clinica_id,
    refetchInterval: 10000,
  });

  async function checkCaixaAberto(): Promise<boolean> {
    const resultado = await refetchCaixa();
    if (resultado.error) {
      toast.error('Não foi possível confirmar o estado do caixa', {
        description: 'Confira sua conexão e tente novamente.',
      });
      return false;
    }
    if (!resultado.data) {
      toast.error('Caixa fechado!', {
        description: 'Abra o Caixa Diário antes de realizar pagamentos.',
        action: {
          label: 'Abrir Caixa',
          onClick: () => onOpenCaixa ? onOpenCaixa() : navigate('/caixa-diario'),
        },
        duration: 6000,
      });
      return false;
    }
    return true;
  }

  // Tipos de consulta ativos — usados pelo encaixe (o preço é resolvido no
  // check-in pelo createAutoBilling, igual ao fluxo agendado).
  const tiposConsultaQuery = useQuery({
    queryKey: ['tipos-consulta-encaixe', profile?.clinica_id],
    meta: { suppressGlobalErrorToast: true },
    enabled: !!profile?.clinica_id && task === 'walk-in',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_consulta')
        .select('id, nome, valor_particular, duracao_minutos')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const tiposConsulta = tiposConsultaQuery.data ?? [];


  // Realtime subscriptions
  // agendamentos e fila_atendimento já são invalidados pelo canal global
  // (useRealtimeSubscription). Aqui ficam só os caches próprios do balcão,
  // sempre restritos à clínica da sessão.
  useEffect(() => {
    const clinicaId = profile?.clinica_id;
    if (!clinicaId) return;
    const filtro = `clinica_id=eq.${clinicaId}`;
    const channel = supabase
      .channel(canalUnico('recepcao-realtime'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'triagens', filter: filtro }, () => {
        queryClient.invalidateQueries({ queryKey: ['recepcao-triagens-registradas', clinicaId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos', filter: filtro }, () => {
        queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caixa_diario', filter: filtro }, () => {
        queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
      })
      // Recebimentos e estornos também podem ser registrados em outra tela ou
      // por outro operador. Sem este evento, o resumo do balcão só se atualizava
      // depois de uma ação local ou de recarregar a página.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagamentos', filter: filtro }, () => {
        queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia', clinicaId] });
      });

    const ch = channel.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient, profile?.clinica_id]);

  // Build unified patient list for today
  const todayAgendamentos = useMemo(() =>
    agendamentos
      .filter((a: any) => a.data === today && a.status !== 'cancelado')
      .sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio)),
    [agendamentos, today]
  );

  // A RPC retorna somente IDs e é autorizada para os mesmos perfis clínicos
  // que podem registrar a triagem. Assim o atalho acompanha a chegada e some
  // quando outra pessoa já registrou a ficha.
  const agendamentoIdsDoDia = useMemo(() => todayAgendamentos.map(ag => ag.id), [todayAgendamentos]);
  const triagensRegistradasQuery = useQuery<string[]>({
    queryKey: ['recepcao-triagens-registradas', profile?.clinica_id, agendamentoIdsDoDia],
    meta: { suppressGlobalErrorToast: true },
    enabled: podeRegistrarTriagem && Boolean(profile?.clinica_id) && agendamentoIdsDoDia.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('listar_agendamentos_com_triagem', {
        p_agendamento_ids: agendamentoIdsDoDia,
      });
      if (error) throw error;
      return (data ?? []).map((row: { agendamento_id: string }) => row.agendamento_id);
    },
  });

  // O trigger `triagem_antes_do_atendimento` recusa o início sem triagem; a
  // tela antecipa o motivo em vez de oferecer um botão que vai falhar.
  const { triagemObrigatoria } = useRegrasLiberacaoClinica();
  const faltaTriagem = (ag: any) => triagemObrigatoria
    && triagensRegistradasQuery.isSuccess
    && !passouPelaTriagem(ag.id, ag, triagensRegistradasQuery.data ?? [], true);

  const enriched = useMemo(() =>
    todayAgendamentos.map((ag: any) => {
      const pac = ag.pacientes;
      const med = medicos.find((m: any) => m.id === ag.medico_id);
      const sala = ag.sala_id ? salas.find((s: any) => s.id === ag.sala_id) : null;
      const fila = filaItems.find((f: any) => f.agendamento_id === ag.id);
      const lanc = lancamentos.find((l: any) => l.agendamento_id === ag.id);
      const step = patientStep(ag, fila, lanc, lancamentosResolvidos);
      return { ag, pac, med, sala, fila, lanc, step };
    }),
    [todayAgendamentos, medicos, salas, filaItems, lancamentos, lancamentosResolvidos]
  );

   // Filter
   const filtered = useMemo(() => {
     let list = enriched;
     if (activeTab === 'checkin') list = list.filter(e => e.step === 0);
     if (activeTab === 'balcao') list = list.filter(e => e.step === 1);
     if (activeTab === 'atendimento') list = list.filter(e => e.step === 2 || e.step === 3);
     if (activeTab === 'concluido') list = list.filter(e => e.step === 4);
     if (activeTab === 'faltou') list = list.filter(e => e.ag.status === 'faltou');
     if (medicoFiltro !== 'todos') list = list.filter(e => e.ag.medico_id === medicoFiltro);
     if (search) {
       const q = normalizarTexto(search);
       list = list.filter(e =>
         // Paciente: ignora acento, caixa e máscara de CPF/telefone.
         (e.pac && pacienteCorresponde(e.pac, search)) ||
         normalizarTexto(e.med?.nome).includes(q) ||
         e.ag?.hora_inicio?.includes(search)
       );
     }
     if (ordenacao === 'espera') {
       // Quem chegou há mais tempo primeiro; quem ainda não chegou vai para o fim.
       list = [...list].sort((a, b) => {
         const ta = a.fila?.horario_chegada ? new Date(a.fila.horario_chegada).getTime() : Number.POSITIVE_INFINITY;
         const tb = b.fila?.horario_chegada ? new Date(b.fila.horario_chegada).getTime() : Number.POSITIVE_INFINITY;
         return ta - tb;
       });
     }
     return list;
   }, [enriched, activeTab, search, medicoFiltro, ordenacao]);

   // Stats
   const stats = useMemo(() => ({
     aguardando: enriched.filter(e => e.step === 0).length,
     balcao: enriched.filter(e => e.step === 1).length,
     atendimento: enriched.filter(e => e.step === 2 || e.step === 3).length,
     emConsulta: enriched.filter(e => e.ag.status === 'em_atendimento').length,
     concluido: enriched.filter(e => e.step === 4).length,
     faltou: enriched.filter(e => e.ag.status === 'faltou').length,
   }), [enriched]);

   const selectedReceptionEntry = useMemo(
     () => filtered.find(item => item.ag.id === selectedAgendamentoId) ?? filtered[0] ?? null,
     [filtered, selectedAgendamentoId],
   );

   const workflowStages = [
     { id: 'checkin', title: 'Check-in', subtitle: 'Pacientes chegando', count: stats.aguardando, icon: Clock, items: filtered.filter(item => item.step === 0) },
     { id: 'balcao', title: 'Balcão', subtitle: 'Aguardando liberação', count: stats.balcao, icon: Banknote, items: filtered.filter(item => item.step === 1) },
     { id: 'atendimento', title: 'Atendimento', subtitle: 'Na clínica', count: stats.atendimento, icon: Stethoscope, items: filtered.filter(item => item.step === 2 || item.step === 3) },
     { id: 'concluido', title: 'Concluído', subtitle: 'Atendimentos finalizados', count: stats.concluido, icon: CheckCircle2, items: filtered.filter(item => item.step === 4) },
   ];

   const boardColumns = activeTab === 'todos'
     ? workflowStages
     : activeTab === 'faltou'
       ? [{ id: 'faltou', title: 'Não compareceu', subtitle: 'Reagendamentos pendentes', count: stats.faltou, icon: XCircle, items: filtered }]
       : workflowStages.filter(stage => stage.id === activeTab);

   const boardActionFor = (item: any): { label: string; icon: any; run: () => void } | null => {
     const saldo = item.lanc ? calcularSaldoPagamento(
       Number(item.lanc.valor || 0),
       Number(item.lanc.desconto || 0),
       Number(item.lanc.acrescimo || 0),
       Number(item.lanc.valor_pago || 0),
     ) : 0;

     if (item.ag.status === 'faltou' || item.step === 4) {
       return { label: 'Reagendar', icon: CalendarPlus, run: () => navigate(`/agenda?reagendar=${item.ag.id}`) };
     }
     if (item.step === 0) {
       return { label: 'Fazer check-in', icon: UserCheck, run: () => { void handleCheckin(item.ag.id); } };
     }
     if (item.step === 1) {
       return item.lanc && saldo > 0
         ? { label: 'Receber pagamento', icon: DollarSign, run: () => { void openPagamento(item.lanc, item.pac); } }
         : { label: 'Chamar ao balcão', icon: Bell, run: () => { void handleChamarBalcao(item.lanc, item.pac); } };
     }
     if (item.step === 2 && item.fila) {
       if (item.ag.status === 'em_atendimento') {
         return { label: 'Finalizar atendimento', icon: Check, run: () => abrirFinalizacao(item.ag.id, 'recepcao', item.fila.id) };
       }
       if (faltaTriagem(item.ag)) {
         return { label: 'Abrir triagem', icon: Activity, run: () => { void handleEncaminharTriagem(item.ag.id, item.ag.paciente_id); } };
       }
       return { label: 'Iniciar atendimento', icon: Play, run: () => { void handleIniciarAtendimento(item.ag.id, item.fila.id); } };
     }
     if (item.step === 3) {
       if (item.lanc && saldo > 0) {
         return { label: 'Receber saldo', icon: DollarSign, run: () => { void openPagamento(item.lanc, item.pac); } };
       }
       if (item.fila) {
         return { label: 'Concluir atendimento', icon: CheckCircle2, run: () => handleConcluir(item.ag.id, item.fila.id) };
       }
     }
     return null;
   };

   const selectedPatientName = selectedReceptionEntry?.pac?.nome_social || selectedReceptionEntry?.pac?.nome || 'Paciente';
   const selectedStageLabel = !selectedReceptionEntry
     ? ''
     : selectedReceptionEntry.ag.status === 'faltou'
       ? 'Não compareceu'
       : selectedReceptionEntry.step === 0
         ? 'Aguardando check-in'
         : selectedReceptionEntry.step === 1
           ? 'No balcão'
           : selectedReceptionEntry.step === 2
             ? selectedReceptionEntry.ag.status === 'em_atendimento' ? 'Em consulta' : 'Aguardando chamada'
             : selectedReceptionEntry.step === 3
               ? 'Consulta finalizada'
               : 'Atendido';
   const selectedAllergies = Array.isArray(selectedReceptionEntry?.pac?.alergias)
     ? selectedReceptionEntry.pac.alergias.filter(Boolean).join(', ')
     : typeof selectedReceptionEntry?.pac?.alergias === 'string'
       ? selectedReceptionEntry.pac.alergias
       : '';
   const selectedBalance = selectedReceptionEntry?.lanc ? calcularSaldoPagamento(
     Number(selectedReceptionEntry.lanc.valor || 0),
     Number(selectedReceptionEntry.lanc.desconto || 0),
     Number(selectedReceptionEntry.lanc.acrescimo || 0),
     Number(selectedReceptionEntry.lanc.valor_pago || 0),
   ) : 0;
   const selectedBoardAction = selectedReceptionEntry ? boardActionFor(selectedReceptionEntry) : null;

   // Próximo a chamar: quem já pagou e espera há mais tempo.
   const proximoAChamarId = useMemo(() => {
     const esperando = enriched
       .filter(e => e.step === 2 && e.ag.status !== 'em_atendimento' && e.fila)
       .sort((a, b) => new Date(a.fila?.horario_chegada || 0).getTime() - new Date(b.fila?.horario_chegada || 0).getTime());
     return esperando[0]?.ag.id ?? null;
   }, [enriched]);

   // Espera média de quem chegou e ainda não entrou (balcão + pagos esperando).
   const esperaMediaMin = useMemo(() => {
     const esperas = enriched
       .filter(e => (e.step === 1 || e.step === 2) && e.ag.status !== 'em_atendimento' && e.fila?.horario_chegada)
       .map(e => Math.max(0, Math.floor((now - new Date(e.fila.horario_chegada).getTime()) / 60000)));
     if (esperas.length === 0) return null;
     return Math.round(esperas.reduce((s, m) => s + m, 0) / esperas.length);
   }, [enriched, now]);

   const minutosAgora = useMemo(() => {
     const [h, m] = horaDaClinica(new Date(now)).split(':').map(Number);
     return h * 60 + m;
   }, [now]);

   const statusFor = (item: any) => {
     const appointmentMinutes = minutosDaHora(item.ag.hora_inicio);
     const late = item.step === 0 && appointmentMinutes !== null && appointmentMinutes < minutosAgora;
     const text = item.ag.status === 'faltou'
       ? 'Não compareceu'
       : late
         ? `Atrasado ${minutosAgora - (appointmentMinutes ?? 0)} min`
         : item.step === 0
           ? item.fila ? 'Chegou agora' : 'No horário'
           : item.step === 1
             ? 'Aguardando balcão'
             : item.step === 2
               ? item.ag.status === 'em_atendimento' ? 'Em consulta' : 'Aguardando chamada'
               : item.step === 3
                 ? 'Consulta finalizada'
                 : 'Atendido';
     return { late, text };
   };

   // Linha do tempo do protótipo aprovado em 30/10/2026: o dia em ordem de horário, com a hora atual marcada.
   const linhaDoTempo = useMemo(
     () => [...filtered].sort((a, b) => (a.ag.hora_inicio || '').localeCompare(b.ag.hora_inicio || '')),
     [filtered],
   );
   const indiceAgora = linhaDoTempo.findIndex(item => (minutosDaHora(item.ag.hora_inicio) ?? 0) > minutosAgora);

   async function handleMarcarFalta(agId: string) {
     if (!profile?.clinica_id) return;
     setIsProcessing(true);
     try {
       const resultado = await atomicMarkNoShow(agId, profile.clinica_id);
       if (!resultado.success) throw new Error(resultado.message);
       toast.success('Falta registrada', { description: resultado.message });
       queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
       queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
       queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
     } catch (error) {
       toast.error('Não foi possível registrar a falta', { description: mensagemDeErro(error) });
     } finally {
       setIsProcessing(false);
       setMarcandoFalta(null);
     }
   }

  // ─── Actions ──────────────────────────────────────────
  async function handleCheckin(agId: string, itemForcado?: { ag: any; pac: any; med: any }) {
      setProcessingCheckinId(agId);
      setIsProcessing(true);
      try {
        // O encaixe passa o item na mão: o agendamento acabou de ser criado e
        // ainda não passou pelo cache da lista.
        const item = itemForcado ?? enriched.find(e => e.ag.id === agId);
        if (!item) throw new Error('Agendamento não encontrado');
        const falhaCheckin = primeiraFalhaCheckin(validarCheckin({
          agendamento: item.ag,
          paciente: item.pac,
          clinicaId: profile?.clinica_id,
          hoje: today,
        }));
        if (falhaCheckin) throw new Error(falhaCheckin);
        const result = await checkinComCobranca({
          agendamentoId: agId,
          pacienteId: item.ag.paciente_id,
          pacienteNome: item.pac?.nome || 'Paciente',
          convenioId: item.pac?.convenio_id,
          tipoConsulta: item.ag.tipo,
          tipoExame: ['exame', 'exames'].includes(String(item.ag.tipo || '').toLocaleLowerCase('pt-BR'))
            ? item.ag.observacoes
            : null,
          clinicaId: profile?.clinica_id,
        });
        if (!result.success) throw new Error(result.message);

       queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
       queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
       queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
       if (result.actions.length === 0) {
         toast.info('Este agendamento já estava na fila.', {
           description: result.billingOutcome === 'free'
             ? 'Atendimento gratuito confirmado; paciente continua na fila.'
             : 'A situação da cobrança foi conferida no financeiro.',
         });
       } else if (result.billingOutcome === 'free') {
         toast.success('Check-in realizado!', {
           description: 'Atendimento sem cobrança. Paciente pronto para ser chamado.',
         });
       } else {
         toast.success('Check-in realizado!', {
           description: result.billingOutcome === 'already_exists'
             ? 'Cobrança existente conferida no financeiro.'
             : 'Paciente encaminhado ao balcão para pagamento.',
         });
       }
     } catch (err: any) {
       toast.error('Erro ao realizar check-in', { description: mensagemDeErro(err) });
     } finally {
       setProcessingCheckinId(null);
       setIsProcessing(false);
     }
   }

  async function handleChamar(filaId: string) {
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão antes de chamar o paciente.');
      return;
    }
    setIsProcessing(true);
    try {
      // O erro era ignorado: a tela dizia "Paciente chamado!" enquanto a fila
      // continuava parada e o Painel TV não exibia nada.
      const versao = (filaItems as any[]).find(f => f.id === filaId)?.updated_at;
      const chamada = await chamarPacienteNaFila({ filaId, clinicaId: profile.clinica_id, versao });
      if (chamada === 'mudou') {
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
        toast.warning('A fila mudou antes da chamada.', { description: 'Outra pessoa pode ter chamado este paciente. A lista foi atualizada.' });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      toast.success('Paciente chamado!');
    } catch (err: any) {
      console.error('handleChamar error:', err);
      toast.error('Não foi possível chamar o paciente', { description: mensagemDeErro(err) });
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleIniciarAtendimento(agId: string, filaId: string) {
    setIsProcessing(true);
    try {
      const item = enriched.find(e => e.ag.id === agId);
      const result = await autoIniciarAtendimento(agId, filaId, item?.ag.paciente_id || '', item?.ag.medico_id || '');
      if (!result.success) throw new Error(result.message);
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      toast.success('Atendimento iniciado!', { description: result.actions.join(' • ') });
    } catch (err: any) {
      console.error('handleIniciarAtendimento error:', err);
      toast.error('Não foi possível iniciar o atendimento', { description: mensagemDeErro(err) });
    }
    setIsProcessing(false);
  }

   async function openPagamento(lanc: any, pac: any) {
     if (!(await checkCaixaAberto())) return;

     // Compatibilidade com cobranças de exames criadas pela versão antiga,
     // que podia salvar valor zero antes de consultar o catálogo.
     const item = enriched.find(e => e.ag.id === lanc?.agendamento_id);
     const tipoAgendamento = String(item?.ag?.tipo || '').toLocaleLowerCase('pt-BR');
     const isExam = lanc?.categoria === 'exame' || tipoAgendamento === 'exame' || tipoAgendamento === 'exames';
     let lancamentoSelecionado = lanc;
     if (isExam && Number(lanc?.valor || 0) <= 0) {
       if (!item) {
         toast.error('Não foi possível identificar o exame deste lançamento.');
         return;
       }
       try {
         await createAutoBilling({
           agendamentoId: item.ag.id,
           pacienteId: item.ag.paciente_id,
           pacienteNome: pac?.nome || 'Paciente',
           convenioId: pac?.convenio_id,
           tipoConsulta: item.ag.tipo,
           tipoExame: item.ag.observacoes,
           clinicaId: profile?.clinica_id,
         });
         let repairedQuery = (supabase as any).from('lancamentos')
           .select('*')
           .eq('id', lanc.id);
         if (profile?.clinica_id) repairedQuery = repairedQuery.eq('clinica_id', profile.clinica_id);
         const { data: repaired, error: repairedError } = await repairedQuery.maybeSingle();
         if (repairedError) throw repairedError;
         if (!repaired || Number(repaired.valor || 0) <= 0) {
           throw new Error('O exame ainda não possui um preço cadastrado.');
         }
         lancamentoSelecionado = repaired;
         queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
       } catch (error: any) {
         toast.error('Não foi possível abrir a cobrança do exame', {
           description: error?.message || 'Cadastre o preço do exame e tente novamente.',
         });
         return;
       }
     }

      const valorSelecionado = Number(lancamentoSelecionado?.valor || 0);
      if (!Number.isFinite(valorSelecionado) || valorSelecionado <= 0) {
        toast.error('Este atendimento não possui um preço válido.', {
          description: 'Configure o valor do serviço antes de cobrar o paciente.',
        });
        return;
      }

      navigate(`/recepcao/pagamentos/${encodeURIComponent(lancamentoSelecionado.id)}`, {
        state: { returnTo: `${location.pathname}${location.search}` },
      });
   }

    async function handleChamarBalcao(lanc: any, pac: any) {
      if (!profile?.clinica_id) {
        toast.error('Clínica não identificada. Atualize a sessão antes de chamar o paciente.');
        return;
      }
      setIsProcessing(true);
      try {
        // Gravar a chamada na fila: antes o chime e a voz tocavam SÓ na
        // máquina da recepção — o paciente na sala de espera não via nem
        // ouvia nada. Com status 'chamado' o Painel TV anuncia em tempo real
        // (chamado sem sala => "Recepção", que é exatamente o destino aqui).
        const agId = lanc?.agendamento_id;
        if (agId) {
          const fila = (filaItems as any[]).find(f => f.agendamento_id === agId);
          if (!fila) {
            queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
            toast.warning('O paciente não está na fila de atendimento.', { description: 'Atualize a recepção antes de chamá-lo ao balcão.' });
            return;
          }
          const chamada = await chamarPacienteNaFila({ filaId: fila.id, clinicaId: profile.clinica_id, versao: fila.updated_at });
          if (chamada === 'mudou') {
            queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
            toast.warning('A fila mudou antes da chamada.', { description: 'Outra pessoa pode ter chamado este paciente. A lista foi atualizada.' });
            return;
          }
          queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
        }

        // Play a chime sound
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.value = 0.3;
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
         } catch {
           console.warn('Não foi possível reproduzir o alerta sonoro.');
         }

        // Announce via TTS
        if ('speechSynthesis' in window) {
          const utter = new SpeechSynthesisUtterance(
            `${pac?.nome || 'Paciente'}, por favor dirija-se ao balcão para pagamento.`
          );
          utter.lang = 'pt-BR';
          utter.rate = 0.9;
          window.speechSynthesis.speak(utter);
        }

        toast.success(`${pac?.nome} chamado ao balcão!`, {
          description: agId ? 'Chamado no painel da sala de espera' : 'Aviso sonoro reproduzido na recepção',
          action: {
            label: 'Receber agora',
            onClick: () => openPagamento(lanc, pac),
          },
        });
      } catch (e) {
        toast.error('Erro ao chamar paciente', { description: mensagemDeErro(e) });
      } finally {
        setIsProcessing(false);
      }
    }

  function gerarComprovante(lanc: any, pac: any, forma: string, valorFinal: number, med?: any) {
    const formaLabel = FORMAS_PAGAMENTO.find(f => f.value === forma)?.label || forma;
    const agora = dataHoraDaClinica(new Date());
    printReceiptPdf({
      titulo: 'COMPROVANTE DE PAGAMENTO',
      dataHora: agora,
      docId: lanc.id?.slice(0, 8).toUpperCase(),
      paciente: pac?.nome || '—',
      cpf: pac?.cpf || '',
      medico: med?.nome || undefined,
      especialidade: med?.especialidade || undefined,
      descricao: lanc.descricao || 'Consulta',
      formaPagamento: formaLabel,
      valorOriginal: Number(lanc.valor || 0),
      desconto: desconto > 0 ? desconto : undefined,
      acrescimo: acrescimo > 0 ? acrescimo : undefined,
      valorFinal,
    });
  }

   async function handleConfirmarPagamento() {
    if (!formaPagamento || !selectedLancamento) {
      toast.error('Selecione a forma de pagamento');
      return;
    }

    // Validar desconto e acréscimo
    if (desconto < 0 || acrescimo < 0) {
      toast.error('Desconto e acréscimo devem ser positivos');
      return;
    }

    const valorBase = Number(selectedLancamento.valor || 0);
    if (!Number.isFinite(valorBase) || valorBase <= 0) {
      toast.error('Não é possível confirmar uma cobrança sem valor.');
      return;
    }
    if (desconto > valorBase) {
      toast.error(`Desconto não pode ser maior que o valor da consulta (${formatCurrency(valorBase)})`);
      return;
    }

    // Limite máximo de 50% de desconto
    if (desconto > valorBase * 0.5) {
      toast.error('Desconto máximo permitido é 50% do valor');
      return;
    }

    // Limite de acréscimo (máximo 30%)
    if (acrescimo > valorBase * 0.3) {
      toast.error('Acréscimo máximo permitido é 30% do valor');
      return;
    }

    // Pagamento dividido: as formas extras não podem somar mais que o devido,
    // senão a primeira ficaria com valor negativo.
    const jaPago = Number(selectedLancamento.valor_pago || 0);
    const totalAjustado = Number((valorBase - desconto + acrescimo).toFixed(2));
    if (totalAjustado + 0.009 < jaPago) {
      toast.error('O desconto deixa a conta menor que o valor já recebido.', {
        description: `Já foram recebidos ${formatCurrency(jaPago)}. Ajuste o desconto ou faça o estorno antes.`,
      });
      return;
    }
    const saldoReceber = calcularSaldoPagamento(valorBase, desconto, acrescimo, jaPago);
    if (saldoReceber <= 0) {
      toast.info('Esta cobrança já está quitada.');
      return;
    }
    const valorFinal = validarValorRecebido(valorReceberAgora, saldoReceber);
    if (valorFinal === null) {
      toast.error('Informe um valor maior que zero e até o saldo devedor.', {
        description: `Saldo atual: ${formatCurrency(saldoReceber)}.`,
      });
      return;
    }
    if (somaDasExtras(formasExtras) > valorFinal) {
      toast.error('As formas de pagamento somam mais que o valor recebido agora.', {
        description: `Informado ${formatCurrency(somaDasExtras(formasExtras))} para um recebimento de ${formatCurrency(valorFinal)}.`,
      });
      return;
    }
    if (formasExtras.some(f => !f.forma || Number(f.valor) <= 0)) {
      toast.error('Preencha forma e valor em cada linha do pagamento dividido.');
      return;
    }

    if (!(await checkCaixaAberto())) return;

    setIsProcessing(true);
    try {
      // `valor` é o que foi FATURADO e não pode ser sobrescrito pelo que foi
      // recebido. Antes esta tela gravava `valor: valorFinal`: uma consulta de
      // R$ 200 recebida com R$ 20 de desconto passava a constar como uma
      // consulta que sempre custou R$ 180, e o desconto concedido sumia — sem
      // como auditar quem deu, quanto, nem para quem.
      //
      // A tela de Contas a Receber já gravava do jeito certo. O mesmo evento de
      // negócio era registrado de duas formas conforme a tela usada, e o
      // relatório mudava de número por causa disso.
      // Uma chamada só, no banco, em transação: grava os pagamentos, aplica
      // desconto e acréscimo, recalcula o saldo e avança o agendamento. Antes
      // eram passos soltos aqui no navegador — se a rede caísse no meio, o
      // dinheiro entrava na gaveta e o sistema não sabia.
      //
      // A chave de idempotência faz a segunda chamada devolver o estado atual
      // em vez de cobrar de novo.
      const pagamentos = montarPagamentos(formaPagamento, formasExtras, valorFinal);
      const { data: resultado, error } = await (supabase as any).rpc('registrar_pagamento', {
        p_lancamento_id: selectedLancamento.id,
        p_pagamentos: pagamentos,
        p_desconto: Number(desconto.toFixed(2)),
        p_acrescimo: Number(acrescimo.toFixed(2)),
        p_chave_idempotencia: chaveIdempotencia || null,
        p_observacoes: sanitizeText(obsPagamento) || null,
      });
      if (error) throw error;
      paymentCompleted.current = true;

      const pagamentoRepetido = Boolean(resultado?.repetido);
      if (pagamentoRepetido) {
        toast.info('Este pagamento já havia sido registrado.', {
          description: 'Nada foi cobrado de novo.',
        });
      }

      // Send payment receipt to patient
      let falhaNoRecibo: string | null = null;
      if (!pagamentoRepetido) {
        try {
          const { data: recibo, error: receiptError } = await supabase.functions.invoke('payment-receipt', {
            body: { lancamento_id: selectedLancamento.id, chave_idempotencia: chaveIdempotencia }
          });
          if (receiptError) {
            falhaNoRecibo = 'O pagamento foi confirmado, mas não foi possível enviar o recibo por e-mail.';
            if (import.meta.env.DEV) console.warn('Comprovante não enviado:', receiptError.message);
          } else if (['failed', 'not_configured'].includes(recibo?.emailStatus)) {
            falhaNoRecibo = recibo?.message || 'O pagamento foi confirmado, mas o recibo não foi enviado por e-mail.';
          }
        } catch (erroRecibo) {
          falhaNoRecibo = 'O pagamento foi confirmado, mas não foi possível confirmar o envio do recibo por e-mail.';
          if (import.meta.env.DEV) console.log('Payment receipt notification skipped:', erroRecibo);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos', 'receita'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      // Card "Recebido hoje" do painel: sem isto ficava em R$ 0,00 até recarregar.
      queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] });
      if (!pagamentoRepetido) toast.success(`Pagamento de ${valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} confirmado!`);
      if (falhaNoRecibo) {
        toast.warning('Pagamento confirmado; recibo não enviado', {
          description: falhaNoRecibo,
          duration: 10000,
        });
      }

      // Emit receipt automatically - find medico from enriched data
      if (!pagamentoRepetido) {
        const matchedItem = enriched.find(e => e.lanc?.id === selectedLancamento.id);
        const rotulos = Object.fromEntries(FORMAS_PAGAMENTO.map((forma) => [forma.value, forma.label]));
        gerarComprovante(selectedLancamento, selectedPacienteBalcao, resumirPagamentos(pagamentos, rotulos), valorFinal, matchedItem?.med);
      }
      navigate(returnTo, { replace: true });
    } catch (err: any) {
      toast.error('Não foi possível confirmar o pagamento', { description: mensagemDeErro(err) });
    }
    setIsProcessing(false);
  }

  function handleConcluir(agId: string, filaId: string) {
    setPendingAction({ type: 'concluir', agId, filaId });
    setConfirmDialogOpen(true);
  }

  async function executarConcluir() {
    if (!pendingAction || pendingAction.type !== 'concluir') return;
    const { agId, filaId } = pendingAction;

    setIsProcessing(true);
    try {
      const result = await atomicConcludeQueue(agId!, filaId!);
      if (!result.success) throw new Error(result.message);

      await queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      await queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      toast.success('Atendimento concluído com sucesso!');
      setConfirmDialogOpen(false);
      setPendingAction(null);
    } catch (err: any) {
      console.error('Erro ao concluir:', err);
      toast.error('Não foi possível concluir o atendimento', { description: mensagemDeErro(err) });
    }
    setIsProcessing(false);
  }

  async function handleEncaminharTriagem(agId: string, pacienteId: string) {
    if (!profile?.clinica_id) {
      toast.error('Não foi possível identificar a clínica para abrir a triagem. Atualize a sessão e tente novamente.');
      return;
    }
    setIsProcessing(true);
    try {
      // Check if triagem already exists for this agendamento
      const { data: existing, error: existingError } = await supabase
        .from('triagens')
        .select('id')
        .eq('clinica_id', profile.clinica_id)
        .eq('agendamento_id', agId)
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        toast.info('Triagem já registrada para este agendamento');
        navigate(`/triagem?${new URLSearchParams({ buscarPaciente: pacienteId }).toString()}`);
        return;
      }
      navigate(`/triagem/nova?${new URLSearchParams({ origem: 'recepcao', paciente: pacienteId, agendamento: agId }).toString()}`);
    } catch (e) {
      toast.error('Erro ao encaminhar', { description: mensagemDeErro(e) });
    } finally {
      setIsProcessing(false);
    }
  }

  /**
   * Encaixe: cria o agendamento de hoje, agora, e faz o check-in na sequência
   * (fila + cobrança) pelo mesmo caminho do agendado — sem navegar até a
   * Agenda. O caixa só é exigido quando a equipe for receber o pagamento.
   */
  async function handleEncaixe() {
    if (encaixeSubmitLock.current) return;
    if (!encaixePacienteId || !encaixeMedicoId || !encaixeTipo) {
      toast.error('Selecione paciente, médico e tipo de consulta.');
      return;
    }
    if (carregandoPacienteEncaixe) {
      toast.info('Aguarde o carregamento dos dados do paciente.');
      return;
    }
    if (erroPacienteEncaixe) {
      toast.error('Não foi possível confirmar os dados do paciente.', {
        description: 'Tente carregar o paciente novamente antes de criar o encaixe.',
      });
      return;
    }
    if (!pacienteEncaixe) {
      toast.error('Paciente não encontrado', {
        description: 'Selecione novamente um paciente ativo da clínica.',
      });
      return;
    }
    if (!profile?.clinica_id) {
      toast.error('Não foi possível identificar a clínica deste usuário.');
      return;
    }
    if (medicosQuery.isError || tiposConsultaQuery.isError) {
      toast.error('Não foi possível carregar os dados para o encaixe.', {
        description: 'Atualize médicos e tipos de consulta antes de tentar novamente.',
      });
      return;
    }
    encaixeSubmitLock.current = true;
    setSalvandoEncaixe(true);
    try {
      // A lista do diálogo pode ter ficado aberta enquanto o profissional era
      // desativado em outra tela. Reconfirme no banco antes de criar o encaixe.
      const { data: medicoAtivo, error: erroMedico } = await supabase
        .from('medicos')
        .select('id')
        .eq('id', encaixeMedicoId)
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true)
        .maybeSingle();
      if (erroMedico) throw erroMedico;
      if (!medicoAtivo) throw new Error('Este médico foi desativado. Atualize a lista e selecione um profissional ativo.');

      setSugestaoEncaixe(null);
      const tipoEscolhido = tiposConsulta.find((tipo: any) => tipo.nome === encaixeTipo);
      const duracao = Number(tipoEscolhido?.duracao_minutos) > 0 ? Number(tipoEscolhido.duracao_minutos) : 30;
      const agoraMin = minutosAgoraSaoPaulo();
      const inicioMin = minutosDaHora(encaixeHora || horaDaClinica(new Date()));
      if (inicioMin === null) throw new Error('Informe um horário de início válido.');
      if (inicioMin < agoraMin - TOLERANCIA_ENCAIXE_PASSADO_MIN) {
        throw new Error('O horário do encaixe já passou. Use o horário atual ou um horário mais tarde.');
      }
      const fimMin = inicioMin + duracao;
      if (fimMin >= 24 * 60) {
        throw new Error('O encaixe precisa terminar antes da meia-noite.');
      }
      const horaInicioEncaixe = horaDeMinutos(inicioMin);
      const horaFimEncaixe = horaDeMinutos(fimMin);

      const [{ data: conflitos, error: erroConflitos }, { data: bloqueios, error: erroBloqueios }] = await Promise.all([
        supabase.from('agendamentos')
          .select('id, hora_inicio, hora_fim, status')
          .eq('clinica_id', profile.clinica_id)
          .eq('medico_id', encaixeMedicoId)
          .eq('data', today),
        (supabase.from('bloqueios_agenda' as any)
          .select('id, data_inicio, data_fim, hora_inicio, hora_fim, dia_inteiro, motivo, tipo')
          .eq('clinica_id', profile.clinica_id)
          .eq('medico_id', encaixeMedicoId)
          .lte('data_inicio', today)
          .gte('data_fim', today) as any),
      ]);
      if (erroConflitos) throw erroConflitos;
      if (erroBloqueios) throw erroBloqueios;

      const conflito = (conflitos || []).find((ag: any) => {
        if (ag.status === 'cancelado' || ag.status === 'faltou') return false;
        const inicioExistente = minutosDaHora(ag.hora_inicio);
        const fimExistente = minutosDaHora(ag.hora_fim) ?? (inicioExistente === null ? null : inicioExistente + 30);
        return inicioExistente !== null && fimExistente !== null && inicioExistente < fimMin && fimExistente > inicioMin;
      });
      const bloqueio = (bloqueios || []).find((item: any) => {
        if (item.dia_inteiro) return true;
        const inicioBloqueio = minutosDaHora(item.hora_inicio);
        const fimBloqueio = minutosDaHora(item.hora_fim);
        return inicioBloqueio !== null && fimBloqueio !== null && inicioBloqueio < fimMin && fimBloqueio > inicioMin;
      });

      if (conflito || bloqueio) {
        // Sugere o próximo horário livre do mesmo médico hoje, a partir do
        // horário pedido, em vez de mandar trocar de profissional.
        const vaga = proximaVagaLivre({
          hoje: today,
          agoraMinutos: Math.max(inicioMin, agoraMin) - 1,
          duracaoMinutos: duracao,
          jornada: [{ dia_semana: new Date(`${today}T12:00:00Z`).getUTCDay(), hora_inicio: '00:00', hora_fim: '23:59' }],
          agendamentos: (conflitos || []).map((ag: any) => ({ ...ag, data: today })),
          bloqueios: (bloqueios || []).map((b: any) => ({ ...b, data_inicio: b.data_inicio ?? today, data_fim: b.data_fim ?? today })),
          dias: 1,
        });
        const sugestao = vaga?.data === today ? vaga.hora_inicio : null;
        setSugestaoEncaixe(sugestao);
        const motivo = conflito
          ? 'Este médico já tem uma consulta neste horário.'
          : `Este médico está bloqueado neste horário${bloqueio?.motivo ? `: ${bloqueio.motivo}.` : bloqueio?.tipo ? ` (${bloqueio.tipo}).` : '.'}`;
        throw new Error(sugestao
          ? `${motivo} Próximo horário livre hoje: ${sugestao}.`
          : `${motivo} Não há outro horário livre hoje para este médico; escolha outro profissional.`);
      }

      const { data: novo, error } = await supabase
        .from('agendamentos')
        .insert({
          paciente_id: encaixePacienteId,
          medico_id: encaixeMedicoId,
          tipo: encaixeTipo,
          data: today,
          hora_inicio: horaInicioEncaixe,
          hora_fim: horaFimEncaixe,
          status: 'agendado',
          clinica_id: profile?.clinica_id,
        })
        .select('id, paciente_id, medico_id, tipo, clinica_id, data, status')
        .single();
      if (error) throw error;

      const pac = pacienteEncaixe;
      // A consulta já está persistida; mantê-la visível permite repetir o
      // check-in se a criação da fila ou da cobrança falhar nesta etapa.
      await queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      encaixeCompleted.current = true;
      setEncaixePacienteId('');
      setEncaixeMedicoId('');
      setEncaixeTipo('');
      setEncaixeHora('');
      setSugestaoEncaixe(null);

      // O check-in (fila + cobrança) segue o mesmo caminho do agendado, com o
      // item passado na mão porque a lista ainda não tem o agendamento novo.
      await handleCheckin(novo.id, { ag: novo, pac, med: null });
      navigate(returnTo, { replace: true });
    } catch (e) {
      const mensagem = mensagemDeErro(e);
      toast.error('Não foi possível criar o encaixe', {
        description: (e as any)?.code === '23P01' || mensagem.includes('agendamentos_sem_sobreposicao')
          ? 'O horário acabou de ser ocupado. Atualize a agenda e tente outro horário.'
          : mensagem,
      });
    } finally {
      encaixeSubmitLock.current = false;
      setSalvandoEncaixe(false);
    }
  }

  if (task === 'walk-in') {
    const formDirty = Boolean(encaixePacienteId || encaixeMedicoId || encaixeTipo || encaixeHora);
    return (
      <div className="space-y-6 pb-8">
        <UnsavedChangesGuard dirty={formDirty} busy={salvandoEncaixe || isProcessing} completed={encaixeCompleted} />
        <PageHeader
          title="Encaixe sem agendamento"
          description={`Atendimento presencial para hoje, com início previsto às ${encaixeHora || horaDaClinica(new Date(now))}.`}
          icon={<UserPlus />}
          actions={<Button type="button" variant="outline" className="rounded-full" onClick={() => navigate(returnTo)}>Voltar para a recepção</Button>}
        />

        {medicosQuery.isError && <ErrorState compact title="Não foi possível carregar os médicos" description="A criação fica bloqueada até confirmar um profissional ativo." error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />}
        {tiposConsultaQuery.isError && <ErrorState compact title="Não foi possível carregar os tipos de consulta" description="A criação fica bloqueada até confirmar o tipo e a duração do atendimento." error={tiposConsultaQuery.error} onRetry={() => void tiposConsultaQuery.refetch()} />}

        <form onSubmit={event => { event.preventDefault(); void handleEncaixe(); }} className="w-full space-y-5">
          <section aria-labelledby="recepcao-walk-in-heading" className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
            <div className="space-y-1">
              <h2 id="recepcao-walk-in-heading" className="text-base font-semibold text-foreground">Identificação e encaminhamento</h2>
              <p className="text-sm text-muted-foreground">Confirme a pessoa, o profissional e o tipo antes de criar o horário e iniciar o check-in.</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                <Label htmlFor="recepcao-encaixe-paciente">Paciente</Label>
                <PacienteCombobox id="recepcao-encaixe-paciente" value={encaixePacienteId} onChange={id => setEncaixePacienteId(id)} />
                {!encaixePacienteId && <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={abrirCadastroPaciente}><UserPlus className="h-3.5 w-3.5" />Cadastrar novo paciente</Button>}
                {encaixePacienteId && carregandoPacienteEncaixe && <p role="status" className="text-xs text-muted-foreground">Carregando os dados do paciente…</p>}
                {encaixePacienteId && erroPacienteEncaixe && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p role="alert" className="text-xs text-destructive">Não foi possível confirmar os dados do paciente.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void recarregarPacienteEncaixe()} disabled={carregandoPacienteEncaixe}>Tentar novamente</Button>
                  </div>
                )}
                {encaixePacienteId && !carregandoPacienteEncaixe && !erroPacienteEncaixe && !pacienteEncaixe && <p role="alert" className="text-xs text-destructive">Paciente não encontrado nesta clínica. Selecione novamente.</p>}
                <p className="text-xs text-muted-foreground">Não encontrou? Cadastre em Pacientes primeiro e volte para criar o encaixe.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recepcao-encaixe-medico">Médico</Label>
                <Select value={encaixeMedicoId} onValueChange={value => { setEncaixeMedicoId(value); setSugestaoEncaixe(null); }} disabled={medicosQuery.isLoading || medicosQuery.isError}>
                  <SelectTrigger id="recepcao-encaixe-medico" aria-label="Médico"><SelectValue placeholder="Selecionar médico ativo..." /></SelectTrigger>
                  <SelectContent>
                    {(medicos as any[]).filter(m => m.ativo !== false).map(m => <SelectItem key={m.id} value={m.id}>{m.nome || m.crm}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!medicosQuery.isLoading && !medicosQuery.isError && !(medicos as any[]).some(m => m.ativo !== false) && <p className="text-xs text-muted-foreground">Nenhum médico ativo disponível.</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recepcao-encaixe-tipo">Tipo de consulta</Label>
                <Select value={encaixeTipo} onValueChange={setEncaixeTipo} disabled={tiposConsultaQuery.isLoading || tiposConsultaQuery.isError}>
                  <SelectTrigger id="recepcao-encaixe-tipo" aria-label="Tipo de consulta"><SelectValue placeholder="Selecionar tipo..." /></SelectTrigger>
                  <SelectContent>
                    {(tiposConsulta as any[]).map(tipo => <SelectItem key={tipo.id} value={tipo.nome}>{tipo.nome} · {Number(tipo.duracao_minutos) > 0 ? `${tipo.duracao_minutos} min` : '30 min'}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!tiposConsultaQuery.isLoading && !tiposConsultaQuery.isError && !(tiposConsulta as any[]).length && <p className="text-xs text-muted-foreground">Nenhum tipo de consulta ativo disponível.</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recepcao-encaixe-hora">Horário de início</Label>
                <Input
                  id="recepcao-encaixe-hora"
                  type="time"
                  step={300}
                  value={encaixeHora || horaDaClinica(new Date(now))}
                  onChange={event => { setEncaixeHora(event.target.value); setSugestaoEncaixe(null); }}
                />
                <p className="text-xs text-muted-foreground">{encaixeHora ? 'Horário escolhido para hoje.' : 'Agora. Altere se o atendimento for mais tarde.'}</p>
                {sugestaoEncaixe && (
                  <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
                    <span>Próximo horário livre deste médico: <strong>{sugestaoEncaixe}</strong></span>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setEncaixeHora(sugestaoEncaixe); setSugestaoEncaixe(null); }}>Usar {sugestaoEncaixe}</Button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="rounded-full" disabled={salvandoEncaixe || isProcessing} onClick={() => navigate(returnTo)}>Cancelar</Button>
            <Button type="submit" disabled={salvandoEncaixe || isProcessing || carregandoPacienteEncaixe || erroPacienteEncaixe || !pacienteEncaixe || medicosQuery.isLoading || tiposConsultaQuery.isLoading || medicosQuery.isError || tiposConsultaQuery.isError || !(medicos as any[]).some(m => m.id === encaixeMedicoId && m.ativo !== false) || !(tiposConsulta as any[]).some(tipo => tipo.nome === encaixeTipo)} className="gap-2 rounded-full">
              {salvandoEncaixe || isProcessing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <UserCheck aria-hidden="true" className="h-4 w-4" />}
              Criar e fazer check-in
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────
  if (task === 'payment') {
    const lancamento = selectedLancamento?.id === lancamentoId ? selectedLancamento : null;
    const paciente = selectedPacienteBalcao;
    const valorBase = Number(lancamento?.valor || 0);
    const saldo = lancamento ? calcularSaldoPagamento(valorBase, desconto, acrescimo, Number(lancamento.valor_pago || 0)) : 0;
    const valorValido = lancamento ? validarValorRecebido(valorReceberAgora, saldo) : null;
    const pacienteNaoLocalizado = Boolean(pagamentoLancamentoQuery.data?.paciente_id && pacientePagamentoQuery.isSuccess && !pacientePagamentoQuery.data);

    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        <UnsavedChangesGuard dirty={paymentDirty} busy={isProcessing} completed={paymentCompleted} />
        <PageHeader title="Receber pagamento" description={paciente?.nome ? `Cobrança de ${paciente.nome}` : 'Registre o recebimento da cobrança selecionada.'} icon={<Receipt />} actions={<Button type="button" variant="outline" onClick={() => navigate(returnTo)}>Voltar para a recepção</Button>} />
        {pagamentoLancamentoQuery.isError && <ErrorState compact title="Não foi possível carregar esta cobrança" error={pagamentoLancamentoQuery.error} onRetry={() => void pagamentoLancamentoQuery.refetch()} />}
        {pacientePagamentoQuery.isError && pagamentoLancamentoQuery.data?.paciente_id && <ErrorState compact title="Não foi possível confirmar o paciente desta cobrança" error={pacientePagamentoQuery.error} onRetry={() => void pacientePagamentoQuery.refetch()} />}
        {pacienteNaoLocalizado && <ErrorState compact title="Paciente não encontrado" description="A cobrança está vinculada a um cadastro que não está disponível nesta clínica. Confirme o vínculo antes de receber." />}
        {pagamentoLancamentoQuery.isSuccess && !pagamentoLancamentoQuery.data && <ErrorState compact title="Cobrança não encontrada" description="Ela pode ter sido removida ou pertencer a outra clínica." />}
        {(pagamentoLancamentoQuery.isLoading || (pagamentoLancamentoQuery.data?.paciente_id && pacientePagamentoQuery.isLoading) || (pagamentoLancamentoQuery.data && !lancamento && !pacienteNaoLocalizado && !pacientePagamentoQuery.isError)) && <p role="status" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Carregando os dados da cobrança e do paciente…</p>}

        {lancamento && !pacienteNaoLocalizado && Number.isFinite(valorBase) && valorBase > 0 && saldo > 0 && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Card className="border-border">
              <CardHeader className="border-b border-border px-5 py-4"><CardTitle className="text-base">Resumo da cobrança</CardTitle></CardHeader>
              <CardContent className="space-y-5 p-5">
                <div>
                  <p className="font-medium text-foreground">{paciente?.nome || 'Paciente não vinculado'}</p>
                  {paciente?.cpf && <p className="mt-1 text-sm text-muted-foreground">CPF {paciente.cpf}</p>}
                  <p className="mt-3 text-sm text-muted-foreground">{lancamento.descricao || 'Atendimento'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Cobrança {String(lancamento.id).slice(0, 8).toUpperCase()}</p>
                </div>
                <dl className="space-y-3 border-t border-border pt-4 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Valor original</dt><dd className="font-medium tabular-nums">{formatCurrency(valorBase)}</dd></div>
                  {desconto > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Desconto</dt><dd className="tabular-nums">− {formatCurrency(desconto)}</dd></div>}
                  {acrescimo > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Acréscimo</dt><dd className="tabular-nums">+ {formatCurrency(acrescimo)}</dd></div>}
                  {Number(lancamento.valor_pago || 0) > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Já recebido</dt><dd className="tabular-nums">{formatCurrency(Number(lancamento.valor_pago || 0))}</dd></div>}
                  <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3"><dt className="font-semibold">Saldo a receber</dt><dd className="text-xl font-semibold tabular-nums text-primary">{formatCurrency(saldo)}</dd></div>
                </dl>
                {!lancamento.paciente_id && <p className="border-l-2 border-warning pl-3 text-xs text-muted-foreground">Esta cobrança não tem paciente vinculado. Confira a descrição antes de receber.</p>}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="border-b border-border px-5 py-4"><CardTitle className="text-base">Dados do recebimento</CardTitle></CardHeader>
              <CardContent className="space-y-5 p-5">
                <div role="group" aria-labelledby="forma-pagamento-label" className="space-y-2">
                  <Label id="forma-pagamento-label">Forma de pagamento</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {FORMAS_PAGAMENTO.map(fp => <button type="button" key={fp.value} onClick={() => { setPaymentDirty(true); setFormaPagamento(fp.value); }} aria-pressed={formaPagamento === fp.value} className={cn('flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', formaPagamento === fp.value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50')}><fp.icon aria-hidden="true" className={cn('h-5 w-5', formaPagamento === fp.value ? 'text-primary' : fp.color)} />{fp.label}</button>)}
                  </div>
                </div>
                <div className="space-y-2"><Label htmlFor="valor-recebido-agora">Valor recebido agora (R$)</Label><Input id="valor-recebido-agora" type="number" min="0.01" max={saldo} step="0.01" value={valorReceberAgora} onChange={event => { setPaymentDirty(true); setValorReceberAgora(event.target.value); }} aria-describedby="saldo-apos-recebimento" /><p id="saldo-apos-recebimento" aria-live="polite" className="text-xs text-muted-foreground">{valorValido === null ? `Saldo atual: ${formatCurrency(saldo)}.` : `Ficará pendente: ${formatCurrency(saldo - valorValido)}.`}</p></div>
                {formasExtras.length > 0 && <div role="group" aria-labelledby="forma-pagamento-adicional-label" className="space-y-2"><Label id="forma-pagamento-adicional-label">Dividir com outra forma</Label>{formasExtras.map((extra, i) => <div key={i} className="flex items-center gap-2"><Select value={extra.forma} onValueChange={value => { setPaymentDirty(true); setFormasExtras(items => items.map((item, index) => index === i ? { ...item, forma: value } : item)); }}><SelectTrigger aria-label={`Forma de pagamento adicional ${i + 1}`} className="h-10 flex-1"><SelectValue placeholder="Forma" /></SelectTrigger><SelectContent>{FORMAS_PAGAMENTO.filter(fp => fp.value !== formaPagamento).map(fp => <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>)}</SelectContent></Select><Input type="number" min={0} step="0.01" placeholder="R$" aria-label={`Valor da forma de pagamento adicional ${i + 1}`} className="h-10 w-28" value={extra.valor || ''} onChange={event => { setPaymentDirty(true); setFormasExtras(items => items.map((item, index) => index === i ? { ...item, valor: Number(event.target.value) || 0 } : item)); }} /><Button type="button" variant="ghost" size="icon" aria-label={`Remover forma de pagamento adicional ${i + 1}`} className="h-10 w-10 shrink-0 text-destructive" onClick={() => { setPaymentDirty(true); setFormasExtras(items => items.filter((_, index) => index !== i)); }}><XCircle className="h-4 w-4" /></Button></div>)}</div>}
                {formaPagamento && <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => { setPaymentDirty(true); setFormasExtras(items => [...items, { forma: '', valor: 0 }]); }}><DollarSign className="h-4 w-4" />Dividir com outra forma de pagamento</Button>}
                <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="recepcao-desconto">Desconto (R$)</Label><Input id="recepcao-desconto" type="number" min={0} step="0.01" value={desconto || ''} onChange={event => { setPaymentDirty(true); setDesconto(Number(event.target.value) || 0); }} /></div><div className="space-y-2"><Label htmlFor="recepcao-acrescimo">Acréscimo (R$)</Label><Input id="recepcao-acrescimo" type="number" min={0} step="0.01" value={acrescimo || ''} onChange={event => { setPaymentDirty(true); setAcrescimo(Number(event.target.value) || 0); }} /></div></div>
                <div className="space-y-2"><Label htmlFor="recepcao-observacoes-pagamento">Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label><Textarea id="recepcao-observacoes-pagamento" placeholder="Informação complementar sobre o recebimento" value={obsPagamento} onChange={event => { setPaymentDirty(true); setObsPagamento(event.target.value); }} rows={3} /></div>
                <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={isProcessing} onClick={() => navigate(returnTo)}>Cancelar</Button><Button type="button" className="gap-2" disabled={!formaPagamento || isProcessing || !lancamento || valorValido === null || (Boolean(lancamento.paciente_id) && !paciente)} onClick={() => void handleConfirmarPagamento()}>{isProcessing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}Confirmar pagamento</Button></div>
                {!formaPagamento && <p role="status" className="text-right text-xs text-muted-foreground">Escolha a forma de pagamento para confirmar.</p>}
              </CardContent>
            </Card>
          </div>
        )}
        {lancamento && (!Number.isFinite(valorBase) || valorBase <= 0 || saldo <= 0) && <ErrorState compact title="Esta cobrança não possui saldo para receber" description="Atualize a recepção para consultar o estado mais recente do lançamento." />}
      </div>
    );
  }

  if (agendaHojeQuery.isError) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Painel de Recepção"
          description={`${format(parseDateOnly(today)!, "EEEE, d 'de' MMMM", { locale: ptBR })} · Fluxo completo do paciente`}
          icon={<Users />}
        />
        <AtendimentosEmAberto onFinalizar={agendamentoId => abrirFinalizacao(agendamentoId, 'atendimentos-abertos')} />
        <ErrorState compact title="Não foi possível carregar a agenda de hoje" description="A agenda de hoje não carregou. Tente novamente." error={agendaHojeQuery.error} onRetry={() => void agendaHojeQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="Recepção"
        description={`Acompanhe o fluxo de pacientes de hoje · ${format(parseDateOnly(today)!, "EEEE, d 'de' MMMM", { locale: ptBR })}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/agenda')}>
              <CalendarDays aria-hidden="true" data-icon="inline-start" />Ver agenda do dia
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="Mais ações da recepção"><MoreHorizontal aria-hidden="true" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={registrarPendencia}><ClipboardCheck aria-hidden="true" data-icon="inline-start" />Registrar pendência</DropdownMenuItem>
                <DropdownMenuItem onSelect={abrirPassagemDeTurno}><ClipboardList aria-hidden="true" data-icon="inline-start" />Passagem de turno</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      />

      <div role="group" aria-label="Resumo da recepção" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Agendamentos hoje', value: enriched.length, icon: CalendarDays, tone: 'text-primary' },
          { label: 'Atendidos', value: stats.concluido, icon: CheckCircle2, tone: 'text-success' },
          { label: 'Em atendimento', value: stats.emConsulta, icon: Stethoscope, tone: 'text-info' },
          { label: 'Aguardando check-in', value: stats.aguardando, icon: Clock, tone: stats.aguardando > 0 ? 'text-warning-foreground' : 'text-muted-foreground' },
        ].map(metric => (
          <Card key={metric.label} className="rounded-lg border-border/80 shadow-none">
            <CardContent className="flex min-h-[3.5rem] items-center justify-between gap-3 px-3 py-2 sm:min-h-[4.75rem] sm:p-4">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground">{metric.label}</p>
                <p className={cn('mt-1 text-xl font-semibold tabular-nums leading-none sm:text-2xl', metric.tone)}>{metric.value}</p>
              </div>
              <metric.icon aria-hidden="true" className={cn('size-5 shrink-0', metric.tone)} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Tabs */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex min-w-0 gap-2 lg:flex-1">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Buscar paciente ou médico... ( / )"
              aria-label="Buscar paciente ou médico na recepção"
              aria-keyshortcuts="/ Escape"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 rounded-full pl-9 focus-visible:ring-primary"
            />
          </div>
          <Button
            size="sm" className="h-10 shrink-0 gap-1.5 rounded-full bg-primary px-3 text-primary-foreground shadow-sm hover:bg-primary/90 sm:px-4"
            onClick={abrirEncaixe}
            aria-label="Encaixe sem agendamento"
          >
            <UserPlus className="h-4 w-4" />
            <span className="sm:hidden">Encaixe</span>
            <span className="hidden sm:inline">Encaixe sem agendamento</span>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap lg:flex-wrap">
          <Select value={medicoFiltro} onValueChange={setMedicoFiltro}>
            <SelectTrigger aria-label="Filtrar por médico" className="h-10 min-w-0 flex-1 rounded-full sm:w-[190px] sm:flex-none">
              <Stethoscope className="mr-1.5 hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
              <SelectValue placeholder="Todos os médicos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os médicos</SelectItem>
              {(medicos as any[]).map(m => (
                <SelectItem key={m.id} value={m.id}>{m.nome || m.crm}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as 'horario' | 'espera')}>
            <SelectTrigger aria-label="Ordenar pacientes" className="h-10 min-w-0 flex-1 rounded-full sm:w-[170px] sm:flex-none">
              <ArrowUpDown className="mr-1.5 hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horario">Por horário</SelectItem>
              <SelectItem value="espera">Por tempo de espera</SelectItem>
            </SelectContent>
          </Select>
          {esperaMediaMin !== null && (
            <span
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold',
                esperaMediaMin >= 30 ? 'border-destructive/30 bg-destructive/5 text-destructive' : esperaMediaMin >= 15 ? 'border-warning/30 bg-warning/5 text-warning-foreground' : 'border-success/30 bg-success/5 text-success',
              )}
              title="Tempo médio desde a chegada de quem ainda não entrou"
            >
              <Hourglass className="h-3.5 w-3.5" /> Espera média {esperaMediaMin} min
            </span>
          )}
          <div role="group" aria-label="Modo de visualização" className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-border bg-card p-1">
            <Button type="button" size="sm" variant={viewMode === 'fluxo' ? 'default' : 'ghost'} aria-pressed={viewMode === 'fluxo'} onClick={() => setViewMode('fluxo')} title="Fluxo" className="h-8 rounded-full px-2.5 2xl:px-3">
              <LayoutGrid aria-hidden="true" data-icon="inline-start" /><span className="sr-only 2xl:not-sr-only">Fluxo</span>
            </Button>
            <Button type="button" size="sm" variant={viewMode === 'lista' ? 'default' : 'ghost'} aria-pressed={viewMode === 'lista'} onClick={() => setViewMode('lista')} title="Lista" className="h-8 rounded-full px-2.5 2xl:px-3">
              <List aria-hidden="true" data-icon="inline-start" /><span className="sr-only 2xl:not-sr-only">Lista</span>
            </Button>
            <Button type="button" size="sm" variant={viewMode === 'linha' ? 'default' : 'ghost'} aria-pressed={viewMode === 'linha'} onClick={() => setViewMode('linha')} title="Linha do tempo" className="h-8 rounded-full px-2.5 2xl:px-3">
              <CalendarClock aria-hidden="true" data-icon="inline-start" /><span className="sr-only 2xl:not-sr-only">Linha do tempo</span>
            </Button>
          </div>
        </div>
      </motion.div>

      <section aria-label="Fluxo da recepção" className="space-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div role="group" aria-label="Filtrar por etapa do atendimento" className="hidden min-w-0 overflow-x-auto sm:flex rounded-lg border border-border/80 bg-card">
            {workflowStages.map((stage, index) => (
              <Button key={stage.id} type="button" variant="ghost" aria-pressed={activeTab === stage.id} onClick={() => setActiveTab(stage.id)} className={cn('relative h-auto min-h-11 min-w-[150px] flex-1 justify-between gap-2 rounded-none border-r border-border/70 px-3 py-1.5 text-left last:border-r-0 sm:min-h-[3.75rem] sm:min-w-[190px] sm:py-2', activeTab === stage.id && 'bg-primary/5 text-primary hover:bg-primary/10')}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border sm:size-8', activeTab === stage.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground')}>
                    <stage.icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold">{stage.title}</span><span className="hidden truncate text-[10px] text-muted-foreground sm:block">{stage.subtitle}</span></span>
                </span>
                <Badge variant={activeTab === stage.id ? 'default' : 'outline'} className="shrink-0 tabular-nums">{stage.count}</Badge>
                {index < workflowStages.length - 1 && <ChevronRight aria-hidden="true" className="absolute -right-2 top-1/2 z-10 size-3 -translate-y-1/2 text-muted-foreground/50" />}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant={activeTab === 'todos' ? 'secondary' : 'ghost'} size="sm" aria-pressed={activeTab === 'todos'} onClick={() => setActiveTab('todos')} className="h-8 gap-1.5 px-2 text-xs"><LayoutGrid aria-hidden="true" className="size-3.5" />Todas as etapas ({enriched.length})</Button>
            <Button type="button" variant={activeTab === 'faltou' ? 'destructive' : 'ghost'} size="sm" aria-pressed={activeTab === 'faltou'} onClick={() => setActiveTab('faltou')} className="h-8 gap-1.5 px-2 text-xs"><XCircle aria-hidden="true" className="size-3.5" />Não compareceu ({stats.faltou})</Button>
          </div>
        </div>

        <div className="mt-0">
          {podeRegistrarTriagem && triagensRegistradasQuery.isError && (
            <ErrorState
              compact
              title="Não foi possível confirmar quais pacientes já foram triados"
              description="O atalho de triagem fica oculto até a lista ser atualizada. Check-in e atendimento continuam disponíveis."
              error={triagensRegistradasQuery.error}
              onRetry={() => void triagensRegistradasQuery.refetch()}
            />
          )}
          {agendaHojeQuery.isError ? (
            <ErrorState compact title="Não foi possível carregar a agenda de hoje" description="A agenda de hoje não carregou. Tente novamente." error={agendaHojeQuery.error} onRetry={() => void agendaHojeQuery.refetch()} />
          ) : filaRecepcaoQuery.isError ? (
            <ErrorState title="Não foi possível carregar a fila da recepção" description="O fluxo foi pausado para evitar registrar check-in ou pagamento com o estado errado." error={filaRecepcaoQuery.error} onRetry={() => void filaRecepcaoQuery.refetch()} />
          ) : lancamentosErro ? (
            <ErrorState title="Não foi possível carregar os lançamentos do dia" description="A recepção não consegue confirmar cobranças com segurança. Atualize antes de registrar pagamentos ou concluir o fluxo." error={erroLancamentos} onRetry={() => void queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] })} />
          ) : loadingAg || filaRecepcaoQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-4">
                <ActionableEmptyState
                  title={search.trim()
                    ? 'Nenhum paciente encontrado'
                    : activeTab === 'todos'
                      ? 'Nenhum paciente agendado para hoje'
                      : 'Nenhum paciente nesta etapa'}
                  description={search.trim()
                    ? `Não encontramos “${search.trim()}” na recepção de hoje.`
                    : activeTab === 'todos'
                      ? 'Registre um encaixe para iniciar o atendimento ou volte quando os pacientes chegarem.'
                      : 'Você pode conferir as outras etapas ou registrar um atendimento sem agendamento.'}
                  actionLabel={search.trim()
                    ? 'Limpar busca'
                    : activeTab === 'todos'
                      ? undefined
                      : 'Ver todos os pacientes'}
                  onAction={search.trim()
                    ? () => setSearch('')
                    : activeTab === 'todos'
                      ? undefined
                      : () => setActiveTab('todos')}
                  actionIcon={search.trim() ? XCircle : activeTab === 'todos' ? UserPlus : Users}
                  secondaryLabel={!search.trim() && activeTab !== 'todos' ? 'Criar encaixe' : undefined}
                  onSecondaryAction={() => abrirEncaixe()}
                  className="py-12"
                />
              </CardContent>
            </Card>
          ) : viewMode !== 'lista' ? (
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
              {viewMode === 'linha' ? (
                <ol aria-label="Linha do tempo da recepção" className="relative min-w-0 rounded-lg border border-border/80 bg-card p-3 before:absolute before:bottom-5 before:left-[5.5rem] before:top-5 before:w-px before:bg-border">
                  {linhaDoTempo.map((item, index) => {
                    const patientName = item.pac?.nome_social || item.pac?.nome || 'Paciente';
                    const { late, text } = statusFor(item);
                    const selected = selectedReceptionEntry?.ag.id === item.ag.id;
                    const action = boardActionFor(item);
                    const feito = item.step === 4 || item.ag.status === 'faltou';
                    return (
                      <Fragment key={item.ag.id}>
                        {index === indiceAgora && (
                          <li aria-label={`Agora, ${horaDaClinica(new Date(now))}`} className="relative grid grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] items-center gap-2 py-1">
                            <span className="text-right text-[11px] font-semibold uppercase tracking-wide text-foreground">Agora</span>
                            <span aria-hidden="true" className="relative z-10 mx-auto size-3 rounded-full bg-foreground ring-4 ring-card" />
                            <span aria-hidden="true" className="h-px bg-foreground/60" />
                          </li>
                        )}
                        <li data-testid="reception-timeline-item" className="relative grid grid-cols-[3.5rem_1.5rem_minmax(0,1fr)] items-center gap-2">
                          <span className={cn('text-right text-sm font-semibold tabular-nums', feito ? 'text-muted-foreground' : 'text-foreground')}>{item.ag.hora_inicio?.slice(0, 5) || '—'}</span>
                          <span aria-hidden="true" className={cn('relative z-10 mx-auto size-2.5 rounded-full ring-4 ring-card', late || item.ag.status === 'faltou' ? 'bg-destructive' : feito ? 'bg-muted-foreground/50' : 'bg-foreground')} />
                          <div className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-2.5 py-2 transition-colors sm:flex-nowrap', selected ? 'border-foreground/25 bg-muted/50' : 'border-transparent hover:bg-muted/40')}>
                            <button type="button" onClick={() => setSelectedAgendamentoId(item.ag.id)} aria-pressed={selected} aria-label={`Selecionar ${patientName}`} className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                              <span className={cn('block truncate text-sm font-semibold', feito ? 'text-muted-foreground' : 'text-foreground')}>{patientName}</span>
                              <span className="block truncate text-xs text-muted-foreground">{item.ag.tipo || 'Consulta'}{item.med?.nome ? ` · ${item.med.nome}` : ''}{item.sala?.nome ? ` · ${item.sala.nome}` : ''}</span>
                            </button>
                            {item.fila?.horario_chegada && item.step < 3 && <EsperaIndicador desde={item.fila.horario_chegada} className="text-[11px] font-medium" />}
                            <Badge variant={late || item.ag.status === 'faltou' ? 'destructive' : item.step === 4 ? 'secondary' : 'outline'} className="shrink-0 px-1.5 text-[10px]">{text}</Badge>
                            {action && (
                              <Button type="button" size="sm" variant={feito ? 'outline' : 'default'} onClick={action.run} disabled={isProcessing} className="h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-[11px]">
                                <action.icon aria-hidden="true" data-icon="inline-start" />{action.label}
                              </Button>
                            )}
                          </div>
                        </li>
                      </Fragment>
                    );
                  })}
                </ol>
              ) : (
              <div className={cn('grid min-w-0 gap-2.5', boardColumns.length === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1')}>
                {boardColumns.map(stage => (
                  <section key={stage.id} aria-label={`${stage.title}: ${stage.count} pacientes`} className="min-w-0 overflow-hidden rounded-lg border border-border/80 bg-muted/20">
                    <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-card px-3 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <stage.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-foreground">{stage.title}</h2>
                          <p className="truncate text-[10px] text-muted-foreground">{stage.subtitle}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 tabular-nums">{stage.count}</Badge>
                    </div>
                    <div className="flex min-h-28 flex-col gap-2 p-2">
                      {stage.items.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border/80 bg-card/70 px-2 py-5 text-center text-xs text-muted-foreground">
                          Nenhum paciente nesta etapa.
                        </p>
                      ) : stage.items.map(item => {
                        const patientName = item.pac?.nome_social || item.pac?.nome || 'Paciente';
                        const initials = patientName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'PA';
                        const { late, text: statusText } = statusFor(item);
                        const selected = selectedReceptionEntry?.ag.id === item.ag.id;
                        const action = boardActionFor(item);
                        const temAlergia = Array.isArray(item.pac?.alergias) ? item.pac.alergias.length > 0 : Boolean(item.pac?.alergias);
                        const temDetalhes = Boolean(item.sala?.nome || (item.fila?.horario_chegada && item.step < 3) || (item.fila?.prioridade && item.fila.prioridade !== 'normal') || temAlergia);
                        return (
                          <Card key={item.ag.id} data-testid="reception-appointment-card" className={cn('rounded-md border-border/80 bg-card shadow-none transition-colors', selected && 'border-primary ring-1 ring-primary/30')}>
                            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-2.5 pb-1">
                              <CardTitle className="text-sm font-semibold tabular-nums text-foreground">{item.ag.hora_inicio?.slice(0, 5) || '—'}</CardTitle>
                                <Badge variant={late || item.ag.status === 'faltou' ? 'destructive' : item.step === 4 ? 'secondary' : 'outline'} className="max-w-[62%] truncate px-1.5 text-[10px]">
                                  {statusText}
                                </Badge>
                            </CardHeader>
                            <CardContent className="space-y-1.5 p-2.5 pt-1">
                              <button type="button" onClick={() => setSelectedAgendamentoId(item.ag.id)} aria-pressed={selected} aria-label={`Selecionar ${patientName}`} className="flex w-full min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                <Avatar className="size-8 shrink-0 border border-border/70">
                                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                                </Avatar>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-foreground">{patientName}</span>
                                  <span className="block truncate text-[10px] text-muted-foreground">{item.ag.tipo || 'Consulta'}{item.med?.nome ? ` · ${item.med.nome}` : ''}</span>
                                </span>
                                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                              </button>
                              {temDetalhes && <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/70 pt-1.5 text-[10px] text-muted-foreground">
                                {item.sala?.nome && <span className="inline-flex min-w-0 items-center gap-1"><DoorOpen aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{item.sala.nome}</span></span>}
                                {item.fila?.horario_chegada && item.step < 3 && <EsperaIndicador desde={item.fila.horario_chegada} className="text-[10px] font-medium" />}
                                {item.fila?.prioridade && item.fila.prioridade !== 'normal' && <Badge variant={item.fila.prioridade === 'urgente' ? 'destructive' : 'secondary'} className="px-1.5 py-0 text-[9px]">{item.fila.prioridade === 'urgente' ? 'Urgente' : 'Preferencial'}</Badge>}
                                {temAlergia && <Badge variant="destructive" className="px-1.5 py-0 text-[9px]">Alergia</Badge>}
                              </div>}
                            </CardContent>
                            {action && <CardFooter className="p-2.5 pt-0"><Button type="button" size="sm" onClick={action.run} disabled={isProcessing} className="h-7 w-full justify-center gap-1.5 rounded-md px-2 text-[11px]">
                                <action.icon aria-hidden="true" data-icon="inline-start" />{action.label}
                            </Button></CardFooter>}
                          </Card>
                        );
                      })}
                    </div>
                  </section>

                ))}
              </div>
              )}

              <aside aria-label="Paciente selecionado" className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:sticky lg:top-20 lg:self-start">
                {selectedReceptionEntry ? (
                  <>
                    <div className="space-y-3 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">Paciente selecionado</p>
                        <Badge variant={selectedReceptionEntry.ag.status === 'em_atendimento' ? 'default' : 'outline'} className="max-w-[55%] truncate text-[10px]">
                          {selectedStageLabel}
                        </Badge>
                      </div>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-11 shrink-0 border border-border/70">
                          <AvatarFallback className="bg-primary/10 font-semibold text-primary">{selectedPatientName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'PA'}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-foreground">{selectedPatientName}</h2>
                          {selectedReceptionEntry.pac?.data_nascimento && <p className="truncate text-[11px] text-muted-foreground">Nascimento {String(selectedReceptionEntry.pac.data_nascimento).slice(0, 10).split('-').reverse().join('/')}</p>}
                        </div>
                      </div>
                      <div className="grid gap-1.5 text-[11px] text-muted-foreground">
                        {selectedReceptionEntry.pac?.telefone && <a className="flex min-w-0 items-center gap-2 hover:text-primary" href={`tel:${selectedReceptionEntry.pac.telefone}`}><Phone aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{selectedReceptionEntry.pac.telefone}</span></a>}
                        {selectedReceptionEntry.pac?.email && <a className="flex min-w-0 items-center gap-2 hover:text-primary" href={`mailto:${selectedReceptionEntry.pac.email}`}><Mail aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{selectedReceptionEntry.pac.email}</span></a>}
                      </div>
                    </div>
                    <Separator />
                    <Tabs defaultValue="resumo" className="p-3">
                      <TabsList className="grid h-9 w-full grid-cols-4 rounded-md bg-muted/60 p-1">
                        <TabsTrigger value="resumo" className="min-h-7 rounded-sm px-1 text-[10px]">Resumo</TabsTrigger>
                        <TabsTrigger value="agenda" className="min-h-7 rounded-sm px-1 text-[10px]">Agenda</TabsTrigger>
                        <TabsTrigger value="financeiro" className="min-h-7 rounded-sm px-1 text-[10px]">Financeiro</TabsTrigger>
                        <TabsTrigger value="historico" className="min-h-7 rounded-sm px-1 text-[10px]">Histórico</TabsTrigger>
                      </TabsList>
                      <TabsContent value="resumo" className="mt-3 space-y-3">
                        {selectedAllergies && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-2.5 text-xs text-destructive"><AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span><strong>Alergia:</strong> {selectedAllergies}</span></div>}
                        <div className="rounded-md border border-border/80 bg-muted/20 p-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observações do agendamento</p>
                          <p className="mt-1 text-xs text-foreground">{selectedReceptionEntry.ag.observacoes || 'Nenhuma observação registrada.'}</p>
                        </div>
                        {selectedReceptionEntry.step >= 0 && selectedReceptionEntry.ag.status !== 'faltou' && <ChecklistRecepcao appointment={selectedReceptionEntry.ag} patient={selectedReceptionEntry.pac} clinicId={profile?.clinica_id ?? ''} today={today} onEditPatient={() => navigate(`/pacientes/${encodeURIComponent(selectedReceptionEntry.ag.paciente_id)}/editar`, { state: { returnTo: '/recepcao' } })} />}
                      </TabsContent>
                      <TabsContent value="agenda" className="mt-3 space-y-3 text-xs">
                        <dl className="grid gap-2">
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Horário</dt><dd className="font-medium tabular-nums">{selectedReceptionEntry.ag.hora_inicio?.slice(0, 5) || '—'}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tipo</dt><dd className="text-right font-medium">{selectedReceptionEntry.ag.tipo || 'Consulta'}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Profissional</dt><dd className="truncate text-right font-medium">{selectedReceptionEntry.med?.nome || 'Não informado'}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Sala</dt><dd className="text-right font-medium">{selectedReceptionEntry.sala?.nome || 'Não definida'}</dd></div>
                        </dl>
                        <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => navigate('/agenda')}><CalendarDays aria-hidden="true" data-icon="inline-start" />Abrir agenda</Button>
                      </TabsContent>
                      <TabsContent value="financeiro" className="mt-3 space-y-3">
                        {lancamentosErro ? <p role="alert" className="text-xs text-destructive">Não foi possível carregar os dados financeiros deste atendimento.</p> : selectedReceptionEntry.lanc ? (
                          <>
                            <dl className="grid gap-2 text-xs">
                              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cobrança</dt><dd className="font-medium">{selectedReceptionEntry.lanc.status || 'Pendente'}</dd></div>
                              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Valor</dt><dd className="font-medium tabular-nums">{formatCurrency(Number(selectedReceptionEntry.lanc.valor || 0))}</dd></div>
                              {Number(selectedReceptionEntry.lanc.valor_pago || 0) > 0 && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Recebido</dt><dd className="font-medium tabular-nums">{formatCurrency(Number(selectedReceptionEntry.lanc.valor_pago || 0))}</dd></div>}
                              <div className="flex justify-between gap-3 border-t border-border pt-2"><dt className="font-medium">Saldo</dt><dd className="font-semibold tabular-nums">{formatCurrency(selectedBalance)}</dd></div>
                            </dl>
                            {selectedBalance > 0 && <Button type="button" size="sm" className="w-full gap-2" onClick={() => void openPagamento(selectedReceptionEntry.lanc, selectedReceptionEntry.pac)} disabled={isProcessing}><DollarSign aria-hidden="true" data-icon="inline-start" />Receber pagamento</Button>}
                          </>
                        ) : <p className="text-xs text-muted-foreground">Não há cobrança vinculada a este agendamento.</p>}
                      </TabsContent>
                      <TabsContent value="historico" className="mt-3 space-y-3">
                        <p className="text-xs text-muted-foreground">Abra o prontuário para consultar o histórico clínico completo deste paciente.</p>
                        {selectedReceptionEntry.ag.paciente_id && <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => navigate(`/prontuarios?paciente=${selectedReceptionEntry.ag.paciente_id}`)}><FileText aria-hidden="true" data-icon="inline-start" />Abrir prontuário</Button>}
                      </TabsContent>
                    </Tabs>
                    <Separator />
                    <div className="space-y-2 p-3">
                      <p className="text-xs font-semibold text-foreground">Ações</p>
                      {selectedBoardAction && <Button type="button" className="w-full justify-center gap-2" onClick={selectedBoardAction.run} disabled={isProcessing}>
                        <selectedBoardAction.icon aria-hidden="true" data-icon="inline-start" />{selectedBoardAction.label}
                      </Button>}
                      {podeRegistrarTriagem && [1, 2].includes(selectedReceptionEntry.step) && selectedReceptionEntry.ag.status !== 'em_atendimento' && triagensRegistradasQuery.isSuccess && !triagensRegistradasQuery.data?.includes(selectedReceptionEntry.ag.id) && selectedBoardAction?.label !== 'Abrir triagem' && <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-[11px]" onClick={() => void handleEncaminharTriagem(selectedReceptionEntry.ag.id, selectedReceptionEntry.ag.paciente_id)} disabled={isProcessing}><Activity aria-hidden="true" className="size-3.5" />Abrir triagem</Button>}
                      <div className="grid grid-cols-2 gap-2">
                        {selectedReceptionEntry.ag.paciente_id && <Button type="button" variant="outline" size="sm" className="gap-1.5 px-2 text-[11px]" onClick={() => navigate(`/prontuarios?paciente=${selectedReceptionEntry.ag.paciente_id}`)}><FileText aria-hidden="true" className="size-3.5" />Prontuário</Button>}
                        <Button type="button" variant="outline" size="sm" className="gap-1.5 px-2 text-[11px]" onClick={() => navigate(`/agenda?reagendar=${selectedReceptionEntry.ag.id}`)}><CalendarPlus aria-hidden="true" className="size-3.5" />Reagendar</Button>
                      </div>
                      {['faltou', 'em_atendimento'].includes(selectedReceptionEntry.ag.status) && <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-[11px]" onClick={() => navigate(`/agenda/${selectedReceptionEntry.ag.id}/corrigir-status`, { state: { returnTo: '/recepcao' } })}><RotateCcw aria-hidden="true" className="size-3.5" />{selectedReceptionEntry.ag.status === 'faltou' ? 'Desfazer falta' : 'Voltar para a fila'}</Button>}
                      {podeGerenciarRecepcao && selectedReceptionEntry.ag.paciente_id && <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-[11px]" onClick={() => abrirPortalPaciente(selectedReceptionEntry.ag.paciente_id)}><Link2 aria-hidden="true" className="size-3.5" />Preparar pré-check-in</Button>}
                      {selectedReceptionEntry.fila && selectedReceptionEntry.fila.status !== 'finalizado' && <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-[11px]" onClick={() => void imprimirSenha(selectedReceptionEntry.fila.id, selectedReceptionEntry.fila.horario_chegada)}><Printer aria-hidden="true" className="size-3.5" />Imprimir senha {receptionTicketCode(selectedReceptionEntry.fila.id)}</Button>}
                      {podeGerenciarRecepcao && selectedReceptionEntry.fila && ['aguardando', 'chamado'].includes(selectedReceptionEntry.fila.status) && <Select value={selectedReceptionEntry.fila.prioridade || 'normal'} onValueChange={prioridade => void alterarPrioridade(selectedReceptionEntry.fila.id, prioridade)}><SelectTrigger aria-label="Prioridade da fila" className="h-9 text-xs" disabled={savingPriorityId === selectedReceptionEntry.fila.id}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Prioridade normal</SelectItem><SelectItem value="preferencial">Preferencial</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent></Select>}
                    </div>
                  </>
                ) : <div className="p-5 text-sm text-muted-foreground">Selecione um paciente para ver os detalhes e as ações.</div>}
              </aside>
            </div>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-1">
              <AnimatePresence mode="popLayout">
                {filtered.map(({ ag, pac, med, sala, fila, lanc, step }) => {
                  const horaMin = minutosDaHora(ag.hora_inicio);
                  const atrasado = step === 0 && horaMin !== null && horaMin < minutosAgora;
                  const triagemRegistrada = triagensRegistradasQuery.data?.includes(ag.id) ?? false;
                  const podeAbrirTriagem = podeRegistrarTriagem
                    && (step === 1 || step === 2)
                    && ag.status !== 'em_atendimento'
                    && triagensRegistradasQuery.isSuccess
                    && !triagemRegistrada;
                  const linkACaminho = atrasado
                    ? linkWhatsApp((pac as any)?.telefone, `Olá, ${((pac as any)?.nome_social || pac?.nome || '').split(' ')[0]}! Sua consulta estava marcada para ${ag.hora_inicio?.slice(0, 5)}. Está a caminho?`)
                    : null;
                  const linkReagendar = ag.status === 'faltou' && pac?.telefone
                    ? linkWhatsApp(pac.telefone, `Olá, ${(pac.nome_social || pac.nome || '').split(' ')[0]}. Sentimos sua falta na consulta de hoje às ${ag.hora_inicio?.slice(0, 5)}. Gostaria de ajuda para reagendar?`)
                    : null;
                  const ehProximo = ag.id === proximoAChamarId;
                  return (
                  <motion.div
                    key={ag.id}
                    variants={fadeUp}
                    exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
                    layout
                  >
                    <Card data-testid="reception-appointment-card" className={cn(
                     'overflow-hidden rounded-2xl border-border/60 shadow-xs transition-all duration-200',
                       step === 1 && 'border-warning/40',
                       step === 2 && 'border-primary/40',
                       step === 3 && 'border-primary/50',
                       step === 4 && 'opacity-60',
                       ag.status === 'faltou' && 'opacity-75',
                       ehProximo && 'ring-2 ring-primary/40 shadow-sm',
                     )}>
                       <CardContent className="p-0">
                         <div className="flex items-stretch">
                           {/* Step indicator */}
                           <div className={cn(
                             'w-1.5 shrink-0',
                             step === 0 && (atrasado ? 'bg-destructive' : 'bg-warning'),
                             step === 1 && 'bg-warning',
                             step === 2 && 'bg-primary',
                             step === 3 && 'bg-primary',
                             step === 4 && 'bg-success',
                             ag.status === 'faltou' && 'bg-muted-foreground/50',
                           )} />

                          <div className="min-w-0 flex-1 p-4">
                            <div className="flex flex-wrap items-center gap-3">
                              {/* Patient info */}
                              <div className="min-w-0 flex-[1_1_12rem]">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <h3 className="font-semibold truncate">
                                    {(pac as any)?.nome_social || pac?.nome || 'Paciente'}
                                  </h3>
                                  {fila && step >= 1 && <Badge variant="outline" className="font-mono text-[10px]">Senha {receptionTicketCode(fila.id)}</Badge>}
                                  {ehProximo && (
                                    <Badge className="border-transparent bg-primary text-[10px] text-primary-foreground hover:bg-primary">
                                      <Bell className="mr-0.5 h-2.5 w-2.5" /> Próximo a chamar
                                    </Badge>
                                  )}
                                  {atrasado && (
                                    <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                                      <AlertTriangle aria-hidden="true" className="mr-0.5 h-2.5 w-2.5" />
                                      Atrasado {minutosAgora - (horaMin ?? 0)} min
                                    </Badge>
                                  )}
                                  {pac?.alergias && pac.alergias.length > 0 && (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Alergia
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> {ag.hora_inicio?.slice(0, 5)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Stethoscope className="h-3 w-3" /> {med?.nome || 'Médico'}
                                  </span>
                                  {sala && (
                                    <span className="flex items-center gap-1">
                                      <DoorOpen className="h-3 w-3" /> {sala.nome}
                                    </span>
                                  )}
                                  {ag.tipo && (
                                    <Badge variant="outline" className="text-[10px] font-normal">
                                      {ag.tipo}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Etapas ativas e estados terminais fora do fluxo */}
                              {step >= 0 ? (
                                <div className="hidden lg:flex items-center gap-1">
                                  {STEP_LABELS.map((label, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                      <div className={cn(
                                        'h-6 px-2.5 rounded-full flex items-center text-[10px] font-semibold transition-colors',
                                        i < step && 'bg-primary text-primary-foreground',
                                        i === step && 'bg-primary text-primary-foreground shadow-sm',
                                        i > step && 'bg-muted text-muted-foreground',
                                      )}>
                                        {i < step ? <Check className="h-3 w-3" /> : label}
                                      </div>
                                      {i < STEP_LABELS.length - 1 && (
                                        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <Badge variant="outline" className="shrink-0 text-muted-foreground">
                                  {ag.status === 'faltou' ? 'Não compareceu' : 'Fora do fluxo'}
                                </Badge>
                              )}

                              {/* Wait time */}
                              {fila?.horario_chegada && step < 3 && (
                                <EsperaIndicador desde={fila.horario_chegada} className="rounded-full border border-current/30 px-2 py-0.5 text-xs font-semibold" />
                              )}

                              {/* Action buttons */}
                              <div className="flex items-center gap-2 shrink-0">
                                {step === 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    <Button
                                      size="sm"
                                      onClick={() => handleCheckin(ag.id)}
                                      disabled={isProcessing}
                                      aria-busy={processingCheckinId === ag.id}
                                      className="gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                                    >
                                      {processingCheckinId === ag.id
                                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Registrando…</>
                                        : <><UserCheck className="h-3.5 w-3.5" /> Check-in</>}
                                    </Button>
                                    {linkACaminho && (
                                      <Button asChild size="sm" variant="outline" className="gap-1 rounded-full border-primary/40 text-primary hover:bg-primary/10 hover:text-primary">
                                        <a href={linkACaminho} target="_blank" rel="noopener noreferrer" aria-label={`Perguntar no WhatsApp se ${(pac as any)?.nome_social || pac?.nome || 'o paciente'} está a caminho`}>
                                          <MessageCircle className="h-3.5 w-3.5" /> Está a caminho?
                                        </a>
                                      </Button>
                                    )}
                                    {atrasado && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setMarcandoFalta({ agId: ag.id, nome: (pac as any)?.nome_social || pac?.nome || 'Paciente' })}
                                        disabled={isProcessing}
                                        className="gap-1 rounded-full text-muted-foreground hover:text-destructive"
                                        aria-label={`Marcar falta de ${(pac as any)?.nome_social || pac?.nome || 'paciente'}`}
                                      >
                                        <UserX className="h-3.5 w-3.5" /> Faltou
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {/* Step 1: Balcão — patient pays before consultation */}
                                {step === 1 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {podeAbrirTriagem && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEncaminharTriagem(ag.id, ag.paciente_id)}
                                        disabled={isProcessing}
                                        className="gap-1 rounded-full"
                                        aria-label={`Abrir triagem de ${(pac as any)?.nome_social || pac?.nome || 'paciente'}`}
                                      >
                                        <Activity className="h-3.5 w-3.5" /> Triagem
                                      </Button>
                                    )}
                                    {podeRegistrarTriagem && triagemRegistrada && <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Triagem registrada</Badge>}
                                    {lancamentosErro && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] })}
                                        className="gap-1"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" /> Tentar carregar cobrança
                                      </Button>
                                    )}
                                    {fila?.cobranca_estado === 'pendente' && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCheckin(ag.id)}
                                        disabled={isProcessing}
                                        className="gap-1"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        {lanc ? 'Confirmar cobrança' : 'Retomar cobrança'}
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleChamarBalcao(lanc, pac)}
                                      disabled={isProcessing}
                                      className="gap-1"
                                    >
                                      <Bell className="h-3.5 w-3.5" /> Chamar ao Balcão
                                    </Button>
                                    {lanc && (
                                      <Button
                                        size="sm"
                                        onClick={() => openPagamento(lanc, pac)}
                                        disabled={isProcessing}
                                        className="gap-1.5 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                                      >
                                        <DollarSign className="h-3.5 w-3.5" />
                                        Receber {formatCurrency(calcularSaldoPagamento(
                                          Number(lanc.valor || 0),
                                          Number(lanc.desconto || 0),
                                          Number(lanc.acrescimo || 0),
                                          Number(lanc.valor_pago || 0),
                                        ))}
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {/* Step 2: Paid, waiting/in consultation */}
                                {step === 2 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {podeAbrirTriagem && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEncaminharTriagem(ag.id, ag.paciente_id)}
                                        disabled={isProcessing}
                                        className="gap-1 rounded-full"
                                        aria-label={`Abrir triagem de ${(pac as any)?.nome_social || pac?.nome || 'paciente'}`}
                                      >
                                        <Activity className="h-3.5 w-3.5" /> Triagem
                                      </Button>
                                    )}
                                    {podeRegistrarTriagem && triagemRegistrada && <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Triagem registrada</Badge>}
                                    {lanc?.status === 'pago' && (
                                      <Badge className="bg-success/10 text-success border-0 mr-1">
                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Pago
                                      </Badge>
                                    )}
                                    {fila && ag.status !== 'em_atendimento' && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleChamar(fila.id)}
                                          disabled={isProcessing}
                                          className="gap-1"
                                        >
                                          <Bell className="h-3.5 w-3.5" /> Chamar
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => handleIniciarAtendimento(ag.id, fila.id)}
                                          disabled={isProcessing}
                                          className="gap-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                                        >
                                          <Play className="h-3.5 w-3.5" /> Atender
                                        </Button>
                                      </>
                                    )}
                                    {ag.status === 'em_atendimento' && fila && (
                                      <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => abrirFinalizacao(ag.id, 'recepcao', fila.id)}
                                        disabled={isProcessing}
                                        className="gap-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                                      >
                                        <Check className="h-3.5 w-3.5" /> Finalizar
                                      </Button>
                                    )}
                                  </div>
                                )}

                                {/* Step 3: Finalizado — post-consultation actions */}
                                {step === 3 && (
                                  <div className="flex flex-col gap-2 w-full sm:w-auto">
                                    <div className="flex items-center gap-2">
                                      <Badge className="bg-info/10 text-info border-0 w-fit">
                                        <Check className="h-3 w-3 mr-1" /> Consulta finalizada
                                      </Badge>
                                      {lanc?.status === 'pago' && (
                                         <Badge className="bg-success/10 text-success border-0">
                                          <CheckCircle2 className="h-3 w-3 mr-1" /> Pago
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {lanc && lanc.status !== 'pago' && calcularSaldoPagamento(
                                        Number(lanc.valor || 0),
                                        Number(lanc.desconto || 0),
                                        Number(lanc.acrescimo || 0),
                                        Number(lanc.valor_pago || 0),
                                      ) > 0 && (
                                        <Button size="sm" className="gap-1 text-xs h-7 bg-success hover:bg-success/90 text-success-foreground"
                                          onClick={() => openPagamento(lanc, pac)} disabled={isProcessing}>
                                          <DollarSign className="h-3 w-3" /> Receber saldo
                                        </Button>
                                      )}
                                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7"
                                        onClick={() => navigate(`/agenda?reagendar=${ag.id}`)}>
                                        <CalendarPlus className="h-3 w-3" /> Reagendar
                                      </Button>
                                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7"
                                        onClick={() => navigate(`/retornos?paciente=${ag.paciente_id}`)}>
                                        <RotateCcw className="h-3 w-3" /> Retorno
                                      </Button>
                                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7"
                                        onClick={() => navigate(`/exames?paciente=${ag.paciente_id}`)}>
                                        <FlaskConical className="h-3 w-3" /> Exames
                                      </Button>
                                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7"
                                        onClick={() => navigate(`/prontuarios?paciente=${ag.paciente_id}`)}>
                                        <ClipboardList className="h-3 w-3" /> Prontuário
                                      </Button>
                                      {fila && (!lanc || lanc.status === 'pago') && (
                                        <Button size="sm" className="gap-1 text-xs h-7 bg-success hover:bg-success/90 text-success-foreground ml-auto"
                                          onClick={() => handleConcluir(ag.id, fila.id)}
                                          disabled={isProcessing}>
                                          <CheckCircle2 className="h-3 w-3" /> Concluir
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Step 4: Concluído */}
                                {step === 4 && (
                                  <div className="flex flex-col gap-2 items-end">
                                    <Badge className="bg-success/10 text-success border-0">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Concluído {lanc?.forma_pagamento ? `— ${lanc.forma_pagamento}` : ''}
                                    </Badge>
                                    <div className="flex flex-wrap gap-1.5">
                                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7"
                                        onClick={() => navigate(`/agenda?reagendar=${ag.id}`)}>
                                        <CalendarPlus className="h-3 w-3" /> Reagendar
                                      </Button>
                                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7"
                                        onClick={() => navigate(`/exames?paciente=${ag.paciente_id}`)}>
                                        <FlaskConical className="h-3 w-3" /> Exames
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                {ag.status === 'faltou' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    onClick={() => navigate(`/agenda?reagendar=${ag.id}`)}
                                  >
                                    <CalendarPlus className="h-3.5 w-3.5" /> Reagendar
                                  </Button>
                                )}
                                {linkReagendar && (
                                  <Button asChild size="sm" variant="outline" className="gap-1">
                                    <a href={linkReagendar} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp para ajudar ${(pac as any)?.nome_social || pac?.nome || 'o paciente'} a reagendar`}>
                                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp para reagendar
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </div>
                            {step >= 0 && ag.status !== 'faltou' && (
                              <ChecklistRecepcao
                                appointment={ag}
                                patient={pac}
                                clinicId={profile?.clinica_id ?? ''}
                                today={today}
                                onEditPatient={() => navigate(`/pacientes/${encodeURIComponent(ag.paciente_id)}/editar`, { state: { returnTo: '/recepcao' } })}
                              />
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {podeGerenciarRecepcao && ag.paciente_id && (
                                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" onClick={() => abrirPortalPaciente(ag.paciente_id)}>
                                  <Link2 className="h-3.5 w-3.5" /> Preparar pré-check-in
                                </Button>
                              )}
                              {fila && fila.status !== 'finalizado' && (
                                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" onClick={() => void imprimirSenha(fila.id, fila.horario_chegada)}>
                                  <Printer className="h-3.5 w-3.5" /> Imprimir senha {receptionTicketCode(fila.id)}
                                </Button>
                              )}
                              {podeGerenciarRecepcao && fila && ['aguardando', 'chamado'].includes(fila.status) && (
                                <Select value={fila.prioridade || 'normal'} onValueChange={prioridade => void alterarPrioridade(fila.id, prioridade)}>
                                  <SelectTrigger aria-label="Prioridade da fila" className="h-8 w-[160px] rounded-full text-xs" disabled={savingPriorityId === fila.id}>
                                    {savingPriorityId === fila.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="normal">Prioridade normal</SelectItem>
                                    <SelectItem value="preferencial">Preferencial</SelectItem>
                                    <SelectItem value="urgente">Urgente</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </section>
      <details className="group rounded-lg border border-border/70 bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium marker:hidden">
          <span>Atendimentos em aberto de outros dias</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-border/70 p-3">
          <AtendimentosEmAberto onFinalizar={agendamentoId => abrirFinalizacao(agendamentoId, 'atendimentos-abertos')} />
        </div>
      </details>
      {/* Confirmation Dialog for Destructive Actions */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Ação</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === 'concluir'
                ? 'Tem certeza que deseja concluir este atendimento? Ele será movido para o histórico.'
                : 'Tem certeza que deseja executar esta ação? Não é possível desfazer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executarConcluir}
              disabled={isProcessing}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Marcar falta direto da recepção ─── */}
      <AlertDialog open={!!marcandoFalta} onOpenChange={(open) => { if (!open && !isProcessing) setMarcandoFalta(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar falta?</AlertDialogTitle>
            <AlertDialogDescription>
              {marcandoFalta?.nome ?? 'O paciente'} será marcado como "não compareceu" e sairá da fila. Se houver cobrança pendente, ela será cancelada; o horário continua no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isProcessing}
              onClick={(event) => { event.preventDefault(); if (marcandoFalta) void handleMarcarFalta(marcandoFalta.agId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar falta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
