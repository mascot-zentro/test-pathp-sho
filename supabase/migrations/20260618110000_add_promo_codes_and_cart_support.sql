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
