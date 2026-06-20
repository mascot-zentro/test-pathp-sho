import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions" },
      { name: "description", content: "Terms and conditions for shopping with us, including orders, delivery, payment, and returns." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const [storeName, setStoreName] = useState("Modern Store");
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

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <section className="container mx-auto px-6 py-16 max-w-2xl flex-1">
        <h1 className="text-4xl md:text-5xl font-display">Terms &amp; Conditions</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: June 19, 2026</p>

        <div className="mt-10 space-y-8 text-muted-foreground leading-relaxed">
          <p>
            These terms apply whenever you browse {storeName} or place an order with us. By placing an order,
            you agree to the terms below. Please read them before checking out.
          </p>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">1. Orders</h2>
            <p>
              Placing an order is an offer to buy a product at the price shown at checkout. We confirm an order
              by handing it to our delivery partner — until then, we may cancel or adjust an order if an item is
              out of stock, mispriced, or otherwise unavailable. If we cancel an order, we will let you know.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">2. Pricing</h2>
            <p>
              Prices are listed in Nepalese Rupees (NRS) and include applicable taxes unless stated otherwise.
              The delivery fee is calculated separately based on your delivery location and is added to your
              order total before you confirm your order. We may change prices at any time, but the price you
              were shown at checkout is the price you pay.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">3. Payment</h2>
            <p>
              We currently accept cash on delivery (COD). You pay the full order total — product price plus
              delivery fee — to the delivery rider when your order arrives.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">4. Delivery</h2>
            <p>
              Orders are delivered through our courier partner. Delivery timelines are estimates and may vary
              based on your location and courier capacity. Please make sure your address, phone number, and
              delivery location are accurate — we are not responsible for delays or failed deliveries caused by
              incorrect or incomplete delivery details.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">5. Returns &amp; refunds</h2>
            <p>
              If an item arrives damaged, defective, or different from what you ordered, contact us within 3
              days of delivery and we will arrange a replacement or refund. Items must be unused and in their
              original packaging to be eligible for return. Refunds for cash-on-delivery orders are issued via
              bank transfer or mobile wallet, not in cash.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">6. Product availability</h2>
            <p>
              We try to keep stock information accurate, but availability can change quickly. If an item you
              ordered goes out of stock before we dispatch it, we will contact you to offer a substitute,
              a refund, or to cancel that item from your order.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">7. Account &amp; conduct</h2>
            <p>
              If you create an account with us, you're responsible for keeping your login details secure and
              for activity that happens under your account. Please don't use the store for fraudulent orders,
              fake reviews, or attempts to disrupt the site.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">8. Changes to these terms</h2>
            <p>
              We may update these terms from time to time as our policies or services change. The version
              posted on this page is the one currently in effect.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">9. Contact us</h2>
            <p>
              Questions about an order or these terms? Reach us
              {contactEmail && <> at <a href={`mailto:${contactEmail}`} className="text-accent hover:underline">{contactEmail}</a></>}
              {contactEmail && contactPhone && " or "}
              {contactPhone && <a href={`tel:${contactPhone}`} className="text-accent hover:underline">{contactPhone}</a>}
              {!contactEmail && !contactPhone && " through the contact details on our homepage"}.
            </p>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
