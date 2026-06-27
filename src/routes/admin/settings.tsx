import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPathaoStores, getPathaoCredentials, savePathaoCredentials, getCities, getZones, getDeliveryEstimate } from "@/lib/pathao.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/image-upload";
import { AdminPageHeader } from "@/components/admin/page-header";

export const Route = createFileRoute("/admin/settings")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [stores, setStores] = useState<
    { store_id: number; store_name: string; store_address: string }[] | null
  >(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const fetchStores = useServerFn(getPathaoStores);

  // End-to-end diagnostic: runs the exact same calls checkout does (cities
  // -> zones -> price-plan) using the first city/zone Pathao returns, so
  // the admin can tell at a glance whether delivery-fee calculation is
  // broken because of credentials, store_id, or something else — instead
  // of having to place a real test order to find out.
  const fetchCities = useServerFn(getCities);
  const fetchZones = useServerFn(getZones);
  const fetchDeliveryEstimate = useServerFn(getDeliveryEstimate);
  const [testingDelivery, setTestingDelivery] = useState(false);
  const [deliveryTestResult, setDeliveryTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const testDeliveryFee = async () => {
    setTestingDelivery(true);
    setDeliveryTestResult(null);
    try {
      const citiesRes = (await fetchCities()) as { data?: { data?: { city_id: number; city_name: string }[] }; error?: string };
      if (citiesRes?.error) { setDeliveryTestResult({ ok: false, message: `Couldn't load cities: ${citiesRes.error}` }); return; }
      const city = citiesRes?.data?.data?.[0];
      if (!city) { setDeliveryTestResult({ ok: false, message: "Pathao returned no cities — check credentials above." }); return; }

      const zonesRes = (await fetchZones({ data: { cityId: city.city_id } })) as { data?: { data?: { zone_id: number; zone_name: string }[] }; error?: string };
      if (zonesRes?.error) { setDeliveryTestResult({ ok: false, message: `Couldn't load zones for ${city.city_name}: ${zonesRes.error}` }); return; }
      const zone = zonesRes?.data?.data?.[0];
      if (!zone) { setDeliveryTestResult({ ok: false, message: `Pathao returned no zones for ${city.city_name}.` }); return; }

      const feeRes = (await fetchDeliveryEstimate({ data: { cityId: city.city_id, zoneId: zone.zone_id, weight: 0.5 } })) as
        | { ok: true; fee: number }
        | { ok: false; reason: "not_configured" | "unavailable" };
      if (!feeRes.ok) {
        setDeliveryTestResult({
          ok: false,
          message:
            feeRes.reason === "not_configured"
              ? "No Pathao store is selected below — pick one from 'Load stores' first."
              : `Pathao's price-plan call failed for ${city.city_name} / ${zone.zone_name}. Check the server logs for the exact error, or re-check your credentials and selected store above.`,
        });
        return;
      }
      setDeliveryTestResult({ ok: true, message: `Success — NRS ${feeRes.fee} for ${city.city_name} / ${zone.zone_name} (0.5kg).` });
    } catch (e) {
      setDeliveryTestResult({ ok: false, message: `Unexpected error: ${String(e)}` });
    } finally {
      setTestingDelivery(false);
    }
  };

  // Pathao production API credentials — stored in the DB (pathao_credentials
  // table, service-role only) instead of hardcoded, so going live doesn't
  // require touching code or redeploying. See pathao.server.ts for how
  // these are resolved: DB row -> PATHAO_* env vars -> sandbox defaults.
  const fetchCreds = useServerFn(getPathaoCredentials);
  const saveCreds = useServerFn(savePathaoCredentials);
  const [credsLoading, setCredsLoading] = useState(true);
  const [credsSaving, setCredsSaving] = useState(false);
  const [credsConfigured, setCredsConfigured] = useState(false);
  const [credsUpdatedAt, setCredsUpdatedAt] = useState<string | null>(null);
  const [creds, setCreds] = useState({
    baseUrl: "https://api-hermes.pathao.com",
    clientId: "",
    clientSecret: "",
    username: "",
    password: "",
  });
  const [secretMaskHint, setSecretMaskHint] = useState("");
  const [passwordMaskHint, setPasswordMaskHint] = useState("");

  const loadCredentials = async () => {
    setCredsLoading(true);
    try {
      const res = await fetchCreds();
      setCredsConfigured(res.configured);
      setCredsUpdatedAt(res.updatedAt);
      setCreds((c) => ({
        ...c,
        baseUrl: res.baseUrl || c.baseUrl,
        clientId: res.clientId || "",
        username: res.username || "",
        clientSecret: "",
        password: "",
      }));
      setSecretMaskHint(res.clientSecretMasked);
      setPasswordMaskHint(res.passwordMasked);
    } catch (e) {
      toast.error(`Couldn't load Pathao credentials: ${String(e)}`);
    } finally {
      setCredsLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  const handleSaveCredentials = async () => {
    if (!creds.clientId.trim() || !creds.username.trim()) {
      toast.error("Client ID and username are required.");
      return;
    }
    if (!credsConfigured && (!creds.clientSecret || !creds.password)) {
      toast.error("Client secret and password are required the first time you set this up.");
      return;
    }
    setCredsSaving(true);
    try {
      await saveCreds({ data: creds });
      toast.success("Pathao credentials saved. New requests will use them right away.");
      await loadCredentials();
    } catch (e) {
      toast.error(`Couldn't save: ${String(e)}`);
    } finally {
      setCredsSaving(false);
    }
  };

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("*")
      .then(({ data }) => {
        const obj: Record<string, string> = {};
        (data ?? []).forEach((r: { key: string; value: string | null }) => {
          obj[r.key] = r.value ?? "";
        });
        setVals(obj);
      });
  }, []);

  const save = async (key: string) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value: vals[key] ?? "", updated_at: new Date().toISOString() });
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const saveValue = async (key: string, value: string) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const loadStores = async () => {
    setStoresLoading(true);
    try {
      const res = (await fetchStores()) as {
        data?: { data?: { store_id: number; store_name: string; store_address: string }[] };
        error?: string;
      };
      if (res?.error) {
        toast.error(res.error);
        setStores([]);
        return;
      }
      setStores(res?.data?.data ?? []);
    } catch (e) {
      toast.error(`Couldn't fetch stores: ${String(e)}`);
      setStores([]);
    } finally {
      setStoresLoading(false);
    }
  };

  const chooseStore = (storeId: number) => {
    setVals((p) => ({ ...p, pathao_store_id: String(storeId) }));
    saveValue("pathao_store_id", String(storeId));
  };

  const field = (key: string, label: string, hint?: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={vals[key] ?? ""}
          onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
        />
        <Button onClick={() => save(key)}>Save</Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  const colorField = (key: string, label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={vals[key] || "#c4762d"}
          onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
          className="size-9 rounded border cursor-pointer"
        />
        <Input
          value={vals[key] ?? ""}
          placeholder="Leave blank for default"
          onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
        />
        <Button onClick={() => save(key)}>Save</Button>
      </div>
    </div>
  );

  const imageField = (key: "logo_url" | "hero_image_url", label: string, hint?: string) => (
    <div className="space-y-1">
      <ImageUpload
        bucket="site-assets"
        value={vals[key] || null}
        onChange={(url) => {
          const v = url ?? "";
          setVals((p) => ({ ...p, [key]: v }));
          saveValue(key, v);
        }}
        label={label}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div>
      <AdminPageHeader
        title="Settings"
        description="Store branding, homepage hero and shipping configuration."
      />
      <div className="max-w-xl space-y-6">
        {field("store_name", "Store name", "Shown in the browser tab, OG share cards, and search results.")}
        {field("site_url", "Site URL", "Your full domain e.g. https://mystore.com — used in sitemap and share links. No trailing slash.")}
        {field("site_description", "Store description", "One sentence shown in Google search results and link previews.")}
        {imageField(
          "logo_url",
          "Logo",
          "Shown in the header. Leave empty to use the store name as text.",
        )}
        {colorField("theme_accent", "Accent color")}
        <div className="border-t pt-6 space-y-4">
          <h3 className="font-medium">Homepage hero</h3>
          {field("hero_title", "Hero title")}
          {field("hero_subtitle", "Hero subtitle")}
          {imageField(
            "hero_image_url",
            "Hero banner image",
            "Optional. Shown behind the hero text on the homepage.",
          )}
        </div>
        {field(
          "whatsapp_number",
          "Default WhatsApp number",
          "Used on product pages when product has no override. Format: 9779841234567",
        )}
        {field(
          "pathao_store_id",
          "Pathao Store ID",
          "Get this from the Pathao merchant dashboard, or fetch your stores below. Required for creating Pathao orders.",
        )}
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadStores}
            disabled={storesLoading}
          >
            {storesLoading ? "Fetching…" : "Fetch my Pathao stores"}
          </Button>
          {stores !== null &&
            (stores.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No stores found on this Pathao account, or the credentials aren't set up yet.
              </p>
            ) : (
              <div className="border rounded-md divide-y">
                {stores.map((s) => (
                  <button
                    key={s.store_id}
                    type="button"
                    onClick={() => chooseStore(s.store_id)}
                    className={`w-full text-left p-3 text-sm hover:bg-muted/50 transition ${vals.pathao_store_id === String(s.store_id) ? "bg-accent/10" : ""}`}
                  >
                    <div className="font-medium">
                      {s.store_name}{" "}
                      {vals.pathao_store_id === String(s.store_id) && (
                        <span className="text-accent text-xs">· selected</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.store_address} · ID {s.store_id}
                    </div>
                  </button>
                ))}
              </div>
            ))}
        </div>

        <div className="space-y-2 border-t pt-6">
          <div>
            <h3 className="font-medium">Test delivery fee calculation</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Runs the exact same check checkout does — fetches a city and zone from Pathao, then asks for
              a price. Use this if customers are reporting that the delivery fee won't calculate.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={testDeliveryFee} disabled={testingDelivery}>
            {testingDelivery ? "Testing…" : "Test delivery fee"}
          </Button>
          {deliveryTestResult && (
            <p className={`text-xs ${deliveryTestResult.ok ? "text-green-700" : "text-destructive"}`}>
              {deliveryTestResult.message}
            </p>
          )}
        </div>

        <div className="border-t pt-6 space-y-4">
          <div>
            <h3 className="font-medium">Pathao API credentials</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {credsLoading
                ? "Loading…"
                : credsConfigured
                ? `Custom credentials configured${credsUpdatedAt ? ` · last updated ${new Date(credsUpdatedAt).toLocaleString()}` : ""}.`
                : "Not configured yet — currently using sandbox test credentials. Fill this in and save to go live."}
            </p>
          </div>

          <div className="space-y-1">
            <Label>API base URL</Label>
            <Input
              value={creds.baseUrl}
              onChange={(e) => setCreds({ ...creds, baseUrl: e.target.value })}
              placeholder="https://api-hermes.pathao.com"
            />
            <p className="text-xs text-muted-foreground">
              Sandbox: https://courier-api-sandbox.pathao.com · Production: https://api-hermes.pathao.com
            </p>
          </div>

          <div className="space-y-1">
            <Label>Client ID</Label>
            <Input value={creds.clientId} onChange={(e) => setCreds({ ...creds, clientId: e.target.value })} />
          </div>

          <div className="space-y-1">
            <Label>Client secret</Label>
            <Input
              type="password"
              value={creds.clientSecret}
              onChange={(e) => setCreds({ ...creds, clientSecret: e.target.value })}
              placeholder={secretMaskHint ? `Currently: ${secretMaskHint} — leave blank to keep` : "Enter client secret"}
            />
          </div>

          <div className="space-y-1">
            <Label>Pathao account email</Label>
            <Input value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} />
          </div>

          <div className="space-y-1">
            <Label>Pathao account password</Label>
            <Input
              type="password"
              value={creds.password}
              onChange={(e) => setCreds({ ...creds, password: e.target.value })}
              placeholder={passwordMaskHint ? `Currently: ${passwordMaskHint} — leave blank to keep` : "Enter password"}
            />
          </div>

          <Button onClick={handleSaveCredentials} disabled={credsSaving || credsLoading}>
            {credsSaving ? "Saving…" : "Save Pathao credentials"}
          </Button>

          <p className="text-xs text-muted-foreground">
            These are stored securely and only used by the server when talking to Pathao —
            they are never sent to the browser. Get production credentials from your Pathao
            merchant dashboard under API settings. Saving new credentials takes effect on the
            next Pathao request.
          </p>
        </div>
      </div>
    </div>
  );
}
