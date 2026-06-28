import { useEffect, useState } from "react";
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

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="min-w-[4.5rem] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-display text-4xl font-light text-white tabular-nums backdrop-blur-sm">
        {value}
      </div>
      <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">{label}</span>
    </div>
  );
}

export function ComingSoon({ storeName, launchDate }: { storeName: string; launchDate: string | null }) {
  const countdown = useCountdown(launchDate);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[oklch(0.11_0.012_40)] px-6 text-center">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 max-w-lg w-full">

        {/* Logo / store name */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-px w-16 bg-linear-to-r from-transparent via-accent/60 to-transparent" />
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/40">Launching soon</p>
          <h1 className="font-display text-5xl font-light text-white tracking-tight">{storeName}</h1>
          <div className="h-px w-16 bg-linear-to-r from-transparent via-accent/60 to-transparent" />
        </div>

        <p className="text-sm font-light text-white/50 max-w-xs leading-relaxed">
          Curated fashion for the woman who moves with intention. Something beautiful is almost here.
        </p>

        {/* Countdown */}
        {countdown && (
          <div className="flex items-start gap-3 sm:gap-4">
            <Tile value={pad(countdown.days)} label="Days" />
            <span className="mt-3 text-2xl font-light text-white/30">:</span>
            <Tile value={pad(countdown.hours)} label="Hours" />
            <span className="mt-3 text-2xl font-light text-white/30">:</span>
            <Tile value={pad(countdown.minutes)} label="Minutes" />
            <span className="mt-3 text-2xl font-light text-white/30">:</span>
            <Tile value={pad(countdown.seconds)} label="Seconds" />
          </div>
        )}

        {/* Social links */}
        <div className="flex items-center gap-3">
          <a
            href="https://www.instagram.com/the_aavira/"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
            className="grid size-10 place-items-center rounded-full border border-white/15 text-white/50 transition-all duration-300 hover:border-white/40 hover:text-white hover:-translate-y-0.5"
          >
            <Instagram className="size-4" />
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=61583443176427"
            target="_blank"
            rel="noreferrer"
            aria-label="Facebook"
            className="grid size-10 place-items-center rounded-full border border-white/15 text-white/50 transition-all duration-300 hover:border-white/40 hover:text-white hover:-translate-y-0.5"
          >
            <Facebook className="size-4" />
          </a>
          <a
            href="https://www.tiktok.com/@the_aavira"
            target="_blank"
            rel="noreferrer"
            aria-label="TikTok"
            className="grid size-10 place-items-center rounded-full border border-white/15 text-white/50 transition-all duration-300 hover:border-white/40 hover:text-white hover:-translate-y-0.5"
          >
            <TikTokIcon className="size-4" />
          </a>
        </div>

        <p className="text-[10px] text-white/20">
          © {new Date().getFullYear()} {storeName}
        </p>
      </div>
    </div>
  );
}
