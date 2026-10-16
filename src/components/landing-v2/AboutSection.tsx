"use client";

import { AnimatedText, ContactButton, FadeIn } from "./Motion";
import { Activity, CalendarDays, FileText, Wallet, type LucideIcon } from "lucide-react";
import { GradientWaveText } from "./gradient-wave-text";

const ABOUT_FEATURES: {
  label: string;
  Icon: LucideIcon;
  className: string;
  delay: number;
  x: number;
}[] = [
  {
    label: "Agenda e atendimento",
    Icon: CalendarDays,
    className: "top-[12%] left-[3%] md:left-[8%]",
    delay: 0.1,
    x: -80,
  },
  {
    label: "Prontuário eletrônico",
    Icon: FileText,
    className: "bottom-[16%] left-[4%] md:left-[11%]",
    delay: 0.25,
    x: -80,
  },
  {
    label: "Gestão financeira",
    Icon: Wallet,
    className: "top-[13%] right-[3%] md:right-[8%]",
    delay: 0.15,
    x: 80,
  },
  {
    label: "Indicadores da clínica",
    Icon: Activity,
    className: "bottom-[16%] right-[4%] md:right-[10%]",
    delay: 0.3,
    x: 80,
  },
];

const ABOUT_TEXT =
  "A EloLab conecta agenda, atendimento, prontuário, laboratório e financeiro em uma plataforma simples. Menos tarefas manuais, mais clareza para a equipe e uma rotina clínica organizada — para que o cuidado com cada paciente esteja sempre no centro.";

export default function AboutSection() {
  return (
    <section
      id="about"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-20 sm:px-8 md:px-10"
    >
      {ABOUT_FEATURES.map(({ label, Icon, className, delay, x }) => (
        <FadeIn
          key={label}
          className={`absolute z-0 ${className}`}
          delay={delay}
          duration={0.9}
          x={x}
          y={0}
        >
          <div className="about-feature">
            <span className="about-feature__icon"><Icon aria-hidden="true" /></span>
            <span>{label}</span>
          </div>
        </FadeIn>
      ))}

      <div className="relative z-10 flex w-full flex-col items-center">
        <FadeIn y={40}>
          <GradientWaveText
            as="h2"
            inView
            once={false}
            repeat
            speed={0.75}
            className="text-center text-[clamp(2.3rem,9vw,144px)] font-black uppercase leading-none tracking-tight"
          >
            Sobre a EloLab
          </GradientWaveText>
        </FadeIn>
        <div className="mt-10 sm:mt-14 md:mt-16">
          <AnimatedText text={ABOUT_TEXT} />
        </div>
        <FadeIn className="mt-16 sm:mt-20 md:mt-24">
          <ContactButton
            label="Agende uma demonstração"
            href="mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab"
          />
        </FadeIn>
      </div>
    </section>
  );
}

