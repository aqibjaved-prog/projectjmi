import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { normalizeTrip, type TripRow } from "@/lib/trips";
import type { DriverRow } from "@/lib/drivers";

/** Today's date (YYYY-MM-DD) in the given IANA timezone, falling back to UTC. */
export function todayInTimezone(tz?: string | null): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz && tz.trim() ? tz : "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Fetches the current signed-in user's driver profile (if any) + school timezone. */
export function useMyDriver() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["driver-portal", "me", user?.id],
    queryFn: async (): Promise<(DriverRow & { school_timezone?: string | null }) | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("drivers")
        .select("*, schools:school_id(timezone)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { schools, ...rest } = data as any;
      return { ...(rest as DriverRow), school_timezone: schools?.timezone ?? null };
    },
  });
}


export interface DriverTripRow extends TripRow {
  routes?: {
    id: string;
    name: string;
    route_code: string | null;
    stops: unknown;
    total_distance: number | null;
    estimated_duration: number | null;
    start_lat: number | null;
    start_lng: number | null;
    end_lat: number | null;
    end_lng: number | null;
    starting_point: string | null;
    ending_point: string | null;
    route_color: string | null;
  } | null;
  vehicles?: {
    id: string;
    registration_number: string;
    vehicle_code: string | null;
    capacity: number;
  } | null;
}

const TRIP_SELECT = `
  *,
  routes:route_id (
    id, name, route_code, stops, total_distance, estimated_duration,
    start_lat, start_lng, end_lat, end_lng,
    starting_point, ending_point, route_color
  ),
  vehicles:vehicle_id (id, registration_number, vehicle_code, capacity)
`;

/**
 * Returns route ids currently assigned to this driver. Used so trip queries
 * can also include trips linked via the route (when trips.driver_id is null
 * but the school admin assigned the driver at the route level).
 */
async function fetchDriverRouteIds(driverId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("id")
    .eq("driver_id", driverId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id as string);
}

/** OR filter matching trips assigned to the driver directly OR via their route. */
function driverTripOrFilter(driverId: string, routeIds: string[]): string {
  const routeClause = routeIds.length
    ? `,and(driver_id.is.null,route_id.in.(${routeIds.join(",")}))`
    : "";
  return `driver_id.eq.${driverId}${routeClause}`;
}

/** All trips assigned to the signed-in driver on a given date (default: today in school tz). */
export function useDriverTrips(dateISO?: string) {
  const { data: driver } = useMyDriver();
  const date = dateISO ?? todayInTimezone(driver?.school_timezone);
  return useQuery({
    enabled: !!driver,
    queryKey: ["driver-portal", "trips", driver?.id, date],
    queryFn: async (): Promise<DriverTripRow[]> => {
      if (!driver) return [];
      const routeIds = await fetchDriverRouteIds(driver.id);
      // Show trips scheduled for today (school timezone) OR any live trip
      // (in_progress/paused) regardless of trip_date so an active trip started
      // earlier and not yet completed keeps appearing in the driver portal.
      const { data, error } = await (supabase.from("trips") as any)
        .select(TRIP_SELECT)
        .or(driverTripOrFilter(driver.id, routeIds))
        .or(`trip_date.eq.${date},status.in.(in_progress,paused)`)
        .order("expected_start_time", { ascending: true });
      if (error) throw error;

      return ((data ?? []) as any[]).map((r) => ({
        ...normalizeTrip(r),
        routes: r.routes ?? null,
        vehicles: r.vehicles ?? null,
      })) as DriverTripRow[];
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}


/** Full history of the driver's trips (most recent first). */
export function useDriverTripHistory(limit = 100) {
  const { data: driver } = useMyDriver();
  return useQuery({
    enabled: !!driver,
    queryKey: ["driver-portal", "history", driver?.id, limit],
    queryFn: async (): Promise<DriverTripRow[]> => {
      if (!driver) return [];
      const routeIds = await fetchDriverRouteIds(driver.id);
      const { data, error } = await (supabase.from("trips") as any)
        .select(TRIP_SELECT)
        .or(driverTripOrFilter(driver.id, routeIds))
        .order("trip_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...normalizeTrip(r),
        routes: r.routes ?? null,
        vehicles: r.vehicles ?? null,
      })) as DriverTripRow[];
    },
  });
}

export function useDriverTrip(tripId: string) {
  const { data: driver } = useMyDriver();
  return useQuery({
    enabled: !!driver && !!tripId,
    queryKey: ["driver-portal", "trip", tripId],
    queryFn: async (): Promise<DriverTripRow | null> => {
      const { data, error } = await (supabase.from("trips") as any)
        .select(TRIP_SELECT)
        .eq("id", tripId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { ...normalizeTrip(data as any), routes: (data as any).routes ?? null, vehicles: (data as any).vehicles ?? null } as DriverTripRow;
    },
    refetchInterval: 10_000,
  });
}

export interface DriverStudentRow {
  id: string;
  full_name: string;
  student_code: string | null;
  grade: string | null;
  class_section: string | null;
  photo_url: string | null;
  pickup_address: string | null;
  drop_address: string | null;
  route_id: string | null;
  parent_phone: string | null;
  parent_name: string | null;
  qr_code: string | null;
}

/** Students assigned to the driver's currently-assigned route(s). */
export function useDriverStudents() {
  const { data: driver } = useMyDriver();
  return useQuery({
    enabled: !!driver,
    queryKey: ["driver-portal", "students", driver?.id],
    queryFn: async (): Promise<DriverStudentRow[]> => {
      if (!driver) return [];
      // Find routes assigned to this driver
      const { data: routes, error: rErr } = await supabase
        .from("routes")
        .select("id")
        .eq("driver_id", driver.id);
      if (rErr) throw rErr;
      const routeIds = (routes ?? []).map((r: any) => r.id);
      if (routeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, student_code, grade, class_section, photo_url, pickup_address, drop_address, route_id, parent_phone, parent_name, qr_code")
        .in("route_id", routeIds)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DriverStudentRow[];
    },
  });
}

export function useDriverNotifications() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["driver-portal", "notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function patchDriverTrip(id: string, patch: Record<string, unknown>) {
  const { data, error } = await (supabase.from("trips") as any)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return normalizeTrip(data as any);
}
