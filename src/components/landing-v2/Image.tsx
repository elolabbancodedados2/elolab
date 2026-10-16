import type { ImgHTMLAttributes } from "react";

type LandingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
};

export default function Image({ priority, loading, fetchPriority, ...props }: LandingImageProps) {
  // React 18 requires the lowercase DOM attribute for fetch priority.
  const priorityAttribute = { fetchpriority: priority ? "high" : fetchPriority };
  return (
    <img
      {...props}
      loading={priority ? "eager" : loading ?? "lazy"}
      {...priorityAttribute}
      decoding="async"
    />
  );
}
