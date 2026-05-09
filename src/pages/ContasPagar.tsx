import { useState, useMemo } from 'react';
import {
  Plus, Search, Check, DollarSign, AlertCircle, Calendar, FileText,
  Repeat, Building2, Loader2, Paperclip,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
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

type StatusPagamento = Database['public']['Enums']['status_pagamento'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pendente: { label: 'Pendente', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  pago: { label: 'Pago', color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  atrasado: { label: 'Atrasado', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
  cancelado: { label: 'Cancelado', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
  estornado: { label: 'Estornado', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', pago: 'Pago', atrasado: 'Atrasado',
  cancelado: 'Cancelado', estornado: 'Estornado',
};

const CATEGORIAS = ['fornecedores', 'folha_pagamento', 'impostos', 'aluguel', 'servicos', 'equipamentos', 'marketing', 'outros'];
const CATEGORIAS_LABELS: Record<string, string> = {
  fornecedores: 'Fornecedores', folha_pagamento: 'Folha de Pagamento',
  impostos: 'Impostos', aluguel: 'Aluguel', servicos: 'Serviços',
  equipamentos: 'Equipamentos', marketing: 'Marketing', outros: 'Outros',
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
  marcar_pago: boolean;
}

const initialFormData: FormData = {
  categoria: 'fornecedores', descricao: '', valor: 0,
  data_vencimento: format(new Date(), 'yyyy-MM-dd'),
  forma_pagamento: 'pix', fornecedor: '', numero_documento: '',
  data_emissao: format(new Date(), 'yyyy-MM-dd'),
  competencia: format(new Date(), 'yyyy-MM'),
  recorrente: false, frequencia_recorrencia: 'mensal',
  centro_custo: 'geral', observacoes: '', marcar_pago: false,
};

export default function ContasPagar() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPagamentoOpen, setIsPagamentoOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [pagamentoData, setPagamentoData] = useState({ forma_pagamento: 'pix', observacoes: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const { data: contas = [], isLoading } = useQuery({
    queryKey: ['lancamentos', 'despesa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('tipo', 'despesa')
        .order('data_vencimento', { ascending: true });
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

  const filteredContas = useMemo(() =>
    contas.filter(c => {
      const term = searchTerm.toLowerCase();
      const matchSearch = c.descricao.toLowerCase().includes(term) ||
        ((c as any).fornecedor || '').toLowerCase().includes(term) ||
        ((c as any).numero_documento || '').toLowerCase().includes(term);
      const matchStatus = filterStatus === 'todos' || c.status === filterStatus;
      return matchSearch && matchStatus;
    }), [contas, searchTerm, filterStatus]);

  const stats = useMemo(() => ({
    total: contas.filter(c => c.status !== 'cancelado').reduce((acc, c) => acc + c.valor, 0),
    pendente: contas.filter(c => c.status === 'pendente').reduce((acc, c) => acc + c.valor, 0),
    atrasado: contas.filter(c => c.status === 'atrasado').reduce((acc, c) => acc + c.valor, 0),
    pago: contas.filter(c => c.status === 'pago').reduce((acc, c) => acc + c.valor, 0),
  }), [contas]);

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const handleNew = () => { setSelectedId(null); setFormData(initialFormData); setIsFormOpen(true); };

  const handleSave = async () => {
    if (!formData.descricao || !formData.valor) { toast.error('Preencha descrição e valor.'); return; }
    if (formData.valor <= 0) { toast.error('O valor deve ser maior que zero.'); return; }
    if (formData.data_vencimento && formData.data_vencimento < new Date().toISOString().split('T')[0] && !selectedId) {
      toast.error('A data de vencimento não pode ser no passado.'); return;
    }
    setIsSubmitting(true);
    try {
      const payload: any = {
        tipo: 'despesa',
        categoria: formData.categoria,
        descricao: formData.descricao,
        valor: formData.valor,
        data: new Date().toISOString().split('T')[0],
        data_vencimento: formData.data_vencimento,
        status: formData.marcar_pago ? 'pago' as StatusPagamento : 'pendente' as StatusPagamento,
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
      setIsFormOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar');
    } finally { setIsSubmitting(false); }
  };

  const handlePagamento = (id: string) => {
    setSelectedId(id);
    setPagamentoData({ forma_pagamento: 'pix', observacoes: '' });
    setIsPagamentoOpen(true);
  };

  const handleConfirmarPagamento = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    try {
      const now = new Date();
      const { error } = await supabase
        .from('lancamentos')
        .update({
          status: 'pago' as StatusPagamento,
          forma_pagamento: pagamentoData.forma_pagamento,
          observacoes: [
            contas.find(c => c.id === selectedId)?.observacoes,
            pagamentoData.observacoes,
            `Pago em ${format(now, "dd/MM/yyyy 'às' HH:mm")} por ${profile?.nome || 'Sistema'}`,
          ].filter(Boolean).join(' | ') || null,
        })
        .eq('id', selectedId);
      if (error) throw error;
      toast.success('Pagamento registrado!');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      setIsPagamentoOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao confirmar pagamento');
    } finally { setIsSubmitting(false); }
  };

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contas a Pagar</h1>
          <p className="text-muted-foreground">Despesas, fornecedores e controle de vencimentos</p>
        </div>
        <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />Nova Conta</Button>
      </div>

      {/* Overdue alert */}
      {contas.filter(c => c.status === 'atrasado').length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-sm text-destructive font-medium">
            {contas.filter(c => c.status === 'atrasado').length} conta(s) vencida(s) — Total: {formatCurrency(stats.atrasado)}
          </span>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => setFilterStatus('atrasado')}>
            Ver vencidas
          </Button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
          { label: 'Pendente', value: stats.pendente, icon: Calendar, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
          { label: 'Atrasado', value: stats.atrasado, icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
          { label: 'Pago', value: stats.pago, icon: Check, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
        ].map((s) => (
          <Card key={s.label} className={cn('border', s.border)}>
            <CardContent className="py-4 px-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{s.label}</p>
                  <p className={cn('text-xl font-black mt-0.5 tabular-nums', s.color)}>{formatCurrency(s.value)}</p>
                </div>
                <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', s.bg)}>
                  <s.icon className={cn('h-5 w-5', s.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle>Contas ({filteredContas.length})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar descrição, fornecedor, NF..." value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
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
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                          <DollarSign className="h-7 w-7 text-primary" />
                        </div>
                        <p className="font-semibold text-foreground">Nenhuma conta encontrada</p>
                        <p className="text-sm text-muted-foreground mt-1">Cadastre uma nova conta a pagar</p>
                        <Button className="mt-3 gap-2" size="sm" onClick={handleNew}>
                          <Plus className="h-4 w-4" /> Nova Conta
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContas.map((conta: any) => (
                    <TableRow key={conta.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{conta.descricao}</p>
                          {conta.numero_documento && (
                            <p className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                              <FileText className="h-3 w-3" /> NF: {conta.numero_documento}
                            </p>
                          )}
                          {conta.recorrente && (
                            <Badge variant="outline" className="text-[9px] gap-0.5 mt-0.5">
                              <Repeat className="h-2.5 w-2.5" /> Recorrente
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm">{conta.fornecedor || '—'}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {CATEGORIAS_LABELS[conta.categoria] || conta.categoria}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell tabular-nums">
                        {conta.data_vencimento && format(new Date(conta.data_vencimento), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">{formatCurrency(conta.valor)}</TableCell>
                      <TableCell>
                      <Badge className={cn(STATUS_CONFIG[conta.status || 'pendente']?.bg, STATUS_CONFIG[conta.status || 'pendente']?.color, 'border-0')}>
                          {STATUS_LABELS[conta.status || 'pendente']}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {(conta.status === 'pendente' || conta.status === 'atrasado') && (
                          <Button variant="ghost" size="sm" onClick={() => handlePagamento(conta.id)}>
                            <Check className="h-4 w-4 mr-1" /> Pagar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Enhanced Form Dialog ── */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Nova Conta a Pagar
            </DialogTitle>
            <DialogDescription>Cadastre uma nova despesa ou conta a pagar.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-5 pr-2">
            {/* Dados principais */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria *</Label>
                <Select value={formData.categoria} onValueChange={v => setFormData({ ...formData, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{CATEGORIAS_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fornecedor / Favorecido</Label>
                <Input value={formData.fornecedor} onChange={e => setFormData({ ...formData, fornecedor: e.target.value })}
                  placeholder="Ex: Laboratório X" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Textarea value={formData.descricao} onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Descrição da despesa..." rows={2} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$) *</Label>
                <Input type="number" step="0.01" value={formData.valor}
                  onChange={e => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nº Documento / NF</Label>
                <Input value={formData.numero_documento} onChange={e => setFormData({ ...formData, numero_documento: e.target.value })}
                  placeholder="Ex: NF-001234" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={formData.forma_pagamento} onValueChange={v => setFormData({ ...formData, forma_pagamento: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Label className="text-xs">Data de Emissão</Label>
                  <Input type="date" value={formData.data_emissao}
                    onChange={e => setFormData({ ...formData, data_emissao: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Vencimento *</Label>
                  <Input type="date" value={formData.data_vencimento}
                    onChange={e => setFormData({ ...formData, data_vencimento: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Competência (Mês/Ano)</Label>
                  <Input type="month" value={formData.competencia}
                    onChange={e => setFormData({ ...formData, competencia: e.target.value })} />
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
                <Switch checked={formData.recorrente}
                  onCheckedChange={checked => setFormData({ ...formData, recorrente: checked })} />
                <Label className="text-sm">Conta fixa / recorrente</Label>
              </div>
              {formData.recorrente && (
                <div className="w-48">
                  <Label className="text-xs">Frequência</Label>
                  <Select value={formData.frequencia_recorrencia}
                    onValueChange={v => setFormData({ ...formData, frequencia_recorrencia: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
              )}
            </div>

            {/* Centro de Custo */}
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> Organização
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Centro de Custo</Label>
                  <Select value={formData.centro_custo} onValueChange={v => setFormData({ ...formData, centro_custo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Label className="text-xs">Observações</Label>
              <Textarea value={formData.observacoes} onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Anotações internas..." rows={2} />
            </div>

            {/* Marcar como pago */}
            <Separator />
            <div className="flex items-center gap-2">
              <Switch checked={formData.marcar_pago}
                onCheckedChange={checked => setFormData({ ...formData, marcar_pago: checked })} />
              <Label className="text-sm">Marcar como já pago (pagamento retroativo)</Label>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={isPagamentoOpen} onOpenChange={setIsPagamentoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>Registre o pagamento desta conta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={pagamentoData.forma_pagamento}
                onValueChange={v => setPagamentoData({ ...pagamentoData, forma_pagamento: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={pagamentoData.observacoes}
                onChange={e => setPagamentoData({ ...pagamentoData, observacoes: e.target.value })}
                placeholder="Anotações sobre o pagamento..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPagamentoOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleConfirmarPagamento} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirmando...</> : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
