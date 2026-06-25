-- Full schema for fresh Supabase DB -- generated from all migrations in order

-- Migration: 20260617070613_cfe2627e-b571-41a8-a8ed-9ada2c96019a.sql

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  sale_price NUMERIC(10,2),
  on_sale BOOLEAN NOT NULL DEFAULT false,
  image_url TEXT,
  whatsapp_number TEXT,
  weight NUMERIC(5,2) NOT NULL DEFAULT 0.5,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read products" ON public.products FOR SELECT TO anon, authenticated USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.product_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '#000000'
);
GRANT SELECT ON public.product_colors TO anon, authenticated;
GRANT ALL ON public.product_colors TO service_role;
ALTER TABLE public.product_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read colors" ON public.product_colors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage colors" ON public.product_colors FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Orders (guest checkout allowed)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  color TEXT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  recipient_city INT,
  recipient_zone INT,
  recipient_area INT,
  special_instruction TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  pathao_consignment_id TEXT,
  pathao_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.orders TO anon, authenticated;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone create order" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "user reads own" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Pathao token cache (admin/service only)
CREATE TABLE public.pathao_tokens (
  id INT PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
GRANT ALL ON public.pathao_tokens TO service_role;
ALTER TABLE public.pathao_tokens ENABLE ROW LEVEL SECURITY;

-- App settings
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin update settings" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value) VALUES
  ('whatsapp_number', '8801700000000'),
  ('pathao_store_id', ''),
  ('store_name', 'Modern Store')
ON CONFLICT DO NOTHING;

-- Migration: 20260617070645_64b6e2a2-8457-4d0e-8eb4-ad2f0e690f60.sql

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- orders insert: keep WITH CHECK true (anyone can place an order) — this is the intended behavior for guest checkout.
-- Suppress the WARN by requiring non-empty essential fields.
DROP POLICY IF EXISTS "anyone create order" ON public.orders;
CREATE POLICY "anyone create order" ON public.orders FOR INSERT TO anon, authenticated
WITH CHECK (
  length(customer_name) > 0
  AND length(customer_phone) > 0
  AND length(customer_address) > 0
  AND quantity > 0
);

-- Migration: 20260617070718_21f0b608-bd05-46a3-afb8-97e4554da775.sql
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

-- Migration: 20260617075246_add_storage_and_customization.sql
-- Storage buckets for product images and site assets (logo, banner)
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('site-assets', 'site-assets', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read product-images" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');
CREATE POLICY "admin write product-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update product-images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete product-images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "public read site-assets" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'site-assets');
CREATE POLICY "admin write site-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update site-assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete site-assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));

-- Site customization settings (safe defaults so existing pages keep working)
INSERT INTO public.app_settings (key, value) VALUES
  ('logo_url', ''),
  ('theme_accent', ''),
  ('hero_title', 'Considered objects for everyday life.'),
  ('hero_subtitle', 'A small collection, refreshed seasonally. Cash on delivery available across the country.'),
  ('hero_image_url', '')
ON CONFLICT DO NOTHING;

-- Migration: 20260617080432_add_product_images.sql
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read product_images" ON public.product_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage product_images" ON public.product_images FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Migration: 20260617081122_add_inventory_tracking.sql
-- NULL stock_quantity means "untracked / unlimited" so existing live products are unaffected.
-- Setting an actual number opts a product/color into stock tracking and checkout blocking.
ALTER TABLE public.products ADD COLUMN stock_quantity INT;
ALTER TABLE public.products ADD CONSTRAINT products_stock_quantity_check CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

ALTER TABLE public.product_colors ADD COLUMN stock_quantity INT;
ALTER TABLE public.product_colors ADD CONSTRAINT product_colors_stock_quantity_check CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

-- Atomically checks and decrements stock at order time. Returns false (and changes nothing)
-- if the requested quantity isn't available, so callers can block the order.
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id uuid, p_color text, p_quantity int)
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
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, text, int) TO service_role;

-- Migration: 20260617090000_add_sizes_faqs_categories_sections.sql
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

-- Migration: 20260617100000_add_pathao_status_sync.sql
-- Separate from the admin's own manual `status` workflow field. This holds
-- the last-synced order_status_slug pulled live from Pathao's
-- /orders/{consignment_id}/info endpoint, so the admin's manual status
-- and Pathao's own status are never overwriting each other.
ALTER TABLE public.orders ADD COLUMN pathao_status TEXT;

