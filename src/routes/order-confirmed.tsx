import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useEffect, useState } from "react";
import { CheckCircle2, Package, MessageCircle, MapPin } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getOrderConfirmation } from "@/lib/orders.functions";
import { supabase } from "@/integrations/supabase/client";
import { trackPurchase } from "@/lib/meta-pixel";

export const Route = createFileRoute("/order-confirmed")({
  validateSearch: z.object({ id: z.string().optional() }).parse,
  component: OrderConfirmed,
});

type OrderData = {
  product_name: string;
  product_id: string;
  customer_name: string;
  total: number;
  delivery_fee: number;
  created_at: string;
  color: string | null;
  size: string | null;
  quantity: number;
};

function EstimatedDelivery({ createdAt }: { createdAt: string }) {
  const created = new Date(createdAt);
  const low = new Date(created);
  low.setDate(low.getDate() + 3);
  const high = new Date(created);
  high.setDate(high.getDate() + 7);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-NP", { month: "short", day: "numeric" });

  return (
    <span>
      {fmt(low)} – {fmt(high)}
    </span>
  );
}

const REDIRECT_SECS = 15;

function OrderConfirmed() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const fetchOrder = useServerFn(getOrderConfirmation);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [waNumber, setWaNumber] = useState("");
  const [show, setShow] = useState(false);
  const [countdown, setCountdown] = useState(REDIRECT_SECS);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) { clearInterval(interval); navigate({ to: "/" }); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [navigate]);

  useEffect(() => {
    if (!id) return;
    fetchOrder({ data: { id } }).then((res) => {
      if (!res) return;
      setOrder(res as OrderData);
      if (res.image_url) setImageUrl(res.image_url);
      trackPurchase({ orderId: id, total: res.total });
    });
  }, [id]);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_number")
      .maybeSingle()
      .then(({ data }) => {
        const raw = data?.value ?? "";
        if (raw) setWaNumber(raw.replace(/\D/g, ""));
      });
  }, []);

  const shortId = id ? id.slice(0, 8).toUpperCase() : null;

  const waText = order
    ? `Hi! I just placed an order (${shortId}) for ${order.product_name}. Can you confirm it?`
    : `Hi! I just placed an order on The Aavira. Can you confirm it?`;
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />

      <main className="flex-1 container mx-auto px-6 py-16 max-w-lg">
        {/* Hero */}
        <div
          className="text-center"
          style={{
            opacity: show ? 1 : 0,
            transform: show ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          {/* Animated success ring */}
          <div className="relative mx-auto mb-6 size-20 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-accent/15 animate-ping" style={{ animationDuration: "2s", animationIterationCount: 3 } as React.CSSProperties} />
            <div className="relative size-20 rounded-full bg-accent/10 flex items-center justify-center">
              <CheckCircle2 className="size-10 text-accent" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-4xl font-display font-light">Order confirmed!</h1>
          <p className="mt-3 text-muted-foreground">
            Thank you{order?.customer_name ? `, ${order.customer_name.split(" ")[0]}` : ""}. Your order is in our hands.
          </p>
          {shortId && (
            <p className="mt-2 font-mono text-xs tracking-widest text-muted-foreground/70 border border-border/50 rounded-full inline-block px-3 py-1">
              Order #{shortId}
            </p>
          )}
        </div>

        {/* Order summary card */}
        {order && (
          <div
            className="mt-10 rounded-2xl border border-border/60 bg-card overflow-hidden"
            style={{
              opacity: show ? 1 : 0,
              transform: show ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s",
            }}
          >
            <div className="px-6 py-5 border-b border-border/40 flex items-center gap-3">
              {imageUrl ? (
                <img src={imageUrl ?? ""} alt={order.product_name} className="w-12 h-12 rounded-md object-cover shrink-0" />
              ) : (
                <Package className="size-4 text-accent shrink-0" />
              )}
              <span className="font-medium text-sm">{order.product_name}</span>
            </div>
            <div className="px-6 py-4 space-y-2.5 text-sm">
              {(order.color || order.size) && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Variant</span>
                  <span>{[order.color, order.size].filter(Boolean).join(" · ")}</span>
                </div>
              )}
              {order.quantity > 1 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Quantity</span>
                  <span>{order.quantity}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Delivery fee</span>
                <span>NRS {order.delivery_fee}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border/40 pt-2.5 mt-2">
                <span>Total (COD)</span>
                <span>NRS {order.total}</span>
              </div>
            </div>
          </div>
        )}

        {/* Estimated delivery */}
        <div
          className="mt-6 rounded-2xl border border-border/60 bg-card px-6 py-5 flex items-start gap-4"
          style={{
            opacity: show ? 1 : 0,
            transform: show ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.7s ease 0.25s, transform 0.7s ease 0.25s",
          }}
        >
          <MapPin className="size-4 text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Estimated delivery</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {order ? <EstimatedDelivery createdAt={order.created_at} /> : "3 – 7 business days"}
              {" "}· Cash on delivery
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              We'll dispatch within 1 business day and you'll get a call to confirm.
            </p>
          </div>
        </div>

        {/* CTAs */}
        <div
          className="mt-8 flex flex-col gap-3"
          style={{
            opacity: show ? 1 : 0,
            transform: show ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.7s ease 0.35s, transform 0.7s ease 0.35s",
          }}
        >
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2.5 rounded-full bg-[#25D366] text-white py-3.5 text-sm font-medium shadow-[0_4px_20px_rgba(37,211,102,0.35)] hover:shadow-[0_6px_28px_rgba(37,211,102,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
              </svg>
              Confirm order on WhatsApp
            </a>
          )}

          <Link
            to="/track"
            search={id ? { phone: undefined } : undefined}
            className="flex items-center justify-center gap-2 rounded-full border border-border py-3.5 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            Track your order
          </Link>

          <Link
            to="/"
            className="text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Continue shopping
            <span className="ml-1.5 tabular-nums text-muted-foreground/50">({countdown}s)</span>
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
