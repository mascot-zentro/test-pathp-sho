import { useEffect, useRef, useState } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  fetchPriority?: "high" | "low" | "auto";
  noWrapper?: boolean;
}

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='6'%3E%3Crect width='4' height='6' fill='%23f5ede6'/%3E%3C/svg%3E";

const WATERMARK = "© The Aavira";

function drawWatermark(canvas: HTMLCanvasElement, img: HTMLImageElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const size = Math.max(12, Math.round(img.naturalWidth * 0.038));
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  // Shadow for legibility on any background
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(WATERMARK, img.naturalWidth - 10, img.naturalHeight - 10);
  ctx.shadowBlur = 0;
}

// Blocks right-click save and drag on the canvas
function blockSave(e: Event) { e.preventDefault(); }

export function LazyImage({ src, alt, className = "" }: LazyImageProps) {
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  useEffect(() => {
    if (!inView) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (canvasRef.current) {
        drawWatermark(canvasRef.current, img);
        setLoaded(true);
      }
    };
    img.src = src;
  }, [inView, src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("contextmenu", blockSave);
    canvas.addEventListener("dragstart", blockSave);
    return () => {
      canvas.removeEventListener("contextmenu", blockSave);
      canvas.removeEventListener("dragstart", blockSave);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`} style={{ backgroundImage: `url(${PLACEHOLDER})`, backgroundSize: "cover" }}>
      <canvas
        ref={canvasRef}
        className={`w-full h-full transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{ display: "block", objectFit: "cover" }}
      />
    </div>
  );
}

export function LazyImageFill({ src, alt, className = "", fetchPriority = "auto" }: LazyImageProps) {
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  useEffect(() => {
    if (!inView) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (canvasRef.current) {
        drawWatermark(canvasRef.current, img);
        setLoaded(true);
      }
    };
    img.src = src;
  }, [inView, src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("contextmenu", blockSave);
    canvas.addEventListener("dragstart", blockSave);
    return () => {
      canvas.removeEventListener("contextmenu", blockSave);
      canvas.removeEventListener("dragstart", blockSave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full h-full bg-[oklch(0.95_0.010_60)]">
      {!loaded && <div className="absolute inset-0 skeleton" />}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full transition-opacity duration-500 object-cover ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
        style={{ display: "block" }}
      />
    </div>
  );
}
