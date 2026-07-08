import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/shipping-policy")({
  head: () => ({
    meta: [
      { title: "Shipping Policy — The Aavira" },
      { name: "description", content: "Delivery areas, estimated timelines, costs, and what happens if something goes wrong with your shipment." },
    ],
  }),
  component: ShippingPolicyPage,
});

function ShippingPolicyPage() {
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
        <h1 className="text-4xl md:text-5xl font-display">Shipping Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: July 8, 2026</p>

        <div className="mt-10 space-y-8 text-muted-foreground leading-relaxed">
          <p>
            We deliver across Nepal through our courier partner. Here's everything you need to know
            before and after placing an order.
          </p>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">1. Delivery areas</h2>
            <p>
              We currently deliver to addresses across Nepal served by our courier partner (Pathao).
              Coverage is primarily in Kathmandu Valley and major cities. If your area is not covered,
              you will be notified at checkout or after placing an order, and your order will be cancelled
              with no charge.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">2. Processing time</h2>
            <p>
              Orders are typically processed within <strong className="text-foreground">1–2 business days</strong> of
              being placed. Orders placed on weekends or public holidays are processed on the next business
              day. You will receive a confirmation once your order is handed to the courier.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">3. Delivery time</h2>
            <p>Once dispatched, estimated delivery times are:</p>
            <ul className="mt-2 ml-4 space-y-1 list-disc list-inside">
              <li><strong className="text-foreground">Kathmandu Valley:</strong> 1–3 business days</li>
              <li><strong className="text-foreground">Outside valley (major cities):</strong> 3–7 business days</li>
            </ul>
            <p className="mt-3">
              These are estimates. Actual delivery may vary based on courier load, weather, road conditions,
              or public holidays. We are not able to guarantee a specific delivery date.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">4. Delivery charges</h2>
            <p>
              Delivery fees are calculated based on your location and shown at checkout before you confirm
              your order. The fee is charged in addition to the product price and is collected at the time
              of delivery along with your order total (cash on delivery).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">5. Payment on delivery</h2>
            <p>
              We operate on a <strong className="text-foreground">cash on delivery (COD)</strong> basis. You pay the
              full order total — product price plus delivery fee — directly to the delivery rider when your
              package arrives. Please have the exact amount ready.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">6. Tracking your order</h2>
            <p>
              Once your order is dispatched, you can track it on our <a href="/track" className="text-accent hover:underline">order tracking page</a> using
              your phone number or order ID. You may also receive updates directly from our courier partner.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">7. Failed deliveries</h2>
            <p>
              If a delivery attempt fails because you were unavailable or could not be reached, the courier
              may attempt re-delivery or return the package to us. Please ensure your phone number and address
              are correct when placing your order. Re-delivery may incur an additional charge.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">8. Delays</h2>
            <p>
              If your order is significantly delayed beyond the estimated window, please contact us at {contact}.
              We will follow up with the courier on your behalf. Delays caused by events outside our control
              (weather, strikes, road closures) are not grounds for refund of the delivery fee.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">9. Damaged in transit</h2>
            <p>
              If your order arrives damaged due to courier handling, please photograph the packaging and item
              before accepting it (if visible at handover) and contact us at {contact} within 3 days.
              We will assess the situation and arrange a replacement or refund as appropriate.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">10. Contact us</h2>
            <p>Questions about your delivery? Reach us at {contact}.</p>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
