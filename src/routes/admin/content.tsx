import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type Category } from "@/lib/admin-types";

export const Route = createFileRoute("/admin/content")({
  ssr: false,
  component: ContentPage,
});

function ContentPage() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);

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
    supabase
      .from("categories")
      .select("*")
      .order("position")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
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

  const field = (key: string, label: string, hint?: string, multiline?: boolean) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        {multiline ? (
          <Textarea
            value={vals[key] ?? ""}
            onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
          />
        ) : (
          <Input
            value={vals[key] ?? ""}
            onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
          />
        )}
        <Button onClick={() => save(key)} className="shrink-0">
          Save
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  const imageField = (key: string, label: string, hint?: string) => (
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

  const addCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("category") || "").trim();
    if (!name) return;
    const { error } = await supabase
      .from("categories")
      .insert({ name, position: categories.length });
    if (error) return toast.error(error.message);
    (e.currentTarget as HTMLFormElement).reset();
    supabase
      .from("categories")
      .select("*")
      .order("position")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  };

  const delCategory = async (id: string) => {
    await supabase.from("categories").delete().eq("id", id);
    supabase
      .from("categories")
      .select("*")
      .order("position")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  };

  return (
    <div>
      <AdminPageHeader
        title="Content"
        description="Manage the homepage announcement bar, about section, categories and footer."
      />
      <div className="max-w-xl space-y-8">
        <div className="space-y-4">
          <h3 className="font-medium">Announcement bar</h3>
          <p className="text-xs text-muted-foreground -mt-2">
            Shown as a thin strip above the header on every page. Leave text blank to hide it.
          </p>
          {field("announcement_text", "Text", "e.g. Free delivery on orders over NRS 2000")}
          {field(
            "announcement_link",
            "Link (optional)",
            "Where the bar links to when clicked, e.g. /sale",
          )}
        </div>

        <div className="border-t pt-6 space-y-4">
          <h3 className="font-medium">About section</h3>
          <p className="text-xs text-muted-foreground -mt-2">
            Shown on the homepage, below the shop grid.
          </p>
          {field("about_title", "Title")}
          {field("about_body", "Body text", undefined, true)}
          {imageField("about_image_url", "Image")}
        </div>

        <div className="border-t pt-6 space-y-4">
          <h3 className="font-medium">Categories</h3>
          <p className="text-xs text-muted-foreground -mt-2">
            Used for product tagging and the homepage filter bar.
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-1.5 text-xs border rounded-full pl-3 pr-2 py-1"
              >
                {c.name}
                <button
                  type="button"
                  onClick={() => delCategory(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
            {categories.length === 0 && (
              <span className="text-xs text-muted-foreground">No categories yet</span>
            )}
          </div>
          <form onSubmit={addCategory} className="flex gap-2">
            <Input
              name="category"
              placeholder="New category (e.g. Outerwear)"
              required
              className="flex-1"
            />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </form>
        </div>

        <div className="border-t pt-6 space-y-4">
          <h3 className="font-medium">FAQ section heading</h3>
          {field("faq_heading", "Heading", "Shown above the FAQ list on the /faq page")}
        </div>

        <div className="border-t pt-6 space-y-4">
          <h3 className="font-medium">Footer</h3>
          {field(
            "footer_text",
            "Footer note",
            "Optional line shown next to the copyright, e.g. your business registration info",
          )}
          {field("contact_email", "Contact email")}
          {field("contact_phone", "Contact phone")}
          {field("social_instagram", "Instagram URL")}
          {field("social_facebook", "Facebook URL")}
          {field("social_tiktok", "TikTok URL")}
        </div>
      </div>
    </div>
  );
}
