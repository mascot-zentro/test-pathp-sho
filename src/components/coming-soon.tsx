import { useEffect, useRef, useState } from "react";
import { Instagram, Facebook } from "lucide-react";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 8.5a5 5 0 0 0 4 1.5V13a8 8 0 0 1-4-1.1V16a5 5 0 1 1-5-5h.5v3.1a2 2 0 1 0 1.5 1.93V3h3a5 5 0 0 0 0 5.5Z" />
    </svg>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function useCountdown(targetDate: string | null) {
  const calc = () => {
    if (!targetDate) return null;
    const diff = new Date(targetDate).getTime() - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const s = Math.floor(diff / 1000);
    return {
      days: Math.floor(s / 86400),
      hours: Math.floor((s % 86400) / 3600),
      minutes: Math.floor((s % 3600) / 60),
      seconds: s % 60,
    };
  };
  const [time, setTime] = useState(calc);
  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return time;
}

// Animated digit tile that flips when value changes
function Tile({ value, label }: { value: string; label: string }) {
  const [prev, setPrev] = useState(value);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (value !== prev) {
      setFlipping(true);
      const t = setTimeout(() => { setPrev(value); setFlipping(false); }, 300);
      return () => clearTimeout(t);
    }
  }, [value, prev]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative min-w-18 h-20 sm:min-w-22 sm:h-24">
        {/* Card face */}
        <div
          className={`absolute inset-0 rounded-2xl border border-white/10 bg-white/4 backdrop-blur-md flex items-center justify-center overflow-hidden transition-all duration-300 ${flipping ? "scale-y-95 opacity-60" : "scale-y-100 opacity-100"}`}
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)" }}
        >
          {/* Top highlight line */}
          <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
          <span className="font-display text-4xl sm:text-5xl font-light text-white tabular-nums select-none">
            {flipping ? prev : value}
          </span>
          {/* Bottom shadow line */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-black/30 to-transparent" />
        </div>
        {/* Glow pulse on flip */}
        {flipping && (
          <div className="absolute inset-0 rounded-2xl bg-accent/20 blur-lg animate-ping" />
        )}
      </div>
      <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-white/35">{label}</span>
    </div>
  );
}

// Floating sparkle particle
function Particle({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="absolute rounded-full bg-accent/60 animate-float"
      style={style}
    />
  );
}

// Orbit ring that rotates
function OrbitRing({ size, duration, delay, opacity }: { size: number; duration: number; delay: number; opacity: number }) {
  return (
    <div
      className="absolute rounded-full border border-accent/20"
      style={{
        width: size,
        height: size,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        animation: `spin ${duration}s linear ${delay}s infinite`,
        opacity,
      }}
    />
  );
}

const PARTICLES = [
  { width: 3, height: 3, top: "18%", left: "12%", animationDelay: "0s", animationDuration: "4s" },
  { width: 2, height: 2, top: "72%", left: "8%",  animationDelay: "1.2s", animationDuration: "5s" },
  { width: 4, height: 4, top: "30%", left: "88%", animationDelay: "0.7s", animationDuration: "3.5s" },
  { width: 2, height: 2, top: "80%", left: "82%", animationDelay: "2s",   animationDuration: "4.5s" },
  { width: 3, height: 3, top: "55%", left: "5%",  animationDelay: "1.5s", animationDuration: "6s" },
  { width: 2, height: 2, top: "10%", left: "60%", animationDelay: "0.3s", animationDuration: "4s" },
  { width: 4, height: 4, top: "65%", left: "92%", animationDelay: "2.5s", animationDuration: "5.5s" },
  { width: 2, height: 2, top: "42%", left: "95%", animationDelay: "1s",   animationDuration: "3.8s" },
];

