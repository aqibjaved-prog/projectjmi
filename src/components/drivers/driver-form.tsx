import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, User } from "lucide-react";
import { driverSchema, type DriverFormValues } from "@/lib/drivers";

export interface PortalAccountValues {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface DriverFormProps {
  defaultValues?: Partial<DriverFormValues>;
  submitting?: boolean;
  submitLabel?: string;
  existingPhotoUrl?: string | null;
  /** Portal-account mode: 'create' shows temp password; 'edit' shows reset + email change; 'none' hides the section. */
  accountMode?: "create" | "edit" | "none";
  /** For edit: existing linked account email if present. */
  linkedEmail?: string | null;
  /** For edit: whether the driver already has a linked auth account. */
  hasAccount?: boolean;
  onSubmit: (values: DriverFormValues, photoFile: File | null, account: PortalAccountValues | null) => void | Promise<void>;
}

const GENDERS = ["", "Male", "Female", "Other"];
const BLOOD_GROUPS = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function DriverForm({
  defaultValues, submitting, submitLabel = "Save driver", existingPhotoUrl,
  accountMode = "none", linkedEmail = null, hasAccount = false, onSubmit,
}: DriverFormProps) {
  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      first_name: defaultValues?.first_name ?? "",
      last_name: defaultValues?.last_name ?? "",
      phone: defaultValues?.phone ?? "",
      email: defaultValues?.email ?? "",
      date_of_birth: defaultValues?.date_of_birth ?? "",
      gender: defaultValues?.gender ?? "",
      blood_group: defaultValues?.blood_group ?? "",
      address: defaultValues?.address ?? "",
      city: defaultValues?.city ?? "",
      state: defaultValues?.state ?? "",
      pincode: defaultValues?.pincode ?? "",
      aadhaar_number: defaultValues?.aadhaar_number ?? "",
      license_number: defaultValues?.license_number ?? "",
      license_class: defaultValues?.license_class ?? "",
      license_issue_date: defaultValues?.license_issue_date ?? "",
      license_expiry: defaultValues?.license_expiry ?? "",
      experience_years: defaultValues?.experience_years ?? "",
      emergency_contact_name: defaultValues?.emergency_contact_name ?? "",
      emergency_contact_number: defaultValues?.emergency_contact_number ?? "",
      joining_date: defaultValues?.joining_date ?? "",
      notes: defaultValues?.notes ?? "",
      photo_url: defaultValues?.photo_url ?? "",
      is_active: defaultValues?.is_active ?? true,
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingPhotoUrl ?? null);
  const [acctEmail, setAcctEmail] = useState<string>(linkedEmail ?? defaultValues?.email ?? "");
  const [acctPw, setAcctPw] = useState("");
  const [acctPw2, setAcctPw2] = useState("");
  const [acctError, setAcctError] = useState<string | null>(null);

  useEffect(() => { setAcctEmail(linkedEmail ?? defaultValues?.email ?? ""); }, [linkedEmail, defaultValues?.email]);

  useEffect(() => {
    setPreviewUrl(existingPhotoUrl ?? null);
  }, [existingPhotoUrl]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      form.setError("photo_url", { message: "Photo must be under 5 MB" });
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(String(reader.result));
    reader.readAsDataURL(file);
    form.clearErrors("photo_url");
  };

  const handleFormSubmit = form.handleSubmit((v) => {
    setAcctError(null);
    let account: PortalAccountValues | null = null;
    if (accountMode === "create") {
      const wantsAccount = !!(acctEmail || acctPw || acctPw2);
      if (wantsAccount) {
        if (!acctEmail) return setAcctError("Email is required to create a login account.");
        if (acctPw.length < 8) return setAcctError("Password must be at least 8 characters.");
        if (acctPw !== acctPw2) return setAcctError("Passwords do not match.");
        account = { email: acctEmail, password: acctPw, confirmPassword: acctPw2 };
      }
    } else if (accountMode === "edit") {
      const emailChanged = hasAccount && acctEmail && acctEmail !== (linkedEmail ?? "");
      const wantsPassword = !!(acctPw || acctPw2);
      if (wantsPassword) {
        if (acctPw.length < 8) return setAcctError("New password must be at least 8 characters.");
        if (acctPw !== acctPw2) return setAcctError("Passwords do not match.");
      }
      if (!hasAccount) {
        const wantsAccount = !!(acctEmail || acctPw || acctPw2);
        if (wantsAccount) {
          if (!acctEmail) return setAcctError("Email is required to create a login account.");
          if (acctPw.length < 8) return setAcctError("Password must be at least 8 characters.");
          if (acctPw !== acctPw2) return setAcctError("Passwords do not match.");
          account = { email: acctEmail, password: acctPw, confirmPassword: acctPw2 };
        }
      } else if (emailChanged || wantsPassword) {
        account = { email: acctEmail, password: acctPw, confirmPassword: acctPw2 };
      }
    }
    return onSubmit(v, photoFile, account);
  });

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">

