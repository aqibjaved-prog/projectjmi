import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/* -------------------- Constants -------------------- */

export const TRIP_TYPES = ["pickup", "drop", "special", "emergency"] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const TRIP_STATUSES = [
  "scheduled",
  "ready",
  "in_progress",
  "paused",
  "completed",
  "canceled",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export function tripTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case "pickup": return "Morning Pickup";
    case "drop": return "Afternoon Drop";
    case "special": return "Special";
    case "emergency": return "Emergency";
    default: return "—";
  }
}

export function tripStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "scheduled": return "Scheduled";
    case "ready": return "Ready";
    case "in_progress": return "Live";
    case "paused": return "Paused";
    case "completed": return "Completed";
    case "canceled": return "Cancelled";
    default: return "—";
  }
}

export function tripStatusTone(s: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "in_progress": return "default";
    case "completed": return "secondary";
    case "canceled": return "destructive";
    default: return "outline";
  }
}

/* -------------------- Schema -------------------- */

const optStr = (max = 255) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => v ?? "");

export const tripSchema = z.object({
  name: z.string().trim().min(1, "Trip name is required").max(160),
  trip_type: z.enum(TRIP_TYPES),
  trip_date: z.string().min(1, "Trip date is required").max(20),
  expected_start_time: optStr(8),
  expected_end_time: optStr(8),
  route_id: z.string().uuid("Route is required"),
  driver_id: z.string().uuid().optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable(),
  notes: optStr(2000),
});

export type TripFormValues = z.input<typeof tripSchema>;

/* -------------------- Types -------------------- */

export interface TripStopProgress {
  stop_id: string;
  name: string;
  order: number;
  scheduled_arrival?: string | null;
  scheduled_departure?: string | null;
  actual_arrival?: string | null;
  actual_departure?: string | null;
  students_expected?: number;
  students_boarded?: number;
  students_missing?: number;
  status?: "pending" | "reached" | "departed" | "skipped";
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface TripTimelineEvent {
  id: string;
  event_type: string;
  message: string;
  at: string; // ISO
  metadata?: Record<string, unknown>;
}

export interface TripLiveLocation {
  lat: number;
  lng: number;
  speed_kmh?: number | null;
  heading?: number | null;
  recorded_at: string;
}

export interface TripSnapshot {
  route_name?: string | null;
  driver_name?: string | null;
  vehicle_registration?: string | null;
  vehicle_capacity?: number | null;
  student_ids?: string[];
  student_count?: number;
  locked_at?: string;
}

export interface TripRow {
  id: string;
  school_id: string;
  route_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  trip_date: string;
  trip_type: TripType;
  status: TripStatus;
  started_at: string | null;
  ended_at: string | null;
  start_location: unknown;
  end_location: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // extended fields
  trip_code: string | null;
  name: string | null;
  expected_start_time: string | null;
  expected_end_time: string | null;
  notes: string | null;
  canceled_at: string | null;
  stop_progress: TripStopProgress[];
  timeline: TripTimelineEvent[];
  live_location: TripLiveLocation | null;
  snapshot: TripSnapshot;
}

/* -------------------- Helpers -------------------- */

export function normalizeTrip(raw: Record<string, unknown>): TripRow {
  return {
    ...(raw as unknown as TripRow),
    stop_progress: Array.isArray(raw.stop_progress) ? (raw.stop_progress as TripStopProgress[]) : [],
    timeline: Array.isArray(raw.timeline) ? (raw.timeline as TripTimelineEvent[]) : [],
    live_location: (raw.live_location ?? null) as TripLiveLocation | null,
    snapshot: (raw.snapshot ?? {}) as TripSnapshot,
    metadata: (raw.metadata ?? {}) as Record<string, unknown>,
  };
}

export function tripFormToPayload(v: TripFormValues) {
  return {
    name: v.name.trim(),
    trip_type: v.trip_type,
    trip_date: v.trip_date,
    expected_start_time: v.expected_start_time || null,
    expected_end_time: v.expected_end_time || null,
    route_id: v.route_id,
    driver_id: v.driver_id || null,
    vehicle_id: v.vehicle_id || null,
    notes: (v.notes || "").trim() || null,
    status: "scheduled" as TripStatus,
  };
}

export function tripToFormDefaults(t: TripRow): TripFormValues {
  return {
    name: t.name ?? "",
    trip_type: t.trip_type,
    trip_date: t.trip_date,
    expected_start_time: t.expected_start_time ?? "",
    expected_end_time: t.expected_end_time ?? "",
    route_id: t.route_id,
    driver_id: t.driver_id,
    vehicle_id: t.vehicle_id,
    notes: t.notes ?? "",
  };
}

/* -------------------- Timeline / delay helpers -------------------- */

export function makeEvent(event_type: string, message: string, metadata?: Record<string, unknown>): TripTimelineEvent {
  return {
    id: crypto.randomUUID(),
    event_type,
    message,
    at: new Date().toISOString(),
    metadata,
  };
}

export function delayMinutes(scheduled: string | null | undefined, actual: string | null | undefined, date: string): number | null {
  if (!scheduled || !actual) return null;
  const [sh, sm] = scheduled.split(":").map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm)) return null;
  const sched = new Date(`${date}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
  const act = new Date(actual);
  if (Number.isNaN(sched.getTime()) || Number.isNaN(act.getTime())) return null;
  return Math.round((act.getTime() - sched.getTime()) / 60000);
}

export function delayLabel(mins: number | null): { label: string; tone: "success" | "warning" | "destructive" | "muted" } {
  if (mins == null) return { label: "—", tone: "muted" };
  if (mins <= 0) return { label: "On time", tone: "success" };
  if (mins <= 5) return { label: `${mins} min late`, tone: "warning" };
  if (mins <= 15) return { label: `${mins} min late`, tone: "warning" };
  return { label: `${mins} min late`, tone: "destructive" };
}

/* -------------------- Server-side data access wrappers -------------------- */

// Casts to `never` avoid stale generated types until types.ts refresh.
const trips = () => supabase.from("trips" as never) as unknown as {
  select: (s: string) => { eq: (k: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }>; single: () => Promise<{ data: unknown; error: unknown }> } };
  insert: (p: unknown) => { select: (s: string) => { single: () => Promise<{ data: unknown; error: unknown }> } };
  update: (p: unknown) => { eq: (k: string, v: unknown) => { select: (s: string) => { single: () => Promise<{ data: unknown; error: unknown }> } } };
  delete: () => { eq: (k: string, v: unknown) => Promise<{ error: unknown }> };
};

export async function fetchTripById(id: string): Promise<TripRow | null> {
  const { data, error } = await trips().select("*").eq("id", id).maybeSingle();
  if (error) throw error as Error;
  return data ? normalizeTrip(data as Record<string, unknown>) : null;
}

export async function insertTrip(payload: Record<string, unknown>) {
  const { data, error } = await trips().insert(payload).select("*").single();
  if (error) throw error as Error;
  return normalizeTrip(data as Record<string, unknown>);
}

export async function updateTrip(id: string, payload: Record<string, unknown>) {
  const { data, error } = await trips().update(payload).eq("id", id).select("*").single();
  if (error) throw error as Error;
  return normalizeTrip(data as Record<string, unknown>);
}

export async function deleteTrip(id: string) {
  const { error } = await trips().delete().eq("id", id);
  if (error) throw error as Error;
}

