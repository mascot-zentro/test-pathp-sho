import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { TopSelling } from "@/components/top-selling";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MessageCircle, Truck, RotateCcw, CreditCard } from "lucide-react";

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

const QUICK_LINKS = [
  { icon: Truck, label: "Delivery", desc: "Nationwide COD shipping" },
  { icon: CreditCard, label: "Payment", desc: "Cash on delivery only" },
  { icon: RotateCcw, label: "Returns", desc: "Easy return policy" },
  { icon: MessageCircle, label: "Support", desc: "WhatsApp / call us" },
];

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
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />

      {/* Hero */}
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-6 py-14 md:py-20 max-w-3xl text-center">
          <p className="text-[10px] tracking-[0.25em] uppercase text-accent mb-3">Help centre</p>
          <h1 className="text-4xl md:text-5xl font-display font-light leading-tight mb-4">{heading}</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Can't find an answer? Reach us on WhatsApp and we'll get back to you within the hour.
          </p>
        </div>
      </section>

      {/* Quick-link chips */}
      <section className="border-b">
        <div className="container mx-auto px-6 py-6 max-w-3xl">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {QUICK_LINKS.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <div className="size-8 rounded-lg bg-accent/10 grid place-items-center shrink-0">
                  <Icon className="size-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight">{label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight truncate">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ accordion */}
      <section className="flex-1 container mx-auto px-6 py-12 max-w-3xl">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : faqs.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No questions added yet.</p>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((f) => (
              <AccordionItem
                key={f.id}
                value={f.id}
                className="border rounded-xl px-5 data-[state=open]:bg-muted/40 transition-colors"
              >
                <AccordionTrigger className="text-left text-sm font-medium py-4 hover:no-underline">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm whitespace-pre-line pb-4 leading-relaxed">
                  {f.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        <TopSelling />
      </section>

      <SiteFooter />
    </div>
  );
}
