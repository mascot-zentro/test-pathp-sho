import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — The Aavira" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")), password: String(f.get("password")),
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Welcome back"); navigate({ to: "/account" }); }
  };

  const signUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: String(f.get("email")), password: String(f.get("password")),
      options: { emailRedirectTo: window.location.origin, data: { full_name: String(f.get("name") || "") } },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Account created"); navigate({ to: "/account" }); }
  };

  return (
    <div className="min-h-screen">
      <SiteNav />
      <div className="container mx-auto px-6 py-16 max-w-md">
        <h1 className="text-3xl font-display mb-6">Account</h1>
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 w-full"><TabsTrigger value="signin">Sign in</TabsTrigger><TabsTrigger value="signup">Create account</TabsTrigger></TabsList>
          <TabsContent value="signin">
            <form onSubmit={signIn} className="space-y-4 mt-4">
              <div><Label>Email</Label><Input name="email" type="email" required /></div>
              <div><Label>Password</Label><Input name="password" type="password" required minLength={6} /></div>
              <Button className="w-full" disabled={busy}>{busy ? "…" : "Sign in"}</Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-4 mt-4">
              <div><Label>Name</Label><Input name="name" required /></div>
              <div><Label>Email</Label><Input name="email" type="email" required /></div>
              <div><Label>Password</Label><Input name="password" type="password" required minLength={6} /></div>
              <Button className="w-full" disabled={busy}>{busy ? "…" : "Create account"}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
