import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Lock, Unlock, Plus, Minus, Loader2, Trash2, Search, Clock, Printer, Download, Pencil,
  TrendingUp, TrendingDown, Banknote, CreditCard, QrCode, Wallet, ArrowDownToLine,
  ArrowUpFromLine, FileText, History, DollarSign, Receipt, ChevronRight, CalendarDays,
  BarChart3, Eye, ShoppingBag, ShoppingCart, CheckCircle2, FlaskConical,
  User, X, FileSpreadsheet, Scale, RefreshCw, Undo2,
} from 'lucide-react';
import { printReceiptPdf, downloadReceiptPdf, type ReceiptData } from '@/lib/pdfReceipt';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { SectionFallback } from '@/components/ui/loading-skeleton';
import { PageHeader } from '@/components/PageHeader';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { diferencaEmReais, mesmoValor } from '@/lib/dinheiro';
import { calcularSaldoGaveta, calcularTotaisCaixa, validarResultadoRpcCaixa } from '@/lib/caixaDiario';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { ehMovimentoDoCaixa, origemExternaDoMovimento } from '@/lib/origemMovimentoCaixa';

type LancamentoTipo = 'receita' | 'despesa' | 'sangria' | 'suprimento';
type FormaPagamento = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'cartao_credito' | 'cartao_debito' | 'cheque' | 'transferencia';


interface Lancamento {
  id: string;
  tipo: LancamentoTipo;
  descricao: string;
  valor: number;
  forma_pagamento: FormaPagamento;
  categoria: string;
  data: string;
  created_at: string;
  paciente_id?: string | null;
  /** Join opcional para o comprovante ter o nome real no lugar de "Paciente". */
  pacientes?: { nome: string } | null;
  paciente_nome?: string | null;
  origem_pagamento?: boolean;
}

const SEM_LANCAMENTOS: Lancamento[] = [];

interface CaixaDiarioType {
  id: string;
  data: string;
  aberto: boolean;
  valor_abertura: number;
  valor_fechamento: number | null;
  operador_abertura: string | null;
  operador_fechamento: string | null;
  observacoes: string | null;
  clinica_id: string;
  created_at: string;
  updated_at: string;
}

interface CaixaDiarioEvento {
  id: string;
  tipo: 'abertura' | 'fechamento' | 'reabertura';
  valor_informado: number | null;
  valor_apurado: number | null;
  motivo: string | null;
  user_nome: string | null;
  fechamento_anterior_valor: number | null;
  fechamento_anterior_operador: string | null;
  fechamento_anterior_em: string | null;
  created_at: string;
}

const FORMA_ICONS: Record<string, typeof Banknote> = {
  dinheiro: Banknote,
  pix: QrCode,
  credito: CreditCard,
  cartao_credito: CreditCard,
  debito: Wallet,
  cartao_debito: Wallet,
  cheque: FileText,
  transferencia: ArrowUpFromLine,
};

const FORMA_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  credito: 'Crédito',
  cartao_credito: 'Crédito',
  debito: 'Débito',
  cartao_debito: 'Débito',
  cheque: 'Cheque',
  transferencia: 'Transferência',
};


