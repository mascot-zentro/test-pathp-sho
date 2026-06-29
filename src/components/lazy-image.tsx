import { useEffect, useRef, useState } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  fetchPriority?: "high" | "low" | "auto";
  /** Aspect ratio wrapper — set to skip wrapping */
  noWrapper?: boolean;
}

// Tiny 4×6 warm-cream SVG used as the blur placeholder so there's
// zero network cost and no layout shift before the real image loads.
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='6'%3E%3Crect width='4' height='6' fill='%23f5ede6'/%3E%3C/svg%3E";

export function LazyImage({ src, alt, className = "", fetchPriority = "auto", noWrapper }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Use IntersectionObserver so we only start loading once the image
    // is close to the viewport — saves bandwidth on mobile data.
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <img
      ref={ref}
      src={inView ? src : PLACEHOLDER}
      alt={alt}
      fetchPriority={fetchPriority}
      decoding="async"
      onLoad={() => { if (inView) setLoaded(true); }}
      className={`transition-all duration-500 ${loaded ? "opacity-100 scale-100" : "opacity-0 scale-[1.01]"} ${className}`}
      style={{ backgroundImage: `url(${PLACEHOLDER})`, backgroundSize: "cover" }}
    />
  );
}

// Wrapper that shows the placeholder bg color while image loads,
// then cross-fades to the real image. Drop-in for any aspect-ratio container.
export function LazyImageFill({ src, alt, className = "", fetchPriority = "auto" }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full h-full bg-[oklch(0.95_0.010_60)]">
      {/* Shimmer while not loaded */}
      {!loaded && (
        <div className="absolute inset-0 skeleton" />
      )}
      {inView && (
        <img
          src={src}
          alt={alt}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
        />
      )}
    </div>
  );
}
