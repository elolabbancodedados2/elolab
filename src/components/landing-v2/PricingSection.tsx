import { useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock, CreditCard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { usePlanos } from "@/hooks/useSubscriptionPlan";
import { GradientWaveText } from "./gradient-wave-text";

const WHATSAPP_URL = "https://wa.me/5511937687369";

const featureLabels: Record<string, string> = {
  dashboard: "Dashboard", agenda: "Agenda", pacientes: "Gestão de pacientes",
  prontuarios: "Prontuário eletrônico", prescricoes: "Prescrições", atestados: "Atestados",
  exames: "Exames", triagem: "Triagem", fila: "Fila de atendimento", salas: "Salas",
  estoque: "Estoque", financeiro: "Financeiro", relatorios: "Relatórios",
  convenios: "Convênios", funcionarios: "Gestão de equipe", automacoes: "Automações",
  analytics: "Analytics", templates: "Modelos clínicos", encaminhamentos: "Encaminhamentos",
  lista_espera: "Lista de espera", painel_tv: "Painel de chamadas", pagamentos: "Pagamentos",
  agente_ia: "Agente de IA no WhatsApp", chatbot_whatsapp: "Atendimento automatizado no WhatsApp",
};
const premiumFeatures = new Set(["agente_ia", "chatbot_whatsapp"]);
const planPresentation = [{ slug: "elolab-max" as const }, { slug: "elolab-ultra" as const }];

export type PublicPlan = {
  slug: string;
  name: string;
  price: number;
  popular: boolean;
  frequency: string;
  trialDays: number;
  features: string[];
};

export function rotuloFrequencia(frequencia: string) {
  switch (frequencia) {
    case "mensal": return "mês";
    case "trimestral": return "3 meses";
    case "semestral": return "6 meses";
    case "anual": return "12 meses";
    default: return "período";
  }
}

const brl = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

function MIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("material-symbols-outlined select-none leading-none", className)}
      style={{ fontSize: size, fontVariationSettings: "'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24" }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function FadeUp({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SpotlightBorder({ children, className, size = 460, intensity = 0.5, delay = 0 }: {
  children: ReactNode; className?: string; size?: number; intensity?: number; delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds || !ref.current) return;
    ref.current.style.setProperty("--spot-x", (event.clientX - bounds.left) + "px");
    ref.current.style.setProperty("--spot-y", (event.clientY - bounds.top) + "px");
    ref.current.style.setProperty("--spot-active", "1");
  };
  const leave = () => {
    ref.current?.style.setProperty("--spot-x", "-9999px");
    ref.current?.style.setProperty("--spot-y", "-9999px");
    ref.current?.style.setProperty("--spot-active", "0");
  };
  const ring: CSSProperties = {
    position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none", borderRadius: "inherit", padding: "1px",
    background: "radial-gradient(circle " + size + "px at var(--spot-x) var(--spot-y), rgba(47,107,255," + intensity + "), transparent 60%)",
    opacity: "var(--spot-active)", transition: "opacity 220ms ease",
    WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor",
    mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", maskComposite: "exclude",
  };
  return (
    <motion.div
      ref={ref}
      className={cn("relative rounded-3xl", className)}
      style={{ "--spot-x": "-9999px", "--spot-y": "-9999px", "--spot-active": 0 } as CSSProperties}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5, transition: { type: "spring", stiffness: 260, damping: 24 } }}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <span style={ring} aria-hidden="true" />
      <span style={{ ...ring, zIndex: 21, background: "radial-gradient(circle " + size / 2 + "px at var(--spot-x) var(--spot-y), rgba(47,224,201,0.8), transparent 58%)" }} aria-hidden="true" />
      <div className="relative z-10 h-full">{children}</div>
    </motion.div>
  );
}

