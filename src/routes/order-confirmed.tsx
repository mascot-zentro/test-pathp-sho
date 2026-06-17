import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/order-confirmed")({
  validateSearch: z.object({ id: z.string().optional() }).parse,
  component: () => {
    const { id } = Route.useSearch();
    return (
      <div className="min-h-screen">
        <SiteNav />
        <div className="container mx-auto px-6 py-24 text-center max-w-md">
          <CheckCircle2 className="size-16 text-accent mx-auto" />
          <h1 className="text-3xl font-display mt-6">Order confirmed</h1>
          <p className="text-muted-foreground mt-2">Thanks! We'll call to confirm and dispatch via Pathao Courier.</p>
          {id && <p className="text-xs text-muted-foreground mt-4 font-mono">#{id.slice(0, 8)}</p>}
          <Link to="/" className="inline-block mt-8 underline">Continue shopping</Link>
        </div>
      </div>
    );
  },
});
