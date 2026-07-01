import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  School,
  Users,
  UserCog,
  Car,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Bell,
  TrendingUp,
  CalendarClock,
  XCircle,
} from "lucide-react";
import { expiryState, isExpiringThisMonth, monthlyAmountCents, type BillingCycle } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — School Van Guardian" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { primaryRole } = useAuth();
  if (primaryRole === "super_admin") return <SuperAdminDashboard />;
  if (primaryRole === "school_admin") return <SchoolAdminDashboard />;
  if (primaryRole === "driver") return <DriverDashboard />;
  return <ParentDashboard />;
}

// ---------- Super Admin ----------
function SuperAdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const [schools, active, suspended, students, drivers, vehicles, subs] = await Promise.all([
        supabase.from("schools").select("id", { count: "exact", head: true }),
        supabase.from("schools").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("schools").select("id", { count: "exact", head: true }).eq("status", "suspended"),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("drivers").select("id", { count: "exact", head: true }),
        supabase.from("vehicles").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("amount_cents,status,billing_cycle,current_period_end"),
      ]);
      type SubRow = { amount_cents: number; status: string; billing_cycle: BillingCycle; current_period_end: string | null };
      const allSubs = (subs.data ?? []) as SubRow[];
      const activeRows = allSubs.filter((s) => s.status === "active");
      const totalRevenue = activeRows.reduce((sum, s) => sum + (s.amount_cents ?? 0), 0);
      const mrr = activeRows.reduce((sum, s) => sum + monthlyAmountCents(s.amount_cents ?? 0, s.billing_cycle), 0);
      const expiringThisMonth = allSubs.filter((s) => s.status === "active" && isExpiringThisMonth(s.current_period_end)).length;
      const expired = allSubs.filter((s) => expiryState(s.current_period_end) === "expired").length;
      return {
        total: schools.count ?? 0,
        active: active.count ?? 0,
        suspended: suspended.count ?? 0,
        students: students.count ?? 0,
        drivers: drivers.count ?? 0,
        vehicles: vehicles.count ?? 0,
        totalRevenue,
        mrr,
        activeSubs: activeRows.length,
        expiringThisMonth,
        expired,
      };
    },
  });

  return (
    <>
      <PageHeader title="Platform overview" description="All schools across the tenant." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total schools" value={data?.total} icon={School} loading={isLoading} />
        <StatCard label="Active schools" value={data?.active} icon={CheckCircle2} loading={isLoading} tone="success" />
        <StatCard label="Suspended" value={data?.suspended} icon={AlertTriangle} loading={isLoading} tone="warning" />
        <StatCard label="Active subscriptions" value={data?.activeSubs} icon={CreditCard} loading={isLoading} />
        <StatCard
          label="Total revenue"
          value={data ? `$${(data.totalRevenue / 100).toLocaleString()}` : undefined}
          icon={TrendingUp}
          loading={isLoading}
          tone="success"
        />
        <StatCard
          label="MRR"
          value={data ? `$${(data.mrr / 100).toLocaleString()}` : undefined}
          icon={CreditCard}
          loading={isLoading}
          tone="success"
        />
        <StatCard label="Expiring this month" value={data?.expiringThisMonth} icon={CalendarClock} loading={isLoading} tone="warning" />
        <StatCard label="Expired" value={data?.expired} icon={XCircle} loading={isLoading} tone="warning" />
        <StatCard label="Total students" value={data?.students} icon={Users} loading={isLoading} />
        <StatCard label="Total drivers" value={data?.drivers} icon={UserCog} loading={isLoading} />
        <StatCard label="Total vehicles" value={data?.vehicles} icon={Car} loading={isLoading} />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild><a href="/schools">Manage schools</a></Button>
          <Button asChild variant="secondary"><a href="/subscriptions">View subscriptions</a></Button>
        </CardContent>
      </Card>
    </>
  );
}

// ---------- School Admin ----------
function SchoolAdminDashboard() {
  const { schoolId } = useAuth();
  const { data, isLoading } = useQuery({
    enabled: !!schoolId,
    queryKey: ["school-stats", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const today = new Date().toISOString().slice(0, 10);
      const [trips, pickups, drops, vehicles, activeVehicles, drivers, students, routes, parents, unreadNotifs] = await Promise.all([
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("trip_date", today),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("trip_date", today).eq("trip_type", "pickup"),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("trip_date", today).eq("trip_type", "drop"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        supabase.from("routes").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        supabase.from("parents").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_read", false),
      ]);
      return {
        trips: trips.count ?? 0,
        pickups: pickups.count ?? 0,
        drops: drops.count ?? 0,
        vehicles: vehicles.count ?? 0,
        activeVehicles: activeVehicles.count ?? 0,
        drivers: drivers.count ?? 0,
        students: students.count ?? 0,
        routes: routes.count ?? 0,
        parents: parents.count ?? 0,
        unreadNotifs: unreadNotifs.count ?? 0,
      };
    },
  });

  return (
    <>
      <PageHeader title="School dashboard" description="Today's activity across your fleet." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total students" value={data?.students} icon={Users} loading={isLoading} />
        <StatCard label="Total drivers" value={data?.drivers} icon={UserCog} loading={isLoading} />
        <StatCard label="Total parents" value={data?.parents} icon={Users} loading={isLoading} />
        <StatCard label="Total vehicles" value={data?.vehicles} icon={Car} loading={isLoading} />
        <StatCard label="Total routes" value={data?.routes} icon={MapPin} loading={isLoading} />
        <StatCard label="Today's trips" value={data?.trips} icon={Calendar} loading={isLoading} />
        <StatCard label="Today's pickups" value={data?.pickups} icon={MapPin} loading={isLoading} tone="success" />
        <StatCard label="Today's drops" value={data?.drops} icon={MapPin} loading={isLoading} />
        <StatCard label="Active vehicles" value={data?.activeVehicles} icon={Car} loading={isLoading} tone="success" />
        <StatCard label="Pending notifications" value={data?.unreadNotifs} icon={Bell} loading={isLoading} tone="warning" />
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild><a href="/students">Manage students</a></Button>
          <Button asChild variant="secondary"><a href="/drivers">Drivers</a></Button>
          <Button asChild variant="secondary"><a href="/vehicles">Vehicles</a></Button>
          <Button asChild variant="secondary"><a href="/routes">Routes</a></Button>
          <Button asChild variant="secondary"><a href="/reports">Reports</a></Button>
          <Button asChild variant="secondary"><a href="/school-settings">School settings</a></Button>
        </CardContent>
      </Card>
    </>
  );
}


// ---------- Driver ----------
function DriverDashboard() {
  return (
    <>
      <PageHeader title="Driver dashboard" description="Your trips for today." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today's trips" value={0} icon={Calendar} />
        <StatCard label="Students on route" value={0} icon={Users} />
        <StatCard label="Notifications" value={0} icon={Bell} />
      </div>
    </>
  );
}

// ---------- Parent ----------
function ParentDashboard() {
  return (
    <>
      <PageHeader title="Parent dashboard" description="Your children and today's trips." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Children" value={0} icon={Users} />
        <StatCard label="Today's trips" value={0} icon={Calendar} />
        <StatCard label="New alerts" value={0} icon={Bell} />
      </div>
    </>
  );
}
