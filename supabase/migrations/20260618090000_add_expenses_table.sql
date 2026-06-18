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
