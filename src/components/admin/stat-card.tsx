import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
  delta,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: "default" | "accent" | "success" | "warn";
  delta?: number | null;
}) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
    accent: "bg-accent/10 text-accent",
    success: "bg-emerald-500/10 text-emerald-600",
    warn: "bg-amber-500/10 text-amber-600",
  };
  const showDelta = delta !== undefined && delta !== null && isFinite(delta);
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-display mt-1 truncate">{value}</div>
          {showDelta && (
            <div
              className={`text-xs mt-1 flex items-center gap-0.5 ${up ? "text-emerald-600" : "text-destructive"}`}
            >
              {up ? "▲" : "▼"} {Math.abs(delta!).toFixed(0)}% vs prev
            </div>
          )}
        </div>
        {Icon && (
          <div className={`size-10 rounded-lg grid place-items-center shrink-0 ${tones[tone]}`}>
            <Icon className="size-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
