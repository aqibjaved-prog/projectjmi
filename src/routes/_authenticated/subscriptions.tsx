import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CreditCard, TrendingUp, CheckCircle2, CalendarClock, XCircle } from "lucide-react";
import {
  expiryState, isExpiringThisMonth, monthlyAmountCents,
  type BillingCycle, type PaymentStatus, type SubscriptionStatus,
} from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions" }] }),
  component: SubsPage,
});

interface SubRow {
  id: string;
  status: SubscriptionStatus;
  payment_status: PaymentStatus;
  billing_cycle: BillingCycle;
  amount_cents: number;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  renewal_date: string | null;
  plan_name: string;
  schools: { id: string; name: string } | null;
  subscription_plans: { name: string; tier: string } | null;
}

function SubsPage() {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, schools(id, name), subscription_plans:plan_id(name, tier)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SubRow[];
    },
  });

  const rows = data ?? [];
  const metrics = useMemo(() => {
    const activeRows = rows.filter((s) => s.status === "active");
    const totalRevenue = activeRows.reduce((sum, s) => sum + (s.amount_cents ?? 0), 0);
    const mrr = activeRows.reduce((sum, s) => sum + monthlyAmountCents(s.amount_cents ?? 0, s.billing_cycle), 0);
    const expiringThisMonth = rows.filter((s) => s.status === "active" && isExpiringThisMonth(s.current_period_end)).length;
    const expired = rows.filter((s) => expiryState(s.current_period_end) === "expired").length;
    return {
      totalRevenue, mrr,
      activeCount: activeRows.length,
      expiringThisMonth, expired,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (s && !(r.schools?.name ?? "").toLowerCase().includes(s)) return false;
      if (planFilter !== "all" && r.subscription_plans?.tier !== planFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "expiring") {
          if (expiryState(r.current_period_end) !== "expiring_soon") return false;
        } else if (statusFilter === "expired") {
          if (expiryState(r.current_period_end) !== "expired") return false;
        } else if (r.status !== statusFilter) return false;
      }
      return true;
    });
  }, [rows, search, planFilter, statusFilter]);

  return (
    <>
      <PageHeader title="Subscriptions" description="Revenue, billing status, and renewal alerts." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total revenue (active)"
          value={isLoading ? undefined : `$${(metrics.totalRevenue / 100).toLocaleString()}`}
          icon={TrendingUp}
          loading={isLoading}
          tone="success"
        />
        <StatCard
          label="MRR"
          value={isLoading ? undefined : `$${(metrics.mrr / 100).toLocaleString()}`}
          icon={CreditCard}
          loading={isLoading}
        />
        <StatCard label="Active subscriptions" value={metrics.activeCount} icon={CheckCircle2} loading={isLoading} />
        <StatCard label="Expiring this month" value={metrics.expiringThisMonth} icon={CalendarClock} loading={isLoading} tone="warning" />
        <StatCard label="Expired" value={metrics.expired} icon={XCircle} loading={isLoading} tone="warning" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b p-3">
            <Input
              placeholder="Search by school…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="expiring">Expiring within 7 days</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              {filtered.length} subscription{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No subscriptions"
                description={rows.length ? "Try a different filter." : "Subscriptions appear here once schools have plans."}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Renews</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const expiry = expiryState(s.current_period_end);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.schools?.id ? (
                          <Link to="/schools/$schoolId" params={{ schoolId: s.schools.id }} className="hover:underline">
                            {s.schools.name}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {s.subscription_plans?.name ?? s.plan_name}
                      </TableCell>
                      <TableCell className="capitalize">{s.billing_cycle}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : s.status === "suspended" ? "destructive" : "secondary"} className="capitalize">
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.payment_status === "paid" ? "default" : s.payment_status === "overdue" ? "destructive" : "secondary"}
                          className="capitalize"
                        >
                          {s.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.current_period_end ? (
                          <span className={`inline-flex items-center gap-1 ${expiry === "expired" ? "text-destructive" : expiry === "expiring_soon" ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {(expiry === "expired" || expiry === "expiring_soon") && <AlertTriangle className="h-3.5 w-3.5" />}
                            {new Date(s.current_period_end).toLocaleDateString()}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.currency} {(s.amount_cents / 100).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
