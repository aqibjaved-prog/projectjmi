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