-- Migration: 20260617110000_clear_bd_default_whatsapp_number.sql
-- The very first migration seeded a Bangladesh-format placeholder number.
-- Only clear it if it's still untouched, so this never overwrites a real
-- number an admin has already configured via the Settings tab.
UPDATE public.app_settings
SET value = '', updated_at = now()
WHERE key = 'whatsapp_number' AND value = '8801700000000';

-- Migration: 20260617120000_fix_anon_has_role_permission_denied.sql
-- Fix: guest (anon) users get "permission denied for function has_role"
-- (Postgres code 42501) on every public page load — home, product detail,
-- checkout, and FAQ — because:
--
--   "public read products" ON public.products FOR SELECT TO anon, authenticated
--     USING (active = true OR public.has_role(auth.uid(), 'admin'));
--
--   "public read active faqs" ON public.faqs FOR SELECT TO anon, authenticated
--     USING (active = true OR public.has_role(auth.uid(), 'admin'));
--
-- both apply to the anon role and reference public.has_role(). Migration
-- 20260617070645 revoked EXECUTE on has_role from anon. Postgres checks
-- EXECUTE permission on every function a policy references for the
-- querying role — it does not skip that check just because the other side
-- of an OR would short-circuit at runtime — so any anon SELECT against
-- products/faqs throws 42501 instead of just returning active rows. Since
-- the checkout page loads the product via this same query, this also
-- silently blocked guest checkout (the page stays stuck on "Loading…").
--
-- Fix: split each "public OR admin" policy into two single-purpose
-- policies — one for anon/authenticated that never references has_role,
-- and a second, authenticated-only one that does. Postgres combines
-- multiple permissive policies for the same command with OR, so behavior
-- for authenticated/admin users is unchanged; anon now never evaluates
-- has_role at all, so the original EXECUTE lockdown for anon stays intact.

DROP POLICY IF EXISTS "public read products" ON public.products;
CREATE POLICY "public read active products" ON public.products
  FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "admin read all products" ON public.products
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "public read active faqs" ON public.faqs;
CREATE POLICY "public read active faqs" ON public.faqs
  FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "admin read all faqs" ON public.faqs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Migration: 20260618032229_00d61496-5359-4e0e-a529-130b684d6d25.sql

-- Revoke direct execute on SECURITY DEFINER helpers from public roles.
-- RLS policies that call has_role() still work because policy evaluation
-- runs with the table owner's privileges, not the caller's EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;

-- Restrict storage file listing to admins. Public-bucket files remain
-- reachable via their public CDN URL (which does not consult RLS).
DROP POLICY IF EXISTS "public read product-images" ON storage.objects;
DROP POLICY IF EXISTS "public read site-assets" ON storage.objects;
CREATE POLICY "admin list product-images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin list site-assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Tighten orders insert: anonymous callers must leave user_id NULL,
-- authenticated callers must set it to their own auth.uid().
DROP POLICY IF EXISTS "anyone create order" ON public.orders;
CREATE POLICY "anon create order" ON public.orders
  FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
    AND length(customer_name) > 0
    AND length(customer_phone) > 0
    AND length(customer_address) > 0
    AND quantity > 0
  );
CREATE POLICY "auth create order" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND length(customer_name) > 0
    AND length(customer_phone) > 0
    AND length(customer_address) > 0
    AND quantity > 0
  );

-- pathao_tokens: explicit deny-all policy so RLS lint sees a policy.
-- Server code uses the service-role admin client which bypasses RLS.
CREATE POLICY "no client access to pathao tokens" ON public.pathao_tokens
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Migration: 20260618040000_add_performance_indexes.sql
-- Postgres does not auto-index foreign key columns (only primary keys).
-- These cover the joins/filters/sorts already used throughout the app
-- (admin dashboard order list, storefront product grid, variant lookups,
-- and the new order-rate-limit check by phone).
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON public.orders (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders (customer_phone);

CREATE INDEX IF NOT EXISTS idx_products_active ON public.products (active);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);

