
DROP POLICY IF EXISTS "user_roles writes require super admin" ON public.user_roles;

CREATE POLICY "user_roles insert requires super admin" ON public.user_roles
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles update requires super admin" ON public.user_roles
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles delete requires super admin" ON public.user_roles
AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));
