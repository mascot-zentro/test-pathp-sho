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
