
CREATE POLICY "driver photos read by tenant" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'driver-photos' AND (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_school(auth.uid(), (split_part(name, '/', 1))::uuid)
  )
);

CREATE POLICY "driver photos write by school admin" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'driver-photos' AND (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), (split_part(name, '/', 1))::uuid)
  )
);

CREATE POLICY "driver photos update by school admin" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'driver-photos' AND (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), (split_part(name, '/', 1))::uuid)
  )
);

CREATE POLICY "driver photos delete by school admin" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'driver-photos' AND (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), (split_part(name, '/', 1))::uuid)
  )
);
