import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — The Aavira" },
      { name: "description", content: "How The Aavira collects, uses, and protects your personal information." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const [storeName, setStoreName] = useState("The Aavira");
  const [contactEmail, setContactEmail] = useState("");

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key,value")
      .in("key", ["store_name", "contact_email"])
      .then(({ data }) => {
        (data ?? []).forEach((r) => {
          if (!r.value) return;
          if (r.key === "store_name") setStoreName(r.value);
          if (r.key === "contact_email") setContactEmail(r.value);
        });
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <section className="container mx-auto px-6 py-16 max-w-2xl flex-1">
        <h1 className="text-4xl md:text-5xl font-display">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: July 8, 2026</p>

        <div className="mt-10 space-y-8 text-muted-foreground leading-relaxed">
          <p>
            {storeName} takes your privacy seriously. This policy explains what information we collect when
            you use our website, how we use it, and your rights around it. By using our site or placing an
            order, you agree to this policy.
          </p>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">1. Information we collect</h2>
            <p>When you place an order or create an account, we collect:</p>
            <ul className="mt-2 ml-4 space-y-1 list-disc list-inside">
              <li>Your name, phone number, and delivery address</li>
              <li>Order history and payment method (cash on delivery)</li>
              <li>Any messages you send us</li>
            </ul>
            <p className="mt-3">
              When you visit the site, we may also automatically receive your IP address, browser type,
              and pages visited through standard web server logs and analytics tools.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">2. How we use your information</h2>
            <p>We use your information to:</p>
            <ul className="mt-2 ml-4 space-y-1 list-disc list-inside">
              <li>Process and deliver your orders</li>
              <li>Contact you about your order status or issues</li>
              <li>Improve our products and website</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p className="mt-3">
              We do not sell, rent, or trade your personal information to third parties for marketing purposes.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">3. Sharing your information</h2>
            <p>
              We share your name, phone number, and delivery address with our courier partner (Pathao)
              solely to fulfil your delivery. We may also share information with service providers who help
              us run our website (such as hosting and analytics), under strict confidentiality agreements.
              We will disclose information if required by law.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">4. Cookies &amp; analytics</h2>
            <p>
              Our website may use cookies or similar technologies to remember your preferences and understand
              how visitors use the site. You can disable cookies in your browser settings, though some parts
              of the site may not work as expected.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">5. Data retention</h2>
            <p>
              We keep your order information as long as necessary to fulfil orders, handle returns, and meet
              legal requirements. Account data is kept until you request deletion.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">6. Your rights</h2>
            <p>You have the right to:</p>
            <ul className="mt-2 ml-4 space-y-1 list-disc list-inside">
              <li>Access the personal information we hold about you</li>
              <li>Ask us to correct inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
              <li>Opt out of any marketing communications</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at the address below.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">7. Security</h2>
            <p>
              We take reasonable steps to protect your personal information from unauthorised access,
              disclosure, or misuse. However, no transmission over the internet is completely secure.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">8. Changes to this policy</h2>
            <p>
              We may update this policy as our practices change. The version posted on this page is
              always the current one.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-medium text-foreground mb-2">9. Contact us</h2>
            <p>
              For any privacy questions or requests, reach us
              {contactEmail
                ? <> at <a href={`mailto:${contactEmail}`} className="text-accent hover:underline">{contactEmail}</a></>
                : " through the contact details on our homepage"
              }.
            </p>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
