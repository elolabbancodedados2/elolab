import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowUpFromLine, Banknote, CheckCircle2, CreditCard, FileText,
  FlaskConical, Loader2, Minus, Plus, QrCode, Receipt, Search, ShoppingBag,
  ShoppingCart, Stethoscope, Trash2, User, Wallet, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { mensagemDeErro } from '@/lib/erros';
import { useBuscaPacientes } from '@/hooks/useBuscaPacientes';
import { calcularDesconto, calcularTroco, parseMoneyInput } from '@/lib/dinheiro';

type OrigemItem = 'consulta' | 'exame' | 'produto' | 'manual';
type FormaPagamento = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'cheque' | 'transferencia';
type CatalogoTab = 'consultas' | 'exames' | 'produtos' | 'manual';

interface CaixaAberto {
  id: string;
  data: string;
  aberto: boolean;
  valor_abertura: number;
  operador_abertura: string | null;
}

interface ProdutoCarrinho {
  id: string;
  nome: string;
  valor: number;
  quantidade: number;
  quantidadeDisponivel?: number;
  origem: OrigemItem;
}

interface ExameVenda {
  id: string;
  nome: string;
  valor: number;
}

interface VendaPdvResultado {
  lancamento_id: string;
  ja_registrada: boolean;
}

const FORMAS: Array<{ value: FormaPagamento; label: string; icon: typeof Banknote }> = [
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'pix', label: 'PIX', icon: QrCode },
  { value: 'credito', label: 'Crédito', icon: CreditCard },
  { value: 'debito', label: 'Débito', icon: Wallet },
  { value: 'cheque', label: 'Cheque', icon: FileText },
  { value: 'transferencia', label: 'Transferência', icon: ArrowUpFromLine },
];

