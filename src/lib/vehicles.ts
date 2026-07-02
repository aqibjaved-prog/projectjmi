import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const VEHICLE_PHOTO_BUCKET = "vehicle-photos";

/* -------------------- Constants -------------------- */

export const VEHICLE_TYPES = ["school_van", "mini_bus", "bus", "car", "other"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const FUEL_TYPES = ["petrol", "diesel", "cng", "lpg", "electric", "hybrid", "other"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const VEHICLE_STATUSES = ["active", "inactive", "maintenance"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export function vehicleTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case "school_van": return "School Van";
    case "mini_bus": return "Mini Bus";
    case "bus": return "Bus";
    case "car": return "Car";
    case "other": return "Other";
    default: return "—";
  }
}
export function fuelTypeLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function vehicleStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "active": return "Active";
    case "inactive": return "Inactive";
    case "maintenance": return "Under Maintenance";
    default: return "—";
  }
}

/* -------------------- Schema -------------------- */

const optStr = (max = 255) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => v ?? "");

export const vehicleSchema = z.object({
  vehicle_number: z.string().trim().min(1, "Vehicle number is required").max(40),
  registration_number: z.string().trim().min(3, "Registration number is required").max(40),
  vehicle_type: z.enum(VEHICLE_TYPES),
  brand: optStr(80),
  model: optStr(80),
  manufacturing_year: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v == null || v === "" ? "" : String(v)))
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && Number(v) >= 1950 && Number(v) <= new Date().getFullYear() + 1),
      "Enter a valid 4-digit year"),
  capacity: z
    .union([z.string(), z.number()])
    .transform((v) => (v == null || v === "" ? "" : String(v)))
    .refine((v) => v !== "" && Number(v) > 0 && Number(v) <= 200, "Capacity must be 1–200"),
  fuel_type: z.enum(FUEL_TYPES).optional().or(z.literal("")).transform((v) => (v || "") as FuelType | ""),
  color: optStr(40),
  chassis_number: optStr(80),
  engine_number: optStr(80),
  insurance_number: optStr(80),
  insurance_expiry: optStr(20),
  fitness_number: optStr(80),
  fitness_expiry: optStr(20),
  pollution_number: optStr(80),
  pollution_expiry: optStr(20),
  rc_number: optStr(80),
  gps_device_id: optStr(80),
  notes: optStr(1000),
  status: z.enum(VEHICLE_STATUSES).default("active"),
});

export type VehicleFormValues = z.input<typeof vehicleSchema>;

/* -------------------- Types -------------------- */

export type VehicleMetadata = {
  vehicle_number?: string | null;
  vehicle_type?: VehicleType | null;
  brand?: string | null;
  manufacturing_year?: number | null;
  fuel_type?: FuelType | null;
  chassis_number?: string | null;
  engine_number?: string | null;
  insurance_number?: string | null;
  fitness_number?: string | null;
  pollution_number?: string | null;
  pollution_expiry?: string | null;
  rc_number?: string | null;
  gps_device_id?: string | null;
  notes?: string | null;
  photo_path?: string | null;
  service_due_date?: string | null;
};

export interface VehicleRow {
  id: string;
  school_id: string;
  vehicle_code: string | null;
  vehicle_number: string | null;
  registration_number: string;
  model: string | null;
  capacity: number;
  color: string | null;
  insurance_expiry: string | null;
  fitness_expiry: string | null;
  is_active: boolean;
  status: string;
  metadata: VehicleMetadata | null;
  created_at: string;
  updated_at: string;
}

/* -------------------- Helpers -------------------- */

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

export function splitVehiclePayload(v: VehicleFormValues, existingPhotoPath?: string | null) {
  const columns = {
    vehicle_number: emptyToNull(v.vehicle_number),
    registration_number: (v.registration_number ?? "").trim(),
    model: emptyToNull(v.model),
    capacity: Number(v.capacity) || 0,
    color: emptyToNull(v.color),
    insurance_expiry: emptyToNull(v.insurance_expiry),
    fitness_expiry: emptyToNull(v.fitness_expiry),
    status: (v.status ?? "active") as VehicleStatus,
  };
  const metadata: VehicleMetadata = {
    vehicle_number: columns.vehicle_number,
    vehicle_type: v.vehicle_type,
    brand: emptyToNull(v.brand),
    manufacturing_year:
      v.manufacturing_year && v.manufacturing_year !== "" ? Number(v.manufacturing_year) : null,
    fuel_type: (v.fuel_type || null) as FuelType | null,
    chassis_number: emptyToNull(v.chassis_number),
    engine_number: emptyToNull(v.engine_number),
    insurance_number: emptyToNull(v.insurance_number),
    fitness_number: emptyToNull(v.fitness_number),
    pollution_number: emptyToNull(v.pollution_number),
    pollution_expiry: emptyToNull(v.pollution_expiry),
    rc_number: emptyToNull(v.rc_number),
    gps_device_id: emptyToNull(v.gps_device_id),
    notes: emptyToNull(v.notes),
    photo_path: existingPhotoPath ?? null,
  };
  return { columns, metadata };
}

