import { formatWithDatePreference as format } from '@/lib/datePreference';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, Check, DollarSign, AlertCircle, Calendar, FileText, CreditCard,
  Repeat, Building2, Loader2, X, ArrowUpRight, Clock, TrendingDown, Pencil, Ban, FileSpreadsheet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Database } from '@/integrations/supabase/types';
import { differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { HistoricoLancamentoButton } from '@/components/financeiro/HistoricoLancamentoButton';
import { ConfirmDialog, UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { exportToExcel } from '@/lib/excelExporter';
import { isValidDateOnly, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';
import { ErrorState } from '@/components/ErrorState';
import { parseAccountFilterStatus, parseFinanceMonth } from '@/lib/financeRouteState';

type StatusPagamento = Database['public']['Enums']['status_pagamento'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pendente: { label: 'Pendente', color: 'text-warning-foreground', bg: 'bg-warning/10', border: 'border-warning/20' },
  parcial: { label: 'Parcial', color: 'text-warning-foreground', bg: 'bg-warning/10', border: 'border-warning/20' },
  pago: { label: 'Pago', color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  atrasado: { label: 'Atrasado', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
  cancelado: { label: 'Cancelado', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
  estornado: { label: 'Estornado', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago', atrasado: 'Atrasado',
  cancelado: 'Cancelado', estornado: 'Estornado',
};

const CATEGORIAS = ['fornecedores', 'folha_pagamento', 'impostos', 'aluguel', 'servicos', 'equipamentos', 'marketing', 'outros'];
const CATEGORIAS_LABELS: Record<string, string> = {
  fornecedores: 'Fornecedores', folha_pagamento: 'Folha de Pagamento',
  impostos: 'Impostos', aluguel: 'Aluguel', servicos: 'Serviços',
  equipamentos: 'Equipamentos', marketing: 'Marketing', outros: 'Outros',
};
const FREQUENCIAS_RECURRENCIA: Record<string, string> = {
  semanal: 'semanal', quinzenal: 'quinzenal', mensal: 'mensal',
  bimestral: 'bimestral', trimestral: 'trimestral', anual: 'anual',
};

const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'dinheiro', label: 'Dinheiro' },
];

const CENTROS_CUSTO = ['geral', 'matriz', 'filial', 'estetica', 'odonto', 'laboratorio', 'administrativo'];
const CENTROS_CUSTO_LABELS: Record<string, string> = {
  geral: 'Geral', matriz: 'Unidade Matriz', filial: 'Unidade Filial',
  estetica: 'Estética', odonto: 'Odontologia', laboratorio: 'Laboratório',
  administrativo: 'Administrativo',
};

interface FormData {
  categoria: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  forma_pagamento: string;
  fornecedor: string;
  numero_documento: string;
  data_emissao: string;
  competencia: string;
  recorrente: boolean;
  frequencia_recorrencia: string;
  centro_custo: string;
  observacoes: string;
}

const novoFormDataDespesa = (): FormData => {
  const hoje = todaySaoPauloDateOnly();
  return {
    categoria: 'fornecedores', descricao: '', valor: 0,
    data_vencimento: hoje,
    forma_pagamento: 'pix', fornecedor: '', numero_documento: '',
    data_emissao: hoje,
    competencia: hoje.slice(0, 7),
    recorrente: false, frequencia_recorrencia: 'mensal',
    centro_custo: 'geral', observacoes: '',
  };
};

/**
 * Aceita `location.state.initial` (ex.: conta gerada por um pedido de compra
 * recebido). Só campos de texto e valor conhecidos são aproveitados.
 */
const formDataComInicial = (initial: unknown): FormData => {
  const base = novoFormDataDespesa();
  if (!initial || typeof initial !== 'object') return base;
  const dados = initial as Record<string, unknown>;
  const texto = (campo: 'categoria' | 'descricao' | 'fornecedor' | 'numero_documento' | 'observacoes') =>
    typeof dados[campo] === 'string' ? (dados[campo] as string).slice(0, 300) : base[campo];
  const valor = typeof dados.valor === 'number' && Number.isFinite(dados.valor) && dados.valor > 0 ? dados.valor : base.valor;
  const categoria = texto('categoria');
  return {
    ...base,
    categoria: CATEGORIAS.includes(categoria) ? categoria : base.categoria,
    descricao: texto('descricao'),
    fornecedor: texto('fornecedor'),
    numero_documento: texto('numero_documento'),
    observacoes: texto('observacoes'),
    valor,
  };
};

const saldoEmAberto = (conta: { valor: number | string; valor_pago?: number | string | null; desconto?: number | string | null; acrescimo?: number | string | null }) =>
  Math.max(0, Number(conta.valor || 0) - Number(conta.desconto || 0)
    + Number(conta.acrescimo || 0) - Number(conta.valor_pago || 0));

/** Só despesa em aberto e sem nenhum pagamento pode ser editada ou cancelada. */
const podeAlterarConta = (conta: { statusOriginal?: string | null; status?: string | null; valor_pago?: number | string | null }) =>
  ['pendente', 'atrasado'].includes(String(conta.statusOriginal ?? conta.status ?? '')) && Number(conta.valor_pago || 0) === 0;

const formDataDaConta = (conta: Record<string, any>): FormData => ({
  categoria: CATEGORIAS.includes(conta.categoria) ? conta.categoria : 'outros',
  descricao: conta.descricao ?? '',
  valor: Number(conta.valor) || 0,
  data_vencimento: conta.data_vencimento ?? '',
  forma_pagamento: conta.forma_pagamento ?? 'pix',
  fornecedor: conta.fornecedor ?? '',
  numero_documento: conta.numero_documento ?? '',
  data_emissao: conta.data_emissao ?? '',
  competencia: typeof conta.competencia === 'string' ? conta.competencia.slice(0, 7) : '',
  recorrente: Boolean(conta.recorrente),
  frequencia_recorrencia: conta.frequencia_recorrencia ?? 'mensal',
  centro_custo: conta.centro_custo ?? 'geral',
  observacoes: conta.observacoes ?? '',
});

const PILL_BASE_P = 'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const PILL_ATIVA_P = 'border-primary bg-primary text-primary-foreground';
const PILL_INATIVA_P = 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground';

export default function ContasPagar() {
  const location = useLocation();
  const routeState = location.state as { returnTo?: unknown; restoreSearchTerm?: unknown; initial?: unknown } | null;
  const isCreationPage = location.pathname === '/contas/pagar/nova';
  const editMatch = useMatch('/contas/pagar/:lancamentoId/editar');
  const editId = editMatch?.params.lancamentoId ?? null;
  const isEditPage = Boolean(editId);
  const isFormPage = isCreationPage || isEditPage;
  const returnToListPath = typeof routeState?.returnTo === 'string' && /^\/contas(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo
    : '/contas?tab=pagar';
  const restoreSearchTerm = typeof routeState?.restoreSearchTerm === 'string' ? routeState.restoreSearchTerm : '';
  const [searchTerm, setSearchTerm] = useState(restoreSearchTerm);
  const [searchParams, setSearchParams] = useSearchParams();
  const filterStatus = parseAccountFilterStatus(searchParams.get('status'));
  const selectedMonthParam = searchParams.get('mes');
  const selectedMonth = parseFinanceMonth(selectedMonthParam);
  const [formData, setFormData] = useState<FormData>(() => isCreationPage ? formDataComInicial(routeState?.initial) : novoFormDataDespesa());
  const [formDirty, setFormDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const navigationAllowedRef = useRef(false);

  const navigate = useNavigate();
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !navigationAllowedRef.current && isFormPage && formDirty && !isSubmitting
      && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => { navigationAllowedRef.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!isFormPage || !formDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [formDirty, isFormPage]);
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const returnToList = () => navigate(returnToListPath, { state: { restoreSearchTerm: searchTerm } });
  const updateFormData = (patch: Partial<FormData>) => {
    setFormData(current => ({ ...current, ...patch }));
    setFormDirty(true);
  };

  const setFilterStatus = (status: string) => setSearchParams(current => {
    const next = new URLSearchParams(current);
    if (status === 'todos') next.delete('status');
    else next.set('status', status);
    return next;
  });
  const clearRouteFilters = () => setSearchParams(current => {
    const next = new URLSearchParams(current);
    next.delete('status');
    next.delete('mes');
    return next;
  });

  const contasQuery = useQuery({
    queryKey: ['lancamentos', 'despesa', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      // Em blocos: sem paginar, o servidor devolvia só as 1000 primeiras contas.
      const data = await buscarEmBlocos<any>(() => supabase
        .from('lancamentos')
        .select('*')
        .eq('tipo', 'despesa')
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('data_vencimento', { ascending: true })
        .order('id', { ascending: true }));
      const today = todaySaoPauloDateOnly();
      return data.map(conta => {
        const vencida = ['pendente', 'parcial'].includes(conta.status) && !!conta.data_vencimento && conta.data_vencimento < today;
        return { ...conta, vencida, statusOriginal: conta.status, status: vencida ? 'atrasado' as StatusPagamento : conta.status };
      });
    },
    enabled: !isFormPage && !!user && !!profile?.clinica_id,
  });
  const contas = contasQuery.data ?? [];

  const contaEdicaoQuery = useQuery({
    queryKey: ['lancamentos', 'despesa-edicao', profile?.clinica_id ?? null, editId],
    enabled: isEditPage && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos')
        .select('id, tipo, status, valor, valor_pago, categoria, descricao, data_vencimento, forma_pagamento, fornecedor, numero_documento, data_emissao, competencia, recorrente, frequencia_recorrencia, centro_custo, observacoes')
        .eq('id', editId!).eq('clinica_id', profile!.clinica_id!).eq('tipo', 'despesa').maybeSingle();
      if (error) throw error;
      return data as Record<string, any> | null;
    },
  });
  const contaEdicao = contaEdicaoQuery.data;
  const edicaoCarregada = useRef<string | null>(null);
  useEffect(() => {
    if (!contaEdicao || edicaoCarregada.current === contaEdicao.id) return;
    edicaoCarregada.current = contaEdicao.id;
    setFormData(formDataDaConta(contaEdicao));
    setFormDirty(false);
  }, [contaEdicao]);
  const edicaoBloqueada = isEditPage && !!contaEdicao && !podeAlterarConta(contaEdicao);

  const [contaCancelando, setContaCancelando] = useState<{ id: string; descricao: string; statusOriginal: string } | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const confirmarCancelamento = async () => {
    if (!contaCancelando || cancelando) return;
    const motivo = motivoCancelamento.trim();
    if (motivo.length < 5) { toast.error('Explique o motivo do cancelamento (mínimo 5 caracteres).'); return; }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return; }
    setCancelando(true);
    try {
      const atual = contas.find(item => item.id === contaCancelando.id);
      const anotacao = `Cancelada em ${format(parseDateOnly(todaySaoPauloDateOnly())!, 'dd/MM/yyyy')}${profile?.nome ? ` por ${profile.nome}` : ''}: ${motivo}`;
      const observacoes = atual?.observacoes ? `${atual.observacoes}\n${anotacao}` : anotacao;
      const { data, error } = await supabase.from('lancamentos')
        .update({ status: 'cancelado' as StatusPagamento, observacoes })
        .eq('id', contaCancelando.id)
        .eq('clinica_id', profile.clinica_id)
        .eq('tipo', 'despesa')
        .eq('status', contaCancelando.statusOriginal as StatusPagamento)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('A conta foi alterada por outra pessoa (pagamento ou cancelamento). Atualize a lista e tente novamente.');
      toast.success('Despesa cancelada.');
      setContaCancelando(null);
      setMotivoCancelamento('');
      void queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível cancelar a despesa.');
      void queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    } finally {
      setCancelando(false);
    }
  };
  const contasAtingiramLimite = contas.length >= LIMITE_BUSCA_EM_BLOCOS;
  const monthFilteredContas = useMemo(() => selectedMonthParam
    ? contas.filter(c => String(c.data_vencimento || c.data || '').startsWith(selectedMonthParam))
    : contas, [contas, selectedMonthParam]);

  const filteredContas = useMemo(() =>
    monthFilteredContas.filter(c => {
      const term = searchTerm.toLowerCase();
      const matchSearch = c.descricao.toLowerCase().includes(term) ||
        ((c as any).fornecedor || '').toLowerCase().includes(term) ||
        ((c as any).numero_documento || '').toLowerCase().includes(term);
      const matchStatus = filterStatus === 'todos'
        || (filterStatus === 'aberto' ? ['pendente', 'parcial', 'atrasado'].includes(c.status) : filterStatus === 'atrasado' ? c.vencida : c.status === filterStatus);
      return matchSearch && matchStatus;
    }), [monthFilteredContas, searchTerm, filterStatus]);

  const stats = useMemo(() => ({
    // Valor líquido da conta (com desconto e acréscimo), o mesmo que os saldos usam.
    total: monthFilteredContas.filter(c => c.status !== 'cancelado' && c.status !== 'estornado')
      .reduce((acc, c) => acc + Number(c.valor || 0) - Number(c.desconto || 0) + Number(c.acrescimo || 0), 0),
    pendente: monthFilteredContas.filter(c => ['pendente', 'parcial'].includes(c.status) && !c.vencida).reduce((acc, c) => acc + saldoEmAberto(c), 0),
    atrasado: monthFilteredContas.filter(c => c.vencida).reduce((acc, c) => acc + saldoEmAberto(c), 0),
    // Atraso é um rótulo operacional calculado; uma conta vencida pode continuar
    // tendo uma parte já recebida que deve permanecer no KPI de pagamentos.
    pago: monthFilteredContas.filter(c => ['pago', 'parcial'].includes(c.status) || Number(c.valor_pago || 0) > 0)
      .reduce((acc, c) => acc + valorRealizado(c), 0),
  }), [monthFilteredContas]);

  const destaquePagar = useMemo(() => {
    const vencidas = monthFilteredContas.filter(c => c.vencida).sort((a, b) => {
      const da = parseDateOnly(a.data_vencimento)?.getTime() ?? 0;
      const db = parseDateOnly(b.data_vencimento)?.getTime() ?? 0;
      return da - db;
    });
    if (vencidas.length > 0) return vencidas[0];
    return monthFilteredContas
      .filter(c => ['pendente', 'parcial'].includes(c.statusOriginal || c.status || ''))
      .sort((a, b) => {
        const da = parseDateOnly(a.data_vencimento)?.getTime() ?? 0;
        const db = parseDateOnly(b.data_vencimento)?.getTime() ?? 0;
        return da - db;
      })[0] ?? null;
  }, [monthFilteredContas]);

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const exportarExcel = async () => {
    try {
      const dados = filteredContas.map((c: any) => ({
        descricao: c.descricao,
        fornecedor: c.fornecedor || '',
        categoria: CATEGORIAS_LABELS[c.categoria] || c.categoria || '',
        documento: c.numero_documento || '',
        vencimento: c.data_vencimento ? format(parseDateOnly(c.data_vencimento)!, 'dd/MM/yyyy') : '',
        valor: Number(c.valor || 0),
        desconto: Number(c.desconto || 0),
        acrescimo: Number(c.acrescimo || 0),
        valor_pago: Number(c.valor_pago || 0),
        em_aberto: saldoEmAberto(c),
        pagamento: c.data_pagamento ? format(parseDateOnly(String(c.data_pagamento).slice(0, 10))!, 'dd/MM/yyyy') : '',
        status: c.vencida && c.statusOriginal === 'parcial' ? 'Atrasado · parcial' : STATUS_LABELS[c.status] || c.status,
        centro_custo: CENTROS_CUSTO_LABELS[c.centro_custo] || c.centro_custo || '',
      }));
      await exportToExcel(dados, 'contas-a-pagar', 'Contas a Pagar', {
        descricao: 'Descrição', fornecedor: 'Fornecedor', categoria: 'Categoria', documento: 'Documento',
        vencimento: 'Vencimento', valor: 'Valor', desconto: 'Desconto', acrescimo: 'Acréscimo',
        valor_pago: 'Valor pago', em_aberto: 'Em aberto', pagamento: 'Pagamento', status: 'Status', centro_custo: 'Centro de custo',
      });
      toast.success(`${dados.length} ${dados.length === 1 ? 'conta exportada' : 'contas exportadas'}.`);
    } catch {
      toast.error('Não foi possível gerar o arquivo. Tente novamente.');
    }
  };

  const handleEdit = (id: string) => {
    navigate(`/contas/pagar/${id}/editar`, { state: { returnTo: `${location.pathname}${location.search}`, restoreSearchTerm: searchTerm } });
  };

  const handleNew = () => {
    navigate('/contas/pagar/nova', { state: { returnTo: `${location.pathname}${location.search}`, restoreSearchTerm: searchTerm } });
  };

  const handleSave = async () => {
    if (submissionLock.current) return;
    if (!formData.descricao.trim()) { toast.error('Informe a descrição da despesa.'); return; }
    if (!Number.isFinite(formData.valor) || formData.valor <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }
    if (Math.abs(formData.valor * 100 - Math.round(formData.valor * 100)) > 1e-7) {
      toast.error('Informe o valor com no máximo duas casas decimais.');
      return;
    }
    if (!isValidDateOnly(formData.data_vencimento)) {
      toast.error('Informe uma data de vencimento válida.');
      return;
    }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return; }
    submissionLock.current = true;
    setIsSubmitting(true);
    try {
      if (isEditPage) {
        const alteracoes = {
          categoria: formData.categoria,
          descricao: formData.descricao.trim(),
          valor: formData.valor,
          data_vencimento: formData.data_vencimento,
          forma_pagamento: formData.forma_pagamento || null,
          fornecedor: formData.fornecedor || null,
          numero_documento: formData.numero_documento || null,
          data_emissao: formData.data_emissao || null,
          competencia: formData.competencia || null,
          recorrente: formData.recorrente,
          frequencia_recorrencia: formData.recorrente ? formData.frequencia_recorrencia : null,
          centro_custo: formData.centro_custo || null,
          observacoes: formData.observacoes || null,
        };
        // Só altera se continuar em aberto e sem nenhum pagamento registrado.
        const { data, error } = await supabase.from('lancamentos').update(alteracoes)
          .eq('id', editId!)
          .eq('clinica_id', profile.clinica_id)
          .eq('tipo', 'despesa')
          .in('status', ['pendente', 'atrasado'])
          .or('valor_pago.is.null,valor_pago.eq.0')
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('A conta recebeu um pagamento ou foi cancelada e não pode mais ser editada. Atualize a lista.');
        toast.success('Conta atualizada!');
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
        setFormDirty(false);
        navigationAllowedRef.current = true;
        returnToList();
        return;
      }
      const payload: any = {
        tipo: 'despesa',
        categoria: formData.categoria,
        descricao: formData.descricao.trim(),
        valor: formData.valor,
        data: todaySaoPauloDateOnly(),
        data_vencimento: formData.data_vencimento,
        status: 'pendente' as StatusPagamento,
        forma_pagamento: formData.forma_pagamento || null,
        fornecedor: formData.fornecedor || null,
        numero_documento: formData.numero_documento || null,
        data_emissao: formData.data_emissao || null,
        competencia: formData.competencia || null,
        recorrente: formData.recorrente,
        frequencia_recorrencia: formData.recorrente ? formData.frequencia_recorrencia : null,
        centro_custo: formData.centro_custo || null,
        observacoes: formData.observacoes || null,
        clinica_id: profile?.clinica_id || null,
      };

      const { error } = await supabase.from('lancamentos').insert(payload);
      if (error) throw error;
      toast.success('Conta cadastrada!');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      setFormDirty(false);
      navigationAllowedRef.current = true;
      returnToList();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar');
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handlePagamento = (id: string) => {
    const conta = contas.find(item => item.id === id);
    if (!conta) return;
    navigate(`/contas/pagar/${id}/pagamento`, {
      state: {
        returnTo: `${location.pathname}${location.search}`,
        restoreSearchTerm: searchTerm,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  if (!isFormPage && contasQuery.isLoading) return <div className="space-y-6" data-testid="contas-pagar-carregando" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (!isFormPage && contasQuery.isError && !contasQuery.data) return <ErrorState title="Não foi possível carregar contas a pagar" error={contasQuery.error} onRetry={() => void contasQuery.refetch()} />;
  if (isEditPage && contaEdicaoQuery.isLoading) return <div className="space-y-6" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (isEditPage && contaEdicaoQuery.isError) return <ErrorState title="Não foi possível carregar a conta" error={contaEdicaoQuery.error} onRetry={() => void contaEdicaoQuery.refetch()} />;
  if (isEditPage && (!contaEdicao || edicaoBloqueada)) return (
    <div className="space-y-4">
      <PageHeader title="Editar conta a pagar" icon={<DollarSign />} />
      <Card role="status"><CardContent className="space-y-3 p-6">
        <p className="text-sm text-muted-foreground">{!contaEdicao ? 'A conta não existe ou não pertence à clínica ativa.' : 'Esta conta já tem pagamento registrado ou não está mais em aberto, por isso não pode ser editada.'}</p>
        <Button variant="outline" onClick={returnToList}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às contas a pagar</Button>
      </CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      {!isFormPage && <>
      <PageHeader
        title="Contas a Pagar"
        description={stats.total === 0
          ? 'Despesas, fornecedores e controle de vencimentos'
          : `${formatCurrency(stats.total)} total${selectedMonth ? ` em ${format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}` : ''} · ${monthFilteredContas.filter(c => c.vencida).length} vencida${monthFilteredContas.filter(c => c.vencida).length === 1 ? '' : 's'} · ${formatCurrency(stats.pendente)} em aberto`}
        icon={<TrendingDown />}
        actions={
          <>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full shrink-0" onClick={() => navigate('/contas?tab=receber')}>
            <ArrowUpRight className="h-4 w-4" /> Contas a Receber
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full shrink-0" onClick={() => navigate('/caixa-diario')}>
            <ArrowUpRight className="h-4 w-4" /> Caixa do Dia
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full shrink-0" onClick={() => void exportarExcel()} disabled={filteredContas.length === 0} aria-label="Exportar contas a pagar filtradas para Excel">
            <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
          </Button>
          <Button onClick={handleNew} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Nova Conta
          </Button>
          </>
        }
      />

      {contasAtingiramLimite && (
        <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          A leitura atingiu {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} contas. A lista e os indicadores podem estar incompletos; não use estes totais para fechamento.
        </div>
      )}

      {selectedMonth && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3" role="status">
          <p className="text-sm text-foreground">Vencimentos de <strong>{format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}</strong></p>
          <Button variant="ghost" size="sm" onClick={() => setSearchParams(current => { const next = new URLSearchParams(current); next.delete('mes'); return next; })}>
            Mostrar todos os meses
          </Button>
        </div>
      )}

      {/* Indicadores clicáveis */}
      <section role="group" aria-label="Resumo das contas a pagar" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Resumo de vencimentos</h2>
          {selectedMonth && <span className="text-xs text-muted-foreground">{format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}</span>}
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-4 md:divide-y-0">
          {[
            { key: 'todos', label: 'Total em contas', value: stats.total, color: 'text-foreground', caption: `${monthFilteredContas.length} lançamento(s)` },
            { key: 'pendente', label: 'A vencer / parcial', value: stats.pendente, color: 'text-warning-foreground', caption: `${monthFilteredContas.filter(c => ['pendente', 'parcial'].includes(c.statusOriginal || '') && !c.vencida).length} conta(s)` },
            { key: 'atrasado', label: 'Vencidas / em atraso', value: stats.atrasado, color: 'text-destructive', caption: `${monthFilteredContas.filter(c => c.vencida).length} em atraso` },
            { key: 'pago', label: 'Pago', value: stats.pago, color: 'text-success', caption: `${monthFilteredContas.filter(c => ['pago'].includes(c.statusOriginal || '')).length} conta(s)` },
          ].map(kpi => {
            const ativo = filterStatus === kpi.key;
            return (
              <button key={kpi.key} type="button" aria-pressed={ativo}
                onClick={() => setFilterStatus(ativo && kpi.key !== 'todos' ? 'todos' : kpi.key)}
                className={cn('min-h-[84px] min-w-0 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', ativo && 'bg-primary/5')}>
                <span className="block truncate text-xs font-medium text-muted-foreground">{kpi.label}</span>
                <span className={cn('mt-1 block whitespace-nowrap text-xl font-semibold tabular-nums', kpi.color)}>{formatCurrency(kpi.value)}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{kpi.caption}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Hero: conta mais urgente */}
      {destaquePagar && (() => {
        const d = destaquePagar;
        const statusCfg = STATUS_CONFIG[d.status || 'pendente'];
        const dataVenc = d.data_vencimento ? parseDateOnly(d.data_vencimento) : null;
        const diasVencidos = dataVenc ? differenceInCalendarDays(parseDateOnly(todaySaoPauloDateOnly())!, dataVenc) : null;
        return (
          <Card className={cn('overflow-hidden rounded-xl', d.vencida ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/5')}>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', d.vencida ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning-foreground')}>
                  {d.vencida ? <AlertCircle className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className={cn('text-[11px] font-semibold uppercase tracking-wide', d.vencida ? 'text-destructive' : 'text-warning-foreground')}>{d.vencida ? 'Despesa vencida há mais tempo' : 'Próxima despesa a vencer'}</p>
                  <h2 className="truncate text-lg font-bold text-foreground">{d.descricao}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {d.fornecedor && <span>{d.fornecedor}</span>}
                    <span className="inline-flex items-center gap-1"><Calendar aria-hidden="true" className="h-3 w-3" /> {dataVenc ? `Venc. ${format(dataVenc, 'dd/MM/yyyy')}` : '—'}</span>
                    {diasVencidos !== null && diasVencidos > 0 && (
                      <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                        <Clock aria-hidden="true" className="h-3 w-3" /> {diasVencidos} dia(s) de atraso
                      </span>
                    )}
                    <Badge className={cn('rounded-full text-[10px]', statusCfg?.bg, statusCfg?.color, 'border-0')}>
                      {d.vencida && d.statusOriginal === 'parcial' ? 'Atrasado · parcial' : STATUS_LABELS[d.status || 'pendente']}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="flex flex-col items-start sm:items-end">
                  <span className="text-[11px] text-muted-foreground">Saldo em aberto</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{formatCurrency(saldoEmAberto(d))}</span>
                </span>
                {['pendente', 'atrasado', 'parcial'].includes(d.status) && (
                  <Button
                    size="sm"
                    onClick={() => handlePagamento(d.id)}
                    variant={d.vencida ? 'destructive' : 'default'}
                    className="h-9 gap-1 text-xs"
                  >
                    <Check aria-hidden="true" className="h-3.5 w-3.5" /> {Number(d.valor_pago || 0) > 0 ? 'Pagar saldo' : 'Pagar'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Tabela de contas */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                </span>
                Despesas
                <Badge variant="outline" className="rounded-full border-border text-muted-foreground">{filteredContas.length} de {monthFilteredContas.length}</Badge>
              </CardTitle>
              <div className="relative w-full sm:w-72">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar contas a pagar"
                  placeholder="Descrição, fornecedor, NF..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="h-10 rounded-full pl-9"
                />
              </div>
            </div>
            <div role="group" aria-label="Filtrar por status" className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'aberto', label: 'Em aberto' },
                { key: 'pendente', label: 'Pendentes' },
                { key: 'parcial', label: 'Parciais' },
                { key: 'atrasado', label: 'Vencidos' },
                { key: 'pago', label: 'Pagos' },
                { key: 'cancelado', label: 'Cancelados' },
              ].map(opt => {
                const ativo = filterStatus === opt.key;
                return (
                  <button key={opt.key} type="button" aria-pressed={ativo}
                    onClick={() => setFilterStatus(opt.key)}
                    className={cn(PILL_BASE_P, ativo ? PILL_ATIVA_P : PILL_INATIVA_P)}>
                    {opt.label}
                  </button>
                );
              })}
              {(searchTerm.trim() || filterStatus !== 'todos' || selectedMonth) && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={() => { setSearchTerm(''); clearRouteFilters(); }}>
                  <X aria-hidden="true" className="h-3 w-3" /> Limpar
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{filteredContas.length} de {monthFilteredContas.length}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="hidden lg:table-cell">Fornecedor</TableHead>
                  <TableHead className="hidden md:table-cell">Categoria</TableHead>
                  <TableHead className="hidden sm:table-cell">Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center">
                        <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <DollarSign className="h-7 w-7" />
                        </span>
                        <p className="font-semibold text-foreground">
                          {contas.length === 0 ? 'Nenhuma conta cadastrada' : 'Nenhuma conta encontrada com estes filtros'}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {contas.length === 0 ? 'Cadastre uma despesa para acompanhar seus vencimentos.' : 'Limpe a busca e o status para ver outras contas.'}
                        </p>
                        {contas.length === 0 ? (
                          <Button className="mt-3 gap-2" size="sm" onClick={handleNew}>
                            <Plus className="h-4 w-4" /> Nova Conta
                          </Button>
                        ) : (
                          <Button className="mt-3 rounded-full" size="sm" variant="outline" onClick={() => { setSearchTerm(''); clearRouteFilters(); }}>
                            Limpar filtros
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContas.map((conta: any) => {
                    const dataVencimento = conta.data_vencimento ? parseDateOnly(conta.data_vencimento) : null;
                    const diasAteVencimento = dataVencimento
                      ? differenceInCalendarDays(dataVencimento, parseDateOnly(todaySaoPauloDateOnly())!)
                      : null;
                    const aberto = ['pendente', 'atrasado', 'parcial'].includes(conta.status);
                    const diasAtraso = diasAteVencimento === null ? null : Math.abs(diasAteVencimento);
                    const urgencia = conta.vencida && diasAtraso !== null
                      ? `Atrasada há ${diasAtraso} ${diasAtraso === 1 ? 'dia' : 'dias'}`
                      : aberto && diasAteVencimento === 0
                        ? 'Vence hoje'
                        : aberto && diasAteVencimento !== null && diasAteVencimento > 0 && diasAteVencimento <= 7
                          ? `Vence em ${diasAteVencimento} ${diasAteVencimento === 1 ? 'dia' : 'dias'}`
                          : null;
                    return (
                    <TableRow key={conta.id} className={cn(conta.vencida && 'bg-destructive/5')}>
                      <TableCell>
                        <p className={cn('mb-1 text-xs sm:hidden', conta.vencida ? 'font-medium text-destructive' : urgencia ? 'font-medium text-warning-foreground' : 'text-muted-foreground')}>
                          {dataVencimento ? `Vencimento ${format(dataVencimento, 'dd/MM/yyyy')}` : 'Vencimento não informado'}{urgencia && ` · ${urgencia}`}
                        </p>
                        <div>
                          <p className="font-medium line-clamp-2" title={conta.descricao}>{conta.descricao}</p>
                          {conta.numero_documento && (
                            <p className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                              <FileText className="h-3 w-3" /> NF: {conta.numero_documento}
                            </p>
                          )}
                          {conta.recorrente && (
                            <Badge variant="outline" className="rounded-full text-[9px] gap-0.5 mt-0.5">
                              <Repeat className="h-2.5 w-2.5" /> Recorrente · {FREQUENCIAS_RECURRENCIA[conta.frequencia_recorrencia] || 'frequência não definida'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm line-clamp-2" title={conta.fornecedor || undefined}>{conta.fornecedor || '—'}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {CATEGORIAS_LABELS[conta.categoria] || conta.categoria}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell tabular-nums">
                        {conta.data_vencimento && format(parseDateOnly(conta.data_vencimento)!, 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {formatCurrency(conta.valor)}
                        {Number(conta.valor_pago || 0) > 0 && <p className="text-xs font-normal text-muted-foreground">Em aberto: {formatCurrency(saldoEmAberto(conta))}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('rounded-full', STATUS_CONFIG[conta.status || 'pendente']?.bg, STATUS_CONFIG[conta.status || 'pendente']?.color, 'border-0')}>
                          {conta.vencida && conta.statusOriginal === 'parcial'
                            ? 'Atrasado · parcial'
                            : STATUS_LABELS[conta.status || 'pendente']}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap text-right">
                        <HistoricoLancamentoButton lancamentoId={conta.id} descricao={conta.descricao} rotulos={CATEGORIAS_LABELS} restoreSearchTerm={searchTerm} />
                        {podeAlterarConta(conta) && (
                          <>
                            <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Editar ${conta.descricao}`} title="Editar" onClick={() => handleEdit(conta.id)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" aria-label={`Cancelar ${conta.descricao}`} title="Cancelar despesa"
                              onClick={() => { setMotivoCancelamento(''); setContaCancelando({ id: conta.id, descricao: conta.descricao, statusOriginal: conta.statusOriginal }); }}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {['pendente', 'atrasado', 'parcial'].includes(conta.status) && (
                          <Button size="sm" onClick={() => handlePagamento(conta.id)}
                            className="h-9 gap-1 text-xs">
                            <Check className="h-3.5 w-3.5" /> {Number(conta.valor_pago || 0) > 0 ? 'Pagar saldo' : 'Pagar'}
                          </Button>
                        )}
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
      <ConfirmDialog
        open={!!contaCancelando}
        onOpenChange={open => { if (!open && !cancelando) setContaCancelando(null); }}
        title="Cancelar despesa"
        description={`A despesa "${contaCancelando?.descricao ?? ''}" sai dos totais em aberto. O motivo fica registrado nas observações.`}
        confirmLabel="Cancelar despesa"
        cancelLabel="Voltar"
        variant="destructive"
        isLoading={cancelando}
        closeOnConfirm={false}
        onConfirm={() => void confirmarCancelamento()}
      >
        <div className="space-y-1.5">
          <Label htmlFor="payable-cancel-reason" className="text-xs">Motivo do cancelamento *</Label>
          <Textarea id="payable-cancel-reason" value={motivoCancelamento} onChange={e => setMotivoCancelamento(e.target.value)}
            placeholder="Ex.: lançada em duplicidade" rows={2} disabled={cancelando} />
        </div>
      </ConfirmDialog>
      </>}

      {isFormPage && (
        <main data-testid="payable-create-page" className="space-y-5">
          <PageHeader
            title={isEditPage ? 'Editar conta a pagar' : 'Nova Conta a Pagar'}
            description={isEditPage ? 'Corrija os dados da despesa enquanto ela não tiver pagamento registrado.' : 'Cadastre uma despesa e acompanhe o vencimento na lista de contas.'}
            icon={<DollarSign />}
            actions={(
              <Button type="button" variant="outline" onClick={returnToList} disabled={isSubmitting}>
                <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar às contas a pagar
              </Button>
            )}
          />
          <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="space-y-5 p-4 sm:p-6">
            {/* Dados principais */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payable-category" className="text-xs">Categoria *</Label>
                <Select value={formData.categoria} onValueChange={v => updateFormData({ categoria: v })} disabled={isSubmitting}>
                  <SelectTrigger id="payable-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{CATEGORIAS_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payable-supplier" className="text-xs">Fornecedor / Favorecido</Label>
                <Input id="payable-supplier" value={formData.fornecedor} onChange={e => updateFormData({ fornecedor: e.target.value })}
                  placeholder="Ex: Laboratório X" disabled={isSubmitting} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payable-description" className="text-xs">Descrição *</Label>
              <Textarea id="payable-description" required value={formData.descricao} onChange={e => updateFormData({ descricao: e.target.value })}
                placeholder="Descrição da despesa..." rows={2} disabled={isSubmitting} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="payable-value" className="text-xs">Valor (R$) *</Label>
                <Input id="payable-value" type="number" step="0.01" min="0.01" required value={formData.valor}
                  onChange={e => updateFormData({ valor: parseFloat(e.target.value) || 0 })} disabled={isSubmitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payable-document" className="text-xs">Nº Documento / NF</Label>
                <Input id="payable-document" value={formData.numero_documento} onChange={e => updateFormData({ numero_documento: e.target.value })}
                  placeholder="Ex: NF-001234" className="font-mono" disabled={isSubmitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payable-method" className="text-xs">Forma de Pagamento</Label>
                <Select value={formData.forma_pagamento} onValueChange={v => updateFormData({ forma_pagamento: v })} disabled={isSubmitting}>
                  <SelectTrigger id="payable-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Datas */}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Datas e Competência
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                <Label htmlFor="payable-issued" className="text-xs">Data de Emissão</Label>
                  <Input type="date" value={formData.data_emissao}
                  id="payable-issued" onChange={e => updateFormData({ data_emissao: e.target.value })} disabled={isSubmitting} />
                </div>
                <div className="space-y-1.5">
                <Label htmlFor="payable-due" className="text-xs">Vencimento *</Label>
                <Input id="payable-due" type="date" required value={formData.data_vencimento}
                  onChange={e => updateFormData({ data_vencimento: e.target.value })} disabled={isSubmitting} />
                </div>
                <div className="space-y-1.5">
                <Label htmlFor="payable-competence" className="text-xs">Competência (Mês/Ano)</Label>
                <Input id="payable-competence" type="month" value={formData.competencia}
                  onChange={e => updateFormData({ competencia: e.target.value })} disabled={isSubmitting} />
                </div>
              </div>
            </div>

            {/* Recorrência */}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Repeat className="h-4 w-4" /> Recorrência
              </h4>
              <div className="flex items-center gap-3 mb-3">
                <Switch id="payable-recurring" checked={formData.recorrente}
                  onCheckedChange={checked => updateFormData({ recorrente: checked })} disabled={isSubmitting} />
                <Label htmlFor="payable-recurring" className="text-sm">Marcar como despesa recorrente</Label>
              </div>
              {formData.recorrente && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Ao quitar esta conta, a próxima despesa será criada automaticamente com o vencimento na frequência escolhida.
                  </p>
                  <div className="w-48">
                    <Label htmlFor="payable-frequency" className="text-xs">Frequência</Label>
                    <Select value={formData.frequencia_recorrencia}
                      onValueChange={v => updateFormData({ frequencia_recorrencia: v })} disabled={isSubmitting}>
                      <SelectTrigger id="payable-frequency"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="bimestral">Bimestral</SelectItem>
                        <SelectItem value="trimestral">Trimestral</SelectItem>
                        <SelectItem value="anual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Centro de Custo */}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> Organização
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="payable-cost-center" className="text-xs">Centro de Custo</Label>
                  <Select value={formData.centro_custo} onValueChange={v => updateFormData({ centro_custo: v })} disabled={isSubmitting}>
                    <SelectTrigger id="payable-cost-center"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CENTROS_CUSTO.map(c => <SelectItem key={c} value={c}>{CENTROS_CUSTO_LABELS[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Observações */}
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="payable-notes" className="text-xs">Observações</Label>
              <Textarea id="payable-notes" value={formData.observacoes} onChange={e => updateFormData({ observacoes: e.target.value })}
                placeholder="Anotações internas..." rows={2} disabled={isSubmitting} />
            </div>

            <Separator />
            {!isEditPage && <p className="text-xs text-muted-foreground">
              A conta será cadastrada como pendente. Depois, use <strong>Pagar</strong> para registrar o movimento no caixa aberto do dia.
            </p>}
              </div>
            </section>
            <footer className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={returnToList} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : isEditPage ? 'Salvar alterações' : 'Salvar conta'}
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

    </div>
  );
}
