import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus, Search, Edit, Package, AlertTriangle, ArrowDown, ArrowUp, Loader2,
  Barcode, Pill, Building2, ShieldAlert, TrendingDown,
  History, BarChart3, Trash2, RefreshCw, X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { MAX_LINHAS_AUTO, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { CardGridSkeleton, TableSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyEstoque } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { classifyAbcItem } from '@/lib/abcClassification';

const CATEGORIAS = ['medicamentos', 'materiais_hospitalares', 'epis', 'escritorio', 'limpeza', 'outros'];
const UNIDADES = ['unidade', 'comprimido', 'caixa', 'frasco', 'ampola', 'pacote', 'litro', 'kg', 'ml'];

interface FormData {
  id?: string;
  nome: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  quantidade_minima: number;
  quantidade_maxima?: number;
  ponto_pedido?: number;
  valor_unitario: string;
  valor_venda?: string;
  localizacao: string;
  lote?: string;
  validade?: string;
  fornecedor?: string;
  descricao?: string;
  codigo_ean?: string;
  fabricante?: string;
  principio_ativo?: string;
  dosagem?: string;
}

const initialForm: FormData = {
  nome: '', categoria: 'medicamentos', unidade: 'unidade',
  quantidade: 0, quantidade_minima: 10, valor_unitario: '0,00', localizacao: '',
};

function parseMoneyInput(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;

  const formatoBrasileiro = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  const formatoPontoDecimal = /^\d+(?:\.\d{1,2})?$/;
  if (!formatoBrasileiro.test(compact) && !formatoPontoDecimal.test(compact)) return null;

  const normalizado = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

function formatMoneyInput(value: unknown): string {
  const valor = Number(value);
  return Number.isFinite(valor) ? valor.toFixed(2).replace('.', ',') : '';
}

const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

const normalizarBuscaEstoque = (valor: unknown) => String(valor ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR');

const formatarDataMovimentacao = (valor: string | null | undefined) => {
  if (!valor) return 'Data indisponível';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? 'Data indisponível'
    : new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(data);
};

type StockTask = 'new' | 'edit' | 'entry' | 'exit' | 'history';
export default function Estoque({ task }: { task?: StockTask }) {
  const location = useLocation();
  return <EstoqueWorkspace key={location.pathname} task={task} />;
}
function EstoqueWorkspace({ task }: { task?: StockTask }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { itemId } = useParams<{ itemId: string }>();
  const formPage = task === 'new' || task === 'edit';
  const movementPage = task === 'entry' || task === 'exit';
  const historyPage = task === 'history';
  const completed = useRef(false);
  const initialized = useRef(false);
  const baseline = useRef(JSON.stringify(initialForm));
  const returnTo = typeof location.state?.stockReturn === 'string' && /^\/estoque(?:\?|$)/.test(location.state.stockReturn) ? location.state.stockReturn : '/estoque';
  const leave = () => navigate(returnTo, { state: { stockFilters: location.state?.stockFilters } });
  const finish = () => { completed.current = true; leave(); };
  const [searchParams] = useSearchParams();
  const requestedAlert = searchParams.get('alerta');
  const [searchTerm, setSearchTerm] = useState(location.state?.stockFilters?.search ?? '');
  const [filterCategoria, setFilterCategoria] = useState(location.state?.stockFilters?.category ?? 'todos');
  const [filterAlerta, setFilterAlerta] = useState<'todos' | 'critico' | 'vencidos' | 'validade' | 'ponto_pedido'>(
    location.state?.stockFilters?.alert ?? (requestedAlert === 'critico' || requestedAlert === 'vencidos' ? requestedAlert : 'todos'),
  );
  const timelineItemId = historyPage ? itemId : null;
  const [activeTab, setActiveTab] = useState<'produtos' | 'curva_abc'>(location.state?.stockFilters?.tab ?? 'produtos');
  const selectedId = itemId ?? null;
  const [selectedUpdatedAt, setSelectedUpdatedAt] = useState<string | null>(null);
  const [chaveCadastro] = useState(() => crypto.randomUUID());
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [movimentacao, setMovimentacao] = useState<{ tipo: 'entrada' | 'saida'; quantidade: number; motivo: string; chaveIdempotencia: string }>({
    tipo: task === 'exit' ? 'saida' : 'entrada', quantidade: 0, motivo: '', chaveIdempotencia: crypto.randomUUID(),
  });
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const estoqueQuery = useSupabaseQuery<any>('estoque', {
    orderBy: { column: 'nome', ascending: true },
    filters: [{ column: 'clinica_id', operator: 'eq', value: profile?.clinica_id }, ...(itemId ? [{ column: 'id', operator: 'eq', value: itemId }] : [])],
    enabled: !!profile?.clinica_id,
  });
  const estoque = estoqueQuery.data ?? [];
  const { isLoading } = estoqueQuery;

  useEffect(() => {
    if (!location.state?.stockFilters) setFilterAlerta(requestedAlert === 'critico' || requestedAlert === 'vencidos' ? requestedAlert : 'todos');
  }, [requestedAlert, location.state?.stockFilters]);

  // Movement timeline query
  const movimentacoesQuery = useQuery({
    queryKey: ['movimentacoes-timeline', user?.id ?? null, profile?.clinica_id ?? null, timelineItemId],
    enabled: !!timelineItemId && !!user && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimentacoes_estoque')
        .select('*')
        .eq('clinica_id', profile!.clinica_id!)
        .eq('item_id', timelineItemId || '')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });
  const movimentacoes = movimentacoesQuery.data ?? [];

  const hoje = todaySaoPauloDateOnly();
  const daysUntilValidity = useCallback((validade: string | null) => {
    if (!validade || !/^\d{4}-\d{2}-\d{2}$/.test(validade)) return null;
    const dataValidade = new Date(`${validade}T00:00:00Z`);
    if (!Number.isFinite(dataValidade.getTime()) || dataValidade.toISOString().slice(0, 10) !== validade) return null;
    const due = dataValidade.getTime();
    const today = Date.parse(`${hoje}T00:00:00Z`);
    return Math.floor((due - today) / 86400000);
  }, [hoje]);

  const getValidadeInfo = useCallback((validade: string | null) => {
    const dias = daysUntilValidity(validade);
    if (dias === null) return null;
    if (dias < 0) return { label: 'Vencido', color: 'destructive' as const, dias };
    if (dias <= 30) return { label: `${dias}d`, color: 'destructive' as const, dias };
    if (dias <= 60) return { label: `${dias}d`, color: 'secondary' as const, dias };
    return null;
  }, [daysUntilValidity]);

  const filteredProdutos = useMemo(() => {
    return (estoque as any[]).filter(p => {
      const q = normalizarBuscaEstoque(searchTerm);
      const matchSearch = !q || [
        p.nome, p.codigo_ean, p.principio_ativo, p.fabricante, p.lote,
        p.fornecedor, p.localizacao, p.descricao, p.dosagem, p.categoria,
      ].some(valor => normalizarBuscaEstoque(valor).includes(q));
      const matchCategoria = filterCategoria === 'todos' || p.categoria === filterCategoria;
      if (filterAlerta === 'critico') return matchSearch && matchCategoria && p.quantidade <= (p.quantidade_minima || 0);
      if (filterAlerta === 'vencidos') {
        const info = getValidadeInfo(p.validade);
        return matchSearch && matchCategoria && Number(p.quantidade) > 0 && info !== null && info.dias < 0;
      }
      if (filterAlerta === 'validade') {
        const info = getValidadeInfo(p.validade);
        return matchSearch && matchCategoria && Number(p.quantidade) > 0 && info !== null && info.dias >= 0;
      }
      if (filterAlerta === 'ponto_pedido') return matchSearch && matchCategoria && p.ponto_pedido && p.quantidade <= p.ponto_pedido;
      return matchSearch && matchCategoria;
    });
  }, [estoque, searchTerm, filterCategoria, filterAlerta, getValidadeInfo]);

  const getStatus = (produto: any) => {
    if (produto.quantidade <= 0) return { label: 'Sem estoque', variant: 'destructive' as const };
    const validade = daysUntilValidity(produto.validade);
    if (validade !== null && validade < 0) return { label: 'Vencido', variant: 'destructive' as const };
    if (produto.quantidade <= (produto.quantidade_minima || 0)) return { label: 'Crítico', variant: 'destructive' as const };
    if (produto.ponto_pedido && produto.quantidade <= produto.ponto_pedido) return { label: 'Pedir', variant: 'secondary' as const };
    if (produto.quantidade <= (produto.quantidade_minima || 0) * 1.5) return { label: 'Baixo', variant: 'secondary' as const };
    return { label: 'OK', variant: 'outline' as const };
  };

  const stats = useMemo(() => {
    const items = estoque as any[];
    return {
      total: items.length,
      critico: items.filter(p => p.quantidade <= (p.quantidade_minima || 0)).length,
      valorTotal: items.reduce((acc, p) => acc + (p.quantidade * (p.valor_unitario || 0)), 0),
      vencidos: items.filter(p => Number(p.quantidade) > 0 && (daysUntilValidity(p.validade) ?? 0) < 0).length,
      vencendo: items.filter(p => {
        const info = getValidadeInfo(p.validade);
        return Number(p.quantidade) > 0 && info !== null && info.dias >= 0 && info.dias <= 60;
      }).length,
      pontoPedido: items.filter(p => p.ponto_pedido && p.quantidade <= p.ponto_pedido).length,
    };
  }, [estoque, getValidadeInfo, daysUntilValidity]);

  // ─── ABC Curve Analysis ─────────────────────────────────
  const abcData = useMemo(() => {
    const items = (estoque as any[]).map(p => ({
      nome: p.nome,
      categoria: p.categoria,
      valor: p.quantidade * (p.valor_unitario || 0),
    })).sort((a, b) => b.valor - a.valor);

    const totalValor = items.reduce((acc, i) => acc + i.valor, 0);
    if (totalValor === 0) return [];

    let accumulated = 0;
    return items.map(item => {
      const classe = classifyAbcItem(accumulated, totalValor);
      accumulated += item.valor;
      const percentAcc = (accumulated / totalValor) * 100;
      return { ...item, percentAcc: Math.round(percentAcc), classe };
    });
  }, [estoque]);

  const abcSummary = useMemo(() => {
    const a = abcData.filter(i => i.classe === 'A');
    const b = abcData.filter(i => i.classe === 'B');
    const c = abcData.filter(i => i.classe === 'C');
    const totalValor = abcData.reduce((acc, i) => acc + i.valor, 0);
    return {
      a: { count: a.length, valor: a.reduce((acc, i) => acc + i.valor, 0), pct: totalValor ? Math.round((a.reduce((acc, i) => acc + i.valor, 0) / totalValor) * 100) : 0 },
      b: { count: b.length, valor: b.reduce((acc, i) => acc + i.valor, 0), pct: totalValor ? Math.round((b.reduce((acc, i) => acc + i.valor, 0) / totalValor) * 100) : 0 },
      c: { count: c.length, valor: c.reduce((acc, i) => acc + i.valor, 0), pct: totalValor ? Math.round((c.reduce((acc, i) => acc + i.valor, 0) / totalValor) * 100) : 0 },
    };
  }, [abcData]);

  const abcChartData = useMemo(() => {
    return abcData.slice(0, 20).map(i => ({
      nome: i.nome.length > 15 ? i.nome.slice(0, 15) + '…' : i.nome,
      valor: i.valor,
      classe: i.classe,
    }));
  }, [abcData]);

  const ABC_COLORS = { A: 'hsl(var(--destructive))', B: 'hsl(var(--warning))', C: 'hsl(var(--success))' };

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatCategoria = (cat: string) => cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const openTask = (path: string) => navigate(path, { state: { stockReturn: location.pathname + location.search, stockFilters: { search: searchTerm, category: filterCategoria, alert: filterAlerta, tab: activeTab } } });
  const handleNew = () => openTask('/estoque/novo');
  const handleEdit = (item: any) => openTask(`/estoque/${item.id}/editar`);
  useEffect(() => {
    if (!task || initialized.current || estoqueQuery.isLoading || estoqueQuery.isError) return;
    if (task === 'new') { initialized.current = true; return; }
    const p = estoque.find(item => item.id === itemId);
    if (!p) return;
    if (task !== 'edit') { initialized.current = true; return; }
    const initial = {
      id: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade || 'unidade',
      quantidade: p.quantidade, quantidade_minima: p.quantidade_minima ?? 10,
      quantidade_maxima: p.quantidade_maxima ?? undefined, ponto_pedido: p.ponto_pedido ?? undefined,
      valor_unitario: formatMoneyInput(p.valor_unitario ?? 0),
      valor_venda: p.valor_venda == null ? undefined : formatMoneyInput(p.valor_venda),
      localizacao: p.localizacao || '', lote: p.lote || undefined, validade: p.validade || undefined,
      fornecedor: p.fornecedor || undefined, descricao: p.descricao || undefined,
      codigo_ean: p.codigo_ean || undefined, fabricante: p.fabricante || undefined,
      principio_ativo: p.principio_ativo || undefined, dosagem: p.dosagem || undefined,
    };
    initialized.current = true;
    baseline.current = JSON.stringify(initial);
    setSelectedUpdatedAt(p.updated_at ?? null);
    setFormData(initial);
  }, [task, estoque, itemId, estoqueQuery.isLoading, estoqueQuery.isError]);

  const handleSave = async () => {
    if (saveLock.current) return;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Recarregue a página e tente novamente.'); return; }
    if (!formData.nome.trim()) { toast.error('Nome é obrigatório.'); return; }
    const estoqueInteiroValido = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
    if (!estoqueInteiroValido(formData.quantidade) || !estoqueInteiroValido(formData.quantidade_minima)) {
      toast.error('Quantidade atual e estoque mínimo devem ser inteiros válidos dentro do limite do sistema.'); return;
    }
    if (formData.quantidade_maxima != null && (!estoqueInteiroValido(formData.quantidade_maxima) || formData.quantidade_maxima < 1 || formData.quantidade_maxima < formData.quantidade)) {
      toast.error('O estoque máximo deve ser um inteiro maior ou igual ao saldo atual.'); return;
    }
    if (formData.ponto_pedido != null && (!estoqueInteiroValido(formData.ponto_pedido) || formData.ponto_pedido < 1)) {
      toast.error('O ponto de pedido deve ser um inteiro maior que zero.'); return;
    }
    const valorUnitario = parseMoneyInput(formData.valor_unitario);
    const valorVenda = formData.valor_venda?.trim() ? parseMoneyInput(formData.valor_venda) : null;
    if (valorUnitario === null || valorUnitario < 0 || valorUnitario > 99_999_999.99
      || (formData.valor_venda?.trim() && (valorVenda === null || valorVenda < 0 || valorVenda > 99_999_999.99))) {
      toast.error('Custo e preço de venda devem ser valores válidos dentro do limite aceito.'); return;
    }
    if (estoqueQuery.isError || estoqueQuery.isLoading) { toast.error('Carregue o estoque antes de salvar.'); return; }
    saveLock.current = true;
    setIsSaving(true);
    try {
      const payload = {
        nome: formData.nome.trim(), categoria: formData.categoria, unidade: formData.unidade,
        ...(selectedId ? {} : { quantidade: formData.quantidade }), quantidade_minima: formData.quantidade_minima,
        quantidade_maxima: formData.quantidade_maxima ?? null, ponto_pedido: formData.ponto_pedido ?? null,
        valor_unitario: valorUnitario, valor_venda: valorVenda,
        localizacao: formData.localizacao || null, lote: formData.lote || null,
        validade: formData.validade || null, fornecedor: formData.fornecedor || null,
        descricao: formData.descricao || null, codigo_ean: formData.codigo_ean || null,
        fabricante: formData.fabricante || null, principio_ativo: formData.principio_ativo || null,
        dosagem: formData.dosagem || null,
      };

      if (selectedId) {
        let query = supabase.from('estoque').update(payload).eq('id', selectedId).eq('clinica_id', profile.clinica_id);
        query = selectedUpdatedAt ? query.eq('updated_at', selectedUpdatedAt) : query.is('updated_at', null);
        const { data, error } = await query.select('id').maybeSingle();
        if (error) throw error;
        if (!data) {
          await queryClient.invalidateQueries({ queryKey: ['estoque'] });
          throw new Error('Este produto foi alterado por outra pessoa ou removido. Atualize a lista e confira os dados antes de salvar novamente.');
        }
        toast.success('Produto atualizado!');
    } else {
        const { data, error } = await (supabase as any).rpc('cadastrar_item_estoque', {
          p_clinica_id: profile.clinica_id,
          p_nome: payload.nome,
          p_categoria: payload.categoria,
          p_unidade: payload.unidade,
          p_quantidade: formData.quantidade,
          p_quantidade_minima: payload.quantidade_minima,
          p_quantidade_maxima: payload.quantidade_maxima,
          p_ponto_pedido: payload.ponto_pedido,
          p_valor_unitario: payload.valor_unitario,
          p_valor_venda: payload.valor_venda,
          p_localizacao: payload.localizacao,
          p_lote: payload.lote,
          p_validade: payload.validade,
          p_fornecedor: payload.fornecedor,
          p_descricao: payload.descricao,
          p_codigo_ean: payload.codigo_ean,
          p_fabricante: payload.fabricante,
          p_principio_ativo: payload.principio_ativo,
          p_dosagem: payload.dosagem,
          p_chave_cadastro: chaveCadastro,
        });
        if (error) throw error;
        if (typeof data !== 'string' || !data) throw new Error('O servidor não confirmou o cadastro. Tente novamente antes de abrir outro produto.');
        toast.success('Produto cadastrado!');
      }
      await queryClient.invalidateQueries({ queryKey: ['estoque'] });
      finish();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar.');
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const handleMovimentacao = (item: any, tipo: 'entrada' | 'saida') => openTask(`/estoque/${item.id}/${tipo}`);

  const handleSaveMovimentacao = async () => {
    if (saveLock.current) return;
    if (estoqueQuery.isError || estoqueQuery.isLoading) { toast.error('Carregue o saldo atual antes de movimentar o estoque.'); return; }
    if (!movimentacao.quantidade || movimentacao.quantidade <= 0) { toast.error('Quantidade inválida.'); return; }
    if (!movimentacao.motivo.trim()) { toast.error('Informe o motivo da movimentação para manter o histórico do estoque completo.'); return; }
    const produto = (estoque as any[]).find(p => p.id === selectedId);
    if (!produto || !profile?.clinica_id) { toast.error('Produto ou clínica não identificados. Atualize o estoque e tente novamente.'); return; }
    if (!Number.isSafeInteger(movimentacao.quantidade) || movimentacao.quantidade > 2_147_483_647) { toast.error('A quantidade deve ser um número inteiro válido.'); return; }
    saveLock.current = true;
    setIsSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('registrar_movimentacao_estoque', {
        p_item_id: selectedId,
        p_tipo: movimentacao.tipo,
        p_quantidade: movimentacao.quantidade,
        p_motivo: movimentacao.motivo.trim(),
        p_chave_idempotencia: movimentacao.chaveIdempotencia,
      });
      if (error) throw error;
      if (!Number.isInteger(data)) throw new Error('O servidor não confirmou o novo saldo. Atualize o estoque antes de repetir.');
      toast.success(`${movimentacao.tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada!`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['estoque'] }),
        queryClient.invalidateQueries({ queryKey: ['movimentacoes-timeline'] }),
      ]);
      finish();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao registrar.');
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const handleOpenTimeline = (item: any) => openTask(`/estoque/${item.id}/historico`);

  const handleDeleteProduto = async () => {
    if (!deleteId || saveLock.current) return;
    saveLock.current = true;
    setIsSaving(true);
    try {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await supabase.from('estoque').delete().eq('id', deleteId).eq('clinica_id', profile.clinica_id).select('id');
      if (error?.code === '23503') {
        toast.error('Este produto tem movimentações registradas e não pode ser excluído.', {
          description: 'Mantenha o cadastro para preservar a trilha de auditoria.',
        });
        return;
      }
      if (error?.code === '23514') {
        toast.error('Zere o saldo antes de excluir este produto.', {
          description: 'Registre uma saída no estoque ou conclua a venda no caixa.',
        });
        return;
      }
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Sem permissão para excluir ou produto já removido.');
        return;
      }
      toast.success('Produto excluído!');
      await queryClient.invalidateQueries({ queryKey: ['estoque'] });
      setIsDeleteOpen(false);
      setDeleteId(null);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir.');
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  // Expiry alert items
  const expiryAlerts = useMemo(() => {
    return (estoque as any[]).filter(p => {
      const dias = daysUntilValidity(p.validade);
      return Number(p.quantidade) > 0 && dias !== null && dias <= 60;
    }).sort((a, b) => {
      return (daysUntilValidity(a.validade) ?? Number.MAX_SAFE_INTEGER) - (daysUntilValidity(b.validade) ?? Number.MAX_SAFE_INTEGER);
    });
  }, [estoque, daysUntilValidity]);

  // Itens vencidos e saldo crítico precisam de uma ação; vencimento futuro já tem filtro próprio.
  const heroItem = useMemo(() => {
    const items = estoque as any[];
    const vencido = expiryAlerts.find(item => (daysUntilValidity(item.validade) ?? 0) < 0);
    if (vencido) return { item: vencido, tipo: 'vencido' as const };
    const criticos = items
      .filter(p => p.quantidade <= (p.quantidade_minima || 0))
      .sort((a, b) => (a.quantidade - (a.quantidade_minima || 0)) - (b.quantidade - (b.quantidade_minima || 0)));
    if (criticos[0]) return { item: criticos[0], tipo: 'estoque' as const };
    return null;
  }, [estoque, expiryAlerts, daysUntilValidity]);

  const isMedicamento = formData.categoria === 'medicamentos';
  const timelineItem = (estoque as any[]).find(p => p.id === timelineItemId);
  const produtoSelecionado = (estoque as any[]).find(p => p.id === selectedId);
  const saldoAtualMovimentacao = Number(produtoSelecionado?.quantidade ?? 0);
  const quantidadeMovimentacaoValida = Number.isSafeInteger(movimentacao.quantidade)
    && movimentacao.quantidade > 0
    && movimentacao.quantidade <= 2_147_483_647;
  const saldoAposMovimentacao = movimentacao.tipo === 'entrada'
    ? saldoAtualMovimentacao + movimentacao.quantidade
    : saldoAtualMovimentacao - movimentacao.quantidade;
  const saidaExcedeSaldo = movimentacao.tipo === 'saida'
    && quantidadeMovimentacaoValida
    && movimentacao.quantidade > saldoAtualMovimentacao;
  const entradaExcedeMaximo = movimentacao.tipo === 'entrada'
    && quantidadeMovimentacaoValida
    && produtoSelecionado?.quantidade_maxima != null
    && saldoAposMovimentacao > Number(produtoSelecionado.quantidade_maxima);
  const valorUnitarioDigitado = parseMoneyInput(formData.valor_unitario);
  const valorVendaDigitado = formData.valor_venda?.trim() ? parseMoneyInput(formData.valor_venda) : null;
  const custoInvalido = valorUnitarioDigitado === null || valorUnitarioDigitado < 0 || valorUnitarioDigitado > 99_999_999.99;
  const vendaInvalida = !!formData.valor_venda?.trim()
    && (valorVendaDigitado === null || valorVendaDigitado < 0 || valorVendaDigitado > 99_999_999.99);

  const descricao = stats.total > 0
    ? [
      plural(stats.total, 'item', 'itens'),
      stats.critico > 0 ? `${stats.critico} em estoque baixo` : null,
      stats.vencidos > 0 ? `${stats.vencidos} vencido${stats.vencidos === 1 ? '' : 's'}` : null,
      stats.vencendo > 0 ? `${stats.vencendo} vencendo em 60 dias` : null,
    ].filter(Boolean).join(' · ')
    : 'Controle de materiais e medicamentos: saldo, validade e movimentações.';

  if (isLoading && !initialized.current) {
    return (
      <main className="space-y-6">
        <PageHeader title="Estoque" description="Controle de materiais e medicamentos" icon={<Package />} />
        <CardGridSkeleton count={4} /><Card><CardHeader><CardTitle>Produtos</CardTitle></CardHeader>
        <CardContent><TableSkeleton rows={6} cols={6} /></CardContent></Card>
      </main>
    );
  }
  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="O estoque não pode ser exibido ou alterado sem identificar a clínica atual." />;
  }
  if (estoqueQuery.isError && !initialized.current) {
    return <ErrorState title="Não foi possível carregar o estoque" error={estoqueQuery.error} onRetry={() => void estoqueQuery.refetch()} />;
  }

  if (itemId && !isLoading && !estoque.some(item => item.id === itemId) && !initialized.current) return <div className="space-y-4"><Button variant="outline" onClick={leave}>Voltar ao estoque</Button><ErrorState title="Produto não encontrado" description="O item não está disponível nesta clínica. Volte à lista para conferir o cadastro." /></div>;

  const indicadores: { key: typeof filterAlerta; label: string; value: string; caption: string; color: string }[] = [
    { key: 'todos', label: 'Total de itens', value: String(stats.total), caption: 'cadastrados no estoque', color: 'text-foreground' },
    { key: 'critico', label: 'Estoque baixo', value: String(stats.critico), caption: 'no mínimo ou abaixo', color: 'text-destructive' },
    { key: 'vencidos', label: 'Itens vencidos', value: String(stats.vencidos), caption: 'saldo maior que zero', color: 'text-destructive' },
    { key: 'validade', label: 'Validade próxima', value: String(stats.vencendo), caption: 'vencem em até 60 dias', color: 'text-warning-foreground' },
    { key: 'ponto_pedido', label: 'Ponto de pedido', value: String(stats.pontoPedido), caption: 'reposição recomendada', color: 'text-primary' },
  ];

  return (
    <main className="space-y-6 pb-24 lg:pb-8">
      {(formPage || movementPage) && <UnsavedChangesGuard dirty={formPage ? JSON.stringify(formData) !== baseline.current : !!(movimentacao.quantidade || movimentacao.motivo)} busy={isSaving} completed={completed} />}
      {task && <Button variant="outline" onClick={leave} disabled={isSaving}>Voltar ao estoque</Button>}
      {task && estoqueQuery.isError && <ErrorState compact description="Não foi possível atualizar o estoque. Seu preenchimento foi preservado; tente carregar novamente antes de salvar." error={estoqueQuery.error} onRetry={() => void estoqueQuery.refetch()} />}
      {!task && <>
      <PageHeader
        title="Estoque"
        description={descricao}
        icon={<Package />}
        actions={<>
          <div className="flex rounded-full border border-border/60 bg-card p-1">
            <button type="button" aria-pressed={activeTab === 'produtos'} onClick={() => setActiveTab('produtos')}
              className={cn('flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', activeTab === 'produtos' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <Package className="h-3.5 w-3.5" /> Produtos
            </button>
            <button type="button" aria-pressed={activeTab === 'curva_abc'} onClick={() => setActiveTab('curva_abc')}
              className={cn('flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', activeTab === 'curva_abc' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <BarChart3 className="h-3.5 w-3.5" /> Curva ABC
            </button>
          </div>
          <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void estoqueQuery.refetch()} disabled={estoqueQuery.isFetching} aria-label="Atualizar estoque" title="Atualizar estoque">
            <RefreshCw className={cn('h-4 w-4', estoqueQuery.isFetching && 'animate-spin')} />
          </Button>
          <Button onClick={handleNew} className="shrink-0 gap-2"><Plus className="h-4 w-4" />Novo item</Button>
        </>}
      />

      {estoque.length >= MAX_LINHAS_AUTO && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            A tela carregou o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} itens. O valor total, a Curva ABC e a listagem podem não incluir todo o estoque da clínica.
          </p>
        </div>
      )}

      <section role="group" aria-label="Situação do estoque" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Situação agora</h2>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs text-muted-foreground">Valor em estoque</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(stats.valorTotal)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-5">
          {indicadores.map((item) => {
            const ativo = filterAlerta === item.key;
            return (
              <button key={item.key} type="button" aria-pressed={ativo} onClick={() => { setActiveTab('produtos'); setFilterAlerta(ativo ? 'todos' : item.key); }}
                className={cn('min-h-[84px] min-w-0 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  ativo && 'bg-primary/5')}>
                <span className="block truncate text-xs font-medium text-muted-foreground">{item.label}</span>
                <span className={cn('mt-1 block text-2xl font-semibold tabular-nums', item.color)}>{item.value}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.caption}</span>
              </button>
            );
          })}
        </div>
        <p className="sr-only">{filterAlerta === 'todos' ? 'Selecione um indicador para filtrar os produtos.' : 'Um filtro de situação está ativo. Selecione-o novamente para limpar.'}</p>
      </section>

      {activeTab === 'produtos' && heroItem && (() => {
        const { item, tipo } = heroItem;
        const status = getStatus(item);
        const dias = daysUntilValidity(item.validade);
        return <Card className={cn('overflow-hidden rounded-xl', tipo === 'vencido' && 'border-destructive/30 bg-destructive/5')}>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span aria-hidden="true" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tipo === 'vencido' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning-foreground')}>
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className={cn('text-[11px] font-semibold uppercase tracking-wide', tipo === 'vencido' ? 'text-destructive' : 'text-warning-foreground')}>
                  {tipo === 'vencido' ? 'Item vencido — revisar saída' : 'Item com estoque crítico'}
                </p>
                <h2 className="truncate text-lg font-bold text-foreground">{item.nome}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatCategoria(item.categoria)}{item.localizacao ? ` · ${item.localizacao}` : ''}</span>
                  <span className="font-medium tabular-nums">{item.quantidade} {item.unidade}{item.quantidade_minima ? ` · mínimo ${item.quantidade_minima}` : ''}</span>
                  {item.validade && <span className={cn('inline-flex items-center gap-1 font-medium', dias !== null && dias < 0 ? 'text-destructive' : dias !== null && dias <= 30 ? 'text-warning-foreground' : '')}>
                    Validade {format(parseDateOnly(item.validade)!, 'dd/MM/yyyy')}{dias !== null && (dias < 0 ? ` · vencido há ${plural(Math.abs(dias), 'dia', 'dias')}` : ` · em ${plural(dias, 'dia', 'dias')}`)}
                  </span>}
                  <Badge variant={status.variant} className="rounded-full text-[10px]">{status.label}</Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button variant={tipo === 'vencido' ? 'destructive' : 'default'} className="h-10 gap-1.5" onClick={() => handleMovimentacao(item, tipo === 'vencido' ? 'saida' : 'entrada')}>
                {tipo === 'vencido' ? <ArrowUp aria-hidden="true" className="h-4 w-4" /> : <ArrowDown aria-hidden="true" className="h-4 w-4" />}
                {tipo === 'vencido' ? 'Registrar saída' : 'Registrar entrada'}
              </Button>
              <Button variant="outline" className="h-10 gap-1.5 rounded-full" onClick={() => handleEdit(item)}>
                <Edit aria-hidden="true" className="h-4 w-4" /> Editar
              </Button>
            </div>
          </CardContent>
        </Card>;
      })()}

      {/* ─── ABC Curve Tab ─── */}
      {activeTab === 'curva_abc' && (
        <div className="space-y-4">
          {/* ABC Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { classe: 'A', label: 'Classe A — Alto valor', color: 'text-destructive', bg: 'bg-destructive/10', ...abcSummary.a },
              { classe: 'B', label: 'Classe B — Médio valor', color: 'text-warning', bg: 'bg-warning/10', ...abcSummary.b },
              { classe: 'C', label: 'Classe C — Baixo valor', color: 'text-success', bg: 'bg-success/10', ...abcSummary.c },
            ].map(cls => (
              <Card key={cls.classe} className="rounded-2xl border-border/60 shadow-xs">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center text-lg font-black', cls.bg, cls.color)}>
                      {cls.classe}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{cls.label}</p>
                      <p className={cn('text-xl font-bold tabular-nums', cls.color)}>{cls.count} itens</p>
                      <p className="text-xs text-muted-foreground">{cls.pct}% do valor • {formatCurrency(cls.valor)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ABC Chart */}
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader>
              <CardTitle>Top 20 — Curva ABC de Estoque</CardTitle>
              <CardDescription>Itens ordenados por valor total (qtd × custo unitário)</CardDescription>
            </CardHeader>
            <CardContent>
              {abcChartData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum dado disponível</p>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={abcChartData} layout="vertical" margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs"
                      tickFormatter={(v) => formatCurrency(v)} />
                    <YAxis type="category" dataKey="nome" width={120} className="text-xs" />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                      {abcChartData.map((entry, i) => (
                        <Cell key={i} fill={ABC_COLORS[entry.classe as keyof typeof ABC_COLORS]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* ABC Table */}
          <Card className="rounded-2xl border-border/60 shadow-xs">
            <CardHeader><CardTitle>Classificação Completa</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border border-border/60">
                <Table containerProps={{ role: 'region', 'aria-label': 'Tabela da curva ABC; use a rolagem horizontal para acessar todas as colunas', tabIndex: 0, className: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring' }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-right">% Acum.</TableHead>
                      <TableHead>Classe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {abcData.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{item.nome}</TableCell>
                        <TableCell className="text-sm">{formatCategoria(item.categoria)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-sm">{formatCurrency(item.valor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{item.percentAcc}%</TableCell>
                        <TableCell>
                          <Badge className={cn('rounded-full font-bold',
                            item.classe === 'A' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                            item.classe === 'B' ? 'bg-warning/10 text-warning border-warning/20' :
                            'bg-success/10 text-success border-success/20',
                          )}>{item.classe}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Products Tab ─── */}
      {activeTab === 'produtos' && (
        <>
          {(estoque as any[]).length === 0 ? (
            <EmptyEstoque onAdd={handleNew} />
          ) : (
            <section className="space-y-3" aria-labelledby="estoque-list-heading">
              <h2 id="estoque-list-heading" className="text-xl font-semibold">Produtos</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-72">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Buscar produtos" className="h-10 rounded-full pl-9" placeholder="Produto, EAN, lote, fornecedor..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                  <SelectTrigger aria-label="Filtrar por categoria" className="h-10 w-full rounded-full sm:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as categorias</SelectItem>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{formatCategoria(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div role="group" aria-label="Filtrar por alerta" className="flex flex-wrap items-center gap-1.5">
                  {([['todos', 'Todos'], ['critico', 'Estoque crítico'], ['vencidos', 'Vencidos'], ['validade', 'Vencem em até 60 dias'], ['ponto_pedido', 'Ponto de pedido']] as [typeof filterAlerta, string][]).map(([key, label]) => {
                    const ativo = filterAlerta === key;
                    return <button key={key} type="button" aria-pressed={ativo} onClick={() => setFilterAlerta(key)}
                      className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground')}>{label}</button>;
                  })}
                </div>
                {(searchTerm.trim() !== '' || filterCategoria !== 'todos' || filterAlerta !== 'todos') && (
                  <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={() => { setSearchTerm(''); setFilterCategoria('todos'); setFilterAlerta('todos'); }}>
                    <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
                  </Button>
                )}
                <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">{filteredProdutos.length} de {plural(stats.total, 'item', 'itens')}</p>
              </div>

              {filteredProdutos.length === 0 ? (
                <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="py-16 text-center text-muted-foreground">
                  <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Package className="h-7 w-7" /></span>
                  <p className="font-medium text-foreground">Nenhum produto corresponde aos filtros</p>
                  <p className="mt-1 text-sm">Limpe a busca, a categoria ou o indicador para ver todos os itens.</p>
                  <Button className="mt-4 rounded-full" size="sm" variant="outline" onClick={() => { setSearchTerm(''); setFilterCategoria('todos'); setFilterAlerta('todos'); }}>Limpar filtros</Button>
                </CardContent></Card>
              ) : (
                <Card className="rounded-2xl border-border/60 shadow-xs">
                  <CardContent className="p-4">
                    <div className="overflow-hidden rounded-xl border border-border/60">
                      <Table className="md:min-w-[760px]" containerProps={{ role: 'region', 'aria-label': 'Tabela de produtos; use a rolagem horizontal para acessar todas as colunas', tabIndex: 0, className: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring' }}>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produto</TableHead>
                            <TableHead className="hidden lg:table-cell">EAN / Fabricante</TableHead>
                            <TableHead className="hidden md:table-cell">Categoria</TableHead>
                            <TableHead>Estoque</TableHead>
                            <TableHead className="hidden sm:table-cell">Validade</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProdutos.map((produto: any) => {
                            const status = getStatus(produto);
                            const validadeInfo = getValidadeInfo(produto.validade);
                            return (
                              <TableRow key={produto.id}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{produto.nome}</p>
                                    {produto.validade && (
                                      <p className={cn('mt-1 text-xs sm:hidden', validadeInfo?.dias !== undefined && validadeInfo.dias < 0 ? 'font-medium text-destructive' : validadeInfo?.dias !== undefined && validadeInfo.dias <= 30 ? 'font-medium text-warning-foreground' : 'text-muted-foreground')}>
                                        Validade {format(parseDateOnly(produto.validade)!, 'dd/MM/yyyy')}{validadeInfo ? ` · ${validadeInfo.label}` : ''}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {produto.principio_ativo && (
                                        <span className="flex items-center gap-0.5"><Pill className="h-3 w-3" />{produto.principio_ativo}</span>
                                      )}
                                      {produto.dosagem && <span>{produto.dosagem}</span>}
                                      {produto.localizacao && <span>· {produto.localizacao}</span>}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <div className="text-xs space-y-0.5">
                                    {produto.codigo_ean && (
                                      <p className="flex items-center gap-1 font-mono"><Barcode className="h-3 w-3" />{produto.codigo_ean}</p>
                                    )}
                                    {produto.fabricante && (
                                      <p className="flex items-center gap-1 text-muted-foreground"><Building2 className="h-3 w-3" />{produto.fabricante}</p>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-sm">
                                  {formatCategoria(produto.categoria)}
                                </TableCell>
                                <TableCell>
                                  <span className="font-medium tabular-nums">{produto.quantidade}</span>
                                  <span className="text-muted-foreground text-xs"> {produto.unidade}</span>
                                  {produto.ponto_pedido && produto.quantidade <= produto.ponto_pedido && (
                                    <p className="text-[10px] text-destructive flex items-center gap-0.5 mt-0.5">
                                      <TrendingDown className="h-3 w-3" />Ponto de pedido
                                    </p>
                                  )}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  {produto.validade ? (
                                    <div className="text-xs">
                                      <p>{format(parseDateOnly(produto.validade)!, 'dd/MM/yyyy')}</p>
                                      {validadeInfo && (
                                        <Badge variant={validadeInfo.color} className="rounded-full text-[9px] mt-0.5">
                                          {validadeInfo.label}
                                        </Badge>
                                      )}
                                    </div>
                                  ) : <span className="text-muted-foreground text-xs">—</span>}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={status.variant} className="rounded-full">{status.label}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label={`Ver histórico de ${produto.nome}`} onClick={() => handleOpenTimeline(produto)} title="Histórico">
                                      <History className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label={`Registrar entrada de ${produto.nome}`} onClick={() => handleMovimentacao(produto, 'entrada')} title="Entrada">
                                      <ArrowDown className="h-4 w-4 text-success" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label={`Registrar saída de ${produto.nome}`} onClick={() => handleMovimentacao(produto, 'saida')} title="Saída">
                                      <ArrowUp className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                     <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label={`Editar item ${produto.nome}`} onClick={() => handleEdit(produto)}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                     <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label={`Excluir item ${produto.nome}`} onClick={() => { setDeleteId(produto.id); setIsDeleteOpen(true); }}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>
          )}
        </>
      )}

      </>}
      {historyPage && <section className="mx-auto max-w-4xl space-y-5">
        <PageHeader title="Histórico de movimentações" description={timelineItem?.nome} icon={<History />} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(`/estoque/${itemId}/entrada`, { state: location.state })}>Registrar entrada</Button>
          <Button variant="outline" onClick={() => navigate(`/estoque/${itemId}/saida`, { state: location.state })}>Registrar saída</Button>
        </div>
          <div className="space-y-1">
            {movimentacoesQuery.isError ? (
              <ErrorState compact title="Não foi possível carregar o histórico" error={movimentacoesQuery.error} onRetry={() => void movimentacoesQuery.refetch()} />
            ) : movimentacoesQuery.isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground" role="status">Carregando histórico…</div>
            ) : movimentacoes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-10 w-10 mx-auto opacity-20 mb-2" />
                <p className="text-sm">Nenhuma movimentação registrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Exibindo até as 50 movimentações mais recentes.</p>
                <div className="relative pl-6 space-y-3">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                  {movimentacoes.map((mov: any) => (
                    <div
                      key={mov.id}
                      className="relative flex items-start gap-3"
                    >
                      <div className={cn(
                        'absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-background z-10',
                        mov.tipo === 'entrada' ? 'bg-success' : 'bg-muted-foreground',
                      )} />
                      <div className="flex-1 rounded-xl border border-border/60 bg-card p-3">
                        <div className="flex items-center justify-between">
                          <Badge variant={mov.tipo === 'entrada' ? 'success' : 'secondary'} className="rounded-full text-[10px]">
                            {mov.tipo === 'entrada' ? '↓ Entrada' : '↑ Saída'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatarDataMovimentacao(mov.created_at)}
                          </span>
                        </div>
                        <p className="text-sm font-bold mt-1 tabular-nums">
                          {mov.tipo === 'entrada' ? '+' : '-'}{mov.quantidade} {timelineItem?.unidade || 'unidade'}
                        </p>
                        {mov.motivo && <p className="text-xs text-muted-foreground mt-0.5">{mov.motivo}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
      </section>}

      {formPage && <section className="mx-auto max-w-5xl space-y-5">
        <PageHeader title={selectedId ? 'Editar produto' : 'Novo produto'} description={selectedId ? 'Atualize os dados do item. O saldo é alterado pelas operações de entrada e saída.' : 'Identifique o material, o lote e os parâmetros de reposição.'} icon={<Package />} />
        <form onSubmit={event => { event.preventDefault(); void handleSave(); }} className="rounded-xl border bg-card p-5 sm:p-6">
          <fieldset disabled={isSaving} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="stock-field-0" className="text-xs">Nome *</Label>
                <Input required id="stock-field-0" value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-field-1" className="text-xs">Código EAN / Barras</Label>
                <Input id="stock-field-1" value={formData.codigo_ean || ''} onChange={e => setFormData({ ...formData, codigo_ean: e.target.value })}
                  placeholder="7891234567890" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="stock-field-2" className="text-xs">Categoria</Label>
                <Select value={formData.categoria} onValueChange={v => setFormData({ ...formData, categoria: v })}>
                  <SelectTrigger id="stock-field-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{formatCategoria(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-field-3" className="text-xs">Unidade</Label>
                <Select value={formData.unidade} onValueChange={v => setFormData({ ...formData, unidade: v })}>
                  <SelectTrigger id="stock-field-3"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => <SelectItem key={u} value={u}>{formatCategoria(u)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-field-4" className="text-xs">Fabricante / Marca</Label>
                <Input id="stock-field-4" value={formData.fabricante || ''} onChange={e => setFormData({ ...formData, fabricante: e.target.value })} placeholder="Ex: Medley, 3M..." />
              </div>
            </div>
            {isMedicamento && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Pill className="h-4 w-4" /> Dados do Medicamento</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label htmlFor="stock-field-5" className="text-xs">Princípio Ativo</Label>
                      <Input id="stock-field-5" value={formData.principio_ativo || ''} onChange={e => setFormData({ ...formData, principio_ativo: e.target.value })} placeholder="Ex: Paracetamol" /></div>
                    <div className="space-y-1.5"><Label htmlFor="stock-field-6" className="text-xs">Dosagem / Concentração</Label>
                      <Input id="stock-field-6" value={formData.dosagem || ''} onChange={e => setFormData({ ...formData, dosagem: e.target.value })} placeholder="Ex: 500mg, 10mg/ml" /></div>
                  </div>
                </div>
              </>
            )}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" /> Controle de Estoque</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1.5"><Label htmlFor="stock-field-7" className="text-xs">{selectedId ? 'Quantidade atual' : 'Saldo inicial'}</Label>
                  <Input id="stock-field-7" type="number" min="0" step="1" value={formData.quantidade} disabled={!!selectedId} onChange={e => setFormData({ ...formData, quantidade: e.target.value === '' ? 0 : Number(e.target.value) })} />
                  {selectedId && <p className="text-[11px] text-muted-foreground">Use Entrada ou Saída para alterar o saldo e manter o histórico.</p>}
                  {!selectedId && <p className="text-[11px] text-muted-foreground">O saldo de abertura será registrado no histórico como entrada.</p>}
                </div>
                <div className="space-y-1.5"><Label htmlFor="stock-field-8" className="text-xs">Mínimo</Label>
                  <Input id="stock-field-8" type="number" min="0" step="1" value={formData.quantidade_minima} onChange={e => setFormData({ ...formData, quantidade_minima: e.target.value === '' ? 0 : Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label htmlFor="stock-field-9" className="text-xs">Ponto de Pedido</Label>
                  <Input id="stock-field-9" type="number" min="1" step="1" value={formData.ponto_pedido ?? ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, ponto_pedido: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label htmlFor="stock-field-10" className="text-xs">Máximo</Label>
                  <Input id="stock-field-10" type="number" min="1" step="1" value={formData.quantidade_maxima ?? ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, quantidade_maxima: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5"><Label htmlFor="stock-field-11" className="text-xs">Valor Custo (R$)</Label>
                <Input id="stock-field-11" type="text" inputMode="decimal" placeholder="0,00" value={formData.valor_unitario} onChange={e => setFormData({ ...formData, valor_unitario: e.target.value })} />
                {custoInvalido && <p className="text-xs text-destructive" role="alert">Informe um custo entre R$ 0,00 e R$ 99.999.999,99, com até duas casas decimais.</p>}</div>
              <div className="space-y-1.5"><Label htmlFor="stock-field-12" className="text-xs">Valor Venda (R$)</Label>
                <Input id="stock-field-12" type="text" inputMode="decimal" value={formData.valor_venda || ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, valor_venda: e.target.value })} />
                {vendaInvalida && <p className="text-xs text-destructive" role="alert">Informe um preço entre R$ 0,00 e R$ 99.999.999,99, com até duas casas decimais.</p>}</div>
              <div className="space-y-1.5"><Label htmlFor="stock-field-13" className="text-xs">Fornecedor</Label>
                <Input id="stock-field-13" value={formData.fornecedor || ''} onChange={e => setFormData({ ...formData, fornecedor: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="stock-field-14" className="text-xs">Localização</Label>
                <Input id="stock-field-14" value={formData.localizacao} onChange={e => setFormData({ ...formData, localizacao: e.target.value })} placeholder="Prateleira A1" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="stock-field-15" className="text-xs">Lote</Label>
                <Input id="stock-field-15" value={formData.lote || ''} onChange={e => setFormData({ ...formData, lote: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="stock-field-16" className="text-xs">Validade</Label>
                <Input id="stock-field-16" type="date" value={formData.validade || ''} onChange={e => setFormData({ ...formData, validade: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="stock-field-17" className="text-xs">Descrição / Observações</Label>
              <Textarea id="stock-field-17" value={formData.descricao || ''} onChange={e => setFormData({ ...formData, descricao: e.target.value })} rows={2} placeholder="Informações adicionais..." /></div>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2 pt-5 mt-5 border-t scroll-mb-24">
            <Button variant="outline" className="rounded-full" type="button" onClick={leave} disabled={isSaving}>Cancelar</Button>
            <Button type="submit" disabled={isSaving || estoqueQuery.isError}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </div>
        </form>
      </section>}

      {movementPage && <section className="mx-auto max-w-3xl space-y-5">
        <PageHeader title={movimentacao.tipo === 'entrada' ? 'Entrada de estoque' : 'Saída de estoque'} description={produtoSelecionado?.nome} icon={movimentacao.tipo === 'entrada' ? <ArrowDown /> : <ArrowUp />} />
        <form onSubmit={event => { event.preventDefault(); void handleSaveMovimentacao(); }} className="rounded-xl border bg-card p-5 sm:p-6">
          <fieldset disabled={isSaving} className="space-y-4 py-4">

            <div className="space-y-2"><Label htmlFor="estoque-movimentacao-quantidade">Quantidade * ({produtoSelecionado?.unidade || 'unidade'})</Label>
              <Input required id="estoque-movimentacao-quantidade" type="number" min="1" step="1" value={movimentacao.quantidade || ''} onChange={e => setMovimentacao({ ...movimentacao, quantidade: e.target.value === '' ? 0 : Number(e.target.value) })} />
              {produtoSelecionado && (
                <p className="text-xs text-muted-foreground" role="status">
                  Saldo atual: {saldoAtualMovimentacao} {produtoSelecionado.unidade || 'unidade'}
                  {quantidadeMovimentacaoValida && <> · Após a movimentação: {saldoAposMovimentacao}</>}
                </p>
              )}
              {saidaExcedeSaldo && (
                <p className="flex items-center gap-1 text-xs text-destructive" role="alert">
                  <AlertTriangle className="h-3.5 w-3.5" /> A saída excede o saldo disponível.
                </p>
              )}
              {entradaExcedeMaximo && (
                <p className="flex items-center gap-1 text-xs text-destructive" role="alert">
                  <AlertTriangle className="h-3.5 w-3.5" /> A entrada ultrapassa o estoque máximo de {produtoSelecionado?.quantidade_maxima} {produtoSelecionado?.unidade || 'unidade'}.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="estoque-movimentacao-motivo">Motivo *</Label>
              <Input
                id="estoque-movimentacao-motivo"
                required
                value={movimentacao.motivo}
                onChange={e => setMovimentacao({ ...movimentacao, motivo: e.target.value })}
                placeholder={movimentacao.tipo === 'entrada' ? 'Ex.: compra, devolução ou nota fiscal' : 'Ex.: uso, perda ou ajuste'}
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground">O motivo ficará registrado no histórico deste produto.</p>
            </div>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-5 scroll-mb-24">
            <Button variant="outline" className="rounded-full" type="button" onClick={leave} disabled={isSaving}>Cancelar</Button>
            <Button type="submit" disabled={isSaving || estoqueQuery.isError || !quantidadeMovimentacaoValida || saidaExcedeSaldo || entradaExcedeMaximo || !movimentacao.motivo.trim()}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Confirmar'}
            </Button>
          </div>
        </form>
      </section>}
      {/* Delete Confirm */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={open => {
          if (open || !saveLock.current) setIsDeleteOpen(open);
        }}
        title="Excluir Produto"
        description="Produtos sem movimentações podem ser excluídos. Itens com histórico permanecem no sistema para preservar a auditoria."
        onConfirm={handleDeleteProduto}
        isLoading={isSaving}
        closeOnConfirm={false}
      />
    </main>
  );
}
