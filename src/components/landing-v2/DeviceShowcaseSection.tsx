"use client";

import Image from "./Image";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { GradientWaveText } from "./gradient-wave-text";

const devices = [
  {
    name: "Notebook",
    icon: Monitor,
    src: "/images/elolab-dashboard-laptop.webp",
    alt: "Painel EloLab aberto em um notebook",
    width: 1402,
    height: 1122,
    imageClass: "w-full max-w-[650px]",
  },
  {
    name: "Tablet",
    icon: Tablet,
    src: "/images/elolab-dashboard-tablet.webp",
    alt: "Painel EloLab aberto em um tablet",
    width: 1122,
    height: 1402,
    imageClass: "w-[88%] max-w-[470px]",
  },
  {
    name: "Celular",
    icon: Smartphone,
    src: "/images/elolab-dashboard-phone.webp",
    alt: "Painel EloLab aberto em um celular",
    width: 1122,
    height: 1402,
    imageClass: "w-[58%] max-w-[330px]",
  },
];

export default function DeviceShowcaseSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { amount: 0.2 });
  const reduceMotion = useReducedMotion();
  const activeDevice = devices[activeIndex];

  useEffect(() => {
    if (!isInView || reduceMotion) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setActiveIndex((current) => (current + 1) % devices.length);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isInView, reduceMotion]);

  return (
    <section ref={sectionRef} aria-labelledby="device-showcase-title" className="relative overflow-hidden bg-background px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[1320px]">
        <div className="relative isolate px-1 py-2 sm:px-4 lg:px-8">
          <div className="pointer-events-none absolute right-0 top-[8%] z-0 h-72 w-72 rounded-full bg-elolab-blue/[0.07] blur-[90px]" />
          <div className="pointer-events-none absolute bottom-[4%] left-[34%] z-0 h-56 w-56 rounded-full bg-elolab-cyan/[0.1] blur-[85px]" />

          <div className="relative z-10 grid items-center gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
            <div className="order-2 flex min-w-0 flex-col items-start lg:order-1">
              <span className="inline-flex items-center gap-2 rounded-full border border-elolab-blue/15 bg-white/75 px-3 py-1.5 font-inter text-xs font-medium text-elolab-navy/75 shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-elolab-cyan shadow-[0_0_12px_rgba(47,224,201,0.55)]" />
                EloLab em qualquer tela
              </span>

              <GradientWaveText
                id="device-showcase-title"
                as="h2"
                align="left"
                baseColor="rgb(10,34,55)"
                customColors={["#2f6bff", "#1684d8", "#087f88", "#2f6bff"]}
                inView
                once={false}
                repeat
                className="mt-5 max-w-xl font-inter text-3xl font-medium leading-[1.04] tracking-[-0.045em] text-elolab-navy sm:text-4xl lg:text-5xl"
              >
                Sua clínica, sempre com você.
              </GradientWaveText>

              <p className="mt-4 max-w-lg font-inter text-sm leading-relaxed text-elolab-navy/65 sm:text-base">
                Acesse a mesma plataforma pelo computador, tablet ou celular. Agenda, atendimento e gestão acompanham sua equipe em qualquer dispositivo.
              </p>

              <a
                href="#planos"
                className="group elolab-gradient-button mt-7 inline-flex h-12 items-center gap-2 rounded-full px-6 font-inter text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-elolab-cyan"
              >
                <GradientWaveText
                  as="span"
                  align="left"
                  baseColor="rgb(10,34,55)"
                  customColors={["#0a2237", "#2f6bff", "#0a2237"]}
                  inView
                  once={false}
                  repeat
                  className="w-auto leading-none"
                >
                  Ver planos
                </GradientWaveText>
                <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </a>
            </div>

            <div className="order-1 flex min-w-0 flex-col items-center lg:order-2">
              <div className="relative flex h-[270px] w-full items-center justify-center sm:h-[390px] lg:h-[470px]">
                <div className="pointer-events-none absolute inset-[12%] rounded-full bg-elolab-blue/[0.08] blur-[60px]" />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeDevice.src}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 16, scale: reduceMotion ? 1 : 0.97, filter: reduceMotion ? "blur(0px)" : "blur(5px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: reduceMotion ? 0 : -12, scale: reduceMotion ? 1 : 0.985, filter: reduceMotion ? "blur(0px)" : "blur(4px)" }}
                    transition={{ duration: reduceMotion ? 0.25 : 0.65, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <Image
                      src={activeDevice.src}
                      alt={activeDevice.alt}
                      width={activeDevice.width}
                      height={activeDevice.height}
                      sizes="(min-width: 1024px) 46vw, 90vw"
                      className={cn("h-full max-h-full object-contain drop-shadow-[0_20px_34px_rgba(10,34,55,0.16)]", activeDevice.imageClass)}
                      priority={activeIndex === 0}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2" aria-label="Escolha uma prévia por dispositivo">
                {devices.map((device, index) => {
                  const Icon = device.icon;
                  const selected = activeIndex === index;

                  return (
                    <button
                      key={device.name}
                      type="button"
                      aria-label={`Mostrar versão para ${device.name.toLowerCase()}`}
                      aria-pressed={selected}
                      onClick={() => setActiveIndex(index)}
                      className={cn(
                        "relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border px-3 font-inter text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-elolab-cyan",
                        selected ? "border-elolab-blue/20 bg-white text-elolab-navy shadow-sm" : "border-elolab-blue/10 bg-white/55 text-elolab-navy/55 hover:border-elolab-blue/20 hover:text-elolab-navy"
                      )}
                    >
                      {selected && (
                        <motion.span
                          layoutId="device-showcase-active"
                          className="absolute inset-0 rounded-full bg-elolab-blue/[0.06]"
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        />
                      )}
                      <Icon size={14} className="relative z-10" aria-hidden="true" />
                      <span className="relative z-10">{device.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
