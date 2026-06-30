import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload } from "lucide-react";
import { schoolSchema, type SchoolFormValues, uploadSchoolLogo } from "@/lib/schools";
import { toast } from "sonner";

export interface SchoolFormProps {
  defaultValues?: Partial<SchoolFormValues> & { logo_url?: string | null; id?: string };
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: SchoolFormValues & { logo_url?: string | null }) => void | Promise<void>;
}

export function SchoolForm({ defaultValues, submitting, submitLabel = "Save", onSubmit }: SchoolFormProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(defaultValues?.logo_url ?? null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      contact_person: defaultValues?.contact_person ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      address: defaultValues?.address ?? "",
      city: defaultValues?.city ?? "",
      country: defaultValues?.country ?? "",
    },
  });

  const handleLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadSchoolLogo(defaultValues?.id ?? "new", file);
      setLogoUrl(url);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit((v) => onSubmit({ ...v, logo_url: logoUrl }))}
      className="space-y-4"
    >
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg border bg-muted">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">No logo</span>
          )}
        </div>
        <div>
          <Label htmlFor="logo" className="cursor-pointer">
            <div className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-accent">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload logo"}
            </div>
          </Label>
          <input id="logo" type="file" accept="image/*" className="hidden" onChange={handleLogo} />
          <p className="mt-1 text-xs text-muted-foreground">PNG/JPG, up to 2MB.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="School name" error={form.formState.errors.name?.message}>
          <Input {...form.register("name")} />
        </Field>
        <Field label="Contact person" error={form.formState.errors.contact_person?.message}>
          <Input {...form.register("contact_person")} />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" {...form.register("email")} />
        </Field>
        <Field label="Phone number" error={form.formState.errors.phone?.message}>
          <Input {...form.register("phone")} />
        </Field>
        <Field label="City" error={form.formState.errors.city?.message}>
          <Input {...form.register("city")} />
        </Field>
        <Field label="Country" error={form.formState.errors.country?.message}>
          <Input {...form.register("country")} />
        </Field>
      </div>
      <Field label="Address" error={form.formState.errors.address?.message}>
        <Textarea rows={2} {...form.register("address")} />
      </Field>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={submitting || uploading}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
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
