import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Heart } from "lucide-react";

export function ImpactCtaBanner() {
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("impact_settings" as any)
      .select("contribution_percentage")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setPct((data as any).contribution_percentage);
      });
  }, []);

  if (pct === null) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
      <Heart className="size-4 text-rose-500 shrink-0" fill="currentColor" />
      <span>
        <strong>{pct}%</strong> of monthly net profit goes to the{" "}
        <strong>Aavira Impact Fund</strong> · supporting women and communities in Nepal
      </span>
      <Link
        to="/impact"
        className="ml-2 font-medium underline underline-offset-2 hover:text-amber-900 shrink-0"
      >
        Learn more →
      </Link>
    </div>
  );
}
