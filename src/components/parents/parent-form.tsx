import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { parentSchema, type ParentFormValues } from "@/lib/parents";

export interface ParentAccountValues {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface ParentFormProps {
  defaultValues?: Partial<ParentFormValues>;
  submitting?: boolean;
  submitLabel?: string;
  accountMode?: "create" | "edit" | "none";
  linkedEmail?: string | null;
  hasAccount?: boolean;
  onSubmit: (values: ParentFormValues, account: ParentAccountValues | null) => void | Promise<void>;
}

export function ParentForm({
  defaultValues, submitting, submitLabel = "Save parent",
  accountMode = "none", linkedEmail = null, hasAccount = false, onSubmit,
}: ParentFormProps) {
  const form = useForm<ParentFormValues>({
    resolver: zodResolver(parentSchema),
    defaultValues: {
      full_name: defaultValues?.full_name ?? "",
      phone: defaultValues?.phone ?? "",
      email: defaultValues?.email ?? "",
      address: defaultValues?.address ?? "",
    },
  });

  const [acctEmail, setAcctEmail] = useState<string>(linkedEmail ?? defaultValues?.email ?? "");
  const [acctPw, setAcctPw] = useState("");
  const [acctPw2, setAcctPw2] = useState("");
  const [acctError, setAcctError] = useState<string | null>(null);

  useEffect(() => { setAcctEmail(linkedEmail ?? defaultValues?.email ?? ""); }, [linkedEmail, defaultValues?.email]);

  const submit = form.handleSubmit((v) => {
    setAcctError(null);
    let account: ParentAccountValues | null = null;
    if (accountMode === "create") {
      const wants = !!(acctEmail || acctPw || acctPw2);
      if (wants) {
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
        const wants = !!(acctEmail || acctPw || acctPw2);
        if (wants) {
          if (!acctEmail) return setAcctError("Email is required to create a login account.");
          if (acctPw.length < 8) return setAcctError("Password must be at least 8 characters.");
          if (acctPw !== acctPw2) return setAcctError("Passwords do not match.");
          account = { email: acctEmail, password: acctPw, confirmPassword: acctPw2 };
        }
      } else if (emailChanged || wantsPassword) {
        account = { email: acctEmail, password: acctPw, confirmPassword: acctPw2 };
      }
    }
    return onSubmit(v, account);
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="Parent details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" error={form.formState.errors.full_name?.message}>
            <Input {...form.register("full_name")} />
          </Field>
          <Field label="Phone" error={form.formState.errors.phone?.message}>
            <Input {...form.register("phone")} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register("email")} />
          </Field>
          <Field label="Address">
            <Textarea rows={2} {...form.register("address")} />
          </Field>
        </div>
      </Section>

      {accountMode !== "none" && (
        <Section title="Portal access">
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            {accountMode === "create" && (
              <>Optional. Provide an email and temporary password to create a Parent Portal login. The parent can sign in immediately at <code>/auth</code>.</>
            )}
            {accountMode === "edit" && hasAccount && (
              <>This parent has a linked login ({linkedEmail ?? "unknown"}). Change the email to update it, or set a new password to reset it. Leave blank to keep unchanged.</>
            )}
            {accountMode === "edit" && !hasAccount && (
              <>No login account yet. Provide an email and temporary password to create one now.</>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={accountMode === "edit" && hasAccount ? "Login email" : "Email *"}>
              <Input type="email" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} placeholder="parent@example.com" autoComplete="off" />
            </Field>
            <Field label={accountMode === "edit" && hasAccount ? "New password" : "Temporary password *"}>
              <Input type="password" value={acctPw} onChange={(e) => setAcctPw(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" minLength={8} />
            </Field>
            <Field label="Confirm password">
              <Input type="password" value={acctPw2} onChange={(e) => setAcctPw2(e.target.value)} autoComplete="new-password" minLength={8} />
            </Field>
          </div>
          {acctError && <p className="text-xs text-destructive">{acctError}</p>}
        </Section>
      )}

      <div className="flex justify-end border-t pt-4">
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
