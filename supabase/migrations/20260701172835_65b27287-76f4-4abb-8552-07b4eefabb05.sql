
-- 1) Fix mutable search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2) Lock down SECURITY DEFINER trigger-only functions (not callable via API)
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.bootstrap_first_super_admin()',
    'public.students_check_plan_limit()',
    'public.students_check_route_capacity()',
    'public.students_check_vehicle_capacity()',
    'public.vehicles_check_plan_limit()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- 3) Restrict SECURITY DEFINER helper functions to authenticated only (remove anon/PUBLIC)
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_school_admin_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_admin_of(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_belongs_to_school(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_school(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.school_plan_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_plan_limits(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.school_plan_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_plan_usage(uuid) TO authenticated;

-- 4) Tighten school-logos storage: restrict SELECT to users of the owning school
DROP POLICY IF EXISTS "School logos readable by authenticated" ON storage.objects;
CREATE POLICY "School logos readable by school members" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'school-logos'
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_belongs_to_school(auth.uid(), (split_part(name, '/', 1))::uuid)
  )
);

-- 5) Restrict subscription_plans reads to super admins only.
-- School admins receive plan info via school_plan_limits()/school_plan_usage() SECURITY DEFINER helpers.
DROP POLICY IF EXISTS "Plans readable by authenticated" ON public.subscription_plans;
CREATE POLICY "Plans readable by super admin" ON public.subscription_plans
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 6) Defensive guard against user_roles self-elevation:
-- add a RESTRICTIVE policy so INSERT/UPDATE/DELETE always require super_admin,
-- even if a future permissive policy is added.
CREATE POLICY "user_roles writes require super admin" ON public.user_roles
AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
