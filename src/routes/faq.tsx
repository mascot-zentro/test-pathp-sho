import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TopSelling } from "@/components/top-selling";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Modern Store" },
      { name: "description", content: "Answers to common questions about delivery, payment, and returns." },
    ],
  }),
  component: FaqPage,
});

type Faq = { id: string; question: string; answer: string };

function FaqPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [heading, setHeading] = useState("Frequently asked questions");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("faqs").select("id,question,answer").eq("active", true).order("position")
      .then(({ data }) => { setFaqs((data as Faq[]) ?? []); setLoading(false); });
    supabase.from("app_settings").select("value").eq("key", "faq_heading").maybeSingle()
      .then(({ data }) => { if (data?.value) setHeading(data.value); });
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <section className="container mx-auto px-6 py-16 max-w-2xl flex-1">
        <h1 className="text-4xl md:text-5xl font-display">{heading}</h1>
        <div className="mt-10">
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : faqs.length === 0 ? (
            <p className="text-muted-foreground">No questions added yet.</p>
          ) : (
            <Accordion type="single" collapsible>
              {faqs.map((f) => (
                <AccordionItem key={f.id} value={f.id}>
                  <AccordionTrigger className="text-left">{f.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground whitespace-pre-line">{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
        <TopSelling />
      </section>
      <SiteFooter />
    </div>
  );
}
