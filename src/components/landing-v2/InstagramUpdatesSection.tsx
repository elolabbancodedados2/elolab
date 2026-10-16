import Image from "./Image";
import { ArrowUpRight } from "lucide-react";
import { FadeIn } from "./Motion";
import { GradientWaveText } from "./gradient-wave-text";

const instagramUrl = import.meta.env.VITE_ELOLAB_INSTAGRAM_URL || "https://www.instagram.com/";

function InstagramMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3.25"
        y="3.25"
        width="17.5"
        height="17.5"
        rx="5.2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.7" cy="6.6" r="1.1" fill="currentColor" />
    </svg>
  );
}

export default function InstagramUpdatesSection() {
  return (
    <section
      id="instagram"
      aria-labelledby="instagram-updates-title"
      className="relative overflow-hidden bg-background px-4 py-16 sm:px-6 sm:py-20 lg:py-24"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-1/2 size-[28rem] -translate-y-1/2 rounded-full bg-elolab-blue/[0.08] blur-[100px]"
      />

      <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="max-w-xl">
          <FadeIn>
            <span className="inline-flex items-center gap-2 rounded-full border border-elolab-blue/15 bg-white/80 px-3.5 py-1.5 font-inter text-xs font-semibold text-elolab-blue shadow-sm">
              <span className="grid size-5 place-items-center rounded-full bg-[linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)] text-white">
                <InstagramMark className="size-3" />
              </span>
              EloLab no Instagram
            </span>
          </FadeIn>

          <FadeIn delay={0.1}>
            <GradientWaveText
              id="instagram-updates-title"
              as="h2"
              align="left"
              inView
              once={false}
              repeat
              speed={0.75}
              className="mt-6 font-inter text-3xl font-medium leading-[1.04] tracking-[-0.045em] text-elolab-navy sm:text-4xl lg:text-5xl"
            >
              Acompanhe as novidades da EloLab.
            </GradientWaveText>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="mt-5 max-w-lg font-inter text-base leading-relaxed text-elolab-navy/65 sm:text-lg">
              Siga nossos canais para ver novidades do app, dicas para a rotina da clínica e ideias para cuidar melhor de cada paciente.
            </p>
          </FadeIn>

          <FadeIn delay={0.3}>
            <a
              href={instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="elolab-gradient-button group mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 font-inter text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-elolab-cyan"
            >
              <InstagramMark className="size-4" />
              <GradientWaveText
                as="span"
                align="left"
                baseColor="rgb(10,34,55)"
                customColors={["#0a2237", "#2f6bff", "#0a2237"]}
                inView
                once={false}
                repeat
                className="w-auto"
              >
                Siga a EloLab no Instagram
              </GradientWaveText>
              <ArrowUpRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </FadeIn>
        </div>

        <FadeIn
          delay={0.15}
          className="relative mx-auto flex min-h-[25rem] w-full max-w-[560px] items-center justify-center lg:min-h-[38rem] lg:justify-end"
        >
          <Image
            src="/images/instagram-follow-cutout.webp"
            alt="Empreendedor mostrando o perfil do Instagram e as novidades da EloLab"
            width={1122}
            height={1402}
            sizes="(min-width: 1024px) 520px, 90vw"
            className="relative z-10 h-auto max-h-[34rem] w-auto max-w-full object-contain drop-shadow-[0_24px_48px_rgba(10,34,55,0.16)] lg:max-h-[40rem]"
          />
        </FadeIn>
      </div>
    </section>
  );
}
