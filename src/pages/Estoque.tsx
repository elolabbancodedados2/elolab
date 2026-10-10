import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus, Search, Edit, Package, AlertTriangle, ArrowDown, ArrowUp, Loader2,
  Barcode, Calendar, Pill, Building2, ShieldAlert, TrendingDown,
  History, BarChart3, Trash2, Bell,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { MAX_LINHAS_AUTO, useEstoque } from '@/hooks/useSupabaseData';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { CardGridSkeleton, TableSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyEstoque } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';

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

export default function Estoque() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('todos');
  const [filterAlerta, setFilterAlerta] = useState('todos');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMovimentacaoOpen, setIsMovimentacaoOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [timelineItemId, setTimelineItemId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'produtos' | 'curva_abc'>('produtos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedUpdatedAt, setSelectedUpdatedAt] = useState<string | null>(null);
  const [chaveCadastro, setChaveCadastro] = useState(() => crypto.randomUUID());
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [movimentacao, setMovimentacao] = useState<{ tipo: 'entrada' | 'saida'; quantidade: number; motivo: string; chaveIdempotencia: string }>({
    tipo: 'entrada', quantidade: 0, motivo: '', chaveIdempotencia: crypto.randomUUID(),
  });
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const estoqueQuery = useEstoque();
  const estoque = estoqueQuery.data ?? [];
  const { isLoading } = estoqueQuery;

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

  const daysUntilValidity = (validade: string | null) => {
    if (!validade || !/^\d{4}-\d{2}-\d{2}$/.test(validade)) return null;
    const dataValidade = new Date(`${validade}T00:00:00Z`);
    if (!Number.isFinite(dataValidade.getTime()) || dataValidade.toISOString().slice(0, 10) !== validade) return null;
    const due = dataValidade.getTime();
    const today = Date.parse(`${todaySaoPauloDateOnly()}T00:00:00Z`);
    return Math.floor((due - today) / 86400000);
  };

  const getValidadeInfo = (validade: string | null) => {
    const dias = daysUntilValidity(validade);
    if (dias === null) return null;
    if (dias < 0) return { label: 'Vencido', color: 'destructive' as const, dias };
    if (dias <= 30) return { label: `${dias}d`, color: 'destructive' as const, dias };
    if (dias <= 60) return { label: `${dias}d`, color: 'secondary' as const, dias };
    return null;
  };

  const filteredProdutos = useMemo(() => {
    return (estoque as any[]).filter(p => {
      const q = normalizarBuscaEstoque(searchTerm);
      const matchSearch = !q || [
        p.nome, p.codigo_ean, p.principio_ativo, p.fabricante, p.lote,
        p.fornecedor, p.localizacao, p.descricao, p.dosagem, p.categoria,
      ].some(valor => normalizarBuscaEstoque(valor).includes(q));
      const matchCategoria = filterCategoria === 'todos' || p.categoria === filterCategoria;
      if (filterAlerta === 'critico') return matchSearch && matchCategoria && p.quantidade <= (p.quantidade_minima || 0);
      if (filterAlerta === 'validade') {
        const info = getValidadeInfo(p.validade);
        return matchSearch && matchCategoria && Number(p.quantidade) > 0 && info !== null;
      }
      if (filterAlerta === 'ponto_pedido') return matchSearch && matchCategoria && p.ponto_pedido && p.quantidade <= p.ponto_pedido;
      return matchSearch && matchCategoria;
    });
  }, [estoque, searchTerm, filterCategoria, filterAlerta]);

  const getStatus = (produto: any) => {
    if (produto.quantidade <= 0) return { label: 'Sem estoque', variant: 'destructive' as const };
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
      vencendo: items.filter(p => {
        const info = getValidadeInfo(p.validade);
        return Number(p.quantidade) > 0 && info !== null && info.dias >= 0 && info.dias <= 60;
      }).length,
    };
  }, [estoque]);

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
      accumulated += item.valor;
      const percentAcc = (accumulated / totalValor) * 100;
      const classe = percentAcc <= 80 ? 'A' : percentAcc <= 95 ? 'B' : 'C';
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

  const handleNew = () => {
    setSelectedId(null);
    setSelectedUpdatedAt(null);
    setFormData(initialForm);
    setChaveCadastro(crypto.randomUUID());
    setIsFormOpen(true);
  };

  const handleEdit = (p: any) => {
    setSelectedId(p.id);
    setSelectedUpdatedAt(p.updated_at ?? null);
    setFormData({
      id: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade || 'unidade',
      quantidade: p.quantidade, quantidade_minima: p.quantidade_minima ?? 10,
      quantidade_maxima: p.quantidade_maxima ?? undefined, ponto_pedido: p.ponto_pedido ?? undefined,
      valor_unitario: formatMoneyInput(p.valor_unitario ?? 0),
      valor_venda: p.valor_venda == null ? undefined : formatMoneyInput(p.valor_venda),
      localizacao: p.localizacao || '', lote: p.lote || undefined, validade: p.validade || undefined,
      fornecedor: p.fornecedor || undefined, descricao: p.descricao || undefined,
      codigo_ean: p.codigo_ean || undefined, fabricante: p.fabricante || undefined,
      principio_ativo: p.principio_ativo || undefined, dosagem: p.dosagem || undefined,
    });
    setIsFormOpen(true);
  };

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
      setIsFormOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar.');
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const handleMovimentacao = (produto: any, tipo: 'entrada' | 'saida') => {
    setSelectedId(produto.id);
    setMovimentacao({ tipo, quantidade: 0, motivo: '', chaveIdempotencia: crypto.randomUUID() });
    setIsMovimentacaoOpen(true);
  };

  const handleSaveMovimentacao = async () => {
    if (saveLock.current) return;
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
      setIsMovimentacaoOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao registrar.');
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const handleOpenTimeline = (produto: any) => {
    setTimelineItemId(produto.id);
    setIsTimelineOpen(true);
  };

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
  }, [estoque]);

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-3xl font-bold text-foreground">Estoque</h1>
          <p className="text-muted-foreground">Controle de materiais e medicamentos</p></div>
        </div>
        <CardGridSkeleton count={4} /><Card><CardHeader><CardTitle>Produtos</CardTitle></CardHeader>
        <CardContent><TableSkeleton rows={6} cols={6} /></CardContent></Card>
      </div>
    );
  }
  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="O estoque não pode ser exibido ou alterado sem identificar a clínica atual." />;
  }
  if (estoqueQuery.isError) {
    return <ErrorState title="Não foi possível carregar o estoque" error={estoqueQuery.error} onRetry={() => void estoqueQuery.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Estoque</h1>
          <p className="text-muted-foreground">Controle de materiais e medicamentos</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <Button variant={activeTab === 'produtos' ? 'default' : 'ghost'} size="sm" className="h-8 gap-1.5 rounded-none border-0 text-xs"
              onClick={() => setActiveTab('produtos')}>
              <Package className="h-3.5 w-3.5" /> Produtos
            </Button>
            <Button variant={activeTab === 'curva_abc' ? 'default' : 'ghost'} size="sm" className="h-8 gap-1.5 rounded-none border-0 border-l text-xs"
              onClick={() => setActiveTab('curva_abc')}>
              <BarChart3 className="h-3.5 w-3.5" /> Curva ABC
            </Button>
          </div>
          <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />Novo Produto</Button>
        </div>
      </div>

      {estoque.length >= MAX_LINHAS_AUTO && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            A tela carregou o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} itens. O valor total, a Curva ABC e a listagem podem não incluir todo o estoque da clínica.
          </p>
        </div>
      )}

      {/* Expiry Alert Banner */}
      {expiryAlerts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-destructive flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-destructive">
                    {expiryAlerts.length} {expiryAlerts.length === 1 ? 'produto' : 'produtos'} com validade próxima ou vencido
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {expiryAlerts.slice(0, 5).map(p => {
                      const dias = daysUntilValidity(p.validade) ?? 0;
                      return (
                        <Badge key={p.id} variant={dias < 0 ? 'destructive' : 'secondary'} className="text-[10px]">
                          {p.nome} — {dias < 0 ? `Vencido há ${Math.abs(dias)}d` : `${dias}d restantes`}
                        </Badge>
                      );
                    })}
                    {expiryAlerts.length > 5 && (
                      <Badge variant="outline" className="text-[10px]">+{expiryAlerts.length - 5} mais</Badge>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setFilterAlerta('validade')}>
                  Ver todos
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-primary/10"><Package className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total de Itens</p>
            <p className="text-2xl font-bold">{stats.total}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-destructive/10"><AlertTriangle className="h-6 w-6 text-destructive" /></div>
            <div><p className="text-sm text-muted-foreground">Estoque Crítico</p>
            <p className="text-2xl font-bold text-destructive">{stats.critico}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-accent"><Calendar className="h-6 w-6 text-accent-foreground" /></div>
            <div><p className="text-sm text-muted-foreground">Vencendo ≤60d</p>
            <p className="text-2xl font-bold">{stats.vencendo}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-primary/10"><Package className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Valor Total</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.valorTotal)}</p></div>
          </div>
        </CardContent></Card>
      </div>

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
              <motion.div key={cls.classe} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
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
              </motion.div>
            ))}
          </div>

          {/* ABC Chart */}
          <Card>
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
          <Card>
            <CardHeader><CardTitle>Classificação Completa</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
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
                          <Badge className={cn('font-bold',
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
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle>Produtos</CardTitle>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Produto, EAN, lote, fornecedor..." value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                    </div>
                    <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{formatCategoria(c)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={filterAlerta} onValueChange={setFilterAlerta}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="critico">Estoque Crítico</SelectItem>
                        <SelectItem value="validade">Validade próxima ou vencida</SelectItem>
                        <SelectItem value="ponto_pedido">Ponto de Pedido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
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
                      {filteredProdutos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <div className="flex flex-col items-center gap-2">
                              <p>Nenhum produto encontrado com estes filtros</p>
                              <Button size="sm" variant="outline" onClick={() => {
                                setSearchTerm('');
                                setFilterCategoria('todos');
                                setFilterAlerta('todos');
                              }}>Limpar filtros</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredProdutos.map((produto: any) => {
                          const status = getStatus(produto);
                          const validadeInfo = getValidadeInfo(produto.validade);
                          return (
                            <TableRow key={produto.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{produto.nome}</p>
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
                                      <Badge variant={validadeInfo.color} className="text-[9px] mt-0.5">
                                        {validadeInfo.label}
                                      </Badge>
                                    )}
                                  </div>
                                ) : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                              <TableCell>
                                <Badge variant={status.variant}>{status.label}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="icon" aria-label={`Ver histórico de ${produto.nome}`} onClick={() => handleOpenTimeline(produto)} title="Histórico">
                                    <History className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                  <Button variant="ghost" size="icon" aria-label={`Registrar entrada de ${produto.nome}`} onClick={() => handleMovimentacao(produto, 'entrada')} title="Entrada">
                                    <ArrowDown className="h-4 w-4 text-primary" />
                                  </Button>
                                  <Button variant="ghost" size="icon" aria-label={`Registrar saída de ${produto.nome}`} onClick={() => handleMovimentacao(produto, 'saida')} title="Saída">
                                    <ArrowUp className="h-4 w-4 text-destructive" />
                                  </Button>
                                   <Button variant="ghost" size="icon" aria-label={`Editar item ${produto.nome}`} onClick={() => handleEdit(produto)}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                   <Button variant="ghost" size="icon" aria-label={`Excluir item ${produto.nome}`} onClick={() => { setDeleteId(produto.id); setIsDeleteOpen(true); }}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
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
          )}
        </>
      )}

      {/* ── Movement Timeline Dialog ── */}
      <Dialog open={isTimelineOpen} onOpenChange={setIsTimelineOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Histórico de Movimentações
            </DialogTitle>
            {timelineItem && (
              <p className="text-sm text-muted-foreground">{timelineItem.nome}</p>
            )}
          </DialogHeader>
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
                  {movimentacoes.map((mov: any, idx: number) => (
                    <motion.div
                      key={mov.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="relative flex items-start gap-3"
                    >
                      <div className={cn(
                        'absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-background z-10',
                        mov.tipo === 'entrada' ? 'bg-primary' : 'bg-destructive',
                      )} />
                      <div className="flex-1 bg-card border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <Badge variant={mov.tipo === 'entrada' ? 'default' : 'destructive'} className="text-[10px]">
                            {mov.tipo === 'entrada' ? '↓ Entrada' : '↑ Saída'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatarDataMovimentacao(mov.created_at)}
                          </span>
                        </div>
                        <p className="text-sm font-bold mt-1 tabular-nums">
                          {mov.tipo === 'entrada' ? '+' : '-'}{mov.quantidade} un.
                        </p>
                        {mov.motivo && <p className="text-xs text-muted-foreground mt-0.5">{mov.motivo}</p>}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Form Dialog (Enhanced) ── */}
      <Dialog open={isFormOpen} onOpenChange={open => {
        if (open || !saveLock.current) setIsFormOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedId ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-5 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome *</Label>
                <Input value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Código EAN / Barras</Label>
                <Input value={formData.codigo_ean || ''} onChange={e => setFormData({ ...formData, codigo_ean: e.target.value })}
                  placeholder="7891234567890" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria</Label>
                <Select value={formData.categoria} onValueChange={v => setFormData({ ...formData, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{formatCategoria(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unidade</Label>
                <Select value={formData.unidade} onValueChange={v => setFormData({ ...formData, unidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => <SelectItem key={u} value={u}>{formatCategoria(u)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fabricante / Marca</Label>
                <Input value={formData.fabricante || ''} onChange={e => setFormData({ ...formData, fabricante: e.target.value })} placeholder="Ex: Medley, 3M..." />
              </div>
            </div>
            {isMedicamento && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Pill className="h-4 w-4" /> Dados do Medicamento</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label className="text-xs">Princípio Ativo</Label>
                      <Input value={formData.principio_ativo || ''} onChange={e => setFormData({ ...formData, principio_ativo: e.target.value })} placeholder="Ex: Paracetamol" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Dosagem / Concentração</Label>
                      <Input value={formData.dosagem || ''} onChange={e => setFormData({ ...formData, dosagem: e.target.value })} placeholder="Ex: 500mg, 10mg/ml" /></div>
                  </div>
                </div>
              </>
            )}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" /> Controle de Estoque</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">{selectedId ? 'Quantidade atual' : 'Saldo inicial'}</Label>
                  <Input type="number" min="0" step="1" value={formData.quantidade} disabled={!!selectedId} onChange={e => setFormData({ ...formData, quantidade: e.target.value === '' ? 0 : Number(e.target.value) })} />
                  {selectedId && <p className="text-[11px] text-muted-foreground">Use Entrada ou Saída para alterar o saldo e manter o histórico.</p>}
                  {!selectedId && <p className="text-[11px] text-muted-foreground">O saldo de abertura será registrado no histórico como entrada.</p>}
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Mínimo</Label>
                  <Input type="number" min="0" step="1" value={formData.quantidade_minima} onChange={e => setFormData({ ...formData, quantidade_minima: e.target.value === '' ? 0 : Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Ponto de Pedido</Label>
                  <Input type="number" min="1" step="1" value={formData.ponto_pedido ?? ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, ponto_pedido: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Máximo</Label>
                  <Input type="number" min="1" step="1" value={formData.quantidade_maxima ?? ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, quantidade_maxima: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Valor Custo (R$)</Label>
                <Input type="text" inputMode="decimal" placeholder="0,00" value={formData.valor_unitario} onChange={e => setFormData({ ...formData, valor_unitario: e.target.value })} />
                {custoInvalido && <p className="text-xs text-destructive" role="alert">Informe um custo entre R$ 0,00 e R$ 99.999.999,99, com até duas casas decimais.</p>}</div>
              <div className="space-y-1.5"><Label className="text-xs">Valor Venda (R$)</Label>
                <Input type="text" inputMode="decimal" value={formData.valor_venda || ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, valor_venda: e.target.value })} />
                {vendaInvalida && <p className="text-xs text-destructive" role="alert">Informe um preço entre R$ 0,00 e R$ 99.999.999,99, com até duas casas decimais.</p>}</div>
              <div className="space-y-1.5"><Label className="text-xs">Fornecedor</Label>
                <Input value={formData.fornecedor || ''} onChange={e => setFormData({ ...formData, fornecedor: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Localização</Label>
                <Input value={formData.localizacao} onChange={e => setFormData({ ...formData, localizacao: e.target.value })} placeholder="Prateleira A1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Lote</Label>
                <Input value={formData.lote || ''} onChange={e => setFormData({ ...formData, lote: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Validade</Label>
                <Input type="date" value={formData.validade || ''} onChange={e => setFormData({ ...formData, validade: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Descrição / Observações</Label>
              <Textarea value={formData.descricao || ''} onChange={e => setFormData({ ...formData, descricao: e.target.value })} rows={2} placeholder="Informações adicionais..." /></div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movimentação Dialog */}
      <Dialog open={isMovimentacaoOpen} onOpenChange={open => {
        if (open || !saveLock.current) setIsMovimentacaoOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{movimentacao.tipo === 'entrada' ? 'Entrada de Estoque' : 'Saída de Estoque'}</DialogTitle>
            {produtoSelecionado && <p className="text-sm text-muted-foreground">{produtoSelecionado.nome}</p>}
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="estoque-movimentacao-quantidade">Quantidade * ({produtoSelecionado?.unidade || 'unidade'})</Label>
              <Input id="estoque-movimentacao-quantidade" type="number" min="1" step="1" value={movimentacao.quantidade || ''} onChange={e => setMovimentacao({ ...movimentacao, quantidade: e.target.value === '' ? 0 : Number(e.target.value) })} />
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
                value={movimentacao.motivo}
                onChange={e => setMovimentacao({ ...movimentacao, motivo: e.target.value })}
                placeholder={movimentacao.tipo === 'entrada' ? 'Ex.: compra, devolução ou nota fiscal' : 'Ex.: uso, perda ou ajuste'}
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground">O motivo ficará registrado no histórico deste produto.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMovimentacaoOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSaveMovimentacao} disabled={isSaving || !quantidadeMovimentacaoValida || saidaExcedeSaldo || entradaExcedeMaximo || !movimentacao.motivo.trim()}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    </div>
  );
}
