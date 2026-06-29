import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteNav } from "@/components/site-nav";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: Admin,
});

function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  if (!user || isAdmin === null) {
    return (
      <div className="min-h-screen">
        <SiteNav />
        <div className="container mx-auto px-6 py-20 text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-muted/30">
        <SiteNav />
        <div className="container mx-auto px-6 py-20 max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto size-12 rounded-full bg-destructive/10 grid place-items-center mb-2">
                <ShieldCheck className="size-6 text-destructive" />
              </div>
              <CardTitle className="font-display text-2xl">Access denied</CardTitle>
              <CardDescription>
                You don't have permission to access this area.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <AdminShell email={user.email}>
      <Outlet />
    </AdminShell>
  );
}
