import type { ImgHTMLAttributes } from "react";

type LandingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
};

export default function Image({ priority, loading, ...props }: LandingImageProps) {
  return (
    <img
      {...props}
      loading={priority ? "eager" : loading ?? "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}
