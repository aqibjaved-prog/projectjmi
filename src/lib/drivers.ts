import { z } from "zod";

export const driverSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+()\-\s\d]{0,40}$/, "Invalid phone")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  license_number: z.string().trim().max(60).optional().or(z.literal("")),
  license_class: z.string().trim().max(30).optional().or(z.literal("")),
  license_issue_date: z.string().max(20).optional().or(z.literal("")),
  license_expiry: z.string().max(20).optional().or(z.literal("")),
  date_of_birth: z.string().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  emergency_contact: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().optional(),
});

export type DriverFormValues = z.infer<typeof driverSchema>;

export type DriverMetadata = {
  email?: string | null;
  license_class?: string | null;
  license_issue_date?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  notes?: string | null;
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

/** Split form values into table columns + metadata jsonb. */
export function splitDriverPayload(v: DriverFormValues) {
  const columns = {
    full_name: v.full_name.trim(),
    phone: emptyToNull(v.phone),
    license_number: emptyToNull(v.license_number),
    license_expiry: emptyToNull(v.license_expiry),
    is_active: v.is_active ?? true,
  };
  const metadata: DriverMetadata = {
    email: emptyToNull(v.email),
    license_class: emptyToNull(v.license_class),
    license_issue_date: emptyToNull(v.license_issue_date),
    date_of_birth: emptyToNull(v.date_of_birth),
    address: emptyToNull(v.address),
    emergency_contact: emptyToNull(v.emergency_contact),
    notes: emptyToNull(v.notes),
  };
  return { columns, metadata };
}

export function mergeMetadata(
  existing: DriverMetadata | null | undefined,
  incoming: DriverMetadata,
): DriverMetadata {
  return { ...(existing ?? {}), ...incoming };
}

export function driverToFormDefaults(d: DriverRow): DriverFormValues & { photo_url?: never } {
  const m = d.metadata ?? {};
  return {
    full_name: d.full_name ?? "",
    phone: d.phone ?? "",
    email: m.email ?? "",
    license_number: d.license_number ?? "",
    license_class: m.license_class ?? "",
    license_issue_date: m.license_issue_date ?? "",
    license_expiry: d.license_expiry ?? "",
    date_of_birth: m.date_of_birth ?? "",
    address: m.address ?? "",
    emergency_contact: m.emergency_contact ?? "",
    notes: m.notes ?? "",
    is_active: d.is_active,
  };
}

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

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