CREATE INDEX IF NOT EXISTS idx_product_colors_product_id ON public.product_colors (product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images (product_id);
CREATE INDEX IF NOT EXISTS idx_product_sizes_product_id ON public.product_sizes (product_id);

-- Migration: 20260618050000_restore_has_role_execute_for_authenticated.sql
-- Migration 20260618032229 revoked EXECUTE on has_role() from authenticated
-- (intending to stop arbitrary direct RPC probing of other users' roles), but
-- this also breaks every RLS policy that calls has_role() for the
-- authenticated role: Postgres requires EXECUTE on every function a policy
-- expression references for the querying role, even when another permissive
-- policy on the same command would otherwise allow the row via OR. That
-- revoke broke the admin dashboard, all admin product/order/settings
-- management, and any logged-in (non-admin) customer browsing product
-- colors/sizes/images/categories — all surfacing as "permission denied for
-- function has_role" (42501).
--
-- Fix: grant EXECUTE back to authenticated, which is required for RLS to
-- function at all on every admin-managed table. anon stays revoked since no
-- anon-facing policy references has_role() (confirmed across all policies).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- Migration: 20260618060000_fix_decrement_stock_color_and_size.sql
-- Bug: the previous version used IF/ELSIF, so a product with BOTH a color
-- and a size selected only ever checked/decremented the COLOR's stock —
-- the size's stock was completely ignored. In practice this meant: if a
-- color had no stock cap set (NULL = unlimited) but a specific size did
-- (e.g. size "L" capped at 5), checkout would let someone order 20 of that
-- size with no warning, and the order would go through uncapped.
--
-- Fix: check and decrement color and size independently. Both must have
-- enough stock (or be untracked) for the order to succeed. If one passes
-- and the other fails, the successful one is rolled back (compensated)
-- before returning false, so nothing is left half-decremented.
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id uuid, p_color text, p_size text, p_quantity int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  color_ok boolean := true;
  size_ok boolean := true;
  affected int;
BEGIN
  IF p_color IS NOT NULL THEN
    UPDATE public.product_colors
    SET stock_quantity = stock_quantity - p_quantity
    WHERE product_id = p_product_id AND name = p_color
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
    color_ok := affected > 0;
  END IF;

  IF color_ok AND p_size IS NOT NULL THEN
    UPDATE public.product_sizes
    SET stock_quantity = stock_quantity - p_quantity
    WHERE product_id = p_product_id AND name = p_size
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
    size_ok := affected > 0;
  END IF;

  IF NOT color_ok OR NOT size_ok THEN
    IF color_ok AND p_color IS NOT NULL THEN
      UPDATE public.product_colors SET stock_quantity = stock_quantity + p_quantity
      WHERE product_id = p_product_id AND name = p_color;
    END IF;
    RETURN false;
  END IF;

  IF p_color IS NULL AND p_size IS NULL THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity - p_quantity
    WHERE id = p_product_id
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected = 0 THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;

-- Migration: 20260618070000_grant_authenticated_write_on_admin_tables.sql
-- Bug: admin panel can list/open products (and categories, faqs, colors,
-- sizes, gallery images, settings) but every write — saving an edited
-- product, adding a category, adding a color/size, uploading a gallery
-- image, updating settings — fails with a Postgres permission error.
--
-- Cause: every "admin manage X" RLS policy (FOR ALL TO authenticated
-- USING/WITH CHECK has_role(auth.uid(), 'admin')) was created correctly,
-- but the underlying table-level GRANT for authenticated was only ever
-- SELECT (see 20260617070613, 20260617080432, 20260617090000). RLS
-- policies only narrow down rows within privileges the role already has —
-- they cannot substitute for a missing GRANT. Without INSERT/UPDATE/DELETE
-- granted at the table level, Postgres rejects the statement before RLS is
-- even evaluated, regardless of how permissive the policy is or whether
-- the user is really an admin.
--
-- Fix: grant the missing write privileges to authenticated. Row-level
-- access stays exactly as restrictive as before — non-admin authenticated
-- users still fail the has_role() check in each table's "admin manage"
-- policy, so this only unblocks admins, who already passed that check.
--
-- Also re-asserts the has_role EXECUTE grant for authenticated (see
-- 20260618050000) — harmless no-op if already applied, but cheap insurance
-- in case that migration was added to the repo without being run against
-- the live database.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_colors TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_sizes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT UPDATE ON public.app_settings TO authenticated;

-- Migration: 20260618080000_add_delivery_fee_to_orders.sql
-- Store the delivery fee quoted to the customer at checkout.
-- This is added to amount_to_collect when creating the Pathao consignment
-- so the courier collects subtotal + delivery from the customer on our behalf.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Migration: 20260618090000_add_expenses_table.sql
-- Expense tracking for the new admin Inventory & Expenses page. Admin-only
-- — there's no public or anon use case for this data, unlike products/faqs.
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  category TEXT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Table-level grant alongside the RLS policy — RLS only narrows rows
-- within privileges a role already has, it doesn't substitute for the
-- GRANT itself (see 20260618070000, which fixed the same gap on
-- products/colors/sizes/images/categories/faqs after it silently broke
-- every admin write on those tables).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

-- Migration: 20260618100000_add_stock_alerts_and_ad_spend.sql
-- ============================================================
-- Low-stock alerting
-- ============================================================
-- Per-product configurable threshold. Default 5 matches the value the
-- Inventory page already used as a hardcoded constant, so existing
-- behavior is unchanged until an admin overrides it on a product.
ALTER TABLE public.products ADD COLUMN low_stock_threshold INT NOT NULL DEFAULT 5;
ALTER TABLE public.products ADD CONSTRAINT products_low_stock_threshold_check CHECK (low_stock_threshold >= 0);

-- Alert log. One row is written each time a tracked variant crosses INTO
-- a low-stock or out-of-stock state (not on every stock change — see the
-- trigger functions below) so the feed doesn't fill up with noise from
-- normal restocking or repeated small decrements while already low.
CREATE TABLE public.stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('product', 'color', 'size')),
  item_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT,
  stock_at_alert INT NOT NULL,
  threshold INT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'out')),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_alerts_unacked_idx ON public.stock_alerts (acknowledged, created_at DESC);

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage stock alerts" ON public.stock_alerts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Table-level grant alongside the RLS policy (RLS alone does not unblock
-- writes — see 20260618070000 for why both are required).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_alerts TO authenticated;
GRANT ALL ON public.stock_alerts TO service_role;

