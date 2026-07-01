import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/* -------------------- Constants -------------------- */

export const ROUTE_TYPES = ["morning", "afternoon", "both"] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

export const ROUTE_STATUSES = ["active", "inactive"] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const ROUTE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#0ea5e9", "#84cc16",
];

export function routeTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case "morning": return "Morning";
    case "afternoon": return "Afternoon";
    case "both": return "Morning & Afternoon";
    default: return "—";
  }
}

export function routeStatusLabel(s: boolean | null | undefined): string {
  return s ? "Active" : "Inactive";
}

/* -------------------- Stops -------------------- */

export interface RouteStop {
  id: string;
  name: string;
  order: number;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  arrival_time?: string | null;   // "HH:MM"
  departure_time?: string | null; // "HH:MM"
  dwell_min?: number | null;
  driving_seconds_from_prev?: number | null;
  distance_from_prev_m?: number | null;
  manual_time?: boolean | null;
}

export const stopSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Stop name required").max(120),
  order: z.number().int().min(0),
  address: z.string().trim().max(300).optional().nullable(),
  lat: z.union([z.string(), z.number()])
    .optional().nullable()
    .transform((v) => (v == null || v === "" ? null : Number(v)))
    .refine((v) => v == null || (!Number.isNaN(v) && v >= -90 && v <= 90), "Invalid latitude"),
  lng: z.union([z.string(), z.number()])
    .optional().nullable()
    .transform((v) => (v == null || v === "" ? null : Number(v)))
    .refine((v) => v == null || (!Number.isNaN(v) && v >= -180 && v <= 180), "Invalid longitude"),
  arrival_time: z.string().trim().max(8).optional().nullable(),
  departure_time: z.string().trim().max(8).optional().nullable(),
  dwell_min: z.union([z.string(), z.number()]).optional().nullable()
    .transform((v) => (v == null || v === "" ? null : Number(v))),
  driving_seconds_from_prev: z.union([z.string(), z.number()]).optional().nullable()
    .transform((v) => (v == null || v === "" ? null : Number(v))),
  distance_from_prev_m: z.union([z.string(), z.number()]).optional().nullable()
    .transform((v) => (v == null || v === "" ? null : Number(v))),
  manual_time: z.boolean().optional().nullable(),
});

export function normalizeStops(raw: unknown): RouteStop[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s, i) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        id: String(o.id ?? crypto.randomUUID()),
        name: String(o.name ?? "").trim() || `Stop ${i + 1}`,
        order: typeof o.order === "number" ? o.order : i,
        address: (o.address as string | null) ?? null,
        lat: o.lat == null || o.lat === "" ? null : Number(o.lat),
        lng: o.lng == null || o.lng === "" ? null : Number(o.lng),
        arrival_time: (o.arrival_time as string | null) ?? null,
        departure_time: (o.departure_time as string | null) ?? null,
        dwell_min: o.dwell_min == null || o.dwell_min === "" ? null : Number(o.dwell_min),
        driving_seconds_from_prev: o.driving_seconds_from_prev == null ? null : Number(o.driving_seconds_from_prev),
        distance_from_prev_m: o.distance_from_prev_m == null ? null : Number(o.distance_from_prev_m),
        manual_time: Boolean(o.manual_time),
      } as RouteStop;
    })
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i }));
}

export function newStop(order = 0): RouteStop {
  return {
    id: crypto.randomUUID(), name: "", order, address: "", lat: null, lng: null,
    arrival_time: "", departure_time: "",
    dwell_min: null, driving_seconds_from_prev: null, distance_from_prev_m: null, manual_time: false,
  };
}

/* -------------------- Route form schema -------------------- */

const optStr = (max = 255) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => v ?? "");

