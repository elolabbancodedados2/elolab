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
  User, X, FileSpreadsheet, Scale, RefreshCw, Undo2, MoreHorizontal, MessageCircle,
} from 'lucide-react';
import { downloadReceiptPdf, getReceiptWhatsAppText, imprimirReciboComAviso, registroProfissional, type ReceiptData } from '@/lib/pdfReceipt';
import { mensagemDeErro } from '@/lib/erros';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { abrirJanelaDeImpressao, montarRelatorioCaixaHtml, textoDiferenca } from '@/lib/relatorioCaixa';
import { linkWhatsApp } from '@/lib/whatsapp';
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
import { dataHoraSP, FORMA_LABELS, horaSP, movimentoCorrespondeBusca, textoSeguroCsv } from '@/lib/caixaFormatacao';

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

type CaixaHistorico = CaixaDiarioType & { esperado: number | null; diferenca: number | null };

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



function avisarJanelaBloqueada() {
  toast.error('O navegador bloqueou a janela de impressão.', { description: 'Permita pop-ups para este site e tente novamente.' });
}

/** "2026-11" → primeiro e último dia do mês. */
function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
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
  const [historicoMes, setHistoricoMes] = useState(() => todaySaoPauloDateOnly().slice(0, 7));
  const [historicoStatus, setHistoricoStatus] = useState<'todos' | 'abertos' | 'fechados' | 'diferenca'>('todos');

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
    queryKey: ['historico-caixas', profile?.clinica_id, historicoMes],
    queryFn: async (): Promise<CaixaHistorico[]> => {
      if (!profile?.clinica_id) return [];
      const { inicio, fim } = limitesDoMes(historicoMes);
      const [doMes, open] = await Promise.all([
        supabase.from('caixa_diario').select('*').eq('clinica_id', profile.clinica_id)
          .gte('data', inicio).lte('data', fim).order('data', { ascending: false }),
        supabase.from('caixa_diario').select('*').eq('clinica_id', profile.clinica_id)
          .eq('aberto', true).order('data', { ascending: false }),
      ]);
      if (doMes.error) throw doMes.error;
      if (open.error) throw open.error;
      const caixas = [...new Map([...(doMes.data || []), ...(open.data || [])].map(row => [row.id, row])).values()]
        .sort((a, b) => b.data.localeCompare(a.data)) as CaixaDiarioType[];
      // O evento de fechamento guarda o saldo apurado (dinheiro esperado) daquele momento.
      const apurado = new Map<string, number>();
      if (caixas.length) {
        const { data: eventos, error } = await supabase.from('caixa_diario_eventos')
          .select('caixa_id, valor_apurado, created_at').eq('tipo', 'fechamento')
          .in('caixa_id', caixas.map(c => c.id)).order('created_at', { ascending: true });
        if (error) throw error;
        (eventos ?? []).forEach((e: { caixa_id: string; valor_apurado: number | null }) => {
          if (e.valor_apurado !== null) apurado.set(e.caixa_id, Number(e.valor_apurado));
        });
      }
      return caixas.map(c => {
        const esperado = apurado.get(c.id) ?? null;
        const diferenca = !c.aberto && c.valor_fechamento !== null && esperado !== null
          ? diferencaEmReais(Number(c.valor_fechamento), esperado) : null;
        return { ...c, esperado, diferenca };
      });
    },
    enabled: !!profile?.clinica_id && activeTab === 'historico',
  });
  const historicosFiltrados = useMemo(() => historicosCaixa.filter(cx => {
    if (historicoStatus === 'abertos') return cx.aberto;
    if (historicoStatus === 'fechados') return !cx.aberto;
    if (historicoStatus === 'diferenca') return cx.diferenca !== null && cx.diferenca !== 0;
    return true;
  }), [historicosCaixa, historicoStatus]);

  const exportarConsolidadoMes = () => {
    const cabecalho = ['Data', 'Situação', 'Operador da abertura', 'Abertura', 'Dinheiro esperado', 'Dinheiro contado', 'Diferença', 'Conferência', 'Operador do fechamento', 'Observações'];
    const num = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));
    const linhas = [...historicosFiltrados].sort((a, b) => a.data.localeCompare(b.data)).map(cx => [
      cx.data, cx.aberto ? 'Aberto' : 'Fechado', textoSeguroCsv(cx.operador_abertura || ''), num(Number(cx.valor_abertura)),
      num(cx.esperado), num(cx.valor_fechamento === null ? null : Number(cx.valor_fechamento)), num(cx.diferenca),
      cx.diferenca === null ? '' : textoDiferenca(cx.diferenca), textoSeguroCsv(cx.operador_fechamento || ''), textoSeguroCsv(cx.observacoes || ''),
    ]);
    const csv = [cabecalho, ...linhas].map(cols => cols.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    baixarArquivo(`caixas-${historicoMes}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  };

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
    return porTipo.filter(l => movimentoCorrespondeBusca(l, searchTerm));
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
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
    },
    onError: (e: unknown) => toast.error('Não foi possível remover o lançamento.', { description: mensagemDeErro(e) }),
  });

  // ─── Helpers ────────────────────────────────────
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtTime = horaSP;
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const getTipoConfig = (tipo: LancamentoTipo) => ({
    receita: { label: 'Receita', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
    despesa: { label: 'Despesa', icon: TrendingDown, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
    sangria: { label: 'Sangria', icon: ArrowDownToLine, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
    suprimento: { label: 'Suprimento', icon: ArrowUpFromLine, color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
  }[tipo]);

  const buildReceiptData = (l: Lancamento): ReceiptData => {
    // Estorno de pagamento vem como receita negativa ("Estorno: …"): não pode
    // sair como comprovante de pagamento.
    const estorno = l.valor < 0;
    return {
      modelo: estorno ? 'estorno' : 'pagamento',
      dataHora: dataHoraSP(l.created_at),
      docId: l.id.slice(0, 8).toUpperCase(),
      // Nome real: o comprovante com "Paciente" fixo não servia para conferir
      // nada — quem recebeu, o quê, a quem.
      paciente: l.paciente_nome || l.pacientes?.nome || undefined,
      descricao: l.descricao || 'Serviço',
      formaPagamento: FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento,
      valorOriginal: Math.abs(l.valor),
      valorFinal: Math.abs(l.valor),
      operador: profile?.nome || undefined,
    };
  };

  /** Busca CPF, médico (CRM) e CNPJ da clínica para o recibo de reembolso. */
  const montarReciboReembolso = async (l: Lancamento): Promise<ReceiptData> => {
    const base = buildReceiptData(l);
    const db = supabase as any;
    let lancamentoId = l.id;
    if (l.origem_pagamento) {
      const { data } = await db.from('pagamentos').select('lancamento_id').eq('id', l.id).maybeSingle();
      if (data?.lancamento_id) lancamentoId = data.lancamento_id;
    }
    const [clinica, paciente, lancamento] = await Promise.all([
      db.from('clinicas').select('nome, cnpj').eq('id', profile!.clinica_id).maybeSingle(),
      l.paciente_id ? db.from('pacientes').select('nome, cpf').eq('id', l.paciente_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from('lancamentos').select('descricao, agendamentos(medicos(nome, crm, tipo_registro, crm_uf, especialidade))').eq('id', lancamentoId).maybeSingle(),
    ]);
    const medico = lancamento.data?.agendamentos?.medicos ?? null;
    return {
      ...base,
      modelo: 'reembolso',
      clinicaNome: clinica.data?.nome || undefined,
      clinicaCnpj: clinica.data?.cnpj || undefined,
      paciente: paciente.data?.nome || base.paciente,
      cpf: paciente.data?.cpf || undefined,
      descricao: lancamento.data?.descricao || base.descricao,
      medico: medico?.nome || undefined,
      medicoRegistro: registroProfissional(medico),
      especialidade: medico?.especialidade || undefined,
    };
  };

  const imprimirReciboReembolso = async (l: Lancamento) => {
    try {
      await imprimirReciboComAviso(await montarReciboReembolso(l));
    } catch (erro) {
      toast.error('Não foi possível montar o recibo para reembolso.', { description: mensagemDeErro(erro) });
    }
  };

  const enviarNoWhatsApp = async (l: Lancamento) => {
    // A aba abre no clique; o endereço entra depois de buscar o telefone,
    // senão o navegador bloqueia a janela aberta após a consulta.
    const janela = window.open('about:blank', '_blank');
    let telefone: string | null = null;
    if (l.paciente_id) {
      const { data } = await (supabase as any).from('pacientes').select('telefone').eq('id', l.paciente_id).maybeSingle();
      telefone = data?.telefone ?? null;
    }
    const texto = getReceiptWhatsAppText(buildReceiptData(l));
    const link = linkWhatsApp(telefone, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
    if (janela) {
      janela.opener = null;
      janela.location.href = link;
    } else {
      toast.warning('O navegador bloqueou a janela do WhatsApp.', {
        action: { label: 'Abrir WhatsApp', onClick: () => { window.open(link, '_blank', 'noopener'); } },
      });
    }
    if (!telefone) toast.info('Paciente sem telefone cadastrado: escolha o contato no WhatsApp.');
  };

  const imprimirRelatorioFechamento = (caixa: CaixaDiarioType, movimentos: Lancamento[]) => {
    const corpo = montarRelatorioCaixaHtml({ caixa, movimentos, emitidoPor: profile?.nome });
    if (!abrirJanelaDeImpressao(`Fechamento de caixa ${caixa.data}`, corpo)) avisarJanelaBloqueada();
  };

  const exportarCsv = (movimentos: Lancamento[], data: string) => {
    const cabecalho = ['Data', 'Hora', 'Tipo', 'Descrição', 'Paciente', 'Forma de pagamento', 'Categoria', 'Valor'];
    const linhas = movimentos.map(l => [
      l.data, fmtTime(l.created_at), getTipoConfig(l.tipo).label, textoSeguroCsv(l.descricao),
      textoSeguroCsv(l.paciente_nome || l.pacientes?.nome || ''),
      textoSeguroCsv(FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento), textoSeguroCsv(l.categoria || ''),
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

  // Erro de atualização com dados já na tela vira aviso discreto (abaixo); só sem dados a tela inteira cede.
  if ((erroCaixa && caixaHoje === undefined) || (caixaHoje?.data && erroLancamentos && !lancamentosData)) {
    return (
      <div className="space-y-4 p-4 md:p-6" role="alert">
        <h1 className="text-2xl font-bold text-foreground">Não foi possível carregar o caixa</h1>
        <p className="text-sm text-muted-foreground">Os dados financeiros não foram carregados. Tente novamente antes de registrar ou fechar o caixa.</p>
        <Button variant="outline" onClick={() => { void recarregarCaixa(); void recarregarLancamentos(); }}>Tentar novamente</Button>
      </div>
    );
  }

  const isOpen = caixaHoje?.aberto === true;
  // `roles` junta o array e o papel legado: perfil só com `role` também reabre.
  const podeReabrir = roles.some(role => role === 'admin' || role === 'financeiro');

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <PageHeader
        title="Caixa Diário"
        description={caixaHoje
          ? `Resultado ${fmt(totais.final)} · Na gaveta ${fmt(saldoEsperadoGaveta)} · Entradas ${fmt(totais.receita)} · Saídas ${fmt(totais.despesa + totais.sangria)}`
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
                className="h-11 shrink-0 gap-2 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
              >
                <ShoppingCart className="h-4 w-4" /> Nova venda
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
          {(erroCaixa || erroLancamentos) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3" role="status">
              <span className="text-sm text-muted-foreground">Não foi possível atualizar o caixa agora. Os valores exibidos podem estar desatualizados.</span>
              <Button size="sm" variant="outline" onClick={() => { void recarregarCaixa(); void recarregarLancamentos(); }}>Tentar novamente</Button>
            </div>
          )}
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
                <p className="text-sm text-muted-foreground" role="status">Caixa encerrado. Para editar ou excluir lançamentos, reabra o caixa.</p>
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
            type IndicadorKey = 'todos' | 'gaveta' | LancamentoTipo;
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
                label: totais.final < 0 ? 'Resultado negativo' : 'Resultado do dia',
                caption: 'abertura + todas as formas',
                value: totais.final,
                icon: DollarSign,
                color: 'text-foreground',
                surface: 'bg-secondary',
                escuro: false,
              },
              {
                key: 'gaveta',
                label: 'Na gaveta',
                caption: isOpen ? 'dinheiro esperado agora' : diferencaFechamento === null ? 'caixa encerrado' : mesmoValor(diferencaFechamento, 0) ? 'bateu com o contado' : `${diferencaFechamento > 0 ? 'sobra' : 'falta'} ${fmt(Math.abs(diferencaFechamento))}`,
                value: saldoEsperadoGaveta,
                icon: Banknote,
                color: 'text-foreground',
                surface: 'bg-secondary',
                escuro: false,
              },
            ];
            return (
              <section role="group" aria-label="Resumo do caixa" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                {indicadores.map(card => {
                  const ativo = tipoFiltro === card.key;
                  const Icon = card.icon;
                  const key = card.key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={key === 'gaveta' ? undefined : ativo}
                      title={key === 'gaveta' ? 'Mostrar só os movimentos em dinheiro' : undefined}
                      onClick={() => {
                        if (key === 'todos') {
                          setTipoFiltro('todos');
                        } else if (key === 'gaveta') {
                          setTipoFiltro('todos');
                          setSearchTerm('dinheiro');
                        } else {
                          setTipoFiltro(tipoFiltro === key ? 'todos' : key);
                        }
                      }}
                      className={cn(
                        'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        card.escuro && 'border-transparent bg-primary text-primary-foreground',
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
                        <div className="shrink-0 rounded-lg border border-border bg-background p-2 text-foreground">
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
                            tipoFiltro === valor ? 'border-transparent bg-primary text-primary-foreground shadow-sm' : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                          )}
                        >
                          {rotulo} <span className={cn('tabular-nums', tipoFiltro === valor ? 'text-primary-foreground/70' : 'text-muted-foreground/70')}>{total}</span>
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
                          <TableHead className="hidden text-xs sm:table-cell">Pagamento</TableHead>
                          <TableHead className="hidden text-xs sm:table-cell">Hora</TableHead>
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
                                <TableCell className="font-medium text-sm">
                                  {l.descricao}
                                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:hidden">
                                    {FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento} · {fmtTime(l.created_at)}
                                  </span>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  <Badge variant="outline" className="inline-flex items-center gap-1.5 rounded-full text-xs text-muted-foreground">
                                    <FormaIcon className="h-3 w-3" />
                                    {FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento}
                                  </Badge>
                                </TableCell>
                                <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
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
                                  {(() => {
                                    const podeAlterar = isOpen && ehMovimentoDoCaixa(l);
                                    const temComprovante = l.tipo === 'receita';
                                    const estorno = l.valor < 0;
                                    const editar = () => navigate(`/recepcao/caixa/lancamentos/${l.id}/editar`, {
                                      state: { returnTo: '/caixa-diario', cashTab: 'hoje', cashSearchTerm: searchTerm, cashTipoFiltro: tipoFiltro },
                                    });
                                    if (!temComprovante && !podeAlterar) return null;
                                    return (
                                      <div className="sm:hidden">
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" aria-label={`Ações de ${l.descricao}`}>
                                              <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            {temComprovante && <DropdownMenuItem onSelect={() => { void imprimirReciboComAviso(buildReceiptData(l)); }}><Printer className="mr-2 h-4 w-4" />{estorno ? 'Imprimir comprovante de estorno' : 'Imprimir comprovante'}</DropdownMenuItem>}
                                            {temComprovante && <DropdownMenuItem onSelect={() => { void downloadReceiptPdf(buildReceiptData(l)); }}><Download className="mr-2 h-4 w-4" />Baixar comprovante</DropdownMenuItem>}
                                            {temComprovante && !estorno && <DropdownMenuItem onSelect={() => { void enviarNoWhatsApp(l); }}><MessageCircle className="mr-2 h-4 w-4" />Enviar no WhatsApp</DropdownMenuItem>}
                                            {temComprovante && !estorno && <DropdownMenuItem onSelect={() => { void imprimirReciboReembolso(l); }}><FileText className="mr-2 h-4 w-4" />Recibo para reembolso</DropdownMenuItem>}
                                            {temComprovante && vendasPdv?.has(l.id) && !vendasPdv.get(l.id) && <DropdownMenuItem className="text-destructive" onSelect={() => navigate(`/recepcao/caixa/vendas/${l.id}/estornar`, { state: { returnTo: '/caixa-diario' } })}><Undo2 className="mr-2 h-4 w-4" />Estornar venda</DropdownMenuItem>}
                                            {podeAlterar && <DropdownMenuItem onSelect={editar}><Pencil className="mr-2 h-4 w-4" />Editar lançamento</DropdownMenuItem>}
                                            {podeAlterar && <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(l.id)}><Trash2 className="mr-2 h-4 w-4" />Excluir lançamento</DropdownMenuItem>}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    );
                                  })()}
                                  <div className={cn('flex gap-0.5', (l.tipo === 'receita' || (isOpen && ehMovimentoDoCaixa(l))) && 'hidden sm:flex')}>
                                    {l.tipo === 'receita' && (
                                      <>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"
                                          title={l.valor < 0 ? 'Imprimir comprovante de estorno' : 'Imprimir comprovante'} aria-label={l.valor < 0 ? 'Imprimir comprovante de estorno' : 'Imprimir comprovante'} onClick={() => { void imprimirReciboComAviso(buildReceiptData(l)); }}>
                                          <Printer className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"
                                          title="Baixar comprovante" aria-label="Baixar comprovante" onClick={() => downloadReceiptPdf(buildReceiptData(l))}>
                                          <Download className="h-3.5 w-3.5" />
                                        </Button>
                                        {l.valor >= 0 && (
                                          <>
                                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"
                                              title="Enviar no WhatsApp" aria-label="Enviar comprovante no WhatsApp" onClick={() => { void enviarNoWhatsApp(l); }}>
                                              <MessageCircle className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"
                                              title="Recibo para reembolso" aria-label="Imprimir recibo para reembolso" onClick={() => { void imprimirReciboReembolso(l); }}>
                                              <FileText className="h-3.5 w-3.5" />
                                            </Button>
                                          </>
                                        )}
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
                                    {ehMovimentoDoCaixa(l) && isOpen && (
                                      <>
                                        <Button variant="ghost" size="icon" aria-label="Excluir lançamento" title="Excluir lançamento" className="h-9 w-9 rounded-full text-destructive hover:text-destructive"
                                          onClick={() => setConfirmDelete(l.id)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label="Editar lançamento" title="Editar lançamento" className="h-9 w-9 rounded-full"
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
                                    {ehMovimentoDoCaixa(l) && !isOpen && (
                                      <span className="text-[11px] text-muted-foreground" title="Reabra o caixa para editar ou excluir">Reabra o caixa</span>
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
                        <span className="text-xs text-muted-foreground">{dataHoraSP(evento.created_at)}</span>
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
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" /> Caixas do mês ({historicosFiltrados.length})
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="month" aria-label="Mês do histórico" className="h-11 w-full sm:w-44" value={historicoMes}
                    max={today.slice(0, 7)} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setHistoricoMes(e.target.value); }} />
                  <div role="group" aria-label="Filtrar caixas por situação" className="flex flex-wrap gap-1">
                    {([
                      ['todos', 'Todos'], ['abertos', 'Abertos'], ['fechados', 'Fechados'], ['diferenca', 'Com diferença'],
                    ] as Array<[typeof historicoStatus, string]>).map(([valor, rotulo]) => (
                      <button key={valor} type="button" aria-pressed={historicoStatus === valor} onClick={() => setHistoricoStatus(valor)}
                        className={cn('inline-flex h-11 items-center rounded-full border px-3 text-xs font-semibold transition',
                          historicoStatus === valor ? 'border-transparent bg-primary text-primary-foreground' : 'border-border/60 bg-card text-muted-foreground hover:text-foreground')}>
                        {rotulo}
                      </button>
                    ))}
                  </div>
                  <Button variant="outline" className="h-11 gap-1.5 rounded-full" onClick={exportarConsolidadoMes} disabled={historicosFiltrados.length === 0}
                    title="Consolidado do mês em planilha (abre no Excel)">
                    <FileSpreadsheet className="h-4 w-4" /> Exportar mês
                  </Button>
                </div>
              </div>
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
              ) : historicosFiltrados.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>{historicosCaixa.length === 0 ? 'Nenhum caixa neste mês' : 'Nenhum caixa neste filtro'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historicosFiltrados.map((cx) => {
                    const abrir = () => navigate(`/recepcao/caixa/historico/${cx.id}`, { state: { returnTo: '/caixa-diario', cashTab: 'historico' } });
                    const problema = cx.diferenca !== null && cx.diferenca !== 0;
                    return (
                      <button key={cx.id} type="button" onClick={abrir}
                        aria-label={`Caixa de ${fmtDate(cx.data)}, ${cx.aberto ? 'aberto' : 'fechado'}${cx.diferenca !== null ? `, ${textoDiferenca(cx.diferenca)}` : ''}`}
                        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cn('shrink-0 rounded-lg border p-2', cx.aberto ? 'border-border bg-background text-foreground' : 'border-transparent bg-secondary text-muted-foreground')}>
                            {cx.aberto ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              {fmtDate(cx.data)}
                              {cx.aberto ? (
                                <Badge variant="outline" className="gap-1.5 text-[10px]"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />Aberto</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">Fechado</Badge>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {cx.operador_abertura || 'Sem operador'} · Abertura: {fmt(cx.valor_abertura)}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="text-right">
                            {cx.valor_fechamento !== null && !cx.aberto ? (
                              <>
                                <p className="text-sm font-bold tabular-nums">{fmt(cx.valor_fechamento)}</p>
                                <p className={cn('text-[11px]', problema ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                                  {cx.diferenca === null ? 'Contado' : textoDiferenca(cx.diferenca)}
                                </p>
                              </>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">{cx.aberto ? 'Em andamento' : 'Sem fechamento'}</p>
                            )}
                          </div>
                          <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })}
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