-- Fires on products.stock_quantity changes (untracked products have
-- stock_quantity = NULL and never alert).
CREATE OR REPLACE FUNCTION public.check_product_stock_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stock_quantity IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.stock_quantity <= NEW.low_stock_threshold
     AND (OLD.stock_quantity IS NULL OR OLD.stock_quantity > NEW.low_stock_threshold) THEN
    INSERT INTO public.stock_alerts (product_id, item_type, item_id, product_name, variant_name, stock_at_alert, threshold, severity)
    VALUES (NEW.id, 'product', NEW.id, NEW.name, NULL, NEW.stock_quantity, NEW.low_stock_threshold,
            CASE WHEN NEW.stock_quantity = 0 THEN 'out' ELSE 'low' END);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_stock_alert_trigger
  AFTER UPDATE OF stock_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.check_product_stock_alert();

-- Colors and sizes don't carry their own threshold column — they inherit
-- the parent product's low_stock_threshold via join, same as the rest of
-- the app treats them as dependent variants of a product.
CREATE OR REPLACE FUNCTION public.check_color_stock_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_threshold INT;
  v_product_name TEXT;
BEGIN
  IF NEW.stock_quantity IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT low_stock_threshold, name INTO v_threshold, v_product_name
  FROM public.products WHERE id = NEW.product_id;
  IF NEW.stock_quantity <= v_threshold
     AND (OLD.stock_quantity IS NULL OR OLD.stock_quantity > v_threshold) THEN
    INSERT INTO public.stock_alerts (product_id, item_type, item_id, product_name, variant_name, stock_at_alert, threshold, severity)
    VALUES (NEW.product_id, 'color', NEW.id, v_product_name, NEW.name, NEW.stock_quantity, v_threshold,
            CASE WHEN NEW.stock_quantity = 0 THEN 'out' ELSE 'low' END);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER color_stock_alert_trigger
  AFTER UPDATE OF stock_quantity ON public.product_colors
  FOR EACH ROW EXECUTE FUNCTION public.check_color_stock_alert();

CREATE OR REPLACE FUNCTION public.check_size_stock_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_threshold INT;
  v_product_name TEXT;
