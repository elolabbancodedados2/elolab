"use client";

// Adapted from Spell UI's Gradient Wave Text component (MIT; see ./LICENSE).
import { useRef, useEffect, useMemo, useCallback, useState, type ElementType } from "react";

type Align = "left" | "center" | "right";

const defaultColors = ["#2f6bff", "#1684d8", "#00b9f2", "#2fe0c9", "#78defc", "#2f6bff"];
type RootTag = "div" | "span" | "strong" | "h1" | "h2" | "h3" | "h4" | "p";

interface GradientWaveTextProps {
  children?: React.ReactNode;
  as?: RootTag;
  id?: string;
  align?: Align;
  alignClassName?: string;
  className?: string;
  baseColor?: string;

  speed?: number; 
  paused?: boolean;
  delay?: number;
  repeat?: boolean;
  inView?: boolean;
  once?: boolean;

  radial?: boolean;
  bottomOffset?: number;
  bandGap?: number;
  bandCount?: number;
  customColors?: string[];

  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;

  ariaLabel?: string;
}


export function GradientWaveText({
  children,
  as = "div",
  id,
  align = "center",
  alignClassName,
  className,
  baseColor = "rgb(10,34,55)",

  speed = 1,
  paused = false,
  delay = 0,
  repeat = true,
  inView = false,
  once = false,

  radial = true,
  bottomOffset = 20,
  bandGap = 4,
  bandCount = 8,
  customColors,

  onClick,
  onMouseEnter,
  onMouseLeave,

  ariaLabel,
}: GradientWaveTextProps) {
  const elRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);
  const tRef = useRef(0);
  const cyclesDoneRef = useRef(0);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);
  const startAtRef = useRef(0);
  const hasPlayedRef = useRef(false);

  const [isInView, setIsInView] = useState(!inView);
  const Root = as as ElementType;

  const cycles = repeat ? 0 : 1;

  useEffect(() => {
    if (!inView) return;

    const node = elRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") { setIsInView(true); return; }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (once && hasPlayedRef.current) return;
            setIsInView(true);
            hasPlayedRef.current = true;
          } else if (!once) {
            setIsInView(false);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, once]);

  const resolvedColors = useMemo(() => {
    return customColors?.length ? customColors : defaultColors;
  }, [customColors]);

  const stops = useMemo(() => {
    const arr: string[] = [];
    const baseColor = "var(--gradient-wave-base, rgb(29,29,31))";
    arr.push(`${baseColor} calc((var(--gi) + 0) * 1%)`);
    for (let i = 0; i < bandCount && i < resolvedColors.length * 2; i++) {
      const color = resolvedColors[i % resolvedColors.length];
      const offset = (i + 2) * bandGap;
      arr.push(`${color} calc((var(--gi) + ${offset}) * 1%)`);
    }
    const endOffset = (bandCount + 2) * bandGap;
    arr.push(`${baseColor} calc((var(--gi) + ${endOffset}) * 1%)`);
    return arr.join(", ");
  }, [resolvedColors, bandGap, bandCount]);

  const gradient = useMemo(() => {
    return radial
      ? `radial-gradient(circle at 50% bottom, ${stops})`
      : `linear-gradient(0deg, ${stops})`;
  }, [radial, stops]);

  useEffect(() => {
    const node = elRef.current;
    if (node) node.style.setProperty("--gi", "-25");
  }, []);

  useEffect(() => {
    if (!isInView) return;

    const node = elRef.current;
    if (!node) return;

    tRef.current = -25;
    cyclesDoneRef.current = 0;
    finishedRef.current = false;
    startedRef.current = false;
    startAtRef.current = performance.now() + Math.max(0, (delay ?? 0) * 1000);
    node.style.setProperty("--gi", "-25");
  }, [isInView, delay]);

  useEffect(() => {
    const node = elRef.current;
    if (!node || !isInView) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.style.setProperty("--gi", "50");
      finishedRef.current = true;
      return;
    }

    const RANGE = 200;
    let last = performance.now();

    const tick = (now: number) => {
      if (finishedRef.current) return;

      if (!startedRef.current) {
        if (now >= startAtRef.current) {
          startedRef.current = true;
          last = now;
        } else {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      const dt = Math.min(64, now - last);
      last = now;

      const shouldAnimate = !paused;

      if (shouldAnimate) {
        const increment = (dt * speed) / 16.6667;
        let next = tRef.current + increment;

        if (cycles === 0) {
          if (next >= RANGE) next = next % RANGE;
          tRef.current = next;
          node.style.setProperty("--gi", String(next));
        } else {
          while (next >= RANGE && cyclesDoneRef.current < cycles) {
            next -= RANGE;
            cyclesDoneRef.current += 1;
          }

          if (cyclesDoneRef.current >= cycles) {
            tRef.current = RANGE;
            node.style.setProperty("--gi", String(RANGE));
            finishedRef.current = true;
            return;
          } else {
            tRef.current = next;
            node.style.setProperty("--gi", String(next));
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [speed, paused, cycles, isInView]);

  const justifyContent =
    align === "left"
      ? "flex-start"
      : align === "right"
        ? "flex-end"
        : "center";

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick?.(e);
    },
    [onClick]
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      onMouseEnter?.(e);
    },
    [onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      onMouseLeave?.(e);
    },
    [onMouseLeave]
  );

  return (
    <Root
      ref={elRef}
      id={id}
      className={`${as === "span" ? "inline-flex w-auto" : "flex w-full"} items-center ${alignClassName ?? ""} ${className ?? ""}`}
      style={{
        justifyContent: alignClassName ? undefined : justifyContent,
        "--gi": -25,
        "--gradient-wave-base": baseColor,
      } as React.CSSProperties}
      aria-label={ariaLabel || undefined}
      role={ariaLabel ? "img" : undefined}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        style={{
          textAlign: alignClassName ? undefined : align,
          backgroundImage: gradient,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          display: "inline-block",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          WebkitBackfaceVisibility: "hidden",
          backfaceVisibility: "hidden",
          transform: "translateZ(0)",
          paddingBottom: `${bottomOffset}%`,
          marginBottom: `-${bottomOffset}%`,
          paddingInline: 2,
        }}
      >
        {children}
      </span>
    </Root>
  );
}

export default GradientWaveText;
