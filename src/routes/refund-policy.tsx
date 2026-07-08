import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund & Return Policy — The Aavira" },
      { name: "description", content: "Our return and refund policy — what's eligible, how to initiate a return, and when to expect your refund." },
    ],
  }),
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  const [storeName, setStoreName] = useState("The Aavira");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key,value")
      .in("key", ["store_name", "contact_email", "contact_phone"])
      .then(({ data }) => {
        (data ?? []).forEach((r) => {
          if (!r.value) return;
          if (r.key === "store_name") setStoreName(r.value);
          if (r.key === "contact_email") setContactEmail(r.value);
          if (r.key === "contact_phone") setContactPhone(r.value);
        });
      });
  }, []);

  const contact = contactEmail || contactPhone
    ? <>
        {contactEmail && <a href={`mailto:${contactEmail}`} className="text-accent hover:underline">{contactEmail}</a>}
        {contactEmail && contactPhone && " or "}
        {contactPhone && <a href={`tel:${contactPhone}`} className="text-accent hover:underline">{contactPhone}</a>}
      </>
    : <>the contact details on our homepage</>;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <section className="container mx-auto px-6 py-16 max-w-2xl flex-1">
        <h1 className="text-4xl md:text-5xl font-display">Refund &amp; Return Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: July 8, 2026</p>

        <div className="mt-10 space-y-8 text-muted-foreground leading-relaxed">
          <p>
            We want you to love what you ordered. If something isn't right, we're here to help.
            Please read this policy before initiating a return.
          </p>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">1. What's eligible for return</h2>
            <p>You may return an item if:</p>
            <ul className="mt-2 ml-4 space-y-1 list-disc list-inside">
              <li>It arrived damaged or defective</li>
              <li>It is significantly different from what was shown or described</li>
              <li>You received the wrong item</li>
            </ul>
            <p className="mt-3">
              Items must be unworn, unwashed, and in their original packaging with tags attached.
              We cannot accept returns on items that show signs of use.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">2. Time window</h2>
            <p>
              You must contact us within <strong className="text-foreground">3 days of delivery</strong> to
              report an issue and request a return. Requests received after this window may not be accepted.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">3. What's not eligible</h2>
            <ul className="mt-2 ml-4 space-y-1 list-disc list-inside">
              <li>Change of mind or incorrect size ordered</li>
              <li>Items that have been worn, washed, or altered</li>
              <li>Items without original packaging or tags</li>
              <li>Sale or discounted items (unless defective)</li>
              <li>Requests made more than 3 days after delivery</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">4. How to start a return</h2>
            <ol className="mt-2 ml-4 space-y-2 list-decimal list-inside">
              <li>Contact us at {contact} within 3 days of receiving your order.</li>
              <li>Share your order details and a photo of the issue.</li>
              <li>We'll confirm eligibility and arrange pickup or ask you to drop the item off.</li>
              <li>Once we inspect the returned item, we'll process a replacement or refund.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">5. Replacements</h2>
            <p>
              Where the same item is in stock, we'll send a replacement at no additional cost. If it's out of
              stock, we'll offer an alternative or a refund.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">6. Refunds</h2>
            <p>
              Since we operate on cash on delivery, refunds are issued via <strong className="text-foreground">bank transfer
              or mobile wallet</strong> (eSewa / Khalti) — not in cash. Please provide your account details
              when you contact us. Refunds are typically processed within <strong className="text-foreground">5–7 business
              days</strong> of us receiving and inspecting the returned item.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">7. Return shipping</h2>
            <p>
              If the return is due to our error (wrong item, defective product), we will arrange and cover
              the cost of return pickup. If the return is for any other reason, return shipping costs are
              the customer's responsibility.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">8. Contact us</h2>
            <p>Have a question about a return? Reach us at {contact}.</p>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
