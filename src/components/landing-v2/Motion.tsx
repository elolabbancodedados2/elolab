"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GradientWaveText } from "./gradient-wave-text";

const MotionDiv = motion.create("div");
const EASE = [0.25, 0.1, 0.25, 1] as const;

type FadeInProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  x?: number;
  y?: number;
};

export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.7,
  x = 0,
  y = 30,
}: FadeInProps) {
  return (
    <MotionDiv
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "50px", amount: 0 }}
      transition={{ delay, duration, ease: EASE }}
    >
      {children}
    </MotionDiv>
  );
}

type MagnetProps = {
  children: ReactNode;
  padding?: number;
  strength?: number;
  className?: string;
};

export function Magnet({
  children,
  padding = 150,
  strength = 3,
  className,
}: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);
  const [active, setActive] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0)`;

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;

      const isNear =
        event.clientX >= rect.left - padding &&
        event.clientX <= rect.right + padding &&
        event.clientY >= rect.top - padding &&
        event.clientY <= rect.bottom + padding;

      if (isNear) {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        x.set((event.clientX - centerX) / strength);
        y.set((event.clientY - centerY) / strength);
        if (!activeRef.current) {
          activeRef.current = true;
          setActive(true);
        }
      } else if (activeRef.current) {
        activeRef.current = false;
        setActive(false);
        x.set(0);
        y.set(0);
      }
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMove);
  }, [padding, strength, x, y]);

  return (
    <MotionDiv
      ref={ref}
      className={className}
      style={{
        transform,
        transition: active
          ? "transform 0.3s ease-out"
          : "transform 0.6s ease-in-out",
        willChange: "transform",
      }}
    >
      {children}
    </MotionDiv>
  );
}

export function ContactButton({
  id,
  href = "mailto:contato@elolab.com.br?subject=Agendar%20demonstra%C3%A7%C3%A3o%20EloLab",
  label = "Contact Me",
}: {
  id?: string;
  href?: string;
  label?: string;
}) {
  return (
    <a
      id={id}
      href={href}
      className="elolab-gradient-button inline-flex items-center justify-center rounded-full px-8 py-3 text-xs font-medium uppercase tracking-widest sm:px-10 sm:py-3.5 sm:text-sm md:px-12 md:py-4 md:text-base"
    >
      <GradientWaveText
        as="span"
        align="left"
        baseColor="hsl(var(--primary-foreground))"
        customColors={["hsl(var(--primary-foreground))", "hsl(var(--muted))", "hsl(var(--primary-foreground))"]}
        inView
        once={false}
        repeat
        className="w-auto"
      >
        {label}
      </GradientWaveText>
    </a>
  );
}

export function LiveProjectButton() {
  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-2 rounded-full border-2 border-border px-8 py-3 text-sm font-medium uppercase tracking-widest text-foreground transition-colors duration-200 hover:bg-primary/15 sm:px-10 sm:py-3.5 sm:text-base"
    >
      <GradientWaveText
        as="span"
        align="left"
        inView
        once={false}
        repeat
        className="w-auto"
      >
        Live Project
      </GradientWaveText>
      <ArrowUpRight aria-hidden="true" className="size-4 sm:size-5" />
    </button>
  );
}

function Character({
  character,
  index,
  total,
  progress,
}: {
  character: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(
    progress,
    [index / total, (index + 1) / total],
    [0.2, 1]
  );
  const rendered = character === " " ? "\u00a0" : character;

  return (
    <span className="relative inline-block">
      <span className="invisible whitespace-pre">{rendered}</span>
      <motion.span className="absolute left-0 top-0" style={{ opacity }}>
        {rendered}
      </motion.span>
    </span>
  );
}

export function AnimatedText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.8", "end 0.2"],
  });
  const characters = [...text];

  return (
    <p
      ref={ref}
      className="max-w-[560px] text-center text-[clamp(1rem,2vw,1.35rem)] font-medium leading-relaxed text-foreground"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {characters.map((character, index) => (
          <Character
            key={`${index}-${character}`}
            character={character}
            index={index}
            total={characters.length}
            progress={scrollYProgress}
          />
        ))}
      </span>
    </p>
  );
}

