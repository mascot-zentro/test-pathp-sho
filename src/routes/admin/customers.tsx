import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination } from "@/components/admin/pagination";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Users, ShoppingCart, DollarSign, TrendingUp, Phone, MapPin, Search, ChevronDown, ChevronUp, MessageCircle, Sparkles, Copy, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { draftWhatsAppReply } from "@/lib/ai.functions";

export const Route = createFileRoute("/admin/customers")({
  ssr: false,
  component: CustomersPage,
});

type RawOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  total: number;
  status: string;
  created_at: string;
  order_group_id: string | null;
};

type Customer = {
  phone: string;
  name: string;
  address: string;
  orders: RawOrder[];
  totalSpent: number;
  orderCount: number;
  lastOrderAt: string;
};

function buildCustomers(orders: RawOrder[]): Customer[] {
  const map = new Map<string, Customer>();
  for (const o of orders) {
    const key = o.customer_phone;
    if (!map.has(key)) {
      map.set(key, { phone: key, name: o.customer_name, address: o.customer_address, orders: [], totalSpent: 0, orderCount: 0, lastOrderAt: o.created_at });
    }
    const c = map.get(key)!;
    c.orders.push(o);
    if (!["cancelled"].includes(o.status)) c.totalSpent += o.total;
    c.lastOrderAt = c.lastOrderAt > o.created_at ? c.lastOrderAt : o.created_at;
  }
  for (const c of map.values()) {
    const groups = new Set(c.orders.map((o) => o.order_group_id ?? o.id));
    c.orderCount = groups.size;
  }
  return [...map.values()].sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "delivered") return "default";
  if (s === "cancelled") return "destructive";
  if (s === "shipped" || s === "submitted") return "secondary";
  return "outline";
}

function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("977")) return digits;
  if (digits.startsWith("0")) return `977${digits.slice(1)}`;
  return `977${digits}`;
}

function nameInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function WhatsAppDrafter({ c }: { c: Customer }) {
  const [customerMsg, setCustomerMsg] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const draftReply = useServerFn(draftWhatsAppReply);

  const lastOrder = c.orders[0];
  const orderDetails = lastOrder
    ? `Last order: ${lastOrder.product_name}${lastOrder.size ? ` (${lastOrder.size})` : ""}${lastOrder.color ? ` in ${lastOrder.color}` : ""} — NRS ${lastOrder.total} — status: ${lastOrder.status}`
    : undefined;

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await draftReply({ data: { customerMessage: customerMsg || "General inquiry", customerName: c.name, orderDetails } });
      setDraft(result);
    } finally {
      setGenerating(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 border-t border-border/50 pt-4 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">AI WhatsApp reply</p>
      <Textarea
        placeholder="Paste customer's message here (optional)…"
        value={customerMsg}
        onChange={(e) => setCustomerMsg(e.target.value)}
        rows={2}
        className="text-sm resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs bg-accent text-white px-3 py-1.5 rounded-md disabled:opacity-50 hover:bg-accent/90 transition"
        >
          <Sparkles className="size-3" />
          {generating ? "Drafting…" : "Draft reply"}
        </button>
        {draft && (
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-md hover:bg-muted/50 transition"
          >
            {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        )}
      </div>
      {draft && (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="text-sm resize-none bg-muted/30"
        />
      )}
    </div>
  );
}

function CustomerCard({ c }: { c: Customer }) {
  const [open, setOpen] = useState(false);
  const initials = nameInitials(c.name);
  const isReturning = c.orderCount > 1;

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="p-4 sm:p-5 flex items-center gap-4">
          {/* Avatar */}
          <div className="size-10 rounded-full bg-accent/12 text-accent grid place-items-center shrink-0 font-medium text-sm">
            {initials}
          </div>

          {/* Name + contact */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{c.name}</span>
              {isReturning && (
                <Badge className="text-[10px] px-1.5 py-0 h-4 bg-accent/12 text-accent border-transparent font-medium">
                  Returning
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
              <a
                href={`tel:${c.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                title="Call"
              >
                <Phone className="size-3 shrink-0" />
                {c.phone}
              </a>
              <a
                href={`https://wa.me/${waNumber(c.phone)}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 hover:text-green-600 transition-colors"
                title="Open WhatsApp"
              >
                <MessageCircle className="size-3 shrink-0" />
                WhatsApp
              </a>
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate max-w-[200px]">{c.address}</span>
              </span>
            </div>
          </div>

          {/* Stats + toggle */}
          <div className="shrink-0 flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold tabular-nums">NRS {c.totalSpent.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.orderCount} order{c.orderCount !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="text-right sm:hidden">
              <div className="text-sm font-semibold tabular-nums">NRS {c.totalSpent.toLocaleString()}</div>
            </div>
            {open ? (
              <ChevronUp className="size-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground shrink-0" />
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t bg-muted/20 px-4 sm:px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Order history
          </p>

          <div className="space-y-2">
            {c.orders.map((o) => (
              <div
                key={o.id}
                className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-border/50 last:border-0"
              >
                <div className="min-w-0">
                  <span className="font-medium">{o.product_name}</span>
                  {(o.color || o.size) && (
                    <span className="text-muted-foreground text-xs ml-1">
                      — {[o.color, o.size].filter(Boolean).join(", ")}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs ml-1">×{o.quantity}</span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(o.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusVariant(o.status)} className="capitalize text-[10px]">
                    {o.status}
                  </Badge>
                  <span className="font-medium text-xs tabular-nums">NRS {o.total.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <WhatsAppDrafter c={c} />
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card rounded-xl border shadow-sm p-5 flex items-center gap-4">
      <div className="size-10 rounded-full bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-muted rounded animate-pulse w-40" />
        <div className="h-3 bg-muted rounded animate-pulse w-56" />
      </div>
      <div className="hidden sm:block space-y-1.5 text-right">
        <div className="h-4 bg-muted rounded animate-pulse w-24" />
        <div className="h-3 bg-muted rounded animate-pulse w-16 ml-auto" />
      </div>
    </div>
  );
}

function CustomersPage() {
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("orders")
      .select("id,customer_name,customer_phone,customer_address,product_name,color,size,quantity,total,status,created_at,order_group_id")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data as RawOrder[]) ?? []);
        setLoading(false);
      });
  }, []);

  const customers = useMemo(() => buildCustomers(orders), [orders]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.address.toLowerCase().includes(q),
    );
  }, [customers, search]);

  const { paged: pagedCustomers, page, setPage, totalPages, total: filteredTotal, start, end } = usePagination(filtered, 20);

  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
  const returning = customers.filter((c) => c.orderCount > 1).length;
  const returningPct = customers.length ? Math.round((returning / customers.length) * 100) : 0;

  return (
    <div>
      <AdminPageHeader
        title="Customers"
        description="Every customer derived from order history — sorted by most recent activity."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Total customers" value={String(customers.length)} icon={Users} tone="accent" />
        <Stat label="Total revenue" value={`NRS ${totalRevenue.toLocaleString()}`} icon={DollarSign} tone="success" />
        <Stat
          label="Returning customers"
          value={String(returning)}
          icon={TrendingUp}
          tone="accent"
          sub={customers.length > 0 ? `${returningPct}% of total` : undefined}
        />
        <Stat label="Total orders" value={String(orders.length)} icon={ShoppingCart} />
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 bg-card"
          placeholder="Search by name, phone, or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {search && (
        <p className="text-xs text-muted-foreground mb-4">
          {filtered.length} of {customers.length} customers
        </p>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : filteredTotal === 0 ? (
          <div className="py-16 text-center">
            <Users className="size-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {customers.length === 0 ? "No customers yet." : "No customers match your search."}
            </p>
          </div>
        ) : (
          pagedCustomers.map((c) => <CustomerCard key={c.phone} c={c} />)
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} total={filteredTotal} start={start} end={end} onPage={setPage} label="customers" />
    </div>
  );
}
