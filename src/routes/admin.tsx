import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { claimAdmin } from "@/lib/admin.functions";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const claim = useServerFn(claimAdmin);

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

  const tryClaim = async () => {
    const res = (await claim()) as { granted: boolean; reason?: string };
    if (res.granted) {
      toast.success("You are now admin");
      setIsAdmin(true);
    } else toast.error(res.reason || "Not granted");
  };

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
              <div className="mx-auto size-12 rounded-full bg-accent/10 grid place-items-center mb-2">
                <ShieldCheck className="size-6 text-accent" />
              </div>
              <CardTitle className="font-display text-2xl">Admin access</CardTitle>
              <CardDescription>
                If no admin exists yet, you can claim it. Otherwise, ask an existing admin to grant
                access.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={tryClaim}>Claim admin</Button>
            </CardContent>
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
