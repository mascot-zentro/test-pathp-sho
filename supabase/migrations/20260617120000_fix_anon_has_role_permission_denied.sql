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
