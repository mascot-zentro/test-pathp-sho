import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** "up" fades in while rising slightly; "none" is a plain fade. */
  direction?: "up" | "none";
  as?: "div" | "section";
};

/**
 * Fades + lifts content into view the first time it crosses the viewport.
 * No-ops (renders fully visible, no transition) for users with
 * prefers-reduced-motion enabled.
 */
export function Reveal({ children, className, delay = 0, direction = "up", as = "div" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const Comp = as;

  return (
    <Comp
      ref={ref as never}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out",
        visible ? "opacity-100 translate-y-0" : direction === "up" ? "opacity-0 translate-y-4" : "opacity-0",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
