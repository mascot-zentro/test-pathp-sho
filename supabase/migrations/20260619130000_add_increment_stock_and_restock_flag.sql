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
