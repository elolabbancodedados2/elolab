import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Check, DollarSign, AlertCircle, Receipt, Calendar, Download, Clock,
  TrendingUp, User, Loader2, Eye, FileText, Printer, MoreHorizontal, Filter,
  ArrowUpRight, Banknote, CreditCard, QrCode, Landmark, Building2, Stethoscope,
  FlaskConical, Repeat, Scissors, Pill, Baby, Heart, Bone, Brain,
} from 'lucide-react';
import { format, differenceInCalendarDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { valorRecebidoDaConta } from '@/lib/contasReceber';
import { ErrorState } from '@/components/ErrorState';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { mensagemDeErro } from '@/lib/erros';

type StatusPagamento = Database['public']['Enums']['status_pagamento'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  pendente: { label: 'Pendente', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', icon: Clock },
  parcial: { label: 'Parcial', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', icon: Clock },
  pago: { label: 'Recebido', color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', icon: Check },
  atrasado: { label: 'Atrasado', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', icon: AlertCircle },
  cancelado: { label: 'Cancelado', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', icon: AlertCircle },
  estornado: { label: 'Estornado', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', icon: Repeat },
};

const CATEGORIAS_RECEITA = [
  { value: 'consulta', label: 'Consulta Médica', icon: Stethoscope, color: 'text-primary' },
  { value: 'retorno', label: 'Retorno', icon: Repeat, color: 'text-info' },
  { value: 'procedimento', label: 'Procedimento', icon: Scissors, color: 'text-primary' },
  { value: 'exame', label: 'Exame / Diagnóstico', icon: FlaskConical, color: 'text-warning' },
  { value: 'cirurgia', label: 'Cirurgia / Intervenção', icon: Heart, color: 'text-destructive' },
  { value: 'internacao', label: 'Internação', icon: Building2, color: 'text-warning' },
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

const PIE_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))',
  'hsl(var(--destructive))', 'hsl(var(--info))', 'hsl(var(--accent-foreground))',
  'hsl(var(--muted-foreground))', 'hsl(var(--primary))',
];

export default function ContasReceber() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterCategoria, setFilterCategoria] = useState('todas');
  const [filterPeriodo, setFilterPeriodo] = useState('mes_atual');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPagamentoOpen, setIsPagamentoOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEstornoOpen, setIsEstornoOpen] = useState(false);
  const [carregandoPagamentosEstorno, setCarregandoPagamentosEstorno] = useState(false);
  const [isEstornando, setIsEstornando] = useState(false);
  const [contaEstorno, setContaEstorno] = useState<any>(null);
  const [pagamentosEstornaveis, setPagamentosEstornaveis] = useState<PagamentoEstornavel[]>([]);
  const [pagamentoEstornoId, setPagamentoEstornoId] = useState('');
  const [motivoEstorno, setMotivoEstorno] = useState('');
  const [contaParaCancelar, setContaParaCancelar] = useState<any>(null);
  const [isCancelandoConta, setIsCancelandoConta] = useState(false);
  const [selectedConta, setSelectedConta] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(novoFormDataReceita);
  const valorReceitaDigitado = parseMoneyInput(formData.valor);
  const valorReceitaInvalido = valorReceitaDigitado === null || valorReceitaDigitado <= 0;
  const [baixaData, setBaixaData] = useState<BaixaData>({
    forma_pagamento: 'pix',
    desconto: '0,00', acrescimo: '0,00', valorReceber: null, observacoes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [baixaIncerta, setBaixaIncerta] = useState(false);
  const submissionLock = useRef(false);
  const estornoSubmissionLock = useRef(false);
  const cancelamentoSubmissionLock = useRef(false);
  const [chavesBaixa, setChavesBaixa] = useState<Record<string, string>>({});

  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const contasQuery = useQuery({
    queryKey: ['lancamentos', 'receita', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      // Em blocos: sem paginar, o servidor devolvia só as 1000 primeiras contas.
      const data = await buscarEmBlocos<any>(() => supabase
        .from('lancamentos')
        .select('*, pacientes(nome,nome_social,cpf,telefone,email)')
        .eq('tipo', 'receita')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }));
      const today = todaySaoPauloDateOnly();
      return data.map(conta => {
        const vencido = ['pendente', 'parcial'].includes(conta.status) && !!conta.data_vencimento && conta.data_vencimento < today;
        return { ...conta, vencido, status: vencido && conta.status === 'pendente' ? 'atrasado' as StatusPagamento : conta.status };
      });
    },
    enabled: !!user && !!profile?.clinica_id,
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
    enabled: !!profile?.clinica_id,
  });
  const pagamentos = pagamentosQuery.data ?? [];
  const pagamentosAtingiramLimite = pagamentos.length >= LIMITE_BUSCA_EM_BLOCOS;
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
  const valorRecebidoConta = (conta: any) => {
    const pagamentosAtivos = pagamentosAtivosPorLancamento.get(conta.id) ?? [];
    return valorRecebidoDaConta(
      conta,
      !pagamentosAtingiramLimite,
      lancamentosComPagamento.has(conta.id),
      pagamentosAtivos.reduce((total, pagamento) => total + Number(pagamento.valor || 0), 0),
    );
  };
  const saldoDevedorConta = (conta: any) => Math.max(
    0,
    Number(conta.valor || 0) - Number(conta.desconto || 0) + Number(conta.acrescimo || 0) - valorRecebidoConta(conta),
  );

  const isLoading = contasQuery.isLoading || pagamentosQuery.isLoading;
  const hojeClinica = parseDateOnly(todaySaoPauloDateOnly())!;

  // Period filter
  const periodoRange = useMemo(() => {
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
  }, [filterPeriodo]);

  const filteredContas = useMemo(() => {
    return contas.filter(c => {
      const paciente = (c as any).pacientes;
      const matchSearch =
        pacienteCorresponde(paciente || {}, searchTerm) ||
        String(c.descricao || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(c.categoria || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(c.numero_documento || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'todos' || (filterStatus === 'atrasado' ? c.vencido : c.status === filterStatus);
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

  const stats = useMemo(() => {
    const filtered = filteredContas;
    return {
      total: filtered.filter(c => c.status !== 'cancelado' && c.status !== 'estornado').reduce((a, c) => a + c.valor, 0),
      pendente: filtered.filter(c => ['pendente', 'parcial'].includes(c.status || '') && !c.vencido).reduce((a, c) => a + saldoDevedorConta(c), 0),
      atrasado: filtered.filter(c => c.vencido).reduce((a, c) => a + saldoDevedorConta(c), 0),
      pago: filtered.filter(c => c.status === 'pago' || c.status === 'parcial').reduce((a, c) => a + valorRecebidoConta(c), 0),
      countPendente: filtered.filter(c => ['pendente', 'parcial'].includes(c.status || '') && !c.vencido).length,
      countAtrasado: filtered.filter(c => c.vencido).length,
      countPago: filtered.filter(c => c.status === 'pago' || c.status === 'parcial').length,
      countTotal: filtered.length,
    };
  }, [filteredContas, lancamentosComPagamento, pagamentosAtivosPorLancamento, pagamentosAtingiramLimite]);

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
    setFormData(novoFormDataReceita());
    setIsFormOpen(true);
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
      setIsFormOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDarBaixa = (conta: any) => {
    setBaixaIncerta(false);
    setSelectedConta(conta);
    setChavesBaixa(keys => ({ ...keys, [conta.id]: keys[conta.id] || crypto.randomUUID() }));
    setBaixaData({
      forma_pagamento: conta.forma_pagamento || 'pix',
      desconto: formatMoneyInput(Number(conta.desconto || 0)),
      acrescimo: formatMoneyInput(Number(conta.acrescimo || 0)),
      valorReceber: null, observacoes: '',
    });
    setIsPagamentoOpen(true);
  };

  const handleViewDetail = (conta: any) => {
    setSelectedConta(conta);
    setIsDetailOpen(true);
  };

  const descontoBaixa = baixaData.desconto.trim() === '' ? 0 : parseMoneyInput(baixaData.desconto);
  const acrescimoBaixa = baixaData.acrescimo.trim() === '' ? 0 : parseMoneyInput(baixaData.acrescimo);
  const valorFinal = useMemo(() => {
    if (!selectedConta) return 0;
    if (descontoBaixa === null || acrescimoBaixa === null) return Number.NaN;
    return selectedConta.valor - descontoBaixa + acrescimoBaixa - valorRecebidoConta(selectedConta);
  }, [selectedConta, descontoBaixa, acrescimoBaixa, lancamentosComPagamento, pagamentosAtivosPorLancamento, pagamentosAtingiramLimite]);
  const valorDoPagamento = baixaData.valorReceber === null ? valorFinal : parseMoneyInput(baixaData.valorReceber);
  const saldoAposRecebimento = valorDoPagamento === null ? Number.NaN : valorFinal - valorDoPagamento;
  const pagamentoBaixaInvalido = !Number.isFinite(valorFinal) || valorFinal <= 0
    || valorDoPagamento === null || valorDoPagamento <= 0 || valorDoPagamento > valorFinal;

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
      setIsPagamentoOpen(false);
      setBaixaIncerta(false);
      setChavesBaixa(keys => {
        const next = { ...keys };
        delete next[selectedConta.id];
        return next;
      });
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
          setIsPagamentoOpen(false);
          setChavesBaixa(keys => {
            const next = { ...keys };
            delete next[selectedConta.id];
            return next;
          });
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

  const handleEstornar = async (conta: any) => {
    try {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      setCarregandoPagamentosEstorno(true);
      const data = await buscarEmBlocos<PagamentoEstornavel>(
        () => supabase.from('pagamentos')
          .select('id, valor, forma_pagamento, data_pagamento, observacoes')
          .eq('lancamento_id', conta.id)
          .eq('clinica_id', profile.clinica_id)
          .is('estornado_em', null)
          .order('data_pagamento', { ascending: false })
          .order('id', { ascending: true }),
        { teto: LIMITE_BUSCA_EM_BLOCOS + 1 },
      );
      if (data.length > LIMITE_BUSCA_EM_BLOCOS) {
        throw new Error(`Esta conta ultrapassa ${LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} pagamentos ativos. Consulte o financeiro antes de estornar.`);
      }
      if (!data.length) {
        throw new Error('Esta conta não tem um pagamento individual registrado para estornar. Registros antigos precisam ser conferidos pelo financeiro antes de qualquer ajuste.');
      }
      setContaEstorno(conta);
      setPagamentosEstornaveis(data);
      setPagamentoEstornoId(data[0].id);
      setMotivoEstorno('');
      setIsEstornoOpen(true);
    } catch (e: any) {
      toast.error('Não foi possível preparar o estorno.', { description: mensagemDeErro(e) });
    } finally {
      setCarregandoPagamentosEstorno(false);
    }
  };

  const handleConfirmarEstorno = async () => {
    if (estornoSubmissionLock.current) return;
    if (!pagamentoEstornoId) {
      toast.error('Selecione o pagamento que será estornado.');
      return;
    }
    if (motivoEstorno.trim().length < 5) {
      toast.error('Informe o motivo do estorno (mínimo 5 caracteres).');
      return;
    }

    estornoSubmissionLock.current = true;
    setIsEstornando(true);
    try {
      const { data, error } = await supabase.rpc('estornar_pagamento', {
        p_pagamento_id: pagamentoEstornoId,
        p_motivo: motivoEstorno.trim(),
      });
      if (error) throw error;
      const resultado = data as any;
      if (!resultado?.success) throw new Error(resultado?.error || 'O pagamento não foi estornado.');

      const pagamento = pagamentosEstornaveis.find(item => item.id === pagamentoEstornoId);
      toast.success('Estorno registrado.', {
        description: `${pagamento ? fmt(Number(pagamento.valor)) : 'Pagamento'} estornado. A conta foi recalculada.`,
      });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] });
      queryClient.invalidateQueries({ queryKey: ['pagamentos-contas-receber'] });
      setIsEstornoOpen(false);
      setContaEstorno(null);
      setPagamentosEstornaveis([]);
      setPagamentoEstornoId('');
      setMotivoEstorno('');
    } catch (e: any) {
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['pagamentos-contas-receber'] });
      toast.error('Não foi possível estornar o pagamento.', { description: mensagemDeErro(e) });
    } finally {
      estornoSubmissionLock.current = false;
      setIsEstornando(false);
    }
  };

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
      const { data: cancelado, error } = await supabase.from('lancamentos').update({
        status: 'cancelado' as StatusPagamento,
      }).eq('id', contaParaCancelar.id).eq('clinica_id', profile.clinica_id)
        .in('status', ['pendente', 'atrasado']).select('id').maybeSingle();
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

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
  if (contasQuery.isError) return <ErrorState title="Não foi possível carregar contas a receber" error={contasQuery.error} onRetry={() => void contasQuery.refetch()} />;
  if (pagamentosQuery.isError) return <ErrorState title="Não foi possível carregar os pagamentos" error={pagamentosQuery.error} onRetry={() => void pagamentosQuery.refetch()} />;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-success" /> Contas a Receber
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Receitas detalhadas — período por data de lançamento · {stats.countTotal} lançamento(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportarExcel}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button onClick={handleNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova Receita
          </Button>
        </div>
      </div>

      {(contasAtingiramLimite || pagamentosAtingiramLimite) && (
        <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          {contasAtingiramLimite && <>A leitura atingiu {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} contas; a lista pode estar incompleta e os totais não devem ser usados para fechamento. </>}
          {pagamentosAtingiramLimite && <>A leitura atingiu {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} pagamentos; o recebido pode estar incompleto. Consulte o Fluxo de Caixa para recebimentos por período.</>}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Geral', value: stats.total, icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
          { label: 'Em aberto', value: stats.pendente, icon: Clock, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', count: stats.countPendente },
          { label: 'Vencido', value: stats.atrasado, icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', count: stats.countAtrasado },
          { label: 'Recebido nas contas filtradas', value: stats.pago, icon: Check, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', count: stats.countPago },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className={cn('border', s.border)}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{s.label}</p>
                    <p className={cn('text-xl font-black mt-0.5 tabular-nums', s.color)}>{fmt(s.value)}</p>
                    {s.count !== undefined && s.count > 0 && (
                      <p className="text-[10px] text-muted-foreground">{s.count} conta(s)</p>
                    )}
                  </div>
                  <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', s.bg)}>
                    <s.icon className={cn('h-5 w-5', s.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por Categoria */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Receita por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {porCategoria.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porCategoria.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis type="number" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} className="text-[10px]" axisLine={false} tickLine={false} />
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
              <p className="text-sm text-muted-foreground text-center py-8">Sem recebimentos</p>
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

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Tabs value={filterStatus} onValueChange={setFilterStatus} className="w-auto">
          <TabsList className="h-9">
            <TabsTrigger value="todos" className="text-xs px-3">Todos</TabsTrigger>
            <TabsTrigger value="pendente" className="text-xs px-3 gap-1"><Clock className="h-3 w-3" /> Pendentes</TabsTrigger>
            <TabsTrigger value="parcial" className="text-xs px-3 gap-1"><Clock className="h-3 w-3" /> Parciais</TabsTrigger>
            <TabsTrigger value="atrasado" className="text-xs px-3 gap-1"><AlertCircle className="h-3 w-3" /> Vencidos</TabsTrigger>
            <TabsTrigger value="pago" className="text-xs px-3 gap-1"><Check className="h-3 w-3" /> Recebidos</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={filterCategoria} onValueChange={setFilterCategoria}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas categorias</SelectItem>
            {CATEGORIAS_RECEITA.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger aria-label="Filtrar contas pelo mês de vencimento" className="w-[150px] h-9 text-xs">
            <Calendar className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mes_atual">Mês Atual</SelectItem>
            <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
            <SelectItem value="ultimos_3">Últimos 3 meses</SelectItem>
            <SelectItem value="ultimos_6">Últimos 6 meses</SelectItem>
            <SelectItem value="todos">Todo período</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Paciente, CPF, telefone, descrição ou documento..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {filteredContas.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Receipt className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="font-bold">{contas.length === 0 ? 'Nenhuma receita cadastrada' : 'Nenhuma conta encontrada com estes filtros'}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {contas.length === 0 ? 'Cadastre uma receita para acompanhar recebimentos.' : 'Limpe a busca e os filtros para ver outras contas.'}
                  </p>
                  {contas.length === 0 ? (
                    <Button size="sm" onClick={handleNew} className="mt-4">Cadastrar receita</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => {
                      setSearchTerm('');
                      setFilterStatus('todos');
                      setFilterCategoria('todas');
                      setFilterPeriodo('todos');
                    }} className="mt-4">Limpar filtros</Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            filteredContas.map((conta, i) => {
              const status = conta.vencido
                ? { ...STATUS_CONFIG.atrasado, label: conta.status === 'parcial' ? 'Atrasado · parcial' : STATUS_CONFIG.atrasado.label }
                : STATUS_CONFIG[conta.status || 'pendente'];
              const catInfo = CATEGORIAS_MAP[conta.categoria] || CATEGORIAS_MAP.outros;
              const CatIcon = catInfo?.icon || DollarSign;
              const dataVencimento = conta.data_vencimento ? parseDateOnly(conta.data_vencimento) : null;
              const diasVenc = dataVencimento ? differenceInCalendarDays(dataVencimento, hojeClinica) : null;
              return (
                <motion.div key={conta.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
                  <Card className={cn('hover:shadow-md hover:-translate-y-0.5 transition-all group border', status?.border)}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {/* Category icon */}
                        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', status?.bg)}>
                          <CatIcon className={cn('h-5 w-5', catInfo?.color || status?.color)} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm truncate">{getPacienteNome(conta)}</p>
                            <Badge variant="outline" className={cn('text-[9px] h-4 px-1.5 shrink-0', catInfo?.color)}>
                              {catInfo?.label || conta.categoria}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{conta.descricao}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {conta.data_vencimento && (
                              <span className={cn('text-[10px] flex items-center gap-0.5',
                                diasVenc !== null && diasVenc < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground/60'
                              )}>
                                <Calendar className="h-2.5 w-2.5" />
                                {format(new Date(conta.data_vencimento + 'T12:00:00'), 'dd/MM/yy')}
                                {diasVenc !== null && diasVenc < 0 && ` (${Math.abs(diasVenc)}d)`}
                                {diasVenc !== null && diasVenc === 0 && ' (hoje)'}
                              </span>
                            )}
                            {conta.competencia && (
                              <span className="text-[10px] text-muted-foreground/50">Comp: {conta.competencia}</span>
                            )}
                            {conta.centro_custo && conta.centro_custo !== 'geral' && (
                              <span className="text-[10px] text-muted-foreground/50">{CENTROS_CUSTO_RECEITA.find(c => c.value === conta.centro_custo)?.label || conta.centro_custo}</span>
                            )}
                          </div>
                        </div>

                        {/* Value + Status */}
                        <div className="text-right shrink-0">
                          <p className={cn('text-lg font-black tabular-nums', status?.color)}>{fmt(conta.valor)}</p>
                          {conta.status === 'parcial' && <p className="text-[10px] text-muted-foreground">Saldo: {fmt(saldoDevedorConta(conta))}</p>}
                          <Badge className={cn('text-[10px]', status?.bg, status?.color, 'border-0')}>{status?.label}</Badge>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {['pendente', 'atrasado', 'parcial'].includes(conta.status) && (
                            <Button size="sm" onClick={() => handleDarBaixa(conta)}
                              className="gap-1 bg-success hover:bg-success/90 text-success-foreground font-bold text-xs px-3 shadow-lg shadow-success/20">
                              <Receipt className="h-3.5 w-3.5" /> {conta.status === 'parcial' ? 'Receber saldo' : 'Receber'}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Mais ações da conta" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetail(conta)} className="gap-2">
                                <Eye className="h-4 w-4" /> Ver Detalhes
                              </DropdownMenuItem>
                              {['pago', 'parcial'].includes(conta.status) && (
                                <DropdownMenuItem disabled={carregandoPagamentosEstorno} onClick={() => handleEstornar(conta)} className="gap-2 text-destructive">
                                  {carregandoPagamentosEstorno ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                                  {carregandoPagamentosEstorno ? 'Carregando pagamentos…' : 'Estornar pagamento'}
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
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Nova Receita Dialog */}
      <Dialog open={isFormOpen} onOpenChange={open => {
        if (open || !isSubmitting) setIsFormOpen(open);
      }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" aria-busy={isSubmitting}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Nova Receita
            </DialogTitle>
            <DialogDescription>Cadastre uma nova receita com todos os detalhes.</DialogDescription>
          </DialogHeader>
          <fieldset disabled={isSubmitting} className="space-y-4 border-0 p-0">
            {/* Categoria visual selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider">Tipo de Receita *</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {CATEGORIAS_RECEITA.slice(0, 8).map(cat => {
                  const CIcon = cat.icon;
                  const isSelected = formData.categoria === cat.value;
                  return (
                    <button key={cat.value} type="button"
                      onClick={() => setFormData({ ...formData, categoria: cat.value })}
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
              <Select value={formData.categoria} onValueChange={v => setFormData({ ...formData, categoria: v })}>
                <SelectTrigger className="h-8 text-xs mt-1">
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
                <Label className="text-xs">Paciente (opcional)</Label>
                {formData.paciente_id && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setFormData(current => ({ ...current, paciente_id: '' }))}
                  >
                    Remover vínculo
                  </Button>
                )}
              </div>
              <PacienteCombobox
                value={formData.paciente_id}
                onChange={id => setFormData(current => ({ ...current, paciente_id: id }))}
                placeholder="Buscar por nome, CPF ou telefone..."
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Textarea value={formData.descricao} onChange={e => setFormData({ ...formData, descricao: e.target.value })} placeholder="Detalhe o serviço..." rows={2} />
            </div>

            {/* Valor + Vencimento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$) *</Label>
                <Input type="text" inputMode="decimal" placeholder="0,00" value={formData.valor} onChange={e => setFormData({ ...formData, valor: e.target.value })} />
                {formData.valor.trim() && valorReceitaInvalido && <p className="text-xs text-destructive" role="alert">Informe um valor maior que zero, com até duas casas decimais.</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vencimento</Label>
                <Input type="date" value={formData.data_vencimento} onChange={e => setFormData({ ...formData, data_vencimento: e.target.value })} />
              </div>
            </div>

            {/* Forma pgto + Centro custo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={formData.forma_pagamento} onValueChange={v => setFormData({ ...formData, forma_pagamento: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Centro de Custo</Label>
                <Select value={formData.centro_custo} onValueChange={v => setFormData({ ...formData, centro_custo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CENTROS_CUSTO_RECEITA.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Competência + Nº Documento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Competência</Label>
                <Input type="month" value={formData.competencia} onChange={e => setFormData({ ...formData, competencia: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nº Documento / NF</Label>
                <Input value={formData.numero_documento} onChange={e => setFormData({ ...formData, numero_documento: e.target.value })} placeholder="Opcional" />
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea value={formData.observacoes} onChange={e => setFormData({ ...formData, observacoes: e.target.value })} placeholder="Observações adicionais..." rows={2} />
            </div>
          </fieldset>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSubmitting || valorReceitaInvalido} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Salvar Receita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dar Baixa Dialog */}
      <Dialog open={isPagamentoOpen} onOpenChange={open => {
        if (open || (!isSubmitting && !baixaIncerta)) setIsPagamentoOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <Receipt className="h-5 w-5" /> Confirmar Recebimento
            </DialogTitle>
            <DialogDescription>Registre o recebimento com o caixa do dia aberto.</DialogDescription>
          </DialogHeader>
          {selectedConta && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/50 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{getPacienteNome(selectedConta)}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedConta.descricao}</p>
                    <Badge variant="outline" className="text-[9px] mt-0.5">
                      {CATEGORIAS_MAP[selectedConta.categoria]?.label || selectedConta.categoria}
                    </Badge>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Valor original</span>
                  <span className="text-lg font-black tabular-nums">{fmt(selectedConta.valor)}</span>
                </div>
                {valorRecebidoConta(selectedConta) > 0 && <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Já recebido</span>
                  <span className="font-semibold tabular-nums">{fmt(valorRecebidoConta(selectedConta))}</span>
                </div>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider">Forma de Pagamento *</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {FORMAS_PAGAMENTO.slice(0, 4).map(fp => {
                    const FPIcon = fp.icon;
                    const isSelected = baixaData.forma_pagamento === fp.value;
                    return (
                      <button key={fp.value} type="button"
                        onClick={() => setBaixaData({ ...baixaData, forma_pagamento: fp.value })}
                        disabled={isSubmitting || baixaIncerta}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] transition-all disabled:cursor-wait disabled:opacity-50',
                          isSelected ? 'border-success bg-success/10 text-success font-bold' : 'border-border hover:border-success/30'
                        )}>
                        <FPIcon className="h-4 w-4" />
                        {fp.label}
                      </button>
                    );
                  })}
                </div>
                <Select value={baixaData.forma_pagamento} onValueChange={v => setBaixaData({ ...baixaData, forma_pagamento: v })} disabled={isSubmitting || baixaIncerta}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Desconto (R$)</Label>
                  <Input type="text" inputMode="decimal" placeholder="0,00" value={baixaData.desconto} onChange={e => setBaixaData({ ...baixaData, desconto: e.target.value })} className="h-8 text-xs" disabled={isSubmitting || baixaIncerta} />
                  {baixaData.desconto.trim() && parseMoneyInput(baixaData.desconto) === null && <p className="text-[10px] text-destructive" role="alert">Valor inválido.</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Acréscimo (R$)</Label>
                  <Input type="text" inputMode="decimal" placeholder="0,00" value={baixaData.acrescimo} onChange={e => setBaixaData({ ...baixaData, acrescimo: e.target.value })} className="h-8 text-xs" disabled={isSubmitting || baixaIncerta} />
                  {baixaData.acrescimo.trim() && parseMoneyInput(baixaData.acrescimo) === null && <p className="text-[10px] text-destructive" role="alert">Valor inválido.</p>}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="contas-receber-valor-parcial" className="text-[10px]">Valor recebido (R$)</Label>
                  {baixaData.valorReceber !== null && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={() => setBaixaData({ ...baixaData, valorReceber: null })} disabled={isSubmitting || baixaIncerta}>
                      Receber saldo total
                    </Button>
                  )}
                </div>
                <Input id="contas-receber-valor-parcial" type="text" inputMode="decimal" placeholder="0,00" value={baixaData.valorReceber ?? formatMoneyInput(valorFinal)} onChange={e => setBaixaData({ ...baixaData, valorReceber: e.target.value })} className="h-8 text-xs" disabled={isSubmitting || baixaIncerta} />
                {baixaData.valorReceber !== null && pagamentoBaixaInvalido && <p className="text-[10px] text-destructive" role="alert">O valor deve ser maior que zero e não pode ultrapassar o saldo disponível.</p>}
                <p className="text-[10px] text-muted-foreground">
                  Saldo após este recebimento: {Number.isFinite(saldoAposRecebimento) ? fmt(Math.max(0, saldoAposRecebimento)) : '—'}
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px]">Observações</Label>
                <Textarea value={baixaData.observacoes} onChange={e => setBaixaData({ ...baixaData, observacoes: e.target.value })} placeholder="Opcional..." rows={2} className="resize-none text-xs" disabled={isSubmitting || baixaIncerta} />
              </div>

              {baixaIncerta && (
                <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground">
                  O resultado do registro ainda não foi confirmado. Confirme novamente esta mesma tentativa sem criar outro pagamento.
                </div>
              )}

              <div className="rounded-xl bg-success/5 border border-success/20 p-4 flex justify-between items-center">
                <span className="text-sm font-bold uppercase tracking-wider text-success">Valor do recebimento</span>
                <span className="text-2xl font-black text-success tabular-nums">{valorDoPagamento !== null && Number.isFinite(valorDoPagamento) ? fmt(valorDoPagamento) : '—'}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsPagamentoOpen(false)} disabled={isSubmitting || baixaIncerta}>Cancelar</Button>
            <Button onClick={handleConfirmarBaixa} disabled={isSubmitting || pagamentoBaixaInvalido || descontoBaixa === null || acrescimoBaixa === null}
              className="gap-2 bg-success hover:bg-success/90 text-success-foreground font-bold shadow-lg shadow-success/25">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />} {baixaIncerta ? 'Confirmar novamente' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estorno individual com motivo auditável no banco */}
      <Dialog
        open={isEstornoOpen}
        onOpenChange={(open) => { if (!open && !isEstornando) setIsEstornoOpen(false); }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Estornar pagamento</DialogTitle>
            <DialogDescription>
              O estorno preserva o histórico, registra o motivo e recalcula o saldo da conta.
              {contaEstorno ? ` Conta: ${contaEstorno.descricao}.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Pagamento</Label>
              <Select value={pagamentoEstornoId} onValueChange={setPagamentoEstornoId} disabled={isEstornando}>
                <SelectTrigger><SelectValue placeholder="Selecione o pagamento" /></SelectTrigger>
                <SelectContent>
                  {pagamentosEstornaveis.map(pagamento => {
                    const forma = FORMAS_PAGAMENTO.find(item =>
                      item.value === pagamento.forma_pagamento || formaPagamentoRPC[item.value] === pagamento.forma_pagamento
                    )?.label || pagamento.forma_pagamento;
                    return (
                      <SelectItem key={pagamento.id} value={pagamento.id}>
                        {fmt(Number(pagamento.valor))} · {forma} · {format(new Date(pagamento.data_pagamento), 'dd/MM/yyyy HH:mm')}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motivo-estorno">Motivo do estorno *</Label>
              <Textarea
                id="motivo-estorno"
                value={motivoEstorno}
                onChange={event => setMotivoEstorno(event.target.value)}
                placeholder="Ex.: pagamento duplicado, forma de pagamento incorreta..."
                rows={3}
                disabled={isEstornando}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEstornoOpen(false)} disabled={isEstornando}>Voltar</Button>
            <Button onClick={handleConfirmarEstorno} disabled={isEstornando || motivoEstorno.trim().length < 5} className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isEstornando && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Detalhes da Conta
            </DialogTitle>
          </DialogHeader>
          {selectedConta && (() => {
            const status = STATUS_CONFIG[selectedConta.status || 'pendente'];
            const catInfo = CATEGORIAS_MAP[selectedConta.categoria] || CATEGORIAS_MAP.outros;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Paciente</p>
                    <p className="font-bold">{getPacienteNome(selectedConta)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Categoria</p>
                    <p className="font-medium">{catInfo?.label || selectedConta.categoria}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor</p>
                    <p className="font-black text-lg">{fmt(selectedConta.valor)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</p>
                    <Badge className={cn(status?.bg, status?.color, 'border-0')}>{status?.label}</Badge>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Vencimento</p>
                    <p>{selectedConta.data_vencimento ? format(new Date(selectedConta.data_vencimento + 'T12:00:00'), 'dd/MM/yyyy') : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Forma Pgto</p>
                    <p>{FORMAS_PAGAMENTO.find(f => f.value === selectedConta.forma_pagamento)?.label || selectedConta.forma_pagamento || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Competência</p>
                    <p>{selectedConta.competencia || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Centro Custo</p>
                    <p>{CENTROS_CUSTO_RECEITA.find(c => c.value === selectedConta.centro_custo)?.label || selectedConta.centro_custo || '—'}</p>
                  </div>
                  {selectedConta.numero_documento && (
                    <div className="col-span-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Nº Documento</p>
                      <p>{selectedConta.numero_documento}</p>
                    </div>
                  )}
                </div>
                {selectedConta.descricao && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Descrição</p>
                    <p className="text-sm">{selectedConta.descricao}</p>
                  </div>
                )}
                {selectedConta.observacoes && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Observações</p>
                    <p className="text-sm text-muted-foreground">{selectedConta.observacoes}</p>
                  </div>
                )}
                <Separator />
                <p className="text-[10px] text-muted-foreground">
                  Criado em: {selectedConta.created_at ? format(new Date(selectedConta.created_at), "dd/MM/yyyy 'às' HH:mm") : '—'}
                </p>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
}
