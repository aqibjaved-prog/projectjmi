import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to changes on the tables that drive Vehicle assignments &
 * availability (vehicles, routes, drivers, trips) and invalidates the
 * vehicle-related React Query caches so the list and detail views update
 * without a manual refresh.
 *
 * Scoped to a single school when provided; super-admin views pass null and
 * receive updates for all schools they can already read (RLS enforced).
 */
export function useVehicleAssignmentsRealtime(schoolId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["vehicles-list"] });
      qc.invalidateQueries({ queryKey: ["vehicle"] });
      qc.invalidateQueries({ queryKey: ["vehicle-assignments"] });
      qc.invalidateQueries({ queryKey: ["vehicle-occupancy"] });
    };

    const filter = schoolId ? `school_id=eq.${schoolId}` : undefined;
    const channel = supabase.channel(`vehicle-assignments:${schoolId ?? "all"}`);

    for (const table of ["vehicles", "routes", "drivers", "trips"] as const) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        invalidate,
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, schoolId]);
}
