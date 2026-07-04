
-- 1. Notifications: restrict reads to own notifications; super admins retain visibility
DROP POLICY IF EXISTS "Notifications recipient read" ON public.notifications;
CREATE POLICY "Notifications recipient read"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- 2. Trips: scope policies to authenticated role instead of public
DROP POLICY IF EXISTS "Trips tenant read" ON public.trips;
DROP POLICY IF EXISTS "Trips driver/admin write" ON public.trips;

CREATE POLICY "Trips tenant read"
  ON public.trips
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.user_id = auth.uid()
        AND (
          d.id = trips.driver_id
          OR (trips.driver_id IS NULL AND EXISTS (
            SELECT 1 FROM public.routes r
            WHERE r.id = trips.route_id AND r.driver_id = d.id
          ))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE s.route_id = trips.route_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Trips driver/admin write"
  ON public.trips
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.user_id = auth.uid()
        AND (
          d.id = trips.driver_id
          OR (trips.driver_id IS NULL AND EXISTS (
            SELECT 1 FROM public.routes r
            WHERE r.id = trips.route_id AND r.driver_id = d.id
          ))
        )
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.user_id = auth.uid()
        AND (
          d.id = trips.driver_id
          OR (trips.driver_id IS NULL AND EXISTS (
            SELECT 1 FROM public.routes r
            WHERE r.id = trips.route_id AND r.driver_id = d.id
          ))
        )
    )
  );

-- 3. SECURITY DEFINER hardening: revoke EXECUTE from authenticated on user-facing helpers
-- that don't need to be callable directly by end-users. RLS-critical helpers
-- (has_role, is_super_admin, is_school_admin_of, user_belongs_to_school) remain
-- executable because policies invoke them as the calling user.
REVOKE EXECUTE ON FUNCTION public.school_plan_limits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.school_plan_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_plan_limits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.school_plan_usage(uuid) TO service_role;
