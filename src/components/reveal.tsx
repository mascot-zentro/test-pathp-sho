import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

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
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const fromVars: gsap.TweenVars = {
      opacity: 0,
      y: direction === "up" ? 32 : 0,
      x: direction === "left" ? -32 : 0,
    };

    gsap.fromTo(node, fromVars, {
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
    });

    return () => {
      ScrollTrigger.getAll()
        .filter((st) => st.trigger === node)
        .forEach((st) => st.kill());
    };
  }, [delay, direction]);

  return (
    <Comp ref={ref as never} className={cn(className)}>
      {children}
    </Comp>
  );
}
