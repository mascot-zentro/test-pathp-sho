import { useEffect, useRef } from "react";

export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Don't run on touch-only devices
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const dot = dotRef.current;
    if (!dot) return;

    let x = -100, y = -100;
    let raf = 0;

    const move = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
    };

    const render = () => {
      dot.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(render);
    };

    const grow = () => dot.classList.add("cursor-grow");
    const shrink = () => dot.classList.remove("cursor-grow");

    window.addEventListener("mousemove", move, { passive: true });
    document.querySelectorAll("a, button, [role=button], select, input, textarea, label").forEach((el) => {
      el.addEventListener("mouseenter", grow);
      el.addEventListener("mouseleave", shrink);
    });

    // MutationObserver keeps interactive-element listeners up to date as the
    // DOM changes (route transitions, dialogs opening, etc.)
    const observer = new MutationObserver(() => {
      document.querySelectorAll("a, button, [role=button], select, input, textarea, label").forEach((el) => {
        el.removeEventListener("mouseenter", grow);
        el.removeEventListener("mouseleave", shrink);
        el.addEventListener("mouseenter", grow);
        el.addEventListener("mouseleave", shrink);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    raf = requestAnimationFrame(render);
    dot.style.opacity = "1";

    return () => {
      window.removeEventListener("mousemove", move);
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={dotRef}
      aria-hidden
      className="cursor-dot pointer-events-none fixed left-0 top-0 z-[9999] -translate-x-1/2 -translate-y-1/2 opacity-0 will-change-transform"
    />
  );
}
