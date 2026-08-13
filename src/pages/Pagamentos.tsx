import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  CreditCard, DollarSign, Check, Search,
  FileText, Loader2, Banknote, Building2, Clock, AlertCircle,
  Printer, Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { printReceiptPdf, downloadReceiptPdf, ReceiptData } from '@/lib/pdfReceipt';
import { todayDateOnly, toDateOnly } from '@/lib/dateOnly';

const statusColors: Record<string, string> = {
  pendente: 'bg-warning/10 text-warning',
  aprovado: 'bg-success/10 text-success',
  pago: 'bg-success/10 text-success',
  rejeitado: 'bg-destructive/10 text-destructive',
  cancelado: 'bg-muted text-muted-foreground',
  reembolsado: 'bg-info/10 text-info',
  em_processo: 'bg-warning/10 text-warning',
  parcial: 'bg-warning/10 text-warning',
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', aprovado: 'Recebido', pago: 'Pago',
  rejeitado: 'Rejeitado', cancelado: 'Cancelado', reembolsado: 'Reembolsado',
  em_processo: 'Em Processo', parcial: 'Parcialmente Pago',
};

const FORMAS_PAGAMENTO = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Cartão Débito (Maquininha)' },
  { value: 'cartao_credito', label: 'Cartão Crédito (Maquininha)' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'convenio', label: 'Convênio' },
  { value: 'transferencia', label: 'Transferência Bancária' },
];

const CONTAS_DESTINO = [
  { value: 'caixa_interno', label: 'Caixa Interno' },
  { value: 'conta_principal', label: 'Conta Principal' },
  { value: 'conta_secundaria', label: 'Conta Secundária' },
];