      <Section title="Profile">
        <div className="flex items-start gap-4">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-10 w-10" />
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> {previewUrl ? "Replace photo" : "Upload photo"}
            </Button>
            <p className="text-xs text-muted-foreground">PNG or JPG up to 5 MB.</p>
            {form.formState.errors.photo_url?.message && (
              <p className="text-xs text-destructive">{form.formState.errors.photo_url.message}</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Personal">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name *" error={form.formState.errors.first_name?.message}>
            <Input {...form.register("first_name")} />
          </Field>
          <Field label="Last name" error={form.formState.errors.last_name?.message}>
            <Input {...form.register("last_name")} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" {...form.register("date_of_birth")} />
          </Field>
          <Field label="Gender">
            <Select
              value={form.watch("gender") ?? ""}
              onValueChange={(v) => form.setValue("gender", v === "__none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Prefer not to say</SelectItem>
                {GENDERS.filter(Boolean).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Blood group">
            <Select
              value={form.watch("blood_group") ?? ""}
              onValueChange={(v) => form.setValue("blood_group", v === "__none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {BLOOD_GROUPS.filter(Boolean).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Aadhaar number" error={form.formState.errors.aadhaar_number?.message}>
            <Input inputMode="numeric" maxLength={12} placeholder="12-digit ID" {...form.register("aadhaar_number")} />
          </Field>
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone *" error={form.formState.errors.phone?.message}>
            <Input {...form.register("phone")} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register("email")} />
          </Field>
          <Field label="Address">
            <Textarea rows={2} {...form.register("address")} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="City"><Input {...form.register("city")} /></Field>
            <Field label="State"><Input {...form.register("state")} /></Field>
            <Field label="Pincode"><Input {...form.register("pincode")} /></Field>
          </div>
        </div>
      </Section>

      <Section title="License">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="License number">
            <Input {...form.register("license_number")} />
          </Field>
          <Field label="License class">
            <Input {...form.register("license_class")} placeholder="e.g. LMV / HMV" />
          </Field>
          <Field label="Issue date">
            <Input type="date" {...form.register("license_issue_date")} />
          </Field>
          <Field label="Expiry date">
            <Input type="date" {...form.register("license_expiry")} />
          </Field>
          <Field label="Experience (years)" error={form.formState.errors.experience_years?.message}>
            <Input type="number" min={0} step="0.5" {...form.register("experience_years")} />
          </Field>
        </div>
      </Section>

      <Section title="Emergency contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input {...form.register("emergency_contact_name")} />
          </Field>
          <Field label="Phone">
            <Input {...form.register("emergency_contact_number")} />
          </Field>
        </div>
      </Section>

      <Section title="Employment">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Joining date">
            <Input type="date" {...form.register("joining_date")} />
          </Field>
        </div>
      </Section>

      <Section title="Notes">
        <Textarea rows={3} {...form.register("notes")} placeholder="Any additional information about this driver." />
      </Section>

      {accountMode !== "none" && (
        <Section title="Portal access">
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            {accountMode === "create" && (
              <>Optional. Provide an email and temporary password to create a Driver Portal login. The driver can sign in immediately at <code>/auth</code>.</>
            )}
            {accountMode === "edit" && hasAccount && (
              <>This driver has a linked login ({linkedEmail ?? "unknown"}). Change the email to update it, or set a new password to reset it. Leave blank to keep unchanged.</>
            )}
            {accountMode === "edit" && !hasAccount && (
              <>No login account yet. Provide an email and temporary password to create one now.</>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={accountMode === "edit" && hasAccount ? "Login email" : "Email *"}>
              <Input
                type="email"
                value={acctEmail}
                onChange={(e) => setAcctEmail(e.target.value)}
                placeholder="driver@example.com"
                autoComplete="off"
              />
            </Field>
            <Field label={accountMode === "edit" && hasAccount ? "New password" : "Temporary password *"}>
              <Input
                type="password"
                value={acctPw}
                onChange={(e) => setAcctPw(e.target.value)}
                placeholder="Min 8 characters"
                autoComplete="new-password"
                minLength={8}
              />
            </Field>
            <Field label="Confirm password">
              <Input
                type="password"
                value={acctPw2}
                onChange={(e) => setAcctPw2(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </Field>
          </div>
          {acctError && <p className="text-xs text-destructive">{acctError}</p>}
        </Section>
      )}


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
