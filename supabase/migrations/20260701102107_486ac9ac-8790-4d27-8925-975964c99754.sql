
CREATE POLICY "vehicle-photos read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vehicle-photos' AND (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_school(auth.uid(), (storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "vehicle-photos write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-photos' AND (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), (storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "vehicle-photos update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'vehicle-photos' AND (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), (storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "vehicle-photos delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vehicle-photos' AND (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), (storage.foldername(name))[1]::uuid)
  )
);
