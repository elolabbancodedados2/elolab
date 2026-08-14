import { useState, useMemo, lazy, Suspense } from 'react';
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
import { todayDateOnly } from '@/lib/dateOnly';
import { mesmoValor, diferencaEmReais } from '@/lib/dinheiro';

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

function firstPositiveMoney(...values: unknown[]): number {
  return values.map(toMoney).find(value => value > 0) || 0;
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
}

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
  origem: 'consulta' | 'exame' | 'produto' | 'manual';
}

export default function CaixaDiario() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const today = todayDateOnly();

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

  const [valorAbertura, setValorAbertura] = useState('');
  const [valorFechamento, setValorFechamento] = useState('');
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

  const [lancamentoForm, setLancamentoForm] = useState({
    tipo: 'receita' as LancamentoTipo,
    valor: '',
    descricao: '',
    forma_pagamento: 'dinheiro' as FormaPagamento,
  });

  const [sangriaForm, setSangriaForm] = useState({ valor: '', motivo: '' });
  const [suprimentoForm, setSuprimentoForm] = useState({ valor: '', descricao: '' });

  // ─── Queries ────────────────────────────────────
  const { data: caixaHoje, isLoading: loadingCaixa } = useQuery({
    queryKey: ['caixa-hoje', today, profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return null;
      const { data } = await supabase
        .from('caixa_diario')
        .select('*')
        .eq('data', today)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      return data as CaixaDiarioType | null;
    },
    enabled: !!profile?.clinica_id,
  });

  const { data: lancamentos = [], isLoading: loadingLanc } = useQuery({
    queryKey: ['lancamentos-caixa', caixaHoje?.data, profile?.clinica_id],
    queryFn: async () => {
      if (!caixaHoje?.data || !profile?.clinica_id) return [];
      const { data } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('data', caixaHoje.data)
        .eq('clinica_id', profile.clinica_id)
        .in('tipo', ['receita', 'despesa', 'sangria', 'suprimento'])
        .order('created_at', { ascending: false });
      return (data || []) as Lancamento[];
    },
    enabled: !!caixaHoje?.data && !!profile?.clinica_id,
  });

  // Catálogo de tipos de consulta
  const { data: tiposConsulta = [] } = useQuery({
    queryKey: ['tipos-consulta-caixa', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data } = await supabase
        .from('tipos_consulta')
        .select('id, nome, valor_particular')
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true)
        .order('nome');
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });

  // Catálogo de produtos (estoque com valor_venda)
  const { data: produtosEstoque = [] } = useQuery({
    queryKey: ['produtos-caixa', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data } = await supabase
        .from('estoque')
        .select('id, nome, categoria, valor_venda, quantidade')
        .eq('clinica_id', profile.clinica_id)
        .gt('quantidade', 0)
        .order('nome');
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });

  // Catálogo de exames (preços internos da configuração + precos_exames_convenio)
  const { data: examesCatalogo = [] } = useQuery({
    queryKey: ['exames-caixa', profile?.clinica_id, profile?.id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const items: { id: string; nome: string; valor: number }[] = [];

      // 1. Preços internos salvos em configuracoes_clinica
      let cfgRows: any[] = [];
      if (profile?.clinica_id) {
        const { data } = await (supabase as any)
          .from('configuracoes_clinica')
          .select('valor, updated_at')
          .eq('chave', 'precos_exames_internos')
          .eq('clinica_id', profile.clinica_id)
          .order('updated_at', { ascending: false })
          .limit(1);
        cfgRows = data || [];
      }
      if (cfgRows.length === 0 && profile?.id) {
        const { data } = await (supabase as any)
          .from('configuracoes_clinica')
          .select('valor, updated_at')
          .eq('chave', 'precos_exames_internos')
          .eq('user_id', profile.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        cfgRows = data || [];
      }
      const internalPrices = cfgRows[0]?.valor;
      if (Array.isArray(internalPrices)) {
        internalPrices.forEach((e: any) => {
          const valor = toMoney(e.valor);
          if (e.nome && valor > 0) {
            items.push({ id: `interno-${e.nome}`, nome: e.nome, valor });
          }
        });
      }

      // 2. Preços de convênio (valor_total ou valor_tabela)
      const { data: convenioExames } = await supabase
        .from('precos_exames_convenio')
        .select('id, tipo_exame, valor_total, valor_tabela')
        .eq('clinica_id', profile.clinica_id)
        .eq('ativo', true);
      if (convenioExames) {
        convenioExames.forEach((e: any) => {
          const valor = firstPositiveMoney(e.valor_total, e.valor_tabela);
          if (!items.find(i => i.nome === e.tipo_exame) && Number.isFinite(valor) && valor > 0) {
            items.push({ id: e.id, nome: e.tipo_exame, valor });
          }
        });
      }

      return items.sort((a, b) => a.nome.localeCompare(b.nome));
    },
    enabled: !!profile?.clinica_id,
  });

  // Histórico de caixas anteriores
  const { data: historicosCaixa = [] } = useQuery({
    queryKey: ['historico-caixas', profile?.clinica_id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data } = await supabase
        .from('caixa_diario')
        .select('*')
        .eq('clinica_id', profile.clinica_id)
        .order('data', { ascending: false })
        .limit(30);
      return (data || []) as CaixaDiarioType[];
    },
    enabled: !!profile?.clinica_id && activeTab === 'historico',
  });

  // Pacientes (busca para vincular à venda)
  const { data: pacientesBusca = [] } = useQuery({
    queryKey: ['pacientes-pos-busca', profile?.clinica_id, pacienteSearch],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      let q = supabase
        .from('pacientes')
        .select('id, nome, nome_social, cpf, telefone')
        .eq('clinica_id', profile.clinica_id)
        .order('nome')
        .limit(20);
      const term = pacienteSearch.trim();
      if (term) {
        q = q.or(`nome.ilike.%${term}%,nome_social.ilike.%${term}%,cpf.ilike.%${term}%,telefone.ilike.%${term}%`);
      }
      const { data } = await q;
      return (data || []) as any[];
    },
    enabled: !!profile?.clinica_id && pacientePopoverOpen,
  });

  // Lançamentos do caixa em detalhe
  const { data: lancamentosDetalhe = [] } = useQuery({
    queryKey: ['lancamentos-detalhe', showDetalhesCaixa?.data],
    queryFn: async () => {
      if (!showDetalhesCaixa?.data || !profile?.clinica_id) return [];
      const { data } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('data', showDetalhesCaixa.data)
        .eq('clinica_id', profile.clinica_id)
        .in('tipo', ['receita', 'despesa', 'sangria', 'suprimento'])
        .order('created_at', { ascending: false });
      return (data || []) as Lancamento[];
    },
    enabled: !!showDetalhesCaixa?.data,
  });

  // ─── Calculations ───────────────────────────────
  const totais = useMemo(() => {
    const receita = lancamentos.filter(l => l.tipo === 'receita').reduce((s, l) => s + (l.valor || 0), 0);
    const despesa = lancamentos.filter(l => l.tipo === 'despesa').reduce((s, l) => s + (l.valor || 0), 0);
    const sangria = lancamentos.filter(l => l.tipo === 'sangria').reduce((s, l) => s + (l.valor || 0), 0);
    const suprimento = lancamentos.filter(l => l.tipo === 'suprimento').reduce((s, l) => s + (l.valor || 0), 0);
    const liquido = receita - despesa - sangria + suprimento;
    const final_ = (caixaHoje?.valor_abertura || 0) + liquido;
    return { receita, despesa, sangria, suprimento, liquido, final: final_ };
  }, [lancamentos, caixaHoje]);

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
    return produtosEstoque.filter((p: any) =>
      !q || p.nome?.toLowerCase().includes(q) || p.categoria?.toLowerCase().includes(q)
    );
  }, [produtosEstoque, catalogoSearch]);

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
    setCarrinho(prev => prev.map(p => p.id === id ? { ...p, quantidade: qty } : p));
  };

  const carrinhoTotal = useMemo(() => {
    const subtotal = carrinho.reduce((s, i) => s + i.valor * i.quantidade, 0);
    const desconto = parseFloat(lancDesconto) || 0;
    return Math.max(0, subtotal - desconto);
  }, [carrinho, lancDesconto]);

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

  // ─── Mutations ──────────────────────────────────
  const abrirCaixaMutation = useMutation({
    mutationFn: async (valor: number) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada');
      const { data, error } = await supabase
        .from('caixa_diario')
        .insert({
          data: today, aberto: true, valor_abertura: valor,
          operador_abertura: profile?.nome, clinica_id: profile.clinica_id,
        })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Sync state to localStorage so Recepcao picks it up instantly
      const estado = { aberto: true, data: today, valorAbertura: parseFloat(valorAbertura) || 0, operador: profile?.nome };
      if (profile?.id) localStorage.setItem(`caixa_estado_${profile.id}`, JSON.stringify(estado));
      if (profile?.clinica_id) localStorage.setItem(`caixa_estado_clinica_${profile.clinica_id}`, JSON.stringify(estado));

      toast.success('Caixa aberto com sucesso!');
      setShowAbertura(false);
      setValorAbertura('');
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao abrir caixa'),
  });

  const fecharCaixaMutation = useMutation({
    mutationFn: async (valor: number) => {
      if (!caixaHoje) throw new Error('Caixa não encontrado');
      const { error } = await supabase
        .from('caixa_diario')
        .update({
          aberto: false, valor_fechamento: valor,
          operador_fechamento: profile?.nome,
          observacoes: obsFechamento || null,
        })
        .eq('id', caixaHoje.id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Clear localStorage so Recepcao knows caixa is closed
      if (profile?.id) localStorage.removeItem(`caixa_estado_${profile.id}`);
      if (profile?.clinica_id) localStorage.removeItem(`caixa_estado_clinica_${profile.clinica_id}`);

      toast.success('Caixa fechado com sucesso!');
      setShowFechamento(false);
      setValorFechamento('');
      setObsFechamento('');
      queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] });
      queryClient.invalidateQueries({ queryKey: ['historico-caixas'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-estado-recepcao'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao fechar caixa'),
  });

  const adicionarLancamentoMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !caixaHoje?.id) throw new Error('Caixa não está aberto');
      if (carrinho.length === 0) throw new Error('Adicione pelo menos um item');
      if (!Number.isFinite(carrinhoTotal) || carrinhoTotal <= 0) throw new Error('O total da venda deve ser maior que zero');
      const descricao = carrinho.map(i => `${i.nome}${i.quantidade > 1 ? ` x${i.quantidade}` : ''}`).join(', ');
      const { error } = await (supabase as any).from('lancamentos').insert({
        tipo: 'receita', valor: carrinhoTotal,
        descricao, forma_pagamento: lancFormaPagamento,
        categoria: 'receita_caixa',
        status: 'pago',
        data_vencimento: today,
        data: today, clinica_id: profile.clinica_id,
        paciente_id: pacienteId || null,
      });
      if (error) throw error;

      // Se há paciente vinculado, registrar exames realizados no prontuário.
      //
      // A falha aqui só ia para o console, e mesmo assim a tela dizia "Venda
      // registrada e vinculada ao paciente!". O caixa recebia o pagamento e o
      // exame comprado não aparecia no histórico clínico nem no fluxo do
      // laboratório — ninguém ficava sabendo que faltava lançar.
      //
      // Não desfazemos a venda: o dinheiro já entrou. Mas quem está no balcão
      // precisa saber que sobrou um lançamento manual para fazer.
      let examesNaoRegistrados = false;
      if (pacienteId) {
        const examesItens = carrinho.filter(i => i.origem === 'exame');
        if (examesItens.length > 0) {
          const rows = examesItens.flatMap(i =>
            Array.from({ length: i.quantidade }).map(() => ({
              paciente_id: pacienteId,
              clinica_id: profile.clinica_id,
              tipo_exame: i.nome,
              status: 'realizado',
              data_solicitacao: today,
              data_realizacao: today,
              preco_venda: i.valor,
              observacoes: 'Registrado via Ponto de Venda',
            }))
          );
          const { error: exErr } = await (supabase as any).from('exames').insert(rows);
          if (exErr) {
            examesNaoRegistrados = true;
            console.error('Erro ao registrar exames no prontuário:', exErr);
          }
        }
      }

      return { examesNaoRegistrados };
    },
    onSuccess: (resultado) => {
      if (resultado?.examesNaoRegistrados) {
        toast.warning('Venda registrada, mas o exame não entrou no prontuário.', {
          description: 'O pagamento foi lançado. Cadastre o exame manualmente em Exames — sem isso ele não aparece no histórico do paciente nem chega ao laboratório.',
          duration: 12000,
        });
      } else {
        toast.success(pacienteId ? 'Venda registrada e vinculada ao paciente!' : 'Venda registrada!');
      }
      setShowLancamento(false);
      resetPOS();
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
      queryClient.invalidateQueries({ queryKey: ['exames'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro'),
  });

  const adicionarSangriaMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !caixaHoje?.id) throw new Error('Caixa não está aberto');
      if (!sangriaForm.valor || Number(sangriaForm.valor) <= 0) throw new Error('Valor inválido');
      if (!sangriaForm.motivo.trim()) throw new Error('Motivo obrigatório');
      const { error } = await (supabase as any).from('lancamentos').insert({
        tipo: 'sangria', valor: Number(sangriaForm.valor),
        descricao: `Sangria — ${sangriaForm.motivo}`, forma_pagamento: 'dinheiro',
        categoria: 'sangria', status: 'pago', data_vencimento: today, data: today, clinica_id: profile.clinica_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Sangria registrada!');
      setShowSangria(false);
      setSangriaForm({ valor: '', motivo: '' });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro'),
  });

  const adicionarSuprimentoMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !caixaHoje?.id) throw new Error('Caixa não está aberto');
      if (!suprimentoForm.valor || Number(suprimentoForm.valor) <= 0) throw new Error('Valor inválido');
      const { error } = await (supabase as any).from('lancamentos').insert({
        tipo: 'suprimento', valor: Number(suprimentoForm.valor),
        descricao: suprimentoForm.descricao || 'Suprimento de Caixa', forma_pagamento: 'dinheiro',
        categoria: 'suprimento', status: 'pago', data_vencimento: today, data: today, clinica_id: profile.clinica_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Suprimento adicionado!');
      setShowSuprimento(false);
      setSuprimentoForm({ valor: '', descricao: '' });
      queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] });
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      queryClient.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro'),
  });

  const deletarLancamentoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('lancamentos').delete().eq('id', id).select('id');
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
      const { data, error } = await supabase
        .from('lancamentos')
        .update({ descricao: payload.descricao, valor: payload.valor, forma_pagamento: payload.forma_pagamento })
        .eq('id', payload.id)
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
    paciente: 'Paciente',
    descricao: l.descricao || 'Serviço',
    formaPagamento: FORMA_LABELS[l.forma_pagamento] || l.forma_pagamento,
    valorOriginal: l.valor,
    valorFinal: l.valor,
  });

  if (!profile?.clinica_id) {
    return <SectionFallback rows={5} />;
  }

  if (loadingCaixa) {
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

  const isOpen = caixaHoje?.aberto === true;

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
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
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
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {!isOpen ? (
              <Button onClick={() => setShowAbertura(true)} className="gap-2 bg-success hover:bg-success/90 text-success-foreground">
                <Unlock className="h-4 w-4" /> Abrir Caixa
              </Button>
            ) : (
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
                <Button onClick={() => setShowFechamento(true)} variant="destructive" className="gap-2 ml-auto">
                  <Lock className="h-4 w-4" /> Fechar Caixa
                </Button>
              </>
            )}
          </div>

          {/* KPI Cards */}
          {isOpen && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Abertura', value: caixaHoje?.valor_abertura || 0, icon: Unlock, color: 'text-muted-foreground', bgIcon: 'bg-muted' },
                { label: 'Receitas', value: totais.receita, icon: TrendingUp, color: 'text-success', bgIcon: 'bg-success/10' },
                { label: 'Despesas', value: totais.despesa, icon: TrendingDown, color: 'text-destructive', bgIcon: 'bg-destructive/10' },
                { label: 'Sangrias', value: totais.sangria, icon: ArrowDownToLine, color: 'text-warning', bgIcon: 'bg-warning/10' },
                { label: 'Saldo Final', value: totais.final, icon: DollarSign, color: totais.final >= 0 ? 'text-success' : 'text-destructive', bgIcon: 'bg-primary/10' },
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
                                  <span className={cn('font-bold tabular-nums text-sm', cfg.color)}>
                                    {l.tipo === 'receita' || l.tipo === 'suprimento' ? '+' : '−'}{fmt(l.valor)}
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
                                    <Button variant="ghost" size="icon" aria-label="Excluir lançamento" className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => setConfirmDelete(l.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"
                                      title="Editar"
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
              {historicosCaixa.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Nenhum registro de caixa</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historicosCaixa.map((cx) => (
                    <motion.div key={cx.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
                      onClick={() => setShowDetalhesCaixa(cx)}
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
      <Dialog open={showAbertura} onOpenChange={setShowAbertura}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-emerald-600" /> Abrir Caixa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor inicial em caixa (R$)</Label>
              <Input type="number" placeholder="0,00" value={valorAbertura}
                onChange={e => setValorAbertura(e.target.value)} step="0.01" min="0" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAbertura(false)}>Cancelar</Button>
            <Button onClick={() => abrirCaixaMutation.mutate(parseFloat(valorAbertura) || 0)}
              disabled={abrirCaixaMutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {abrirCaixaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Abrir Caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ PDV — Ponto de Venda ═══ */}
      <Dialog open={showLancamento} onOpenChange={(open) => { setShowLancamento(open); if (!open) resetPOS(); }}>
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
                  {consultasFiltradas.length === 0 ? (
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
                  {examesFiltrados.length === 0 ? (
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
                  {produtosFiltrados.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>Nenhum produto no estoque</p>
                      <p className="text-xs">Cadastre em Estoque</p>
                    </div>
                  ) : produtosFiltrados.map((p: any) => (
                    <motion.button key={p.id}
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      onClick={() => addToCart({ id: p.id, nome: p.nome, valor: p.valor_venda || 0, origem: 'produto' })}
                      className="w-full flex items-center justify-between p-3 rounded-lg border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-info/10">
                          <ShoppingBag className="h-4 w-4 text-info" />
                        </div>
                        <div>
                          <span className="font-medium text-sm">{p.nome}</span>
                          <p className="text-[10px] text-muted-foreground">{p.categoria} · Estoque: {p.quantidade}</p>
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
                    <Input type="number" placeholder="0,00" value={manualValor}
                      onChange={e => setManualValor(e.target.value)} step="0.01" min="0" />
                  </div>
                  <Button variant="outline" className="w-full gap-2" disabled={!manualNome.trim() || !manualValor}
                    onClick={() => {
                      addToCart({ id: `manual-${Date.now()}`, nome: manualNome, valor: parseFloat(manualValor) || 0, origem: 'manual' });
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
                          <CommandEmpty>Nenhum paciente encontrado</CommandEmpty>
                          <CommandGroup>
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
                          </CommandGroup>
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
                <Input type="number" placeholder="0,00" value={lancDesconto}
                  onChange={e => setLancDesconto(e.target.value)} step="0.01" min="0" className="h-8 text-sm" />
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
                disabled={carrinho.length === 0 || adicionarLancamentoMutation.isPending}
                className="w-full gap-2" size="lg">
                {adicionarLancamentoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Finalizar Venda
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sangria */}
      <Dialog open={showSangria} onOpenChange={setShowSangria}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-amber-600" /> Registrar Sangria
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="number" placeholder="0,00" value={sangriaForm.valor}
                onChange={e => setSangriaForm(p => ({ ...p, valor: e.target.value }))} step="0.01" min="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo *</Label>
              <Input placeholder="Motivo da retirada" value={sangriaForm.motivo}
                onChange={e => setSangriaForm(p => ({ ...p, motivo: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSangria(false)}>Cancelar</Button>
            <Button onClick={() => adicionarSangriaMutation.mutate()} disabled={adicionarSangriaMutation.isPending}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
              {adicionarSangriaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar Sangria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suprimento */}
      <Dialog open={showSuprimento} onOpenChange={setShowSuprimento}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-5 w-5 text-blue-600" /> Registrar Suprimento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="number" placeholder="0,00" value={suprimentoForm.valor}
                onChange={e => setSuprimentoForm(p => ({ ...p, valor: e.target.value }))} step="0.01" min="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input placeholder="Descrição do suprimento" value={suprimentoForm.descricao}
                onChange={e => setSuprimentoForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuprimento(false)}>Cancelar</Button>
            <Button onClick={() => adicionarSuprimentoMutation.mutate()} disabled={adicionarSuprimentoMutation.isPending}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              {adicionarSuprimentoMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Adicionar Suprimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fechar Caixa */}
      <Dialog open={showFechamento} onOpenChange={setShowFechamento}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-destructive" /> Fechar Caixa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Abertura', value: caixaHoje?.valor_abertura || 0, color: 'text-foreground' },
                { label: 'Receitas', value: totais.receita, color: 'text-emerald-600', prefix: '+' },
                { label: 'Despesas', value: totais.despesa, color: 'text-red-500', prefix: '−' },
                { label: 'Sangrias', value: totais.sangria, color: 'text-amber-600', prefix: '−' },
                { label: 'Suprimentos', value: totais.suprimento, color: 'text-blue-600', prefix: '+' },
                { label: 'Saldo Teórico', value: totais.final, color: totais.final >= 0 ? 'text-emerald-600' : 'text-red-500' },
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
                <Label className="text-xs font-medium">Valor contado no caixa (R$)</Label>
                <Input type="number" placeholder="Digite o valor contado" value={valorFechamento}
                  onChange={e => setValorFechamento(e.target.value)} step="0.01" min="0" autoFocus />
              </div>
              {valorFechamento && Number.isFinite(parseFloat(valorFechamento)) && (() => {
                // Comparação em centavos (ver src/lib/dinheiro.ts). Com `===`
                // entre floats, a operadora contava o caixa certinho e o painel
                // acusava divergência exibindo "Diferença: R$ 0,00".
                const contado = parseFloat(valorFechamento);
                const bate = mesmoValor(contado, totais.final);
                const diferenca = diferencaEmReais(contado, totais.final);

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
                <Label className="text-xs">Observações (opcional)</Label>
                <Textarea placeholder="Anotações sobre o fechamento..." value={obsFechamento}
                  onChange={e => setObsFechamento(e.target.value)} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFechamento(false)}>Cancelar</Button>
            <Button onClick={() => fecharCaixaMutation.mutate(parseFloat(valorFechamento) || 0)}
              disabled={fecharCaixaMutation.isPending} variant="destructive" className="gap-2">
              {fecharCaixaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhes de Caixa Anterior */}
      <Dialog open={!!showDetalhesCaixa} onOpenChange={() => setShowDetalhesCaixa(null)}>
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

              {lancamentosDetalhe.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma movimentação neste caixa</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {lancamentosDetalhe.map(l => {
                    const cfg = getTipoConfig(l.tipo);
                    return (
                      <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                        <div className="flex items-center gap-2">
                          <div className={cn('px-2 py-0.5 rounded text-[10px] font-medium', cfg.bg, cfg.color)}>
                            {cfg.label}
                          </div>
                          <span className="text-foreground">{l.descricao}</span>
                        </div>
                        <span className={cn('font-bold tabular-nums', cfg.color)}>
                          {l.tipo === 'receita' || l.tipo === 'suprimento' ? '+' : '−'}{fmt(l.valor)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lançamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && deletarLancamentoMutation.mutate(confirmDelete)}
              className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editar lançamento */}
      <Dialog open={!!editLanc} onOpenChange={(o) => !o && setEditLanc(null)}>
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
                type="number" step="0.01" min="0"
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
            <Button variant="outline" onClick={() => setEditLanc(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editLanc) return;
                const valor = parseFloat(editForm.valor);
                if (!editForm.descricao.trim()) { toast.error('Informe a descrição'); return; }
                if (!Number.isFinite(valor) || valor <= 0) { toast.error('Valor inválido'); return; }
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