export function mergeMetadata(
  existing: VehicleMetadata | null | undefined,
  incoming: VehicleMetadata,
): VehicleMetadata {
  return { ...(existing ?? {}), ...incoming };
}

export function vehicleToFormDefaults(v: VehicleRow): VehicleFormValues {
  const m = v.metadata ?? {};
  return {
    vehicle_number: v.vehicle_number ?? m.vehicle_number ?? "",
    registration_number: v.registration_number ?? "",
    vehicle_type: (m.vehicle_type ?? "school_van") as VehicleType,
    brand: m.brand ?? "",
    model: v.model ?? "",
    manufacturing_year: m.manufacturing_year != null ? String(m.manufacturing_year) : "",
    capacity: v.capacity != null ? String(v.capacity) : "",
    fuel_type: (m.fuel_type ?? "") as FuelType | "",
    color: v.color ?? "",
    chassis_number: m.chassis_number ?? "",
    engine_number: m.engine_number ?? "",
    insurance_number: m.insurance_number ?? "",
    insurance_expiry: v.insurance_expiry ?? "",
    fitness_number: m.fitness_number ?? "",
    fitness_expiry: v.fitness_expiry ?? "",
    pollution_number: m.pollution_number ?? "",
    pollution_expiry: m.pollution_expiry ?? "",
    rc_number: m.rc_number ?? "",
    gps_device_id: m.gps_device_id ?? "",
    notes: m.notes ?? "",
    status: (v.status ?? "active") as VehicleStatus,
  };
}

/* -------------------- Expiry helpers -------------------- */

export type ExpiryStatus = "valid" | "expiring" | "expired" | "unknown";

export function expiryStatus(date: string | null | undefined, warnDays = 30): ExpiryStatus {
  if (!date) return "unknown";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "unknown";
  const now = new Date();
  const diff = Math.floor((d.getTime() - now.getTime()) / 86_400_000);
  if (diff < 0) return "expired";
  if (diff <= warnDays) return "expiring";
  return "valid";
}

export function expiryLabel(s: ExpiryStatus): string {
  return s === "valid" ? "Valid" : s === "expiring" ? "Expiring soon" : s === "expired" ? "Expired" : "—";
}

/* -------------------- Photo storage -------------------- */