BEGIN
  IF NEW.stock_quantity IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT low_stock_threshold, name INTO v_threshold, v_product_name
  FROM public.products WHERE id = NEW.product_id;
  IF NEW.stock_quantity <= v_threshold
     AND (OLD.stock_quantity IS NULL OR OLD.stock_quantity > v_threshold) THEN
    INSERT INTO public.stock_alerts (product_id, item_type, item_id, product_name, variant_name, stock_at_alert, threshold, severity)
    VALUES (NEW.product_id, 'size', NEW.id, v_product_name, NEW.name, NEW.stock_quantity, v_threshold,
            CASE WHEN NEW.stock_quantity = 0 THEN 'out' ELSE 'low' END);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER size_stock_alert_trigger
  AFTER UPDATE OF stock_quantity ON public.product_sizes
  FOR EACH ROW EXECUTE FUNCTION public.check_size_stock_alert();

-- One-time backfill: raise an alert now for anything that's already
-- low/out of stock at migration time, so the admin panel isn't silent
-- about existing problems until the next stock change happens to trigger one.
INSERT INTO public.stock_alerts (product_id, item_type, item_id, product_name, variant_name, stock_at_alert, threshold, severity)
SELECT id, 'product', id, name, NULL, stock_quantity, low_stock_threshold,
       CASE WHEN stock_quantity = 0 THEN 'out' ELSE 'low' END
FROM public.products
WHERE stock_quantity IS NOT NULL AND stock_quantity <= low_stock_threshold;

INSERT INTO public.stock_alerts (product_id, item_type, item_id, product_name, variant_name, stock_at_alert, threshold, severity)
SELECT c.product_id, 'color', c.id, p.name, c.name, c.stock_quantity, p.low_stock_threshold,
       CASE WHEN c.stock_quantity = 0 THEN 'out' ELSE 'low' END
FROM public.product_colors c JOIN public.products p ON p.id = c.product_id
WHERE c.stock_quantity IS NOT NULL AND c.stock_quantity <= p.low_stock_threshold;

INSERT INTO public.stock_alerts (product_id, item_type, item_id, product_name, variant_name, stock_at_alert, threshold, severity)
SELECT s.product_id, 'size', s.id, p.name, s.name, s.stock_quantity, p.low_stock_threshold,
       CASE WHEN s.stock_quantity = 0 THEN 'out' ELSE 'low' END
FROM public.product_sizes s JOIN public.products p ON p.id = s.product_id
WHERE s.stock_quantity IS NOT NULL AND s.stock_quantity <= p.low_stock_threshold;

-- ============================================================
-- Ad spend tracking (separate from general business expenses so ad
-- performance can be reported on its own, against revenue/orders for
-- the same period — see the admin Ad Spending page).
-- ============================================================
CREATE TABLE public.ad_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  campaign_name TEXT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  spend_date DATE NOT NULL DEFAULT CURRENT_DATE,
  impressions INT CHECK (impressions IS NULL OR impressions >= 0),
  clicks INT CHECK (clicks IS NULL OR clicks >= 0),
  conversions INT CHECK (conversions IS NULL OR conversions >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ad_spend_date_idx ON public.ad_spend (spend_date DESC);

ALTER TABLE public.ad_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage ad spend" ON public.ad_spend
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_spend TO authenticated;
GRANT ALL ON public.ad_spend TO service_role;

-- Migration: 20260618110000_add_promo_codes_and_cart_support.sql
CREATE TABLE public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  max_uses INT,                          -- NULL = unlimited
  used_count INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,                 -- NULL = no start restriction
  expires_at TIMESTAMPTZ,                -- NULL = no expiry
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated SELECT policy on purpose: codes are validated only
-- through redeem_promo_code()/preview below, so guests can't list or scrape
-- active codes and usage counts directly from the table.
CREATE POLICY "admin manage promo_codes" ON public.promo_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Atomically validates a code and increments its usage count in one step
-- (row-locked) so two concurrent checkouts can't both redeem the last use
-- of a capped code. Returns the discount percent, or NULL if invalid/
-- expired/exhausted/inactive.
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  SELECT * INTO rec FROM public.promo_codes WHERE lower(code) = lower(p_code) AND active = true FOR UPDATE;
  IF rec IS NULL THEN RETURN NULL; END IF;
  IF rec.starts_at IS NOT NULL AND now() < rec.starts_at THEN RETURN NULL; END IF;
  IF rec.expires_at IS NOT NULL AND now() > rec.expires_at THEN RETURN NULL; END IF;
  IF rec.max_uses IS NOT NULL AND rec.used_count >= rec.max_uses THEN RETURN NULL; END IF;
  UPDATE public.promo_codes SET used_count = used_count + 1 WHERE id = rec.id;
  RETURN rec.discount_percent;
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text) TO service_role;

