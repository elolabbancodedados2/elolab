import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Plus, Search, Edit, Package, AlertTriangle, ArrowDown, ArrowUp, Loader2,
  Barcode, Calendar, Clock, Pill, Building2, ShieldAlert, TrendingDown,
  History, BarChart3, X, Trash2, FileDown, Bell,
} from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useEstoque } from '@/hooks/useSupabaseData';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { CardGridSkeleton, TableSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyEstoque } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

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
  valor_unitario: number;
  valor_venda?: number;
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
  quantidade: 0, quantidade_minima: 10, valor_unitario: 0, localizacao: '',
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
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [movimentacao, setMovimentacao] = useState<{ tipo: 'entrada' | 'saida'; quantidade: number; motivo: string }>({
    tipo: 'entrada', quantidade: 0, motivo: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data: estoque = [], isLoading } = useEstoque();

  // Movement timeline query
  const { data: movimentacoes = [] } = useQuery({
    queryKey: ['movimentacoes-timeline', timelineItemId],
    enabled: !!timelineItemId,
    queryFn: async () => {
      const { data } = await supabase
        .from('movimentacoes_estoque')
        .select('*')
        .eq('item_id', timelineItemId || '')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const getValidadeInfo = (validade: string | null) => {
    if (!validade) return null;
    const dias = differenceInDays(new Date(validade), new Date());
    if (dias < 0) return { label: 'Vencido', color: 'destructive' as const, dias };
    if (dias <= 30) return { label: `${dias}d`, color: 'destructive' as const, dias };
    if (dias <= 60) return { label: `${dias}d`, color: 'secondary' as const, dias };
    return null;
  };

  const filteredProdutos = useMemo(() => {
    return (estoque as any[]).filter(p => {
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || p.nome.toLowerCase().includes(q) ||
        (p.codigo_ean || '').toLowerCase().includes(q) ||
        (p.principio_ativo || '').toLowerCase().includes(q) ||
        (p.fabricante || '').toLowerCase().includes(q);
      const matchCategoria = filterCategoria === 'todos' || p.categoria === filterCategoria;
      if (filterAlerta === 'critico') return matchSearch && matchCategoria && p.quantidade < (p.quantidade_minima || 0);
      if (filterAlerta === 'validade') {
        const info = getValidadeInfo(p.validade);
        return matchSearch && matchCategoria && info !== null;
      }
      if (filterAlerta === 'ponto_pedido') return matchSearch && matchCategoria && p.ponto_pedido && p.quantidade <= p.ponto_pedido;
      return matchSearch && matchCategoria;
    });
  }, [estoque, searchTerm, filterCategoria, filterAlerta]);

  const getStatus = (produto: any) => {
    if (produto.quantidade <= 0) return { label: 'Sem estoque', variant: 'destructive' as const };
    if (produto.quantidade < (produto.quantidade_minima || 0)) return { label: 'Crítico', variant: 'destructive' as const };
    if (produto.ponto_pedido && produto.quantidade <= produto.ponto_pedido) return { label: 'Pedir', variant: 'secondary' as const };
    if (produto.quantidade <= (produto.quantidade_minima || 0) * 1.5) return { label: 'Baixo', variant: 'secondary' as const };
    return { label: 'OK', variant: 'outline' as const };
  };

  const stats = useMemo(() => {
    const items = estoque as any[];
    return {
      total: items.length,
      critico: items.filter(p => p.quantidade < (p.quantidade_minima || 0)).length,
      valorTotal: items.reduce((acc, p) => acc + (p.quantidade * (p.valor_unitario || 0)), 0),
      vencendo: items.filter(p => { const i = getValidadeInfo(p.validade); return i && i.dias >= 0 && i.dias <= 60; }).length,
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

  const handleNew = () => { setSelectedId(null); setFormData(initialForm); setIsFormOpen(true); };

  const handleEdit = (p: any) => {
    setSelectedId(p.id);
    setFormData({
      id: p.id, nome: p.nome, categoria: p.categoria, unidade: p.unidade || 'unidade',
      quantidade: p.quantidade, quantidade_minima: p.quantidade_minima || 10,
      quantidade_maxima: p.quantidade_maxima || undefined, ponto_pedido: p.ponto_pedido || undefined,
      valor_unitario: p.valor_unitario || 0, valor_venda: p.valor_venda || undefined,
      localizacao: p.localizacao || '', lote: p.lote || undefined, validade: p.validade || undefined,
      fornecedor: p.fornecedor || undefined, descricao: p.descricao || undefined,
      codigo_ean: p.codigo_ean || undefined, fabricante: p.fabricante || undefined,
      principio_ativo: p.principio_ativo || undefined, dosagem: p.dosagem || undefined,
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome) { toast.error('Nome é obrigatório.'); return; }
    setIsSaving(true);
    try {
      const payload = {
        nome: formData.nome, categoria: formData.categoria, unidade: formData.unidade,
        quantidade: formData.quantidade, quantidade_minima: formData.quantidade_minima,
        quantidade_maxima: formData.quantidade_maxima || null, ponto_pedido: formData.ponto_pedido || null,
        valor_unitario: formData.valor_unitario, valor_venda: formData.valor_venda || null,
        localizacao: formData.localizacao || null, lote: formData.lote || null,
        validade: formData.validade || null, fornecedor: formData.fornecedor || null,
        descricao: formData.descricao || null, codigo_ean: formData.codigo_ean || null,
        fabricante: formData.fabricante || null, principio_ativo: formData.principio_ativo || null,
        dosagem: formData.dosagem || null,
      };

      if (selectedId) {
        const { error } = await supabase.from('estoque').update(payload).eq('id', selectedId);
        if (error) throw error;
        toast.success('Produto atualizado!');
      } else {
        const { error } = await supabase.from('estoque').insert(payload);
        if (error) throw error;
        toast.success('Produto cadastrado!');
      }
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
      setIsFormOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar.');
    } finally { setIsSaving(false); }
  };

  const handleMovimentacao = (produto: any, tipo: 'entrada' | 'saida') => {
    setSelectedId(produto.id);
    setMovimentacao({ tipo, quantidade: 0, motivo: '' });
    setIsMovimentacaoOpen(true);
  };

  const handleSaveMovimentacao = async () => {
    if (!movimentacao.quantidade || movimentacao.quantidade <= 0) { toast.error('Quantidade inválida.'); return; }
    const produto = (estoque as any[]).find(p => p.id === selectedId);
    if (!produto) return;
    const novaQtd = movimentacao.tipo === 'entrada' ? produto.quantidade + movimentacao.quantidade : produto.quantidade - movimentacao.quantidade;
    if (novaQtd < 0) { toast.error('Estoque insuficiente.'); return; }
    if (produto.quantidade_maxima && novaQtd > produto.quantidade_maxima) {
      toast.error(`Estoque máximo (${produto.quantidade_maxima}) seria ultrapassado.`); return;
    }
    setIsSaving(true);
    try {
      // Insert movement record first (least destructive if partial failure)
      const { error: e2 } = await supabase.from('movimentacoes_estoque').insert({
        item_id: selectedId || '', tipo: movimentacao.tipo,
        quantidade: movimentacao.quantidade, motivo: movimentacao.motivo || null,
      });
      if (e2) throw e2;

      // Re-fetch current quantity to avoid race conditions
      const { data: current, error: fetchErr } = await supabase.from('estoque').select('quantidade').eq('id', selectedId).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!current) throw new Error('Produto não encontrado.');
      const qtdAtual = current.quantidade;
      const novaQtdFinal = movimentacao.tipo === 'entrada' ? qtdAtual + movimentacao.quantidade : qtdAtual - movimentacao.quantidade;
      if (novaQtdFinal < 0) {
        toast.error('Estoque insuficiente (quantidade alterada por outro usuário).');
        // Rollback movement - best effort
        await supabase.from('movimentacoes_estoque').delete().eq('item_id', selectedId).eq('quantidade', movimentacao.quantidade).order('created_at', { ascending: false }).limit(1);
        return;
      }

      const { error: e1 } = await supabase.from('estoque').update({ quantidade: novaQtdFinal }).eq('id', selectedId);
      if (e1) throw e1;
      toast.success(`${movimentacao.tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada!`);
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
      setIsMovimentacaoOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao registrar.');
    } finally { setIsSaving(false); }
  };

  const handleOpenTimeline = (produto: any) => {
    setTimelineItemId(produto.id);
    setIsTimelineOpen(true);
  };

  const handleDeleteProduto = async () => {
    if (!deleteId) return;
    setIsSaving(true);
    try {
      // Delete movements first
      await supabase.from('movimentacoes_estoque').delete().eq('item_id', deleteId);
      const { data, error } = await supabase.from('estoque').delete().eq('id', deleteId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Sem permissão para excluir ou produto já removido.');
        return;
      }
      toast.success('Produto excluído!');
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
      setIsDeleteOpen(false);
      setDeleteId(null);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir.');
    } finally { setIsSaving(false); }
  };

  // Expiry alert items
  const expiryAlerts = useMemo(() => {
    return (estoque as any[]).filter(p => {
      if (!p.validade) return false;
      const dias = differenceInDays(new Date(p.validade), new Date());
      return dias <= 60;
    }).sort((a, b) => {
      const dA = differenceInDays(new Date(a.validade), new Date());
      const dB = differenceInDays(new Date(b.validade), new Date());
      return dA - dB;
    });
  }, [estoque]);

  const isMedicamento = formData.categoria === 'medicamentos';
  const timelineItem = (estoque as any[]).find(p => p.id === timelineItemId);

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
                      const dias = differenceInDays(new Date(p.validade), new Date());
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
          <div className="grid grid-cols-3 gap-4">
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
                      <Input placeholder="Nome, EAN, princípio ativo..." value={searchTerm}
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
                        <SelectItem value="validade">Vencendo</SelectItem>
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
                            <p>Nenhum produto encontrado</p>
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
                                    <p>{format(new Date(produto.validade), 'dd/MM/yyyy')}</p>
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
                                  <Button variant="ghost" size="icon" onClick={() => handleOpenTimeline(produto)} title="Histórico">
                                    <History className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleMovimentacao(produto, 'entrada')} title="Entrada">
                                    <ArrowDown className="h-4 w-4 text-primary" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleMovimentacao(produto, 'saida')} title="Saída">
                                    <ArrowUp className="h-4 w-4 text-destructive" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(produto)}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => { setDeleteId(produto.id); setIsDeleteOpen(true); }}>
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
            {movimentacoes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-10 w-10 mx-auto opacity-20 mb-2" />
                <p className="text-sm">Nenhuma movimentação registrada</p>
              </div>
            ) : (
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
                          {mov.created_at ? format(new Date(mov.created_at), "dd/MM/yy HH:mm", { locale: ptBR }) : ''}
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
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Form Dialog (Enhanced) ── */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
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
                <div className="space-y-1.5"><Label className="text-xs">Quantidade Atual</Label>
                  <Input type="number" value={formData.quantidade} onChange={e => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 0 })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Mínimo</Label>
                  <Input type="number" value={formData.quantidade_minima} onChange={e => setFormData({ ...formData, quantidade_minima: parseInt(e.target.value) || 0 })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Ponto de Pedido</Label>
                  <Input type="number" value={formData.ponto_pedido || ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, ponto_pedido: parseInt(e.target.value) || undefined })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Máximo</Label>
                  <Input type="number" value={formData.quantidade_maxima || ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, quantidade_maxima: parseInt(e.target.value) || undefined })} /></div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5"><Label className="text-xs">Valor Custo (R$)</Label>
                <Input type="number" step="0.01" value={formData.valor_unitario} onChange={e => setFormData({ ...formData, valor_unitario: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Valor Venda (R$)</Label>
                <Input type="number" step="0.01" value={formData.valor_venda || ''} placeholder="Opcional" onChange={e => setFormData({ ...formData, valor_venda: parseFloat(e.target.value) || undefined })} /></div>
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
      <Dialog open={isMovimentacaoOpen} onOpenChange={setIsMovimentacaoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{movimentacao.tipo === 'entrada' ? 'Entrada de Estoque' : 'Saída de Estoque'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Quantidade *</Label>
              <Input type="number" min="1" value={movimentacao.quantidade || ''} onChange={e => setMovimentacao({ ...movimentacao, quantidade: parseInt(e.target.value) || 0 })} /></div>
            <div className="space-y-2"><Label>Motivo</Label>
              <Input value={movimentacao.motivo} onChange={e => setMovimentacao({ ...movimentacao, motivo: e.target.value })} placeholder="Motivo da movimentação" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMovimentacaoOpen(false)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSaveMovimentacao} disabled={isSaving}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Confirm */}
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Excluir Produto"
        description="Tem certeza que deseja excluir este produto e todo seu histórico de movimentações? Esta ação não pode ser desfeita."
        onConfirm={handleDeleteProduto}
        isLoading={isSaving}
      />
    </div>
  );
}
