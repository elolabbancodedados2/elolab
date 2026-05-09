import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Check, DollarSign, AlertCircle, Receipt, Calendar, Download, Clock,
  TrendingUp, User, Loader2, Eye, FileText, Printer, MoreHorizontal, Filter,
  ArrowUpRight, Banknote, CreditCard, QrCode, Landmark, Building2, Stethoscope,
  FlaskConical, Repeat, Scissors, Pill, Baby, Heart, Bone, Brain,
} from 'lucide-react';
import { format, differenceInDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
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
import { usePacientes } from '@/hooks/useSupabaseData';
import { Database } from '@/integrations/supabase/types';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

type StatusPagamento = Database['public']['Enums']['status_pagamento'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  pendente: { label: 'Pendente', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', icon: Clock },
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
  valor: number;
  data_vencimento: string;
  forma_pagamento: string;
  centro_custo: string;
  numero_documento: string;
  competencia: string;
  observacoes: string;
}

interface BaixaData {
  forma_pagamento: string;
  data_recebimento: string;
  desconto: number;
  acrescimo: number;
  observacoes: string;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

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
  const [selectedConta, setSelectedConta] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>({
    paciente_id: '', categoria: 'consulta', descricao: '', valor: 0,
    data_vencimento: format(new Date(), 'yyyy-MM-dd'), forma_pagamento: 'pix',
    centro_custo: 'geral', numero_documento: '', competencia: format(new Date(), 'yyyy-MM'),
    observacoes: '',
  });
  const [baixaData, setBaixaData] = useState<BaixaData>({
    forma_pagamento: 'pix', data_recebimento: format(new Date(), 'yyyy-MM-dd'),
    desconto: 0, acrescimo: 0, observacoes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { data: pacientes = [], isLoading: loadingPacientes } = usePacientes();

  const { data: contas = [], isLoading: loadingContas } = useQuery({
    queryKey: ['lancamentos', 'receita'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('*, pacientes(nome)')
        .eq('tipo', 'receita')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const today = new Date().toISOString().split('T')[0];
      return data.map(conta => {
        if (conta.status === 'pendente' && conta.data_vencimento && conta.data_vencimento < today) {
          return { ...conta, status: 'atrasado' as StatusPagamento };
        }
        return conta;
      });
    },
    enabled: !!user,
  });

  const isLoading = loadingContas || loadingPacientes;

  // Period filter
  const periodoRange = useMemo(() => {
    const now = new Date();
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
        paciente?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.categoria?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'todos' || c.status === filterStatus;
      const matchCategoria = filterCategoria === 'todas' || c.categoria === filterCategoria;
      let matchPeriodo = true;
      if (periodoRange) {
        const d = new Date(c.data);
        matchPeriodo = d >= periodoRange.start && d <= periodoRange.end;
      }
      return matchSearch && matchStatus && matchCategoria && matchPeriodo;
    });
  }, [contas, searchTerm, filterStatus, filterCategoria, periodoRange]);

  const stats = useMemo(() => {
    const filtered = filteredContas;
    return {
      total: filtered.filter(c => c.status !== 'cancelado' && c.status !== 'estornado').reduce((a, c) => a + c.valor, 0),
      pendente: filtered.filter(c => c.status === 'pendente').reduce((a, c) => a + c.valor, 0),
      atrasado: filtered.filter(c => c.status === 'atrasado').reduce((a, c) => a + c.valor, 0),
      pago: filtered.filter(c => c.status === 'pago').reduce((a, c) => a + c.valor, 0),
      countPendente: filtered.filter(c => c.status === 'pendente').length,
      countAtrasado: filtered.filter(c => c.status === 'atrasado').length,
      countPago: filtered.filter(c => c.status === 'pago').length,
      countTotal: filtered.length,
    };
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
    filteredContas.filter(c => c.status === 'pago').forEach(c => {
      const fp = c.forma_pagamento || 'outros';
      map[fp] = (map[fp] || 0) + c.valor;
    });
    return Object.entries(map)
      .map(([key, value]) => ({
        name: FORMAS_PAGAMENTO.find(f => f.value === key)?.label || key,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredContas]);

  const getPacienteNome = (conta: any) => conta.pacientes?.nome || 'Particular';

  const handleNew = () => {
    setFormData({
      paciente_id: '', categoria: 'consulta', descricao: '', valor: 0,
      data_vencimento: format(new Date(), 'yyyy-MM-dd'), forma_pagamento: 'pix',
      centro_custo: 'geral', numero_documento: '', competencia: format(new Date(), 'yyyy-MM'),
      observacoes: '',
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.descricao || !formData.valor) {
      toast.error('Preencha a descrição e o valor.');
      return;
    }
    if (formData.valor <= 0) {
      toast.error('O valor deve ser maior que zero.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('lancamentos').insert({
        tipo: 'receita',
        categoria: formData.categoria,
        descricao: formData.descricao,
        valor: formData.valor,
        data: new Date().toISOString().split('T')[0],
        data_vencimento: formData.data_vencimento,
        status: 'pendente' as StatusPagamento,
        paciente_id: formData.paciente_id || null,
        forma_pagamento: formData.forma_pagamento || null,
        centro_custo: formData.centro_custo || null,
        numero_documento: formData.numero_documento || null,
        competencia: formData.competencia || null,
        observacoes: formData.observacoes || null,
        clinica_id: profile?.clinica_id || null,
      });
      if (error) throw error;
      toast.success('Receita cadastrada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      setIsFormOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally { setIsSubmitting(false); }
  };

  const handleDarBaixa = (conta: any) => {
    setSelectedConta(conta);
    setBaixaData({
      forma_pagamento: conta.forma_pagamento || 'pix',
      data_recebimento: format(new Date(), 'yyyy-MM-dd'),
      desconto: 0, acrescimo: 0, observacoes: '',
    });
    setIsPagamentoOpen(true);
  };

  const handleViewDetail = (conta: any) => {
    setSelectedConta(conta);
    setIsDetailOpen(true);
  };

  const valorFinal = useMemo(() => {
    if (!selectedConta) return 0;
    return selectedConta.valor - baixaData.desconto + baixaData.acrescimo;
  }, [selectedConta, baixaData.desconto, baixaData.acrescimo]);

  const handleConfirmarBaixa = async () => {
    if (!selectedConta) return;
    if (!baixaData.forma_pagamento) {
      toast.error('Selecione a forma de pagamento.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('lancamentos').update({
        status: 'pago' as StatusPagamento,
        forma_pagamento: baixaData.forma_pagamento,
        observacoes: [
          selectedConta.observacoes, baixaData.observacoes,
          baixaData.desconto > 0 ? `Desconto: R$ ${baixaData.desconto.toFixed(2)}` : null,
          baixaData.acrescimo > 0 ? `Acréscimo: R$ ${baixaData.acrescimo.toFixed(2)}` : null,
          `Recebido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
        ].filter(Boolean).join(' | ') || null,
      }).eq('id', selectedConta.id);
      if (error) throw error;
      toast.success(`Pagamento confirmado — ${getPacienteNome(selectedConta)}`);
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      setIsPagamentoOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao confirmar');
    } finally { setIsSubmitting(false); }
  };

  const handleEstornar = async (conta: any) => {
    try {
      const { error } = await supabase.from('lancamentos').update({
        status: 'estornado' as StatusPagamento,
      }).eq('id', conta.id);
      if (error) throw error;
      toast.success('Estorno realizado.');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    } catch (e: any) {
      toast.error(e.message || 'Erro');
    }
  };

  const handleCancelar = async (conta: any) => {
    try {
      const { error } = await supabase.from('lancamentos').update({
        status: 'cancelado' as StatusPagamento,
      }).eq('id', conta.id);
      if (error) throw error;
      toast.success('Conta cancelada.');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
    } catch (e: any) {
      toast.error(e.message || 'Erro');
    }
  };

  const exportarExcel = () => {
    const rows = filteredContas.map(c => ({
      Paciente: getPacienteNome(c),
      Descrição: c.descricao,
      Categoria: CATEGORIAS_MAP[c.categoria]?.label || c.categoria,
      Valor: c.valor,
      Vencimento: c.data_vencimento || '',
      Status: STATUS_CONFIG[c.status || 'pendente']?.label || c.status,
      'Forma Pgto': FORMAS_PAGAMENTO.find(f => f.value === c.forma_pagamento)?.label || c.forma_pagamento || '',
      'Centro Custo': c.centro_custo || '',
      Competência: c.competencia || '',
      'Nº Documento': c.numero_documento || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Receber');
    XLSX.writeFile(wb, `contas_receber_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Exportado com sucesso!');
  };

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-success" /> Contas a Receber
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Receitas detalhadas — {stats.countTotal} lançamento(s)
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Geral', value: stats.total, icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
          { label: 'Pendente', value: stats.pendente, icon: Clock, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', count: stats.countPendente },
          { label: 'Vencido', value: stats.atrasado, icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', count: stats.countAtrasado },
          { label: 'Recebido', value: stats.pago, icon: Check, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', count: stats.countPago },
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
          <SelectTrigger className="w-[150px] h-9 text-xs">
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
          <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
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
                  <p className="font-bold">Nenhuma conta encontrada</p>
                  <p className="text-sm text-muted-foreground mt-1">Ajuste os filtros ou crie uma nova receita.</p>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            filteredContas.map((conta, i) => {
              const status = STATUS_CONFIG[conta.status || 'pendente'];
              const catInfo = CATEGORIAS_MAP[conta.categoria] || CATEGORIAS_MAP.outros;
              const CatIcon = catInfo?.icon || DollarSign;
              const diasVenc = conta.data_vencimento ? differenceInDays(new Date(conta.data_vencimento), new Date()) : null;
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
                          <Badge className={cn('text-[10px]', status?.bg, status?.color, 'border-0')}>{status?.label}</Badge>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {(conta.status === 'pendente' || conta.status === 'atrasado') && (
                            <Button size="sm" onClick={() => handleDarBaixa(conta)}
                              className="gap-1 bg-success hover:bg-success/90 text-success-foreground font-bold text-xs px-3 shadow-lg shadow-success/20">
                              <Receipt className="h-3.5 w-3.5" /> Receber
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetail(conta)} className="gap-2">
                                <Eye className="h-4 w-4" /> Ver Detalhes
                              </DropdownMenuItem>
                              {conta.status === 'pago' && (
                                <DropdownMenuItem onClick={() => handleEstornar(conta)} className="gap-2 text-destructive">
                                  <Repeat className="h-4 w-4" /> Estornar
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
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Nova Receita
            </DialogTitle>
            <DialogDescription>Cadastre uma nova receita com todos os detalhes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label className="text-xs">Paciente (opcional)</Label>
              <Select value={formData.paciente_id || 'none'} onValueChange={v => setFormData({ ...formData, paciente_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {pacientes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
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
                <Input type="number" step="0.01" value={formData.valor || ''} onChange={e => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })} />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Salvar Receita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dar Baixa Dialog */}
      <Dialog open={isPagamentoOpen} onOpenChange={setIsPagamentoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <Receipt className="h-5 w-5" /> Confirmar Recebimento
            </DialogTitle>
            <DialogDescription>Registre o pagamento recebido.</DialogDescription>
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
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider">Forma de Pagamento *</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {FORMAS_PAGAMENTO.slice(0, 4).map(fp => {
                    const FPIcon = fp.icon;
                    const isSelected = baixaData.forma_pagamento === fp.value;
                    return (
                      <button key={fp.value} type="button"
                        onClick={() => setBaixaData({ ...baixaData, forma_pagamento: fp.value })}
                        className={cn(
                          'flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] transition-all',
                          isSelected ? 'border-success bg-success/10 text-success font-bold' : 'border-border hover:border-success/30'
                        )}>
                        <FPIcon className="h-4 w-4" />
                        {fp.label}
                      </button>
                    );
                  })}
                </div>
                <Select value={baixaData.forma_pagamento} onValueChange={v => setBaixaData({ ...baixaData, forma_pagamento: v })}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Data Recebimento</Label>
                  <Input type="date" value={baixaData.data_recebimento} onChange={e => setBaixaData({ ...baixaData, data_recebimento: e.target.value })} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Desconto (R$)</Label>
                  <Input type="number" step="0.01" min={0} value={baixaData.desconto || ''} onChange={e => setBaixaData({ ...baixaData, desconto: parseFloat(e.target.value) || 0 })} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Acréscimo (R$)</Label>
                  <Input type="number" step="0.01" min={0} value={baixaData.acrescimo || ''} onChange={e => setBaixaData({ ...baixaData, acrescimo: parseFloat(e.target.value) || 0 })} className="h-8 text-xs" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px]">Observações</Label>
                <Textarea value={baixaData.observacoes} onChange={e => setBaixaData({ ...baixaData, observacoes: e.target.value })} placeholder="Opcional..." rows={2} className="resize-none text-xs" />
              </div>

              <div className="rounded-xl bg-success/5 border border-success/20 p-4 flex justify-between items-center">
                <span className="text-sm font-bold uppercase tracking-wider text-success">Total a Receber</span>
                <span className="text-2xl font-black text-success tabular-nums">{fmt(valorFinal)}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsPagamentoOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleConfirmarBaixa} disabled={isSubmitting}
              className="gap-2 bg-success hover:bg-success/90 text-success-foreground font-bold shadow-lg shadow-success/25">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />} Confirmar
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
