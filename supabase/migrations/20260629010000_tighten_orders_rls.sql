-- Tighten orders table access:
--
-- 1. Explicitly revoke SELECT from anon. The original schema only granted
--    SELECT to "authenticated", but making the denial explicit prevents any
--    future GRANT from accidentally leaking orders to unauthenticated clients.
--
-- 2. Revoke UPDATE from authenticated. Direct row updates should only go
--    through server functions (which use the service role). The existing
--    "admin update" RLS policy on the authenticated role is belt-and-suspenders,
--    but the GRANT should not exist at all.
--
-- 3. Drop the now-unused anon-read policy that was added to support the
--    order-confirmed page — that page was refactored to use a server function
--    (supabaseAdmin) so no client-side order read is needed.

REVOKE SELECT ON public.orders FROM anon;
REVOKE UPDATE ON public.orders FROM authenticated;

-- Clean up any stale anon read policy if it exists
DROP POLICY IF EXISTS "anon read recent own order by id" ON public.orders;
DROP VIEW IF EXISTS public.order_confirmation;
