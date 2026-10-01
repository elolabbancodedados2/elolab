import { formatCurrency } from '@/lib/formatters';
import { useState, useMemo, useEffect } from 'react';
import { printReceiptPdf, type ReceiptData } from '@/lib/pdfReceipt';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createAutoBilling } from '@/lib/autoBilling';
import { autoFinalizarAtendimento, autoConfirmarPagamento } from '@/lib/workflowAutomation';
import { checkinComCobranca } from '@/lib/checkinWithBilling';
import { atomicConcludeQueue, atomicStartAppointment as autoIniciarAtendimento } from '@/lib/operationalTransitions';
import { PainelDoDia } from '@/components/recepcao/PainelDoDia';
import { AtendimentosEmAberto } from '@/components/recepcao/AtendimentosEmAberto';
import { FinalizarAtendimentoDialog } from '@/components/fila/FinalizarAtendimentoDialog';
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
  FlaskConical, RotateCcw, ClipboardList, Lock as LockIcon, LockOpen, Activity,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { todayDateOnly } from '@/lib/dateOnly';
import { pacienteCorresponde, normalizarTexto } from '@/lib/buscaPaciente';
import { calcularSaldoPagamento, montarPagamentos, resumirPagamentos, somaDasExtras, validarValorRecebido } from '@/lib/pagamentoDividido';
import { patientStep } from '@/lib/receptionWorkflow';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { canalUnico } from '@/lib/realtimeCanal';

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

