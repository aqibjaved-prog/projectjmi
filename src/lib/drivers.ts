import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const DRIVER_PHOTO_BUCKET = "driver-photos";

/* -------------------- Schema -------------------- */

const optStr = (max = 255) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => v ?? "");

export const driverSchema = z
  .object({
    first_name: z.string().trim().min(1, "First name is required").max(80),
    last_name: z.string().trim().max(80).optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+()\-\s\d]{6,40}$/, "Invalid phone")
      .optional()
      .or(z.literal("")),
    email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
    date_of_birth: optStr(20),
    gender: optStr(20),
    blood_group: optStr(10),
    address: optStr(500),
    city: optStr(80),
    state: optStr(80),
    pincode: optStr(20),
    aadhaar_number: z
      .string()
      .trim()
      .max(20)
      .regex(/^(\d{12})?$/, "Aadhaar must be 12 digits")
      .optional()
      .or(z.literal("")),
    license_number: optStr(60),
    license_class: optStr(30),
    license_issue_date: optStr(20),
    license_expiry: optStr(20),
    experience_years: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => (v === "" || v == null ? "" : String(v)))
      .refine((v) => v === "" || !Number.isNaN(Number(v)), "Must be a number"),
    emergency_contact_name: optStr(120),
    emergency_contact_number: optStr(40),
    joining_date: optStr(20),
    notes: optStr(1000),
    photo_url: optStr(500),
    is_active: z.boolean().optional(),
  });

export type DriverFormValues = z.input<typeof driverSchema>;
export type DriverFormParsed = z.output<typeof driverSchema>;

/* -------------------- Types -------------------- */

export type DriverMetadata = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  license_class?: string | null;
  license_issue_date?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  aadhaar_number?: string | null;
  experience_years?: number | null;
  emergency_contact_name?: string | null;
  emergency_contact_number?: string | null;
  /** Legacy single-line emergency contact retained for back-compat. */
  emergency_contact?: string | null;
  joining_date?: string | null;
  notes?: string | null;
  photo_path?: string | null;
  driver_code?: string | null;
};

export interface DriverRow {
  id: string;
  school_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  license_number: string | null;
  license_expiry: string | null;
  assigned_vehicle_id: string | null;
  is_active: boolean;
  metadata: DriverMetadata | null;
  created_at: string;
  updated_at: string;
}

/* -------------------- Helpers -------------------- */

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function composeFullName(first?: string, last?: string) {
  return [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ") || "Unnamed";
}

/** Split form values into table columns + metadata jsonb. */
export function splitDriverPayload(v: DriverFormValues, existingPhotoPath?: string | null) {
  const first = (v.first_name ?? "").trim();
  const last = (v.last_name ?? "").trim();
  const columns = {
    full_name: composeFullName(first, last),
    phone: emptyToNull(v.phone),
    license_number: emptyToNull(v.license_number),
    license_expiry: emptyToNull(v.license_expiry),
    is_active: v.is_active ?? true,
  };
  const experience = v.experience_years == null || v.experience_years === "" ? null : Number(v.experience_years);
  const metadata: DriverMetadata = {
    first_name: emptyToNull(first),
    last_name: emptyToNull(last),
    email: emptyToNull(v.email),
    license_class: emptyToNull(v.license_class),
    license_issue_date: emptyToNull(v.license_issue_date),
    date_of_birth: emptyToNull(v.date_of_birth),
    gender: emptyToNull(v.gender),
    blood_group: emptyToNull(v.blood_group),
    address: emptyToNull(v.address),
    city: emptyToNull(v.city),
    state: emptyToNull(v.state),
    pincode: emptyToNull(v.pincode),
    aadhaar_number: emptyToNull(v.aadhaar_number),
    experience_years: experience != null && !Number.isNaN(experience) ? experience : null,
    emergency_contact_name: emptyToNull(v.emergency_contact_name),
    emergency_contact_number: emptyToNull(v.emergency_contact_number),
    joining_date: emptyToNull(v.joining_date),
    notes: emptyToNull(v.notes),
    photo_path: existingPhotoPath ?? null,
  };
  return { columns, metadata };
}

export function mergeMetadata(
  existing: DriverMetadata | null | undefined,
  incoming: DriverMetadata,
): DriverMetadata {
  return { ...(existing ?? {}), ...incoming };
}

export function driverToFormDefaults(d: DriverRow): DriverFormValues {
  const m = d.metadata ?? {};
  const parts = (d.full_name ?? "").trim().split(/\s+/);
  const first = m.first_name ?? parts[0] ?? "";
  const last = m.last_name ?? (parts.length > 1 ? parts.slice(1).join(" ") : "");
  return {
    first_name: first,
    last_name: last,
    phone: d.phone ?? "",
    email: m.email ?? "",
    date_of_birth: m.date_of_birth ?? "",
    gender: m.gender ?? "",
    blood_group: m.blood_group ?? "",
    address: m.address ?? "",
    city: m.city ?? "",
    state: m.state ?? "",
    pincode: m.pincode ?? "",
    aadhaar_number: m.aadhaar_number ?? "",
    license_number: d.license_number ?? "",
    license_class: m.license_class ?? "",
    license_issue_date: m.license_issue_date ?? "",
    license_expiry: d.license_expiry ?? "",
    experience_years: m.experience_years != null ? String(m.experience_years) : "",
    emergency_contact_name: m.emergency_contact_name ?? "",
    emergency_contact_number: m.emergency_contact_number ?? m.emergency_contact ?? "",
    joining_date: m.joining_date ?? "",
    notes: m.notes ?? "",
    photo_url: "",
    is_active: d.is_active,
  };
}

/* -------------------- License status -------------------- */

export type LicenseStatus = "valid" | "expiring" | "expired" | "unknown";

export function licenseStatus(expiry: string | null | undefined, warnDays = 30): LicenseStatus {
  if (!expiry) return "unknown";
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) return "unknown";
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / 86_400_000);
  if (diffDays < 0) return "expired";
  if (diffDays <= warnDays) return "expiring";
  return "valid";
}

export function licenseStatusLabel(s: LicenseStatus): string {
  return s === "valid" ? "Valid" : s === "expiring" ? "Expiring soon" : s === "expired" ? "Expired" : "—";
}

/* -------------------- Photo storage -------------------- */

export async function uploadDriverPhoto(
  schoolId: string,
  driverId: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${schoolId}/${driverId}.${ext}`;
  const { error } = await supabase.storage
    .from(DRIVER_PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function getDriverPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(DRIVER_PHOTO_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteDriverPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from(DRIVER_PHOTO_BUCKET).remove([path]);
}
