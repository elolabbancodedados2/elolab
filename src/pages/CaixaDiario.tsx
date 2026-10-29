import { useLocation } from 'react-router-dom';
import { useState, useMemo, lazy, Suspense, useEffect, useRef } from 'react';
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
  ArrowUpRight, ArrowDownRight, ClipboardList, Tag, User, X, FileSpreadsheet, Scale, RefreshCw,
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
import { PageHeader } from '@/components/PageHeader';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mesmoValor, diferencaEmReais, parseValorContado } from '@/lib/dinheiro';
import { calcularSaldoGaveta, calcularTotaisCaixa, validarResultadoRpcCaixa } from '@/lib/caixaDiario';
import { useBuscaPacientes } from '@/hooks/useBuscaPacientes';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { canAccessCashTab, canAccessRestrictedCashTabs } from '@/lib/cashierAccess';

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

const CATEGORIAS_DESPESA = ['Material de escritório', 'Limpeza', 'Alimentação', 'Transporte', 'Manutenção', 'Fornecedor', 'Troco', 'Outros'];

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
  const roles = [...new Set([...(profile?.roles ?? []), ...(profile?.role ? [profile.role] : [])])];
  const podeAcessarModulosFinanceiros = canAccessRestrictedCashTabs(roles);
  const queryClient = useQueryClient();
  const [today, setToday] = useState(() => todaySaoPauloDateOnly());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todaySaoPauloDateOnly()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.cashTab === 'tipos' ? 'tipos' : 'hoje');
  const activeTabPermitida = canAccessCashTab(activeTab, roles) ? activeTab : 'hoje';
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
  const [showDespesa, setShowDespesa] = useState(false);
  const [despesaForm, setDespesaForm] = useState({ valor: '', descricao: '', categoria: 'Outros', forma_pagamento: 'dinheiro' as FormaPagamento });
  const despesaIdempotenciaRef = useRef<{ clinicaId: string; id: string } | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | LancamentoTipo>('todos');

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

  const valorDespesaInformado = parseMoneyInput(despesaForm.valor);
  const despesaInvalida = valorDespesaInformado === null
    || !Number.isFinite(valorDespesaInformado)
    || valorDespesaInformado <= 0
    || !temPrecisaoDeCentavos(valorDespesaInformado);

  const adicionarDespesaMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !caixaHoje?.id) throw new Error('Caixa não está aberto');
      const valor = parseMoneyInput(despesaForm.valor);
      if (valor === null || valor <= 0 || !temPrecisaoDeCentavos(valor)) {
        throw new Error('Informe um valor válido, maior que zero e com até duas casas decimais.');
      }
      if (!despesaForm.descricao.trim()) throw new Error('Descreva a despesa');
      if (despesaIdempotenciaRef.current?.clinicaId !== profile.clinica_id) {
        despesaIdempotenciaRef.current = { clinicaId: profile.clinica_id, id: novaChaveMovimentoCaixa() };
      }
      const id = despesaIdempotenciaRef.current.id;
      await inserirMovimentoCaixaUmaVez({
        id,
        tipo: 'despesa', valor,
        descricao: despesaForm.descricao.trim(), forma_pagamento: despesaForm.forma_pagamento,
        categoria: despesaForm.categoria, status: 'pago', data_vencimento: today, data: today, data_pagamento: new Date().toISOString(), clinica_id: profile.clinica_id,
      });
    },
    onSuccess: () => {
      despesaIdempotenciaRef.current = null;
      toast.success('Despesa registrada!');
      setShowDespesa(false);
      setDespesaForm({ valor: '', descricao: '', categoria: 'Outros', forma_pagamento: 'dinheiro' });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      toast.error(e?.message || 'Não foi possível registrar a despesa.', {
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
      <PageHeader
        title="Caixa e fluxo de caixa"
        description={caixaHoje
          ? `Saldo ${fmt(totais.final)} · Entradas ${fmt(totais.receita)} · Saídas ${fmt(totais.despesa + totais.sangria)}`
          : new Date(`${today}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        icon={<DollarSign />}
        actions={(
          <>
            {podeAcessarModulosFinanceiros && (
              <button
                type="button"
                onClick={() => setActiveTab('receber')}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-[#9CC7EC] hover:text-foreground"
              >
                <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /> A Receber
              </button>
            )}
            {podeAcessarModulosFinanceiros && (
              <button
                type="button"
                onClick={() => setActiveTab('pagar')}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-[#9CC7EC] hover:text-foreground"
              >
                <ArrowDownRight aria-hidden="true" className="h-3.5 w-3.5" /> A Pagar
              </button>
            )}
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
                onClick={() => setShowAbertura(true)}
                className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110"
              >
                <Unlock className="h-4 w-4" /> Abrir Caixa
              </Button>
            ) : isOpen ? (
              <Button
                onClick={() => setShowLancamento(true)}
                className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110"
              >
                <ShoppingCart className="h-4 w-4" /> Nova Venda
              </Button>
            ) : null}
          </>
        )}
      />

      <Tabs value={activeTabPermitida} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex h-auto w-auto min-w-full gap-0.5 rounded-xl border border-border bg-muted/60 p-1 md:w-full md:min-w-0 md:flex-wrap md:justify-center">
            {[
              { v: 'hoje', l: 'Caixa Hoje', i: Receipt },
              { v: 'historico', l: 'Histórico', i: History },
              ...(podeAcessarModulosFinanceiros ? [
                { v: 'receber', l: 'Contas a Receber', i: ArrowUpRight },
                { v: 'pagar', l: 'Contas a Pagar', i: ArrowDownRight },
                { v: 'fluxo', l: 'Fluxo de Caixa', i: TrendingUp },
                { v: 'precos', l: 'Tabela de Preços', i: Tag },
                { v: 'tipos', l: 'Tipos de Consulta', i: Stethoscope },
                { v: 'relatorios', l: 'Relatórios', i: ClipboardList },
              ] : []),
            ].map(tab => (
              <TabsTrigger key={tab.v} value={tab.v} className="min-h-10 gap-1.5 whitespace-nowrap rounded-full px-3 text-xs">
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
          <div className="flex flex-wrap items-center gap-2">
            {!caixaHoje ? (
              <Button onClick={() => setShowAbertura(true)} className="h-11 gap-2 rounded-full bg-gradient-primary px-5 text-white shadow-[0_6px_18px_rgba(16,128,202,0.35)] hover:brightness-110">
                <Unlock className="h-4 w-4" /> Abrir Caixa
              </Button>
            ) : isOpen ? (
              <>
                <Button onClick={() => setShowLancamento(true)} className="h-11 gap-2 rounded-full bg-gradient-primary px-5 text-white shadow-md hover:brightness-110">
                  <ShoppingCart className="h-4 w-4" /> Nova Venda
                </Button>
                <Button onClick={() => setShowDespesa(true)} variant="outline" className="h-11 gap-2 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <TrendingDown className="h-4 w-4" /> Despesa
                </Button>
                <Button onClick={() => setShowSangria(true)} variant="outline" className="h-11 gap-2 rounded-full border-warning/30 text-warning-foreground hover:bg-warning/10">
                  <ArrowDownToLine className="h-4 w-4" /> Sangria
                </Button>
                <Button onClick={() => setShowSuprimento(true)} variant="outline" className="h-11 gap-2 rounded-full border-[#1080CA]/30 text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                  <ArrowUpFromLine className="h-4 w-4" /> Suprimento
                </Button>
                <Button onClick={() => imprimirRelatorioFechamento(caixaHoje, lancamentos)} variant="ghost" className="h-11 gap-2 rounded-full text-muted-foreground" title="Relatório parcial do caixa">
                  <Printer className="h-4 w-4" /> Relatório parcial
                </Button>
                <Button onClick={() => { setCaixaParaFechar(caixaHoje); setValorFechamento(''); setObsFechamento(''); setShowFechamento(true); }} disabled={loadingLanc || lancamentosExcederamLimite} variant="destructive" className="ml-auto h-11 gap-2 rounded-full px-5">
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
                  <Button variant="outline" className="ml-auto h-10 gap-2 rounded-full" onClick={() => setShowReabertura(true)}>
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
              { key: 'suprimento', label: 'Suprimentos', caption: `${contagemPorTipo.suprimento} reposição${contagemPorTipo.suprimento === 1 ? '' : 's'}`, value: totais.suprimento, icon: ArrowUpFromLine, color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false },
              {
                key: 'todos',
                label: totais.final < 0 ? 'Saldo negativo' : 'Saldo do dia',
                caption: isOpen ? 'resultado financeiro' : diferencaFechamento === null ? 'caixa encerrado' : mesmoValor(diferencaFechamento, 0) ? 'bateu com o esperado' : `${diferencaFechamento > 0 ? 'sobra' : 'falta'} ${fmt(Math.abs(diferencaFechamento))}`,
                value: totais.final,
                icon: DollarSign,
                color: 'text-white',
                surface: 'bg-white/15',
                escuro: true,
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
                        'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                        card.escuro && 'border-transparent bg-gradient-primary text-white',
                        ativo && !card.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                        ativo && card.escuro && 'ring-2 ring-[#1080CA]/60',
                      )}
                    >
                      <div className="flex min-h-[96px] items-center gap-3 p-3">
                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', card.surface)}>
                          <Icon aria-hidden="true" className={cn('h-5 w-5', card.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className={cn('truncate text-xs font-semibold', card.escuro ? 'text-white/80' : 'text-foreground')}>{card.label}</h3>
                            <span className={cn('text-2xl font-bold tabular-nums', card.color)}>{fmt(card.value)}</span>
                          </div>
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
            <Card className="rounded-2xl border-[#1080CA]/20 shadow-[0_8px_24px_rgba(16,128,202,0.08)]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                  <CardTitle className="text-base font-semibold">Receitas por forma de pagamento</CardTitle>
                  <Badge variant="outline" className="h-5 rounded-full border-[#BFD8EE] bg-white text-xs tabular-nums text-[#1080CA]">{Object.keys(breakdownFormas).length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(breakdownFormas).map(([forma, valor]) => {
                    const Icon = FORMA_ICONS[forma] || Banknote;
                    const pct = totais.receita > 0 ? ((valor / totais.receita) * 100).toFixed(0) : '0';
                    return (
                      <div key={forma} className="flex items-center gap-3 rounded-xl bg-[#F3F8FC] border border-[#DCE6F2] p-3">
                        <div className="rounded-lg bg-gradient-primary p-2 text-white shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground capitalize">{FORMA_LABELS[forma] || forma}</p>
                          <p className="text-sm font-bold tabular-nums">{fmt(valor)}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full text-[10px] border-[#BFD8EE] text-[#1080CA]">{pct}%</Badge>
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
                            tipoFiltro === valor ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border/60 bg-card text-muted-foreground hover:border-[#1080CA]/40 hover:text-foreground',
                          )}
                        >
                          {rotulo} <span className={cn('tabular-nums', tipoFiltro === valor ? 'text-white/70' : 'text-muted-foreground/70')}>{total}</span>
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input className="h-10 w-full rounded-full pl-9 text-sm focus-visible:ring-[#1080CA] sm:w-56" placeholder="Buscar movimentações..." aria-label="Buscar movimentações do caixa" value={searchTerm}
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
                    <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                      <Receipt className="h-7 w-7" />
                    </span>
                    <p className="font-medium text-foreground">Nenhuma movimentação{tipoFiltro !== 'todos' ? ' neste filtro' : ''}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tipoFiltro !== 'todos'
                        ? 'Tente outro filtro ou registre uma nova movimentação'
                        : 'Registre receitas, despesas ou sangrias'}
                    </p>
                    {tipoFiltro !== 'todos' && (
                      <button type="button" onClick={() => setTipoFiltro('todos')} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 px-3 text-xs font-medium text-muted-foreground transition hover:border-[#1080CA]/40 hover:text-foreground">
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
                                      </>
                                    )}
                                    {l.tipo !== 'receita' && !l.origem_pagamento && (
                                      <>
                                        <Button variant="ghost" size="icon" aria-label="Excluir lançamento" className="h-9 w-9 rounded-full text-destructive hover:text-destructive"
                                          onClick={() => setConfirmDelete(l.id)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label="Editar lançamento" className="h-9 w-9 rounded-full"
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
                <span aria-hidden="true" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                  <DollarSign className="h-7 w-7" />
                </span>
                <h3 className="text-lg font-semibold text-foreground mb-1">Caixa não aberto hoje</h3>
                <p className="text-sm text-muted-foreground mb-4">Abra o caixa para iniciar as movimentações do dia</p>
                <Button onClick={() => setShowAbertura(true)} className="h-11 gap-2 rounded-full bg-gradient-primary px-5 text-white shadow-md hover:brightness-110">
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

        {/* ═══ FERRAMENTAS FINANCEIRAS ═══ */}
        {podeAcessarModulosFinanceiros && <TabsContent value="receber" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyContasReceber />
          </Suspense>
        </TabsContent>}

        {podeAcessarModulosFinanceiros && <TabsContent value="pagar" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyContasPagar />
          </Suspense>
        </TabsContent>}

        {podeAcessarModulosFinanceiros && <TabsContent value="fluxo" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyFluxoCaixa />
          </Suspense>
        </TabsContent>}

        {podeAcessarModulosFinanceiros && <TabsContent value="precos" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyPrecosExames />
          </Suspense>
        </TabsContent>}

        {podeAcessarModulosFinanceiros && <TabsContent value="tipos" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyTiposConsulta />
          </Suspense>
        </TabsContent>}

        {podeAcessarModulosFinanceiros && <TabsContent value="relatorios" className="mt-4">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>}>
            <LazyRelatorios />
          </Suspense>
        </TabsContent>}
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
              <Label htmlFor="caixa-valor-inicial" className="text-xs">Valor inicial em caixa (R$) *</Label>
              <Input id="caixa-valor-inicial" type="text" inputMode="decimal" placeholder="0,00" value={valorAbertura} disabled={abrirCaixaMutation.isPending}
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
              disabled={abrirCaixaMutation.isPending || aberturaInvalida} className="gap-2 rounded-full bg-gradient-primary text-white hover:brightness-110">
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
                    <button key={tc.id}
                      type="button"
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
                    </button>
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
                    <button key={ex.id}
                      type="button"
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
                    </button>
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
                    <button key={p.id}
                      type="button"
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
                    </button>
                  ))}
                </TabsContent>

                <TabsContent value="manual" className="mt-2 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="caixa-item-manual-nome" className="text-xs">Nome do item *</Label>
                    <Input id="caixa-item-manual-nome" placeholder="Ex: Exame de sangue, Taxa extra..." value={manualNome}
                      onChange={e => setManualNome(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="caixa-item-manual-valor" className="text-xs">Valor (R$) *</Label>
              <Input id="caixa-item-manual-valor" type="text" inputMode="decimal" placeholder="0,00" value={manualValor}
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
                    {carrinho.map(item => (
                      <div key={item.id}
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
                      </div>
                    ))}
                </div>
              )}

              <Separator className="my-3" />

              {/* Paciente (opcional) — vincula ao prontuário */}
              <div className="space-y-1.5 mb-3">
                <Label id="caixa-paciente-label" className="text-xs flex items-center gap-1">
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
                      aria-label="Remover paciente selecionado"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Popover open={pacientePopoverOpen} onOpenChange={setPacientePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        aria-labelledby="caixa-paciente-label"
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
                <Label htmlFor="caixa-venda-desconto" className="text-xs">Desconto (R$)</Label>
                <Input id="caixa-venda-desconto" type="text" inputMode="decimal" placeholder="0,00" value={lancDesconto}
                  onChange={e => setLancDesconto(e.target.value)} step="0.01" min="0" max={carrinhoSubtotal} className="h-8 text-sm" />
                {descontoInvalido && (
                  <p className="text-xs text-destructive" role="alert">
                    O desconto precisa ser válido e menor que o subtotal de {fmt(carrinhoSubtotal)} para manter um total acima de zero.
                  </p>
                )}
              </div>

              {/* Forma de Pagamento */}
              <div role="group" aria-labelledby="caixa-forma-pagamento-label" className="space-y-1.5 mb-3">
                <Label id="caixa-forma-pagamento-label" className="text-xs">Forma de Pagamento</Label>
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
                      size="sm" className={cn('h-8 gap-1 rounded-full px-2 text-[10px]', lancFormaPagamento === fp.v && 'border-transparent bg-gradient-primary text-white hover:brightness-110')}
                      aria-pressed={lancFormaPagamento === fp.v}
                      onClick={() => setLancFormaPagamento(fp.v as FormaPagamento)}>
                      <fp.i className="h-3 w-3" /> {fp.l}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="mb-3 rounded-xl bg-gradient-primary p-3 text-white">
                <p className="text-xs text-white/60">Total a cobrar</p>
                <p className="text-2xl font-bold tabular-nums text-white">{fmt(carrinhoTotal)}</p>
              </div>

              <Button onClick={() => adicionarLancamentoMutation.mutate()}
                disabled={carrinho.length === 0 || descontoInvalido || adicionarLancamentoMutation.isPending}
                className="w-full gap-2 rounded-full bg-gradient-primary text-white shadow-[0_6px_18px_rgba(16,128,202,0.35)] hover:brightness-110" size="lg">
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
              <Label htmlFor="caixa-sangria-valor" className="text-xs">Valor (R$) *</Label>
              <Input id="caixa-sangria-valor" type="text" inputMode="decimal" placeholder="0,00" value={sangriaForm.valor}
                onChange={e => setSangriaForm(p => ({ ...p, valor: e.target.value }))} />
              {sangriaInvalida && (
                <p className="text-xs text-destructive" role="alert">Informe um valor maior que zero, com até duas casas decimais.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="caixa-sangria-motivo" className="text-xs">Motivo *</Label>
              <Input id="caixa-sangria-motivo" placeholder="Motivo da retirada" value={sangriaForm.motivo}
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
              <Label htmlFor="caixa-suprimento-valor" className="text-xs">Valor (R$) *</Label>
              <Input id="caixa-suprimento-valor" type="text" inputMode="decimal" placeholder="0,00" value={suprimentoForm.valor}
                onChange={e => setSuprimentoForm(p => ({ ...p, valor: e.target.value }))} />
              {suprimentoInvalido && (
                <p className="text-xs text-destructive" role="alert">Informe um valor maior que zero, com até duas casas decimais.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="caixa-suprimento-descricao" className="text-xs">Descrição</Label>
              <Input id="caixa-suprimento-descricao" placeholder="Descrição do suprimento" value={suprimentoForm.descricao}
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

      {/* Despesa */}
      <Dialog open={showDespesa} onOpenChange={open => {
        if (open || !adicionarDespesaMutation.isPending) setShowDespesa(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" /> Registrar despesa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="caixa-despesa-valor" className="text-xs">Valor (R$) *</Label>
              <Input id="caixa-despesa-valor" type="text" inputMode="decimal" placeholder="0,00" value={despesaForm.valor} autoFocus
                onChange={e => setDespesaForm(p => ({ ...p, valor: e.target.value }))} />
              {despesaForm.valor.trim() !== '' && despesaInvalida && (
                <p className="text-xs text-destructive" role="alert">Informe um valor maior que zero, com até duas casas decimais.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="caixa-despesa-descricao" className="text-xs">Descrição *</Label>
              <Input id="caixa-despesa-descricao" placeholder="Ex.: Água mineral, material de limpeza, motoboy..." value={despesaForm.descricao}
                onChange={e => setDespesaForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="caixa-despesa-categoria" className="text-xs">Categoria</Label>
                <Select value={despesaForm.categoria} onValueChange={v => setDespesaForm(p => ({ ...p, categoria: v }))}>
                  <SelectTrigger id="caixa-despesa-categoria"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_DESPESA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="caixa-despesa-forma" className="text-xs">Pago com</Label>
                <Select value={despesaForm.forma_pagamento} onValueChange={v => setDespesaForm(p => ({ ...p, forma_pagamento: v as FormaPagamento }))}>
                  <SelectTrigger id="caixa-despesa-forma"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro da gaveta</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="credito">Cartão de crédito</SelectItem>
                    <SelectItem value="debito">Cartão de débito</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Despesas pagas em dinheiro saem do valor esperado na gaveta; nas outras formas entram só no resultado financeiro.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" disabled={adicionarDespesaMutation.isPending} onClick={() => setShowDespesa(false)}>Cancelar</Button>
            <Button onClick={() => adicionarDespesaMutation.mutate()} disabled={adicionarDespesaMutation.isPending || despesaInvalida || !despesaForm.descricao.trim()}
              className="gap-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {adicionarDespesaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar despesa
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
                <Label htmlFor="caixa-observacoes-fechamento" className="text-xs">
                  Observações {fechamentoNaoBate ? '(obrigatórias — o caixa não bate)' : '(opcional)'}
                </Label>
                <Textarea
                  id="caixa-observacoes-fechamento"
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
                  <Badge variant={showDetalhesCaixa.aberto ? 'outline' : 'secondary'} className={cn('mt-1', showDetalhesCaixa.aberto && 'bg-success/10 text-success border-success/20')}>
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

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-2 rounded-full" disabled={loadingLancamentosDetalhe || erroLancamentosDetalhe} onClick={() => imprimirRelatorioFechamento(showDetalhesCaixa, lancamentosDetalhe)}>
                  <Printer className="h-4 w-4" /> Relatório de fechamento
                </Button>
                <Button variant="ghost" size="sm" className="h-9 gap-2 rounded-full text-muted-foreground" disabled={lancamentosDetalhe.length === 0} onClick={() => exportarCsv(lancamentosDetalhe, showDetalhesCaixa.data)}>
                  <FileSpreadsheet className="h-4 w-4" /> CSV
                </Button>
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
              <Label htmlFor="caixa-editar-descricao">Descrição</Label>
              <Input
                id="caixa-editar-descricao"
                value={editForm.descricao}
                onChange={(e) => setEditForm(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="caixa-editar-valor">Valor (R$)</Label>
              <Input
                id="caixa-editar-valor"
                type="text" inputMode="decimal"
                value={editForm.valor}
                onChange={(e) => setEditForm(f => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="caixa-editar-forma">Forma de pagamento</Label>
              <Select
                value={editForm.forma_pagamento}
                onValueChange={(v) => setEditForm(f => ({ ...f, forma_pagamento: v as FormaPagamento }))}
              >
                <SelectTrigger id="caixa-editar-forma"><SelectValue /></SelectTrigger>
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