export const routeSchema = z.object({
  name: z.string().trim().min(1, "Route name is required").max(120),
  route_type: z.enum(ROUTE_TYPES),
  is_active: z.boolean().default(true),
  starting_point: optStr(255),
  ending_point: optStr(255),
  start_lat: z.union([z.string(), z.number()]).optional().transform((v) => (v == null || v === "" ? "" : String(v))),
  start_lng: z.union([z.string(), z.number()]).optional().transform((v) => (v == null || v === "" ? "" : String(v))),
  end_lat: z.union([z.string(), z.number()]).optional().transform((v) => (v == null || v === "" ? "" : String(v))),
  end_lng: z.union([z.string(), z.number()]).optional().transform((v) => (v == null || v === "" ? "" : String(v))),
  total_distance: z.union([z.string(), z.number()]).optional().transform((v) => (v == null || v === "" ? "" : String(v))),
  estimated_duration: z.union([z.string(), z.number()]).optional().transform((v) => (v == null || v === "" ? "" : String(v))),
  pickup_start_time: optStr(8),
  drop_start_time: optStr(8),
  max_students: z.union([z.string(), z.number()]).optional().transform((v) => (v == null || v === "" ? "" : String(v))),
  route_color: optStr(20),
  vehicle_id: z.string().uuid().optional().nullable(),
  driver_id: z.string().uuid().optional().nullable(),
  notes: optStr(2000),
  stops: z.array(stopSchema).default([]),
});

export type RouteFormValues = z.input<typeof routeSchema>;

/* -------------------- Types -------------------- */

export interface RouteRow {
  id: string;
  school_id: string;
  route_code: string | null;
  name: string;
  route_type: string;
  is_active: boolean;
  starting_point: string | null;
  ending_point: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  total_distance: number | null;
  estimated_duration: number | null;
  pickup_start_time: string | null;
  drop_start_time: string | null;
  max_students: number | null;
  route_color: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  description: string | null;
  notes: string | null;
  stops: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/* -------------------- Payload helpers -------------------- */

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function numOrNull(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v: string | number | null | undefined): number | null {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
}

export function routeFormToPayload(v: RouteFormValues) {
  return {
    name: v.name.trim(),
    route_type: v.route_type,
    is_active: v.is_active,
    starting_point: emptyToNull(v.starting_point),
    ending_point: emptyToNull(v.ending_point),
    start_lat: numOrNull(v.start_lat),
    start_lng: numOrNull(v.start_lng),
    end_lat: numOrNull(v.end_lat),
    end_lng: numOrNull(v.end_lng),
    total_distance: numOrNull(v.total_distance),
    estimated_duration: intOrNull(v.estimated_duration),
    pickup_start_time: emptyToNull(v.pickup_start_time),
    drop_start_time: emptyToNull(v.drop_start_time),
    max_students: intOrNull(v.max_students),
    route_color: emptyToNull(v.route_color),
    vehicle_id: v.vehicle_id || null,
    driver_id: v.driver_id || null,
    notes: emptyToNull(v.notes),
    stops: (v.stops ?? []).map((s, i) => ({
      id: s.id,
      name: s.name.trim(),
      order: i,
      address: emptyToNull(s.address ?? null),
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      arrival_time: emptyToNull(s.arrival_time ?? null),
      departure_time: emptyToNull(s.departure_time ?? null),
    })),
  };
}

export function routeToFormDefaults(r: RouteRow): RouteFormValues {
  return {
    name: r.name ?? "",
    route_type: ((ROUTE_TYPES as readonly string[]).includes(r.route_type) ? r.route_type : "both") as RouteType,
    is_active: r.is_active ?? true,
    starting_point: r.starting_point ?? "",
    ending_point: r.ending_point ?? "",
    start_lat: r.start_lat != null ? String(r.start_lat) : "",
    start_lng: r.start_lng != null ? String(r.start_lng) : "",
    end_lat: r.end_lat != null ? String(r.end_lat) : "",
    end_lng: r.end_lng != null ? String(r.end_lng) : "",
    total_distance: r.total_distance != null ? String(r.total_distance) : "",
    estimated_duration: r.estimated_duration != null ? String(r.estimated_duration) : "",
    pickup_start_time: r.pickup_start_time ?? "",
    drop_start_time: r.drop_start_time ?? "",
    max_students: r.max_students != null ? String(r.max_students) : "",
    route_color: r.route_color ?? "",
    vehicle_id: r.vehicle_id,
    driver_id: r.driver_id,
    notes: r.notes ?? "",
    stops: normalizeStops(r.stops),
  };
}

/* -------------------- Route counts / occupancy -------------------- */

export async function fetchRouteStudentCounts(schoolId: string | null | undefined): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!schoolId) return map;
  const { data, error } = await supabase
    .from("students")
    .select("route_id")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .not("route_id", "is", null);
  if (error) return map;
  for (const row of (data ?? []) as { route_id: string | null }[]) {
    if (!row.route_id) continue;
    map.set(row.route_id, (map.get(row.route_id) ?? 0) + 1);
  }
  return map;
}
