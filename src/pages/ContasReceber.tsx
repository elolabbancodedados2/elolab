import { formatWithDatePreference as format } from '@/lib/datePreference';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, Check, DollarSign, AlertCircle, Receipt, Calendar, Download, Clock,
  TrendingUp, User, Loader2, Eye, FileText, Printer, MoreHorizontal, Filter,
  ArrowUpRight, Banknote, CreditCard, QrCode, Landmark, Building2, Stethoscope,
  FlaskConical, Repeat, Scissors, Pill, Baby, Heart, Bone, Brain, X, RefreshCw,
} from 'lucide-react';
import { differenceInCalendarDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { Database } from '@/integrations/supabase/types';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { isValidDateOnly, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';
import { podeExportarContasCompletas, valorRecebidoDaConta } from '@/lib/contasReceber';
import { ErrorState } from '@/components/ErrorState';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { mensagemDeErro } from '@/lib/erros';
import { MercadoPagoPointPayment } from '@/components/financeiro/MercadoPagoPointPayment';
import { buscarDadosBasicosPacientes } from '@/lib/patientBasicData';
import { parseAccountFilterStatus, parseFinanceMonth } from '@/lib/financeRouteState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';

type StatusPagamento = Database['public']['Enums']['status_pagamento'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  pendente: { label: 'Pendente', color: 'text-warning-foreground', bg: 'bg-warning/10', border: 'border-warning/20', icon: Clock },
  parcial: { label: 'Parcial', color: 'text-warning-foreground', bg: 'bg-warning/10', border: 'border-warning/20', icon: Clock },
  pago: { label: 'Recebido', color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', icon: Check },
  atrasado: { label: 'Atrasado', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', icon: AlertCircle },
  cancelado: { label: 'Cancelado', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', icon: AlertCircle },
  estornado: { label: 'Estornado', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', icon: Repeat },
};

const CATEGORIAS_RECEITA = [
  { value: 'consulta', label: 'Consulta Médica', icon: Stethoscope, color: 'text-primary' },
  { value: 'retorno', label: 'Retorno', icon: Repeat, color: 'text-info' },
  { value: 'procedimento', label: 'Procedimento', icon: Scissors, color: 'text-primary' },
  { value: 'exame', label: 'Exame / Diagnóstico', icon: FlaskConical, color: 'text-warning-foreground' },
  { value: 'cirurgia', label: 'Cirurgia / Intervenção', icon: Heart, color: 'text-destructive' },
  { value: 'internacao', label: 'Internação', icon: Building2, color: 'text-warning-foreground' },
  { value: 'taxa_administrativa', label: 'Taxa Administrativa', icon: FileText, color: 'text-muted-foreground' },
  { value: 'taxa_material', label: 'Taxa de Material', icon: Pill, color: 'text-info' },
  { value: 'convenio_repasse', label: 'Repasse de Convênio', icon: Building2, color: 'text-primary' },
  { value: 'honorario_medico', label: 'Honorário Médico', icon: User, color: 'text-success' },
  { value: 'fisioterapia', label: 'Fisioterapia', icon: Bone, color: 'text-info' },
  { value: 'psicologia', label: 'Psicologia', icon: Brain, color: 'text-accent-foreground' },
  { value: 'pediatria', label: 'Pediatria', icon: Baby, color: 'text-success' },
  { value: 'outros', label: 'Outros', icon: DollarSign, color: 'text-muted-foreground' },
];

const CATEGORIAS_MAP = Object.fromEntries(CATEGORIAS_RECEITA.map(c => [c.value, c]));

const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'PIX', icon: QrCode },
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'cartao_credito', label: 'Cartão de Crédito', icon: CreditCard },
  { value: 'cartao_debito', label: 'Cartão de Débito', icon: CreditCard },
  { value: 'convenio', label: 'Convênio', icon: Building2 },
  { value: 'transferencia', label: 'Transferência', icon: Landmark },
  { value: 'boleto', label: 'Boleto', icon: FileText },
  { value: 'cheque', label: 'Cheque', icon: FileText },
];

const CENTROS_CUSTO_RECEITA = [
  { value: 'geral', label: 'Geral' },
  { value: 'ambulatorio', label: 'Ambulatório' },
  { value: 'laboratorio', label: 'Laboratório' },
  { value: 'centro_cirurgico', label: 'Centro Cirúrgico' },
  { value: 'estetica', label: 'Estética' },
  { value: 'odonto', label: 'Odontologia' },
  { value: 'fisioterapia', label: 'Fisioterapia' },
];

interface FormData {
  paciente_id: string;
  categoria: string;
  descricao: string;
  valor: string;
  data_vencimento: string;
  forma_pagamento: string;
  centro_custo: string;
  numero_documento: string;
  competencia: string;
  observacoes: string;
}

interface BaixaData {
  forma_pagamento: string;
  desconto: string;
  acrescimo: string;
  valorReceber: string | null;
  observacoes: string;
}

interface PagamentoEstornavel {
  id: string;
  valor: string;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
}

const novoFormDataReceita = (): FormData => {
  const hoje = todaySaoPauloDateOnly();
  return {
    paciente_id: '', categoria: 'consulta', descricao: '', valor: '',
    data_vencimento: hoje, forma_pagamento: 'pix', centro_custo: 'geral',
    numero_documento: '', competencia: hoje.slice(0, 7), observacoes: '',
  };
};

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const formatarEixoMonetario = (v: number) => Math.abs(v) >= 1_000
  ? `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  : fmt(v);
function parseMoneyInput(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const formatoBrasileiro = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const formatoPontoDecimal = /^\d+(?:\.\d{1,2})?$/;
  if (!formatoBrasileiro.test(compact) && !formatoPontoDecimal.test(compact)) return null;
  const normalizado = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}
const formatMoneyInput = (value: number) => Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '';
const formaPagamentoRPC: Record<string, string> = { cartao_credito: 'credito', cartao_debito: 'debito' };

const PILL_BASE = 'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const PILL_ATIVA = 'border-primary bg-primary text-primary-foreground';
const PILL_INATIVA = 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground';

const PERIODOS_RECEITA: { key: string; label: string }[] = [
  { key: 'mes_atual', label: 'Mês atual' },
  { key: 'mes_anterior', label: 'Mês anterior' },
  { key: 'ultimos_3', label: 'Ult. 3 meses' },
  { key: 'ultimos_6', label: 'Ult. 6 meses' },
  { key: 'todos', label: 'Todo período' },
];

const PIE_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--primary) / 0.82)', 'hsl(var(--primary) / 0.68)',
  'hsl(var(--primary) / 0.54)', 'hsl(var(--primary) / 0.4)', 'hsl(var(--primary) / 0.32)',
  'hsl(var(--primary) / 0.24)', 'hsl(var(--primary) / 0.16)',
];

export default function ContasReceber() {
  const location = useLocation();
  const routeState = location.state as { returnTo?: unknown; restoreSearchTerm?: unknown; restoreFilterCategoria?: unknown } | null;
  const isCreationPage = location.pathname === '/contas/receber/nova';
  const paymentRouteId = location.pathname.match(/^\/contas\/receber\/([^/]+)\/recebimento$/)?.[1] ?? null;
  const isPaymentPage = paymentRouteId !== null;
  const isWorkflowPage = isCreationPage || isPaymentPage;
  const returnToListPath = typeof routeState?.returnTo === 'string' && /^\/contas(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo
    : '/contas?tab=receber';
  const restoreSearchTerm = typeof routeState?.restoreSearchTerm === 'string' ? routeState.restoreSearchTerm : '';
  const restoreFilterCategoria = typeof routeState?.restoreFilterCategoria === 'string' ? routeState.restoreFilterCategoria : 'todas';
  const [searchTerm, setSearchTerm] = useState(restoreSearchTerm);
  const [filterCategoria, setFilterCategoria] = useState(restoreFilterCategoria);
  const [searchParams, setSearchParams] = useSearchParams();
  const filterStatus = parseAccountFilterStatus(searchParams.get('status'));
  const selectedMonth = parseFinanceMonth(searchParams.get('mes'));
  const filterPeriodo = selectedMonth ? 'mes_selecionado' : searchParams.get('periodo') || 'mes_atual';
  const [contaParaCancelar, setContaParaCancelar] = useState<any>(null);
  const [isCancelandoConta, setIsCancelandoConta] = useState(false);
  const [selectedConta, setSelectedConta] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(novoFormDataReceita);
  const [formDirty, setFormDirty] = useState(false);
  const [baixaDirty, setBaixaDirty] = useState(false);
  const [paymentPageInvalid, setPaymentPageInvalid] = useState(false);
  const valorReceitaDigitado = parseMoneyInput(formData.valor);
  const valorReceitaInvalido = valorReceitaDigitado === null || valorReceitaDigitado <= 0;
  const [baixaData, setBaixaData] = useState<BaixaData>({
    forma_pagamento: 'pix',
    desconto: '0,00', acrescimo: '0,00', valorReceber: null, observacoes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [baixaIncerta, setBaixaIncerta] = useState(false);
  const [pointBlocksManual, setPointBlocksManual] = useState(false);
  const submissionLock = useRef(false);
  const cancelamentoSubmissionLock = useRef(false);
  const [chavesBaixa, setChavesBaixa] = useState<Record<string, string>>({});
  const navigationAllowedRef = useRef(false);
  const paymentInitializedRef = useRef<string | null>(null);

  const navigate = useNavigate();
  const hasUnsavedChanges = (isCreationPage && formDirty) || (isPaymentPage && baixaDirty);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !navigationAllowedRef.current && isWorkflowPage && (hasUnsavedChanges || (isPaymentPage && baixaIncerta)) && !isSubmitting
      && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => { navigationAllowedRef.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!isWorkflowPage || (!hasUnsavedChanges && !(isPaymentPage && baixaIncerta))) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges, isPaymentPage, baixaIncerta, isWorkflowPage]);
  useEffect(() => {
    if (isPaymentPage && baixaIncerta && blocker.state === 'blocked') {
      toast.warning('O recebimento ainda não foi confirmado. Permaneça nesta tela e confirme novamente a mesma tentativa.');
      blocker.reset();
    }
  }, [isPaymentPage, baixaIncerta, blocker]);
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const returnToList = () => navigate(returnToListPath, {
    state: { restoreSearchTerm: searchTerm, restoreFilterCategoria: filterCategoria },
  });
  const updateFormData = (patch: Partial<FormData>) => {
    setFormData(current => ({ ...current, ...patch }));
    setFormDirty(true);
  };
  const updateBaixaData = (patch: Partial<BaixaData>) => {
    setBaixaData(current => ({ ...current, ...patch }));
    setBaixaDirty(true);
  };

  const contasQuery = useQuery({
    queryKey: ['lancamentos', 'receita', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      // Em blocos: sem paginar, o servidor devolvia só as 1000 primeiras contas.
      const data = await buscarEmBlocos<any>(() => supabase
        .from('lancamentos')
        .select('*')
        .eq('tipo', 'receita')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }));
      const pacientesPorId = await buscarDadosBasicosPacientes(data.map(conta => conta.paciente_id));
      const today = todaySaoPauloDateOnly();
      return data.map(conta => {
        const vencido = ['pendente', 'parcial'].includes(conta.status) && !!conta.data_vencimento && conta.data_vencimento < today;
        return { ...conta, pacientes: pacientesPorId.get(conta.paciente_id) ?? null, vencido, status: vencido && conta.status === 'pendente' ? 'atrasado' as StatusPagamento : conta.status };
      });
    },
    enabled: !isCreationPage && !!user && !!profile?.clinica_id,
  });
  const contas = contasQuery.data ?? [];
  const contasAtingiramLimite = contas.length >= LIMITE_BUSCA_EM_BLOCOS;

  const pagamentosQuery = useQuery({
    queryKey: ['pagamentos-contas-receber', profile?.clinica_id ?? null],
    queryFn: async () => buscarEmBlocos<PagamentoEstornavel & { lancamento_id: string; estornado_em: string | null }>(() =>
      supabase.from('pagamentos')
        .select('id, lancamento_id, valor, forma_pagamento, data_pagamento, observacoes, estornado_em')
        .eq('clinica_id', profile!.clinica_id!)
        .order('id', { ascending: true })
    ),
    enabled: !isCreationPage && !!profile?.clinica_id,
  });
  const pagamentos = pagamentosQuery.data ?? [];
  const pagamentosAtingiramLimite = pagamentos.length >= LIMITE_BUSCA_EM_BLOCOS;
  const exportacaoCompletaPermitida = podeExportarContasCompletas(contasAtingiramLimite, pagamentosAtingiramLimite);
  const lancamentosComPagamento = useMemo(
    () => new Set(pagamentos.map(pagamento => pagamento.lancamento_id)),
    [pagamentos],
  );
  const pagamentosAtivosPorLancamento = useMemo(() => {
    const agrupados = new Map<string, typeof pagamentos>();
    for (const pagamento of pagamentos) {
      if (pagamento.estornado_em) continue;
      const lista = agrupados.get(pagamento.lancamento_id) ?? [];
      lista.push(pagamento);
      agrupados.set(pagamento.lancamento_id, lista);
    }
    return agrupados;
  }, [pagamentos]);
  const valorRecebidoConta = useCallback((conta: any) => {
    const pagamentosAtivos = pagamentosAtivosPorLancamento.get(conta.id) ?? [];
    return valorRecebidoDaConta(
      conta,
      !pagamentosAtingiramLimite,
      lancamentosComPagamento.has(conta.id),
      pagamentosAtivos.reduce((total, pagamento) => total + Number(pagamento.valor || 0), 0),
    );
  }, [pagamentosAtivosPorLancamento, pagamentosAtingiramLimite, lancamentosComPagamento]);
  const saldoDevedorConta = (conta: any) => Math.max(
    0,
    Number(conta.valor || 0) - Number(conta.desconto || 0) + Number(conta.acrescimo || 0) - valorRecebidoConta(conta),
  );

  useEffect(() => {
    if (!paymentRouteId) {
      paymentInitializedRef.current = null;
      setPaymentPageInvalid(false);
      return;
    }
    if (paymentInitializedRef.current === paymentRouteId) return;
    const conta = contas.find(item => String(item.id) === decodeURIComponent(paymentRouteId));
    if (!conta) return;

    paymentInitializedRef.current = paymentRouteId;
    setSelectedConta(conta);
    const saldo = saldoDevedorConta(conta);
    const elegivel = ['pendente', 'parcial', 'atrasado'].includes(conta.status) && saldo > 0;
    setPaymentPageInvalid(!elegivel);
    setBaixaIncerta(false);
    setPointBlocksManual(false);
    setBaixaDirty(false);
    setChavesBaixa(keys => ({ ...keys, [conta.id]: keys[conta.id] || crypto.randomUUID() }));
    setBaixaData({
      forma_pagamento: conta.forma_pagamento || 'pix',
      desconto: formatMoneyInput(Number(conta.desconto || 0)),
      acrescimo: formatMoneyInput(Number(conta.acrescimo || 0)),
      valorReceber: null,
      observacoes: '',
    });
  }, [paymentRouteId, contas]);

  const isLoading = contasQuery.isLoading || pagamentosQuery.isLoading;
  const hojeClinica = parseDateOnly(todaySaoPauloDateOnly())!;

  const setFilterStatus = (status: string) => setSearchParams(current => {
    const next = new URLSearchParams(current);
    if (status === 'todos') next.delete('status');
    else next.set('status', status);
    return next;
  });
  const setFilterPeriodo = (periodo: string) => setSearchParams(current => {
    const next = new URLSearchParams(current);
    next.delete('mes');
    if (periodo === 'mes_atual') next.delete('periodo');
    else next.set('periodo', periodo);
    return next;
  });
  const limparFiltrosDeRota = () => setSearchParams(current => {
    const next = new URLSearchParams(current);
    next.delete('status');
    next.delete('mes');
    next.delete('periodo');
    return next;
  });

  // Period filter
  const periodoRange = useMemo(() => {
    if (selectedMonth) return { start: startOfMonth(selectedMonth), end: endOfMonth(selectedMonth) };
    // O período acompanha o dia civil da clínica em São Paulo, mesmo que o
    // navegador esteja em outro fuso horário.
    const now = parseDateOnly(todaySaoPauloDateOnly())!;
    switch (filterPeriodo) {
      case 'mes_atual': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'mes_anterior': return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
      case 'ultimos_3': return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      case 'ultimos_6': return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) };
      default: return null;
    }
  }, [filterPeriodo, selectedMonth]);

  const filteredContas = useMemo(() => {
    return contas.filter(c => {
      const paciente = (c as any).pacientes;
      const matchSearch =
        pacienteCorresponde(paciente || {}, searchTerm) ||
        String(c.descricao || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(c.categoria || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(c.numero_documento || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'todos'
        || (filterStatus === 'aberto' ? ['pendente', 'parcial', 'atrasado'].includes(c.status) : filterStatus === 'atrasado' ? c.vencido : c.status === filterStatus);
      const matchCategoria = filterCategoria === 'todas' || c.categoria === filterCategoria;
      let matchPeriodo = true;
      if (periodoRange) {
        const dataReferencia = parseDateOnly(c.data_vencimento || c.data);
        matchPeriodo = !!dataReferencia
          && dataReferencia >= periodoRange.start
          && dataReferencia <= periodoRange.end;
      }
      return matchSearch && matchStatus && matchCategoria && matchPeriodo;
    });
  }, [contas, searchTerm, filterStatus, filterCategoria, periodoRange]);

  const periodFilteredCount = useMemo(() => periodoRange
    ? contas.filter(conta => {
      const dataReferencia = parseDateOnly(conta.data_vencimento || conta.data);
      return !!dataReferencia && dataReferencia >= periodoRange.start && dataReferencia <= periodoRange.end;
    }).length
    : contas.length, [contas, periodoRange]);

  const stats = useMemo(() => {
    const filtered = filteredContas;
    const pendente = filtered.filter(c => ['pendente', 'parcial'].includes(c.status || '') && !c.vencido).reduce((a, c) => a + saldoDevedorConta(c), 0);
    const atrasado = filtered.filter(c => c.vencido).reduce((a, c) => a + saldoDevedorConta(c), 0);
    const pago = filtered.filter(c => c.status === 'pago' || c.status === 'parcial').reduce((a, c) => a + valorRecebidoConta(c), 0);
    return {
      // O total é a soma dos três quadros ao lado. Somar o valor bruto deixava
      // desconto e acréscimo de fora, e o total não fechava com eles.
      total: pendente + atrasado + pago,
      pendente,
      atrasado,
      pago,
      countPendente: filtered.filter(c => ['pendente', 'parcial'].includes(c.status || '') && !c.vencido).length,
      countAtrasado: filtered.filter(c => c.vencido).length,
      countPago: filtered.filter(c => c.status === 'pago' || c.status === 'parcial').length,
      countTotal: filtered.filter(c => c.status !== 'cancelado' && c.status !== 'estornado').length,
    };
  }, [filteredContas, lancamentosComPagamento, pagamentosAtivosPorLancamento, pagamentosAtingiramLimite]);

  const destaqueReceita = useMemo(() => {
    const atrasadas = filteredContas
      .filter(c => c.vencido)
      .sort((a, b) => {
        const da = parseDateOnly(a.data_vencimento || a.data)?.getTime() ?? 0;
        const db = parseDateOnly(b.data_vencimento || b.data)?.getTime() ?? 0;
        return da - db;
      });
    if (atrasadas.length > 0) return atrasadas[0];
    return filteredContas
      .filter(c => ['pendente', 'parcial'].includes(c.status || ''))
      .sort((a, b) => {
        const da = parseDateOnly(a.data_vencimento || a.data)?.getTime() ?? 0;
        const db = parseDateOnly(b.data_vencimento || b.data)?.getTime() ?? 0;
        return da - db;
      })[0] ?? null;
  }, [filteredContas]);

  // Por categoria (for chart)
  const porCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    filteredContas.filter(c => c.status !== 'cancelado' && c.status !== 'estornado').forEach(c => {
      const cat = c.categoria || 'outros';
      map[cat] = (map[cat] || 0) + c.valor;
    });
    return Object.entries(map)
      .map(([key, value]) => ({ name: CATEGORIAS_MAP[key]?.label || key, value, key }))
      .sort((a, b) => b.value - a.value);
  }, [filteredContas]);

  // Por forma de pagamento (recebidos)
  const porFormaPgto = useMemo(() => {
    const map: Record<string, number> = {};
    const idsFiltrados = new Set(filteredContas.map(conta => conta.id));
    const formaCanonica = (forma: string) =>
      Object.entries(formaPagamentoRPC).find(([, formaRPC]) => formaRPC === forma)?.[0] || forma;
    for (const pagamento of pagamentos) {
      if (!idsFiltrados.has(pagamento.lancamento_id) || pagamento.estornado_em) continue;
      const forma = formaCanonica(pagamento.forma_pagamento || 'outros');
      map[forma] = (map[forma] || 0) + Number(pagamento.valor || 0);
    }
    // Contas antigas podem não ter linhas em `pagamentos`; só nesses casos
    // usamos o total consolidado e a forma gravada na própria conta.
    filteredContas.filter(conta =>
      (conta.status === 'pago' || conta.status === 'parcial') && !lancamentosComPagamento.has(conta.id)
    ).forEach(conta => {
      const forma = conta.forma_pagamento || 'outros';
      map[forma] = (map[forma] || 0) + valorRealizado(conta);
    });
    return Object.entries(map)
      .map(([key, value]) => ({
        name: FORMAS_PAGAMENTO.find(f => f.value === key)?.label || key,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredContas, pagamentos, lancamentosComPagamento]);

  const getPacienteNome = (conta: any) => conta.pacientes?.nome_social || conta.pacientes?.nome || 'Particular';

  const handleNew = () => {
    navigate('/contas/receber/nova', {
      state: {
        returnTo: `${location.pathname}${location.search}`,
        restoreSearchTerm: searchTerm,
        restoreFilterCategoria: filterCategoria,
      },
    });
  };

  const handleSave = async () => {
    if (submissionLock.current) return;
    if (!formData.descricao.trim()) {
      toast.error('Preencha a descrição e o valor.');
      return;
    }
    const valorReceita = valorReceitaDigitado;
    if (valorReceitaInvalido || valorReceita === null) {
      toast.error('O valor deve ser maior que zero.');
      return;
    }
    if (!isValidDateOnly(formData.data_vencimento)) {
      toast.error('Informe uma data de vencimento válida.');
      return;
    }
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    submissionLock.current = true;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('lancamentos').insert({
        tipo: 'receita',
        categoria: formData.categoria,
        descricao: formData.descricao.trim(),
        valor: valorReceita,
        data: todaySaoPauloDateOnly(),
        data_vencimento: formData.data_vencimento,
        status: 'pendente' as StatusPagamento,
        paciente_id: formData.paciente_id || null,
        forma_pagamento: formData.forma_pagamento || null,
        centro_custo: formData.centro_custo || null,
        numero_documento: formData.numero_documento || null,
        competencia: formData.competencia || null,
        observacoes: formData.observacoes || null,
        clinica_id: profile.clinica_id,
      });
      if (error) throw error;
      toast.success('Receita cadastrada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      setFormDirty(false);
      navigationAllowedRef.current = true;
      returnToList();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDarBaixa = (conta: any) => {
    setBaixaIncerta(false);
    setPointBlocksManual(false);
    setBaixaDirty(false);
    navigate(`/contas/receber/${encodeURIComponent(conta.id)}/recebimento`, {
      state: {
        returnTo: `${location.pathname}${location.search}`,
        restoreSearchTerm: searchTerm,
        restoreFilterCategoria: filterCategoria,
      },
    });
  };

  const handleViewDetail = (conta: any) => {
    navigate(`/contas/receber/${encodeURIComponent(conta.id)}/detalhes`, {
      state: {
        returnTo: `${location.pathname}${location.search}`,
        restoreSearchTerm: searchTerm,
        restoreFilterCategoria: filterCategoria,
      },
    });
  };

  const descontoBaixa = baixaData.desconto.trim() === '' ? 0 : parseMoneyInput(baixaData.desconto);
  const acrescimoBaixa = baixaData.acrescimo.trim() === '' ? 0 : parseMoneyInput(baixaData.acrescimo);
  const valorFinal = useMemo(() => {
    if (!selectedConta) return 0;
    if (descontoBaixa === null || acrescimoBaixa === null) return Number.NaN;
    return selectedConta.valor - descontoBaixa + acrescimoBaixa - valorRecebidoConta(selectedConta);
  }, [selectedConta, descontoBaixa, acrescimoBaixa, valorRecebidoConta]);
  const valorDoPagamento = baixaData.valorReceber === null ? valorFinal : parseMoneyInput(baixaData.valorReceber);
  const saldoAposRecebimento = valorDoPagamento === null ? Number.NaN : valorFinal - valorDoPagamento;
  const pagamentoBaixaInvalido = !Number.isFinite(valorFinal) || valorFinal <= 0
    || valorDoPagamento === null || valorDoPagamento <= 0 || valorDoPagamento > valorFinal;

  const completePayment = () => {
    setBaixaDirty(false);
    setFormDirty(false);
    navigationAllowedRef.current = true;
    returnToList();
  };

  const handleConfirmarBaixa = async () => {
    if (submissionLock.current) return;
    if (!selectedConta) return;
    if (!baixaData.forma_pagamento) {
      toast.error('Selecione a forma de pagamento.');
      return;
    }
    if (descontoBaixa === null || acrescimoBaixa === null || !Number.isFinite(valorFinal)
      || descontoBaixa < 0 || acrescimoBaixa < 0 || valorFinal <= 0) {
      toast.error('Confira o desconto e o acréscimo.', { description: 'O valor recebido precisa ser maior que zero e os ajustes não podem ser negativos.' });
      return;
    }
    if (valorDoPagamento === null || valorDoPagamento <= 0) {
      toast.error('Informe um valor recebido maior que zero.');
      return;
    }
    if (valorDoPagamento > valorFinal) {
      toast.error('O valor recebido não pode ser maior que o saldo em aberto.', { description: `Saldo disponível: ${fmt(valorFinal)}.` });
      return;
    }
    submissionLock.current = true;
    setIsSubmitting(true);
    let chamadaRpcIniciada = false;
    let respostaServidorRecebida = false;
    try {
      chamadaRpcIniciada = true;
      const { data: resultado, error } = await (supabase as any).rpc('registrar_pagamento', {
        p_lancamento_id: selectedConta.id,
        p_pagamentos: [{
          forma_pagamento: formaPagamentoRPC[baixaData.forma_pagamento] || baixaData.forma_pagamento,
          valor: Number(valorDoPagamento.toFixed(2)),
          parcelas: 1,
        }],
        p_desconto: Number(descontoBaixa.toFixed(2)),
        p_acrescimo: Number(acrescimoBaixa.toFixed(2)),
        p_chave_idempotencia: chavesBaixa[selectedConta.id] || null,
        p_observacoes: baixaData.observacoes.trim() || null,
      });
      if (error) {
        const erroRpc = error as { status?: number; code?: string };
        // PostgREST pode devolver um SQLSTATE sem expor `status` no objeto.
        // Uma rejeição explícita significa que a transação foi revertida e o
        // formulário pode ser corrigido; somente falha sem resposta deve ser
        // tratada como resultado incerto.
        const statusHttp = Number(erroRpc.status);
        respostaServidorRecebida = (statusHttp >= 400 && statusHttp < 500)
          || /^[0-9A-Z]{5}$/i.test(String(erroRpc.code || ''));
        throw error;
      }
      respostaServidorRecebida = true;
      if (resultado?.repetido) toast.info('Este pagamento já havia sido registrado. Nada foi cobrado de novo.');
      else toast.success(`Pagamento confirmado — ${getPacienteNome(selectedConta)}`);
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] });
      queryClient.invalidateQueries({ queryKey: ['pagamentos-contas-receber'] });
      setBaixaIncerta(false);
      setChavesBaixa(keys => {
        const next = { ...keys };
        delete next[selectedConta.id];
        return next;
      });
      completePayment();
    } catch (e: any) {
      const message = e.message || 'Erro ao confirmar';
      if (!chamadaRpcIniciada || respostaServidorRecebida) {
        // O servidor confirmou a rejeição e a transação foi revertida; esta
        // mesma chave pode ser usada após corrigir os dados ou abrir o caixa.
        setBaixaIncerta(false);
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
        queryClient.invalidateQueries({ queryKey: ['pagamentos-contas-receber'] });
        toast.error(message, message.toLowerCase().includes('caixa fechado')
          ? { description: 'Abra o caixa do dia e tente novamente.' }
          : undefined);
      } else {
        // Sem resposta HTTP, a gravação pode ter sido concluída antes da queda.
        // Confere a chave no banco; se não der para confirmar, mantém o formulário
        // congelado para que a repetição envie exatamente o mesmo pagamento.
        const chave = chavesBaixa[selectedConta.id];
        const verificacao = chave && profile?.clinica_id
          ? await supabase.from('pagamentos').select('id')
              .eq('clinica_id', profile.clinica_id)
              .eq('lancamento_id', selectedConta.id)
              .eq('chave_idempotencia', chave)
              .maybeSingle()
          : { data: null, error: new Error('Não foi possível confirmar a clínica ou a chave desta tentativa.') };

        if (!verificacao.error && verificacao.data) {
          setBaixaIncerta(false);
          toast.info('O pagamento foi registrado antes da falha de conexão. Nenhum pagamento adicional foi criado.');
          queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
          queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
          queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] });
          queryClient.invalidateQueries({ queryKey: ['pagamentos-contas-receber'] });
          setChavesBaixa(keys => {
            const next = { ...keys };
            delete next[selectedConta.id];
            return next;
          });
          completePayment();
        } else {
          setBaixaIncerta(true);
          toast.warning('Não foi possível confirmar se o recebimento foi registrado.', {
            description: 'Os dados foram bloqueados. Clique em “Confirmar novamente” sem alterá-los; a mesma chave impede uma cobrança duplicada.',
            duration: 10000,
          });
        }
      }
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleEstornar = (conta: any) => navigate(`/contas/receber/${encodeURIComponent(conta.id)}/estorno`, {
    state: {
      returnTo: `${location.pathname}${location.search}`,
      restoreSearchTerm: searchTerm,
      restoreFilterCategoria: filterCategoria,
    },
  });

  const handleCancelar = (conta: any) => setContaParaCancelar(conta);

  const handleConfirmarCancelamento = async () => {
    if (!contaParaCancelar || cancelamentoSubmissionLock.current) return;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    cancelamentoSubmissionLock.current = true;
    setIsCancelandoConta(true);
    try {
      const { data: cancelado, error } = await (supabase as any).rpc('cancelar_lancamento_pendente', {
        p_lancamento_id: contaParaCancelar.id,
      });
      if (error) throw error;
      if (!cancelado) throw new Error('Esta conta já foi alterada ou não está mais pendente. Atualize a lista.');
      toast.success('Conta cancelada.');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      setContaParaCancelar(null);
    } catch (e: any) {
      toast.error(e.message || 'Erro');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    } finally {
      cancelamentoSubmissionLock.current = false;
      setIsCancelandoConta(false);
    }
  };

  const exportarExcel = async () => {
    const rows = filteredContas.map(c => ({
      Paciente: getPacienteNome(c),
      Descrição: c.descricao,
      Categoria: CATEGORIAS_MAP[c.categoria]?.label || c.categoria,
      Valor: c.valor,
      'Valor recebido': valorRecebidoConta(c),
      'Saldo em aberto': saldoDevedorConta(c),
      'Data de lançamento': c.data || '',
      Vencimento: c.data_vencimento || '',
      Status: c.vencido
        ? c.status === 'parcial' ? 'Atrasado · parcial' : STATUS_CONFIG.atrasado.label
        : STATUS_CONFIG[c.status || 'pendente']?.label || c.status,
      'Forma Pgto': FORMAS_PAGAMENTO.find(f => f.value === c.forma_pagamento)?.label || c.forma_pagamento || '',
      'Centro Custo': c.centro_custo || '',
      Competência: c.competencia || '',
      'Nº Documento': c.numero_documento || '',
    }));
    // `exportToExcel` já cuida do import dinâmico da lib de escrita.
    // Substituição do `xlsx@0.18.5` — SEC-001 (prototype pollution / ReDoS).
    const { exportToExcel } = await import('@/lib/excelExporter');
    await exportToExcel(rows, 'contas_receber', 'Contas a Receber');
    toast.success('Exportado com sucesso!');
  };

  if (isPaymentPage && isLoading) return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
  if (isPaymentPage && (contasQuery.isError || pagamentosQuery.isError)) return (
    <div className="space-y-5">
      <PageHeader title="Recebimento" description="Confira a conta antes de registrar um pagamento."
        actions={<Button type="button" variant="outline" onClick={returnToList}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas a receber</Button>} />
      <ErrorState title="Não foi possível carregar o recebimento" error={contasQuery.error || pagamentosQuery.error}
        onRetry={() => { void contasQuery.refetch(); void pagamentosQuery.refetch(); }} />
    </div>
  );
  if (!isWorkflowPage && isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
  if (!isWorkflowPage && contasQuery.isError) return <ErrorState title="Não foi possível carregar contas a receber" error={contasQuery.error} onRetry={() => void contasQuery.refetch()} />;
  if (!isWorkflowPage && pagamentosQuery.isError) return <ErrorState title="Não foi possível carregar os pagamentos" error={pagamentosQuery.error} onRetry={() => void pagamentosQuery.refetch()} />;

  return (
    <div className="flex flex-col gap-6 pb-8">
      {!isWorkflowPage && <>
      <PageHeader
        title="Contas a Receber"
        description={stats.countTotal === 0
          ? 'Acompanhe receitas e recebimentos da clínica'
          : `${fmt(stats.total)} total · ${stats.countAtrasado} vencida${stats.countAtrasado === 1 ? '' : 's'} · ${stats.countPendente} em aberto`}
        icon={<TrendingUp />}
        actions={
          <>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full shrink-0" onClick={() => navigate('/contas?tab=pagar')}>
            <ArrowUpRight className="h-4 w-4" /> Contas a Pagar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full shrink-0" onClick={() => navigate('/caixa-diario')}>
            <ArrowUpRight className="h-4 w-4" /> Caixa do Dia
          </Button>
          <Button variant="outline" size="icon" className="rounded-full shrink-0" onClick={exportarExcel}
            disabled={!exportacaoCompletaPermitida} aria-describedby={!exportacaoCompletaPermitida ? 'contas-receber-limite-aviso' : undefined}
            title="Exportar para Excel">
            <Download className="h-4 w-4" />
          </Button>
          <Button onClick={handleNew} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Nova Receita
          </Button>
          </>
        }
      />

      {(contasAtingiramLimite || pagamentosAtingiramLimite) && (
        <div id="contas-receber-limite-aviso" role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          A exportação fica desativada enquanto os dados estiverem incompletos.{' '}
          {contasAtingiramLimite && <>A leitura atingiu {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} contas; a lista pode estar incompleta e os totais não devem ser usados para fechamento. </>}
          {pagamentosAtingiramLimite && <>A leitura atingiu {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} pagamentos; o recebido pode estar incompleto. Consulte o Fluxo de Caixa para recebimentos por período.</>}
        </div>
      )}

      {/* Indicadores clicáveis */}
      <section role="group" aria-label="Resumo das contas a receber" className="order-1 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Resumo de recebimentos</h2>
          {selectedMonth && <span className="text-xs text-muted-foreground">{format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}</span>}
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-4 md:divide-y-0">
          {[
            { key: 'todos', label: 'Total em receitas', value: stats.total, color: 'text-foreground', caption: `${stats.countTotal} lançamento(s)` },
            { key: 'pendente', label: 'Em aberto', value: stats.pendente, color: 'text-warning-foreground', caption: `${stats.countPendente} conta(s)` },
            { key: 'atrasado', label: 'Vencidas / em atraso', value: stats.atrasado, color: 'text-destructive', caption: `${stats.countAtrasado} em atraso` },
            { key: 'pago', label: 'Recebido', value: stats.pago, color: 'text-success', caption: `${stats.countPago} conta(s)` },
          ].map(kpi => {
            const ativo = filterStatus === kpi.key;
            return (
              <button key={kpi.key} type="button" aria-pressed={ativo}
                onClick={() => setFilterStatus(ativo && kpi.key !== 'todos' ? 'todos' : kpi.key)}
                className={cn('min-h-[84px] min-w-0 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', ativo && 'bg-primary/5')}>
                <span className="block truncate text-xs font-medium text-muted-foreground">{kpi.label}</span>
                <span className={cn('mt-1 block whitespace-nowrap text-xl font-semibold tabular-nums', kpi.color)}>{fmt(kpi.value)}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{kpi.caption}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Gráficos compactos juntos quando ambos estão vazios */}
      {porCategoria.length === 0 && porFormaPgto.length === 0 ? (
        <Card className="order-4">
          <CardContent role="status" aria-label="Gráficos sem dados nas contas filtradas" className="grid gap-4 py-5 sm:grid-cols-2 sm:divide-x sm:divide-border">
            <section className="space-y-1 sm:pr-4">
              <h2 className="text-sm font-bold">Receita por Categoria</h2>
              <p className="text-sm text-foreground">Nenhuma receita ativa nas contas filtradas.</p>
              <p className="text-xs text-muted-foreground">Cadastre uma receita ou ajuste os filtros acima.</p>
            </section>
            <section className="space-y-1 sm:pl-4">
              <h2 className="text-sm font-bold">Recebido por Forma de Pagamento</h2>
              <p className="text-sm text-foreground">Nenhum recebimento nas contas filtradas.</p>
              <p className="text-xs text-muted-foreground">Registre a baixa de uma conta ou ajuste os filtros acima.</p>
            </section>
          </CardContent>
        </Card>
      ) : (
      <div className="order-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Por Categoria */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Receita por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {porCategoria.length === 0 ? (
              <div role="status" className="flex min-h-24 flex-col items-center justify-center gap-1 px-4 py-4 text-center">
                <p className="text-sm font-medium text-foreground">Nenhuma receita ativa nas contas filtradas</p>
                <p className="text-xs text-muted-foreground">Cadastre uma receita ou ajuste os filtros acima para preencher o gráfico.</p>
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porCategoria.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis type="number" tickFormatter={formatarEixoMonetario} className="text-[10px]" axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" width={100} className="text-[10px]" axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.75rem', fontSize: '0.7rem' }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Por Forma de Pagamento */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Recebido por Forma de Pagamento</CardTitle>
            <CardDescription>Pagamentos individuais nas contas filtradas</CardDescription>
          </CardHeader>
          <CardContent>
            {porFormaPgto.length === 0 ? (
              <div role="status" className="flex min-h-24 flex-col items-center justify-center gap-1 px-4 py-4 text-center">
                <p className="text-sm font-medium text-foreground">Nenhum recebimento nas contas filtradas</p>
                <p className="text-xs text-muted-foreground">Registre a baixa de uma conta ou ajuste os filtros acima.</p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-48 w-48 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={porFormaPgto} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={70} strokeWidth={2}>
                        {porFormaPgto.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.75rem', fontSize: '0.7rem' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 flex-1 min-w-0">
                  {porFormaPgto.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-bold tabular-nums shrink-0">{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Hero: conta mais urgente */}
      {destaqueReceita && (() => {
        const d = destaqueReceita;
        const status = d.vencido
          ? { ...STATUS_CONFIG.atrasado, label: d.status === 'parcial' ? 'Atrasado · parcial' : STATUS_CONFIG.atrasado.label }
          : STATUS_CONFIG[d.status || 'pendente'];
        const dataVenc = d.data_vencimento ? parseDateOnly(d.data_vencimento) : null;
        const diasVenc = dataVenc ? differenceInCalendarDays(dataVenc, hojeClinica) : null;
        return (
          <Card className={cn('order-2 overflow-hidden rounded-xl', d.vencido ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/5')}>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', d.vencido ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning-foreground')}>
                  {d.vencido ? <AlertCircle className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className={cn('text-[11px] font-semibold uppercase tracking-wide', d.vencido ? 'text-destructive' : 'text-warning-foreground')}>{d.vencido ? 'Receita vencida há mais tempo' : 'Próxima receita a vencer'}</p>
                  <h2 className="truncate text-lg font-bold text-foreground">{getPacienteNome(d)}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Calendar aria-hidden="true" className="h-3 w-3" /> {dataVenc ? `Venc. ${format(dataVenc, 'dd/MM/yyyy')}` : '—'}</span>
                    {diasVenc !== null && diasVenc < 0 && (
                      <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                        <Clock aria-hidden="true" className="h-3 w-3" /> {Math.abs(diasVenc)} dia(s) de atraso
                      </span>
                    )}
                    <Badge className={cn('rounded-full text-[10px]', status?.bg, status?.color, 'border-0')}>{status?.label}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={d.descricao}>{d.descricao}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="flex flex-col items-start sm:items-end">
                  <span className="text-[11px] text-muted-foreground">Saldo a receber</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{fmt(saldoDevedorConta(d))}</span>
                </span>
                {['pendente', 'atrasado', 'parcial'].includes(d.status) && (
                  <Button
                    size="sm"
                    onClick={() => handleDarBaixa(d)}
                    variant={d.vencido ? 'destructive' : 'default'}
                    className="h-9 gap-1 text-xs"
                  >
                    <Receipt aria-hidden="true" className="h-3.5 w-3.5" /> {d.status === 'parcial' ? 'Receber saldo' : 'Receber'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Lista de receitas */}
      <Card className="order-3 rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Receipt className="h-4 w-4" />
                </span>
                Receitas
                <Badge variant="outline" className="rounded-full border-border text-muted-foreground">{filteredContas.length} de {periodFilteredCount}</Badge>
              </CardTitle>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-72">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar contas a receber"
                    placeholder="Paciente, CPF, descrição ou documento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 rounded-full pl-9 focus-visible:ring-ring"
                  />
                </div>
                <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                  <SelectTrigger aria-label="Filtrar por categoria" className="h-10 w-auto rounded-full text-xs">
                    <Filter aria-hidden="true" className="mr-1 h-3 w-3 shrink-0" />
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas categorias</SelectItem>
                    {CATEGORIAS_RECEITA.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-1.5">
                {[
                  { key: 'todos', label: 'Todos' },
                  { key: 'aberto', label: 'Em aberto' },
                  { key: 'pendente', label: 'Pendentes' },
                  { key: 'parcial', label: 'Parciais' },
                  { key: 'atrasado', label: 'Vencidos' },
                  { key: 'pago', label: 'Recebidos' },
                  { key: 'cancelado', label: 'Cancelados' },
                ].map(opt => {
                  const ativo = filterStatus === opt.key;
                  return (
                    <button key={opt.key} type="button" aria-pressed={ativo}
                      onClick={() => setFilterStatus(opt.key)}
                      className={cn(PILL_BASE, ativo ? PILL_ATIVA : PILL_INATIVA)}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {selectedMonth && (
                <span className="inline-flex h-8 items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 text-xs font-medium text-foreground">
                  Vencimentos de {format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                  <button type="button" aria-label="Remover filtro de mês" onClick={() => setSearchParams(current => { const next = new URLSearchParams(current); next.delete('mes'); return next; })} className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-3 w-3" /></button>
                </span>
              )}
              <div role="group" aria-label="Filtrar por período" className="flex flex-wrap gap-1.5">
                {PERIODOS_RECEITA.map(opt => {
                  const ativo = filterPeriodo === opt.key;
                  return (
                    <button key={opt.key} type="button" aria-pressed={ativo}
                      onClick={() => setFilterPeriodo(opt.key)}
                      className={cn(PILL_BASE, ativo ? PILL_ATIVA : PILL_INATIVA)}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {(searchTerm.trim() || filterStatus !== 'todos' || filterCategoria !== 'todas' || filterPeriodo !== 'mes_atual') && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('todos');
                  setFilterCategoria('todas');
                  setFilterPeriodo('mes_atual');
                }}>
                  <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{filteredContas.length} de {periodFilteredCount}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredContas.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Receipt className="h-7 w-7" />
              </span>
              <p className="font-medium text-foreground">{contas.length === 0 ? 'Nenhuma receita cadastrada' : 'Nenhuma conta encontrada com estes filtros'}</p>
              <p className="mt-1 text-sm">
                {contas.length === 0 ? 'Cadastre uma receita para acompanhar recebimentos.' : 'Ajuste a busca, o status ou o período.'}
              </p>
              {contas.length === 0 ? (
                <Button size="sm" onClick={handleNew} className="mt-4 rounded-full"><Plus className="mr-1 h-4 w-4" /> Cadastrar receita</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('todos');
                  setFilterCategoria('todas');
                  setFilterPeriodo('mes_atual');
                }} className="mt-4 rounded-full">Limpar filtros</Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <Table className="md:min-w-[760px]" containerProps={{ role: 'region', 'aria-label': 'Tabela de receitas; use a rolagem horizontal para acessar todas as colunas', tabIndex: 0, className: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente / receita</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="hidden md:table-cell">Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContas.map(conta => {
                    const status = conta.vencido
                      ? { ...STATUS_CONFIG.atrasado, label: conta.status === 'parcial' ? 'Atrasado · parcial' : STATUS_CONFIG.atrasado.label }
                      : STATUS_CONFIG[conta.status || 'pendente'];
                    const categoria = CATEGORIAS_MAP[conta.categoria] || CATEGORIAS_MAP.outros;
                    const dataVencimento = conta.data_vencimento ? parseDateOnly(conta.data_vencimento) : null;
                    const diasAteVencimento = dataVencimento ? differenceInCalendarDays(dataVencimento, hojeClinica) : null;
                    const aberto = ['pendente', 'atrasado', 'parcial'].includes(conta.status);
                    const diasAtraso = diasAteVencimento === null ? null : Math.abs(diasAteVencimento);
                    const urgencia = conta.vencido && diasAtraso !== null
                      ? `Atrasada há ${diasAtraso} ${diasAtraso === 1 ? 'dia' : 'dias'}`
                      : aberto && diasAteVencimento === 0
                        ? 'Vence hoje'
                        : aberto && diasAteVencimento !== null && diasAteVencimento > 0 && diasAteVencimento <= 7
                          ? `Vence em ${diasAteVencimento} ${diasAteVencimento === 1 ? 'dia' : 'dias'}`
                          : null;
                    return (
                      <TableRow key={conta.id} className={cn(conta.vencido && 'bg-destructive/5')}>
                        <TableCell>
                          <p className="font-semibold">{getPacienteNome(conta)}</p>
                          <p className="mt-0.5 max-w-lg truncate text-xs text-muted-foreground" title={conta.descricao}>{conta.descricao}</p>
                          {conta.numero_documento && <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><FileText aria-hidden="true" className="h-3 w-3" />{conta.numero_documento}</p>}
                        </TableCell>
                        <TableCell>
                          <span className={cn('text-xs', conta.vencido ? 'font-medium text-destructive' : urgencia ? 'font-medium text-warning-foreground' : 'text-muted-foreground')}>
                            {dataVencimento ? `Vencimento ${format(dataVencimento, 'dd/MM/yyyy')}` : 'Vencimento não informado'}{urgencia && ` · ${urgencia}`}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm">{categoria?.label || conta.categoria}</span>
                          {conta.competencia && <p className="mt-0.5 text-[10px] text-muted-foreground">Comp. {conta.competencia}</p>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="font-medium">{fmt(conta.valor)}</span>
                          {saldoDevedorConta(conta) > 0 && Number(conta.valor_pago || 0) > 0 && <p className="mt-0.5 text-xs text-muted-foreground">Em aberto: {fmt(saldoDevedorConta(conta))}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('rounded-full text-[10px]', status?.bg, status?.color, 'border-0')}>{status?.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {['pendente', 'atrasado', 'parcial'].includes(conta.status) && (
                              <Button size="sm" onClick={() => handleDarBaixa(conta)} className="h-9 gap-1 text-xs">
                                <Receipt aria-hidden="true" className="h-3.5 w-3.5" /> {conta.status === 'parcial' ? 'Receber saldo' : 'Receber'}
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Mais ações da conta de ${getPacienteNome(conta)}`} className="h-9 w-9 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewDetail(conta)} className="gap-2">
                                  <Eye className="h-4 w-4" /> Ver Detalhes
                                </DropdownMenuItem>
                                {['pago', 'parcial'].includes(conta.status) && (
                                  <DropdownMenuItem onClick={() => handleEstornar(conta)} className="gap-2 text-destructive">
                                    <Repeat className="h-4 w-4" />
                                    Estornar pagamento
                                  </DropdownMenuItem>
                                )}
                                {(conta.status === 'pendente' || conta.status === 'atrasado') && (
                                  <DropdownMenuItem onClick={() => handleCancelar(conta)} className="gap-2 text-destructive">
                                    <AlertCircle className="h-4 w-4" /> Cancelar
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </>}

      {isCreationPage && (
        <main data-testid="receivable-create-page" className="space-y-5">
          <PageHeader
            title="Nova receita"
            description="Registre uma receita, vincule o paciente se necessário e acompanhe o vencimento."
            icon={<Plus />}
            actions={(
              <Button type="button" variant="outline" onClick={returnToList} disabled={isSubmitting}>
                <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas a receber
              </Button>
            )}
          />
          <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-6">
          <fieldset disabled={isSubmitting} className="space-y-5 border-0 p-0" aria-busy={isSubmitting}>
            {/* Categoria visual selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider">Tipo de Receita *</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {CATEGORIAS_RECEITA.slice(0, 8).map(cat => {
                  const CIcon = cat.icon;
                  const isSelected = formData.categoria === cat.value;
                  return (
                    <button key={cat.value} type="button"
                      aria-pressed={isSelected}
                      onClick={() => updateFormData({ categoria: cat.value })}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs transition-all',
                        isSelected ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm' : 'border-border hover:border-primary/30 hover:bg-muted/50 text-muted-foreground'
                      )}>
                      <CIcon className={cn('h-4 w-4', isSelected ? 'text-primary' : cat.color)} />
                      <span className="text-[10px] text-center leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
              <Select value={formData.categoria} onValueChange={v => updateFormData({ categoria: v })}>
                <SelectTrigger id="receita-categoria" aria-label="Tipo de receita" className="h-8 text-xs mt-1">
                  <SelectValue placeholder="Ou selecione outra categoria..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_RECEITA.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Paciente */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="receita-paciente" className="text-xs">Paciente (opcional)</Label>
                {formData.paciente_id && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => updateFormData({ paciente_id: '' })}
                  >
                    Remover vínculo
                  </Button>
                )}
              </div>
              <PacienteCombobox
                id="receita-paciente"
                value={formData.paciente_id}
                onChange={id => updateFormData({ paciente_id: id })}
                placeholder="Buscar por nome, CPF ou telefone..."
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Textarea aria-label="Descricao da receita" required value={formData.descricao} onChange={e => updateFormData({ descricao: e.target.value })} placeholder="Detalhe o serviço..." rows={2} />
            </div>

            {/* Valor + Vencimento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$) *</Label>
                <Input aria-label="Valor da receita em reais" type="text" inputMode="decimal" placeholder="0,00" value={formData.valor} onChange={e => updateFormData({ valor: e.target.value })} />
                {formData.valor.trim() && valorReceitaInvalido && <p className="text-xs text-destructive" role="alert">Informe um valor maior que zero, com até duas casas decimais.</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vencimento</Label>
                <Input aria-label="Vencimento da receita" type="date" value={formData.data_vencimento} onChange={e => updateFormData({ data_vencimento: e.target.value })} />
              </div>
            </div>

            {/* Forma pgto + Centro custo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={formData.forma_pagamento} onValueChange={v => updateFormData({ forma_pagamento: v })}>
                  <SelectTrigger aria-label="Forma de pagamento ou centro de custo"><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Centro de Custo</Label>
                <Select value={formData.centro_custo} onValueChange={v => updateFormData({ centro_custo: v })}>
                  <SelectTrigger aria-label="Centro de custo"><SelectValue /></SelectTrigger>
                  <SelectContent>{CENTROS_CUSTO_RECEITA.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Competência + Nº Documento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Competência</Label>
                <Input aria-label="Competencia da receita" type="month" value={formData.competencia} onChange={e => updateFormData({ competencia: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nº Documento / NF</Label>
                <Input aria-label="Numero do documento da receita" value={formData.numero_documento} onChange={e => updateFormData({ numero_documento: e.target.value })} placeholder="Opcional" />
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea aria-label="Observacoes da receita" value={formData.observacoes} onChange={e => updateFormData({ observacoes: e.target.value })} placeholder="Observações adicionais..." rows={2} />
            </div>
          </fieldset>
          </section>
          <footer className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={returnToList} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting || valorReceitaInvalido} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Salvar receita
            </Button>
          </footer>
          </form>
          <UnsavedChangesDialog
            open={blocker.state === 'blocked'}
            onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }}
            onConfirm={() => {
              if (blocker.state === 'blocked') {
                navigationAllowedRef.current = true;
                setFormDirty(false);
                blocker.proceed();
              }
            }}
          />
        </main>
      )}

      {isPaymentPage && (
        <main data-testid="receivable-payment-page" className="space-y-5">
          <PageHeader
            title="Confirmar Recebimento"
            description="Confira o saldo e registre o pagamento no caixa aberto."
            icon={<Receipt />}
            actions={(
              <Button type="button" variant="outline" onClick={returnToList} disabled={isSubmitting || baixaIncerta}>
                <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas a receber
              </Button>
            )}
          />

          {(!selectedConta || paymentPageInvalid) ? (
            <section role="alert" className="rounded-2xl border border-warning/40 bg-warning/5 p-5 text-sm text-warning-foreground">
              <p className="font-semibold">{selectedConta ? 'Esta conta não possui saldo disponível para recebimento.' : 'Conta não encontrada.'}</p>
              <p className="mt-1">Atualize as contas ou retorne à lista para escolher outro lançamento.</p>
              <Button type="button" variant="outline" className="mt-4" onClick={returnToList}>Voltar às contas a receber</Button>
            </section>
          ) : (
            <>
              <section className="rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="Resumo da conta">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{getPacienteNome(selectedConta)}</p>
                    <h2 className="mt-1 break-words text-lg font-semibold text-foreground">{selectedConta.descricao}</h2>
                    <Badge variant="outline" className="mt-2">{CATEGORIAS_MAP[selectedConta.categoria]?.label || selectedConta.categoria}</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Saldo em aberto</p>
                    <p className="text-2xl font-bold tabular-nums">{fmt(saldoDevedorConta(selectedConta))}</p>
                  </div>
                </div>
                <Separator className="my-4" />
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted-foreground">Valor original</dt><dd className="mt-1 font-semibold tabular-nums">{fmt(Number(selectedConta.valor))}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Já recebido</dt><dd className="mt-1 font-semibold tabular-nums">{fmt(valorRecebidoConta(selectedConta))}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Vencimento</dt><dd className="mt-1 font-semibold">{selectedConta.data_vencimento ? format(parseDateOnly(selectedConta.data_vencimento)!, 'dd/MM/yyyy') : '—'}</dd></div>
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                <MercadoPagoPointPayment
                  clinicId={profile?.clinica_id}
                  lancamentoId={selectedConta.id}
                  open={isPaymentPage}
                  disabled={isSubmitting || baixaIncerta
                    || parseMoneyInput(baixaData.desconto) === null
                    || parseMoneyInput(baixaData.acrescimo) === null
                    || Number(parseMoneyInput(baixaData.desconto) ?? 0) !== Number(selectedConta.desconto ?? 0)
                    || Number(parseMoneyInput(baixaData.acrescimo) ?? 0) !== Number(selectedConta.acrescimo ?? 0)}
                  saldo={Math.max(0, saldoDevedorConta(selectedConta))}
                  onPendingChange={setPointBlocksManual}
                />
                <form onSubmit={event => { event.preventDefault(); void handleConfirmarBaixa(); }} className="space-y-5">
                  <fieldset disabled={isSubmitting || baixaIncerta} className="space-y-5 border-0 p-0" aria-busy={isSubmitting}>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide">Forma de pagamento *</Label>
                      <Select value={baixaData.forma_pagamento} onValueChange={value => updateBaixaData({ forma_pagamento: value })}>
                        <SelectTrigger aria-label="Forma de pagamento"><SelectValue /></SelectTrigger>
                        <SelectContent>{FORMAS_PAGAMENTO.map(forma => <SelectItem key={forma.value} value={forma.value}>{forma.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="contas-receber-desconto" className="text-xs">Desconto (R$)</Label>
                        <Input id="contas-receber-desconto" type="text" inputMode="decimal" value={baixaData.desconto} onChange={event => updateBaixaData({ desconto: event.target.value })} />
                        {baixaData.desconto.trim() && parseMoneyInput(baixaData.desconto) === null && <p className="text-xs text-destructive" role="alert">Valor inválido.</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="contas-receber-acrescimo" className="text-xs">Acréscimo (R$)</Label>
                        <Input id="contas-receber-acrescimo" type="text" inputMode="decimal" value={baixaData.acrescimo} onChange={event => updateBaixaData({ acrescimo: event.target.value })} />
                        {baixaData.acrescimo.trim() && parseMoneyInput(baixaData.acrescimo) === null && <p className="text-xs text-destructive" role="alert">Valor inválido.</p>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="contas-receber-valor-parcial" className="text-xs">Valor recebido (R$)</Label>
                        {baixaData.valorReceber !== null && <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => updateBaixaData({ valorReceber: null })}>Receber saldo total</Button>}
                      </div>
                      <Input id="contas-receber-valor-parcial" type="text" inputMode="decimal" value={baixaData.valorReceber ?? formatMoneyInput(valorFinal)} onChange={event => updateBaixaData({ valorReceber: event.target.value })} />
                      {baixaData.valorReceber !== null && pagamentoBaixaInvalido && <p className="text-xs text-destructive" role="alert">O valor deve ser maior que zero e não pode ultrapassar o saldo disponível.</p>}
                      <p className="text-xs text-muted-foreground">Saldo após este recebimento: {Number.isFinite(saldoAposRecebimento) ? fmt(Math.max(0, saldoAposRecebimento)) : '—'}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contas-receber-observacoes" className="text-xs">Observações</Label>
                      <Textarea id="contas-receber-observacoes" value={baixaData.observacoes} onChange={event => updateBaixaData({ observacoes: event.target.value })} placeholder="Opcional" rows={3} />
                    </div>
                  </fieldset>
                  {baixaIncerta && <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">O resultado ainda não foi confirmado. Confirme novamente esta mesma tentativa; a chave de idempotência impede duplicar o pagamento.</div>}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/20 bg-success/5 p-4">
                    <span className="text-sm font-semibold text-success">Valor deste recebimento</span>
                    <span className="text-2xl font-bold tabular-nums text-success">{valorDoPagamento !== null && Number.isFinite(valorDoPagamento) ? fmt(valorDoPagamento) : '—'}</span>
                  </div>
                  <footer className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={returnToList} disabled={isSubmitting || baixaIncerta}>Cancelar</Button>
                    <Button type="submit" disabled={isSubmitting || pointBlocksManual || pagamentoBaixaInvalido || descontoBaixa === null || acrescimoBaixa === null} className="gap-2 bg-success text-success-foreground hover:bg-success/90">
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {baixaIncerta ? 'Confirmar novamente' : 'Confirmar recebimento'}
                    </Button>
                  </footer>
                </form>
              </section>
            </>
          )}
          <UnsavedChangesDialog
            open={blocker.state === 'blocked' && isPaymentPage && !baixaIncerta}
            onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }}
            onConfirm={() => {
              if (blocker.state === 'blocked' && !baixaIncerta) {
                navigationAllowedRef.current = true;
                setBaixaDirty(false);
                blocker.proceed();
              }
            }}
          />
        </main>
      )}

      <Dialog
        open={!!contaParaCancelar}
        onOpenChange={(open) => { if (!open && !isCancelandoConta) setContaParaCancelar(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar conta a receber?</DialogTitle>
            <DialogDescription>
              {contaParaCancelar && (
                <>A conta “{contaParaCancelar.descricao}” de {fmt(Number(contaParaCancelar.valor))} será cancelada. Esta ação só se aplica a contas sem pagamento registrado.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContaParaCancelar(null)} disabled={isCancelandoConta}>Manter conta</Button>
            <Button onClick={handleConfirmarCancelamento} disabled={isCancelandoConta} className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isCancelandoConta && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
