import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, Power, Trash2, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SchoolForm } from "@/components/schools/school-form";
import {
  expiryState, formatPrice, periodEndFor,
  type Plan, type BillingCycle, type PaymentStatus, type SubscriptionStatus,
} from "@/lib/plans";

const searchSchema = z.object({ edit: z.coerce.number().optional() });

export const Route = createFileRoute("/_authenticated/schools/$schoolId")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "School details" }] }),
  component: SchoolDetailPage,
});

interface SubRow {
  id: string;
  plan_id: string | null;
  plan_name: string;
  billing_cycle: BillingCycle;
  status: SubscriptionStatus;
  payment_status: PaymentStatus;
  seats: number;
  amount_cents: number;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  renewal_date: string | null;
  subscription_plans?: { id: string; name: string; tier: string; price_cents: number; billing_cycle: BillingCycle } | null;
}

function SchoolDetailPage() {
  const { schoolId } = Route.useParams();
  const { edit } = Route.useSearch();
  const navigate = useNavigate();
  const { primaryRole } = useAuth();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(Boolean(edit));

  const { data, isLoading } = useQuery({
    queryKey: ["school", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("*, subscriptions(*, subscription_plans:plan_id(id, name, tier, price_cents, billing_cycle))")
        .eq("id", schoolId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["school-stats", schoolId],
    queryFn: async () => {
      const head = (table: "students" | "drivers" | "vehicles" | "routes") =>
        supabase.from(table).select("id", { count: "exact", head: true }).eq("school_id", schoolId);
      const [students, drivers, vehicles, routes] = await Promise.all([
        head("students"), head("drivers"), head("vehicles"), head("routes"),
      ]);
      return {
        students: students.count ?? 0,
        drivers: drivers.count ?? 0,
        vehicles: vehicles.count ?? 0,
        routes: routes.count ?? 0,
      };
    },
  });

  const update = useMutation({
    mutationFn: async (values: {
      name: string; contact_person?: string; email?: string; phone?: string;
      address?: string; city?: string; country?: string; logo_url?: string | null;
    }) => {
      const { error } = await supabase
        .from("schools")
        .update({
          name: values.name,
          contact_person: values.contact_person || null,
          email: values.email || null,
          phone: values.phone || null,
          address: values.address || null,
          city: values.city || null,
          country: values.country || null,
          logo_url: values.logo_url || null,
        })
        .eq("id", schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School updated");
      qc.invalidateQueries({ queryKey: ["school", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      setEditOpen(false);
      navigate({ to: "/schools/$schoolId", params: { schoolId }, search: {} });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleStatus = useMutation({
    mutationFn: async (status: "active" | "suspended") => {
      const { error } = await supabase.from("schools").update({ status }).eq("id", schoolId);
      if (error) throw error;
      // also reflect on the subscription
      await supabase
        .from("subscriptions")
        .update({ status: status === "suspended" ? "suspended" : "active" })
        .eq("school_id", schoolId);
    },
    onSuccess: (_d, s) => {
      toast.success(s === "active" ? "School activated" : "School suspended");
      qc.invalidateQueries({ queryKey: ["school", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("schools").delete().eq("id", schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School deleted");
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      navigate({ to: "/schools" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (primaryRole !== "super_admin") {
    return <EmptyState title="Not allowed" description="Only Super Admins can manage schools." />;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="School not found" description="It may have been deleted." />;
  }

  const subs = (data.subscriptions ?? []) as unknown as SubRow[];
  const sub = subs[0];
  const expiry = expiryState(sub?.current_period_end);

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/schools"><ArrowLeft className="mr-2 h-4 w-4" /> All schools</Link>
        </Button>
      </div>

      <PageHeader
        title={data.name}
        description={`School ID: ${data.id}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
            {data.status === "active" ? (
              <Button variant="outline" onClick={() => toggleStatus.mutate("suspended")}>
                <Power className="mr-2 h-4 w-4" /> Suspend
              </Button>
            ) : (
              <Button variant="outline" onClick={() => toggleStatus.mutate("active")}>
                <Power className="mr-2 h-4 w-4" /> Activate
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => { if (confirm(`Delete ${data.name}? This removes ALL of its data.`)) remove.mutate(); }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </>
        }
      />

      {(expiry === "expiring_soon" || expiry === "expired") && sub?.current_period_end && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${expiry === "expired" ? "border-destructive/50 bg-destructive/5 text-destructive" : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"}`}>
          <AlertTriangle className="h-4 w-4" />
          {expiry === "expired"
            ? `Subscription expired on ${new Date(sub.current_period_end).toLocaleDateString()}.`
            : `Subscription renews on ${new Date(sub.current_period_end).toLocaleDateString()} — within 7 days.`}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg border bg-muted text-sm">
                {data.logo_url ? <img src={data.logo_url} alt="" className="h-full w-full object-cover" /> : data.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Detail label="Status">
                  <Badge variant={data.status === "active" ? "default" : data.status === "suspended" ? "destructive" : "secondary"} className="capitalize">
                    {data.status}
                  </Badge>
                </Detail>
                <Detail label="Contact person">{data.contact_person ?? "—"}</Detail>
                <Detail label="Email">{data.email ?? "—"}</Detail>
                <Detail label="Phone">{data.phone ?? "—"}</Detail>
                <Detail label="City">{data.city ?? "—"}</Detail>
                <Detail label="Country">{data.country ?? "—"}</Detail>
                <Detail label="Address" full>{data.address ?? "—"}</Detail>
                <Detail label="Plan">{sub?.subscription_plans?.name ?? sub?.plan_name ?? "—"}</Detail>
                <Detail label="Billing cycle"><span className="capitalize">{sub?.billing_cycle ?? "—"}</span></Detail>
                <Detail label="Subscription status">
                  {sub ? <Badge variant="outline" className="capitalize">{sub.status}</Badge> : "—"}
                </Detail>
                <Detail label="Payment status">
                  {sub ? (
                    <Badge
                      variant={sub.payment_status === "paid" ? "default" : sub.payment_status === "overdue" ? "destructive" : "secondary"}
                      className="capitalize"
                    >
                      {sub.payment_status}
                    </Badge>
                  ) : "—"}
                </Detail>
                <Detail label="Start date">{sub?.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : "—"}</Detail>
                <Detail label="End date">{sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}</Detail>
                <Detail label="Renewal date">{sub?.renewal_date ? new Date(sub.renewal_date).toLocaleDateString() : "—"}</Detail>
                <Detail label="Created">{new Date(data.created_at).toLocaleString()}</Detail>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Students" value={stats?.students} />
              <Stat label="Drivers" value={stats?.drivers} />
              <Stat label="Vehicles" value={stats?.vehicles} />
              <Stat label="Routes" value={stats?.routes} />
            </div>
          </CardContent>
        </Card>

        <SubscriptionPanel schoolId={schoolId} sub={sub} />
      </div>

      <SubscriptionHistory schoolId={schoolId} />

      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) navigate({ to: "/schools/$schoolId", params: { schoolId }, search: {} });
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit school</DialogTitle></DialogHeader>
          <SchoolForm
            submitLabel="Save changes"
            submitting={update.isPending}
            defaultValues={{
              id: data.id,
              name: data.name,
              contact_person: data.contact_person ?? "",
              email: data.email ?? "",
              phone: data.phone ?? "",
              address: data.address ?? "",
              city: data.city ?? "",
              country: data.country ?? "",
              logo_url: data.logo_url,
            }}
            onSubmit={(v) => update.mutate(v)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value ?? "—"}</div>
    </div>
  );
}

function Detail({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function SubscriptionPanel({ schoolId, sub }: { schoolId: string; sub: SubRow | undefined }) {
  const qc = useQueryClient();

  const { data: plans } = useQuery({
    queryKey: ["plans-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
  });

  const [planId, setPlanId] = useState<string>(sub?.plan_id ?? "");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(sub?.payment_status ?? "pending");
  const [start, setStart] = useState(sub?.current_period_start?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));

  const selectedPlan = useMemo(() => plans?.find((p) => p.id === planId), [plans, planId]);

  const computedEnd = useMemo(() => {
    if (!selectedPlan) return sub?.current_period_end?.slice(0, 10) ?? "";
    return periodEndFor(new Date(start), selectedPlan.billing_cycle, selectedPlan.duration_days)
      .toISOString().slice(0, 10);
  }, [selectedPlan, start, sub?.current_period_end]);

  const [end, setEnd] = useState(sub?.current_period_end?.slice(0, 10) ?? "");
  const effectiveEnd = end || computedEnd;

  const assign = useMutation({
    mutationFn: async (action: "assign" | "renew") => {
      const plan = selectedPlan ?? plans?.find((p) => p.id === sub?.plan_id);
      if (!plan) throw new Error("Pick a plan first");
      const startDate = action === "renew" && sub?.current_period_end
        ? new Date(sub.current_period_end)
        : new Date(start);
      const endDate = periodEndFor(startDate, plan.billing_cycle, plan.duration_days);
      const fromTier = sub?.subscription_plans?.tier ?? null;
      const toTier = plan.tier;
      let actionLabel: string = action;
      if (action === "assign" && sub) {
        const order = ["trial", "basic", "standard", "premium"];
        const fromIdx = fromTier ? order.indexOf(fromTier) : -1;
        const toIdx = order.indexOf(toTier);
        if (toIdx > fromIdx) actionLabel = "upgraded";
        else if (toIdx < fromIdx) actionLabel = "downgraded";
        else actionLabel = "updated";
      } else if (action === "assign") {
        actionLabel = "created";
      } else {
        actionLabel = "renewed";
      }
      const status: SubscriptionStatus = plan.tier === "trial" ? "trialing" : "active";
      const payload = {
        school_id: schoolId,
        plan_id: plan.id,
        plan_name: plan.code,
        billing_cycle: plan.billing_cycle,
        status,
        payment_status: paymentStatus,
        seats: plan.student_limit ?? 0,
        amount_cents: plan.price_cents,
        currency: plan.currency,
        current_period_start: startDate.toISOString(),
        current_period_end: endDate.toISOString(),
        renewal_date: endDate.toISOString(),
      };
      if (sub) {
        const { error } = await supabase.from("subscriptions").update(payload).eq("id", sub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").insert(payload);
        if (error) throw error;
      }
      await supabase.from("subscription_history").insert({
        school_id: schoolId,
        subscription_id: sub?.id ?? null,
        from_plan: sub?.plan_name ?? null,
        to_plan: plan.code,
        from_cycle: sub?.billing_cycle ?? null,
        to_cycle: plan.billing_cycle,
        action: actionLabel,
        amount_cents: plan.price_cents,
        currency: plan.currency,
        period_start: startDate.toISOString(),
        period_end: endDate.toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Subscription saved");
      qc.invalidateQueries({ queryKey: ["school", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
      qc.invalidateQueries({ queryKey: ["sub-history", schoolId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Subscription
          {sub && <Badge variant="outline" className="capitalize">{sub.status}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Select value={planId} onValueChange={(v) => { setPlanId(v); setEnd(""); }}>
            <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
            <SelectContent>
              {plans?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {formatPrice(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Starts on</Label>
            <Input type="date" value={start} onChange={(e) => { setStart(e.target.value); setEnd(""); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Ends on</Label>
            <Input type="date" value={effectiveEnd} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Payment status</Label>
          <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => assign.mutate("assign")} disabled={assign.isPending || !planId} className="flex-1">
            {assign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sub ? "Change plan" : "Assign plan"}
          </Button>
          {sub && (
            <Button variant="outline" onClick={() => assign.mutate("renew")} disabled={assign.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" /> Renew
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionHistory({ schoolId }: { schoolId: string }) {
  const { data } = useQuery({
    queryKey: ["sub-history", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_history")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader><CardTitle>Subscription history</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>From → To</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="text-sm">{new Date(h.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{h.action}</Badge></TableCell>
                <TableCell className="text-sm">
                  {h.from_plan ? <span className="text-muted-foreground">{h.from_plan} → </span> : null}
                  <span className="font-medium">{h.to_plan ?? "—"}</span>
                </TableCell>
                <TableCell className="text-sm">
                  {h.period_start ? new Date(h.period_start).toLocaleDateString() : "—"}
                  {" – "}
                  {h.period_end ? new Date(h.period_end).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.currency} {(h.amount_cents / 100).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
