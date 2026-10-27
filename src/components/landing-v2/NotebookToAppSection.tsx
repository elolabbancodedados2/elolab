import Image from "./Image";
import { FadeIn } from "./Motion";
import { GradientWaveText } from "./gradient-wave-text";

const stories = [
  {
    src: "/images/elo-transition-notebook.webp",
    alt: "Deixe o caderno e leve a agenda da clínica para o digital com a EloLab",
  },
  {
    src: "/images/elo-transition-ease.webp",
    alt: "Use a EloLab para ter agenda, pacientes e atendimento na palma da mão",
  },
  {
    src: "/images/elo-transition-app.webp",
    alt: "Aplicativo EloLab trazendo mais agilidade e organização para a clínica",
  },
];

export default function NotebookToAppSection() {
  return (
    <section
      aria-labelledby="notebook-to-app-title"
      className="relative overflow-hidden bg-background px-4 py-16 sm:px-6 sm:py-20 lg:py-24"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-[min(90vw,900px)] -translate-x-1/2 rounded-full bg-elolab-blue/[0.06] blur-[100px]"
      />

      <div className="relative mx-auto max-w-[1320px]">
        <FadeIn className="mx-auto mb-8 max-w-3xl text-center sm:mb-10">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-elolab-blue/15 bg-white/80 px-3.5 py-1.5 font-inter text-xs font-semibold text-elolab-blue shadow-sm">
            <span className="size-1.5 rounded-full bg-elolab-cyan" />
            Menos papelada. Mais cuidado.
          </span>
          <GradientWaveText
            id="notebook-to-app-title"
            as="h2"
            align="center"
            inView
            once={false}
            repeat
            speed={0.75}
            className="font-inter text-3xl font-medium leading-[1.05] tracking-[-0.045em] text-elolab-navy sm:text-4xl lg:text-5xl"
          >
            Saia do caderno. Use o app EloLab.
          </GradientWaveText>
          <p className="mx-auto mt-4 max-w-2xl font-inter text-sm leading-relaxed text-elolab-navy/65 sm:text-base">
            Leve agenda, pacientes e atendimentos para uma rotina digital, organizada e acessível à sua equipe.
          </p>
        </FadeIn>

        <div className="grid items-center gap-3 md:grid-cols-3 md:gap-1 lg:gap-5">
          {stories.map((story, index) => (
            <FadeIn
              key={story.src}
              delay={index * 0.12}
              className="group relative mx-auto flex w-full max-w-[390px] items-center justify-center"
            >
              <Image
                src={story.src}
                alt={story.alt}
                width={1122}
                height={1402}
                sizes="(min-width: 1024px) 30vw, (min-width: 768px) 32vw, 92vw"
                className="h-auto w-full object-contain drop-shadow-[0_18px_30px_rgba(10,34,55,0.08)]"
              />
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
