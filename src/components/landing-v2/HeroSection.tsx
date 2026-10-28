"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Image from "./Image";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import Logo from "./Logo";
import AnimatedGradient from "./animated-gradient";
import { GradientWaveText } from "./gradient-wave-text";

const NAV_LINKS = [
  { label: "Produto", href: "#about" },
  { label: "Recursos", href: "#recursos" },
  { label: "Assistente Elo", href: "#elo-ia" },
  { label: "Preços", href: "#pricing" },
];

const CTA_COLORS = ["hsl(var(--muted))", "hsl(var(--background))", "hsl(var(--muted))"];
const BUTTON_WAVE_COLORS = ["hsl(var(--primary-foreground))", "hsl(var(--muted))", "hsl(var(--primary-foreground))"];
const PRISM_CONFIG = { preset: "Prism" } as const;

export default function HeroSection() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const loginUrl = /^(www\.)?elolab\.com\.br$/.test(window.location.hostname) ? "https://app.elolab.com.br/auth" : "/auth";

  return (
    <section
      id="top"
      className="relative isolate flex h-screen min-h-[500px] flex-col overflow-hidden bg-background font-inter text-foreground"
    >
      <AnimatedGradient
        className="pointer-events-none"
        style={{ zIndex: 0 }}
        config={PRISM_CONFIG}
      />

      <div
        className="pointer-events-none"
        style={{
          position: "absolute",
          right: "-8%",
          bottom: 0,
          width: "min(86vw, 112vh, 1333px)",
          zIndex: 10,
        }}
      >
        <Image
          src="/images/elolab-dashboard-hero-v2.webp"
          alt="Médico sentado sobre o painel de gestão da EloLab"
          width={1333}
          height={1180}
          priority
          sizes="(min-width: 1549px) 1333px, 86vw"
          className="block h-auto w-full"
        />
      </div>

      <div className="relative z-20 mx-auto flex h-full w-full max-w-7xl flex-1 flex-col px-5 pb-10 pt-5 sm:px-8 sm:pt-7 lg:px-10">
        <header className="relative z-30 flex items-center justify-between gap-4">
          <a href="#top" aria-label="EloLab home" className="inline-flex min-h-10 shrink-0 items-center">
            <Logo />
          </a>

          <nav
            aria-label="Navegação principal"
            className="hidden items-center gap-5 rounded-full border border-border bg-card/75 px-5 py-0.5 text-sm shadow-sm backdrop-blur-md lg:flex xl:gap-7"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="inline-flex min-h-10 items-center whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-5 lg:flex">
            <a
              href={loginUrl}
              className="inline-flex min-h-10 min-w-10 items-center justify-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              Entrar
            </a>
            <a
              href="mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab"
              className="elolab-gradient-button group inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GradientWaveText
                as="span"
                align="left"
                baseColor="hsl(var(--primary-foreground))"
                customColors={BUTTON_WAVE_COLORS}
                inView
                once={false}
                className="w-auto"
              >
                Agendar demonstração
              </GradientWaveText>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </a>
          </div>

          <button
            type="button"
            aria-label={menuOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
            aria-expanded={menuOpen}
            aria-controls="navegacao-mobile"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card/80 text-foreground transition-colors duration-200 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </button>

          {menuOpen && (
            <nav
            id="navegacao-mobile"
            aria-label="Navegação móvel"
            className="flex absolute inset-x-0 top-full z-30 mt-3 flex-col gap-1 rounded-2xl border border-border bg-card/95 p-3 text-sm text-foreground shadow-xl backdrop-blur-xl lg:hidden"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-3 text-muted-foreground transition-colors duration-200 hover:bg-primary/5 hover:text-primary"
              >
                {link.label}
              </a>
            ))}
            <a
              href={loginUrl}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl px-3 py-3 text-muted-foreground transition-colors duration-200 hover:bg-primary/5 hover:text-primary"
            >
              Entrar
            </a>
            <a
              href="mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab"
              onClick={() => setMenuOpen(false)}
              className="elolab-gradient-button mt-2 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-semibold shadow-sm"
            >
              <GradientWaveText
                as="span"
                align="left"
                baseColor="hsl(var(--primary-foreground))"
                customColors={BUTTON_WAVE_COLORS}
                inView
                once={false}
                className="w-auto"
              >
                Agendar demonstração
              </GradientWaveText>
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          </nav>
          )}
          </header>

        <div className="relative z-20 flex flex-1 flex-col items-center justify-start pt-8 text-center sm:pt-10 md:pt-12 lg:items-start lg:pt-16 lg:text-left">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary sm:text-sm">
            Gestão integrada para clínicas
          </p>
          <GradientWaveText
            as="h1"
            alignClassName="justify-center text-center lg:justify-start lg:text-left"
            className="mt-6 max-w-3xl text-balance text-4xl font-medium leading-[0.95] tracking-[-0.055em] text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
            speed={0.75}
            inView
            once={false}
            repeat
          >
            Toda a clínica.<br />Em um só fluxo.
          </GradientWaveText>
          <p className="mt-6 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base md:text-lg lg:max-w-md xl:max-w-xl">
            Agenda, triagem, prontuário, financeiro e operação conectados em
            uma plataforma para sua equipe.
          </p>

          <a
              href="mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab"
            className="group mt-9 inline-flex items-center gap-3 rounded-full border border-foreground bg-foreground px-6 py-3.5 text-background shadow-md transition-colors duration-200 hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-8 md:py-4"
          >
            <GradientWaveText
              className="h-auto w-auto text-sm font-medium sm:text-base"
              speed={0.7}
              repeat
              inView
              once={false}
              baseColor="hsl(var(--background))"
              customColors={CTA_COLORS}
            >
              Agendar demonstração
            </GradientWaveText>
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1 md:size-5"
            />
          </a>
          <button
            type="button"
            onClick={() => navigate("/demonstracao")}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card/80 px-5 text-sm font-semibold text-foreground backdrop-blur transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver demonstração com dados fictícios
          </button>
        </div>
      </div>
    </section>
  );
}
