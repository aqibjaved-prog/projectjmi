import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  studentSchema,
  type StudentFormValues,
  uploadStudentPhoto,
  GENDERS,
  BLOOD_GROUPS,
} from "@/lib/students";
import { fetchVehicleOccupancy } from "@/lib/vehicles";

export interface StudentFormProps {
  schoolId: string;
  studentId?: string;
  defaultValues?: Partial<StudentFormValues> & { photo_url?: string | null };
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: StudentFormValues & { photo_url?: string | null }) => void | Promise<void>;
}

export function StudentForm({
  schoolId,
  studentId,
  defaultValues,
  submitting,
  submitLabel = "Save student",
  onSubmit,
}: StudentFormProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(defaultValues?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      first_name: defaultValues?.first_name ?? "",
      last_name: defaultValues?.last_name ?? "",
      admission_number: defaultValues?.admission_number ?? "",
      roll_number: defaultValues?.roll_number ?? "",
      date_of_birth: defaultValues?.date_of_birth ?? "",
      gender: defaultValues?.gender ?? "",
      blood_group: defaultValues?.blood_group ?? "",
      grade: defaultValues?.grade ?? "",
      class_section: defaultValues?.class_section ?? "",
      parent_name: defaultValues?.parent_name ?? "",
      parent_phone: defaultValues?.parent_phone ?? "",
      parent_email: defaultValues?.parent_email ?? "",
      emergency_contact: defaultValues?.emergency_contact ?? "",
      pickup_address: defaultValues?.pickup_address ?? "",
      drop_address: defaultValues?.drop_address ?? "",
      pickup_lat: defaultValues?.pickup_lat ?? null,
      pickup_lng: defaultValues?.pickup_lng ?? null,
      drop_lat: defaultValues?.drop_lat ?? null,
      drop_lng: defaultValues?.drop_lng ?? null,
      route_id: defaultValues?.route_id ?? null,
      vehicle_id: defaultValues?.vehicle_id ?? null,
      is_active: defaultValues?.is_active ?? true,
    },
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-for-school", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("routes")
        .select("id,name")
        .eq("school_id", schoolId)
        .order("name");
      return data ?? [];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-for-school", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("vehicles")
        .select("id,registration_number,model,capacity")
        .eq("school_id", schoolId)
        .order("registration_number");
      return data ?? [];
    },
  });

  const { data: occupancy } = useQuery({
    queryKey: ["vehicle-occupancy", schoolId],
    queryFn: () => fetchVehicleOccupancy(schoolId),
  });

  const currentVehicleId = form.watch("vehicle_id") ?? null;

  const handlePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Photo must be under 3MB");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadStudentPhoto(schoolId, studentId ?? "new", file);
      setPhotoUrl(url);
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFormSubmit = form.handleSubmit((v) => {
    // Frontend capacity guard (backend trigger also enforces).
    if (v.is_active !== false && v.vehicle_id && v.vehicle_id !== defaultValues?.vehicle_id) {
      const occ = occupancy?.get(v.vehicle_id);
      if (occ && occ.available <= 0) {
        toast.error("This vehicle has reached its maximum seating capacity.");
        return;
      }
    }
    onSubmit({ ...v, photo_url: photoUrl });
  });

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5">

      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border bg-muted">
          {photoUrl ? (
            <img src={photoUrl} alt="Photo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">No photo</span>
          )}
        </div>
        <div>
          <Label htmlFor="student-photo" className="cursor-pointer">
            <div className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-accent">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload photo"}
            </div>
          </Label>
          <input
            id="student-photo"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />
          <p className="mt-1 text-xs text-muted-foreground">JPG/PNG, up to 3MB.</p>
        </div>
      </div>

      <Section title="General">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name *" error={form.formState.errors.first_name?.message}>
            <Input {...form.register("first_name")} />
          </Field>
          <Field label="Last name" error={form.formState.errors.last_name?.message}>
            <Input {...form.register("last_name")} />
          </Field>
          <Field label="Admission number" error={form.formState.errors.admission_number?.message}>
            <Input {...form.register("admission_number")} />
          </Field>
          <Field label="Roll number" error={form.formState.errors.roll_number?.message}>
            <Input {...form.register("roll_number")} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" {...form.register("date_of_birth")} />
          </Field>
          <Field label="Gender">
            <Select
              value={form.watch("gender") ?? ""}
              onValueChange={(v) => form.setValue("gender", v === "unset" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                {GENDERS.map((g) => (
                  <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Blood group">
            <Select
              value={form.watch("blood_group") ?? ""}
              onValueChange={(v) => form.setValue("blood_group", v === "unset" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                {BLOOD_GROUPS.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class / Grade">
            <Input {...form.register("grade")} placeholder="e.g. Grade 5" />
          </Field>
          <Field label="Section">
            <Input {...form.register("class_section")} placeholder="e.g. A" />
          </Field>
        </div>
      </Section>

      <Section title="Parent & emergency">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parent name">
            <Input {...form.register("parent_name")} />
          </Field>
          <Field label="Parent phone" error={form.formState.errors.parent_phone?.message}>
            <Input {...form.register("parent_phone")} placeholder="+1 555 123 4567" />
          </Field>
          <Field label="Parent email" error={form.formState.errors.parent_email?.message}>
            <Input type="email" {...form.register("parent_email")} />
          </Field>
          <Field label="Emergency contact">
            <Input {...form.register("emergency_contact")} />
          </Field>
        </div>
      </Section>

      <Section title="Transport">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pickup address">
            <Textarea rows={2} {...form.register("pickup_address")} />
          </Field>
          <Field label="Drop address">
            <Textarea rows={2} {...form.register("drop_address")} />
          </Field>
          <Field label="Pickup lat">
            <Input type="number" step="any" {...form.register("pickup_lat")} />
          </Field>
          <Field label="Pickup lng">
            <Input type="number" step="any" {...form.register("pickup_lng")} />
          </Field>
          <Field label="Drop lat">
            <Input type="number" step="any" {...form.register("drop_lat")} />
          </Field>
          <Field label="Drop lng">
            <Input type="number" step="any" {...form.register("drop_lng")} />
          </Field>
          <Field label="Assigned route">
            {(routes ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
                No routes available. Please create a route first.
              </p>
            ) : (
              <Select
                value={form.watch("route_id") ?? "none"}
                onValueChange={(v) => form.setValue("route_id", v === "none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="No route" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No route —</SelectItem>
                  {(routes ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Assigned vehicle">
            {(vehicles ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
                No vehicles available. Please add a vehicle first.
              </p>
            ) : (
              <>
                <Select
                  value={form.watch("vehicle_id") ?? "none"}
                  onValueChange={(v) => form.setValue("vehicle_id", v === "none" ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="No vehicle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No vehicle —</SelectItem>
                    {(vehicles ?? []).map((v) => {
                      const occ = occupancy?.get(v.id);
                      const cap = occ?.capacity ?? v.capacity ?? 0;
                      const used = occ?.occupied ?? 0;
                      const isCurrent = v.id === currentVehicleId;
                      const isFull = !isCurrent && occ ? occ.available <= 0 : false;
                      return (
                        <SelectItem key={v.id} value={v.id} disabled={isFull}>
                          {v.registration_number}{v.model ? ` — ${v.model}` : ""} · Occupied {used} / {cap}{isFull ? " (full)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {currentVehicleId && occupancy?.get(currentVehicleId) && (
                  <p className="text-xs text-muted-foreground">
                    Current: Occupied {occupancy.get(currentVehicleId)!.occupied} / {occupancy.get(currentVehicleId)!.capacity} · Available {occupancy.get(currentVehicleId)!.available}
                  </p>
                )}
              </>
            )}
          </Field>

        </div>
      </Section>

      <div className="flex items-center justify-between border-t pt-4">
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={form.watch("is_active") ?? true}
            onCheckedChange={(v) => form.setValue("is_active", v)}
          />
          Active
        </label>
        <Button type="submit" disabled={submitting || uploading}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
