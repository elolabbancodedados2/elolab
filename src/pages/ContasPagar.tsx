import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { useState, useMemo, useRef } from 'react';
import {
  Plus, Search, Check, DollarSign, AlertCircle, Calendar, FileText,
  Repeat, Building2, Loader2,
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
import { isValidDateOnly, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { valorRealizado } from '@/lib/lancamentos';
import { ErrorState } from '@/components/ErrorState';

type StatusPagamento = Database['public']['Enums']['status_pagamento'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pendente: { label: 'Pendente', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  parcial: { label: 'Parcial', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
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

const saldoEmAberto = (conta: { valor: number | string; valor_pago?: number | string | null; desconto?: number | string | null; acrescimo?: number | string | null }) =>
  Math.max(0, Number(conta.valor || 0) - Number(conta.desconto || 0)
    + Number(conta.acrescimo || 0) - Number(conta.valor_pago || 0));

export default function ContasPagar() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPagamentoOpen, setIsPagamentoOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(novoFormDataDespesa);
  const [pagamentoData, setPagamentoData] = useState({ forma_pagamento: 'pix', observacoes: '', valor: '' });
  const [chavesPagamento, setChavesPagamento] = useState<Record<string, string>>({});
  const [pagamentoIncerto, setPagamentoIncerto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);

  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();

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
    enabled: !!user && !!profile?.clinica_id,
  });
  const contas = contasQuery.data ?? [];
  const contasAtingiramLimite = contas.length >= LIMITE_BUSCA_EM_BLOCOS;
  const contaPagamentoSelecionada = contas.find(conta => conta.id === selectedId);
  const saldoPagamentoSelecionado = contaPagamentoSelecionada ? saldoEmAberto(contaPagamentoSelecionada) : 0;

  const filteredContas = useMemo(() =>
    contas.filter(c => {
      const term = searchTerm.toLowerCase();
      const matchSearch = c.descricao.toLowerCase().includes(term) ||
        ((c as any).fornecedor || '').toLowerCase().includes(term) ||
        ((c as any).numero_documento || '').toLowerCase().includes(term);
      const matchStatus = filterStatus === 'todos' || (filterStatus === 'atrasado' ? c.vencida : c.status === filterStatus);
      return matchSearch && matchStatus;
    }), [contas, searchTerm, filterStatus]);

  const stats = useMemo(() => ({
    total: contas.filter(c => c.status !== 'cancelado' && c.status !== 'estornado').reduce((acc, c) => acc + c.valor, 0),
    pendente: contas.filter(c => ['pendente', 'parcial'].includes(c.status) && !c.vencida).reduce((acc, c) => acc + saldoEmAberto(c), 0),
    atrasado: contas.filter(c => c.vencida).reduce((acc, c) => acc + saldoEmAberto(c), 0),
    // Atraso é um rótulo operacional calculado; uma conta vencida pode continuar
    // tendo uma parte já recebida que deve permanecer no KPI de pagamentos.
    pago: contas.filter(c => ['pago', 'parcial'].includes(c.status) || Number(c.valor_pago || 0) > 0)
      .reduce((acc, c) => acc + valorRealizado(c), 0),
  }), [contas]);

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const handleNew = () => { setSelectedId(null); setFormData(novoFormDataDespesa()); setIsFormOpen(true); };

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
      setIsFormOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar');
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handlePagamento = (id: string) => {
    setPagamentoIncerto(false);
    setSelectedId(id);
    const conta = contas.find(item => item.id === id);
    setPagamentoData({
      forma_pagamento: conta?.forma_pagamento || 'pix',
      observacoes: '',
      valor: conta ? saldoEmAberto(conta).toFixed(2) : '',
    });
    setChavesPagamento(keys => ({ ...keys, [id]: keys[id] || crypto.randomUUID() }));
    setIsPagamentoOpen(true);
  };

  const handleConfirmarPagamento = async () => {
    if (submissionLock.current) return;
    if (!selectedId) return;
    submissionLock.current = true;
    setIsSubmitting(true);
    let chamadaRpcIniciada = false;
    let respostaServidorRecebida = false;
    try {
      const contaSelecionada = contas.find(c => c.id === selectedId);
      if (!contaSelecionada) throw new Error('Esta conta não está mais na lista. Atualize a tela antes de registrar o pagamento.');
      const saldo = Number(saldoEmAberto(contaSelecionada).toFixed(2));
      if (!Number.isFinite(saldo) || saldo <= 0) throw new Error('Esta conta não tem saldo pendente. Atualize a lista antes de continuar.');
      const valorPagamento = Number(pagamentoData.valor);
      if (!Number.isFinite(valorPagamento) || valorPagamento <= 0) throw new Error('Informe um valor de pagamento maior que zero.');
      if (Math.abs(valorPagamento * 100 - Math.round(valorPagamento * 100)) > 1e-7) throw new Error('Informe o pagamento com no máximo duas casas decimais.');
      if (valorPagamento > saldo) throw new Error('O valor do pagamento não pode ser maior que o saldo em aberto.');
      const formaPagamento = pagamentoData.forma_pagamento === 'cartao_credito' ? 'credito'
        : pagamentoData.forma_pagamento === 'cartao_debito' ? 'debito'
          : pagamentoData.forma_pagamento;
      chamadaRpcIniciada = true;
      const { data: resultado, error } = await supabase.rpc('registrar_pagamento', {
        p_lancamento_id: selectedId,
        p_pagamentos: [{ forma_pagamento: formaPagamento, valor: valorPagamento, parcelas: 1 }],
        p_desconto: Number(contaSelecionada.desconto || 0),
        p_acrescimo: Number(contaSelecionada.acrescimo || 0),
        p_chave_idempotencia: chavesPagamento[selectedId] || null,
        p_observacoes: pagamentoData.observacoes.trim() || null,
      });
      if (error) {
        const erroRpc = error as { status?: number; code?: string };
        const statusHttp = Number(erroRpc.status);
        respostaServidorRecebida = (statusHttp >= 400 && statusHttp < 500)
          || /^[0-9A-Z]{5}$/i.test(String(erroRpc.code || ''));
        throw error;
      }
      respostaServidorRecebida = true;
      if ((resultado as any)?.success === false) throw new Error((resultado as any)?.error || 'O pagamento não foi registrado.');
      if ((resultado as any)?.repetido) toast.info('Este pagamento já havia sido registrado. Nada foi pago novamente.');
      else if (contaSelecionada.recorrente && (resultado as any)?.status === 'pago') {
        toast.success('Pagamento registrado e próxima despesa programada.');
      } else toast.success('Pagamento registrado no caixa!');
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] });
      setIsPagamentoOpen(false);
      setPagamentoIncerto(false);
      setChavesPagamento(keys => {
        const next = { ...keys };
        delete next[selectedId];
        return next;
      });
    } catch (error: any) {
      const message = error.message || 'Erro ao confirmar pagamento';
      if (!chamadaRpcIniciada || respostaServidorRecebida) {
        setPagamentoIncerto(false);
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
        toast.error(message, message.toLowerCase().includes('caixa fechado')
          ? { description: 'Abra o caixa do dia e tente novamente.' }
          : undefined);
      } else {
        const chave = chavesPagamento[selectedId];
        const verificacao = chave && profile?.clinica_id
          ? await supabase.from('pagamentos').select('id')
              .eq('clinica_id', profile.clinica_id)
              .eq('lancamento_id', selectedId)
              .eq('chave_idempotencia', chave)
              .maybeSingle()
          : { data: null, error: new Error('Não foi possível confirmar a clínica ou a chave desta tentativa.') };

        if (!verificacao.error && verificacao.data) {
          setPagamentoIncerto(false);
          toast.info('O pagamento foi registrado antes da falha de conexão. Nenhum pagamento adicional foi criado.');
          queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
          queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
          queryClient.invalidateQueries({ queryKey: ['pagamentos-do-dia'] });
          setIsPagamentoOpen(false);
          setChavesPagamento(keys => {
            const next = { ...keys };
            delete next[selectedId];
            return next;
          });
        } else {
          setPagamentoIncerto(true);
          toast.warning('Não foi possível confirmar se o pagamento foi registrado.', {
            description: 'Os dados foram bloqueados. Clique em “Confirmar novamente” sem alterá-los; a mesma chave impede um pagamento duplicado.',
            duration: 10000,
          });
        }
      }
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  if (contasQuery.isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>;
  if (contasQuery.isError) return <ErrorState title="Não foi possível carregar contas a pagar" error={contasQuery.error} onRetry={() => void contasQuery.refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contas a Pagar</h1>
          <p className="text-muted-foreground">Despesas, fornecedores e controle de vencimentos</p>
        </div>
        <Button onClick={handleNew} className="gap-2"><Plus className="h-4 w-4" />Nova Conta</Button>
      </div>

      {contasAtingiramLimite && (
        <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          A leitura atingiu {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} contas. A lista e os indicadores podem estar incompletos; não use estes totais para fechamento.
        </div>
      )}

      {/* Overdue alert */}
      {contas.filter(c => c.vencida).length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-sm text-destructive font-medium">
            {contas.filter(c => c.vencida).length} conta(s) vencida(s) — Total: {formatCurrency(stats.atrasado)}
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
                        <p className="font-semibold text-foreground">
                          {contas.length === 0 ? 'Nenhuma conta cadastrada' : 'Nenhuma conta encontrada com estes filtros'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {contas.length === 0 ? 'Cadastre uma despesa para acompanhar seus vencimentos.' : 'Limpe a busca e o status para ver outras contas.'}
                        </p>
                        {contas.length === 0 ? (
                          <Button className="mt-3 gap-2" size="sm" onClick={handleNew}>
                            <Plus className="h-4 w-4" /> Nova Conta
                          </Button>
                        ) : (
                          <Button className="mt-3" size="sm" variant="outline" onClick={() => {
                            setSearchTerm('');
                            setFilterStatus('todos');
                          }}>
                            Limpar filtros
                          </Button>
                        )}
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
                              <Repeat className="h-2.5 w-2.5" /> Recorrente · {FREQUENCIAS_RECURRENCIA[conta.frequencia_recorrencia] || 'frequência não definida'}
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
                        {conta.data_vencimento && format(parseDateOnly(conta.data_vencimento)!, 'dd/MM/yyyy')}
                      </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {formatCurrency(conta.valor)}
                          {Number(conta.valor_pago || 0) > 0 && <p className="text-xs font-normal text-muted-foreground">Em aberto: {formatCurrency(saldoEmAberto(conta))}</p>}
                        </TableCell>
                      <TableCell>
                      <Badge className={cn(STATUS_CONFIG[conta.status || 'pendente']?.bg, STATUS_CONFIG[conta.status || 'pendente']?.color, 'border-0')}>
                          {conta.vencida && conta.statusOriginal === 'parcial'
                            ? 'Atrasado · parcial'
                            : STATUS_LABELS[conta.status || 'pendente']}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {['pendente', 'atrasado', 'parcial'].includes(conta.status) && (
                          <Button variant="ghost" size="sm" onClick={() => handlePagamento(conta.id)}>
                            <Check className="h-4 w-4 mr-1" /> {Number(conta.valor_pago || 0) > 0 ? 'Pagar saldo' : 'Pagar'}
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
      <Dialog open={isFormOpen} onOpenChange={open => { if (!isSubmitting) setIsFormOpen(open); }}>
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
                <Select value={formData.categoria} onValueChange={v => setFormData({ ...formData, categoria: v })} disabled={isSubmitting}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{CATEGORIAS_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fornecedor / Favorecido</Label>
                <Input value={formData.fornecedor} onChange={e => setFormData({ ...formData, fornecedor: e.target.value })}
                  placeholder="Ex: Laboratório X" disabled={isSubmitting} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descrição *</Label>
              <Textarea value={formData.descricao} onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Descrição da despesa..." rows={2} disabled={isSubmitting} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$) *</Label>
                <Input type="number" step="0.01" min="0.01" required value={formData.valor}
                  onChange={e => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })} disabled={isSubmitting} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nº Documento / NF</Label>
                <Input value={formData.numero_documento} onChange={e => setFormData({ ...formData, numero_documento: e.target.value })}
                  placeholder="Ex: NF-001234" className="font-mono" disabled={isSubmitting} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={formData.forma_pagamento} onValueChange={v => setFormData({ ...formData, forma_pagamento: v })} disabled={isSubmitting}>
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
                    onChange={e => setFormData({ ...formData, data_emissao: e.target.value })} disabled={isSubmitting} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Vencimento *</Label>
                  <Input type="date" required value={formData.data_vencimento}
                    onChange={e => setFormData({ ...formData, data_vencimento: e.target.value })} disabled={isSubmitting} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Competência (Mês/Ano)</Label>
                  <Input type="month" value={formData.competencia}
                    onChange={e => setFormData({ ...formData, competencia: e.target.value })} disabled={isSubmitting} />
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
                  onCheckedChange={checked => setFormData({ ...formData, recorrente: checked })} disabled={isSubmitting} />
                <Label className="text-sm">Marcar como despesa recorrente</Label>
              </div>
              {formData.recorrente && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Ao quitar esta conta, a próxima despesa será criada automaticamente com o vencimento na frequência escolhida.
                  </p>
                  <div className="w-48">
                    <Label className="text-xs">Frequência</Label>
                    <Select value={formData.frequencia_recorrencia}
                      onValueChange={v => setFormData({ ...formData, frequencia_recorrencia: v })} disabled={isSubmitting}>
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
                  <Select value={formData.centro_custo} onValueChange={v => setFormData({ ...formData, centro_custo: v })} disabled={isSubmitting}>
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
                placeholder="Anotações internas..." rows={2} disabled={isSubmitting} />
            </div>

            <Separator />
            <p className="text-xs text-muted-foreground">
              A conta será cadastrada como pendente. Depois, use <strong>Pagar</strong> para registrar o movimento no caixa aberto do dia.
            </p>
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
      <Dialog open={isPagamentoOpen} onOpenChange={open => { if (open || (!isSubmitting && !pagamentoIncerto)) setIsPagamentoOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>Registre o pagamento desta conta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Saldo a pagar</span>
                <strong className="tabular-nums">{formatCurrency(saldoPagamentoSelecionado)}</strong>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Você pode quitar o saldo ou registrar um pagamento parcial no caixa aberto de hoje.</p>
              {saldoPagamentoSelecionado <= 0 && (
                <p role="alert" className="mt-2 text-xs text-destructive">O saldo está zerado. Atualize as contas antes de continuar.</p>
              )}
            </div>
            {pagamentoIncerto && (
              <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground">
                O resultado ainda não foi confirmado. Os dados estão bloqueados; confirme novamente esta mesma tentativa para verificar sem duplicar o pagamento.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="valor-pagamento-conta">Valor deste pagamento (R$)</Label>
              <Input id="valor-pagamento-conta" type="number" min="0.01" step="0.01" max={saldoPagamentoSelecionado}
                value={pagamentoData.valor}
                onChange={e => setPagamentoData({ ...pagamentoData, valor: e.target.value })}
                disabled={isSubmitting || pagamentoIncerto || saldoPagamentoSelecionado <= 0} />
            </div>
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={pagamentoData.forma_pagamento}
                onValueChange={v => setPagamentoData({ ...pagamentoData, forma_pagamento: v })} disabled={isSubmitting || pagamentoIncerto}>
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
                placeholder="Anotações sobre o pagamento..." rows={2} disabled={isSubmitting || pagamentoIncerto} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPagamentoOpen(false)} disabled={isSubmitting || pagamentoIncerto}>Cancelar</Button>
            <Button onClick={handleConfirmarPagamento} disabled={isSubmitting || saldoPagamentoSelecionado <= 0}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirmando...</> : pagamentoIncerto ? 'Confirmar novamente' : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