function PricingCard({ plan, index, onCheckout }: { plan: PublicPlan; index: number; onCheckout: (plan: PublicPlan, mode: "trial" | "buy", trigger: HTMLElement | null) => void }) {
  const isUltra = plan.slug === "elolab-ultra";
  const atendenteIA = featureLabels.agente_ia;
  const ultraFeatures = plan.features.filter((feature) => feature === atendenteIA);
  const featuresToDisplay = isUltra && ultraFeatures.length > 0 ? ultraFeatures : plan.features;
  return (
    <SpotlightBorder size={460} intensity={0.38} delay={index * 0.12} className="h-full rounded-3xl border border-elolab-blue/10 bg-white/50 shadow-[0_24px_65px_rgba(10,34,55,0.08)]">
      <div className={cn("flex h-full flex-col rounded-3xl bg-[linear-gradient(135deg,rgba(47,107,255,0.58),rgba(47,224,201,0.64),rgba(47,107,255,0.3))] p-[1.5px]", plan.popular && "bg-[linear-gradient(135deg,rgba(47,107,255,0.95),rgba(47,224,201,0.95),rgba(47,107,255,0.68))]")}>
        <div className="relative flex flex-1 flex-col rounded-[calc(1.5rem-2px)] bg-white px-5 pb-6 pt-6 sm:px-6 sm:pt-7">
          <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
            <h3 className="font-inter text-xl font-semibold tracking-[-0.035em] text-elolab-navy sm:text-[1.4rem]">{plan.name}</h3>
            {plan.popular && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-elolab-cyan px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-elolab-navy">
                <Sparkles size={10} aria-hidden="true" /> Mais popular
              </span>
            )}
          </div>
          {isUltra && ultraFeatures.length > 0 && (
            <p className="mb-3 max-w-sm font-inter text-sm font-semibold leading-relaxed text-elolab-blue">
              Inclui os recursos do EloLab Pro e o Agente de IA no WhatsApp, conforme a integração da clínica.
            </p>
          )}
          <div className="flex flex-wrap items-baseline gap-x-1.5 font-inter">
            <span className="text-[2.6rem] font-semibold leading-none tracking-[-0.065em] text-elolab-navy sm:text-5xl">{brl(plan.price)}</span>
            <span className="text-sm text-elolab-navy/60">/{rotuloFrequencia(plan.frequency)}</span>
          </div>
          {plan.trialDays > 0 && <p className="mt-1.5 font-inter text-[11px] text-elolab-navy/60">{plan.trialDays} dias grátis para conhecer antes da primeira cobrança</p>}
          <div className="my-4 h-px w-full bg-[linear-gradient(90deg,rgba(47,107,255,0.12),rgba(47,224,201,0.55),rgba(47,107,255,0.12))]" />
          <ul className="flex flex-1 flex-col gap-3">
            {featuresToDisplay.map((feature) => (
              <li key={feature} className="flex items-start gap-3 font-inter text-[13px] leading-snug text-elolab-navy">
                <MIcon name="check" size={16} className={cn("mt-0.5", feature === atendenteIA ? "text-elolab-cyan" : "text-elolab-blue")} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2.5">
            {plan.trialDays > 0 && (
              <Button
                onClick={(event) => onCheckout(plan, "trial", event.currentTarget)}
                className="h-11 w-full rounded-full border-0 bg-[linear-gradient(110deg,#164ba9_0%,#2f6bff_45%,#2fe0c9_100%)] font-bold text-white shadow-[0_8px_24px_-4px_rgba(47,107,255,0.45)] transition hover:scale-[1.02] hover:brightness-110"
              >
                <Clock className="mr-2 h-4 w-4" /> Testar {plan.trialDays} dias grátis
              </Button>
            )}
            <Button
              variant="outline"
              onClick={(event) => onCheckout(plan, "buy", event.currentTarget)}
              className="h-11 w-full rounded-full border-2 border-elolab-blue font-bold text-elolab-blue transition hover:scale-[1.02] hover:bg-elolab-blue/5"
            >
              <CreditCard className="mr-2 h-4 w-4" /> Assinar agora
            </Button>
          </div>
        </div>
      </div>
    </SpotlightBorder>
  );
}

export default function PricingSection() {
  const navigate = useNavigate();
  const { data: catalogPlans, isLoading: plansLoading, isError: plansError } = usePlanos();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PublicPlan | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<"trial" | "buy">("trial");
  const checkoutTriggerRef = useRef<HTMLElement | null>(null);

  const plans = useMemo<PublicPlan[]>(() => {
    const catalog = (catalogPlans ?? []).filter((plano: any) => plano.ativo !== false);
    const ordered = planPresentation
      .map(({ slug }) => catalog.find((plano: any) => plano.slug === slug))
      .filter(Boolean);
    const rest = catalog.filter((plano: any) => !planPresentation.some(({ slug }) => slug === plano.slug));
    return [...ordered, ...rest].map((source: any) => {
      const keys: string[] = Array.isArray(source.features) ? source.features : [];
      const visible = keys.filter((key) => featureLabels[key] || premiumFeatures.has(key));
      return {
        slug: source.slug,
        name: source.nome,
        price: Number(source.valor) || 0,
        popular: Boolean(source.destaque),
        frequency: source.frequencia,
        trialDays: source.trial_dias ?? 0,
        features: visible.map((key) => featureLabels[key] || key),
      };
    });
  }, [catalogPlans]);

  const planoComTeste = plans.find((plan) => plan.trialDays > 0);

  const openCheckout = (plan: PublicPlan, mode: "trial" | "buy", trigger: HTMLElement | null) => {
    checkoutTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSelectedPlan(plan);
    setCheckoutMode(mode);
    setCheckoutOpen(true);
  };

  const handleCheckout = () => {
    if (!selectedPlan) return;
    const params = new URLSearchParams({ cadastro: "1", plano: selectedPlan.slug, modo: checkoutMode });
    const next = `/auth?${params.toString()}`;
    setCheckoutOpen(false);
    if (/^(www\.)?elolab\.com\.br$/.test(window.location.hostname)) {
      window.location.assign(`https://app.elolab.com.br${next}`);
    } else {
      navigate(next);
    }
  };

  return (
    <section id="planos" className="relative w-full scroll-mt-24 overflow-hidden bg-background py-16 sm:py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[370px] bg-[linear-gradient(135deg,rgba(47,107,255,0.14)_0%,rgba(47,107,255,0.06)_48%,rgba(47,224,201,0.14)_100%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[370px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.74),transparent_72%)]" aria-hidden="true" />

      <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-14">
          <FadeUp>
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-elolab-blue/15 bg-white/80 px-3.5 py-1.5 font-inter text-xs font-semibold text-elolab-blue shadow-sm backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-elolab-cyan" />
              Planos EloLab
            </span>
          </FadeUp>
          <FadeUp delay={0.1}>
            <GradientWaveText as="h2" align="center" inView once={false} repeat speed={0.75} className="font-inter text-3xl font-medium leading-[1.04] tracking-[-0.045em] text-elolab-navy sm:text-4xl md:text-5xl">
              O plano certo para sua clínica.<br className="hidden sm:block" /> Mais cuidado em cada etapa.
            </GradientWaveText>
          </FadeUp>
          <FadeUp delay={0.2} className="mt-4">
            <p className="mx-auto max-w-2xl font-inter text-sm leading-relaxed text-elolab-navy/65 sm:text-base">
              {planoComTeste
                ? `Teste grátis por ${planoComTeste.trialDays} dias nos planos elegíveis. O checkout mostra valor e data da primeira cobrança.`
                : "Consulte os planos e as condições vigentes antes de iniciar."}
            </p>
            <p className="mt-2 font-inter text-xs font-semibold uppercase tracking-[0.16em] text-elolab-blue">Cartão recorrente · Pix por período</p>
            {planoComTeste && (
              <Button
                onClick={(event) => openCheckout(planoComTeste, "trial", event.currentTarget)}
                className="mt-5 h-11 rounded-full border-0 bg-[linear-gradient(110deg,#164ba9_0%,#2f6bff_45%,#2fe0c9_100%)] px-6 font-bold text-white shadow-[0_8px_24px_-4px_rgba(47,107,255,0.45)] transition hover:scale-[1.02] hover:brightness-110"
              >
                Testar grátis por {planoComTeste.trialDays} dias <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </FadeUp>
        </div>

        {plansLoading ? (
          <p className="text-center font-inter text-sm text-elolab-navy/65" role="status">Carregando valores atuais…</p>
        ) : plansError ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-elolab-blue/15 bg-white/80 p-6 text-center font-inter">
            <p className="text-elolab-navy">Não foi possível carregar os planos agora. Fale com a equipe para receber os valores vigentes.</p>
            <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-elolab-blue" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Consultar planos pelo WhatsApp</a>
          </div>
        ) : plans.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-elolab-blue/15 bg-white/80 p-6 text-center font-inter">
            <p className="text-elolab-navy">Não há planos disponíveis para contratação no momento. Consulte novamente em instantes.</p>
            <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-elolab-blue" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Falar com a equipe</a>
          </div>
        ) : (
          <div className={cn("mx-auto grid max-w-[980px] grid-cols-1 items-stretch gap-x-6 gap-y-9", plans.length > 1 && "md:grid-cols-2")}>
            {plans.map((plan, index) => <PricingCard key={plan.slug} plan={plan} index={index} onCheckout={openCheckout} />)}
          </div>
        )}

        <p className="mt-10 text-center font-inter text-sm text-elolab-navy/65">
          Quer conhecer antes de escolher?{" "}
          <a href="/demonstracao" className="inline-flex min-h-10 items-center font-semibold text-elolab-blue underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-elolab-blue focus-visible:ring-offset-2">
            Ver demonstração da clínica
          </a>
        </p>
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        {selectedPlan && (
          <DialogContent
            className="w-[calc(100%-2rem)] max-w-md border-0 bg-white p-8 text-left shadow-2xl sm:rounded-3xl"
            aria-labelledby="landing-checkout-title"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              checkoutTriggerRef.current?.focus();
            }}
          >
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-elolab-blue/10">
                {checkoutMode === "trial" ? <Clock className="h-6 w-6 text-elolab-blue" /> : <CreditCard className="h-6 w-6 text-elolab-blue" />}
              </div>
              <DialogTitle id="landing-checkout-title" className="font-inter text-xl font-extrabold text-elolab-navy">
                {checkoutMode === "trial" ? `Comece seus ${selectedPlan.trialDays} dias grátis` : "Finalize sua assinatura"}
              </DialogTitle>
              <p className="mt-1 font-inter text-sm text-elolab-navy/65">
                {selectedPlan.name} — {brl(selectedPlan.price)}/{selectedPlan.frequency === "mensal" ? "mês" : selectedPlan.frequency}
                {checkoutMode === "trial" && ` (${selectedPlan.trialDays} dias grátis)`}
              </p>
            </div>

            <div className="rounded-2xl border border-elolab-blue/15 p-4 font-inter text-sm leading-relaxed text-elolab-navy">
              {checkoutMode === "trial" ? (
                <>
                  <ol className="space-y-2" aria-label="Etapas para iniciar o teste">
                    <li><strong>1.</strong> Crie sua conta.</li>
                    <li><strong>2.</strong> Confirme seu e-mail.</li>
                    <li><strong>3.</strong> Cadastre um cartão no EloLab para iniciar o teste.</li>
                  </ol>
                  <p className="mt-3 border-t border-gray-200 pt-3">
                    Hoje você não paga pelo EloLab. O Mercado Pago pode fazer uma validação temporária do cartão, conforme as regras do emissor. Ao fim dos {selectedPlan.trialDays} dias, começa a cobrança recorrente de {brl(selectedPlan.price)}/{selectedPlan.frequency === "mensal" ? "mês" : selectedPlan.frequency}. Você pode cancelar em Planos antes da cobrança; o acesso ao plano termina ao cancelar.
                  </p>
                </>
              ) : (
                "Crie sua conta para chegar ao checkout. Lá, você poderá escolher: no cartão, começa uma assinatura com renovação automática; no Pix, você compra o período exibido para este plano, sem renovação automática."
              )}
            </div>

            <Button
              onClick={handleCheckout}
              className="mt-6 h-11 w-full rounded-full border-0 bg-[linear-gradient(110deg,#164ba9_0%,#2f6bff_45%,#2fe0c9_100%)] font-bold text-white transition hover:scale-[1.02] hover:brightness-110"
            >
              {checkoutMode === "trial" ? <>Criar conta e seguir para o cartão <ArrowRight className="ml-2 h-4 w-4" /></> : <>Criar conta e continuar <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>

            <p className="mt-4 text-center font-inter text-xs text-elolab-navy/65">
              {checkoutMode === "trial"
                ? "O cartão fica salvo para a assinatura recorrente após o teste, somente com seu consentimento no checkout."
                : "O pagamento será feito na sua conta após a criação e confirmação do acesso."}
            </p>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
