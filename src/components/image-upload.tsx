import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X } from "lucide-react";

export function ImageUpload({
  bucket,
  value,
  onChange,
  label,
  aspect = "square",
}: {
  bucket: "product-images" | "site-assets";
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  aspect?: "square" | "wide";
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex items-center gap-3">
        <div className={`rounded-md border bg-muted overflow-hidden grid place-items-center shrink-0 ${aspect === "wide" ? "w-32 h-20" : "size-20"}`}>
          {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-muted-foreground px-1 text-center">No image</span>}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Upload className="size-4 mr-1.5" />}
            {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
          </Button>
          {value && !uploading && (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange(null)}>
              <X className="size-4 mr-1.5" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