function moeda(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function toMoney(value: unknown): number {
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\s/g, '').includes(',')
      ? value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
      : value.trim().replace(/\s/g, '')
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

const ROTULO_ORIGEM: Record<OrigemItem, string> = {
  consulta: 'Consulta', exame: 'Exame', produto: 'Produto', manual: 'Item manual',
};

/** Limite de desconto do balcão, o mesmo que o banco aplica. */
const DESCONTO_MAXIMO = 0.5;

function temPrecisaoDeCentavos(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7;
}

function novaChave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function CashierSalePage() {
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routeState = location.state as { returnTo?: unknown; cashTab?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/(?:recepcao\?tab=caixa|caixa-diario)$/.test(routeState.returnTo)
    ? routeState.returnTo
    : '/caixa-diario';
  const returnTab = routeState?.cashTab === 'historico' ? 'historico' : 'hoje';
  const today = todaySaoPauloDateOnly();
  const [cart, setCart] = useState<ProdutoCarrinho[]>([]);
  const [catalogTab, setCatalogTab] = useState<CatalogoTab>('consultas');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<FormaPagamento>('dinheiro');
  const [discount, setDiscount] = useState('');
  const [discountMode, setDiscountMode] = useState<'reais' | 'percentual'>('reais');
  const [discountReason, setDiscountReason] = useState('');
  const [cashGiven, setCashGiven] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const [manualName, setManualName] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const navigationAllowed = useRef(false);

  const cashQuery = useQuery({
    queryKey: ['cashier-sale-register', profile?.clinica_id ?? null, today],
    enabled: Boolean(profile?.clinica_id),
    queryFn: async (): Promise<CaixaAberto | null> => {
      const { data, error } = await supabase.from('caixa_diario')
        .select('id, data, aberto, valor_abertura, operador_abertura')
        .eq('data', today).eq('clinica_id', profile!.clinica_id!).maybeSingle();
      if (error) throw error;
      return data as CaixaAberto | null;
    },
    refetchInterval: 15_000,
  });
  const canSell = Boolean(profile?.clinica_id && cashQuery.data?.aberto && !cashQuery.isError);

  const consultationQuery = useQuery({
    queryKey: ['tipos-consulta-caixa', profile?.clinica_id],
    enabled: canSell,
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_consulta')
        .select('id, nome, valor_particular').eq('clinica_id', profile!.clinica_id!).eq('ativo', true).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const productQuery = useQuery({
    queryKey: ['produtos-caixa', profile?.clinica_id],
    enabled: canSell,
    queryFn: async () => {
      const { data, error } = await supabase.from('estoque')
        .select('id, nome, categoria, valor_venda, quantidade, validade')
        .eq('clinica_id', profile!.clinica_id!).gt('quantidade', 0).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const examQuery = useQuery({
    queryKey: ['exames-caixa', profile?.clinica_id, profile?.id],
    enabled: canSell,
    queryFn: async (): Promise<ExameVenda[]> => {
      const itemsByName = new Map<string, ExameVenda>();
      const normalizeName = (name: unknown) => String(name || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
        .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

      const { data: clinicPrices, error: clinicPriceError } = await supabase.from('configuracoes_clinica')
        .select('valor, updated_at').eq('chave', 'precos_exames_internos')
        .eq('clinica_id', profile!.clinica_id!).order('updated_at', { ascending: false }).limit(1);
      let priceRows = clinicPrices ?? [];
      const configError = clinicPriceError;
      if (!priceRows.length && profile?.id) {
        const { data, error } = await supabase.from('configuracoes_clinica').select('valor, updated_at')
          .eq('chave', 'precos_exames_internos').eq('user_id', profile.id)
          .order('updated_at', { ascending: false }).limit(1);
        priceRows = data ?? [];
        if (error) throw error;
      }
      if (!priceRows.length && configError) throw configError;

      const internalPrices: unknown = priceRows[0]?.valor;
      if (Array.isArray(internalPrices)) {
        internalPrices.forEach((item: unknown) => {
          if (!item || typeof item !== 'object') return;
          const price = item as { nome?: unknown; valor?: unknown };
          const name = typeof price.nome === 'string' ? price.nome : '';
          const value = toMoney(price.valor);
          const key = normalizeName(name);
          if (key && value > 0 && !itemsByName.has(key)) {
            itemsByName.set(key, { id: `interno-${key}`, nome: name, valor: value });
          }
        });
      }

      const { data: catalog, error } = await supabase.from('tipo_exames_catalog')
        .select('id, nome, preco_venda').eq('clinica_id', profile!.clinica_id!).eq('ativo', true);
      if (error) throw error;
      catalog?.forEach(item => {
        const key = normalizeName(item.nome);
        const value = toMoney(item.preco_venda);
        if (key && value > 0 && !itemsByName.has(key)) itemsByName.set(key, { id: item.id, nome: item.nome, valor: value });
      });
      return [...itemsByName.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });

  const patientQuery = useBuscaPacientes(patientSearch, { limite: 20, enabled: patientPickerOpen });
  const isSearchingPatients = patientQuery.isFetching || patientQuery.isPlaceholderData || patientQuery.isDebouncing;
  const patients = isSearchingPatients ? [] : patientQuery.data?.pacientes ?? [];

  const query = catalogSearch.trim().toLocaleLowerCase('pt-BR');
  const consultations = useMemo(() => (consultationQuery.data ?? []).filter(item =>
    !query || item.nome.toLocaleLowerCase('pt-BR').includes(query)), [consultationQuery.data, query]);
  const products = useMemo(() => (productQuery.data ?? []).filter(item =>
    (!item.validade || item.validade >= today) && (!query || item.nome.toLocaleLowerCase('pt-BR').includes(query) || (item.categoria ?? '').toLocaleLowerCase('pt-BR').includes(query))),
  [productQuery.data, query, today]);
  const matchingExpiredProducts = useMemo(() => (productQuery.data ?? []).some(item =>
    Boolean(item.validade && item.validade < today) && (!query || item.nome.toLocaleLowerCase('pt-BR').includes(query) || (item.categoria ?? '').toLocaleLowerCase('pt-BR').includes(query))),
  [productQuery.data, query, today]);
  const exams = useMemo(() => (examQuery.data ?? []).filter(item =>
    !query || item.nome.toLocaleLowerCase('pt-BR').includes(query)), [examQuery.data, query]);

  const addToCart = (item: Omit<ProdutoCarrinho, 'quantidade'>) => {
    const price = toMoney(item.valor);
    if (price <= 0) {
      toast.error(`O item “${item.nome}” não possui preço cadastrado.`);
      return;
    }
    const existing = cart.find(entry => entry.id === item.id && entry.origem === item.origem);
    if (item.origem === 'produto' && (item.quantidadeDisponivel ?? 0) <= (existing?.quantidade ?? 0)) {
      toast.error((item.quantidadeDisponivel ?? 0) <= 0
        ? `“${item.nome}” está sem estoque disponível.`
        : `Há somente ${item.quantidadeDisponivel} unidade(s) de “${item.nome}” disponível(is).`);
      return;
    }
    setCart(previous => {
      const found = previous.find(entry => entry.id === item.id && entry.origem === item.origem);
      return found
        ? previous.map(entry => entry.id === item.id && entry.origem === item.origem ? { ...entry, quantidade: entry.quantidade + 1 } : entry)
        : [...previous, { ...item, valor: price, quantidade: 1 }];
    });
  };
  const removeFromCart = (id: string) => setCart(previous => previous.filter(item => item.id !== id));
  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) return removeFromCart(id);
    const item = cart.find(entry => entry.id === id);
    if (item?.origem === 'produto' && quantity > (item.quantidadeDisponivel ?? 0)) {
      toast.error(`Há somente ${item.quantidadeDisponivel ?? 0} unidade(s) de “${item.nome}” disponível(is).`);
      return;
    }
    setCart(previous => previous.map(entry => entry.id === id ? { ...entry, quantidade: quantity } : entry));
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.valor * item.quantidade, 0), [cart]);
  const discountValue = discount.trim() === '' ? 0 : calcularDesconto(subtotal, discount, discountMode);
  const discountAboveLimit = discountValue !== null && subtotal > 0 && discountValue > subtotal * DESCONTO_MAXIMO + 1e-9;
  const discountInvalid = discountValue === null || discountValue < 0 || discountValue > subtotal
    || (subtotal > 0 && discountValue >= subtotal) || !temPrecisaoDeCentavos(discountValue) || discountAboveLimit;
  const discountReasonMissing = (discountValue ?? 0) > 0 && discountReason.trim().length < 3;
  const total = Math.max(0, subtotal - (discountValue ?? 0));
  const cashGivenValue = paymentMethod === 'dinheiro' ? parseMoneyInput(cashGiven) : null;
  const change = cashGivenValue === null ? null : calcularTroco(total, cashGivenValue);
  const containsExam = cart.some(item => item.origem === 'exame');
  const hasUnsavedChanges = cart.length > 0 || discount.trim().length > 0 || discountReason.trim().length > 0 || manualName.trim().length > 0
    || manualAmount.trim().length > 0 || patientId !== null || paymentMethod !== 'dinheiro';

  useEffect(() => { navigationAllowed.current = false; }, [location.pathname, location.search]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const saleMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id || !cashQuery.data?.id || !cashQuery.data.aberto) throw new Error('O caixa de hoje não está aberto. Atualize os dados antes de registrar a venda.');
      if (!cart.length) throw new Error('Adicione pelo menos um item à venda.');
      if (discountInvalid) throw new Error(discountAboveLimit ? 'O desconto máximo é 50% do subtotal.' : 'O desconto deve ser menor que o subtotal para manter um valor de venda maior que zero.');
      if (discountReasonMissing) throw new Error('Informe o motivo do desconto.');
      if (!Number.isFinite(total) || total <= 0) throw new Error('O total da venda deve ser maior que zero.');
      if (containsExam && !patientId) throw new Error('Selecione um paciente para registrar os exames vendidos no prontuário.');

      const itens = cart.map(item => `${item.nome}${item.quantidade > 1 ? ` x${item.quantidade}` : ''}`).join(', ');
      // O motivo do desconto fica na descrição do lançamento, que é o que o caixa mostra.
      const description = (discountValue ?? 0) > 0 ? `${itens} · Desconto: ${discountReason.trim()}`.slice(0, 500) : itens;
      const amountCharged = cart.reduce((sum, item) => sum + item.valor * item.quantidade, 0);
      const fingerprint = JSON.stringify({
        clinic: profile.clinica_id, patient: patientId, date: today,
        items: cart.map(({ id, origem, quantidade, valor }) => ({ id, origem, quantidade, valor })),
        forma: paymentMethod, pago: total,
      });
      if (idempotencyRef.current?.fingerprint !== fingerprint) idempotencyRef.current = { fingerprint, key: novaChave() };
      const idempotency = idempotencyRef.current;
      if (!idempotency) throw new Error('Não foi possível proteger esta venda contra duplicidade. Tente novamente.');
      const productsToSell = cart.filter(item => item.origem === 'produto').map(item => ({ item_id: item.id, quantidade: item.quantidade }));
      const examsToSell = cart.filter(item => item.origem === 'exame').map(item => ({ nome: item.nome, quantidade: item.quantidade, valor: item.valor }));
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        functionName: 'registrar_venda_pdv',
        args: {
          p_chave: string; p_clinica_id: string; p_paciente_id: string | null; p_data: string;
          p_descricao: string; p_valor_cobrado: number; p_valor_pago: number; p_forma_pagamento: string;
          p_produtos: typeof productsToSell; p_exames: typeof examsToSell;
        },
      ) => Promise<{ data: VendaPdvResultado[] | null; error: { message: string } | null }>;
      const { data, error } = await rpc('registrar_venda_pdv', {
        p_chave: idempotency.key,
        p_clinica_id: profile.clinica_id,
        p_paciente_id: patientId,
        p_data: today,
        p_descricao: description,
        p_valor_cobrado: Number(amountCharged.toFixed(2)),
        p_valor_pago: Number(total.toFixed(2)),
        p_forma_pagamento: paymentMethod,
        p_produtos: productsToSell,
        p_exames: examsToSell,
      });
      if (error) throw error;
      if (!data?.[0]?.lancamento_id) throw new Error('O caixa não confirmou o registro da venda. Atualize a tela antes de tentar novamente.');
      return { alreadyRegistered: data[0].ja_registrada, linkedToPatient: Boolean(patientId) };
    },
    onSuccess: async result => {
      idempotencyRef.current = null;
      toast.success(result.alreadyRegistered
        ? 'Venda já estava registrada. O estoque não foi baixado novamente.'
        : result.linkedToPatient ? 'Venda registrada e vinculada ao paciente.' : 'Venda registrada.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['exames'] }),
        queryClient.invalidateQueries({ queryKey: ['produtos-caixa', profile?.clinica_id] }),
        queryClient.invalidateQueries({ queryKey: ['estoque'] }),
      ]);
      navigationAllowed.current = true;
      navigate(returnTo, { replace: true, state: { cashTab: returnTab } });
    },
    onError: async error => {
      setSubmitError(mensagemDeErro(error));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['produtos-caixa', profile?.clinica_id] }),
        queryClient.invalidateQueries({ queryKey: ['estoque'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos-caixa'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
      ]);
    },
  });

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedChanges && !saleMutation.isPending && !navigationAllowed.current
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));

  const cashGivenInvalid = paymentMethod === 'dinheiro' && cashGiven.trim() !== '' && (change === null);
  const canSubmit = cart.length > 0 && !discountInvalid && !discountReasonMissing && !cashGivenInvalid && (!containsExam || Boolean(patientId)) && !saleMutation.isPending;
  const finalizar = () => { if (!canSubmit) return; setSubmitError(''); saleMutation.mutate(); };
  const finalizarRef = useRef(finalizar);
  finalizarRef.current = finalizar;

  // Atalhos do balcão: F2 busca, F4 desconto, F9 finaliza, Esc limpa a busca.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (event.key === 'F2') { event.preventDefault(); searchRef.current?.focus(); }
      else if (event.key === 'F4') { event.preventDefault(); discountRef.current?.focus(); }
      else if (event.key === 'F9') { event.preventDefault(); finalizarRef.current(); }
      else if (event.key === 'Escape' && document.activeElement === searchRef.current && searchRef.current?.value) { event.preventDefault(); setCatalogSearch(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  /** Enter na busca adiciona o primeiro resultado da aba aberta. */
  const adicionarPrimeiroResultado = () => {
    if (catalogTab === 'consultas' && consultations[0]) addToCart({ id: consultations[0].id, nome: consultations[0].nome, valor: toMoney(consultations[0].valor_particular), origem: 'consulta' });
    else if (catalogTab === 'exames' && exams[0]) addToCart({ id: exams[0].id, nome: exams[0].nome, valor: exams[0].valor, origem: 'exame' });
    else if (catalogTab === 'produtos' && products[0]) addToCart({ id: products[0].id, nome: products[0].nome, valor: toMoney(products[0].valor_venda), origem: 'produto', quantidadeDisponivel: Number(products[0].quantidade) || 0 });
  };
  const busy = cashQuery.isLoading;
  const backToRegister = () => navigate(returnTo, { state: { cashTab: returnTab } });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 pb-40 sm:px-6 xl:pb-8">
      <PageHeader
        title="Ponto de venda"
        description={cashQuery.data ? `${format(new Date(`${cashQuery.data.data}T12:00:00`), 'dd/MM/yyyy')} · abertura de ${moeda(Number(cashQuery.data.valor_abertura))}` : 'Venda de consultas, exames e produtos no caixa diário.'}
        icon={<Receipt />}
        actions={<Button variant="outline" onClick={backToRegister} disabled={saleMutation.isPending}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao caixa</Button>}
      />

      {busy ? (
        <div aria-busy="true" className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="h-5 w-2/5 animate-pulse rounded bg-muted" /><div className="h-32 w-full animate-pulse rounded bg-muted" />
        </div>
      ) : cashQuery.isError ? (
        <ErrorState title="Não foi possível conferir o caixa" error={cashQuery.error} onRetry={() => void cashQuery.refetch()} />
      ) : !cashQuery.data?.aberto ? (
        <section role="status" className="space-y-3 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Caixa não disponível para vendas</h2>
          <p className="text-sm text-muted-foreground">Abra o caixa de hoje antes de registrar vendas.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={backToRegister}>Ir ao caixa diário</Button>
            {!cashQuery.data && <Button variant="outline" onClick={() => navigate('/recepcao/caixa/abrir', { state: { returnTo, cashTab: returnTab } })}>Abrir caixa</Button>}
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(350px,0.85fr)]">
          <section aria-labelledby="cash-sale-catalog-title" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 id="cash-sale-catalog-title" className="text-lg font-semibold">Catálogo</h2>
                <p className="text-sm text-muted-foreground">Encontre o item e adicione ao carrinho.</p>
              </div>
              <Badge variant="outline" className="gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Caixa aberto</Badge>
            </div>
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input ref={searchRef} className="h-11 pl-9" placeholder="Buscar consulta, exame ou produto (F2)" aria-label="Buscar consulta, exame ou produto" aria-keyshortcuts="F2" value={catalogSearch}
                onChange={event => setCatalogSearch(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); adicionarPrimeiroResultado(); } }} />
            </div>
            <p className="hidden text-xs text-muted-foreground md:block">Atalhos: F2 buscar · Enter adiciona o primeiro item · F4 desconto · F9 finalizar · Esc limpa a busca</p>
            <Tabs value={catalogTab} onValueChange={value => setCatalogTab(value as CatalogoTab)}>
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
                <TabsTrigger value="consultas" className="min-h-10 gap-1.5"><Stethoscope className="h-4 w-4" />Consultas</TabsTrigger>
                <TabsTrigger value="exames" className="min-h-10 gap-1.5"><FlaskConical className="h-4 w-4" />Exames</TabsTrigger>
                <TabsTrigger value="produtos" className="min-h-10 gap-1.5"><ShoppingBag className="h-4 w-4" />Produtos</TabsTrigger>
                <TabsTrigger value="manual" className="min-h-10 gap-1.5"><FileText className="h-4 w-4" />Manual</TabsTrigger>
              </TabsList>

              <TabsContent value="consultas" className="mt-3">
                {consultationQuery.isError ? (
                  <div role="alert" className="space-y-2 py-6 text-center"><p className="text-sm text-destructive">Não foi possível carregar os tipos de consulta.</p><Button size="sm" variant="outline" onClick={() => void consultationQuery.refetch()}>Tentar novamente</Button></div>
                ) : consultationQuery.isLoading ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Carregando consultas…</p>
                  : consultations.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum tipo de consulta corresponde à busca.</p>
                    : <div className="divide-y divide-border rounded-md border border-border">{consultations.map(item => (
                      <button key={item.id} type="button" onClick={() => addToCart({ id: item.id, nome: item.nome, valor: toMoney(item.valor_particular), origem: 'consulta' })} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="font-medium">{item.nome}</span><span className="shrink-0 font-semibold tabular-nums text-primary">{moeda(toMoney(item.valor_particular))}</span>
                      </button>
                    ))}</div>}
              </TabsContent>

              <TabsContent value="exames" className="mt-3">
                {!examQuery.isError && !examQuery.isLoading && exams.length > 0 && <p className="mb-2 text-xs text-muted-foreground">Venda direta usa o preço particular cadastrado para o exame.</p>}
                {examQuery.isError ? <div role="alert" className="space-y-2 py-6 text-center"><p className="text-sm text-destructive">Não foi possível carregar os preços dos exames.</p><Button size="sm" variant="outline" onClick={() => void examQuery.refetch()}>Tentar novamente</Button></div>
                  : examQuery.isLoading ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Carregando exames…</p>
                    : exams.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum exame com preço cadastrado.</p>
                      : <div className="divide-y divide-border rounded-md border border-border">{exams.map(item => (
                        <button key={item.id} type="button" onClick={() => addToCart({ id: item.id, nome: item.nome, valor: item.valor, origem: 'exame' })} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="font-medium">{item.nome}</span><span className="shrink-0 font-semibold tabular-nums text-primary">{moeda(item.valor)}</span>
                        </button>
                      ))}</div>}
              </TabsContent>

              <TabsContent value="produtos" className="mt-3">
                {productQuery.isError ? <div role="alert" className="space-y-2 py-6 text-center"><p className="text-sm text-destructive">Não foi possível carregar o estoque para venda.</p><Button size="sm" variant="outline" onClick={() => void productQuery.refetch()}>Tentar novamente</Button></div>
                  : productQuery.isLoading ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">Carregando estoque…</p>
                    : products.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground"><p>{matchingExpiredProducts ? 'Não há produtos válidos para venda nesta busca.' : 'Nenhum produto disponível no estoque.'}</p>{matchingExpiredProducts && <p className="mt-1 text-xs">Itens vencidos não podem ser vendidos.</p>}</div>
                      : <div className="divide-y divide-border rounded-md border border-border">{products.map(item => (
                        <button key={item.id} type="button" disabled={Number(item.quantidade) <= 0} onClick={() => addToCart({ id: item.id, nome: item.nome, valor: toMoney(item.valor_venda), origem: 'produto', quantidadeDisponivel: Number(item.quantidade) || 0 })} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                          <span className="min-w-0"><span className="block truncate font-medium">{item.nome}</span><span className="text-xs text-muted-foreground">{item.categoria} · Estoque: {item.quantidade}</span></span><span className="shrink-0 font-semibold tabular-nums text-primary">{moeda(toMoney(item.valor_venda))}</span>
                        </button>
                      ))}</div>}
              </TabsContent>

              <TabsContent value="manual" className="mt-3 space-y-4 rounded-md border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">Use um item manual quando ele não estiver nos catálogos. O registro não baixa estoque nem cria exame no prontuário.</p>
                <div className="space-y-2"><Label htmlFor="cash-sale-manual-name">Nome do item <span className="text-destructive">*</span></Label><Input id="cash-sale-manual-name" value={manualName} onChange={event => setManualName(event.target.value)} placeholder="Ex.: taxa de material" /></div>
                <div className="space-y-2"><Label htmlFor="cash-sale-manual-amount">Valor (R$) <span className="text-destructive">*</span></Label><Input id="cash-sale-manual-amount" type="text" inputMode="decimal" value={manualAmount} onChange={event => setManualAmount(event.target.value)} placeholder="0,00" /></div>
                <Button type="button" variant="outline" disabled={!manualName.trim() || !parseMoneyInput(manualAmount) || !temPrecisaoDeCentavos(parseMoneyInput(manualAmount) ?? 0)} onClick={() => {
                  const value = parseMoneyInput(manualAmount);
                  if (value === null || value <= 0) return;
                  addToCart({ id: `manual-${novaChave()}`, nome: manualName.trim(), valor: value, origem: 'manual' });
                  setManualName(''); setManualAmount('');
                }}><Plus className="mr-2 h-4 w-4" />Adicionar ao carrinho</Button>
              </TabsContent>
            </Tabs>
          </section>

          <aside aria-labelledby="cash-sale-summary-title" className="min-w-0 border-t border-border pt-5 xl:sticky xl:top-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pr-12 xl:pt-0">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div><h2 id="cash-sale-summary-title" className="text-lg font-semibold">Conferência da venda</h2><p className="text-sm text-muted-foreground">{cart.length} {cart.length === 1 ? 'item' : 'itens'} no carrinho</p></div>
              {cart.length > 0 && <Button variant="ghost" size="sm" onClick={() => setCart([])}>Limpar carrinho</Button>}
            </div>

            {cart.length === 0 ? <div className="border-b border-border py-8 text-center text-sm text-muted-foreground"><ShoppingCart className="mx-auto mb-2 h-7 w-7 opacity-40" /><p>Adicione consultas, exames ou produtos.</p></div>
              : <ul aria-label="Itens da venda" className="divide-y divide-border">{cart.map(item => (
                <li key={`${item.origem}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{item.nome}</p><p className="text-xs text-muted-foreground">{item.origem === 'produto' ? `${ROTULO_ORIGEM.produto} · estoque: ${item.quantidadeDisponivel}` : ROTULO_ORIGEM[item.origem]}</p></div>
                  <div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Diminuir quantidade de ${item.nome}`} onClick={() => updateQuantity(item.id, item.quantidade - 1)}><Minus className="h-4 w-4" /></Button><span className="w-6 text-center tabular-nums" aria-label={`Quantidade: ${item.quantidade}`}>{item.quantidade}</span><Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Aumentar quantidade de ${item.nome}`} disabled={item.origem === 'produto' && item.quantidade >= (item.quantidadeDisponivel ?? 0)} onClick={() => updateQuantity(item.id, item.quantidade + 1)}><Plus className="h-4 w-4" /></Button><span className="w-24 text-right font-medium tabular-nums">{moeda(item.valor * item.quantidade)}</span><Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label={`Remover ${item.nome} da venda`} onClick={() => removeFromCart(item.id)}><Trash2 className="h-4 w-4" /></Button></div>
                </li>
              ))}</ul>}

            <div className="space-y-3 border-b border-border py-3">
              <div className="space-y-2"><Label id="cash-sale-patient-label">Paciente <span className="font-normal text-muted-foreground">(opcional, obrigatório para exames)</span></Label>
                {patientId ? <div className="flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 p-3"><div className="flex min-w-0 items-center gap-2"><User className="h-4 w-4 shrink-0 text-primary" /><span className="truncate text-sm font-medium">{patientName}</span></div><Button variant="ghost" size="icon" aria-label="Remover paciente selecionado" onClick={() => { setPatientId(null); setPatientName(''); }}><X className="h-4 w-4" /></Button></div>
                  : <Popover open={patientPickerOpen} onOpenChange={setPatientPickerOpen}><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-muted-foreground" aria-labelledby="cash-sale-patient-label"><Search className="mr-2 h-4 w-4" />Vincular paciente</Button></PopoverTrigger><PopoverContent className="w-[min(90vw,360px)] p-0" align="start"><Command shouldFilter={false}><CommandInput placeholder="Nome, CPF ou telefone…" value={patientSearch} onValueChange={setPatientSearch} /><CommandList>{patientQuery.isError ? <div role="alert" className="space-y-2 p-4 text-sm"><p>Não foi possível buscar pacientes.</p><Button size="sm" variant="outline" onClick={() => void patientQuery.refetch()}>Tentar novamente</Button></div> : isSearchingPatients ? <div role="status" className="p-4 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Buscando pacientes…</div> : patients.length === 0 ? <CommandEmpty>Nenhum paciente encontrado.</CommandEmpty> : <CommandGroup>{patients.map(patient => <CommandItem key={patient.id} value={patient.id} onSelect={() => { setPatientId(patient.id); setPatientName(patient.nome_social || patient.nome); setPatientPickerOpen(false); setPatientSearch(''); }}><span className="flex flex-col"><span>{patient.nome_social || patient.nome}</span>{patient.cpf && <span className="text-xs text-muted-foreground">CPF: {patient.cpf}</span>}</span></CommandItem>)}</CommandGroup>}{patientQuery.data?.incompleta && <p role="status" className="border-t px-3 py-2 text-xs text-muted-foreground">Há mais pacientes; digite mais caracteres para refinar a busca.</p>}</CommandList></Command></PopoverContent></Popover>}
                {containsExam && !patientId && <p role="status" className="text-xs text-warning-foreground">Selecione um paciente para registrar exames vendidos.</p>}
                {patientId && containsExam && <p className="text-xs text-muted-foreground">Os exames serão vinculados ao prontuário deste paciente.</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="cash-sale-discount">Desconto {discountMode === 'reais' ? '(R$)' : '(%)'}</Label>
                  <div role="group" aria-label="Tipo de desconto" className="flex gap-1">
                    {(['reais', 'percentual'] as const).map(modo => <Button key={modo} type="button" size="sm" variant={discountMode === modo ? 'default' : 'outline'} aria-pressed={discountMode === modo} className="h-11 min-w-11 px-3" onClick={() => { setDiscountMode(modo); setDiscount(''); }}>{modo === 'reais' ? 'R$' : '%'}</Button>)}
                  </div>
                </div>
                <Input ref={discountRef} id="cash-sale-discount" type="text" inputMode="decimal" placeholder={discountMode === 'reais' ? '0,00' : '0'} aria-keyshortcuts="F4" value={discount} onChange={event => { setDiscount(event.target.value); setSubmitError(''); }} aria-invalid={discount.trim().length > 0 && discountInvalid} aria-describedby="cash-sale-discount-help" />
                <p id="cash-sale-discount-help" className="text-xs text-muted-foreground">{discountMode === 'percentual' && discountValue !== null && discountValue > 0 ? `Equivale a ${moeda(discountValue)}. ` : ''}Máximo de 50% do subtotal.</p>
                {discount.trim().length > 0 && discountInvalid && <p role="alert" className="text-xs text-destructive">{discountAboveLimit ? `O desconto máximo é 50% do subtotal (${moeda(subtotal * DESCONTO_MAXIMO)}).` : `Informe desconto válido menor que o subtotal de ${moeda(subtotal)}.`}</p>}
              </div>
              {(discountValue ?? 0) > 0 && (
                <div className="space-y-2"><Label htmlFor="cash-sale-discount-reason">Motivo do desconto <span className="text-destructive">*</span></Label><Input id="cash-sale-discount-reason" maxLength={120} placeholder="Ex.: retorno, cortesia, convênio parceiro" value={discountReason} onChange={event => setDiscountReason(event.target.value)} aria-invalid={discountReasonMissing} /></div>
              )}
              <fieldset className="space-y-2"><legend className="text-sm font-medium">Forma de pagamento</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{FORMAS.map(({ value, label, icon: Icon }) => <Button key={value} type="button" variant={paymentMethod === value ? 'default' : 'outline'} aria-pressed={paymentMethod === value} className="min-h-11 gap-1.5" onClick={() => setPaymentMethod(value)}><Icon aria-hidden="true" className="h-4 w-4" />{label}</Button>)}</div></fieldset>
              {paymentMethod === 'dinheiro' && (
                <div className="space-y-2">
                  <Label htmlFor="cash-sale-cash-given">Valor entregue pelo cliente (R$) <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Input id="cash-sale-cash-given" type="text" inputMode="decimal" placeholder="0,00" value={cashGiven} onChange={event => setCashGiven(event.target.value)} aria-invalid={cashGivenInvalid} aria-describedby="cash-sale-change" />
                  <p id="cash-sale-change" aria-live="polite" className={cashGivenInvalid ? 'text-xs text-destructive' : 'text-sm'}>{cashGivenInvalid ? `O valor entregue é menor que o total de ${moeda(total)}.` : change !== null ? <>Troco: <span className="font-semibold tabular-nums">{moeda(change)}</span></> : null}</p>
                </div>
              )}
            </div>

            <dl className="space-y-2 py-3"><div className="flex justify-between gap-3 text-sm"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-medium tabular-nums">{moeda(subtotal)}</dd></div>{discountValue !== null && discountValue > 0 && <div className="flex justify-between gap-3 text-sm"><dt className="text-muted-foreground">Desconto</dt><dd className="font-medium tabular-nums">− {moeda(discountValue)}</dd></div>}<div className="flex items-baseline justify-between gap-3 border-t border-border pt-3"><dt className="font-semibold">Total a cobrar</dt><dd className="text-2xl font-semibold tabular-nums text-primary">{moeda(total)}</dd></div></dl>

            {submitError && <div role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Não foi possível confirmar a venda. {submitError}</div>}
            <Button className="hidden min-h-12 w-full gap-2 xl:flex" aria-keyshortcuts="F9" disabled={!canSubmit} onClick={finalizar}>{saleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Finalizar venda (F9)</Button>
            {/* No celular e no tablet o total fica fixo no rodapé, sempre à vista. */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_rgba(16,17,19,0.06)] backdrop-blur xl:hidden">
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                <div className="min-w-0" aria-live="polite">
                  <p className="text-xs text-muted-foreground">{cart.length} {cart.length === 1 ? 'item' : 'itens'} · total</p>
                  <p className="text-xl font-semibold tabular-nums">{moeda(total)}</p>
                </div>
                <Button className="min-h-12 gap-2 px-5" disabled={!canSubmit} onClick={finalizar}>{saleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Finalizar venda</Button>
              </div>
            </div>
            {saleMutation.isPending && <p role="status" className="mt-2 text-center text-xs text-muted-foreground">Confirmando venda e baixa de estoque…</p>}
          </aside>
        </div>
      )}

      <UnsavedChangesDialog
        open={blocker.state === 'blocked'}
        onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }}
        onConfirm={() => { if (blocker.state === 'blocked') { navigationAllowed.current = true; blocker.proceed(); } }}
      />
    </div>
  );
}
