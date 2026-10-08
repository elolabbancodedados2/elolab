import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import { addMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle, ArrowLeft, Barcode, Check, CheckCircle2, Clock, Copy, CreditCard, ExternalLink,
  Gift, Loader2, Lock, QrCode, RefreshCw, ShieldCheck, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorState } from '@/components/ErrorState';
import { formatCEP, formatCNPJ, formatCPF } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  type BoletoPayer,
  type PlanOrder,
  OPEN_ORDER_STATUSES,
  useBillingStatus,
  useCancelPlanOrder,
  useCreateCardSubscription,
  useCreatePlanOrder,
  usePlanOrder,
} from '@/hooks/usePlanCheckout';

type Metodo = 'cartao' | 'pix' | 'boleto';

/** Device ID criado pelo MercadoPago.js V2 (window.MP_DEVICE_SESSION_ID). */
function deviceIdMercadoPago(): string | undefined {
  const id = (window as unknown as { MP_DEVICE_SESSION_ID?: unknown }).MP_DEVICE_SESSION_ID;
  return typeof id === 'string' && id ? id : undefined;
}

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const featureLabels: Record<string, string> = {
  agenda: 'Agenda e agendamento online',
  pacientes: 'Gestão de pacientes',
  prontuarios: 'Prontuário eletrônico',
  prescricoes: 'Prescrições e atestados',
  financeiro: 'Módulo financeiro',
  exames: 'Módulo de exames',
  estoque: 'Controle de estoque',
  relatorios: 'Relatórios',
  automacoes: 'Automações',
  agente_ia: 'Agente IA no WhatsApp',
  chatbot_whatsapp: 'Chatbot atendente 24h',
};

function periodoLabel(meses: number) {
  if (meses === 12) return 'ano';
  if (meses === 1) return 'mês';
  return `${meses} meses`;
}

function copiar(texto: string, rotulo: string) {
  navigator.clipboard.writeText(texto)
    .then(() => toast.success(`${rotulo} copiado`))
    .catch(() => toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.'));
}

function useTempoRestante(expiraEm: string | null) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!expiraEm) return;
    const id = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [expiraEm]);
  if (!expiraEm) return null;
  const ms = new Date(expiraEm).getTime() - agora;
  if (ms <= 0) return 'expirado';
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);
  return horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;
}

// ─── Seletor de forma de pagamento ──────────────────────────────────────────

const metodos: { id: Metodo; titulo: string; descricao: string; icon: typeof CreditCard; selo?: string }[] = [
  { id: 'cartao', titulo: 'Cartão de crédito', descricao: 'Renova automaticamente', icon: CreditCard, selo: 'Recomendado' },
  { id: 'pix', titulo: 'Pix', descricao: 'Aprovação na hora', icon: QrCode },
  { id: 'boleto', titulo: 'Boleto', descricao: 'Até 3 dias úteis', icon: Barcode },
];

