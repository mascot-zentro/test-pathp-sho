import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/account")({
  ssr: false,
  component: Account,
});

type Order = { id: string; product_name: string; total: number; status: string; created_at: string };

function Account() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("orders").select("id,product_name,total,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  if (!user) return null;
  return (
    <div className="min-h-screen">
      <SiteNav />
      <div className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-display">My account</h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
        <h2 className="text-xl font-display mt-10 mb-4">Orders</h2>
        {orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders linked to this account yet. Guest orders aren't shown here.</p>
        ) : (
          <div className="border rounded-md divide-y">
            {orders.map((o) => (
              <div key={o.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{o.product_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="tabular-nums">NRS {o.total}</div>
                  <div className="text-xs text-muted-foreground capitalize">{o.status.replace(/_/g, " ")}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
