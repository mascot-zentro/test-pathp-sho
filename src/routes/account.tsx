import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My Account — The Aavira" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Account,
});

type Order = { id: string; product_name: string; total: number; status: string; created_at: string };

const STATUS_COLORS: Record<string, string> = {
  pending: "outline",
  submitted: "secondary",
  shipped: "secondary",
  delivered: "default",
  cancelled: "destructive",
};

function OrderSkeleton() {
  return (
    <div className="border rounded-xl divide-y">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-4 flex items-center justify-between gap-3">
          <div className="space-y-2 flex-1">
            <div className="h-3.5 skeleton rounded w-2/5" />
            <div className="h-2.5 skeleton rounded w-1/4" />
          </div>
          <div className="space-y-2 items-end flex flex-col">
            <div className="h-3.5 skeleton rounded w-16" />
            <div className="h-2.5 skeleton rounded w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Account() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id,product_name,total,status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-3xl font-display">My account</h1>
            <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
          </div>
          <Button variant="outline" onClick={signOut} className="shrink-0">Sign out</Button>
        </div>

        <h2 className="text-xl font-display mb-4">Orders</h2>

        {orders === null ? (
          <OrderSkeleton />
        ) : orders.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center border rounded-xl">
            No orders linked to this account yet. Guest orders aren't shown here.
          </p>
        ) : (
          <div className="border rounded-xl divide-y">
            {orders.map((o) => (
              <div key={o.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{o.product_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(o.created_at).toLocaleDateString("en-NP", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="tabular-nums text-sm font-medium">NRS {o.total.toLocaleString()}</div>
                  <Badge variant={(STATUS_COLORS[o.status] ?? "outline") as "default" | "secondary" | "destructive" | "outline"} className="text-[10px] capitalize">
                    {o.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
