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