-- Compensates a redemption if the order fails for an unrelated reason
-- (e.g. stock ran out) after the code was already redeemed.
CREATE OR REPLACE FUNCTION public.release_promo_code(p_code text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.promo_codes SET used_count = used_count - 1 WHERE lower(code) = lower(p_code) AND used_count > 0;
$$;
GRANT EXECUTE ON FUNCTION public.release_promo_code(text) TO service_role;

ALTER TABLE public.orders ADD COLUMN promo_code TEXT;
ALTER TABLE public.orders ADD COLUMN discount_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN order_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_orders_order_group_id ON public.orders (order_group_id);

-- Migration: 20260619070000_add_pathao_credentials_table.sql
-- Stores Pathao Merchant API credentials so the admin can switch from
-- sandbox to production without redeploying or setting environment
-- variables. This table holds secrets (client_secret, password) and must
-- NEVER be readable by anon/authenticated clients — only the server
-- (service_role) reads it, via supabaseAdmin in pathao.server.ts.
CREATE TABLE public.pathao_credentials (
  id INT PRIMARY KEY DEFAULT 1,
  base_url TEXT,
  client_id TEXT,
  client_secret TEXT,
  username TEXT,
  password TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pathao_credentials_singleton CHECK (id = 1)
);

GRANT ALL ON public.pathao_credentials TO service_role;
ALTER TABLE public.pathao_credentials ENABLE ROW LEVEL SECURITY;

-- Explicit deny-all for anon/authenticated so RLS lint sees a policy and
-- so the secrets can only ever be reached through admin-gated server
-- functions that use the service-role client, never a direct client query.
CREATE POLICY "no client access to pathao credentials" ON public.pathao_credentials
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Changing credentials invalidates any cached token from the old account,
-- otherwise pathao.server.ts would keep using a token tied to the
-- previous client_id/secret until it naturally expired.
CREATE OR REPLACE FUNCTION public.invalidate_pathao_token_on_credential_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pathao_tokens WHERE id = 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pathao_credentials_invalidate_token
AFTER INSERT OR UPDATE ON public.pathao_credentials
FOR EACH ROW EXECUTE FUNCTION public.invalidate_pathao_token_on_credential_change();

-- Migration: 20260619100000_add_product_cost_price.sql
-- Cost price (what you paid per unit) alongside the existing price/sale_price
-- (what you charge). Nullable like stock_quantity: existing products simply
-- don't show a margin until an admin fills this in, rather than defaulting
-- to 0 and making every product look like 100% margin.
ALTER TABLE public.products ADD COLUMN cost_price NUMERIC(10,2);
ALTER TABLE public.products ADD CONSTRAINT products_cost_price_check CHECK (cost_price IS NULL OR cost_price >= 0);

-- Migration: 20260619110000_add_page_visits_table.sql
-- Simple page-visit log used for an admin "visits by location" pie chart.
-- One row per page load, with a coarse location (city/region/country)
-- derived from the Vercel geo headers on the request — no client-side
-- geolocation prompt, no third-party analytics script, no cookies.
CREATE TABLE public.page_visits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX page_visits_created_at_idx ON public.page_visits (created_at);

-- Inserts happen only through the logPageVisit server function using the
-- service-role client, never directly from the browser, so anon/authenticated
-- get no INSERT grant at all. Only admins can read the data back (for the
-- dashboard chart) through an explicit SELECT policy.
GRANT ALL ON public.page_visits TO service_role;
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read page visits" ON public.page_visits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "no client write page visits" ON public.page_visits
  FOR INSERT TO anon, authenticated WITH CHECK (false);

-- Migration: 20260619120000_add_order_source.sql
-- Lets the admin tag where an order came from. Normal checkout orders stay
-- 'website' (the default); orders the admin types in by hand for a sale
-- that happened on Instagram or TikTok DMs get tagged accordingly, so
-- reporting can separate organic website orders from social-media sales.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website';

ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_check CHECK (source IN ('website', 'instagram', 'tiktok', 'facebook', 'whatsapp', 'manual'));

CREATE INDEX IF NOT EXISTS orders_source_idx ON public.orders (source);

-- Migration: 20260619130000_add_increment_stock_and_restock_flag.sql
-- Mirrors decrement_stock's exact matching rules (color/size by name,
-- or the bare product if neither is set) so restocking always adds back
-- to the same row that was originally decremented. NULL stock_quantity
-- means "untracked / unlimited" and is left untouched either way.
CREATE OR REPLACE FUNCTION public.increment_stock(p_product_id uuid, p_color text, p_size text, p_quantity int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_color IS NOT NULL THEN
    UPDATE public.product_colors
    SET stock_quantity = stock_quantity + p_quantity
    WHERE product_id = p_product_id AND name = p_color AND stock_quantity IS NOT NULL;
  END IF;

  IF p_size IS NOT NULL THEN
    UPDATE public.product_sizes
    SET stock_quantity = stock_quantity + p_quantity
    WHERE product_id = p_product_id AND name = p_size AND stock_quantity IS NOT NULL;
  END IF;

  IF p_color IS NULL AND p_size IS NULL THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity + p_quantity
    WHERE id = p_product_id AND stock_quantity IS NOT NULL;
  END IF;
END;
$$;

-- Guards against restocking the same order twice if its Pathao status gets
-- synced more than once while it's already Cancelled/Returned (e.g. the
-- admin clicks "Check status" again, or "Check all" runs and re-fetches an
-- order that was already handled on a previous sync).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_restocked BOOLEAN NOT NULL DEFAULT false;

