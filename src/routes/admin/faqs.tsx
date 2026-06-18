import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type Faq } from "@/lib/admin-types";

export const Route = createFileRoute("/admin/faqs")({
  ssr: false,
  component: FaqsPage,
});

function FaqsPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [active, setActive] = useState(true);

  const load = () =>
    supabase
      .from("faqs")
      .select("*")
      .order("position")
      .then(({ data }) => setFaqs((data as Faq[]) ?? []));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    setActive(editing?.active ?? true);
  }, [editing]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      question: String(f.get("question") || "").trim(),
      answer: String(f.get("answer") || "").trim(),
      active,
    };
    if (!payload.question || !payload.answer)
      return toast.error("Question and answer are required");
    if (editing) {
      const { error } = await supabase.from("faqs").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Updated");
      setEditing(null);
    } else {
      const { error } = await supabase.from("faqs").insert({ ...payload, position: faqs.length });
      if (error) return toast.error(error.message);
      toast.success("FAQ added");
      (e.currentTarget as HTMLFormElement).reset();
      setActive(true);
    }
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this FAQ?")) return;
    await supabase.from("faqs").delete().eq("id", id);
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= faqs.length) return;
    const a = faqs[index],
      b = faqs[target];
    await supabase.from("faqs").update({ position: b.position }).eq("id", a.id);
    await supabase.from("faqs").update({ position: a.position }).eq("id", b.id);
    load();
  };

  return (
    <div>
      <AdminPageHeader title="FAQs" description="Shown publicly at /faq. Use arrows to reorder." />
      <div className="grid lg:grid-cols-[1fr,1.2fr] gap-6">
        <Card className="shadow-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-xl">
              {editing ? "Edit FAQ" : "Add FAQ"}
            </CardTitle>
            <CardDescription>
              {editing ? "Update this question and answer." : "Add a new entry to the FAQ page."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label>Question</Label>
                <Input name="question" required defaultValue={editing?.question ?? ""} />
              </div>
              <div>
                <Label>Answer</Label>
                <Textarea name="answer" rows={4} required defaultValue={editing?.answer ?? ""} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} id="faq_active" />
                <Label htmlFor="faq_active">Visible on site</Label>
              </div>
              <div className="flex gap-2">
                <Button>{editing ? "Save changes" : "Add FAQ"}</Button>
                {editing && (
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
        <Card className="shadow-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-xl">All FAQs</CardTitle>
            <CardDescription>
              {faqs.length} {faqs.length === 1 ? "entry" : "entries"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {faqs.map((f, i) => (
                <div key={f.id} className="p-3 flex items-start gap-3 hover:bg-muted/30 transition">
                  <div className="flex flex-col gap-0.5 pt-1">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={i === faqs.length - 1}
                      onClick={() => move(i, 1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {f.question}{" "}
                      {!f.active && (
                        <Badge variant="secondary" className="text-[10px] py-0 ml-1">
                          hidden
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{f.answer}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del(f.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {faqs.length === 0 && (
                <div className="p-10 text-center text-sm text-muted-foreground">No FAQs yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