function SeletorMetodo({ valor, onChange, bloqueados }: { valor: Metodo; onChange: (m: Metodo) => void; bloqueados: Metodo[] }) {
  return (
    <div role="radiogroup" aria-label="Forma de pagamento" className="grid gap-3 sm:grid-cols-3">
      {metodos.map(({ id, titulo, descricao, icon: Icon, selo }) => {
        const ativo = valor === id;
        const bloqueado = bloqueados.includes(id);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={bloqueado}
            onClick={() => onChange(id)}
            className={cn(
              'relative flex items-start gap-3 rounded-xl border-2 bg-card p-4 text-left transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              ativo ? 'border-primary shadow-md shadow-primary/10' : 'border-border hover:border-primary/40',
              bloqueado && 'cursor-not-allowed opacity-50',
            )}
          >
            <div className={cn('rounded-lg p-2', ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">{titulo}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
            </div>
            {selo && (
              <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                {selo}
              </span>
            )}
            {ativo && <Check className="absolute bottom-3 right-3 h-4 w-4 text-primary" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Cartão (assinatura recorrente) ─────────────────────────────────────────

function PagamentoCartao({
  planoSlug, valor, trialDias, publicKey, onAprovado,
}: {
  planoSlug: string;
  valor: number;
  trialDias: number;
  publicKey: string | null;
  onAprovado: (info: { emTrial: boolean; emAnalise: boolean }) => void;
}) {
  const criar = useCreateCardSubscription();
  const [pronto, setPronto] = useState(false);
  const [brickKey, setBrickKey] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (publicKey) initMercadoPago(publicKey, { locale: 'pt-BR' });
  }, [publicKey]);

  if (!publicKey) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Pagamento com cartão indisponível</AlertTitle>
        <AlertDescription>A chave pública do Mercado Pago não está configurada. Use Pix ou boleto, ou tente mais tarde.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          {trialDias > 0
            ? <>Nada é cobrado hoje. Após {trialDias} dias de teste, cobramos {brl(valor)} automaticamente a cada período. Cancele quando quiser.</>
            : <>Cobrança automática de {brl(valor)} a cada período no mesmo cartão. Cancele quando quiser em Planos.</>}
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Pagamento não aprovado</AlertTitle>
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {!pronto && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando formulário seguro do Mercado Pago…
        </div>
      )}

      <div className={cn(!pronto && 'hidden')}>
        <CardPayment
          key={brickKey}
          locale="pt-BR"
          initialization={{ amount: valor }}
          customization={{
            paymentMethods: { maxInstallments: 1, types: { included: ['credit_card'] } },
            visual: {
              hideFormTitle: true,
              style: {
                theme: 'default',
                customVariables: { baseColor: '#10b981', borderRadiusMedium: '10px', borderRadiusLarge: '12px' },
              },
              texts: { formSubmit: trialDias > 0 ? 'Começar teste grátis' : `Assinar por ${brl(valor)}` },
            },
          }}
          onReady={() => setPronto(true)}
          onError={(error) => {
            console.error('Card Payment Brick:', error);
            if (error?.type === 'critical') setErro('O formulário do cartão não carregou. Recarregue a página ou use Pix/boleto.');
          }}
          onSubmit={async (formData) => {
            setErro(null);
            try {
              const result = await criar.mutateAsync({
                plano_slug: planoSlug, card_token_id: formData.token, trial_dias: trialDias, device_id: deviceIdMercadoPago(),
              });
              if (result.status === 'recusado') throw new Error('O cartão foi recusado. Use outro cartão ou forma de pagamento.');
              onAprovado({ emTrial: result.em_trial, emAnalise: result.status === 'em_analise' });
            } catch (error) {
              setErro(error instanceof Error ? error.message : 'Não foi possível concluir o pagamento.');
              // O token do cartão é de uso único: recria o formulário para nova tentativa.
              setPronto(false);
              setBrickKey((k) => k + 1);
              throw error;
            }
          }}
        />
      </div>
    </div>
  );
}

// ─── Pix ────────────────────────────────────────────────────────────────────

function InstrucoesPix({ pedido }: { pedido: PlanOrder }) {
  const restante = useTempoRestante(pedido.expira_em);
  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
      <div className="mx-auto rounded-2xl border bg-white p-3 shadow-sm">
        {pedido.qr_code_base64
          ? <img src={`data:image/png;base64,${pedido.qr_code_base64}`} alt="QR Code Pix" className="h-48 w-48" />
          : <div className="flex h-48 w-48 items-center justify-center text-sm text-muted-foreground">QR Code indisponível</div>}
      </div>
      <div className="space-y-4">
        <ol className="space-y-1.5 text-sm text-muted-foreground">
          <li><span className="font-semibold text-foreground">1.</span> Abra o app do seu banco e escolha pagar com Pix.</li>
          <li><span className="font-semibold text-foreground">2.</span> Leia o QR Code ou use o Pix Copia e Cola.</li>
          <li><span className="font-semibold text-foreground">3.</span> Confirme {brl(pedido.valor)}. A liberação é automática.</li>
        </ol>
        {pedido.qr_code && (
          <div className="space-y-1.5">
            <Label htmlFor="pix-copia-cola">Pix Copia e Cola</Label>
            <div className="flex gap-2">
              <Input id="pix-copia-cola" readOnly value={pedido.qr_code} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" onClick={() => copiar(pedido.qr_code!, 'Código Pix')} className="shrink-0 gap-1.5">
                <Copy className="h-4 w-4" /> Copiar
              </Button>
            </div>
          </div>
        )}
        {restante && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {restante === 'expirado' ? 'Este Pix venceu. Gere um novo.' : `Vence em ${restante}`}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Boleto ─────────────────────────────────────────────────────────────────

const pagadorVazio: BoletoPayer = {
  first_name: '', last_name: '', document: '', zip_code: '', street_name: '',
  street_number: '', neighborhood: '', city: '', state: '',
};

function FormularioPagador({
  metodo, onSubmit, enviando,
}: { metodo: 'pix' | 'boleto'; onSubmit: (p: BoletoPayer) => void; enviando: boolean }) {
  const [p, setP] = useState<BoletoPayer>(pagadorVazio);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const set = (campo: keyof BoletoPayer) => (e: React.ChangeEvent<HTMLInputElement>) => setP((prev) => ({ ...prev, [campo]: e.target.value }));
  const boleto = metodo === 'boleto';

  const buscarCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = res.ok ? await res.json() : null;
      if (data && !data.erro) {
        setP((prev) => ({
          ...prev,
          street_name: data.logradouro || prev.street_name,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch {
      // Endereço pode ser preenchido manualmente.
    } finally {
      setBuscandoCep(false);
    }
  };

  return (
    <form
      className="grid gap-4 sm:grid-cols-6"
      onSubmit={(e) => { e.preventDefault(); onSubmit(p); }}
    >
      <div className="space-y-1.5 sm:col-span-3">
        <Label htmlFor="b-nome">Nome</Label>
        <Input id="b-nome" required autoComplete="given-name" value={p.first_name} onChange={set('first_name')} />
      </div>
      <div className="space-y-1.5 sm:col-span-3">
        <Label htmlFor="b-sobrenome">Sobrenome</Label>
        <Input id="b-sobrenome" required autoComplete="family-name" value={p.last_name} onChange={set('last_name')} />
      </div>
      <div className="space-y-1.5 sm:col-span-3">
        <Label htmlFor="b-doc">CPF ou CNPJ</Label>
        <Input
          id="b-doc" required inputMode="numeric" value={p.document}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 14);
            setP((prev) => ({ ...prev, document: digits.length > 11 ? formatCNPJ(digits) : formatCPF(digits) }));
          }}
        />
      </div>
      {/* Endereço também no Pix: o Mercado Pago avalia payer.address em toda order. */}
      <>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="b-cep">CEP</Label>
          <div className="relative">
            <Input
              id="b-cep" required inputMode="numeric" autoComplete="postal-code" value={p.zip_code}
              onChange={(e) => {
                const value = formatCEP(e.target.value);
                setP((prev) => ({ ...prev, zip_code: value }));
                void buscarCep(value);
              }}
            />
            {buscandoCep && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-4">
          <Label htmlFor="b-rua">Rua</Label>
          <Input id="b-rua" required autoComplete="address-line1" value={p.street_name} onChange={set('street_name')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="b-numero">Número</Label>
          <Input id="b-numero" required placeholder="Número ou S/N" value={p.street_number} onChange={set('street_number')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="b-bairro">Bairro</Label>
          <Input id="b-bairro" required value={p.neighborhood} onChange={set('neighborhood')} />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="b-cidade">Cidade</Label>
          <Input id="b-cidade" required autoComplete="address-level2" value={p.city} onChange={set('city')} />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="b-uf">UF</Label>
          <Input id="b-uf" required maxLength={2} autoComplete="address-level1" value={p.state} onChange={(e) => setP((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))} />
        </div>
      </>
      <Button type="submit" size="lg" className="h-12 gap-2 sm:col-span-6" disabled={enviando}>
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : boleto ? <Barcode className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
        {enviando ? `Gerando ${boleto ? 'boleto' : 'Pix'}…` : `Gerar ${boleto ? 'boleto' : 'Pix'}`}
      </Button>
    </form>
  );
}

function InstrucoesBoleto({ pedido }: { pedido: PlanOrder }) {
  return (
    <div className="space-y-4">
      {pedido.digitable_line && (
        <div className="space-y-1.5">
          <Label htmlFor="linha-digitavel">Linha digitável</Label>
          <div className="flex gap-2">
            <Input id="linha-digitavel" readOnly value={pedido.digitable_line} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" onClick={() => copiar(pedido.digitable_line!, 'Linha digitável')} className="shrink-0 gap-1.5">
              <Copy className="h-4 w-4" /> Copiar
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {pedido.ticket_url && (
          <Button asChild variant="outline" className="gap-2">
            <a href={pedido.ticket_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Abrir boleto
            </a>
          </Button>
        )}
        {pedido.expira_em && (
          <p className="text-sm text-muted-foreground">
            Vencimento: <strong className="text-foreground">{format(new Date(pedido.expira_em), 'dd/MM/yyyy')}</strong>
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        O banco leva até 3 dias úteis para confirmar o pagamento. Assim que compensar, o acesso é liberado automaticamente
        e você pode fechar esta página.
      </p>
    </div>
  );
}

// ─── Pedido Pix/boleto em andamento ─────────────────────────────────────────

function PedidoEmAndamento({ pedidoId, onPago, onNovo }: { pedidoId: string; onPago: (p: PlanOrder) => void; onNovo: () => void }) {
  const { data: pedido, isError, refetch } = usePlanOrder(pedidoId);
  const cancelar = useCancelPlanOrder();

  useEffect(() => {
    if (pedido?.status === 'pago') onPago(pedido);
  }, [pedido, onPago]);

  if (isError) {
    return <ErrorState title="Não foi possível consultar o pagamento" onRetry={() => { void refetch(); }} />;
  }
  if (!pedido) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const aberto = OPEN_ORDER_STATUSES.includes(pedido.status);
  const encerrado: Record<string, { titulo: string; texto: string }> = {
    recusado: { titulo: 'Pagamento recusado', texto: 'O Mercado Pago recusou este pagamento. Gere um novo ou escolha outra forma.' },
    cancelado: { titulo: 'Pagamento cancelado', texto: 'Este pagamento foi cancelado e não será cobrado.' },
    expirado: { titulo: 'Pagamento vencido', texto: 'O prazo deste pagamento terminou. Gere um novo para continuar.' },
    estornado: { titulo: 'Pagamento estornado', texto: 'O valor foi devolvido. Gere um novo pagamento para reativar o plano.' },
    erro: { titulo: 'Não foi possível gerar o pagamento', texto: 'Tente novamente em instantes.' },
  };

  if (!aberto && pedido.status !== 'pago') {
    const info = encerrado[pedido.status] ?? encerrado.erro;
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{info.titulo}</AlertTitle>
          <AlertDescription>{info.texto}</AlertDescription>
        </Alert>
        <Button onClick={onNovo} className="gap-2"><RefreshCw className="h-4 w-4" /> Gerar novo pagamento</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" />
        {pedido.status === 'em_processamento' ? 'Pagamento em processamento…' : 'Aguardando pagamento — esta página atualiza sozinha.'}
      </div>
      {pedido.metodo === 'pix' ? <InstrucoesPix pedido={pedido} /> : <InstrucoesBoleto pedido={pedido} />}
      <div className="border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={cancelar.isPending}
          onClick={() => cancelar.mutate(pedido.id, {
            onSuccess: (p) => { if (p.status !== 'pago') onNovo(); },
            onError: (e) => toast.error(e.message),
          })}
        >
          {cancelar.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
          Cancelar e escolher outra forma
        </Button>
      </div>
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────

type Sucesso = { tipo: 'cartao'; emTrial: boolean; emAnalise: boolean } | { tipo: 'periodo'; pedido: PlanOrder };

export default function PlanoCheckout() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: status, isLoading, isError, error, refetch } = useBillingStatus(slug);

  // MercadoPago.js V2 em toda a página (não só no cartão): gera o Device ID
  // enviado também nos pedidos Pix e boleto.
  useEffect(() => {
    if (status?.public_key) initMercadoPago(status.public_key, { locale: 'pt-BR' });
  }, [status?.public_key]);
  const criarPedido = useCreatePlanOrder();

  const [metodo, setMetodo] = useState<Metodo>(() => {
    const m = searchParams.get('metodo');
    return m === 'pix' || m === 'boleto' ? m : 'cartao';
  });
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<Sucesso | null>(null);

  const plano = status?.plano ?? null;
  const assinatura = status?.assinatura ?? null;
  const temPlanoAtivo = !!assinatura && ['ativa', 'trial'].includes(assinatura.status);
  const recorrenteAtiva = temPlanoAtivo && assinatura?.modalidade !== 'pre_pago';
  const podeTrial = !!plano && plano.trial_dias > 0 && !temPlanoAtivo;
  const [usarTrial, setUsarTrial] = useState(searchParams.get('trial') === '1');
  const trialDias = podeTrial && usarTrial && metodo === 'cartao' ? plano!.trial_dias : 0;

  // Retoma um Pix/boleto do mesmo plano que ainda está aberto.
  useEffect(() => {
    const aberto = status?.pedido_aberto;
    if (aberto && aberto.plano_slug === slug && OPEN_ORDER_STATUSES.includes(aberto.status) && !pedidoId) {
      setMetodo(aberto.metodo);
      setPedidoId(aberto.id);
    }
  }, [status?.pedido_aberto, slug, pedidoId]);

  const periodoFimEstimado = useMemo(() => {
    if (!plano) return null;
    const base = assinatura?.modalidade === 'pre_pago' && assinatura.status === 'ativa' && assinatura.plano_slug === plano.slug && assinatura.data_fim
      && new Date(assinatura.data_fim) > new Date()
      ? new Date(assinatura.data_fim)
      : new Date();
    return addMonths(base, plano.periodo_meses);
  }, [plano, assinatura]);

  if (isLoading) {
    return <div className="flex min-h-[400px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (isError) {
    return <ErrorState title="Não foi possível abrir o checkout" error={error} onRetry={() => { void refetch(); }} />;
  }
  if (!plano) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-dashed p-8 text-center">
        <h1 className="font-semibold">Plano não encontrado</h1>
        <Button asChild className="mt-4" variant="outline"><Link to="/planos">Ver planos</Link></Button>
      </div>
    );
  }

  const gerarPedido = (m: 'pix' | 'boleto', pagador?: BoletoPayer) => {
    criarPedido.mutate(
      { plano_slug: plano.slug, metodo: m, pagador, device_id: deviceIdMercadoPago() },
      {
        onSuccess: (pedido) => setPedidoId(pedido.id),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (sucesso) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-11 w-11 text-success" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {sucesso.tipo === 'cartao' && sucesso.emAnalise ? 'Pagamento em análise' : 'Tudo certo!'}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {sucesso.tipo === 'cartao'
            ? sucesso.emAnalise
              ? 'O Mercado Pago está analisando o cartão. Avisamos assim que for aprovado; não é preciso pagar de novo.'
              : sucesso.emTrial
                ? `Seu teste grátis do ${plano.nome} começou. A primeira cobrança acontece ao final do teste.`
                : `Sua assinatura do ${plano.nome} está ativa e renova automaticamente.`
            : `Pagamento confirmado. O ${plano.nome} está liberado até ${sucesso.pedido.periodo_fim ? format(new Date(sucesso.pedido.periodo_fim), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'o fim do período'}.`}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={() => navigate('/dashboard')}>Ir para o painel</Button>
          <Button size="lg" variant="outline" onClick={() => navigate('/planos')}>Ver meu plano</Button>
        </div>
      </div>
    );
  }

  const precoPeriodo = `${brl(plano.valor)}/${periodoLabel(plano.periodo_meses)}`;
  const totalHoje = trialDias > 0 ? 0 : plano.valor;
  const features = (plano.features || []).filter((f) => featureLabels[f]).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
          <Link to="/planos"><ArrowLeft className="h-4 w-4" /> Voltar aos planos</Link>
        </Button>
        {status?.sandbox && (
          <Badge variant="outline" className="border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
            Ambiente de teste — nenhuma cobrança real
          </Badge>
        )}
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Finalizar contratação</h1>
        <p className="mt-2 text-muted-foreground">Escolha como prefere pagar o {plano.nome}.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start">
        {/* Pagamento */}
        <section aria-labelledby="titulo-pagamento" className="space-y-6">
          <h2 id="titulo-pagamento" className="sr-only">Pagamento</h2>
          <SeletorMetodo
            valor={metodo}
            onChange={(m) => { setMetodo(m); if (pedidoId && m === 'cartao') setPedidoId(null); }}
            bloqueados={pedidoId ? (['cartao', 'pix', 'boleto'] as Metodo[]).filter((m) => m !== metodo) : recorrenteAtiva ? ['pix', 'boleto'] : []}
          />

          {recorrenteAtiva && metodo === 'cartao' && assinatura?.plano_slug !== plano.slug && (
            <Alert>
              <RefreshCw className="h-4 w-4" />
              <AlertTitle>Troca de plano</AlertTitle>
              <AlertDescription>Ao aprovar, a assinatura atual no cartão é encerrada e substituída por esta.</AlertDescription>
            </Alert>
          )}
          {recorrenteAtiva && (
            <p className="text-xs text-muted-foreground">
              Pix e boleto ficam disponíveis depois de cancelar a assinatura recorrente no cartão, para você não ser cobrado duas vezes.
            </p>
          )}

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            {metodo === 'cartao' && (
              <div className="space-y-5">
                {podeTrial && (
                  <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Gift className="h-5 w-5 text-warning" />
                      <div>
                        <Label htmlFor="usar-trial" className="font-medium">Começar com {plano.trial_dias} dias grátis</Label>
                        <p className="text-xs text-muted-foreground">O cartão é validado agora e só é cobrado no fim do teste.</p>
                      </div>
                    </div>
                    <Switch id="usar-trial" checked={usarTrial} onCheckedChange={setUsarTrial} />
                  </div>
                )}
                <PagamentoCartao
                  key={trialDias}
                  planoSlug={plano.slug}
                  valor={plano.valor}
                  trialDias={trialDias}
                  publicKey={status?.public_key ?? null}
                  onAprovado={(info) => setSucesso({ tipo: 'cartao', ...info })}
                />
              </div>
            )}

            {metodo !== 'cartao' && pedidoId && (
              <PedidoEmAndamento
                key={pedidoId}
                pedidoId={pedidoId}
                onPago={(pedido) => setSucesso({ tipo: 'periodo', pedido })}
                onNovo={() => setPedidoId(null)}
              />
            )}

            {metodo === 'pix' && !pedidoId && (
              <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-left text-sm">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    Pagamento único de {brl(plano.valor)} que libera 1 {periodoLabel(plano.periodo_meses)} de acesso
                    {periodoFimEstimado && <> (até {format(periodoFimEstimado, 'dd/MM/yyyy')})</>}. Não renova sozinho:
                    pague o próximo período em Planos antes do vencimento.
                  </p>
                </div>
                <FormularioPagador metodo="pix" enviando={criarPedido.isPending} onSubmit={(p) => gerarPedido('pix', p)} />
              </div>
            )}

            {metodo === 'boleto' && !pedidoId && (
              <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    Pagamento único de {brl(plano.valor)} para 1 {periodoLabel(plano.periodo_meses)} de acesso. O boleto vence em
                    3 dias úteis e o acesso é liberado quando o banco confirmar. Os dados abaixo são exigidos para emitir o boleto.
                  </p>
                </div>
                <FormularioPagador metodo="boleto" enviando={criarPedido.isPending} onSubmit={(p) => gerarPedido('boleto', p)} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-success" /> Pagamento processado pelo Mercado Pago</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Os dados do cartão não passam pelos servidores do EloLab</span>
          </div>
        </section>

        {/* Resumo */}
        <aside aria-labelledby="titulo-resumo" className="lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Resumo</p>
              <h2 id="titulo-resumo" className="mt-1 text-2xl font-bold">{plano.nome}</h2>
              {plano.descricao && <p className="mt-1 text-sm text-muted-foreground">{plano.descricao}</p>}
            </div>
            <div className="space-y-5 p-6">
              {features.length > 0 && (
                <ul className="space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={3} /> {featureLabels[f]}
                    </li>
                  ))}
                </ul>
              )}
              <dl className="space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Plano</dt>
                  <dd>{precoPeriodo}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Cobrança</dt>
                  <dd>{metodo === 'cartao' ? 'Automática' : `Única · ${plano.periodo_meses === 12 ? '12 meses' : `${plano.periodo_meses} ${plano.periodo_meses === 1 ? 'mês' : 'meses'}`}`}</dd>
                </div>
                {trialDias > 0 && (
                  <div className="flex justify-between text-success">
                    <dt>Teste grátis</dt>
                    <dd>{trialDias} dias</dd>
                  </div>
                )}
              </dl>
              <div className="flex items-baseline justify-between border-t pt-4">
                <span className="font-medium">Total hoje</span>
                <span className="text-3xl font-extrabold tracking-tight">{brl(totalHoje)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {metodo === 'cartao'
                  ? `Depois, ${precoPeriodo} no cartão até você cancelar.`
                  : periodoFimEstimado
                    ? `Acesso até ${format(periodoFimEstimado, 'dd/MM/yyyy')} após a confirmação. Sem renovação automática.`
                    : 'Sem renovação automática.'}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
