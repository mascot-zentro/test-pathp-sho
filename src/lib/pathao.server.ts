// Pathao Courier Merchant API client. Server-only. Caches tokens in DB.
// Sandbox creds are defaults — override via env vars (PATHAO_*) to go live.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cfg = {
  baseUrl: process.env.PATHAO_BASE_URL || "https://courier-api-sandbox.pathao.com",
  clientId: process.env.PATHAO_CLIENT_ID || "QK9b69QaEv",
  clientSecret: process.env.PATHAO_CLIENT_SECRET || "k12nLGgq0zM3a65Sp65el4SZO6dhhMIxR0rDCavz",
  username: process.env.PATHAO_USERNAME || "test.parcel@pathao.com",
  password: process.env.PATHAO_PASSWORD || "lovePathao",
};

async function fetchNewToken() {
  const res = await fetch(`${cfg.baseUrl}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "password",
      username: cfg.username,
      password: cfg.password,
    }),
  });
  if (!res.ok) throw new Error(`Pathao token failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

export async function getPathaoToken(): Promise<string> {
  const { data } = await supabaseAdmin.from("pathao_tokens").select("*").eq("id", 1).maybeSingle();
  if (data && new Date(data.expires_at).getTime() - Date.now() > 60_000) return data.access_token;
  const tok = await fetchNewToken();
  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("pathao_tokens")
    .upsert({ id: 1, access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: expiresAt, updated_at: new Date().toISOString() });
  return tok.access_token;
}

async function pathaoGet(path: string) {
  const token = await getPathaoToken();
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Pathao GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function pathaoPost(path: string, body: unknown) {
  const token = await getPathaoToken();
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Pathao POST ${path}: ${res.status} ${text}`);
  return json;
}

export const pathao = {
  cities: () => pathaoGet("/aladdin/api/v1/city-list"),
  zones: (cityId: number) => pathaoGet(`/aladdin/api/v1/cities/${cityId}/zone-list`),
  areas: (zoneId: number) => pathaoGet(`/aladdin/api/v1/zones/${zoneId}/area-list`),
  stores: () => pathaoGet("/aladdin/api/v1/stores"),
  createOrder: (body: Record<string, unknown>) => pathaoPost("/aladdin/api/v1/orders", body),
  pricePlan: (body: Record<string, unknown>) => pathaoPost("/aladdin/api/v1/merchant/price-plan", body),
  orderInfo: (consignmentId: string) => pathaoGet(`/aladdin/api/v1/orders/${consignmentId}/info`),
};
