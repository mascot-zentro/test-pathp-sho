import type { ComponentType } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

export function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
  delta,
  sub,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: "default" | "accent" | "success" | "warn";
  delta?: number | null;
  sub?: string;
}) {
  const iconTones: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    accent:  "bg-accent/12 text-accent",
    success: "bg-emerald-500/10 text-emerald-600",
    warn:    "bg-amber-500/10 text-amber-600",
  };

  const showDelta = delta !== undefined && delta !== null && isFinite(delta);
  const up = (delta ?? 0) >= 0;

  return (
    <div className="bg-card rounded-xl border shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground font-medium tracking-wide">{label}</span>
        {Icon && (
          <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${iconTones[tone]}`}>
            <Icon className="size-4" />
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-display tracking-tight leading-none">{value}</div>
        {(showDelta || sub) && (
          <div className="mt-2 flex items-center gap-2">
            {showDelta && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium rounded-full px-1.5 py-0.5 ${up ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600"}`}>
                {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {Math.abs(delta!).toFixed(0)}%
              </span>
            )}
            {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
            {showDelta && !sub && <span className="text-xs text-muted-foreground">vs prev period</span>}
          </div>
        )}
      </div>
    </div>
  );
}
