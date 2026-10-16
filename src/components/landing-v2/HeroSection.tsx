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

const CTA_COLORS = ["#2FE0C9", "#FFFFFF", "#2F6BFF"];
const BUTTON_WAVE_COLORS = ["#FFFFFF", "#DBEAFE", "#FFFFFF"];
const PRISM_CONFIG = { preset: "Prism" } as const;

export default function HeroSection() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const loginUrl = /^(www\.)?elolab\.com\.br$/.test(window.location.hostname) ? "https://app.elolab.com.br/auth" : "/auth";

  return (
    <section
      id="top"
      className="relative isolate flex h-screen min-h-[500px] flex-col overflow-hidden bg-background font-inter text-elolab-ink"
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
            className="hidden items-center gap-5 rounded-full border border-elolab-blue/15 bg-white/75 px-5 py-0.5 text-sm shadow-sm backdrop-blur-md lg:flex xl:gap-7"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="inline-flex min-h-10 items-center whitespace-nowrap text-elolab-ink/80 transition-colors duration-200 hover:text-elolab-blue"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-5 lg:flex">
            <a
              href={loginUrl}
              className="inline-flex min-h-10 min-w-10 items-center justify-center text-sm font-medium text-elolab-ink/75 transition-colors hover:text-elolab-blue"
            >
              Entrar
            </a>
            <a
              href="mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab"
              className="elolab-gradient-button group inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-elolab-blue"
            >
              <GradientWaveText
                as="span"
                align="left"
                baseColor="rgb(10,34,55)"
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
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-elolab-blue/20 bg-white/80 text-elolab-ink transition-colors duration-200 hover:bg-elolab-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-elolab-blue lg:hidden"
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
            className="flex absolute inset-x-0 top-full z-30 mt-3 flex-col gap-1 rounded-2xl border border-elolab-blue/15 bg-white/95 p-3 text-sm text-elolab-ink shadow-xl backdrop-blur-xl lg:hidden"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-3 text-elolab-ink/80 transition-colors duration-200 hover:bg-elolab-blue/5 hover:text-elolab-blue"
              >
                {link.label}
              </a>
            ))}
            <a
              href={loginUrl}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl px-3 py-3 text-elolab-ink/80 transition-colors duration-200 hover:bg-elolab-blue/5 hover:text-elolab-blue"
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
                baseColor="rgb(10,34,55)"
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
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-elolab-blue sm:text-sm">
            Gestão integrada para clínicas
          </p>
          <GradientWaveText
            as="h1"
            alignClassName="justify-center text-center lg:justify-start lg:text-left"
            className="mt-6 max-w-3xl text-balance text-4xl font-medium leading-[0.95] tracking-[-0.055em] text-elolab-ink sm:text-5xl md:text-6xl lg:text-7xl"
            speed={0.75}
            inView
            once={false}
            repeat
          >
            Toda a clínica.<br />Em um só fluxo.
          </GradientWaveText>
          <p className="mt-6 max-w-xl text-balance text-sm leading-relaxed text-elolab-ink/75 sm:text-base md:text-lg lg:max-w-md xl:max-w-xl">
            Agenda, triagem, prontuário, financeiro e operação conectados em
            uma plataforma para sua equipe.
          </p>

          <a
              href="mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab"
            className="group mt-9 inline-flex items-center gap-3 rounded-full border border-elolab-blue/25 bg-elolab-navy px-6 py-3.5 text-white shadow-[0_12px_32px_rgba(10,34,55,0.2)] transition-all duration-200 hover:bg-[#102f49] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-elolab-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-8 md:py-4"
          >
            <GradientWaveText
              className="h-auto w-auto text-sm font-medium sm:text-base"
              speed={0.7}
              repeat
              inView
              once={false}
              baseColor="rgb(255,255,255)"
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
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-elolab-blue/25 bg-white/80 px-5 text-sm font-semibold text-elolab-navy backdrop-blur transition hover:border-elolab-blue hover:text-elolab-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-elolab-blue"
          >
            Ver demonstração com dados fictícios
          </button>
        </div>
      </div>
    </section>
  );
}
