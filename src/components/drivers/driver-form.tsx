import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { driverSchema, type DriverFormValues } from "@/lib/drivers";

export interface DriverFormProps {
  defaultValues?: Partial<DriverFormValues>;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: DriverFormValues) => void | Promise<void>;
}

export function DriverForm({ defaultValues, submitting, submitLabel = "Save driver", onSubmit }: DriverFormProps) {
  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      full_name: defaultValues?.full_name ?? "",
      phone: defaultValues?.phone ?? "",
      email: defaultValues?.email ?? "",
      license_number: defaultValues?.license_number ?? "",
      license_class: defaultValues?.license_class ?? "",
      license_issue_date: defaultValues?.license_issue_date ?? "",
      license_expiry: defaultValues?.license_expiry ?? "",
      date_of_birth: defaultValues?.date_of_birth ?? "",
      address: defaultValues?.address ?? "",
      emergency_contact: defaultValues?.emergency_contact ?? "",
      notes: defaultValues?.notes ?? "",
      is_active: defaultValues?.is_active ?? true,
    },
  });

  return (
    <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="space-y-5">
      <Section title="General">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" error={form.formState.errors.full_name?.message}>
            <Input {...form.register("full_name")} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" {...form.register("date_of_birth")} />
          </Field>
          <Field label="Phone" error={form.formState.errors.phone?.message}>
            <Input {...form.register("phone")} placeholder="+1 555 123 4567" />
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register("email")} />
          </Field>
          <Field label="Address">
            <Textarea rows={2} {...form.register("address")} />
          </Field>
          <Field label="Emergency contact">
            <Input {...form.register("emergency_contact")} />
          </Field>
        </div>
      </Section>

      <Section title="License">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="License number">
            <Input {...form.register("license_number")} />
          </Field>
          <Field label="License class">
            <Input {...form.register("license_class")} placeholder="e.g. Class D / CDL-B" />
          </Field>
          <Field label="Issue date">
            <Input type="date" {...form.register("license_issue_date")} />
          </Field>
          <Field label="Expiry date">
            <Input type="date" {...form.register("license_expiry")} />
          </Field>
        </div>
      </Section>

      <Section title="Notes">
        <Textarea rows={3} {...form.register("notes")} placeholder="Any additional information about this driver." />
      </Section>

      <div className="flex items-center justify-between border-t pt-4">
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={form.watch("is_active") ?? true}
            onCheckedChange={(v) => form.setValue("is_active", v)}
          />
          Active
        </label>
        <Button type="submit" disabled={submitting}>
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
