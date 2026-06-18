import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPathaoStores } from "@/lib/pathao.functions";
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
        {field("store_name", "Store name")}
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
        <div className="text-xs text-muted-foreground border-t pt-4">
          Pathao API uses sandbox credentials by default. Set PATHAO_CLIENT_ID,
          PATHAO_CLIENT_SECRET, PATHAO_USERNAME, PATHAO_PASSWORD, PATHAO_BASE_URL secrets to go
          live.
        </div>
      </div>
    </div>
  );
}
