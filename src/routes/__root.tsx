import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useLenis } from "@/lib/lenis";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { logPageVisit } from "@/lib/visits.functions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="mt-6 inline-block underline">Go home</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-4 underline">Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Modern Store" },
      { name: "description", content: "Shop quality products with fast nationwide delivery." },
      { property: "og:title", content: "Modern Store" },
      { name: "twitter:title", content: "Modern Store" },
      { property: "og:description", content: "Shop quality products with fast nationwide delivery." },
      { name: "twitter:description", content: "Shop quality products with fast nationwide delivery." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d22ac982-2d9a-478f-8091-c612f9a9aaa0/id-preview-5c1e9a86--c492d606-95e1-4400-bdcd-382906516b9d.lovable.app-1781680316940.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d22ac982-2d9a-478f-8091-c612f9a9aaa0/id-preview-5c1e9a86--c492d606-95e1-4400-bdcd-382906516b9d.lovable.app-1781680316940.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const logVisit = useServerFn(logPageVisit);
  useLenis();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  useEffect(() => {
    supabase.from("app_settings").select("key,value").in("key", ["theme_accent", "store_name", "site_description"]).then(({ data }) => {
      const obj: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: string | null }) => { if (r.value) obj[r.key] = r.value; });
      if (obj.theme_accent) document.documentElement.style.setProperty("--accent", obj.theme_accent);
      if (obj.store_name) {
        const name = obj.store_name;
        const desc = obj.site_description ?? "";
        document.title = name;
        const set = (sel: string, attr: string, val: string) => {
          const el = document.querySelector<HTMLMetaElement>(sel);
          if (el) el.setAttribute("content", val);
        };
        set('meta[property="og:title"]', "content", name);
        set('meta[name="twitter:title"]', "content", name);
        if (desc) {
          set('meta[name="description"]', "content", desc);
          set('meta[property="og:description"]', "content", desc);
          set('meta[name="twitter:description"]', "content", desc);
        }
      }
    });
  }, []);

  // Logs a visit for storefront pages only — skips /admin so staff browsing
  // their own dashboard doesn't show up as "customer traffic" on the chart.
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return;
    logVisit({ data: { path } }).catch(() => {});
  }, [router.state.location.pathname, logVisit]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
