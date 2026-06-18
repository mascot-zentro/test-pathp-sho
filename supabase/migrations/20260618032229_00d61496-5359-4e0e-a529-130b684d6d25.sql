
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
