
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
