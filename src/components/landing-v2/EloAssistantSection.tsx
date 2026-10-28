"use client";

import Image from "./Image";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  MessageCircle,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { FadeIn } from "./Motion";
import { GradientWaveText } from "./gradient-wave-text";

const FEATURES: { title: string; detail: string; Icon: LucideIcon }[] = [
  {
    title: "Marca consultas",
    detail: "Ajuda pacientes a encontrar e reservar um horário.",
    Icon: CalendarDays,
  },
  {
    title: "Remarca ou cancela",
    detail: "Atualiza a agenda quando os planos mudam.",
    Icon: RefreshCw,
  },
  {
    title: "Envia lembretes",
    detail: "Compartilha confirmações e avisos importantes.",
    Icon: Bell,
  },
  {
    title: "Responde dúvidas",
    detail: "Orienta sobre horários e informações da clínica.",
    Icon: MessageCircle,
  },
];

export default function EloAssistantSection() {
  return (
    <section
      id="elo-ia"
      aria-labelledby="elo-assistant-title"
      className="bg-background px-5 py-16 sm:px-8 sm:py-20 lg:py-24"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div>
          <FadeIn>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 font-inter text-xs font-medium text-primary shadow-sm">
              <span className="size-1.5 rounded-full bg-primary" />
              Elo, assistente de IA
            </span>
          </FadeIn>

          <FadeIn delay={0.1}>
            <GradientWaveText
              as="h2"
              id="elo-assistant-title"
              align="left"
              inView
              once={false}
              repeat
              speed={0.75}
              className="mt-6 max-w-xl font-inter text-4xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-5xl lg:text-6xl"
            >
              Mais cuidado no atendimento.<br />Menos tarefas para sua equipe.
            </GradientWaveText>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="mt-5 max-w-xl font-inter text-base leading-relaxed text-muted-foreground sm:text-lg">
              A Elo conversa com os pacientes e cuida das solicitações do dia a dia,
              enquanto sua equipe acompanha tudo em uma só plataforma.
            </p>
          </FadeIn>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {FEATURES.map(({ title, detail, Icon }, index) => (
              <FadeIn key={title} delay={0.25 + index * 0.08}>
                <div className="flex h-full gap-3 rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span>
                    <GradientWaveText
                      as="strong"
                      align="left"
                      inView
                      once={false}
                      repeat
                      speed={0.7}
                      className="font-inter text-sm font-semibold text-foreground"
                    >
                      {title}
                    </GradientWaveText>
                    <span className="mt-1 block font-inter text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {detail}
                    </span>
                  </span>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.55}>
            <a
              href="mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab"
              className="elolab-gradient-button group mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 font-inter text-sm font-semibold"
            >
              <GradientWaveText
                as="span"
                align="left"
                baseColor="hsl(var(--primary-foreground))"
                customColors={["hsl(var(--primary-foreground))", "hsl(var(--muted))", "hsl(var(--primary-foreground))"]}
                inView
                once={false}
                className="w-auto"
              >
                Conheça a Elo
              </GradientWaveText>
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover:translate-x-1"
              />
            </a>
          </FadeIn>
        </div>

        <FadeIn delay={0.2} className="mx-auto w-full max-w-[560px]">
          <Image
            src="/images/elo-assistente-ia-atendimento.webp"
            alt="Médica apresenta no celular a assistente virtual Elo da EloLab"
            width={1212}
            height={1297}
            sizes="(min-width: 1024px) 560px, (min-width: 640px) 80vw, 100vw"
            className="block h-auto w-full select-none drop-shadow-xl"
            style={{
              maskImage: "linear-gradient(to bottom, black 0%, black 84%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 84%, transparent 100%)",
            }}
          />
        </FadeIn>
      </div>
    </section>
  );
}
