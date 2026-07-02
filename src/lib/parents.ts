import { z } from "zod";

export interface ParentRow {
  id: string;
  school_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export const parentSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(150),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+()\-\s\d]{6,40}$/, "Invalid phone")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});

export type ParentFormValues = z.input<typeof parentSchema>;

export function parentToFormDefaults(p: ParentRow): ParentFormValues {
  return {
    full_name: p.full_name ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    address: p.address ?? "",
  };
}

export function splitParentPayload(v: ParentFormValues) {
  const t = (s?: string | null) => {
    const x = (s ?? "").trim();
    return x === "" ? null : x;
  };
  return {
    full_name: (v.full_name ?? "").trim() || "Unnamed",
    phone: t(v.phone),
    email: t(v.email),
    address: t(v.address),
  };
}