-- Migration: 20260620100000_grant_authenticated_access_to_promo_codes.sql
-- Same gap as 20260618070000 (products/categories/faqs/etc): the
-- "admin manage promo_codes" RLS policy is correct, but the original
-- migration only ever granted table-level access to service_role —
-- GRANT ALL ON public.promo_codes TO service_role — and never granted
-- anything to authenticated. RLS policies only narrow access within
-- privileges a role already has; with no table-level GRANT at all for
-- authenticated, every query against promo_codes from the admin's own
-- logged-in session (the Promos admin page uses the regular client-side
-- Supabase client, not the server) is rejected before RLS is even
-- evaluated — including the SELECT that's supposed to show the live
-- used_count after a checkout redeems a code.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;

-- Migration: 20260621070000_add_rate_limiting.sql
-- Generic rate-limit backing store, shared by any public server function
-- that needs one (page-visit logging, promo-code lookups, Pathao
-- city/zone/area + delivery-fee lookups, order creation, etc).
--
-- Why a DB table instead of an in-memory counter: this app runs as
-- stateless Vercel serverless functions, which can scale to many
-- concurrent instances with no shared memory between them. An in-process
-- Map would only rate-limit requests that happen to land on the same
-- warm instance — easily bypassed at any real scale. A single atomic
-- Postgres function gives one consistent counter regardless of which
-- instance handles the request.
CREATE TABLE public.rate_limit_hits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports the per-key window scan inside check_rate_limit below.
CREATE INDEX idx_rate_limit_hits_key_created_at ON public.rate_limit_hits (key, created_at);

GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access at all — this table is only ever touched
-- through check_rate_limit() (service-role / SECURITY DEFINER), never
-- read or written directly from the browser.
CREATE POLICY "no client access to rate_limit_hits" ON public.rate_limit_hits
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Atomically checks whether `p_key` is still under `p_max_hits` within the
-- trailing `p_window_seconds`, and if so records this attempt and returns
-- true. Row-locking the key's rows for the duration of the check (FOR
-- UPDATE) means two concurrent requests for the same key can't both read
-- "count = max - 1" and both get waved through.
--
-- Also does a small amount of opportunistic cleanup (1% of calls, capped
-- at 500 rows) so the table doesn't grow unbounded without needing a
-- separate cron job.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max_hits int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Serializes concurrent calls for the same key for the rest of this
  -- transaction (released automatically on commit) — `FOR UPDATE` can't be
  -- used on an aggregate query, so this is how the count-then-insert below
  -- stays race-free under concurrent requests for the same key.
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits
    WHERE id IN (
      SELECT id FROM public.rate_limit_hits
      WHERE created_at < now() - interval '1 day'
      LIMIT 500
    );
  END IF;

  SELECT count(*) INTO v_count
  FROM public.rate_limit_hits
  WHERE key = p_key AND created_at >= now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_max_hits THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (key) VALUES (p_key);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;