export async function uploadVehiclePhoto(
  schoolId: string,
  vehicleId: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${schoolId}/${vehicleId}.${ext}`;
  const { error } = await supabase.storage
    .from(VEHICLE_PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function getVehiclePhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(VEHICLE_PHOTO_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

/* -------------------- Occupancy -------------------- */

export interface VehicleOccupancyRow {
  vehicle_id: string;
  school_id: string;
  capacity: number;
  occupied: number;
  available: number;
}

export async function fetchVehicleOccupancy(schoolId: string | null | undefined): Promise<Map<string, VehicleOccupancyRow>> {
  const map = new Map<string, VehicleOccupancyRow>();
  if (!schoolId) return map;
  const { data, error } = await supabase
    .from("vehicle_occupancy" as never)
    .select("vehicle_id,school_id,capacity,occupied,available")
    .eq("school_id", schoolId);
  if (error) return map;
  for (const row of (data ?? []) as VehicleOccupancyRow[]) {
    map.set(row.vehicle_id, row);
  }
  return map;
}

export const VEHICLE_CAPACITY_ERROR = "This vehicle has reached its maximum seating capacity.";

export function isCapacityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.toLowerCase().includes("maximum seating capacity");
}

/* -------------------- Assignments (driver / route / trips) -------------------- */

export interface VehicleAssignmentRow {
  route: { id: string; name: string; route_code: string | null; driver_id: string | null } | null;
  driver: { id: string; full_name: string; phone: string | null } | null;
  todayTrip: {
    id: string;
    trip_code: string | null;
    name: string | null;
    status: string;
    trip_type: string;
    expected_start_time: string | null;
    expected_end_time: string | null;
    driver_id: string | null;
  } | null;
  activeTripId: string | null;
}

/**
 * Resolves each vehicle's assigned route + driver (via routes.vehicle_id) and
 * today's / currently-active trip (via trips.vehicle_id). Returns a map keyed
 * by vehicle_id. RLS is preserved — only vehicles the caller can already read
 * are considered.
 */
export async function fetchVehicleAssignments(
  schoolId: string | null | undefined,
): Promise<Map<string, VehicleAssignmentRow>> {
  const map = new Map<string, VehicleAssignmentRow>();
  if (!schoolId) return map;

  const today = new Date().toISOString().slice(0, 10);

  const [routesRes, tripsRes, driversRes] = await Promise.all([
    supabase
      .from("routes")
      .select("id,name,route_code,vehicle_id,driver_id,drivers:driver_id(id,full_name,phone)")
      .eq("school_id", schoolId)
      .not("vehicle_id", "is", null),
    supabase
      .from("trips" as never)
      .select("id,trip_code,name,status,trip_type,trip_date,expected_start_time,expected_end_time,vehicle_id,driver_id,drivers:driver_id(id,full_name,phone)")
      .eq("school_id", schoolId)
      .not("vehicle_id", "is", null)
      .or(`trip_date.eq.${today},status.in.(in_progress,paused)`)
      .order("expected_start_time", { ascending: true }),
    supabase
      .from("drivers")
      .select("id,full_name,phone,assigned_vehicle_id")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .not("assigned_vehicle_id", "is", null),
  ]);

  const routes = (routesRes.data ?? []) as any[];
  const trips = (tripsRes.data ?? []) as any[];
  const drivers = (driversRes.data ?? []) as any[];

  for (const d of drivers) {
    if (!d.assigned_vehicle_id) continue;
    const existing = map.get(d.assigned_vehicle_id) ?? emptyAssignment();
    if (!existing.driver) {
      existing.driver = { id: d.id, full_name: d.full_name, phone: d.phone ?? null };
    }
    map.set(d.assigned_vehicle_id, existing);
  }


  for (const r of routes) {
    if (!r.vehicle_id) continue;
    const existing = map.get(r.vehicle_id) ?? emptyAssignment();
    existing.route = { id: r.id, name: r.name, route_code: r.route_code, driver_id: r.driver_id ?? null };
    if (r.drivers) {
      existing.driver = { id: r.drivers.id, full_name: r.drivers.full_name, phone: r.drivers.phone ?? null };
    }
    map.set(r.vehicle_id, existing);
  }

  for (const t of trips) {
    if (!t.vehicle_id) continue;
    const existing = map.get(t.vehicle_id) ?? emptyAssignment();
    const isActive = t.status === "in_progress" || t.status === "paused";
    if (isActive && !existing.activeTripId) existing.activeTripId = t.id;
    if (t.trip_date === today && !existing.todayTrip) {
      existing.todayTrip = {
        id: t.id,
        trip_code: t.trip_code,
        name: t.name,
        status: t.status,
        trip_type: t.trip_type,
        expected_start_time: t.expected_start_time,
        expected_end_time: t.expected_end_time,
        driver_id: t.driver_id,
      };
    }
    // Prefer the trip's driver if the route has none.
    if (!existing.driver && t.drivers) {
      existing.driver = { id: t.drivers.id, full_name: t.drivers.full_name, phone: t.drivers.phone ?? null };
    }
    map.set(t.vehicle_id, existing);
  }

  return map;
}

function emptyAssignment(): VehicleAssignmentRow {
  return { route: null, driver: null, todayTrip: null, activeTripId: null };
}

/**
 * Availability label derived from vehicle status + current assignments.
 * "in_use" wins over "available" when an active trip exists.
 */
export type VehicleAvailability = "available" | "in_use" | "maintenance" | "inactive";

export function vehicleAvailability(
  status: string | null | undefined,
  assignment: VehicleAssignmentRow | undefined,
): VehicleAvailability {
  if (status === "maintenance") return "maintenance";
  if (status === "inactive") return "inactive";
  if (assignment?.activeTripId) return "in_use";
  return "available";
}

export function vehicleAvailabilityLabel(a: VehicleAvailability): string {
  switch (a) {
    case "available": return "Available";
    case "in_use": return "In use";
    case "maintenance": return "Under maintenance";
    case "inactive": return "Inactive";
  }
}

/**
 * Prevents double-booking a vehicle across concurrent active trips.
 * Throws if another trip on the same vehicle is already in_progress or paused.
 * Called from every trip-start site (school-admin Trips page + Driver Portal).
 */
export async function assertVehicleAvailableForTrip(
  vehicleId: string | null | undefined,
  excludeTripId?: string | null,
): Promise<void> {
  if (!vehicleId) return;
  const { data, error } = await (supabase.from("trips" as never) as any)
    .select("id,trip_code,name,status")
    .eq("vehicle_id", vehicleId)
    .in("status", ["in_progress", "paused"])
    .limit(2);
  if (error) throw error;
  const conflict = ((data ?? []) as any[]).find((t) => t.id !== excludeTripId);
  if (conflict) {
    const label = conflict.trip_code ?? conflict.name ?? conflict.id.slice(0, 8);
    throw new Error(`This vehicle is already on an active trip (${label}). End that trip before starting another.`);
  }
}

