import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, useRef, lazy, Suspense, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useLenis } from "@/lib/lenis";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { logPageVisit } from "@/lib/visits.functions";
import { AIChat } from "@/components/ai-chat";

const ComingSoon = lazy(() => import("@/components/coming-soon").then((m) => ({ default: m.ComingSoon })));

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
      { title: "The Aavira" },
      { name: "description", content: "Curated fashion for the woman who moves with intention. Shop The Aavira — Nepal's premium COD fashion store." },
      { property: "og:title", content: "The Aavira — Women's Tops & Kurtas | Nepal" },
      { name: "twitter:title", content: "The Aavira — Women's Tops & Kurtas | Nepal" },
      { property: "og:description", content: "Shop women's tops, kurtas, and ethnic wear in Nepal. Cash on delivery across Kathmandu and nationwide." },
      { name: "twitter:description", content: "Shop women's tops, kurtas, and ethnic wear in Nepal. Cash on delivery across Kathmandu and nationwide." },
      { property: "og:image", content: "https://www.theaavira.com/Aavira.png" },
      { name: "twitter:image", content: "https://www.theaavira.com/Aavira.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "The Aavira" },
      { property: "og:locale", content: "en_US" },
      { property: "og:url", content: "https://www.theaavira.com" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/Aavira.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const FONT_URL = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap";

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Non-blocking font load — preload triggers early fetch, stylesheet swap avoids render-block */}
        <link rel="preload" as="style" href={FONT_URL} />
        <link rel="stylesheet" href={FONT_URL} media="print" onLoad={(e) => { (e.currentTarget as HTMLLinkElement).media = "all"; }} />
        <noscript><link rel="stylesheet" href={FONT_URL} /></noscript>
      </head>
      <body>
        {children}
        <Scripts />
        {/* Meta Pixel — page views auto-tracked on load; ViewContent/AddToCart/Purchase
            fired from product/cart/checkout pages via src/lib/meta-pixel.ts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1546456456888527');fbq('track','PageView');`,
          }}
        />
        <noscript>
          <img height="1" width="1" style={{ display: "none" }} src="https://www.facebook.com/tr?id=1546456456888527&ev=PageView&noscript=1" />
        </noscript>
        {/* Behold widget deferred — loaded after page is interactive, not render-blocking */}
        <script
          type="module"
          defer
          dangerouslySetInnerHTML={{ __html: `setTimeout(()=>import("https://w.behold.so/widget.js"),2000)` }}
        />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const logVisit = useServerFn(logPageVisit);
  useLenis();

  const [siteLocked, setSiteLocked] = useState<boolean | null>(null);
  const [launchDate, setLaunchDate] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("The Aavira");
  const settingsLoaded = useRef(false);

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
    if (settingsLoaded.current) return;
    settingsLoaded.current = true;
    supabase.from("app_settings").select("key,value").in("key", ["theme_accent", "store_name", "site_description", "site_locked", "launch_date"]).then(({ data }) => {
      const obj: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: string | null }) => { if (r.value) obj[r.key] = r.value; });
      if (obj.theme_accent) document.documentElement.style.setProperty("--accent", obj.theme_accent);
      if (obj.store_name) {
        const name = obj.store_name;
        const desc = obj.site_description ?? "";
        setStoreName(name);
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
      setSiteLocked(obj.site_locked === "true");
      setLaunchDate(obj.launch_date || null);
    });
  }, []);

  // Logs a visit for storefront pages only — skips /admin so staff browsing
  // their own dashboard doesn't show up as "customer traffic" on the chart.
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) return;
    logVisit({ data: { path } }).catch(() => {});
  }, [router.state.location.pathname, logVisit]);

  const pathname = router.state.location.pathname;
  const isAdminPath = pathname.startsWith("/admin");
  const showComingSoon = siteLocked === true && !isAdminPath;

  return (
    <QueryClientProvider client={queryClient}>
      {showComingSoon ? (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <ComingSoon storeName={storeName} launchDate={launchDate} />
        </Suspense>
      ) : siteLocked === null && !isAdminPath ? (
        // brief blank while settings load — avoids flash of store before lock kicks in
        <div className="min-h-screen bg-background" />
      ) : (
        <>
          <Outlet />
          {!isAdminPath && <AIChat />}
        </>
      )}
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
