import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "none";
  as?: "div" | "section";
};

export function Reveal({ children, className, delay = 0, direction = "up", as: Comp = "div" }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cleanup: (() => void) | undefined;

    import("gsap").then(({ gsap }) => {
      import("gsap/ScrollTrigger").then(({ ScrollTrigger }) => {
        gsap.registerPlugin(ScrollTrigger);

        gsap.fromTo(node,
          {
            opacity: 0,
            y: direction === "up" ? 32 : 0,
            x: direction === "left" ? -32 : 0,
          },
          {
            opacity: 1,
            y: 0,
            x: 0,
            duration: 0.8,
            delay: delay / 1000,
            ease: "power3.out",
            scrollTrigger: {
              trigger: node,
              start: "top 88%",
              once: true,
            },
          },
        );

        cleanup = () => {
          ScrollTrigger.getAll()
            .filter((st) => st.trigger === node)
            .forEach((st) => st.kill());
        };
      });
    });

    return () => cleanup?.();
  }, [delay, direction]);

  return (
    <Comp ref={ref as never} className={cn(className)}>
      {children}
    </Comp>
  );
}
