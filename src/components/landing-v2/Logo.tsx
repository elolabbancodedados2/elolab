"use client";

import { forwardRef, useId } from "react";

type LogoProps = {
  className?: string;
  markRef?: React.Ref<SVGGElement>;
  wordmark?: boolean;
};

/**
 * EloLab mark: two interlocking links (the "elo"), drawn as a single
 * continuous monoline stroke so it can be animated with stroke-dashoffset.
 */
const Logo = forwardRef<HTMLDivElement, LogoProps>(
  ({ className = "", markRef, wordmark = true }, ref) => {
    const gradientId = useId();
    return (
      <div ref={ref} className={`flex items-center gap-2.5 ${className}`}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          className="h-8 w-8 shrink-0"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="4" y1="8" x2="44" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#2F6BFF" />
              <stop offset="1" stopColor="#2FE0C9" />
            </linearGradient>
          </defs>
          <g
            ref={markRef}
            transform="rotate(-38 24 24)"
            stroke={`url(#${gradientId})`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="7.5" y="10.5" width="26" height="15" rx="7.5" />
            <rect x="14.5" y="22.5" width="26" height="15" rx="7.5" opacity="0.86" />
          </g>
        </svg>
        {wordmark && (
          <span className="font-inter text-lg font-semibold tracking-tight text-elolab-ink">
            Elo<span className="font-normal text-elolab-blue">Lab</span>
          </span>
        )}
      </div>
    );
  }
);

Logo.displayName = "Logo";

export default Logo;
