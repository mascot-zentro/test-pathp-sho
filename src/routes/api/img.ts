import { createServerFileRoute } from "@tanstack/react-start/server";

function getAllowedHost(): string {
  const raw =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  return raw.replace(/^https?:\/\//, "").split("/")[0];
}

export const ServerRoute = createServerFileRoute("/api/img").methods({
  GET: async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("url");

    if (!raw) {
      return new Response("Missing url", { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return new Response("Invalid url", { status: 400 });
    }

    const allowedHost = getAllowedHost();

    // Only proxy images from our own Supabase storage — blocks SSRF
    if (
      !allowedHost ||
      parsed.host !== allowedHost ||
      !parsed.pathname.startsWith("/storage/v1/object/public/")
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    const upstream = await fetch(parsed.toString(), {
      headers: { "Accept": "image/*" },
    });

    if (!upstream.ok) {
      return new Response("Not found", { status: 404 });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const body = upstream.body;

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        // Required so the browser allows canvas drawImage() with crossOrigin="anonymous"
        "Access-Control-Allow-Origin": "*",
        // Cache aggressively at CDN — images are immutable once uploaded
        "Cache-Control": "public, max-age=31536000, immutable",
        // Prevent browsers from sniffing the MIME type
        "X-Content-Type-Options": "nosniff",
        // Prevent search engines from indexing the raw proxied URL
        "X-Robots-Tag": "noindex",
      },
    });
  },
});
