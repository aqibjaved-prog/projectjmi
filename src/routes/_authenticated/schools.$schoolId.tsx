import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Pencil, Power, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SchoolForm } from "@/components/schools/school-form";
import { SUBSCRIPTION_PLANS, planFor, subscriptionExpiry } from "@/lib/schools";

const searchSchema = z.object({
  edit: z.coerce.number().optional(),
});

export const Route = createFileRoute("/_authenticated/schools/$schoolId")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "School details" }] }),
  component: SchoolDetailPage,
});

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
        .select("*, subscriptions(*)")
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
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["school", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
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

  const subs = (data.subscriptions ?? []) as SubRow[];
  const sub = subs[0];
  const expiry = subscriptionExpiry(sub?.current_period_end);

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

      {expiry === "expiring_soon" || expiry === "expired" ? (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${expiry === "expired" ? "border-destructive/50 bg-destructive/5 text-destructive" : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"}`}>
          <AlertTriangle className="h-4 w-4" />
          {expiry === "expired"
            ? `Subscription expired on ${new Date(sub!.current_period_end!).toLocaleDateString()}.`
            : `Subscription renews on ${new Date(sub!.current_period_end!).toLocaleDateString()} — renew soon.`}
        </div>
      ) : null}

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
                <Detail label="Subscription plan">{sub ? planFor(sub.plan_name).name : "—"}</Detail>
                <Detail label="Subscription status">
                  {sub ? <Badge variant="outline" className="capitalize">{sub.status}</Badge> : "—"}
                </Detail>
                <Detail label="Start date">{sub?.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : "—"}</Detail>
                <Detail label="End date">{sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}</Detail>
                <Detail label="Created">{new Date(data.created_at).toLocaleString()}</Detail>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Students" value={stats?.students} />
              <Stat label="Drivers" value={stats?.drivers} />
              <Stat label="Vehicles" value={stats?.vehicles} />
              <Stat label="Routes" value={stats?.routes} />
          </CardContent>
        </Card>

        <SubscriptionPanel schoolId={schoolId} sub={sub} />
      </div>

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

function Detail({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

interface SubRow {
  id: string;
  plan_name: string;
  status: string;
  seats: number;
  amount_cents: number;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
}

function SubscriptionPanel({ schoolId, sub }: { schoolId: string; sub: SubRow | undefined }) {
  const qc = useQueryClient();
  const [planId, setPlanId] = useState(sub?.plan_name ?? "trial");
  const [start, setStart] = useState(sub?.current_period_start?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const defaultEnd = sub?.current_period_end?.slice(0, 10) ?? (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10);
  })();
  const [end, setEnd] = useState(defaultEnd);

  const save = useMutation({
    mutationFn: async () => {
      const plan = planFor(planId);
      const payload = {
        school_id: schoolId,
        plan_name: plan.id,
        status: "active" as const,
        seats: plan.seats,
        amount_cents: plan.amountCents,
        currency: "USD",
        current_period_start: new Date(start).toISOString(),
        current_period_end: new Date(end).toISOString(),
      };
      if (sub) {
        const { error } = await supabase.from("subscriptions").update(payload).eq("id", sub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["school", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!sub) return;
      const { error } = await supabase.from("subscriptions").update({ status: "canceled" }).eq("id", sub.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subscription canceled");
      qc.invalidateQueries({ queryKey: ["school", schoolId] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
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
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_PLANS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {p.amountCents === 0 ? "Free" : `$${(p.amountCents / 100).toFixed(0)}/mo`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Starts on</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ends on</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sub ? "Update plan" : "Create subscription"}
          </Button>
          {sub && sub.status !== "canceled" && (
            <Button variant="outline" onClick={() => cancel.mutate()}>Cancel</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
