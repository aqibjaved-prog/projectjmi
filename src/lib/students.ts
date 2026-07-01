import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import QRCode from "qrcode";

export const GENDERS = ["male", "female", "other"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const studentSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z.string().trim().max(80).optional().or(z.literal("")),
  admission_number: z.string().trim().max(60).optional().or(z.literal("")),
  roll_number: z.string().trim().max(60).optional().or(z.literal("")),
  date_of_birth: z.string().max(20).optional().or(z.literal("")),
  gender: z.enum([...GENDERS, ""] as [string, ...string[]]).optional(),
  blood_group: z.string().max(6).optional().or(z.literal("")),
  grade: z.string().trim().max(30).optional().or(z.literal("")),
  class_section: z.string().trim().max(30).optional().or(z.literal("")),
  parent_name: z.string().trim().max(120).optional().or(z.literal("")),
  parent_phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+()\-\s\d]{0,40}$/, "Invalid phone")
    .optional()
    .or(z.literal("")),
  parent_email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  emergency_contact: z.string().trim().max(120).optional().or(z.literal("")),
  pickup_address: z.string().trim().max(500).optional().or(z.literal("")),
  drop_address: z.string().trim().max(500).optional().or(z.literal("")),
  pickup_lat: z.coerce.number().gte(-90).lte(90).optional().nullable(),
  pickup_lng: z.coerce.number().gte(-180).lte(180).optional().nullable(),
  drop_lat: z.coerce.number().gte(-90).lte(90).optional().nullable(),
  drop_lng: z.coerce.number().gte(-180).lte(180).optional().nullable(),
  route_id: z.string().uuid().optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
});

export type StudentFormValues = z.infer<typeof studentSchema>;

export interface StudentRow {
  id: string;
  school_id: string;
  student_code: string | null;
  admission_number: string | null;
  roll_number: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  grade: string | null;
  class_section: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  emergency_contact: string | null;
  pickup_address: string | null;
  drop_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_lat: number | null;
  drop_lng: number | null;
  route_id: string | null;
  vehicle_id: string | null;
  qr_code: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function uploadStudentPhoto(schoolId: string, studentId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${schoolId}/${studentId}/photo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("student-photos").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = await supabase.storage.from("student-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? path;
}

export async function makeQRDataUrl(text: string, size = 256): Promise<string> {
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: "M" });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function printQR(dataUrl: string, title: string) {
  const w = window.open("", "_blank", "width=420,height=520");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>body{font-family:system-ui;text-align:center;padding:24px}img{width:280px;height:280px}</style>
    </head><body><h2>${title}</h2><img src="${dataUrl}" /><script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}</script></body></html>`);
  w.document.close();
}

export function cleanNullable<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = v === "" ? null : v;
  return out as T;
}
