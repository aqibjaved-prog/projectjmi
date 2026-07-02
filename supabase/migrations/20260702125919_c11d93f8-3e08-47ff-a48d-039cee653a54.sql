
DROP POLICY IF EXISTS "Trips tenant read" ON public.trips;
CREATE POLICY "Trips tenant read" ON public.trips FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR is_school_admin_of(auth.uid(), school_id)
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

DROP POLICY IF EXISTS "Trips driver/admin write" ON public.trips;
CREATE POLICY "Trips driver/admin write" ON public.trips FOR ALL
USING (
  is_super_admin(auth.uid())
  OR is_school_admin_of(auth.uid(), school_id)
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
  is_super_admin(auth.uid())
  OR is_school_admin_of(auth.uid(), school_id)
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
