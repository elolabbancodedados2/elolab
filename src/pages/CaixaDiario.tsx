import { useState, useMemo, lazy, Suspense, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Lock, Unlock, Plus, Minus, Loader2, Trash2, Search, Clock, Printer, Download, Pencil,
  TrendingUp, TrendingDown, Banknote, CreditCard, QrCode, Wallet, ArrowDownToLine,
  ArrowUpFromLine, FileText, History, DollarSign, Receipt, ChevronRight, CalendarDays,
  BarChart3, Eye, Stethoscope, ShoppingBag, ShoppingCart, CheckCircle2, FlaskConical,
  ArrowUpRight, ArrowDownRight, ClipboardList, Tag, User, X,
} from 'lucide-react';

const LazyContasReceber = lazy(() => import('./ContasReceber'));
const LazyContasPagar = lazy(() => import('./ContasPagar'));
const LazyFluxoCaixa = lazy(() => import('./FluxoCaixa'));
const LazyPrecosExames = lazy(() => import('./PrecosExames'));
const LazyTiposConsulta = lazy(() => import('./TiposConsulta'));
const LazyRelatorios = lazy(() => import('./Relatorios'));
import { printReceiptPdf, downloadReceiptPdf, type ReceiptData } from '@/lib/pdfReceipt';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { SectionFallback } from '@/components/ui/loading-skeleton';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mesmoValor, diferencaEmReais, parseValorContado } from '@/lib/dinheiro';
import { calcularSaldoGaveta, calcularTotaisCaixa, validarResultadoRpcCaixa } from '@/lib/caixaDiario';
import { useBuscaPacientes } from '@/hooks/useBuscaPacientes';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';

type LancamentoTipo = 'receita' | 'despesa' | 'sangria' | 'suprimento';
type FormaPagamento = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'cartao_credito' | 'cartao_debito' | 'cheque' | 'transferencia';

function toMoney(value: unknown): number {
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\s/g, '').includes(',')
      ? value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
      : value.trim().replace(/\s/g, '')
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/\s/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstPositiveMoney(...values: unknown[]): number {
  return values.map(toMoney).find(value => value > 0) || 0;
}

function temPrecisaoDeCentavos(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7;
}

function novaChaveMovimentoCaixa(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, caractere => {
      const aleatorio = Math.floor(Math.random() * 16);
      return (caractere === 'x' ? aleatorio : (aleatorio & 0x3) | 0x8).toString(16);
    });
}

async function inserirMovimentoCaixaUmaVez(payload: Record<string, unknown>): Promise<void> {
  const { error } = await (supabase.from('lancamentos') as any).insert(payload);
  if (!error) return;

  // Se a resposta da gravação se perdeu, a mesma chave (id) permite conferir
  // se o banco já confirmou esse movimento antes de o usuário tentar de novo.
  const { data: existente, error: erroLeitura } = await (supabase.from('lancamentos') as any)
    .select('id, tipo, valor, descricao, forma_pagamento, categoria, data, data_vencimento, clinica_id')
    .eq('id', payload.id)
    .eq('clinica_id', payload.clinica_id)
    .maybeSingle();

  if (!erroLeitura && existente) {
    const mesmoMovimento = existente.tipo === payload.tipo
      && Number(existente.valor) === Number(payload.valor)
      && existente.descricao === payload.descricao
      && existente.forma_pagamento === payload.forma_pagamento
      && existente.categoria === payload.categoria
      && existente.data === payload.data
      && existente.data_vencimento === payload.data_vencimento;
    if (mesmoMovimento) return;
    throw new Error('Já existe um lançamento associado a esta tentativa com outros dados. Atualize o caixa antes de registrar outro movimento.');
  }

  throw error;
}

function salvarEstadoLocalCaixa(estado: unknown, userId?: string | null, clinicaId?: string | null): boolean {
  const registros = [
    userId ? [`caixa_estado_${userId}`, estado] as const : null,
    clinicaId ? [`caixa_estado_clinica_${clinicaId}`, estado] as const : null,
  ].filter(Boolean) as Array<readonly [string, unknown]>;
  let sucesso = true;
  for (const [chave, valor] of registros) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { sucesso = false; }
  }
  return sucesso;
}

function limparEstadoLocalCaixa(userId?: string | null, clinicaId?: string | null): boolean {
  const chaves = [
    userId ? `caixa_estado_${userId}` : null,
    clinicaId ? `caixa_estado_clinica_${clinicaId}` : null,
  ].filter(Boolean) as string[];
  let sucesso = true;
  for (const chave of chaves) {
    try { localStorage.removeItem(chave); } catch { sucesso = false; }
  }
  return sucesso;
}

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

const cardVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' as const },
  }),
};

interface ProdutoCarrinho {
  id: string;
  nome: string;
  valor: number;
  quantidade: number;
  quantidadeDisponivel?: number;
  origem: 'consulta' | 'exame' | 'produto' | 'manual';
}

