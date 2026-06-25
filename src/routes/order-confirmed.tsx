import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/order-confirmed")({
  validateSearch: z.object({ id: z.string().optional() }).parse,
  component: () => {
    const { id } = Route.useSearch();
    return (
      <div className="min-h-screen flex flex-col">
        <SiteNav />
        <div className="container mx-auto px-6 py-24 text-center max-w-md flex-1">
          <CheckCircle2 className="size-16 text-accent mx-auto" />
          <h1 className="text-3xl font-display mt-6">Order confirmed!</h1>
          <p className="text-lg text-foreground mt-3 font-light">Your parcel is on the way.</p>
          <p className="text-muted-foreground mt-2 text-sm">We'll dispatch it within 1 business day. Thank you for your order!</p>
          {id && <p className="text-xs text-muted-foreground mt-4 font-mono">Order #{id.slice(0, 8).toUpperCase()}</p>}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/track" className="text-sm underline text-accent">Track your order</Link>
            <span className="hidden sm:inline text-muted-foreground/40">·</span>
            <Link to="/" className="text-sm underline text-muted-foreground">Continue shopping</Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  },
});
