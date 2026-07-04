import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export interface ParentChild {
  id: string;
  school_id: string;
  full_name: string;
  student_code: string | null;
  admission_number: string | null;
  photo_url: string | null;
  grade: string | null;
  class_section: string | null;
  pickup_address: string | null;
  drop_address: string | null;
  emergency_contact: string | null;
  parent_phone: string | null;
  route_id: string | null;
  vehicle_id: string | null;
  routes: { id: string; name: string | null; route_code: string | null; route_type: string | null } | null;
  vehicles: { id: string; registration_number: string | null; vehicle_code: string | null; color: string | null; capacity: number | null } | null;
  drivers: { id: string; full_name: string | null; phone: string | null } | null;
  schools: { id: string; name: string | null; logo_url: string | null } | null;
}

/**
 * Load all children linked to the signed-in parent (via RLS on students).
 * Includes joined route, vehicle, driver, and school info for the child cards.
 */
export function useParentChildren() {
  const { user } = useAuth();
  const query = useQuery({
    enabled: !!user,
    queryKey: ["parent-children", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, school_id, full_name, student_code, admission_number, photo_url, grade, class_section, pickup_address, drop_address, emergency_contact, parent_phone, route_id, vehicle_id, routes:route_id(id,name,route_code,route_type,driver_id), vehicles:vehicle_id(id,registration_number,vehicle_code,color,capacity), schools:school_id(id,name,logo_url)",
        )
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;

      // Fetch drivers separately (via route.driver_id) so we don't depend on FK schema.
      const rows = (data ?? []) as unknown as Array<
        ParentChild & { routes: (ParentChild["routes"] & { driver_id?: string | null }) | null }
      >;
      const driverIds = Array.from(
        new Set(
          rows
            .map((r) => r.routes?.driver_id ?? null)
            .filter((v): v is string => !!v),
        ),
      );
      let driversById: Record<string, ParentChild["drivers"]> = {};
      if (driverIds.length) {
        const { data: drv } = await supabase
          .from("drivers")
          .select("id, full_name, phone")
          .in("id", driverIds);
        driversById = Object.fromEntries(
          (drv ?? []).map((d) => [d.id, d as unknown as ParentChild["drivers"]]),
        );
      }
      return rows.map((r) => ({
        ...r,
        drivers: r.routes?.driver_id ? driversById[r.routes.driver_id] ?? null : null,
      })) as ParentChild[];
    },
  });

  // Realtime — refetch if anything relevant to my children changes.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`parent-children:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () =>
        query.refetch(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "routes" }, () =>
        query.refetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return query;
}

export function useTodayTripsForChildren(childRouteIds: (string | null)[]) {
  const ids = Array.from(new Set(childRouteIds.filter((v): v is string => !!v)));
  return useQuery({
    enabled: ids.length > 0,
    queryKey: ["parent-today-trips", ids.sort().join(",")],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .in("route_id", ids)
        .eq("trip_date", today)
        .order("expected_start_time", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });
}
