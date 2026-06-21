// Server-only: imports supabaseAdmin at top level, so — like
// client.server.ts — this must only ever be loaded via a dynamic
// `await import()` from a route file or *.functions.ts module, never
// imported at the top of one (those ship to the client bundle).
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Vercel (and most reverse proxies) populate x-forwarded-for as
// "client, proxy1, proxy2, ..." — the first entry is the original
// client. Falls back to "unknown" so a missing header still gets one
// shared (generous) bucket rather than throwing.
export function getClientIp(): string {
  const headers = getRequest().headers;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") || "unknown";
}

export class RateLimitError extends Error {
  constructor(message = "Too many requests. Please wait a moment and try again.") {
    super(message);
    this.name = "RateLimitError";
  }
}

type RateLimitOptions = {
  /** Max allowed hits within the window. */
  maxHits: number;
  /** Window length, in seconds. */
  windowSeconds: number;
  /** Override the default per-IP key (e.g. to rate-limit by phone number instead). */
  key?: string;
  message?: string;
};

// Throws RateLimitError if `bucket` (scoped by IP, or `opts.key` if given)
// has already hit `maxHits` within `windowSeconds`; otherwise records this
// call and returns normally. Fails OPEN on infra errors (logs and lets the
// request through) so a rate-limit-table hiccup never takes down checkout
// or any other real feature — this is a defense-in-depth layer, not the
// app's only line of protection.
export async function enforceRateLimit(bucket: string, opts: RateLimitOptions): Promise<void> {
  const scope = opts.key ?? getClientIp();
  const rateLimitKey = `${bucket}:${scope}`;

  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    p_key: rateLimitKey,
    p_max_hits: opts.maxHits,
    p_window_seconds: opts.windowSeconds,
  });

  if (error) {
    console.error(`[rate-limit] check failed for "${rateLimitKey}":`, error.message);
    return;
  }
  if (data !== true) {
    throw new RateLimitError(opts.message);
  }
}