export default function CaixaDiario() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [activeTab, setActiveTab] = useState('hoje');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAbertura, setShowAbertura] = useState(false);
  const [showFechamento, setShowFechamento] = useState(false);
  const [showLancamento, setShowLancamento] = useState(false);
  const [showSangria, setShowSangria] = useState(false);
  const [showSuprimento, setShowSuprimento] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editLanc, setEditLanc] = useState<Lancamento | null>(null);
  const [editForm, setEditForm] = useState({ descricao: '', valor: '', forma_pagamento: 'dinheiro' as FormaPagamento });
  const [showDetalhesCaixa, setShowDetalhesCaixa] = useState<CaixaDiarioType | null>(null);
  const [caixaParaFechar, setCaixaParaFechar] = useState<CaixaDiarioType | null>(null);

  const [valorAbertura, setValorAbertura] = useState('');
  const [valorFechamento, setValorFechamento] = useState('');
  const [showReabertura, setShowReabertura] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState('');
  const [obsFechamento, setObsFechamento] = useState('');

  // POS state
  const [carrinho, setCarrinho] = useState<ProdutoCarrinho[]>([]);
  const [catalogoTab, setCatalogoTab] = useState<'consultas' | 'exames' | 'produtos' | 'manual'>('consultas');
  const [catalogoSearch, setCatalogoSearch] = useState('');
  const [lancFormaPagamento, setLancFormaPagamento] = useState<FormaPagamento>('dinheiro');
  const [lancDesconto, setLancDesconto] = useState('');
  const [manualNome, setManualNome] = useState('');
  const [manualValor, setManualValor] = useState('');

  // Paciente vinculado à venda (opcional)
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [pacienteNome, setPacienteNome] = useState<string>('');
  const [pacienteSearch, setPacienteSearch] = useState('');
  const [pacientePopoverOpen, setPacientePopoverOpen] = useState(false);
  const posIdempotenciaRef = useRef<{ fingerprint: string; chave: string } | null>(null);
  const sangriaIdempotenciaRef = useRef<{ clinicaId: string; id: string } | null>(null);
  const suprimentoIdempotenciaRef = useRef<{ clinicaId: string; id: string } | null>(null);

  const [lancamentoForm, setLancamentoForm] = useState({
    tipo: 'receita' as LancamentoTipo,
    valor: '',
    descricao: '',
    forma_pagamento: 'dinheiro' as FormaPagamento,
  });

  const [sangriaForm, setSangriaForm] = useState({ valor: '', motivo: '' });
  const [suprimentoForm, setSuprimentoForm] = useState({ valor: '', descricao: '' });

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

  const caixaEventosId = showDetalhesCaixa?.id || caixaHoje?.id;
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
  const lancamentosExcederamLimite = Boolean(lancamentosData?.excedeuLimite);

  // Catálogo de tipos de consulta
  const { data: tiposConsulta = [], isLoading: carregandoTiposConsulta, isError: erroTiposConsulta, refetch: recarregarTiposConsulta } = useQuery({
    queryKey: ['tipos-consulta-caixa', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data, error } = await supabase
        .from('tipos_consulta')
        .select('id, nome, valor_particular')
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id && showLancamento,
  });

  // Catálogo de produtos (estoque com valor_venda)
  const { data: produtosEstoque = [], isLoading: carregandoProdutos, isError: erroProdutos, refetch: recarregarProdutos } = useQuery({
    queryKey: ['produtos-caixa', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data, error } = await supabase
        .from('estoque')
        .select('id, nome, categoria, valor_venda, quantidade, validade')
        .eq('clinica_id', profile.clinica_id)
        .gt('quantidade', 0)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id && showLancamento,
  });

  // Catálogo de venda direta: preço particular/configurado ou preço de venda.
  // Preços de convênio não entram aqui porque o PDV não seleciona convênio;
  // usar um deles sem contexto poderia cobrar o valor de outro plano.
  const { data: examesCatalogo = [], isLoading: carregandoExames, isError: erroExames, refetch: recarregarExames } = useQuery({
    queryKey: ['exames-caixa', profile?.clinica_id, profile?.id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const itemsByName = new Map<string, { id: string; nome: string; valor: number }>();
      const normalizarNome = (nome: unknown) => String(nome || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
        .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

      // 1. Preços internos salvos em configuracoes_clinica
      let cfgRows: any[] = [];
      let erroConfiguracaoInterna: unknown = null;
      if (profile?.clinica_id) {
        const { data, error } = await (supabase as any)
          .from('configuracoes_clinica')
          .select('valor, updated_at')
          .eq('chave', 'precos_exames_internos')
          .eq('clinica_id', profile.clinica_id)
          .order('updated_at', { ascending: false })
          .limit(1);
        cfgRows = data || [];
        erroConfiguracaoInterna = error;
      }
      if (cfgRows.length === 0 && profile?.id) {
        const { data, error } = await (supabase as any)
          .from('configuracoes_clinica')
          .select('valor, updated_at')
          .eq('chave', 'precos_exames_internos')
          .eq('user_id', profile.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        cfgRows = data || [];
        if (error) throw error;
      }
      if (cfgRows.length === 0 && erroConfiguracaoInterna) throw erroConfiguracaoInterna;
      const internalPrices = cfgRows[0]?.valor;
      if (Array.isArray(internalPrices)) {
        internalPrices.forEach((e: any) => {
          const valor = toMoney(e.valor);
          if (e.nome && valor > 0) {
            const nomeNormalizado = normalizarNome(e.nome);
            if (nomeNormalizado && !itemsByName.has(nomeNormalizado)) {
              itemsByName.set(nomeNormalizado, { id: `interno-${nomeNormalizado}`, nome: e.nome, valor });
            }
          }
        });
      }

      // O catálogo estruturado só fornece preço particular/de venda e serve
      // como fallback quando a clínica ainda não mantém a lista interna.
      const { data: catalogoExames, error: erroCatalogoExames } = await supabase
        .from('tipo_exames_catalog')
        .select('id, nome, preco_venda')
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true);
      if (erroCatalogoExames) throw erroCatalogoExames;
      if (catalogoExames) {
        catalogoExames.forEach((e: any) => {
          const valor = firstPositiveMoney(e.preco_venda);
          const nomeNormalizado = normalizarNome(e.nome);
          if (nomeNormalizado && !itemsByName.has(nomeNormalizado) && Number.isFinite(valor) && valor > 0) {
            itemsByName.set(nomeNormalizado, { id: e.id, nome: e.nome, valor });
          }
        });
      }

      return [...itemsByName.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    },
    enabled: !!profile?.clinica_id && showLancamento,
  });

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

  // Pacientes (busca para vincular à venda)
  const pacienteBuscaQuery = useBuscaPacientes(pacienteSearch, {
    limite: 20,
    enabled: pacientePopoverOpen,
  });
  const buscandoPacientes = pacienteBuscaQuery.isFetching || pacienteBuscaQuery.isPlaceholderData || pacienteBuscaQuery.isDebouncing;
  const pacientesBusca = buscandoPacientes ? [] : pacienteBuscaQuery.data?.pacientes ?? [];

  // Lançamentos do caixa em detalhe
  const { data: lancamentosDetalheData, isLoading: loadingLancamentosDetalhe, isError: erroLancamentosDetalhe, refetch: recarregarLancamentosDetalhe } = useQuery({
    queryKey: ['lancamentos-detalhe', profile?.id ?? null, profile?.clinica_id ?? null, showDetalhesCaixa?.data],
    queryFn: async (): Promise<{ movimentos: Lancamento[]; excedeuLimite: boolean }> => {
      if (!showDetalhesCaixa?.data || !profile?.clinica_id) return { movimentos: [], excedeuLimite: false };
      const rows = await buscarEmBlocos<Lancamento>(
        () => supabase.rpc('movimentos_caixa_diario', { p_data: showDetalhesCaixa.data })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
        { teto: LIMITE_BUSCA_EM_BLOCOS + 1 },
      );
      return {
        movimentos: rows.slice(0, LIMITE_BUSCA_EM_BLOCOS),
        excedeuLimite: rows.length > LIMITE_BUSCA_EM_BLOCOS,
      };
    },
    enabled: !!showDetalhesCaixa?.data,
  });
  const lancamentosDetalhe = lancamentosDetalheData?.movimentos ?? SEM_LANCAMENTOS;
  const lancamentosDetalheExcederamLimite = Boolean(lancamentosDetalheData?.excedeuLimite);



  // ─── Calculations ───────────────────────────────
  const totais = useMemo(() => {
    return calcularTotaisCaixa(caixaHoje?.valor_abertura || 0, lancamentos);
  }, [lancamentos, caixaHoje]);

  const totaisFechamento = useMemo(() => {
    if (!caixaParaFechar || caixaParaFechar.id === caixaHoje?.id) return totais;
    return calcularTotaisCaixa(caixaParaFechar.valor_abertura, lancamentosDetalhe);
  }, [caixaParaFechar, caixaHoje?.id, lancamentosDetalhe, totais]);

  const saldoEsperadoGaveta = useMemo(() => {
    if (caixaParaFechar && caixaParaFechar.id !== caixaHoje?.id) {
      return calcularSaldoGaveta(caixaParaFechar.valor_abertura, lancamentosDetalhe);
    }
    return calcularSaldoGaveta(caixaHoje?.valor_abertura || 0, lancamentos);
  }, [caixaParaFechar, caixaHoje?.id, caixaHoje?.valor_abertura, lancamentosDetalhe, lancamentos]);

  const breakdownFormas = useMemo(() => {
    const formas: Record<string, number> = {};
    lancamentos.filter(l => l.tipo === 'receita').forEach(l => {
      const key = l.forma_pagamento?.replace('cartao_', '') || 'outros';
      formas[key] = (formas[key] || 0) + (l.valor || 0);
    });
    return formas;
  }, [lancamentos]);

  // Catálogo filtrado
  const consultasFiltradas = useMemo(() => {
    const q = catalogoSearch.toLowerCase();
    return tiposConsulta.filter((tc: any) =>
      !q || tc.nome?.toLowerCase().includes(q)
    );
  }, [tiposConsulta, catalogoSearch]);

  const produtosFiltrados = useMemo(() => {
    const q = catalogoSearch.toLowerCase();
    return produtosEstoque.filter((p: any) => (!p.validade || p.validade >= today) && (
      !q || p.nome?.toLowerCase().includes(q) || p.categoria?.toLowerCase().includes(q)
    ));
  }, [produtosEstoque, catalogoSearch, today]);
  const temProdutoVencidoNaBusca = useMemo(() => {
    const q = catalogoSearch.toLowerCase();
    return produtosEstoque.some((p: any) => p.validade && p.validade < today &&
      (!q || p.nome?.toLowerCase().includes(q) || p.categoria?.toLowerCase().includes(q)));
  }, [produtosEstoque, catalogoSearch, today]);

  const examesFiltrados = useMemo(() => {
    const q = catalogoSearch.toLowerCase();
    return examesCatalogo.filter((e: any) =>
      !q || e.nome?.toLowerCase().includes(q)
    );
  }, [examesCatalogo, catalogoSearch]);

  // Cart helpers
  const addToCart = (item: Omit<ProdutoCarrinho, 'quantidade'>) => {
    const valor = toMoney(item.valor);
    if (valor <= 0) {
      toast.error(`O item "${item.nome}" não possui preço cadastrado.`);
      return;
    }
    const existente = carrinho.find(p => p.id === item.id && p.origem === item.origem);
    if (item.origem === 'produto' && (item.quantidadeDisponivel ?? 0) <= (existente?.quantidade ?? 0)) {
      toast.error((item.quantidadeDisponivel ?? 0) <= 0
        ? `"${item.nome}" está sem estoque disponível.`
        : `Há somente ${item.quantidadeDisponivel} unidade(s) de "${item.nome}" disponível(is).`);
      return;
    }
    setCarrinho(prev => {
      const existing = prev.find(p => p.id === item.id && p.origem === item.origem);
      if (existing) {
        return prev.map(p => p.id === item.id && p.origem === item.origem
          ? { ...p, quantidade: p.quantidade + 1 }
          : p
        );
      }
      return [...prev, { ...item, valor, quantidade: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCarrinho(prev => prev.filter(p => p.id !== id));
  };

  const updateCartQty = (id: string, qty: number) => {
    if (qty <= 0) return removeFromCart(id);
    const item = carrinho.find(p => p.id === id);
    if (item?.origem === 'produto' && qty > (item.quantidadeDisponivel ?? 0)) {
      toast.error(`Há somente ${item.quantidadeDisponivel ?? 0} unidade(s) de "${item.nome}" disponível(is).`);
      return;
    }
    setCarrinho(prev => prev.map(p => p.id === id ? { ...p, quantidade: qty } : p));
  };

  const carrinhoSubtotal = useMemo(
    () => carrinho.reduce((s, i) => s + i.valor * i.quantidade, 0),
    [carrinho],
  );
  const descontoInformado = lancDesconto.trim() === '' ? 0 : parseMoneyInput(lancDesconto);
  const descontoInvalido = descontoInformado === null
    || descontoInformado < 0
    || descontoInformado > carrinhoSubtotal
    || (carrinhoSubtotal > 0 && descontoInformado >= carrinhoSubtotal)
    || !temPrecisaoDeCentavos(descontoInformado);
  const carrinhoTotal = Math.max(0, carrinhoSubtotal - (descontoInformado ?? 0));

  const resetPOS = () => {
    setCarrinho([]);
    setCatalogoSearch('');
    setLancFormaPagamento('dinheiro');
    setLancDesconto('');
    setManualNome('');
    setManualValor('');
    setCatalogoTab('consultas');
    setPacienteId(null);
    setPacienteNome('');
    setPacienteSearch('');
  };

  const lancamentosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return lancamentos;
    const q = searchTerm.toLowerCase();
    return lancamentos.filter(l =>
      l.descricao.toLowerCase().includes(q) || l.tipo.includes(q)
    );
  }, [lancamentos, searchTerm]);

  const valorAberturaInformado = parseMoneyInput(valorAbertura);
  const aberturaInvalida = valorAberturaInformado === null
    || !Number.isFinite(valorAberturaInformado)
    || valorAberturaInformado < 0
    || !temPrecisaoDeCentavos(valorAberturaInformado);

  // ─── Mutations ──────────────────────────────────
  const abrirCaixaMutation = useMutation({
    mutationFn: async (valor: number) => {
      if (!Number.isFinite(valor) || valor < 0 || !temPrecisaoDeCentavos(valor)) {
        throw new Error('Informe o valor inicial do caixa, igual ou maior que zero e com até duas casas decimais.');
      }
      const { data, error } = await supabase.rpc('abrir_caixa_diario', { p_valor_abertura: valor });
      if (error) throw error;
      validarResultadoRpcCaixa(data);
      return valor;
    },
    onSuccess: (valorConfirmado) => {
      // Sync state to localStorage so Recepcao picks it up instantly
      const estado = { aberto: true, data: today, valorAbertura: valorConfirmado, operador: profile?.nome };
      const estadoLocalSalvo = salvarEstadoLocalCaixa(estado, profile?.id, profile?.clinica_id);

      toast.success('Caixa aberto com sucesso!');
      if (!estadoLocalSalvo) toast.warning('O caixa foi aberto, mas a Recepção pode precisar atualizar o estado direto do sistema. Recarregue a tela da Recepção.');
      setShowAbertura(false);
      setValorAbertura('');
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
      toast.error(e?.message || 'Erro ao abrir caixa');
    },
  });

  const fecharCaixaMutation = useMutation({
    mutationFn: async ({ caixa: caixaSolicitado, valor, observacoes }: { caixa?: CaixaDiarioType; valor: number | null; observacoes?: string | null }) => {
      const caixa = caixaSolicitado || caixaHoje;
      if (!caixa) throw new Error('Não há um caixa para fechar. Atualize a tela e tente novamente.');
      if (valor === null || !Number.isFinite(valor) || valor < 0) throw new Error('Informe um valor contado válido para fechar o caixa');
      const { data, error } = await supabase.rpc('fechar_caixa_diario', {
        p_caixa_id: caixa.id,
        p_valor_contado: valor,
        p_observacoes: observacoes ?? (obsFechamento || null),
      });
      if (error) throw error;
      validarResultadoRpcCaixa(data);
      return { caixa, valor };
    },
    onSuccess: ({ caixa, valor }) => {
      // A close from the history does not change today's reception state.
      let estadoLocalLimpo = true;
      if (caixa.data === today) {
        estadoLocalLimpo = limparEstadoLocalCaixa(profile?.id, profile?.clinica_id);
      }
      setShowDetalhesCaixa(current => current?.id === caixa.id ? {
        ...current,
        aberto: false,
        valor_fechamento: valor,
        operador_fechamento: profile?.nome || current.operador_fechamento,
      } : current);

      toast.success('Caixa fechado com sucesso!');
      if (!estadoLocalLimpo) toast.warning('O caixa foi fechado, mas a Recepção pode exibir o estado anterior até atualizar. Recarregue a tela da Recepção.');
      setShowFechamento(false);
      setValorFechamento('');
      setObsFechamento('');
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['historico-caixas'] });
      queryClient.invalidateQueries({ queryKey: ['caixas-abertos-antigos'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-detalhe'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
      toast.error(e?.message || 'Erro ao fechar caixa');
    },
  });

  const reabrirCaixaMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reabrir_caixa_diario', {
        p_motivo: motivoReabertura.trim(),
      });
      if (error) throw error;
      validarResultadoRpcCaixa(data);
    },
    onSuccess: () => {
      const estado = { aberto: true, data: today, valorAbertura: caixaHoje?.valor_abertura || 0, operador: caixaHoje?.operador_abertura };
      const estadoLocalSalvo = salvarEstadoLocalCaixa(estado, profile?.id, profile?.clinica_id);
      toast.success('Caixa reaberto', { description: 'O fechamento anterior permanece registrado no histórico.' });
      if (!estadoLocalSalvo) toast.warning('O caixa foi reaberto, mas a Recepção pode precisar atualizar o estado direto do sistema. Recarregue a tela da Recepção.');
      setShowReabertura(false);
      setMotivoReabertura('');
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
      toast.error(e?.message || 'Erro ao reabrir caixa');
    },
  });

  const adicionarLancamentoMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !caixaHoje?.id) throw new Error('Caixa não está aberto');
      if (carrinho.length === 0) throw new Error('Adicione pelo menos um item');
      if (descontoInvalido) throw new Error('O desconto deve ser menor que o subtotal para manter um valor de venda maior que zero.');
      if (!Number.isFinite(carrinhoTotal) || carrinhoTotal <= 0) throw new Error('O total da venda deve ser maior que zero');
      if (carrinho.some(item => item.origem === 'exame') && !pacienteId) {
        throw new Error('Selecione o paciente para registrar os exames vendidos no prontuário.');
      }
      const descricao = carrinho.map(i => `${i.nome}${i.quantidade > 1 ? ` x${i.quantidade}` : ''}`).join(', ');
      const valorCobrado = carrinho.reduce((sum, item) => sum + item.valor * item.quantidade, 0);
      const fingerprint = JSON.stringify({
        clinic: profile.clinica_id,
        patient: pacienteId,
        date: today,
        items: carrinho.map(({ id, origem, quantidade, valor }) => ({ id, origem, quantidade, valor })),
        forma: lancFormaPagamento,
        pago: carrinhoTotal,
      });
      if (posIdempotenciaRef.current?.fingerprint !== fingerprint) {
        const chave = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        posIdempotenciaRef.current = { fingerprint, chave };
      }
      const produtos = carrinho
        .filter(item => item.origem === 'produto')
        .map(item => ({ item_id: item.id, quantidade: item.quantidade }));
      const exames = carrinho
        .filter(item => item.origem === 'exame')
        .map(item => ({ nome: item.nome, quantidade: item.quantidade, valor: item.valor }));
      const idempotencia = posIdempotenciaRef.current;
      if (!idempotencia) throw new Error('Não foi possível proteger esta venda contra duplicidade. Tente novamente.');
      const { data, error } = await (supabase as any).rpc('registrar_venda_pdv', {
        p_chave: idempotencia.chave,
        p_clinica_id: profile.clinica_id,
        p_paciente_id: pacienteId || null,
        p_data: today,
        p_descricao: descricao,
        p_valor_cobrado: Number(valorCobrado.toFixed(2)),
        p_valor_pago: Number(carrinhoTotal.toFixed(2)),
        p_forma_pagamento: lancFormaPagamento,
        p_produtos: produtos,
        p_exames: exames,
      });
      if (error) throw error;
      const venda = Array.isArray(data) ? data[0] : data;
      if (!venda?.lancamento_id) throw new Error('O caixa não confirmou o registro da venda. Atualize a tela antes de tentar novamente.');

      return { jaRegistrada: Boolean(venda.ja_registrada) };
    },
    onSuccess: (resultado) => {
      posIdempotenciaRef.current = null;
      toast.success(resultado?.jaRegistrada
        ? 'Venda já estava registrada. O estoque não foi baixado novamente.'
        : pacienteId ? 'Venda registrada e vinculada ao paciente!' : 'Venda registrada!');
      setShowLancamento(false);
      resetPOS();
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      queryClient.invalidateQueries({ queryKey: ['exames'] });
      queryClient.invalidateQueries({ queryKey: ['produtos-caixa', profile?.clinica_id] });
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
    },
    onError: (e: any) => {
      // Uma falha de rede pode ocorrer depois do RPC ter confirmado a venda;
      // reconcilia estoque e caixa antes que o usuário repita a operação.
      queryClient.invalidateQueries({ queryKey: ['produtos-caixa', profile?.clinica_id] });
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      toast.error(e?.message || 'Erro');
    },
  });

  const adicionarSangriaMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !caixaHoje?.id) throw new Error('Caixa não está aberto');
      const valor = parseMoneyInput(sangriaForm.valor);
      if (valor === null || valor <= 0 || !temPrecisaoDeCentavos(valor)) {
        throw new Error('Informe um valor válido, maior que zero e com até duas casas decimais.');
      }
      if (!sangriaForm.motivo.trim()) throw new Error('Motivo obrigatório');
      if (sangriaIdempotenciaRef.current?.clinicaId !== profile.clinica_id) {
        sangriaIdempotenciaRef.current = { clinicaId: profile.clinica_id, id: novaChaveMovimentoCaixa() };
      }
      const id = sangriaIdempotenciaRef.current.id;
      await inserirMovimentoCaixaUmaVez({
        id,
        tipo: 'sangria', valor,
        descricao: `Sangria — ${sangriaForm.motivo}`, forma_pagamento: 'dinheiro',
        categoria: 'sangria', status: 'pago', data_vencimento: today, data: today, clinica_id: profile.clinica_id,
      });
    },
    onSuccess: () => {
      sangriaIdempotenciaRef.current = null;
      toast.success('Sangria registrada!');
      setShowSangria(false);
      setSangriaForm({ valor: '', motivo: '' });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      toast.error(e?.message || 'Não foi possível confirmar a sangria.', {
        description: 'Se a conexão caiu, tente novamente sem alterar os dados; o caixa verificará a tentativa antes de gravar outro movimento.',
      });
    },
  });

  const adicionarSuprimentoMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !caixaHoje?.id) throw new Error('Caixa não está aberto');
      const valor = parseMoneyInput(suprimentoForm.valor);
      if (valor === null || valor <= 0 || !temPrecisaoDeCentavos(valor)) {
        throw new Error('Informe um valor válido, maior que zero e com até duas casas decimais.');
      }
      if (suprimentoIdempotenciaRef.current?.clinicaId !== profile.clinica_id) {
        suprimentoIdempotenciaRef.current = { clinicaId: profile.clinica_id, id: novaChaveMovimentoCaixa() };
      }
      const id = suprimentoIdempotenciaRef.current.id;
      await inserirMovimentoCaixaUmaVez({
        id,
        tipo: 'suprimento', valor,
        descricao: suprimentoForm.descricao.trim() || 'Suprimento de Caixa', forma_pagamento: 'dinheiro',
        categoria: 'suprimento', status: 'pago', data_vencimento: today, data: today, clinica_id: profile.clinica_id,
      });
    },
    onSuccess: () => {
      suprimentoIdempotenciaRef.current = null;
      toast.success('Suprimento adicionado!');
      setShowSuprimento(false);
      setSuprimentoForm({ valor: '', descricao: '' });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      toast.error(e?.message || 'Não foi possível confirmar o suprimento.', {
        description: 'Se a conexão caiu, tente novamente sem alterar os dados; o caixa verificará a tentativa antes de gravar outro movimento.',
      });
    },
  });

  const deletarLancamentoMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
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

  const editarLancamentoMutation = useMutation({
    mutationFn: async (payload: { id: string; descricao: string; valor: number; forma_pagamento: FormaPagamento }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      const { data, error } = await supabase
        .from('lancamentos')
        .update({ descricao: payload.descricao, valor: payload.valor, forma_pagamento: payload.forma_pagamento })
        .eq('id', payload.id).eq('clinica_id', profile.clinica_id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para editar este lançamento.');
    },
    onSuccess: () => {
      toast.success('Lançamento atualizado!');
      setEditLanc(null);
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao editar'),
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

  if (!profile?.clinica_id) {
    return <SectionFallback rows={5} />;
  }

  if (loadingCaixa || (!!caixaHoje?.data && loadingLanc)) {
    return (
      <div className="space-y-6 p-4 md:p-6">
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

  // Fechamento com diferença exige justificativa. Antes o botão seguava
  // habilitado com a observação opcional: caixa que não batia fechava em
  // silêncio, e a divergência morria com o dia — sem rastro de explicação.
  const contadoFechamento = parseValorContado(valorFechamento);
  const fechamentoNaoBate = Boolean(
    contadoFechamento !== null &&
    !mesmoValor(contadoFechamento, saldoEsperadoGaveta),
  );
  const valorSangriaInformado = parseMoneyInput(sangriaForm.valor);
  const sangriaInvalida = valorSangriaInformado === null
    || !Number.isFinite(valorSangriaInformado)
    || valorSangriaInformado <= 0
    || !temPrecisaoDeCentavos(valorSangriaInformado);
  const valorSuprimentoInformado = parseMoneyInput(suprimentoForm.valor);
  const suprimentoInvalido = valorSuprimentoInformado === null
    || !Number.isFinite(valorSuprimentoInformado)
    || valorSuprimentoInformado <= 0
    || !temPrecisaoDeCentavos(valorSuprimentoInformado);
  const valorManualInformado = parseMoneyInput(manualValor);
  const valorManualInvalido = valorManualInformado === null
    || valorManualInformado <= 0
    || !temPrecisaoDeCentavos(valorManualInformado);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2.5 rounded-xl',
            isOpen ? 'bg-success/10' : 'bg-muted'
          )}>
            <DollarSign className={cn('h-6 w-6', isOpen ? 'text-success' : 'text-muted-foreground')} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Caixa Diário</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge className={cn(
            'gap-1.5 px-3 py-1 text-xs font-medium',
            isOpen
              ? 'bg-success/10 text-success border-success/20'
              : 'bg-muted text-muted-foreground border-border'
          )}>
            <span className={cn('h-2 w-2 rounded-full', isOpen ? 'bg-success animate-pulse' : 'bg-muted-foreground')} />
            {isOpen ? 'Caixa Aberto' : 'Caixa Fechado'}
          </Badge>
          {isOpen && caixaHoje?.operador_abertura && (
            <span className="text-xs text-muted-foreground">por {caixaHoje.operador_abertura}</span>
          )}
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:min-w-0 gap-0.5">
            {[
              { v: 'hoje', l: 'Caixa Hoje', i: Receipt },
              { v: 'historico', l: 'Histórico', i: History },
              { v: 'receber', l: 'Contas a Receber', i: ArrowUpRight },
              { v: 'pagar', l: 'Contas a Pagar', i: ArrowDownRight },
              { v: 'fluxo', l: 'Fluxo de Caixa', i: TrendingUp },
              { v: 'precos', l: 'Tabela de Preços', i: Tag },
              { v: 'tipos', l: 'Tipos de Consulta', i: Stethoscope },
              { v: 'relatorios', l: 'Relatórios', i: ClipboardList },
            ].map(tab => (
              <TabsTrigger key={tab.v} value={tab.v} className="gap-1.5 text-xs whitespace-nowrap px-3">
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
                  <Button size="sm" variant="outline" onClick={() => { setCaixaParaFechar(caixa); setShowDetalhesCaixa(caixa); }}>
                    Revisar e regularizar
                  </Button>
                </div>
              ))}
            </div>
          )}
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {!caixaHoje ? (
              <Button onClick={() => setShowAbertura(true)} className="gap-2 bg-success hover:bg-success/90 text-success-foreground">
                <Unlock className="h-4 w-4" /> Abrir Caixa
              </Button>
            ) : isOpen ? (
              <>
                <Button onClick={() => setShowLancamento(true)} className="gap-2">
                  <ShoppingCart className="h-4 w-4" /> Nova Venda
                </Button>
                <Button onClick={() => setShowSangria(true)} variant="outline" className="gap-2 border-warning/30 text-warning hover:bg-warning/10">
                  <ArrowDownToLine className="h-4 w-4" /> Sangria
                </Button>
                <Button onClick={() => setShowSuprimento(true)} variant="outline" className="gap-2 border-info/30 text-info hover:bg-info/10">
                  <ArrowUpFromLine className="h-4 w-4" /> Suprimento
                </Button>
                <Button onClick={() => { setCaixaParaFechar(caixaHoje); setValorFechamento(''); setObsFechamento(''); setShowFechamento(true); }} disabled={loadingLanc || lancamentosExcederamLimite} variant="destructive" className="gap-2 ml-auto">
                  <Lock className="h-4 w-4" /> Fechar Caixa
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground" role="status">Caixa encerrado. Consulta somente leitura.</p>
                {podeReabrir ? (
                  <Button variant="outline" className="gap-2" onClick={() => setShowReabertura(true)}>
                    <Unlock className="h-4 w-4" /> Reabrir caixa
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Peça a um administrador ou responsável financeiro para reabrir o caixa.</p>
                )}
              </>
            )}
          </div>

          {/* KPI Cards */}
          {isOpen && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: 'Abertura', value: caixaHoje?.valor_abertura || 0, icon: Unlock, color: 'text-muted-foreground', bgIcon: 'bg-muted' },
                { label: 'Receitas', value: totais.receita, icon: TrendingUp, color: 'text-success', bgIcon: 'bg-success/10' },
                { label: 'Despesas', value: totais.despesa, icon: TrendingDown, color: 'text-destructive', bgIcon: 'bg-destructive/10' },
                { label: 'Sangrias', value: totais.sangria, icon: ArrowDownToLine, color: 'text-warning', bgIcon: 'bg-warning/10' },
                { label: 'Resultado financeiro', value: totais.final, icon: DollarSign, color: totais.final >= 0 ? 'text-success' : 'text-destructive', bgIcon: 'bg-primary/10' },
                { label: 'Dinheiro esperado', value: saldoEsperadoGaveta, icon: Banknote, color: saldoEsperadoGaveta >= 0 ? 'text-success' : 'text-destructive', bgIcon: 'bg-success/10' },
              ].map((kpi, i) => (
                <motion.div key={kpi.label} custom={i} variants={cardVariant} initial="hidden" animate="visible">
                  <Card className={cn(i === 4 && 'border-primary/30 shadow-sm')}>
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn('p-1.5 rounded-lg', kpi.bgIcon)}>
                          <kpi.icon className={cn('h-4 w-4', kpi.color)} />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                      </div>
                      <p className={cn('text-xl font-bold tabular-nums', kpi.color)}>{fmt(kpi.value)}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {/* Payment Breakdown */}
          {isOpen && totais.receita > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Receitas por Forma de Pagamento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(breakdownFormas).map(([forma, valor]) => {
                      const Icon = FORMA_ICONS[forma] || Banknote;
                      const pct = totais.receita > 0 ? ((valor / totais.receita) * 100).toFixed(0) : '0';
                      return (
                        <div key={forma} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="p-2 rounded-lg bg-background">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground capitalize">{FORMA_LABELS[forma] || forma}</p>
                            <p className="text-sm font-bold tabular-nums">{fmt(valor)}</p>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">{pct}%</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Lançamentos Table */}
          {isOpen && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    Movimentações ({lancamentos.length})
                  </CardTitle>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8 w-52 h-9 text-sm" placeholder="Buscar..." value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)} />
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
                  <div className="text-center py-10 text-muted-foreground">
                    <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Nenhuma movimentação</p>
                    <p className="text-xs mt-1">Registre receitas, despesas ou sangrias</p>
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
                        <AnimatePresence>
                          {lancamentosFiltrados.map((l) => {
                            const cfg = getTipoConfig(l.tipo);
                            const Icon = cfg.icon;
                            const FormaIcon = FORMA_ICONS[l.forma_pagamento] || Banknote;
                            const valorAssinado = (l.tipo === 'receita' || l.tipo === 'suprimento') ? l.valor : -l.valor;
                            return (
                              <motion.tr key={l.id}
                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                              >
                                <TableCell>
                                  <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium', cfg.bg, cfg.color)}>
                                    <Icon className="h-3 w-3" /> {cfg.label}
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium text-sm">{l.descricao}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <FormaIcon className="h-3.5 w-3.5" />
                                    {FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento}
                                  </div>
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
                                        <Button variant="ghost" size="icon" className="h-7 w-7"
                                          title="Imprimir" onClick={() => printReceiptPdf(buildReceiptData(l))}>
                                          <Printer className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7"
                                          title="Download" onClick={() => downloadReceiptPdf(buildReceiptData(l))}>
                                          <Download className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                    {l.tipo !== 'receita' && !l.origem_pagamento && (
                                      <>
                                        <Button variant="ghost" size="icon" aria-label="Excluir lançamento" className="h-7 w-7 text-destructive hover:text-destructive"
                                          onClick={() => setConfirmDelete(l.id)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label="Editar lançamento" className="h-7 w-7"
                                          onClick={() => {
                                            setEditLanc(l);
                                            setEditForm({
                                              descricao: l.descricao || '',
                                              valor: String(l.valor ?? ''),
                                              forma_pagamento: l.forma_pagamento,
                                            });
                                          }}>
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </motion.tr>
                            );
                          })}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Empty state when caixa is closed */}
          {!isOpen && !caixaHoje && (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <div className="p-4 rounded-full bg-muted w-fit mx-auto mb-4">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Caixa não aberto hoje</h3>
                <p className="text-sm text-muted-foreground mb-4">Abra o caixa para iniciar as movimentações do dia</p>
                <Button onClick={() => setShowAbertura(true)} className="gap-2 bg-success hover:bg-success/90 text-success-foreground">
                  <Unlock className="h-4 w-4" /> Abrir Caixa Agora
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Closed caixa summary */}
          {caixaHoje && !isOpen && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" /> Resumo do Caixa Fechado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-muted-foreground text-xs">Abertura</p><p className="font-bold">{fmt(caixaHoje.valor_abertura)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Fechamento</p><p className="font-bold">{fmt(caixaHoje.valor_fechamento || 0)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Operador</p><p className="font-medium">{caixaHoje.operador_fechamento || '—'}</p></div>
                  {caixaHoje.observacoes && <div><p className="text-muted-foreground text-xs">Obs</p><p className="font-medium">{caixaHoje.observacoes}</p></div>}
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
                    <motion.div key={cx.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      role="button" tabIndex={0}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
                      onClick={() => { setCaixaParaFechar(cx); setShowDetalhesCaixa(cx); }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setCaixaParaFechar(cx);
                          setShowDetalhesCaixa(cx);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', cx.aberto ? 'bg-success/10' : 'bg-muted')}>
                          {cx.aberto ? <Unlock className="h-4 w-4 text-success" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
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
                            <Badge variant={cx.aberto ? 'default' : 'secondary'} className="text-[10px]">
                              {cx.aberto ? 'Aberto' : 'Sem fechamento'}
                            </Badge>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ FERRAMENTAS FINANCEIRAS ═══ */}
        <TabsContent value="receber" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyContasReceber />
          </Suspense>
        </TabsContent>

        <TabsContent value="pagar" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyContasPagar />
          </Suspense>
        </TabsContent>

        <TabsContent value="fluxo" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyFluxoCaixa />
          </Suspense>
        </TabsContent>

        <TabsContent value="precos" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyPrecosExames />
          </Suspense>
        </TabsContent>

        <TabsContent value="tipos" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyTiposConsulta />
          </Suspense>
        </TabsContent>

        <TabsContent value="relatorios" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyRelatorios />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOGS ═══ */}

      {/* Abrir Caixa */}
      <Dialog open={showAbertura} onOpenChange={open => {
        if (open || !abrirCaixaMutation.isPending) setShowAbertura(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-emerald-600" /> Abrir Caixa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor inicial em caixa (R$) *</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={valorAbertura} disabled={abrirCaixaMutation.isPending}
                onChange={e => setValorAbertura(e.target.value)} step="0.01" min="0" autoFocus />
              <p className="text-xs text-muted-foreground">Informe o valor contado antes de abrir. Digite 0 se não houver dinheiro na gaveta.</p>
              {valorAbertura.trim() !== '' && aberturaInvalida && (
                <p role="alert" className="text-xs text-destructive">Use um valor igual ou maior que zero, com até duas casas decimais.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={abrirCaixaMutation.isPending} onClick={() => setShowAbertura(false)}>Cancelar</Button>
            <Button onClick={() => valorAberturaInformado !== null && abrirCaixaMutation.mutate(valorAberturaInformado)}
              disabled={abrirCaixaMutation.isPending || aberturaInvalida} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {abrirCaixaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Abrir Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ PDV — Ponto de Venda ═══ */}
      <Dialog
        open={showReabertura}
        onOpenChange={(open) => {
          if (!reabrirCaixaMutation.isPending) {
            setShowReabertura(open);
            if (!open) setMotivoReabertura('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-warning" /> Reabrir caixa fechado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A reabertura fica registrada com seu nome, horário e motivo. O fechamento anterior aparece no histórico.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="motivo-reabertura-caixa">Motivo da reabertura</Label>
              <Textarea
                id="motivo-reabertura-caixa"
                value={motivoReabertura}
                onChange={event => setMotivoReabertura(event.target.value)}
                placeholder="Ex.: caixa fechado por engano; ainda há pagamentos a receber."
                rows={3}
                maxLength={500}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Mínimo 10 caracteres · {motivoReabertura.trim().length}/500</p>
            </div>
            {!podeReabrir && <p className="text-xs text-destructive">A reabertura exige perfil de administrador ou financeiro.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReabertura(false)} disabled={reabrirCaixaMutation.isPending}>Cancelar</Button>
            <Button
              onClick={() => reabrirCaixaMutation.mutate()}
              disabled={!podeReabrir || motivoReabertura.trim().length < 10 || reabrirCaixaMutation.isPending}
              className="gap-2"
            >
              {reabrirCaixaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Reabrir caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLancamento} onOpenChange={open => {
        if (!open && adicionarLancamentoMutation.isPending) return;
        setShowLancamento(open);
        if (!open) resetPOS();
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Ponto de Venda
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0 overflow-hidden">
            {/* ── Catálogo (esquerda) ── */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-9 text-sm" placeholder="Buscar consulta, exame, produto..."
                  value={catalogoSearch} onChange={e => setCatalogoSearch(e.target.value)} autoFocus />
              </div>

              <Tabs value={catalogoTab} onValueChange={v => setCatalogoTab(v as any)} className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
                  <TabsTrigger value="consultas" className="text-xs gap-1"><Stethoscope className="h-3.5 w-3.5" /> Consultas</TabsTrigger>
                  <TabsTrigger value="exames" className="text-xs gap-1"><FlaskConical className="h-3.5 w-3.5" /> Exames</TabsTrigger>
                  <TabsTrigger value="produtos" className="text-xs gap-1"><ShoppingBag className="h-3.5 w-3.5" /> Produtos</TabsTrigger>
                  <TabsTrigger value="manual" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> Manual</TabsTrigger>
                </TabsList>

                <TabsContent value="consultas" className="flex-1 overflow-y-auto mt-2 space-y-1.5 max-h-[40vh]">
                  {erroTiposConsulta ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center" role="alert">
                      <p className="text-sm text-destructive">Não foi possível carregar os tipos de consulta.</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => void recarregarTiposConsulta()}>Tentar novamente</Button>
                    </div>
                  ) : carregandoTiposConsulta ? (
                    <p className="py-8 text-center text-sm text-muted-foreground" role="status">Carregando consultas…</p>
                  ) : consultasFiltradas.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>Nenhum tipo de consulta cadastrado</p>
                      <p className="text-xs">Cadastre em Configurações → Tipos de Consulta</p>
                    </div>
                  ) : consultasFiltradas.map((tc: any) => (
                    <motion.button key={tc.id}
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      onClick={() => addToCart({ id: tc.id, nome: tc.nome, valor: tc.valor_particular || 0, origem: 'consulta' })}
                      className="w-full flex items-center justify-between p-3 rounded-lg border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-primary/10">
                          <Stethoscope className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium text-sm">{tc.nome}</span>
                      </div>
                      <span className="font-bold text-sm text-primary tabular-nums">{fmt(tc.valor_particular || 0)}</span>
                    </motion.button>
                  ))}
                </TabsContent>

                <TabsContent value="exames" className="flex-1 overflow-y-auto mt-2 space-y-1.5 max-h-[40vh]">
                  {!erroExames && !carregandoExames && examesFiltrados.length > 0 && (
                    <p className="px-1 pb-1 text-xs text-muted-foreground">Venda direta usa o preço particular cadastrado para o exame.</p>
                  )}
                  {erroExames ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center" role="alert">
                      <p className="text-sm text-destructive">Não foi possível carregar os preços dos exames.</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => void recarregarExames()}>Tentar novamente</Button>
                    </div>
                  ) : carregandoExames ? (
                    <p className="py-8 text-center text-sm text-muted-foreground" role="status">Carregando exames…</p>
                  ) : examesFiltrados.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>Nenhum exame com preço cadastrado</p>
                      <p className="text-xs">Cadastre preços em Preços de Exames</p>
                    </div>
                  ) : examesFiltrados.map((ex: any) => (
                    <motion.button key={ex.id}
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      onClick={() => addToCart({ id: ex.id, nome: ex.nome, valor: ex.valor || 0, origem: 'exame' })}
                      className="w-full flex items-center justify-between p-3 rounded-lg border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-warning/10">
                          <FlaskConical className="h-4 w-4 text-warning" />
                        </div>
                        <span className="font-medium text-sm">{ex.nome}</span>
                      </div>
                      <span className="font-bold text-sm text-primary tabular-nums">{fmt(ex.valor || 0)}</span>
                    </motion.button>
                  ))}
                </TabsContent>

                <TabsContent value="produtos" className="flex-1 overflow-y-auto mt-2 space-y-1.5 max-h-[40vh]">
                  {erroProdutos ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center" role="alert">
                      <p className="text-sm text-destructive">Não foi possível carregar o estoque para venda.</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => void recarregarProdutos()}>Tentar novamente</Button>
                    </div>
                  ) : carregandoProdutos ? (
                    <p className="py-8 text-center text-sm text-muted-foreground" role="status">Carregando produtos…</p>
                  ) : produtosFiltrados.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      {temProdutoVencidoNaBusca ? (
                        <>
                          <p>Não há produtos válidos para venda neste filtro</p>
                          <p className="text-xs">Itens vencidos não podem ser vendidos. Confira os demais produtos ou o estoque.</p>
                        </>
                      ) : (
                        <>
                          <p>Nenhum produto no estoque</p>
                          <p className="text-xs">Cadastre em Estoque</p>
                        </>
                      )}
                    </div>
                  ) : produtosFiltrados.map((p: any) => (
                    <motion.button key={p.id}
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      disabled={Number(p.quantidade) <= 0}
                      onClick={() => addToCart({ id: p.id, nome: p.nome, valor: p.valor_venda || 0, origem: 'produto', quantidadeDisponivel: Number(p.quantidade) || 0 })}
                      className="w-full flex items-center justify-between p-3 rounded-lg border hover:border-primary/40 hover:bg-primary/5 transition-all text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-info/10">
                          <ShoppingBag className="h-4 w-4 text-info" />
                        </div>
                        <div>
                          <span className="font-medium text-sm">{p.nome}</span>
                          <p className="text-[10px] text-muted-foreground">{p.categoria} · Estoque: {p.quantidade > 0 ? p.quantidade : 'sem unidades'}</p>
                        </div>
                      </div>
                      <span className="font-bold text-sm text-primary tabular-nums">{fmt(p.valor_venda || 0)}</span>
                    </motion.button>
                  ))}
                </TabsContent>

                <TabsContent value="manual" className="mt-2 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome do item *</Label>
                    <Input placeholder="Ex: Exame de sangue, Taxa extra..." value={manualNome}
                      onChange={e => setManualNome(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor (R$) *</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={manualValor}
                onChange={e => setManualValor(e.target.value)} />
                  </div>
                  {manualValor.trim() !== '' && valorManualInvalido && (
                    <p className="text-xs text-destructive" role="alert">Informe um valor maior que zero e com até duas casas decimais.</p>
                  )}
                  <Button variant="outline" className="w-full gap-2" disabled={!manualNome.trim() || valorManualInvalido}
                    onClick={() => {
                      if (valorManualInformado === null || valorManualInvalido) return;
                      addToCart({ id: `manual-${Date.now()}`, nome: manualNome, valor: valorManualInformado, origem: 'manual' });
                      setManualNome('');
                      setManualValor('');
                    }}>
                    <Plus className="h-4 w-4" /> Adicionar ao Carrinho
                  </Button>
                </TabsContent>
              </Tabs>
            </div>

            {/* ── Carrinho (direita) ── */}
            <div className="w-full md:w-80 flex flex-col border-t md:border-t-0 md:border-l pt-3 md:pt-0 md:pl-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Carrinho ({carrinho.length})
              </h3>

              {carrinho.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center text-muted-foreground py-8">
                  <div>
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">Selecione itens do catálogo</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[30vh]">
                  <AnimatePresence>
                    {carrinho.map(item => (
                      <motion.div key={item.id}
                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.nome}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{item.origem}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="icon" aria-label="Diminuir quantidade" className="h-6 w-6"
                            onClick={() => updateCartQty(item.id, item.quantidade - 1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-xs font-bold w-4 text-center">{item.quantidade}</span>
                          <Button variant="ghost" size="icon" aria-label="Aumentar quantidade" className="h-6 w-6"
                            disabled={item.origem === 'produto' && item.quantidade >= (item.quantidadeDisponivel ?? 0)}
                            onClick={() => updateCartQty(item.id, item.quantidade + 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="font-bold tabular-nums w-20 text-right">{fmt(item.valor * item.quantidade)}</span>
                          <Button variant="ghost" size="icon" aria-label="Remover item da venda" className="h-6 w-6 text-destructive"
                            onClick={() => removeFromCart(item.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              <Separator className="my-3" />

              {/* Paciente (opcional) — vincula ao prontuário */}
              <div className="space-y-1.5 mb-3">
                <Label className="text-xs flex items-center gap-1">
                  <User className="h-3 w-3" /> Paciente
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                {pacienteId ? (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{pacienteNome}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => { setPacienteId(null); setPacienteNome(''); }}
                      title="Remover paciente"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Popover open={pacientePopoverOpen} onOpenChange={setPacientePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-xs h-8 text-muted-foreground"
                      >
                        <Search className="h-3 w-3 mr-2" />
                        Vincular paciente...
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Nome, CPF ou telefone..."
                          value={pacienteSearch}
                          onValueChange={setPacienteSearch}
                        />
                        <CommandList>
                          {pacienteBuscaQuery.isError ? (
                            <div className="flex flex-col items-center gap-2 p-4 text-center text-sm text-muted-foreground">
                              <p>Não foi possível buscar pacientes.</p>
                              <Button type="button" size="sm" variant="outline" onClick={() => void pacienteBuscaQuery.refetch()}>
                                Tentar novamente
                              </Button>
                            </div>
                          ) : buscandoPacientes ? (
                            <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" /> Buscando pacientes…
                            </div>
                          ) : (
                            <>
                              {pacientesBusca.length === 0 ? <CommandEmpty>Nenhum paciente encontrado</CommandEmpty> : <CommandGroup>
                                {pacientesBusca.map((p: any) => (
                                  <CommandItem
                                    key={p.id}
                                    value={p.id}
                                    onSelect={() => {
                                      setPacienteId(p.id);
                                      setPacienteNome(p.nome_social || p.nome);
                                      setPacientePopoverOpen(false);
                                      setPacienteSearch('');
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-sm">{p.nome_social || p.nome}</span>
                                      {p.cpf && (
                                        <span className="text-[10px] text-muted-foreground">CPF: {p.cpf}</span>
                                      )}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>}
                              {pacienteBuscaQuery.data?.incompleta && (
                                <p role="status" className="border-t px-3 py-2 text-xs text-muted-foreground">
                                  Há mais pacientes. Digite mais caracteres para refinar a busca.
                                </p>
                              )}
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
                {pacienteId && carrinho.some(i => i.origem === 'exame') && (
                  <p className="text-[10px] text-muted-foreground">
                    Exames serão registrados no prontuário do paciente.
                  </p>
                )}
              </div>

              {/* Desconto */}
              <div className="space-y-1.5 mb-3">
                <Label className="text-xs">Desconto (R$)</Label>
                <Input type="text" inputMode="decimal" placeholder="0,00" value={lancDesconto}
                  onChange={e => setLancDesconto(e.target.value)} step="0.01" min="0" max={carrinhoSubtotal} className="h-8 text-sm" />
                {descontoInvalido && (
                  <p className="text-xs text-destructive" role="alert">
                    O desconto precisa ser válido e menor que o subtotal de {fmt(carrinhoSubtotal)} para manter um total acima de zero.
                  </p>
                )}
              </div>

              {/* Forma de Pagamento */}
              <div className="space-y-1.5 mb-3">
                <Label className="text-xs">Forma de Pagamento</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: 'dinheiro', l: 'Dinheiro', i: Banknote },
                    { v: 'pix', l: 'PIX', i: QrCode },
                    { v: 'credito', l: 'Crédito', i: CreditCard },
                    { v: 'debito', l: 'Débito', i: Wallet },
                    { v: 'cheque', l: 'Cheque', i: FileText },
                    { v: 'transferencia', l: 'Transf.', i: ArrowUpFromLine },
                  ] as const).map(fp => (
                    <Button key={fp.v} variant={lancFormaPagamento === fp.v ? 'default' : 'outline'}
                      size="sm" className="text-[10px] gap-1 h-8 px-2"
                      aria-pressed={lancFormaPagamento === fp.v}
                      onClick={() => setLancFormaPagamento(fp.v as FormaPagamento)}>
                      <fp.i className="h-3 w-3" /> {fp.l}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
                <p className="text-xs text-muted-foreground">Total a cobrar</p>
                <p className="text-2xl font-bold text-primary tabular-nums">{fmt(carrinhoTotal)}</p>
              </div>

              <Button onClick={() => adicionarLancamentoMutation.mutate()}
                disabled={carrinho.length === 0 || descontoInvalido || adicionarLancamentoMutation.isPending}
                className="w-full gap-2" size="lg">
                {adicionarLancamentoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Finalizar Venda
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sangria */}
      <Dialog open={showSangria} onOpenChange={open => {
        if (open || !adicionarSangriaMutation.isPending) setShowSangria(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-amber-600" /> Registrar Sangria
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={sangriaForm.valor}
                onChange={e => setSangriaForm(p => ({ ...p, valor: e.target.value }))} />
              {sangriaInvalida && (
                <p className="text-xs text-destructive" role="alert">Informe um valor maior que zero, com até duas casas decimais.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo *</Label>
              <Input placeholder="Motivo da retirada" value={sangriaForm.motivo}
                onChange={e => setSangriaForm(p => ({ ...p, motivo: e.target.value }))} />
              {!sangriaForm.motivo.trim() && (
                <p className="text-xs text-muted-foreground">O motivo fica registrado para conferência do caixa.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={adicionarSangriaMutation.isPending} onClick={() => setShowSangria(false)}>Cancelar</Button>
            <Button onClick={() => adicionarSangriaMutation.mutate()} disabled={adicionarSangriaMutation.isPending || sangriaInvalida || !sangriaForm.motivo.trim()}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
              {adicionarSangriaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar Sangria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suprimento */}
      <Dialog open={showSuprimento} onOpenChange={open => {
        if (open || !adicionarSuprimentoMutation.isPending) setShowSuprimento(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-5 w-5 text-blue-600" /> Registrar Suprimento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={suprimentoForm.valor}
                onChange={e => setSuprimentoForm(p => ({ ...p, valor: e.target.value }))} />
              {suprimentoInvalido && (
                <p className="text-xs text-destructive" role="alert">Informe um valor maior que zero, com até duas casas decimais.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input placeholder="Descrição do suprimento" value={suprimentoForm.descricao}
                onChange={e => setSuprimentoForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={adicionarSuprimentoMutation.isPending} onClick={() => setShowSuprimento(false)}>Cancelar</Button>
            <Button onClick={() => adicionarSuprimentoMutation.mutate()} disabled={adicionarSuprimentoMutation.isPending || suprimentoInvalido}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              {adicionarSuprimentoMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Adicionar Suprimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fechar Caixa */}
      <Dialog open={showFechamento} onOpenChange={open => {
        if (open || !fecharCaixaMutation.isPending) setShowFechamento(open);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-destructive" /> Fechar Caixa — {fmtDate(caixaParaFechar?.data || today)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Abertura', value: caixaParaFechar?.valor_abertura ?? caixaHoje?.valor_abertura ?? 0, color: 'text-foreground' },
                { label: 'Receitas', value: totaisFechamento.receita, color: 'text-emerald-600', prefix: '+' },
                { label: 'Despesas', value: totaisFechamento.despesa, color: 'text-red-500', prefix: '−' },
                { label: 'Sangrias', value: totaisFechamento.sangria, color: 'text-amber-600', prefix: '−' },
                { label: 'Suprimentos', value: totaisFechamento.suprimento, color: 'text-blue-600', prefix: '+' },
                { label: 'Dinheiro esperado', value: saldoEsperadoGaveta, color: saldoEsperadoGaveta >= 0 ? 'text-emerald-600' : 'text-red-500' },
              ].map(item => (
                <div key={item.label} className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={cn('text-lg font-bold tabular-nums', item.color)}>
                    {item.prefix || ''}{fmt(item.value)}
                  </p>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="valor-contado-fechamento" className="text-xs font-medium">Dinheiro contado na gaveta (R$)</Label>
                <Input type="text" inputMode="decimal" placeholder="Digite o valor contado" value={valorFechamento}
                  id="valor-contado-fechamento" onChange={e => setValorFechamento(e.target.value)} step="0.01" min="0" required autoFocus />
                {valorFechamento.trim() === '' && <p className="text-xs text-muted-foreground">Informe o valor contado; use 0 se não houver dinheiro no caixa.</p>}
              </div>
              {contadoFechamento !== null && (() => {
                // Comparação em centavos (ver src/lib/dinheiro.ts). Com `===`
                // entre floats, a operadora contava o caixa certinho e o painel
                // acusava divergência exibindo "Diferença: R$ 0,00".
                const contado = contadoFechamento;
                const bate = mesmoValor(contado, saldoEsperadoGaveta);
                const diferenca = diferencaEmReais(contado, saldoEsperadoGaveta);

                return (
                  <div className={cn(
                    'p-3 rounded-lg border',
                    bate
                      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                      : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                  )}>
                    <p className="text-xs text-muted-foreground">Diferença</p>
                    <p className={cn('text-xl font-bold tabular-nums',
                      bate ? 'text-emerald-600' : 'text-red-500'
                    )}>
                      {fmt(diferenca)}
                    </p>
                  </div>
                );
              })()}
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Observações {fechamentoNaoBate ? '(obrigatórias — o caixa não bate)' : '(opcional)'}
                </Label>
                <Textarea
                  placeholder={fechamentoNaoBate
                    ? 'Explique a diferença: troco não conferido, sangria não registrada...'
                    : 'Anotações sobre o fechamento...'}
                  value={obsFechamento}
                  onChange={e => setObsFechamento(e.target.value)}
                  rows={2}
                />
                {fechamentoNaoBate && obsFechamento.trim().length < 5 && (
                  <p className="text-xs text-destructive">
                    Descreva o motivo da diferença antes de fechar (mínimo 5 caracteres).
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={fecharCaixaMutation.isPending} onClick={() => setShowFechamento(false)}>Cancelar</Button>
            <Button onClick={() => fecharCaixaMutation.mutate({ caixa: caixaParaFechar || undefined, valor: contadoFechamento })}
              disabled={fecharCaixaMutation.isPending || (!!caixaParaFechar && caixaParaFechar.id === caixaHoje?.id && (loadingLanc || erroLancamentos || lancamentosExcederamLimite)) || (loadingLancamentosDetalhe || erroLancamentosDetalhe || lancamentosDetalheExcederamLimite) && !!caixaParaFechar && caixaParaFechar.id !== caixaHoje?.id || contadoFechamento === null || (fechamentoNaoBate && obsFechamento.trim().length < 5)}
              variant="destructive" className="gap-2">
              {fecharCaixaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhes de Caixa Anterior */}
      <Dialog open={!!showDetalhesCaixa} onOpenChange={(open) => { if (!open) { setShowDetalhesCaixa(null); setCaixaParaFechar(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Caixa — {showDetalhesCaixa ? fmtDate(showDetalhesCaixa.data) : ''}
            </DialogTitle>
          </DialogHeader>
          {showDetalhesCaixa && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Abertura</p>
                  <p className="font-bold">{fmt(showDetalhesCaixa.valor_abertura)}</p>
                  <p className="text-[10px] text-muted-foreground">{showDetalhesCaixa.operador_abertura || '—'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Fechamento</p>
                  <p className="font-bold">{fmt(showDetalhesCaixa.valor_fechamento || 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{showDetalhesCaixa.operador_fechamento || '—'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={showDetalhesCaixa.aberto ? 'default' : 'secondary'} className="mt-1">
                    {showDetalhesCaixa.aberto ? 'Aberto' : 'Fechado'}
                  </Badge>
                </div>
                {showDetalhesCaixa.observacoes && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Obs</p>
                    <p className="text-xs">{showDetalhesCaixa.observacoes}</p>
                  </div>
                )}
              </div>

              <Separator />
              <p className="text-sm font-semibold">Movimentações ({lancamentosDetalhe.length})</p>

              {lancamentosDetalheExcederamLimite && (
                <div role="alert" className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning-foreground">
                  Este caixa tem mais de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} movimentos. A lista e os totais podem estar incompletos; não feche até conferir todos.
                </div>
              )}

              {loadingLancamentosDetalhe && <p className="text-xs text-muted-foreground" role="status">Carregando movimentos…</p>}
              {erroLancamentosDetalhe && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 p-3" role="alert">
                  <span className="text-xs text-destructive">Não foi possível carregar os movimentos deste caixa.</span>
                  <Button size="sm" variant="outline" onClick={() => void recarregarLancamentosDetalhe()}>Tentar novamente</Button>
                </div>
              )}
              {!loadingLancamentosDetalhe && !erroLancamentosDetalhe && lancamentosDetalhe.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma movimentação neste caixa</p>
              ) : lancamentosDetalhe.length > 0 && (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {lancamentosDetalhe.map(l => {
                    const cfg = getTipoConfig(l.tipo);
                    const valorAssinado = (l.tipo === 'receita' || l.tipo === 'suprimento') ? l.valor : -l.valor;
                    return (
                      <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                        <div className="flex items-center gap-2">
                          <div className={cn('px-2 py-0.5 rounded text-[10px] font-medium', cfg.bg, cfg.color)}>
                            {cfg.label}
                          </div>
                          <span className="text-foreground">{l.descricao}</span>
                        </div>
                        <span className={cn('font-bold tabular-nums', valorAssinado < 0 ? 'text-destructive' : cfg.color)}>
                          {valorAssinado < 0 ? '−' : '+'}{fmt(Math.abs(l.valor))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {showDetalhesCaixa.aberto && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Dinheiro esperado na gaveta</p>
                    <p className="font-semibold tabular-nums">{fmt(saldoEsperadoGaveta)}</p>
                    {showDetalhesCaixa.data < today && <p className="mt-1 text-xs text-muted-foreground">Este caixa ficou aberto após a virada do dia. Fechar aqui não libera pagamentos para dias anteriores.</p>}
                  </div>
                  <Button variant="destructive" className="gap-2" disabled={loadingLancamentosDetalhe || erroLancamentosDetalhe || lancamentosDetalheExcederamLimite}
                    onClick={() => { setValorFechamento(''); setObsFechamento(''); setShowFechamento(true); }}>
                    <Lock className="h-4 w-4" /> {showDetalhesCaixa.data < today ? 'Regularizar fechamento' : 'Fechar caixa'}
                  </Button>
                </div>
              )}
              <Separator />
              <p className="text-sm font-semibold">Histórico de abertura e fechamento</p>
              {erroEventosCaixa && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 p-3" role="alert">
                  <span className="text-xs text-destructive">Não foi possível carregar o histórico deste caixa.</span>
                  <Button size="sm" variant="outline" onClick={() => void recarregarEventosCaixa()}>Tentar novamente</Button>
                </div>
              )}
              {loadingEventosCaixa && <p className="text-xs text-muted-foreground" role="status">Carregando histórico…</p>}
              {eventosCaixa.length === 0 && !erroEventosCaixa && !loadingEventosCaixa ? (
                <p className="text-xs text-muted-foreground">Nenhum evento de abertura, fechamento ou reabertura.</p>
              ) : eventosCaixa.length > 0 && (
                <ol className="space-y-2">
                  {eventosCaixa.map(evento => (
                    <li key={evento.id} className="border-l-2 border-border pl-3 text-xs">
                      <div className="flex flex-wrap gap-x-2">
                        <span className="font-medium">{evento.tipo === 'abertura' ? 'Abertura' : evento.tipo === 'fechamento' ? 'Fechamento' : 'Reabertura'}</span>
                        <span className="text-muted-foreground">{new Date(evento.created_at).toLocaleString('pt-BR')}</span>
                        {evento.user_nome && <span className="text-muted-foreground">por {evento.user_nome}</span>}
                      </div>
                      {evento.valor_informado !== null && <p className="mt-1 text-muted-foreground">Informado: {fmt(evento.valor_informado)}</p>}
                      {evento.valor_apurado !== null && <p className="text-muted-foreground">Apurado: {fmt(evento.valor_apurado)}</p>}
                      {evento.fechamento_anterior_valor !== null && <p className="text-muted-foreground">Fechamento anterior: {fmt(evento.fechamento_anterior_valor)}{evento.fechamento_anterior_operador ? `, por ${evento.fechamento_anterior_operador}` : ''}</p>}
                      {evento.motivo && <p className="mt-1">Motivo/observações: {evento.motivo}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Editar lançamento */}
      <Dialog open={!!editLanc} onOpenChange={(o) => {
        if (o || !editarLancamentoMutation.isPending) setEditLanc(o ? editLanc : null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={editForm.descricao}
                onChange={(e) => setEditForm(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="text" inputMode="decimal"
                value={editForm.valor}
                onChange={(e) => setEditForm(f => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select
                value={editForm.forma_pagamento}
                onValueChange={(v) => setEditForm(f => ({ ...f, forma_pagamento: v as FormaPagamento }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao_credito">Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Débito</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLanc(null)} disabled={editarLancamentoMutation.isPending}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editLanc) return;
                const valor = parseMoneyInput(editForm.valor);
                if (!editForm.descricao.trim()) { toast.error('Informe a descrição'); return; }
                if (valor === null || valor <= 0 || !temPrecisaoDeCentavos(valor)) {
                  toast.error('Informe um valor válido, maior que zero e com até duas casas decimais.');
                  return;
                }
                editarLancamentoMutation.mutate({
                  id: editLanc.id,
                  descricao: editForm.descricao.trim(),
                  valor,
                  forma_pagamento: editForm.forma_pagamento,
                });
              }}
              disabled={editarLancamentoMutation.isPending}
            >
              {editarLancamentoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
