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

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const size = Math.max(16, Math.round(w * 0.055));

  ctx.save();
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Rotate canvas 45° around centre and tile the watermark
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 4);

  const spacing = size * 5;
  const cols = Math.ceil((w + h) / spacing) + 2;
  const rows = Math.ceil((w + h) / spacing) + 2;
  const startX = -cols * spacing;
  const startY = -rows * spacing;

  for (let row = 0; row < rows * 2; row++) {
    for (let col = 0; col < cols * 2; col++) {
      const x = startX + col * spacing;
      const y = startY + row * spacing;

      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(WATERMARK, x, y);
    }
  }

  ctx.restore();
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