// Glitchy letter-by-letter reveal
function GlitchTitle({ text }: { text: string }) {
  const [revealed, setRevealed] = useState<boolean[]>(Array(text.length).fill(false));
  const letters = text.split("");

  useEffect(() => {
    letters.forEach((_, i) => {
      setTimeout(() => {
        setRevealed((prev) => { const next = [...prev]; next[i] = true; return next; });
      }, 600 + i * 90);
    });
  }, []);

  return (
    <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-light tracking-tight text-white leading-none">
      {letters.map((ch, i) => (
        <span
          key={i}
          className="inline-block transition-all duration-500"
          style={{
            opacity: revealed[i] ? 1 : 0,
            transform: revealed[i] ? "translateY(0) skewX(0deg)" : "translateY(20px) skewX(-8deg)",
            transitionDelay: `${i * 40}ms`,
          }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </h1>
  );
}

export function ComingSoon({ storeName, launchDate }: { storeName: string; launchDate: string | null }) {
  const countdown = useCountdown(launchDate);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Animated aurora/nebula canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let t = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const blobs = [
      { x: 0.3, y: 0.3, r: 0.35, speed: 0.00018, phase: 0,   color: "196, 118, 45" },   // amber/gold
      { x: 0.7, y: 0.6, r: 0.30, speed: 0.00013, phase: 2.1, color: "190, 70, 120" },   // rose
      { x: 0.5, y: 0.8, r: 0.25, speed: 0.00022, phase: 4.2, color: "80, 60, 140" },    // violet
    ];

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Deep dark base
      ctx.fillStyle = "oklch(0.11 0.012 40)";
      ctx.fillRect(0, 0, W, H);

      for (const b of blobs) {
        const bx = (b.x + 0.12 * Math.sin(t * b.speed + b.phase)) * W;
        const by = (b.y + 0.10 * Math.cos(t * b.speed * 1.3 + b.phase)) * H;
        const br = b.r * Math.min(W, H);
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        grad.addColorStop(0,   `rgba(${b.color}, 0.13)`);
        grad.addColorStop(0.5, `rgba(${b.color}, 0.05)`);
        grad.addColorStop(1,   `rgba(${b.color}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }

      t++;
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[oklch(0.11_0.012_40)] px-6 text-center select-none">
      {/* Aurora canvas */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 w-full h-full" />

      {/* Orbit rings */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <OrbitRing size={520} duration={30} delay={0}   opacity={0.4} />
        <OrbitRing size={720} duration={50} delay={-10} opacity={0.2} />
        <OrbitRing size={920} duration={80} delay={-25} opacity={0.1} />
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0">
        {PARTICLES.map((p, i) => (
          <Particle key={i} style={{ width: p.width, height: p.height, top: p.top, left: p.left, animationDelay: p.animationDelay, animationDuration: p.animationDuration }} />
        ))}
      </div>

      {/* Centered content */}
      <div
        className="relative z-10 flex flex-col items-center gap-10 max-w-2xl w-full"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.9s cubic-bezier(0.22,1,0.36,1), transform 0.9s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Eyebrow */}
        <div
          className="flex flex-col items-center gap-3"
          style={{ transitionDelay: "100ms" }}
        >
          <div className="flex items-center gap-3">
            <div className="h-px w-12 bg-linear-to-r from-transparent to-accent/70" />
            <span className="text-[10px] font-medium uppercase tracking-[0.35em] text-accent/80">Something beautiful is coming</span>
            <div className="h-px w-12 bg-linear-to-l from-transparent to-accent/70" />
          </div>
        </div>

        {/* Store name with glitch reveal */}
        <div className="flex flex-col items-center gap-4">
          <GlitchTitle text={storeName} />
          <p
            className="text-sm font-light text-white/45 max-w-sm leading-relaxed"
            style={{
              opacity: mounted ? 1 : 0,
              transition: "opacity 1s ease 1.4s",
            }}
          >
            Curated fashion for the woman who moves with intention.
          </p>
        </div>

        {/* Countdown */}
        {countdown && (
          <div
            className="flex items-start gap-4 sm:gap-6"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
              transition: "opacity 0.8s ease 0.8s, transform 0.8s cubic-bezier(0.22,1,0.36,1) 0.8s",
            }}
          >
            <Tile value={pad(countdown.days)} label="Days" />
            <div className="flex flex-col items-center pt-5 gap-4 text-white/25 font-light text-2xl">
              <span>:</span>
            </div>
            <Tile value={pad(countdown.hours)} label="Hours" />
            <div className="flex flex-col items-center pt-5 gap-4 text-white/25 font-light text-2xl">
              <span>:</span>
            </div>
            <Tile value={pad(countdown.minutes)} label="Minutes" />
            <div className="flex flex-col items-center pt-5 gap-4 text-white/25 font-light text-2xl">
              <span>:</span>
            </div>
            <Tile value={pad(countdown.seconds)} label="Seconds" />
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-4 w-full max-w-xs">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-white/20 text-xs tracking-widest">✦</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {/* Social */}
        <div
          className="flex flex-col items-center gap-4"
          style={{
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.8s ease 1.2s",
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/30">Follow us</p>
          <div className="flex items-center gap-3">
            {[
              { href: "https://www.instagram.com/the_aavira/", label: "Instagram", icon: <Instagram className="size-4" /> },
              { href: "https://www.facebook.com/profile.php?id=61583443176427", label: "Facebook", icon: <Facebook className="size-4" /> },
              { href: "https://www.tiktok.com/@the_aavira", label: "TikTok", icon: <TikTokIcon className="size-4" /> },
            ].map(({ href, label, icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="group grid size-11 place-items-center rounded-full border border-white/12 bg-white/3 text-white/40 backdrop-blur-sm transition-all duration-300 hover:border-accent/60 hover:text-accent hover:bg-accent/8 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(196,118,45,0.25)]"
              >
                {icon}
              </a>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-white/15 tracking-wider">
          © {new Date().getFullYear()} {storeName} · Nepal
        </p>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
