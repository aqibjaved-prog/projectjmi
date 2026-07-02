import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useMyDriver, useDriverTrips, useDriverStudents, useDriverNotifications, patchDriverTrip,
} from "@/lib/driver-portal";
import { tripStatusLabel, tripTypeLabel, makeEvent } from "@/lib/trips";
import { AlertTriangle, Bell, Bus, Calendar, CheckCircle2, MapPin, Play, Route as RouteIcon, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/driver/dashboard")({
  head: () => ({ meta: [{ title: "Driver — Dashboard" }] }),
  component: DriverDashboardPage,
});

function DriverDashboardPage() {
  const { data: driver, isLoading: dLoading } = useMyDriver();
  const { data: trips, isLoading: tLoading } = useDriverTrips();
  const { data: students } = useDriverStudents();
  const { data: notifs } = useDriverNotifications();

  const active = useMemo(() => trips?.find((t) => t.status === "in_progress" || t.status === "paused") ?? null, [trips]);
  const completed = trips?.filter((t) => t.status === "completed").length ?? 0;
  const upcoming = trips?.filter((t) => t.status === "scheduled" || t.status === "ready").length ?? 0;

  if (dLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <EmptyState
        title="No driver profile linked"
        description="Your account is not linked to a driver record. Please contact your school administrator."
      />
    );
  }

  const vehicleReg = active?.vehicles?.registration_number ?? "—";
  const routeName = active?.routes?.name ?? trips?.[0]?.routes?.name ?? "—";

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={driver.metadata?.photo_path ? undefined : undefined} />
              <AvatarFallback className="text-lg">{driver.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="text-xl font-semibold leading-tight">{driver.full_name}</div>
              <div className="text-sm text-muted-foreground">{driver.phone ?? "No phone on file"}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="secondary">Driver</Badge>
                {driver.is_active ? <Badge variant="outline" className="border-emerald-400 text-emerald-700">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg"><Link to="/driver/today"><Calendar className="mr-2 h-4 w-4" /> Today's Trip</Link></Button>
            <SosButton activeTripId={active?.id ?? null} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Bus} label="Vehicle" value={vehicleReg} sub={active?.vehicles?.vehicle_code ?? undefined} />
        <StatCard icon={RouteIcon} label="Route" value={routeName} sub={active?.routes?.route_code ?? undefined} />
        <StatCard icon={Users} label="Students today" value={String(students?.length ?? 0)} />
        <StatCard icon={CheckCircle2} label="Completed / Upcoming" value={`${completed} / ${upcoming}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Today's trips</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {tLoading ? <Skeleton className="h-16 w-full" /> : (trips ?? []).length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No trips scheduled for today.</div>
            ) : (
              trips!.map((t) => (
                <Link key={t.id} to="/driver/trip/$tripId" params={{ tripId: t.id }} className="block">
                  <div className="flex items-center justify-between rounded-md border p-3 hover:bg-muted">
                    <div>
                      <div className="font-medium">{t.name ?? t.routes?.name ?? "Trip"}</div>
                      <div className="text-xs text-muted-foreground">{tripTypeLabel(t.trip_type)} · {t.expected_start_time ?? "—"} → {t.expected_end_time ?? "—"}</div>
                    </div>
                    <Badge variant="outline">{tripStatusLabel(t.status)}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(notifs ?? []).length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No new notifications.</div>
            ) : (
              (notifs ?? []).slice(0, 5).map((n: any) => (
                <div key={n.id} className="rounded-md border p-3">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-[10px] uppercase text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))
            )}
            <div className="text-right"><Button size="sm" variant="link" asChild><Link to="/notifications">View all</Link></Button></div>
          </CardContent>
        </Card>
      </div>

      {active && (
        <Card className="border-emerald-500/50">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-500" /> Live trip in progress</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="font-medium">{active.name ?? active.routes?.name}</div>
              <div className="text-xs text-muted-foreground">Started at {active.started_at ? new Date(active.started_at).toLocaleTimeString() : "—"}</div>
            </div>
            <Button asChild><Link to="/driver/trip/$tripId" params={{ tripId: active.id }}><Play className="mr-2 h-4 w-4" /> Open trip</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-muted"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="truncate font-medium">{value}</div>
          {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function SosButton({ activeTripId }: { activeTripId: string | null }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const sos = useMutation({
    mutationFn: async () => {
      if (!activeTripId) return;
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: cur, error: e2 } = await supabase
        .from("trips").select("timeline").eq("id", activeTripId).single();
      if (e2) throw e2;
      const timeline = Array.isArray((cur as any).timeline) ? (cur as any).timeline : [];
      timeline.push(makeEvent("driver.sos", "🚨 Driver SOS raised"));
      await patchDriverTrip(activeTripId, { timeline });
    },
    onSuccess: () => {
      toast.success("SOS recorded. Your school will be notified.");
      qc.invalidateQueries({ queryKey: ["driver-portal"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to raise SOS"),
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="lg" variant="destructive"><AlertTriangle className="mr-2 h-5 w-5" /> SOS</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Raise emergency SOS?</AlertDialogTitle>
          <AlertDialogDescription>
            {activeTripId
              ? "This will log an emergency event on your current trip. Notification delivery to school admin will be enabled in the next module."
              : "You have no live trip. SOS can only be raised while a trip is in progress."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!activeTripId || sos.isPending} onClick={(e) => { e.preventDefault(); sos.mutate(); }}>
            Confirm SOS
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