function readCaixaEstadoLocal(userId?: string, clinicaId?: string, today = format(new Date(), 'yyyy-MM-dd')): CaixaEstadoPersistido | null {
  const keys = [
    userId ? `caixa_estado_${userId}` : null,
    clinicaId ? `caixa_estado_clinica_${clinicaId}` : null,
  ].filter(Boolean) as string[];

  for (const key of keys) {
    const raw = localStorage.getItem(key);
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

function calcEspera(ts: string | null): string {
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${mins % 60}min`;
}

function corEspera(ts: string | null): string {
  if (!ts) return 'text-muted-foreground';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 15) return 'text-success';
  if (mins < 30) return 'text-warning';
  return 'text-destructive';
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

// ─── Main Component ─────────────────────────────────────
export default function Recepcao({ onOpenCaixa }: { onOpenCaixa?: () => void } = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('todos');
  const [isProcessing, setIsProcessing] = useState(false);
   const [showPagamento, setShowPagamento] = useState(false);
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
   const [now, setNow] = useState(Date.now());
   const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
   const [pendingAction, setPendingAction] = useState<{type: string; agId?: string; filaId?: string} | null>(null);
   /**
    * Finalização pela Recepção esperando a resposta sobre retorno — mesma
    * pergunta da Fila, agora pela via da recepção (antes só a Fila
    * perguntava, e o retorno era esquecido nas outras vias).
    */
   const [finalizandoRecepcao, setFinalizandoRecepcao] = useState<{ agId: string; filaId: string; nome: string } | null>(null);
   /**
    * Encaixe: paciente que chegou sem agendamento. Antes a recepcionista
    * tinha que ir até a Agenda, criar a consulta e voltar para fazer o
    * check-in — três navegações no meio de um balcão cheio. Aqui o caminho
    * é um só: busca, médico, tipo e pronto.
    */
   const [encaixeOpen, setEncaixeOpen] = useState(false);
   const [encaixePacienteId, setEncaixePacienteId] = useState('');
   const [encaixeMedicoId, setEncaixeMedicoId] = useState('');
   const [encaixeTipo, setEncaixeTipo] = useState('');
   const [salvandoEncaixe, setSalvandoEncaixe] = useState(false);

  // Refresh timer every 30s
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  // Data
  // Só o dia de hoje: a recepção não usa o histórico, e o realtime refaz esta
  // consulta a cada mudança na agenda — antes era a tabela inteira, com joins.
  const { data: agendamentos = [], isLoading: loadingAg } = useAgendamentosPeriodo(today, today);
  const { data: pacienteEncaixe } = usePacienteResumo(encaixePacienteId);
  const { data: medicos = [] } = useMedicos();
  const { data: salas = [] } = useSalas();

  const { data: filaItems = [] } = useQuery({
    queryKey: ['fila_atendimento', profile?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      if (!profile?.clinica_id) {
        console.warn('Clinic ID not found - cannot fetch fila_atendimento');
        return [];
      }
      const { data } = await supabase
        .from('fila_atendimento')
        .select('*')
        .eq('clinica_id', profile.clinica_id)
        .order('posicao');
      return data || [];
    },
  });

  const agendamentoIdsHoje = useMemo(() => agendamentos.map((ag: any) => ag.id), [agendamentos]);
  const {
    data: lancamentos = [],
    isSuccess: lancamentosResolvidos,
    isError: lancamentosErro,
  } = useQuery({
    queryKey: ['lancamentos_hoje', profile?.id ?? null, profile?.clinica_id ?? null, today, agendamentoIdsHoje],
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
    initialData: () => Boolean(readCaixaEstadoLocal(profile?.id, profile?.clinica_id)),
    queryFn: async () => {
      if (!profile?.clinica_id) return false;
      const todayStr = format(new Date(), 'yyyy-MM-dd');

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
        localStorage.setItem(clinicaKey, JSON.stringify(estado));
        localStorage.setItem(userKey, JSON.stringify(estado));
        return true;
      }

      // Caixa is closed — clear localStorage
      const clinicaKey = `caixa_estado_clinica_${profile.clinica_id}`;
      const userKey = `caixa_estado_${profile.id}`;
      localStorage.removeItem(clinicaKey);
      localStorage.removeItem(userKey);
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
          onClick: () => onOpenCaixa ? onOpenCaixa() : navigate('/recepcao'),
        },
        duration: 6000,
      });
      return false;
    }
    return true;
  }

  // Tipos de consulta ativos — usados pelo encaixe (o preço é resolvido no
  // check-in pelo createAutoBilling, igual ao fluxo agendado).
  const { data: tiposConsulta = [] } = useQuery({
    queryKey: ['tipos-consulta-encaixe', profile?.clinica_id],
    enabled: !!profile?.clinica_id && encaixeOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_consulta')
        .select('id, nome, valor_particular')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });


  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase
      .channel(canalUnico('recepcao-realtime'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_atendimento' }, () => {
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lancamentos' }, () => {
        queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caixa_diario' }, () => {
        queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // Build unified patient list for today
  const todayAgendamentos = useMemo(() =>
    agendamentos
      .filter((a: any) => a.data === today && a.status !== 'cancelado')
      .sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio)),
    [agendamentos, today]
  );

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
     if (search) {
       const q = normalizarTexto(search);
       list = list.filter(e =>
         // Paciente: ignora acento, caixa e máscara de CPF/telefone.
         (e.pac && pacienteCorresponde(e.pac, search)) ||
         normalizarTexto(e.med?.nome).includes(q) ||
         e.ag?.hora_inicio?.includes(search)
       );
     }
     return list;
   }, [enriched, activeTab, search]);

   // Stats
   const stats = useMemo(() => ({
     aguardando: enriched.filter(e => e.step === 0).length,
     balcao: enriched.filter(e => e.step === 1).length,
     atendimento: enriched.filter(e => e.step === 2 || e.step === 3).length,
     concluido: enriched.filter(e => e.step === 4).length,
   }), [enriched]);

  // ─── Actions ──────────────────────────────────────────
  async function handleCheckin(agId: string, itemForcado?: { ag: any; pac: any; med: any }) {
      setIsProcessing(true);
      try {
        // O encaixe passa o item na mão: o agendamento acabou de ser criado e
        // ainda não passou pelo cache da lista.
        const item = itemForcado ?? enriched.find(e => e.ag.id === agId);
        if (!item) throw new Error('Agendamento não encontrado');
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
     }
     setIsProcessing(false);
   }

  async function handleChamar(filaId: string) {
    setIsProcessing(true);
    try {
      // O erro era ignorado: a tela dizia "Paciente chamado!" enquanto a fila
      // continuava parada e o Painel TV não exibia nada.
      const { error } = await supabase
        .from('fila_atendimento').update({ status: 'chamado' }).eq('id', filaId);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      toast.success('Paciente chamado!');
    } catch (err: any) {
      const msg = err?.message || 'Erro desconhecido';
      console.error('handleChamar error:', err);
      toast.error('Erro ao chamar: ' + msg);
    }
    setIsProcessing(false);
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
      toast.error('Erro ao iniciar atendimento: ' + (err?.message || 'Erro desconhecido'));
    }
    setIsProcessing(false);
  }

  async function handleFinalizarAtendimento(agId: string, filaId: string, diasRetorno: number | null) {
    setIsProcessing(true);
    try {
      const item = enriched.find(e => e.ag.id === agId);
      if (!item) throw new Error('Agendamento não encontrado');
      const result = await autoFinalizarAtendimento({
        agendamentoId: agId,
        filaId,
        pacienteId: item.ag.paciente_id,
        pacienteNome: item.pac?.nome || 'Paciente',
        medicoId: item.ag.medico_id,
        convenioId: item.pac?.convenio_id,
        tipoConsulta: item.ag.tipo,
        tipoExame: ['exame', 'exames'].includes(String(item.ag.tipo || '').toLocaleLowerCase('pt-BR'))
          ? item.ag.observacoes
          : null,
        clinicaId: profile?.clinica_id,
        // Pergunta do retorno, respondida no diálogo — mesma pergunta da Fila.
        agendarRetorno: diasRetorno !== null,
        diasRetorno: diasRetorno ?? undefined,
      });
      if (!result.success) throw new Error(result.message);

      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });

      toast.success('Atendimento finalizado!', {
        description: result.actions.join(' • '),
      });
    } catch (err: any) {
      console.error('Erro ao finalizar:', err);
      toast.error('Erro ao finalizar: ' + (err?.message || 'Erro desconhecido'));
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

      setSelectedLancamento(lancamentoSelecionado);
     setSelectedPacienteBalcao(pac);
     setFormaPagamento('');
     setDesconto(Number(lancamentoSelecionado.desconto || 0));
      setAcrescimo(Number(lancamentoSelecionado.acrescimo || 0));
     setValorReceberAgora(calcularSaldoPagamento(
       Number(lancamentoSelecionado.valor || 0),
       Number(lancamentoSelecionado.desconto || 0),
       Number(lancamentoSelecionado.acrescimo || 0),
       Number(lancamentoSelecionado.valor_pago || 0),
     ).toFixed(2));
     setObsPagamento('');
     setFormasExtras([]);
     // Uma chave por ABERTURA do diálogo. Se o operador confirmar duas vezes,
     // as duas chamadas levam a mesma chave e o banco cobra uma vez só.
     setChaveIdempotencia(crypto.randomUUID());
     setShowPagamento(true);
   }

    async function handleChamarBalcao(lanc: any, pac: any) {
      setIsProcessing(true);
      try {
        // Gravar a chamada na fila: antes o chime e a voz tocavam SÓ na
        // máquina da recepção — o paciente na sala de espera não via nem
        // ouvia nada. Com status 'chamado' o Painel TV anuncia em tempo real
        // (chamado sem sala => "Recepção", que é exatamente o destino aqui).
        const agId = lanc?.agendamento_id;
        if (agId) {
          const fila = (filaItems as any[]).find(f => f.agendamento_id === agId);
          if (fila) {
            const { error: filaErr } = await supabase
              .from('fila_atendimento')
              .update({ status: 'chamado' })
              .eq('id', fila.id);
            if (filaErr) throw filaErr;
            queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
          }
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
          description: 'Chamado no painel da sala de espera',
          action: {
            label: 'Receber agora',
            onClick: () => openPagamento(lanc, pac),
          },
        });
      } catch (e) {
        toast.error('Erro ao chamar paciente', { description: mensagemDeErro(e) });
      }
      setIsProcessing(false);
    }

  function gerarComprovante(lanc: any, pac: any, forma: string, valorFinal: number, med?: any) {
    const formaLabel = FORMAS_PAGAMENTO.find(f => f.value === forma)?.label || forma;
    const agora = format(new Date(), "dd/MM/yyyy 'às' HH:mm");
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

      const pagamentoRepetido = Boolean(resultado?.repetido);
      if (pagamentoRepetido) {
        toast.info('Este pagamento já havia sido registrado.', {
          description: 'Nada foi cobrado de novo.',
        });
      }

      // Send payment receipt to patient
      if (!pagamentoRepetido) {
        try {
          const { error: receiptError } = await supabase.functions.invoke('payment-receipt', {
            body: { lancamento_id: selectedLancamento.id }
          });
          if (receiptError && import.meta.env.DEV) {
            console.warn('Comprovante não enviado:', receiptError.message);
          }
        } catch (e) {
          if (import.meta.env.DEV) console.log('Payment receipt notification skipped:', e);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos', 'receita'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      // Card "Recebido hoje" do painel: sem isto ficava em R$ 0,00 até recarregar.
      queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] });
      setShowPagamento(false);
      setSelectedLancamento(null);
      setSelectedPacienteBalcao(null);
      if (!pagamentoRepetido) toast.success(`Pagamento de ${valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} confirmado!`);

      // Emit receipt automatically - find medico from enriched data
      if (!pagamentoRepetido) {
        const matchedItem = enriched.find(e => e.lanc?.id === selectedLancamento.id);
        const rotulos = Object.fromEntries(FORMAS_PAGAMENTO.map((forma) => [forma.value, forma.label]));
        gerarComprovante(selectedLancamento, selectedPacienteBalcao, resumirPagamentos(pagamentos, rotulos), valorFinal, matchedItem?.med);
      }
    } catch (err: any) {
      toast.error('Erro ao confirmar pagamento: ' + (err?.message || 'Erro desconhecido'));
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
      toast.error('Erro ao concluir: ' + (err?.message || 'Erro desconhecido'));
    }
    setIsProcessing(false);
  }

  async function handleEncaminharTriagem(agId: string, pacienteId: string) {
    setIsProcessing(true);
    try {
      // Check if triagem already exists for this agendamento
      const { data: existing, error: existingError } = await supabase
        .from('triagens')
        .select('id')
        .eq('agendamento_id', agId)
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        toast.info('Triagem já registrada para este agendamento');
        navigate('/triagem');
        setIsProcessing(false);
        return;
      }
      toast.success('Paciente encaminhado para triagem!', {
        description: 'Acesse a página de Triagem para registrar os sinais vitais',
        action: { label: 'Ir para Triagem', onClick: () => navigate('/triagem') },
      });
      navigate(`/triagem`);
    } catch (e) { toast.error('Erro ao encaminhar', { description: mensagemDeErro(e) }); }
    setIsProcessing(false);
  }

  /**
   * Encaixe: cria o agendamento de hoje, agora, e faz o check-in na sequência
   * (fila + cobrança) pelo mesmo caminho do agendado — sem navegar até a
   * Agenda. O caixa sÃ³ Ã© exigido quando a equipe for receber o pagamento.
   */
  async function handleEncaixe() {
    if (!encaixePacienteId || !encaixeMedicoId || !encaixeTipo) {
      toast.error('Selecione paciente, médico e tipo de consulta.');
      return;
    }
    setSalvandoEncaixe(true);
    try {
      const agora = new Date();
      const fim = new Date(agora.getTime() + 30 * 60000);
      const hhmm = (d: Date) =>
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const { data: novo, error } = await supabase
        .from('agendamentos')
        .insert({
          paciente_id: encaixePacienteId,
          medico_id: encaixeMedicoId,
          tipo: encaixeTipo,
          data: today,
          hora_inicio: hhmm(agora),
          hora_fim: hhmm(fim),
          status: 'aguardando',
          clinica_id: profile?.clinica_id,
        })
        .select('id, paciente_id, medico_id, tipo')
        .single();
      if (error) throw error;

      const pac = pacienteEncaixe;
      setEncaixeOpen(false);
      setEncaixePacienteId('');
      setEncaixeMedicoId('');
      setEncaixeTipo('');

      // O check-in (fila + cobrança) segue o mesmo caminho do agendado, com o
      // item passado na mão porque a lista ainda não tem o agendamento novo.
      await handleCheckin(novo.id, { ag: novo, pac, med: null });
    } catch (e) {
      toast.error('Não foi possível criar o encaixe', { description: mensagemDeErro(e) });
    } finally {
      setSalvandoEncaixe(false);
    }
  }

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Painel de Recepção</h1>
        <p className="text-muted-foreground text-sm">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })} — Fluxo completo do paciente
        </p>
      </motion.div>


      {/* Stats */}
      {/* As quatro caixas de contagem viraram o painel do dia: as mesmas
          informações mais o dinheiro (recebido, a receber, adicional pendente),
          e cada cartão filtra a lista abaixo. */}
      {/* Antes do painel do dia: consulta de outro dia parada em "em
          atendimento" nunca faturou, e ninguém a vê em tela nenhuma — a fila
          só guarda quem aguarda ou já terminou. */}
      <AtendimentosEmAberto />

      <PainelDoDia
        atendimentos={enriched}
        clinicaId={profile?.clinica_id}
        hoje={today}
        abaAtiva={activeTab as any}
        onFiltrar={setActiveTab}
      />

      {/* Search + Tabs */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar paciente ou médico..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline" size="sm" className="gap-1.5 shrink-0"
          onClick={() => setEncaixeOpen(true)}
        >
          <UserPlus className="h-4 w-4" /> Encaixe sem agendamento
        </Button>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* A recepção trabalha em tablet. Cinco abas com ícone e contador não
            cabem em 768px: os rótulos eram cortados e o conteúdo empurrava a
            página para fora da área visível. O contêiner rola na horizontal e
            cada aba para de encolher, então "Atendimento (12)" continua
            legível em vez de virar "Atend...". */}
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="w-max min-w-full justify-start bg-muted/50 p-1 gap-1">
            <TabsTrigger value="todos" className="shrink-0 data-[state=active]:bg-background">
              Todos ({enriched.length})
            </TabsTrigger>
            <TabsTrigger value="checkin" className="shrink-0 data-[state=active]:bg-background">
              <Clock className="h-3.5 w-3.5 mr-1" /> Check-in ({stats.aguardando})
            </TabsTrigger>
            <TabsTrigger value="balcao" className="shrink-0 data-[state=active]:bg-background">
              <DollarSign className="h-3.5 w-3.5 mr-1" /> Balcão ({stats.balcao})
            </TabsTrigger>
            <TabsTrigger value="atendimento" className="shrink-0 data-[state=active]:bg-background">
              <Stethoscope className="h-3.5 w-3.5 mr-1" /> Atendimento ({stats.atendimento})
            </TabsTrigger>
            <TabsTrigger value="concluido" className="shrink-0 data-[state=active]:bg-background">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluído ({stats.concluido})
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="mt-4">
          {loadingAg ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground font-medium">Nenhum paciente nesta etapa</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Os pacientes aparecerão aqui conforme chegarem</p>
              </CardContent>
            </Card>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filtered.map(({ ag, pac, med, sala, fila, lanc, step }) => (
                  <motion.div
                    key={ag.id}
                    variants={fadeUp}
                    exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
                    layout
                  >
                    <Card className={cn(
                     'border transition-all duration-200 overflow-hidden',
                       step === 1 && 'border-accent/30 shadow-md shadow-accent/5',
                       step === 2 && 'border-primary/30 shadow-md shadow-primary/5',
                       step === 3 && 'border-info/30 shadow-md shadow-info/5',
                       step === 4 && 'opacity-60',
                     )}>
                       <CardContent className="p-0">
                         <div className="flex items-stretch">
                           {/* Step indicator */}
                           <div className={cn(
                             'w-1.5 shrink-0',
                             step === 0 && 'bg-warning',
                             step === 1 && 'bg-accent-foreground',
                             step === 2 && 'bg-primary',
                             step === 3 && 'bg-info',
                             step === 4 && 'bg-success',
                           )} />

                          <div className="flex-1 p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                              {/* Patient info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold truncate">
                                    {(pac as any)?.nome_social || pac?.nome || 'Paciente'}
                                  </h3>
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
                                      🚪 {sala.nome}
                                    </span>
                                  )}
                                  {ag.tipo && (
                                    <Badge variant="outline" className="text-[10px] font-normal">
                                      {ag.tipo}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Step progress pills */}
                              <div className="hidden lg:flex items-center gap-1">
                                {STEP_LABELS.map((label, i) => (
                                  <div key={i} className="flex items-center gap-1">
                                    <div className={cn(
                                      'h-6 px-2.5 rounded-full flex items-center text-[10px] font-medium transition-colors',
                                      i < step && 'bg-success/10 text-success',
                                      i === step && 'bg-primary/10 text-primary ring-1 ring-primary/20',
                                      i > step && 'bg-muted text-muted-foreground/50',
                                    )}>
                                      {i < step ? <Check className="h-3 w-3" /> : label}
                                    </div>
                                    {i < STEP_LABELS.length - 1 && (
                                      <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* Wait time */}
                              {fila?.horario_chegada && step < 3 && (
                                <div className="flex items-center gap-1 text-xs">
                                  <Timer className="h-3.5 w-3.5" />
                                  <span className={corEspera(fila.horario_chegada)}>
                                    {calcEspera(fila.horario_chegada)}
                                  </span>
                                </div>
                              )}

                              {/* Action buttons */}
                              <div className="flex items-center gap-2 shrink-0">
                                {step === 0 && (
                                  <div className="flex gap-1.5">
                                    <Button
                                      size="sm"
                                      onClick={() => handleCheckin(ag.id)}
                                      disabled={isProcessing}
                                      className="gap-1.5"
                                    >
                                      <UserCheck className="h-3.5 w-3.5" /> Check-in
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleEncaminharTriagem(ag.id, ag.paciente_id)}
                                      disabled={isProcessing}
                                      className="gap-1"
                                    >
                                      <Activity className="h-3.5 w-3.5" /> Triagem
                                    </Button>
                                  </div>
                                )}

                                {/* Step 1: Balcão — patient pays before consultation */}
                                {step === 1 && (
                                  <div className="flex flex-wrap gap-1.5">
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
                                        className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
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
                                  <div className="flex gap-1.5">
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
                                          className="gap-1"
                                        >
                                          <Play className="h-3.5 w-3.5" /> Atender
                                        </Button>
                                      </>
                                    )}
                                    {ag.status === 'em_atendimento' && fila && (
                                      <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => setFinalizandoRecepcao({
                                          agId: ag.id,
                                          filaId: fila.id,
                                          nome: (pac as any)?.nome_social || pac?.nome || 'Paciente',
                                        })}
                                        disabled={isProcessing}
                                        className="gap-1"
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
                                        onClick={() => navigate(`/agenda?reagendar=${ag.paciente_id}`)}>
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
                                        onClick={() => navigate(`/agenda?reagendar=${ag.paciente_id}`)}>
                                        <CalendarPlus className="h-3 w-3" /> Reagendar
                                      </Button>
                                      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7"
                                        onClick={() => navigate(`/exames?paciente=${ag.paciente_id}`)}>
                                        <FlaskConical className="h-3 w-3" /> Exames
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog open={showPagamento} onOpenChange={setShowPagamento}>
        <DialogContent className="sm:max-w-md">
           <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-success" />
              Confirmar Pagamento
            </DialogTitle>
            <DialogDescription>Registre o pagamento do paciente.</DialogDescription>
          </DialogHeader>

          {selectedLancamento && (
            <div className="space-y-4">
              {/* Resumo Valor / Pago / Saldo, para a recepcionista não precisar
                  fazer a conta de cabeça antes de receber. */}
              {(() => {
                const bruto = Number(selectedLancamento.valor || 0);
                const devido = Number((bruto - desconto + acrescimo).toFixed(2));
                const jaPago = Number(selectedLancamento.valor_pago || 0);
                const saldo = calcularSaldoPagamento(bruto, desconto, acrescimo, jaPago);
                return (
                  <div className="rounded-xl bg-muted/50 p-4 space-y-2">
                    <p className="text-sm font-medium">{selectedLancamento.descricao}</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor</span>
                      <span className="tabular-nums">{formatCurrency(devido)}</span>
                    </div>
                    {jaPago > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Já pago</span>
                        <span className="tabular-nums text-success">− {formatCurrency(jaPago)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline border-t pt-2">
                      <span className="text-sm font-medium">Saldo a receber</span>
                      <span className="font-bold text-lg tabular-nums">{formatCurrency(saldo)}</span>
                    </div>
                    {(desconto > 0 || acrescimo > 0) && (
                      <div className="text-xs text-muted-foreground">
                        Original: {formatCurrency(bruto)}
                        {desconto > 0 && ` • Desc: -${formatCurrency(desconto)}`}
                        {acrescimo > 0 && ` • Acrés: +${formatCurrency(acrescimo)}`}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-2">
                <Label className="text-xs font-medium">Forma de Pagamento</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FORMAS_PAGAMENTO.map(fp => (
                    <button
                      key={fp.value}
                      onClick={() => setFormaPagamento(fp.value)}
                      className={cn(
                        'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 p-3 text-xs font-medium transition-all',
                        formaPagamento === fp.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30 text-muted-foreground'
                      )}
                    >
                      <fp.icon className={cn('h-5 w-5', formaPagamento === fp.value ? 'text-primary' : fp.color)} />
                      {fp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="valor-recebido-agora" className="text-xs font-medium">Valor recebido agora (R$)</Label>
                <Input
                  id="valor-recebido-agora"
                  type="number"
                  min="0.01"
                  max={(() => {
                    const bruto = Number(selectedLancamento.valor || 0);
                    return calcularSaldoPagamento(bruto, desconto, acrescimo, Number(selectedLancamento.valor_pago || 0));
                  })()}
                  step="0.01"
                  value={valorReceberAgora}
                  onChange={event => setValorReceberAgora(event.target.value)}
                  aria-describedby="saldo-apos-recebimento"
                />
                {(() => {
                  const bruto = Number(selectedLancamento.valor || 0);
                  const saldo = calcularSaldoPagamento(bruto, desconto, acrescimo, Number(selectedLancamento.valor_pago || 0));
                  const recebido = validarValorRecebido(valorReceberAgora, saldo);
                  return (
                    <p id="saldo-apos-recebimento" className="text-xs text-muted-foreground" aria-live="polite">
                      {recebido === null ? `Saldo atual: ${formatCurrency(saldo)}.` : `Ficará pendente: ${formatCurrency((saldo - recebido))}.`}
                    </p>
                  );
                })()}
              </div>

              {/* ─── Pagamento dividido ───
                  As formas informadas dividem o valor recebido nesta etapa; a
                  primeira forma escolhida absorve o restante. */}
              {formasExtras.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Dividir com outra forma</Label>
                  {formasExtras.map((extra, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Select
                        value={extra.forma}
                        onValueChange={v => setFormasExtras(fs => fs.map((f, j) => j === i ? { ...f, forma: v } : f))}
                      >
                        <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Forma" /></SelectTrigger>
                        <SelectContent>
                          {FORMAS_PAGAMENTO.filter(fp => fp.value !== formaPagamento).map(fp => (
                            <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" min={0} step="0.01" placeholder="R$"
                        className="h-9 w-28"
                        value={extra.valor || ''}
                        onChange={e => setFormasExtras(fs => fs.map((f, j) => j === i ? { ...f, valor: Number(e.target.value) || 0 } : f))}
                      />
                      <Button
                        variant="ghost" size="icon" aria-label="Remover forma de pagamento"
                        className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => setFormasExtras(fs => fs.filter((_, j) => j !== i))}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {formaPagamento && (
                <Button
                  variant="outline" size="sm" className="w-full gap-2 h-8 text-xs"
                  onClick={() => setFormasExtras(fs => [...fs, { forma: '', valor: 0 }])}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Dividir com outra forma de pagamento
                </Button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Desconto (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={desconto || ''}
                    onChange={e => setDesconto(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Acréscimo (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={acrescimo || ''}
                    onChange={e => setAcrescimo(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Observações</Label>
                <Textarea
                  placeholder="Opcional..."
                  value={obsPagamento}
                  onChange={e => setObsPagamento(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {!formaPagamento && (
              <p className="mr-auto self-center text-xs text-muted-foreground" role="status">Escolha a forma de pagamento para confirmar.</p>
            )}
            <Button variant="outline" onClick={() => setShowPagamento(false)}>Cancelar</Button>
            <Button
              onClick={handleConfirmarPagamento}
              disabled={!formaPagamento || isProcessing || !selectedLancamento || validarValorRecebido(
                valorReceberAgora,
                calcularSaldoPagamento(Number(selectedLancamento.valor || 0), desconto, acrescimo, Number(selectedLancamento.valor_pago || 0)),
              ) === null}
              className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* ─── Finalização com pergunta de retorno ───
          Mesma pergunta da Fila, agora também na via da recepção. Sem isto,
          o retorno era esquecido em toda finalização que não passasse pela
          Fila — e "retorno esquecido" é paciente que não volta. */}
      <FinalizarAtendimentoDialog
        open={!!finalizandoRecepcao}
        pacienteNome={finalizandoRecepcao?.nome ?? ''}
        onClose={() => setFinalizandoRecepcao(null)}
        onConfirm={async dias => {
          if (!finalizandoRecepcao) return;
          const { agId, filaId } = finalizandoRecepcao;
          setFinalizandoRecepcao(null);
          await handleFinalizarAtendimento(agId, filaId, dias);
        }}
      />

      {/* ─── Encaixe (walk-in) ─── */}
      <Dialog open={encaixeOpen} onOpenChange={a => { if (!a && !salvandoEncaixe) setEncaixeOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Encaixe sem agendamento
            </DialogTitle>
            <DialogDescription>
              Paciente que chegou sem consulta marcada. Cria o atendimento para
              agora e faz o check-in na sequência.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Paciente</Label>
              <PacienteCombobox value={encaixePacienteId} onChange={(id) => setEncaixePacienteId(id)} />
              <p className="text-xs text-muted-foreground">
                Não encontrou? Cadastre em Pacientes primeiro e volte aqui para o encaixe.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Médico</Label>
              <Select value={encaixeMedicoId} onValueChange={setEncaixeMedicoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar médico..." /></SelectTrigger>
                <SelectContent>
                  {(medicos as any[]).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome || m.crm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de consulta</Label>
              <Select value={encaixeTipo} onValueChange={setEncaixeTipo}>
                <SelectTrigger><SelectValue placeholder="Selecionar tipo..." /></SelectTrigger>
                <SelectContent>
                  {(tiposConsulta as any[]).map(t => (
                    <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={salvandoEncaixe} onClick={() => setEncaixeOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleEncaixe}
              disabled={salvandoEncaixe || !encaixePacienteId || !encaixeMedicoId || !encaixeTipo}
              className="gap-1.5"
            >
              {salvandoEncaixe ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Criar e fazer check-in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