const escapeHtml = (valor: unknown) => String(valor ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function abrirJanelaDeImpressao(titulo: string, corpoHtml: string) {
  const janela = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
  if (!janela) {
    toast.error('O navegador bloqueou a janela de impressão.', { description: 'Permita pop-ups para este site e tente novamente.' });
    return;
  }
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title>
<style>
  body{font-family:Inter,Arial,sans-serif;color:#111;margin:32px;font-size:13px}
  h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
  .muted{color:#666}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
  .box{border:1px solid #ddd;border-radius:8px;padding:8px 10px}.box b{display:block;font-size:16px;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
  th{font-size:11px;text-transform:uppercase;color:#666}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .neg{color:#b91c1c}.pos{color:#047857}.dif{font-size:18px;font-weight:700}
  .assin{margin-top:48px;display:flex;gap:48px}.assin div{flex:1;border-top:1px solid #111;padding-top:6px;text-align:center;font-size:12px}
  @media print{body{margin:16px}}
</style></head><body>${corpoHtml}<script>window.onload=function(){window.print();}</script></body></html>`);
  janela.document.close();
}

function baixarArquivo(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}


export default function CaixaDiario() {
  const { profile } = useSupabaseAuth();
  const roles = [...new Set([...(profile?.roles ?? []), ...(profile?.role ? [profile.role] : [])])];
  const queryClient = useQueryClient();
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as { cashTab?: unknown; cashSearchTerm?: unknown; cashTipoFiltro?: unknown } | null;
  const requestedCashTab = routeState?.cashTab === 'historico' ? 'historico' : 'hoje';
  const [activeTab, setActiveTab] = useState(requestedCashTab);
  const [searchTerm, setSearchTerm] = useState(typeof routeState?.cashSearchTerm === 'string' ? routeState.cashSearchTerm : '');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const initialTipoFiltro = ['todos', 'receita', 'despesa', 'sangria', 'suprimento'].includes(String(routeState?.cashTipoFiltro))
    ? routeState?.cashTipoFiltro as 'todos' | LancamentoTipo : 'todos';
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | LancamentoTipo>(initialTipoFiltro);

  // ─── Queries ────────────────────────────────────
  const { data: caixaHoje, isLoading: loadingCaixa, isError: erroCaixa, refetch: recarregarCaixa } = useQuery({
    queryKey: ['caixa-hoje', today, profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const { data, error } = await supabase
        .from('caixa_diario')
        .select('*')
        .eq('data', today)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (error) throw error;
      return data as CaixaDiarioType | null;
    },
    enabled: !!profile?.clinica_id,
    refetchInterval: 15_000,
  });

  const { data: caixasAbertosAntigos = [], isError: erroCaixasAbertosAntigos, refetch: recarregarCaixasAbertosAntigos } = useQuery({
    queryKey: ['caixas-abertos-antigos', profile?.clinica_id, today],
    queryFn: async (): Promise<CaixaDiarioType[]> => {
      if (!profile?.clinica_id) return [];
      const { data, error } = await supabase.from('caixa_diario').select('*')
        .eq('clinica_id', profile.clinica_id).eq('aberto', true).lt('data', today)
        .order('data', { ascending: false });
      if (error) throw error;
      return (data || []) as CaixaDiarioType[];
    },
    enabled: !!profile?.clinica_id,
    refetchInterval: 60_000,
  });

  const caixaEventosId = caixaHoje?.id;
  const { data: eventosCaixa = [], isLoading: loadingEventosCaixa, isError: erroEventosCaixa, refetch: recarregarEventosCaixa } = useQuery({
    queryKey: ['caixa-diario-eventos', caixaEventosId],
    queryFn: async (): Promise<CaixaDiarioEvento[]> => {
      if (!caixaEventosId) return [];
      const { data, error } = await supabase
        .from('caixa_diario_eventos')
        .select('id, tipo, valor_informado, valor_apurado, motivo, user_nome, fechamento_anterior_valor, fechamento_anterior_operador, fechamento_anterior_em, created_at')
        .eq('caixa_id', caixaEventosId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaixaDiarioEvento[];
    },
    enabled: !!caixaEventosId,
    refetchInterval: 30_000,
  });

  const { data: lancamentosData, isLoading: loadingLanc, isError: erroLancamentos, refetch: recarregarLancamentos } = useQuery({
    queryKey: ['lancamentos-caixa', caixaHoje?.data, profile?.clinica_id],
    queryFn: async (): Promise<{ movimentos: Lancamento[]; excedeuLimite: boolean }> => {
      if (!caixaHoje?.data || !profile?.clinica_id) return { movimentos: [], excedeuLimite: false };
      const rows = await buscarEmBlocos<Lancamento>(
        () => supabase.rpc('movimentos_caixa_diario', { p_data: caixaHoje.data })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
        { teto: LIMITE_BUSCA_EM_BLOCOS + 1 },
      );
      return {
        movimentos: rows.slice(0, LIMITE_BUSCA_EM_BLOCOS),
        excedeuLimite: rows.length > LIMITE_BUSCA_EM_BLOCOS,
      };
    },
    enabled: !!caixaHoje?.data && !!profile?.clinica_id,
    refetchInterval: 15_000,
  });
  const lancamentos = lancamentosData?.movimentos ?? SEM_LANCAMENTOS;
  // Vendas do PDV (sem linha em pagamentos) só podem ser desfeitas pelo estorno próprio.
  const idsReceitaCaixa = lancamentos.filter(l => l.tipo === 'receita' && l.categoria === 'receita_caixa').map(l => l.id);
  const { data: vendasPdv } = useQuery({
    queryKey: ['vendas-pdv-caixa', profile?.clinica_id, idsReceitaCaixa],
    enabled: idsReceitaCaixa.length > 0,
    staleTime: 15_000,
    meta: { suppressGlobalErrorToast: true },
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('vendas_pdv_do_caixa', { p_lancamento_ids: idsReceitaCaixa });
      if (error) throw error;
      return new Map(((data ?? []) as Array<{ lancamento_id: string; estornado_em: string | null }>).map(v => [v.lancamento_id, v.estornado_em]));
    },
  });
  const lancamentosExcederamLimite = Boolean(lancamentosData?.excedeuLimite);

  // Histórico de caixas anteriores
  const {
    data: historicosCaixa = [],
    isLoading: carregandoHistoricosCaixa,
    isError: erroHistoricosCaixa,
    refetch: recarregarHistoricosCaixa,
  } = useQuery({
    queryKey: ['historico-caixas', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const [recent, open] = await Promise.all([
        supabase.from('caixa_diario').select('*').eq('clinica_id', profile.clinica_id)
          .order('data', { ascending: false }).limit(30),
        supabase.from('caixa_diario').select('*').eq('clinica_id', profile.clinica_id)
          .eq('aberto', true).order('data', { ascending: false }),
      ]);
      if (recent.error) throw recent.error;
      if (open.error) throw open.error;
      return [...new Map([...(recent.data || []), ...(open.data || [])].map(row => [row.id, row])).values()]
        .sort((a, b) => b.data.localeCompare(a.data)) as CaixaDiarioType[];
    },
    enabled: !!profile?.clinica_id && activeTab === 'historico',
  });

  // ─── Calculations ───────────────────────────────
  const totais = useMemo(() => {
    return calcularTotaisCaixa(caixaHoje?.valor_abertura || 0, lancamentos);
  }, [lancamentos, caixaHoje]);

  const saldoEsperadoGaveta = useMemo(
    () => calcularSaldoGaveta(caixaHoje?.valor_abertura || 0, lancamentos),
    [caixaHoje?.valor_abertura, lancamentos],
  );

  const breakdownFormas = useMemo(() => {
    const formas: Record<string, number> = {};
    lancamentos.filter(l => l.tipo === 'receita').forEach(l => {
      const key = l.forma_pagamento?.replace('cartao_', '') || 'outros';
      formas[key] = (formas[key] || 0) + (l.valor || 0);
    });
    return formas;
  }, [lancamentos]);

  const lancamentosFiltrados = useMemo(() => {
    const porTipo = tipoFiltro === 'todos' ? lancamentos : lancamentos.filter(l => l.tipo === tipoFiltro);
    if (!searchTerm.trim()) return porTipo;
    const q = searchTerm.toLowerCase();
    return porTipo.filter(l =>
      l.descricao.toLowerCase().includes(q) || l.tipo.includes(q)
    );
  }, [lancamentos, searchTerm, tipoFiltro]);

  const contagemPorTipo = useMemo(() => ({
    receita: lancamentos.filter(l => l.tipo === 'receita').length,
    despesa: lancamentos.filter(l => l.tipo === 'despesa').length,
    sangria: lancamentos.filter(l => l.tipo === 'sangria').length,
    suprimento: lancamentos.filter(l => l.tipo === 'suprimento').length,
  }), [lancamentos]);

  const deletarLancamentoMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      // Só exclui o que o próprio caixa lançou; repasse, convênio e baixas são corrigidos na tela de origem.
      const movimento = lancamentos.find(l => l.id === id);
      if (!movimento || !ehMovimentoDoCaixa(movimento)) {
        throw new Error('Este lançamento veio de outro módulo e deve ser corrigido na tela de origem.');
      }
      const { data, error } = await supabase.from('lancamentos').delete()
        .eq('id', id).eq('clinica_id', profile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir este lançamento.');
    },
    onSuccess: () => {
      toast.success('Lançamento removido!');
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro'),
  });

  // ─── Helpers ────────────────────────────────────
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const getTipoConfig = (tipo: LancamentoTipo) => ({
    receita: { label: 'Receita', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
    despesa: { label: 'Despesa', icon: TrendingDown, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
    sangria: { label: 'Sangria', icon: ArrowDownToLine, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
    suprimento: { label: 'Suprimento', icon: ArrowUpFromLine, color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
  }[tipo]);

  const buildReceiptData = (l: Lancamento): ReceiptData => ({
    titulo: 'COMPROVANTE DE PAGAMENTO',
    dataHora: fmtTime(l.created_at),
    docId: l.id.slice(0, 8).toUpperCase(),
    // Nome real: o comprovante com "Paciente" fixo não servia para conferir
    // nada — quem recebeu, o quê, a quem.
    paciente: l.paciente_nome || l.pacientes?.nome || 'Paciente',
    descricao: l.descricao || 'Serviço',
    formaPagamento: FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento,
    valorOriginal: l.valor,
    valorFinal: l.valor,
  });

  const imprimirRelatorioFechamento = (caixa: CaixaDiarioType, movimentos: Lancamento[]) => {
    const t = calcularTotaisCaixa(caixa.valor_abertura, movimentos);
    const esperado = calcularSaldoGaveta(caixa.valor_abertura, movimentos);
    const porForma: Record<string, number> = {};
    movimentos.filter(l => l.tipo === 'receita').forEach(l => {
      const chave = FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento || 'Outros';
      porForma[chave] = (porForma[chave] || 0) + (l.valor || 0);
    });
    const contado = caixa.valor_fechamento;
    const diferenca = contado === null ? null : diferencaEmReais(contado, esperado);
    const dataLonga = new Date(`${caixa.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const linhas = movimentos.map(l => {
      const sinal = (l.tipo === 'receita' || l.tipo === 'suprimento') ? '+' : '−';
      return `<tr><td>${escapeHtml(fmtTime(l.created_at))}</td><td>${escapeHtml(getTipoConfig(l.tipo).label)}</td><td>${escapeHtml(l.descricao)}</td><td>${escapeHtml(FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento)}</td><td class="num ${sinal === '−' ? 'neg' : 'pos'}">${sinal}${escapeHtml(fmt(Math.abs(l.valor)))}</td></tr>`;
    }).join('');
    const corpo = `
      <h1>Relatório de fechamento de caixa</h1>
      <div class="muted">${escapeHtml(dataLonga)} · ${caixa.aberto ? 'Caixa ainda aberto (parcial)' : 'Caixa fechado'}${profile?.nome ? ` · emitido por ${escapeHtml(profile.nome)}` : ''} · ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
      <div class="grid">
        <div class="box">Abertura<b>${escapeHtml(fmt(caixa.valor_abertura))}</b><span class="muted">${escapeHtml(caixa.operador_abertura || '—')}</span></div>
        <div class="box">Receitas<b class="pos">${escapeHtml(fmt(t.receita))}</b></div>
        <div class="box">Despesas<b class="neg">${escapeHtml(fmt(t.despesa))}</b></div>
        <div class="box">Sangrias<b class="neg">${escapeHtml(fmt(t.sangria))}</b></div>
        <div class="box">Suprimentos<b class="pos">${escapeHtml(fmt(t.suprimento))}</b></div>
        <div class="box">Resultado financeiro<b>${escapeHtml(fmt(t.final))}</b></div>
      </div>
      <h2>Conferência da gaveta</h2>
      <div class="grid">
        <div class="box">Dinheiro esperado<b>${escapeHtml(fmt(esperado))}</b></div>
        <div class="box">Dinheiro contado<b>${contado === null ? '—' : escapeHtml(fmt(contado))}</b><span class="muted">${escapeHtml(caixa.operador_fechamento || '')}</span></div>
        <div class="box">Diferença<b class="dif ${diferenca === null ? '' : diferenca < 0 ? 'neg' : diferenca > 0 ? 'pos' : ''}">${diferenca === null ? '—' : escapeHtml(fmt(diferenca))}</b></div>
      </div>
      ${caixa.observacoes ? `<p><strong>Observações:</strong> ${escapeHtml(caixa.observacoes)}</p>` : ''}
      <h2>Receitas por forma de pagamento</h2>
      <table><thead><tr><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>
        ${Object.entries(porForma).sort((a, b) => b[1] - a[1]).map(([forma, valor]) => `<tr><td>${escapeHtml(forma)}</td><td class="num">${escapeHtml(fmt(valor))}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Sem receitas</td></tr>'}
      </tbody></table>
      <h2>Movimentações (${movimentos.length})</h2>
      <table><thead><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>${linhas || '<tr><td colspan="5" class="muted">Nenhuma movimentação</td></tr>'}</tbody></table>
      <div class="assin"><div>Operador do caixa</div><div>Responsável / conferência</div></div>
    `;
    abrirJanelaDeImpressao(`Fechamento de caixa ${caixa.data}`, corpo);
  };

  const exportarCsv = (movimentos: Lancamento[], data: string) => {
    const cabecalho = ['Data', 'Hora', 'Tipo', 'Descrição', 'Forma de pagamento', 'Categoria', 'Valor'];
    const linhas = movimentos.map(l => [
      l.data, fmtTime(l.created_at), getTipoConfig(l.tipo).label, l.descricao,
      FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento, l.categoria || '',
      ((l.tipo === 'receita' || l.tipo === 'suprimento') ? l.valor : -l.valor).toFixed(2).replace('.', ','),
    ]);
    const csv = [cabecalho, ...linhas]
      .map(cols => cols.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    baixarArquivo(`caixa-${data}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  };

  if (!profile?.clinica_id) {
    return <SectionFallback rows={5} />;
  }

  if (loadingCaixa || (!!caixaHoje?.data && loadingLanc)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (erroCaixa || (caixaHoje?.data && erroLancamentos)) {
    return (
      <div className="space-y-4 p-4 md:p-6" role="alert">
        <h1 className="text-2xl font-bold text-foreground">Não foi possível carregar o caixa</h1>
        <p className="text-sm text-muted-foreground">Os dados financeiros não foram carregados. Tente novamente antes de registrar ou fechar o caixa.</p>
        <Button variant="outline" onClick={() => { void recarregarCaixa(); void recarregarLancamentos(); }}>Tentar novamente</Button>
      </div>
    );
  }

  const isOpen = caixaHoje?.aberto === true;
  const podeReabrir = Boolean(profile?.roles?.some(role => role === 'admin' || role === 'financeiro'));

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <PageHeader
        title="Caixa Diário"
        description={caixaHoje
          ? `Saldo ${fmt(totais.final)} · Entradas ${fmt(totais.receita)} · Saídas ${fmt(totais.despesa + totais.sangria)}`
          : new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        icon={<DollarSign />}
        actions={(
          <>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => { void recarregarCaixa(); void recarregarLancamentos(); }}
              aria-label="Atualizar caixa"
              title="Atualizar caixa"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {!caixaHoje ? (
              <Button
                onClick={() => navigate("/recepcao/caixa/abrir", { state: { returnTo: location.pathname + location.search } })}
                className="shrink-0 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Unlock className="h-4 w-4" /> Abrir Caixa
              </Button>
            ) : isOpen ? (
              <Button
                onClick={() => navigate('/recepcao/caixa/venda', { state: { returnTo: '/caixa-diario', cashTab: 'hoje' } })}
                className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110"
              >
                <ShoppingCart className="h-4 w-4" /> Nova Venda
              </Button>
            ) : null}
          </>
        )}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex h-auto w-auto gap-0.5 p-1">
            {[
              { v: 'hoje', l: 'Caixa Hoje', i: Receipt },
              { v: 'historico', l: 'Histórico', i: History },
            ].map(tab => (
              <TabsTrigger key={tab.v} value={tab.v} className="min-h-8 gap-1.5 whitespace-nowrap px-3 text-xs">
                <tab.i className="h-3.5 w-3.5" /> {tab.l}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ═══ TAB HOJE ═══ */}
        <TabsContent value="hoje" className="space-y-5 mt-4">
          {erroCaixasAbertosAntigos && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
              <span className="text-sm text-destructive">Não foi possível conferir se há caixas de dias anteriores ainda abertos.</span>
              <Button size="sm" variant="outline" onClick={() => void recarregarCaixasAbertosAntigos()}>Tentar novamente</Button>
            </div>
          )}
          {caixasAbertosAntigos.length > 0 && (
            <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3" role="status">
              <div>
                <p className="text-sm font-semibold">Há caixas de dias anteriores ainda abertos</p>
                <p className="text-xs text-muted-foreground">Revise e encerre cada caixa. Isso não altera os pagamentos de hoje.</p>
              </div>
              {caixasAbertosAntigos.map(caixa => (
                <div key={caixa.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2">
                  <span className="text-sm">{fmtDate(caixa.data)} · Abertura {fmt(caixa.valor_abertura)}</span>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/recepcao/caixa/${caixa.id}/fechar`, { state: { returnTo: '/caixa-diario', cashTab: 'hoje' } })}>
                    Revisar e regularizar
                  </Button>
                </div>
              ))}
            </div>
          )}
          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 empty:hidden">
            {/* Sem caixa aberto, o botão do cabeçalho e o do aviso abaixo já levam à abertura. */}
            {!caixaHoje ? null : isOpen ? (
              <>
                <Button onClick={() => navigate('/recepcao/caixa/venda', { state: { returnTo: '/caixa-diario', cashTab: 'hoje' } })} className="h-11 gap-2 rounded-full bg-gradient-primary px-5 text-white shadow-md hover:brightness-110">
                  <ShoppingCart className="h-4 w-4" /> Nova Venda
                </Button>
                <Button onClick={() => navigate('/recepcao/caixa/despesa', { state: { returnTo: '/caixa-diario', cashTab: 'hoje' } })} variant="outline" className="h-11 gap-2 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <TrendingDown className="h-4 w-4" /> Despesa
                </Button>
                <Button onClick={() => navigate('/recepcao/caixa/sangria', { state: { returnTo: '/caixa-diario', cashTab: 'hoje' } })} variant="outline" className="h-11 gap-2 rounded-full border-warning/30 text-warning-foreground hover:bg-warning/10">
                  <ArrowDownToLine className="h-4 w-4" /> Sangria
                </Button>
                <Button onClick={() => navigate('/recepcao/caixa/suprimento', { state: { returnTo: '/caixa-diario', cashTab: 'hoje' } })} variant="outline" className="h-11 gap-2 rounded-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                  <ArrowUpFromLine className="h-4 w-4" /> Suprimento
                </Button>
                <Button onClick={() => imprimirRelatorioFechamento(caixaHoje, lancamentos)} variant="ghost" className="h-11 gap-2 rounded-full text-muted-foreground" title="Relatório parcial do caixa">
                  <Printer className="h-4 w-4" /> Relatório parcial
                </Button>
                <Button onClick={() => navigate(`/recepcao/caixa/${caixaHoje.id}/fechar`, { state: { returnTo: '/caixa-diario', cashTab: 'hoje' } })} disabled={loadingLanc || erroLancamentos || lancamentosExcederamLimite} variant="destructive" className="ml-auto h-11 gap-2 rounded-full px-5">
                  <Lock className="h-4 w-4" /> Fechar Caixa
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground" role="status">Caixa encerrado. Consulta somente leitura.</p>
                <Button variant="outline" className="h-10 gap-2 rounded-full" onClick={() => imprimirRelatorioFechamento(caixaHoje, lancamentos)}>
                  <Printer className="h-4 w-4" /> Relatório de fechamento
                </Button>
                <Button variant="ghost" className="h-10 gap-2 rounded-full text-muted-foreground" onClick={() => exportarCsv(lancamentos, caixaHoje.data)}>
                  <FileSpreadsheet className="h-4 w-4" /> CSV
                </Button>
                {podeReabrir ? (
                  <Button variant="outline" className="ml-auto h-10 gap-2 rounded-full" onClick={() => navigate('/recepcao/caixa/reabrir', { state: { returnTo: '/caixa-diario', cashTab: 'hoje' } })}>
                    <Unlock className="h-4 w-4" /> Reabrir caixa
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Peça a um administrador ou responsável financeiro para reabrir o caixa.</p>
                )}
              </>
            )}
          </div>

          {/* Indicator strip — clicável, filtra os lançamentos */}
          {caixaHoje && (() => {
            const diferencaFechamento = !isOpen && caixaHoje.valor_fechamento !== null
              ? diferencaEmReais(caixaHoje.valor_fechamento, saldoEsperadoGaveta)
              : null;
            type IndicadorKey = 'todos' | LancamentoTipo;
            const indicadores: {
              key: IndicadorKey;
              label: string;
              caption: string;
              value: number;
              icon: typeof DollarSign;
              color: string;
              surface: string;
              escuro: boolean;
            }[] = [
              { key: 'receita', label: 'Receitas', caption: `${contagemPorTipo.receita} lançamento${contagemPorTipo.receita === 1 ? '' : 's'}`, value: totais.receita, icon: TrendingUp, color: 'text-success', surface: 'bg-success/10', escuro: false },
              { key: 'despesa', label: 'Despesas', caption: `${contagemPorTipo.despesa} saída${contagemPorTipo.despesa === 1 ? '' : 's'}`, value: totais.despesa, icon: TrendingDown, color: 'text-destructive', surface: 'bg-destructive/10', escuro: false },
              { key: 'sangria', label: 'Sangrias', caption: `${contagemPorTipo.sangria} retirada${contagemPorTipo.sangria === 1 ? '' : 's'}`, value: totais.sangria, icon: ArrowDownToLine, color: 'text-warning-foreground', surface: 'bg-warning/10', escuro: false },
              { key: 'suprimento', label: 'Suprimentos', caption: `${contagemPorTipo.suprimento} reposição${contagemPorTipo.suprimento === 1 ? '' : 's'}`, value: totais.suprimento, icon: ArrowUpFromLine, color: 'text-primary', surface: 'bg-primary/10', escuro: false },
              {
                key: 'todos',
                label: totais.final < 0 ? 'Saldo negativo' : 'Saldo do dia',
                caption: isOpen ? 'abertura + movimentos, com transferências' : diferencaFechamento === null ? 'caixa encerrado' : mesmoValor(diferencaFechamento, 0) ? 'bateu com o esperado' : `${diferencaFechamento > 0 ? 'sobra' : 'falta'} ${fmt(Math.abs(diferencaFechamento))}`,
                value: totais.final,
                icon: DollarSign,
                color: 'text-foreground',
                surface: 'bg-secondary',
                escuro: false,
              },
            ];
            return (
              <section role="group" aria-label="Resumo do caixa" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                {indicadores.map(card => {
                  const ativo = tipoFiltro === card.key;
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.key}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => {
                        if (card.key === 'todos') {
                          setTipoFiltro('todos');
                        } else {
                          setTipoFiltro(tipoFiltro === card.key ? 'todos' : card.key);
                        }
                      }}
                      className={cn(
                        'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        card.escuro && 'border-transparent bg-gradient-primary text-white',
                        ativo && !card.escuro && 'border-primary/50 ring-1 ring-primary/30',
                        ativo && card.escuro && 'ring-2 ring-primary/60',
                      )}
                    >
                      <div className="flex min-h-[88px] items-start gap-3 p-3">
                        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', card.escuro ? 'bg-white/15' : 'bg-secondary')}>
                          <Icon aria-hidden="true" className={cn('h-4 w-4', card.escuro ? 'text-white' : 'text-foreground')} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className={cn('truncate text-xs font-semibold', card.escuro ? 'text-white/80' : 'text-muted-foreground')}>{card.label}</h3>
                          <span className={cn('block truncate text-xl font-bold tabular-nums', card.escuro ? 'text-white' : card.key === 'despesa' || card.key === 'sangria' ? 'text-destructive' : 'text-foreground')}>{fmt(card.value)}</span>
                          <p className={cn('truncate text-[11px]', card.escuro ? 'text-white/60' : 'text-muted-foreground')}>{card.caption}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </section>
            );
          })()}

          {/* Payment Breakdown */}
          {caixaHoje && totais.receita > 0 && (
            <Card className="rounded-2xl border-primary/20 shadow-[0_8px_24px_rgba(16,17,19,0.06)]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                  <CardTitle className="text-base font-semibold">Receitas por forma de pagamento</CardTitle>
                  <Badge variant="outline" className="h-5 rounded-full border-border bg-white text-xs tabular-nums text-primary">{Object.keys(breakdownFormas).length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(breakdownFormas).map(([forma, valor]) => {
                    const Icon = FORMA_ICONS[forma] || Banknote;
                    const pct = totais.receita > 0 ? ((valor / totais.receita) * 100).toFixed(0) : '0';
                    return (
                      <div key={forma} className="flex items-center gap-3 rounded-xl bg-secondary border border-border p-3">
                        <div className="rounded-lg bg-gradient-primary p-2 text-white shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground capitalize">{FORMA_LABELS[forma] || forma}</p>
                          <p className="text-sm font-bold tabular-nums">{fmt(valor)}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full text-[10px] border-border text-primary">{pct}%</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lançamentos Table */}
          {caixaHoje && (
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <CardTitle className="text-sm font-semibold">
                    Movimentações ({lancamentosFiltrados.length}{lancamentosFiltrados.length !== lancamentos.length ? ` de ${lancamentos.length}` : ''})
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <div role="group" aria-label="Filtrar movimentações por tipo" className="flex flex-wrap items-center gap-1">
                      {([
                        ['todos', 'Todos', lancamentos.length],
                        ['receita', 'Receitas', contagemPorTipo.receita],
                        ['despesa', 'Despesas', contagemPorTipo.despesa],
                        ['sangria', 'Sangrias', contagemPorTipo.sangria],
                        ['suprimento', 'Suprimentos', contagemPorTipo.suprimento],
                      ] as Array<['todos' | LancamentoTipo, string, number]>).map(([valor, rotulo, total]) => (
                        <button
                          key={valor}
                          type="button"
                          aria-pressed={tipoFiltro === valor}
                          onClick={() => setTipoFiltro(valor)}
                          className={cn(
                            'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition',
                            tipoFiltro === valor ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                          )}
                        >
                          {rotulo} <span className={cn('tabular-nums', tipoFiltro === valor ? 'text-white/70' : 'text-muted-foreground/70')}>{total}</span>
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input className="h-10 w-full rounded-full pl-9 text-sm focus-visible:ring-primary sm:w-56" placeholder="Buscar movimentações..." aria-label="Buscar movimentações do caixa" value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-full text-xs" onClick={() => exportarCsv(lancamentosFiltrados, caixaHoje.data)} disabled={lancamentosFiltrados.length === 0} title="Exportar as movimentações filtradas em CSV">
                      <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {lancamentosExcederamLimite && (
                  <div role="alert" className="mb-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning-foreground">
                    O caixa tem mais de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} movimentos. Os totais da tela estão incompletos e o fechamento fica bloqueado; peça suporte para conferir o período completo.
                  </div>
                )}
                {loadingLanc ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : lancamentosFiltrados.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-center">
                    <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                      <Receipt className="h-7 w-7" />
                    </span>
                    <p className="font-medium text-foreground">Nenhuma movimentação{tipoFiltro !== 'todos' ? ' neste filtro' : ''}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tipoFiltro !== 'todos'
                        ? 'Tente outro filtro ou registre uma nova movimentação'
                        : 'Registre receitas, despesas ou sangrias'}
                    </p>
                    {tipoFiltro !== 'todos' && (
                      <button type="button" onClick={() => setTipoFiltro('todos')} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
                        <X className="h-3.5 w-3.5" /> Limpar filtro
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Tipo</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                          <TableHead className="text-xs">Pagamento</TableHead>
                          <TableHead className="text-xs">Hora</TableHead>
                          <TableHead className="text-xs text-right">Valor</TableHead>
                          <TableHead className="text-xs w-24">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                          {lancamentosFiltrados.map((l) => {
                            const cfg = getTipoConfig(l.tipo);
                            const Icon = cfg.icon;
                            const FormaIcon = FORMA_ICONS[l.forma_pagamento] || Banknote;
                            const valorAssinado = (l.tipo === 'receita' || l.tipo === 'suprimento') ? l.valor : -l.valor;
                            return (
                              <TableRow key={l.id} className="hover:bg-muted/30 transition-colors">
                                <TableCell>
                                  <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
                                    <Icon className="h-3 w-3" /> {cfg.label}
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium text-sm">{l.descricao}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="inline-flex items-center gap-1.5 rounded-full text-xs text-muted-foreground">
                                    <FormaIcon className="h-3 w-3" />
                                    {FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> {fmtTime(l.created_at)}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={cn('font-bold tabular-nums text-sm', valorAssinado < 0 ? 'text-destructive' : cfg.color)}>
                                    {valorAssinado < 0 ? '−' : '+'}{fmt(Math.abs(l.valor))}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-0.5">
                                    {l.tipo === 'receita' && (
                                      <>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"
                                          title="Imprimir" onClick={() => printReceiptPdf(buildReceiptData(l))}>
                                          <Printer className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"
                                          title="Download" onClick={() => downloadReceiptPdf(buildReceiptData(l))}>
                                          <Download className="h-3.5 w-3.5" />
                                        </Button>
                                        {vendasPdv?.has(l.id) && (vendasPdv.get(l.id) ? (
                                          <Badge variant="outline" className="rounded-full text-xs font-normal text-muted-foreground">Estornada</Badge>
                                        ) : (
                                          <Button variant="ghost" size="icon" aria-label="Estornar venda" title="Estornar venda" className="h-9 w-9 rounded-full text-destructive hover:text-destructive"
                                            onClick={() => navigate(`/recepcao/caixa/vendas/${l.id}/estornar`, { state: { returnTo: '/caixa-diario' } })}>
                                            <Undo2 className="h-3.5 w-3.5" />
                                          </Button>
                                        ))}
                                      </>
                                    )}
                                    {l.tipo !== 'receita' && !ehMovimentoDoCaixa(l) && (() => {
                                      const origem = origemExternaDoMovimento(l);
                                      if (!origem) return null;
                                      const etiqueta = (
                                        <Badge variant="outline" className="rounded-full text-xs font-normal text-muted-foreground">
                                          {origem.rotulo}
                                        </Badge>
                                      );
                                      return origem.rota ? (
                                        <Button variant="ghost" size="sm" className="h-9 gap-1 rounded-full px-2 text-xs"
                                          title={`${origem.descricao}. Corrija na tela de origem.`}
                                          aria-label={`${origem.descricao}: abrir ${origem.rotulo}`}
                                          onClick={() => navigate(origem.rota!)}>
                                          {etiqueta}
                                          <ChevronRight className="h-3.5 w-3.5" />
                                        </Button>
                                      ) : <span title={origem.descricao}>{etiqueta}</span>;
                                    })()}
                                    {ehMovimentoDoCaixa(l) && (
                                      <>
                                        <Button variant="ghost" size="icon" aria-label="Excluir lançamento" className="h-9 w-9 rounded-full text-destructive hover:text-destructive"
                                          onClick={() => setConfirmDelete(l.id)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label="Editar lançamento" className="h-9 w-9 rounded-full"
                                          onClick={() => {
                                            navigate(`/recepcao/caixa/lancamentos/${l.id}/editar`, {
                                              state: {
                                                returnTo: '/caixa-diario',
                                                cashTab: 'hoje',
                                                cashSearchTerm: searchTerm,
                                                cashTipoFiltro: tipoFiltro,
                                              },
                                            });
                                          }}>
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
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
          )}

          {/* Empty state when caixa is not open today */}
          {!isOpen && !caixaHoje && (
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                  <DollarSign className="h-7 w-7" />
                </span>
                <h3 className="text-lg font-semibold text-foreground mb-1">Caixa não aberto hoje</h3>
                <p className="text-sm text-muted-foreground mb-4">Abra o caixa para iniciar as movimentações do dia</p>
                <Button onClick={() => navigate("/recepcao/caixa/abrir", { state: { returnTo: location.pathname + location.search } })} className="h-11 gap-2 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90">
                  <Unlock className="h-4 w-4" /> Abrir Caixa Agora
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Closed caixa summary */}
          {caixaHoje && !isOpen && (
            <Card className="rounded-2xl border-border/60 shadow-xs">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Lock className="h-4 w-4 text-muted-foreground" /> Resumo do fechamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
                  <div><p className="text-xs text-muted-foreground">Abertura</p><p className="font-bold tabular-nums">{fmt(caixaHoje.valor_abertura)}</p><p className="text-[11px] text-muted-foreground">{caixaHoje.operador_abertura || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Dinheiro esperado</p><p className="font-bold tabular-nums">{fmt(saldoEsperadoGaveta)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Dinheiro contado</p><p className="font-bold tabular-nums">{fmt(caixaHoje.valor_fechamento || 0)}</p><p className="text-[11px] text-muted-foreground">{caixaHoje.operador_fechamento || '—'}</p></div>
                  {(() => {
                    const dif = caixaHoje.valor_fechamento === null ? null : diferencaEmReais(caixaHoje.valor_fechamento, saldoEsperadoGaveta);
                    return (
                      <div>
                        <p className="text-xs text-muted-foreground">Diferença</p>
                        <p className={cn('font-bold tabular-nums', dif === null ? '' : mesmoValor(dif, 0) ? 'text-success' : 'text-destructive')}>{dif === null ? '—' : fmt(dif)}</p>
                        <p className="text-[11px] text-muted-foreground">{dif === null ? '' : mesmoValor(dif, 0) ? 'Caixa bateu' : dif > 0 ? 'Sobra na gaveta' : 'Falta na gaveta'}</p>
                      </div>
                    );
                  })()}
                  <div><p className="text-xs text-muted-foreground">Observações</p><p className="text-xs font-medium">{caixaHoje.observacoes || '—'}</p></div>
                </div>
              </CardContent>
            </Card>
          )}

          {erroEventosCaixa && caixaHoje && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
              <span className="text-xs text-destructive">Não foi possível carregar o histórico de abertura e fechamento.</span>
              <Button size="sm" variant="outline" onClick={() => void recarregarEventosCaixa()}>Tentar novamente</Button>
            </div>
          )}
          {eventosCaixa.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Histórico deste caixa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {eventosCaixa.map(evento => (
                    <li key={evento.id} className="border-l-2 border-border pl-3 text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">
                          {evento.tipo === 'abertura' ? 'Caixa aberto' : evento.tipo === 'fechamento' ? 'Caixa fechado' : 'Caixa reaberto'}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(evento.created_at).toLocaleString('pt-BR')}</span>
                        {evento.user_nome && <span className="text-xs text-muted-foreground">por {evento.user_nome}</span>}
                      </div>
                      {evento.valor_informado !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">Valor informado: {fmt(evento.valor_informado)}</p>
                      )}
                      {evento.valor_apurado !== null && (
                        <p className="text-xs text-muted-foreground">Saldo apurado: {fmt(evento.valor_apurado)}</p>
                      )}
                      {evento.tipo === 'reabertura' && evento.fechamento_anterior_valor !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Fechamento anterior: {fmt(evento.fechamento_anterior_valor)}{evento.fechamento_anterior_operador ? `, por ${evento.fechamento_anterior_operador}` : ''}
                        </p>
                      )}
                      {evento.motivo && <p className="mt-1 text-xs">Motivo/observações: {evento.motivo}</p>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ TAB HISTÓRICO ═══ */}
        <TabsContent value="historico" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Últimos 30 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              {carregandoHistoricosCaixa ? (
                <div className="space-y-2" role="status" aria-label="Carregando histórico de caixas">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : erroHistoricosCaixa ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
                  <span className="text-sm text-destructive">Não foi possível carregar o histórico de caixas.</span>
                  <Button size="sm" variant="outline" onClick={() => void recarregarHistoricosCaixa()}>Tentar novamente</Button>
                </div>
              ) : historicosCaixa.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Nenhum registro de caixa</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historicosCaixa.map((cx) => (
                    <div key={cx.id}
                      role="button" tabIndex={0}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/recepcao/caixa/historico/${cx.id}`, { state: { returnTo: '/caixa-diario', cashTab: 'historico' } })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(`/recepcao/caixa/historico/${cx.id}`, { state: { returnTo: '/caixa-diario', cashTab: 'historico' } });
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn('rounded-lg p-2', cx.aberto ? 'bg-gradient-primary text-white' : 'bg-gradient-primary text-white')}>
                          {cx.aberto ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{fmtDate(cx.data)}</p>
                          <p className="text-xs text-muted-foreground">
                            {cx.operador_abertura || 'Sem operador'} · Abertura: {fmt(cx.valor_abertura)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {cx.valor_fechamento !== null ? (
                            <>
                              <p className="text-sm font-bold tabular-nums">{fmt(cx.valor_fechamento)}</p>
                              <p className="text-[10px] text-muted-foreground">Fechamento</p>
                            </>
                          ) : (
                            <Badge variant={cx.aberto ? 'outline' : 'secondary'} className={cn('text-[10px]', cx.aberto && 'bg-success/10 text-success border-success/20')}>
                              {cx.aberto ? 'Aberto' : 'Sem fechamento'}
                            </Badge>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* ═══ DIALOGS ═══ */}

      {/* Confirm Delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => {
        if (open || !deletarLancamentoMutation.isPending) setConfirmDelete(open ? confirmDelete : null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lançamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletarLancamentoMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => {
              event.preventDefault();
              if (confirmDelete && !deletarLancamentoMutation.isPending) deletarLancamentoMutation.mutate(confirmDelete);
            }}
              disabled={deletarLancamentoMutation.isPending}
              className="bg-destructive hover:bg-destructive/90">
              {deletarLancamentoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
