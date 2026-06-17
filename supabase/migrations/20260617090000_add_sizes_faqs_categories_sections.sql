-- ============================================================
-- Sizes: mirrors product_colors (independent stock attribute,
-- not a combined color+size matrix — see decrement_stock below).
-- ============================================================
CREATE TABLE public.product_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  stock_quantity INT,
  CONSTRAINT product_sizes_stock_quantity_check CHECK (stock_quantity IS NULL OR stock_quantity >= 0)
);
GRANT SELECT ON public.product_sizes TO anon, authenticated;
GRANT ALL ON public.product_sizes TO service_role;
ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read sizes" ON public.product_sizes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage sizes" ON public.product_sizes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.orders ADD COLUMN size TEXT;

-- Replace decrement_stock to also support a size lookup. Priority when a
-- product has both colors and sizes defined: color stock wins (unchanged
-- behavior), then size stock, then product-level stock. This does not track
-- combined color+size inventory (e.g. "Red, size M" as one count) — each
-- attribute's stock is tracked independently.
DROP FUNCTION IF EXISTS public.decrement_stock(uuid, text, int);

CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id uuid, p_color text, p_size text, p_quantity int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  IF p_color IS NOT NULL THEN
    UPDATE public.product_colors
    SET stock_quantity = stock_quantity - p_quantity
    WHERE product_id = p_product_id AND name = p_color
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSIF p_size IS NOT NULL THEN
    UPDATE public.product_sizes
    SET stock_quantity = stock_quantity - p_quantity
    WHERE product_id = p_product_id AND name = p_size
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSE
    UPDATE public.products
    SET stock_quantity = stock_quantity - p_quantity
    WHERE id = p_product_id
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
  END IF;
  RETURN affected > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, text, text, int) TO service_role;

-- ============================================================
-- Categories: simple text tag on products + admin-editable list
-- of suggested categories for fast tagging from the admin panel.
-- ============================================================
ALTER TABLE public.products ADD COLUMN category TEXT;

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read categories" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.categories (name, position) VALUES
  ('Men', 0), ('Women', 1), ('Kids', 2), ('Accessories', 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FAQs: fully admin-managed, ordered list.
-- ============================================================
CREATE TABLE public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faqs TO anon, authenticated;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active faqs" ON public.faqs FOR SELECT TO anon, authenticated USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manage faqs" ON public.faqs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.faqs (question, answer, position) VALUES
  ('How long does delivery take?', 'Most orders arrive within 2-5 business days depending on your location.', 0),
  ('Can I pay on delivery?', 'Yes — all orders are cash on delivery. You only pay when the courier hands over your package.', 1),
  ('What is your return policy?', 'Contact us within 3 days of delivery if there''s an issue with your order, and we''ll arrange an exchange or return.', 2)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Extended site-content settings, following the existing
-- app_settings key/value pattern used for hero/logo/theme.
-- Every key below is editable from the admin Settings tab and
-- safe-defaulted so existing pages keep working unchanged.
-- ============================================================
INSERT INTO public.app_settings (key, value) VALUES
  ('announcement_text', ''),
  ('announcement_link', ''),
  ('about_title', 'Our story'),
  ('about_body', 'We started with a simple idea: well-made basics shouldn''t be hard to find or expensive to own. Every piece is chosen for fit, fabric, and how it holds up wash after wash.'),
  ('about_image_url', ''),
  ('faq_heading', 'Frequently asked questions'),
  ('footer_text', ''),
  ('contact_email', ''),
  ('contact_phone', ''),
  ('social_instagram', ''),
  ('social_facebook', ''),
  ('social_tiktok', '')
ON CONFLICT DO NOTHING;
