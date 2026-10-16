import type { ReactNode } from "react";

type LogosCarouselProps = {
  children: ReactNode;
  count?: number;
  className?: string;
};

export function LogosCarousel({
  children,
  count = 4,
  className = "",
}: LogosCarouselProps) {
  const copies = Math.max(2, count);

  return (
    <div className="logos-carousel">
      <div className="logos-carousel__track">
        {Array.from({ length: copies }, (_, index) => (
          <div
            key={index}
            aria-hidden={index > 0}
            className={`logos-carousel__group ${className}`}
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
