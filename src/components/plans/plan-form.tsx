import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  planSchema, TIERS, FEATURE_KEYS, FEATURE_LABELS,
  type PlanFormValues, type Plan,
} from "@/lib/plans";

interface Props {
  defaultValues?: Partial<Plan>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: PlanFormValues) => void;
}

export function PlanForm({ defaultValues, submitLabel, submitting, onSubmit }: Props) {
  const [v, setV] = useState<PlanFormValues>(() => ({
    code: defaultValues?.code ?? "",
    name: defaultValues?.name ?? "",
    tier: (defaultValues?.tier as PlanFormValues["tier"]) ?? "basic",
    billing_cycle: (defaultValues?.billing_cycle as PlanFormValues["billing_cycle"]) ?? "monthly",
    price_cents: defaultValues?.price_cents ?? 0,
    currency: defaultValues?.currency ?? "USD",
    student_limit: defaultValues?.student_limit ?? 100,
    vehicle_limit: defaultValues?.vehicle_limit ?? 10,
    duration_days: defaultValues?.duration_days ?? null,
    is_active: defaultValues?.is_active ?? true,
    features: ((defaultValues?.features as Record<string, boolean>) ?? {}),
  }));

  const update = <K extends keyof PlanFormValues>(k: K, val: PlanFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const toggleFeature = (k: string, val: boolean) =>
    setV((p) => ({ ...p, features: { ...p.features, [k]: val } }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = planSchema.safeParse(v);
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Invalid plan");
          return;
        }
        onSubmit(parsed.data);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Code</Label>
          <Input value={v.code} onChange={(e) => update("code", e.target.value)} placeholder="basic_monthly" required />
        </div>
        <div className="space-y-1.5">
          <Label>Display name</Label>
          <Input value={v.name} onChange={(e) => update("name", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Tier</Label>
          <Select value={v.tier} onValueChange={(x) => update("tier", x as PlanFormValues["tier"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Billing cycle</Label>
          <Select value={v.billing_cycle} onValueChange={(x) => update("billing_cycle", x as PlanFormValues["billing_cycle"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Price (cents)</Label>
          <Input type="number" min={0} value={v.price_cents} onChange={(e) => update("price_cents", Number(e.target.value))} />
          <div className="text-xs text-muted-foreground">{v.currency} {(v.price_cents / 100).toFixed(2)}</div>
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Input value={v.currency} onChange={(e) => update("currency", e.target.value.toUpperCase())} maxLength={6} />
        </div>
        <div className="space-y-1.5">
          <Label>Student limit</Label>
          <Input
            type="number" min={0}
            value={v.student_limit ?? ""}
            onChange={(e) => update("student_limit", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="Unlimited"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Vehicle limit</Label>
          <Input
            type="number" min={0}
            value={v.vehicle_limit ?? ""}
            onChange={(e) => update("vehicle_limit", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="Unlimited"
          />
        </div>
        {v.billing_cycle === "trial" && (
          <div className="space-y-1.5">
            <Label>Trial duration (days)</Label>
            <Input
              type="number" min={1}
              value={v.duration_days ?? 30}
              onChange={(e) => update("duration_days", Number(e.target.value))}
            />
          </div>
        )}
        <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
          <div>
            <Label className="text-sm">Plan is active</Label>
            <p className="text-xs text-muted-foreground">Inactive plans cannot be assigned to schools.</p>
          </div>
          <Switch checked={v.is_active} onCheckedChange={(x) => update("is_active", x)} />
        </div>
      </div>

      <div className="rounded-md border p-3">
        <Label className="text-sm">Features</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {FEATURE_KEYS.map((k) => (
            <label key={k} className="flex cursor-pointer items-center justify-between rounded border p-2 text-sm">
              <span>{FEATURE_LABELS[k]}</span>
              <Switch checked={!!v.features[k]} onCheckedChange={(x) => toggleFeature(k, x)} />
            </label>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