export default function Pagamentos() {
  const queryClient = useQueryClient();
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [showBaixar, setShowBaixar] = useState(false);
  const [selectedCobranca, setSelectedCobranca] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');

  const { data: pagamentos, isLoading } = useQuery({
    queryKey: ['pagamentos_mercadopago'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagamentos_mercadopago' as any)
        .select('*, pacientes(nome)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: pacientes } = useQuery({
    queryKey: ['pacientes_select'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pacientes').select('id, nome').order('nome');
      if (error) throw error;
      return data;
    },
  });

  const filteredPagamentos = useMemo(() => {
    if (!pagamentos) return [];
    const term = searchTerm.toLowerCase();
    return pagamentos.filter((p: any) => {
      const matchSearch = (p.descricao || '').toLowerCase().includes(term) ||
        (p.pacientes?.nome || '').toLowerCase().includes(term);
      const matchStatus = filterStatus === 'todos' || p.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [pagamentos, searchTerm, filterStatus]);

  const totalRecebido = pagamentos?.filter((p: any) => p.status === 'aprovado' || p.status === 'pago')
    .reduce((acc: number, p: any) => acc + Number(p.valor_pago || p.valor), 0) || 0;
  const totalPendente = pagamentos?.filter((p: any) => p.status === 'pendente' || p.status === 'parcial')
    .reduce((acc: number, p: any) => acc + Number(p.valor), 0) || 0;
  const totalCobr = pagamentos?.length || 0;

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const buildReceiptData = (pagamento: any): ReceiptData => {
    const formaPagamento = FORMAS_PAGAMENTO.find(f => f.value === pagamento.metodo_pagamento)?.label || pagamento.metodo_pagamento || 'Não especificado';
    const dataHora = format(
      new Date(pagamento.data_recebimento || pagamento.created_at),
      "dd/MM/yyyy 'às' HH:mm",
      { locale: ptBR }
    );
    return {
      titulo: 'COMPROVANTE DE PAGAMENTO',
      dataHora,
      docId: pagamento.id.slice(0, 8).toUpperCase(),
      paciente: pagamento.pacientes?.nome || 'Paciente',
      descricao: pagamento.descricao || 'Serviço/Consulta',
      formaPagamento,
      valorOriginal: pagamento.valor,
      desconto: pagamento.desconto || 0,
      acrescimo: pagamento.acrescimo || 0,
      valorFinal: pagamento.valor,
    };
  };

  const handlePrintRecibo = (pagamento: any) => {
    try {
      const receiptData = buildReceiptData(pagamento);
      printReceiptPdf(receiptData);
    } catch (err: any) {
      toast.error('Erro ao imprimir recibo: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const handleDownloadRecibo = (pagamento: any) => {
    try {
      const receiptData = buildReceiptData(pagamento);
      downloadReceiptPdf(receiptData);
    } catch (err: any) {
      toast.error('Erro ao baixar recibo: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const handleBaixar = (cobranca: any) => {
    setSelectedCobranca(cobranca);
    setShowBaixar(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Pagamentos</h1>
          <p className="text-muted-foreground">Cobranças diretas, recebimentos e controle de caixa</p>
        </div>
        <Button onClick={() => setShowNewPayment(true)} className="gap-2">
          <Banknote className="h-4 w-4" /> Nova Cobrança
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Recebido', value: formatCurrency(totalRecebido), icon: DollarSign, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
          { label: 'Pendente', value: formatCurrency(totalPendente), icon: Clock, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
          { label: 'Total Cobranças', value: String(totalCobr), icon: Banknote, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
          { label: 'A Receber', value: String(pagamentos?.filter((p: any) => p.status === 'pendente').length || 0), icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
        ].map((s) => (
          <Card key={s.label} className={cn('border', s.border)}>
            <CardContent className="py-4 px-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{s.label}</p>
                  <p className={cn('text-xl font-black mt-0.5 tabular-nums', s.color)}>{s.value}</p>
                </div>
                <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', s.bg)}>
                  <s.icon className={cn('h-5 w-5', s.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle>Cobranças ({filteredPagamentos.length})</CardTitle>
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
                <Input placeholder="Buscar descrição ou paciente..." value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : !filteredPagamentos.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma cobrança encontrada</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredPagamentos.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{p.descricao}</p>
                      {p.numero_parcelas > 1 && (
                        <Badge variant="secondary" className="text-[9px]">
                          {p.parcela_atual || 1}/{p.numero_parcelas}x
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {p.pacientes?.nome || 'Sem paciente'}
                      {p.metodo_pagamento && ` • ${FORMAS_PAGAMENTO.find(f => f.value === p.metodo_pagamento)?.label || p.metodo_pagamento}`}
                      {p.conta_destino && ` • ${CONTAS_DESTINO.find(c => c.value === p.conta_destino)?.label || p.conta_destino}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.created_at ? format(new Date(p.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : ''}
                      {p.data_recebimento && ` • Recebido em ${format(new Date(p.data_recebimento), 'dd/MM/yyyy')}`}
                    </p>
                    {p.observacoes_caixa && (
                      <p className="text-xs text-muted-foreground italic">💬 {p.observacoes_caixa}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatCurrency(p.valor)}</p>
                      {(p.desconto > 0 || p.acrescimo > 0) && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {p.desconto > 0 && <span className="text-success">-{formatCurrency(p.desconto)}</span>}
                          {p.acrescimo > 0 && <span className="text-destructive"> +{formatCurrency(p.acrescimo)}</span>}
                        </p>
                      )}
                      <Badge className={cn(statusColors[p.status] || '')}>
                        {STATUS_LABELS[p.status] || p.status}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      {(p.status === 'pendente' || p.status === 'parcial') && (
                        <Button size="sm" variant="outline" onClick={() => handleBaixar(p)} title="Dar baixa">
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      {(p.status === 'aprovado' || p.status === 'pago') && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handlePrintRecibo(p)} title="Imprimir recibo" className="text-info hover:text-info/80">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownloadRecibo(p)} title="Baixar recibo" className="text-success hover:text-success/80">
                            <Download className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nova Cobrança Direta */}
      <Dialog open={showNewPayment} onOpenChange={setShowNewPayment}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col">
          <NewDirectBillingForm
            pacientes={pacientes || []}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['pagamentos_mercadopago'] });
              setShowNewPayment(false);
            }}
            onCancel={() => setShowNewPayment(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Dar Baixa Dialog */}
      <Dialog open={showBaixar} onOpenChange={setShowBaixar}>
        <DialogContent className="max-w-md">
          <BaixaForm
            cobranca={selectedCobranca}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['pagamentos_mercadopago'] });
              setShowBaixar(false);
            }}
            onCancel={() => setShowBaixar(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Nova Cobrança Direta ── */
function NewDirectBillingForm({ pacientes, onSuccess, onCancel }: { pacientes: any[]; onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    paciente_id: '', descricao: '', valor: '', metodo_pagamento: 'dinheiro',
    numero_parcelas: '1', intervalo_parcelas: '30', conta_destino: 'caixa_interno',
    desconto: '0', acrescimo: '0', observacoes_caixa: '', marcar_pago: false,
    data_recebimento: format(new Date(), 'yyyy-MM-dd'),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const valorFinal = (parseFloat(form.valor) || 0) - (parseFloat(form.desconto) || 0) + (parseFloat(form.acrescimo) || 0);
  const valorParcela = form.numero_parcelas ? valorFinal / parseInt(form.numero_parcelas) : valorFinal;

  const handleSave = async () => {
    if (!form.descricao || !form.valor || parseFloat(form.valor) <= 0) {
      toast.error('Preencha descrição e valor.'); return;
    }
    setIsSubmitting(true);
    try {
      const numParcelas = parseInt(form.numero_parcelas) || 1;
      const intervalo = parseInt(form.intervalo_parcelas) || 30;

      for (let i = 0; i < numParcelas; i++) {
        const vencimento = new Date();
        vencimento.setDate(vencimento.getDate() + (intervalo * i));

        const payload: any = {
          tipo: 'cobranca',
          descricao: numParcelas > 1 ? `${form.descricao} (${i + 1}/${numParcelas})` : form.descricao,
          valor: valorFinal / numParcelas,
          valor_pago: form.marcar_pago ? valorFinal / numParcelas : null,
          status: form.marcar_pago ? 'aprovado' : 'pendente',
          paciente_id: form.paciente_id || null,
          metodo_pagamento: form.metodo_pagamento,
          conta_destino: form.conta_destino,
          desconto: i === 0 ? parseFloat(form.desconto) || 0 : 0,
          acrescimo: i === 0 ? parseFloat(form.acrescimo) || 0 : 0,
          observacoes_caixa: form.observacoes_caixa || null,
          numero_parcelas: numParcelas,
          parcela_atual: i + 1,
          intervalo_parcelas: intervalo,
          cobranca_direta: true,
          data_vencimento: toDateOnly(vencimento),
          data_recebimento: form.marcar_pago ? form.data_recebimento : null,
          data_criacao: new Date().toISOString(),
        };

        const { error } = await supabase.from('pagamentos_mercadopago' as any).insert(payload);
        if (error) throw error;
      }

      toast.success(numParcelas > 1 ? `${numParcelas} parcelas geradas!` : 'Cobrança cadastrada!');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar');
    } finally { setIsSubmitting(false); }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" /> Nova Cobrança
        </DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto space-y-5 pr-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Paciente</Label>
            <Select value={form.paciente_id} onValueChange={v => setForm({ ...form, paciente_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {pacientes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Meio de Pagamento *</Label>
            <Select value={form.metodo_pagamento} onValueChange={v => setForm({ ...form, metodo_pagamento: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Descrição *</Label>
          <Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
            placeholder="Ex: Consulta médica, Procedimento..." />
        </div>

        {/* Valores */}
        <Separator />
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" /> Valores
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="number" step="0.01" value={form.valor}
                onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="150.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Desconto (R$)</Label>
              <Input type="number" step="0.01" value={form.desconto}
                onChange={e => setForm({ ...form, desconto: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Acréscimo / Juros (R$)</Label>
              <Input type="number" step="0.01" value={form.acrescimo}
                onChange={e => setForm({ ...form, acrescimo: e.target.value })} />
            </div>
          </div>
          {valorFinal > 0 && (
            <p className="text-sm mt-2 font-medium">
              Total final: <span className="text-primary tabular-nums">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorFinal)}</span>
            </p>
          )}
        </div>

        {/* Parcelamento */}
        <Separator />
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Parcelamento
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nº de Parcelas</Label>
              <Input type="number" min="1" max="48" value={form.numero_parcelas}
                onChange={e => setForm({ ...form, numero_parcelas: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalo (dias)</Label>
              <Input type="number" value={form.intervalo_parcelas}
                onChange={e => setForm({ ...form, intervalo_parcelas: e.target.value })} />
            </div>
          </div>
          {parseInt(form.numero_parcelas) > 1 && valorFinal > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {form.numero_parcelas}x de <span className="font-medium tabular-nums">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorParcela)}</span> a cada {form.intervalo_parcelas} dias
            </p>
          )}
        </div>

        {/* Conta Destino */}
        <Separator />
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <Building2 className="h-4 w-4" /> Destino e Observações
          </h4>
          <div className="space-y-1.5">
            <Label className="text-xs">Conta Bancária de Destino</Label>
            <Select value={form.conta_destino} onValueChange={v => setForm({ ...form, conta_destino: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTAS_DESTINO.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 mt-3">
            <Label className="text-xs">Observações do Caixa</Label>
            <Textarea value={form.observacoes_caixa} onChange={e => setForm({ ...form, observacoes_caixa: e.target.value })}
              placeholder="Ex: Paciente pagou R$100 em dinheiro e o resto no débito" rows={2} />
          </div>
        </div>

        {/* Marcar como pago */}
        <Separator />
        <div className="flex items-center gap-3">
          <Switch checked={form.marcar_pago} onCheckedChange={checked => setForm({ ...form, marcar_pago: checked })} />
          <Label className="text-sm">Já recebido (dar baixa agora)</Label>
        </div>
        {form.marcar_pago && (
          <div className="w-48">
            <Label className="text-xs">Data do Recebimento</Label>
            <Input type="date" value={form.data_recebimento}
              onChange={e => setForm({ ...form, data_recebimento: e.target.value })} />
          </div>
        )}
      </div>

      <DialogFooter className="flex-shrink-0 pt-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>
        <Button onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar Cobrança'}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── Dar Baixa (Confirmar Recebimento) ── */
function BaixaForm({ cobranca, onSuccess, onCancel }: { cobranca: any; onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    forma_pagamento: cobranca?.metodo_pagamento || 'pix',
    conta_destino: cobranca?.conta_destino || 'caixa_interno',
    data_recebimento: format(new Date(), 'yyyy-MM-dd'),
    observacoes_caixa: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirmar = async () => {
    if (!cobranca) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('pagamentos_mercadopago' as any)
        .update({
          status: 'aprovado',
          metodo_pagamento: form.forma_pagamento,
          conta_destino: form.conta_destino,
          data_recebimento: form.data_recebimento,
          data_aprovacao: new Date().toISOString(),
          valor_pago: cobranca.valor,
          observacoes_caixa: form.observacoes_caixa || cobranca.observacoes_caixa || null,
        })
        .eq('id', cobranca.id);
      if (error) throw error;
      toast.success('Pagamento confirmado!');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao dar baixa');
    } finally { setIsSubmitting(false); }
  };

  if (!cobranca) return null;

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Check className="h-5 w-5 text-primary" /> Confirmar Recebimento
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="font-medium">{cobranca.descricao}</p>
          <p className="text-lg font-bold text-primary tabular-nums">{formatCurrency(cobranca.valor)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Forma de Pagamento</Label>
            <Select value={form.forma_pagamento} onValueChange={v => setForm({ ...form, forma_pagamento: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Conta Destino</Label>
            <Select value={form.conta_destino} onValueChange={v => setForm({ ...form, conta_destino: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTAS_DESTINO.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Data do Recebimento</Label>
          <Input type="date" value={form.data_recebimento}
            onChange={e => setForm({ ...form, data_recebimento: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Observações</Label>
          <Textarea value={form.observacoes_caixa} onChange={e => setForm({ ...form, observacoes_caixa: e.target.value })}
            placeholder="Ex: Pagou metade em dinheiro, metade no débito" rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>
        <Button onClick={handleConfirmar} disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirmando...</> : 'Confirmar Recebimento'}
        </Button>
      </DialogFooter>
    </>
  );
}
