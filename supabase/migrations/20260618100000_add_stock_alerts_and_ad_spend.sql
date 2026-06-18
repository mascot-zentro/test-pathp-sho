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
