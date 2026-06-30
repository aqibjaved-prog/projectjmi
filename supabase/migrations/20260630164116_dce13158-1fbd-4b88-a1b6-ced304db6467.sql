
DROP POLICY IF EXISTS "School logos readable by authenticated" ON storage.objects;
CREATE POLICY "School logos readable by authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'school-logos');

DROP POLICY IF EXISTS "Super admins manage school logos" ON storage.objects;
CREATE POLICY "Super admins manage school logos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'school-logos' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'school-logos' AND public.is_super_admin(auth.uid()));
