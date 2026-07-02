import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDriverTrips, patchDriverTrip } from "@/lib/driver-portal";
import { tripStatusLabel, tripTypeLabel, makeEvent, type TripRow } from "@/lib/trips";
import { assertVehicleAvailableForTrip } from "@/lib/vehicles";
import { CheckCircle2, Pause, Play, Square, Timer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/driver/today")({
  head: () => ({ meta: [{ title: "Today's Trip" }] }),
  component: TodayPage,
});

function TodayPage() {
  const { data: trips, isLoading } = useDriverTrips();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const active = useMemo(() => trips?.find((t) => t.status === "in_progress" || t.status === "paused") ?? null, [trips]);
  const next = useMemo(() => trips?.find((t) => t.status === "scheduled" || t.status === "ready") ?? null, [trips]);
  const featured = active ?? next ?? trips?.[0] ?? null;

  const start = useMutation({
    mutationFn: async (trip: TripRow) => {
      const timeline = [...trip.timeline, makeEvent("trip.started", "Driver started the trip")];
      const snapshot = {
        ...(trip.snapshot ?? {}),
        locked_at: new Date().toISOString(),
        driver_id: trip.driver_id,
        vehicle_id: trip.vehicle_id,
        route_id: trip.route_id,
      } as any;
      return patchDriverTrip(trip.id, {
        status: "in_progress",
        started_at: new Date().toISOString(),
        timeline,
        snapshot,
      });
    },
    onSuccess: (t) => {
      toast.success("Trip started");
      qc.invalidateQueries({ queryKey: ["driver-portal"] });
      navigate({ to: "/driver/trip/$tripId", params: { tripId: t.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const pause = useMutation({
    mutationFn: async (trip: TripRow) => patchDriverTrip(trip.id, { status: "paused", timeline: [...trip.timeline, makeEvent("trip.paused", "Driver paused the trip")] }),
    onSuccess: () => { toast.success("Trip paused"); qc.invalidateQueries({ queryKey: ["driver-portal"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const resume = useMutation({
    mutationFn: async (trip: TripRow) => patchDriverTrip(trip.id, { status: "in_progress", timeline: [...trip.timeline, makeEvent("trip.resumed", "Driver resumed the trip")] }),
    onSuccess: () => { toast.success("Trip resumed"); qc.invalidateQueries({ queryKey: ["driver-portal"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const end = useMutation({
    mutationFn: async (trip: TripRow) => patchDriverTrip(trip.id, {
      status: "completed",
      ended_at: new Date().toISOString(),
      timeline: [...trip.timeline, makeEvent("trip.completed", "Driver ended the trip")],
    }),
    onSuccess: () => { toast.success("Trip ended"); qc.invalidateQueries({ queryKey: ["driver-portal"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Today's trip" description={`Assigned trips for ${new Date().toLocaleDateString()}.`} />

      {isLoading ? <Skeleton className="h-48 w-full" /> : !featured ? (
        <EmptyState title="No trips assigned today" description="Trips assigned by your school admin will appear here." />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{featured.name ?? featured.routes?.name ?? "Trip"}</CardTitle>
            <Badge variant="outline">{tripStatusLabel(featured.status)}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Trip type" value={tripTypeLabel(featured.trip_type)} />
              <Field label="Route" value={featured.routes?.name ?? "—"} sub={featured.routes?.route_code ?? undefined} />
              <Field label="Vehicle" value={featured.vehicles?.registration_number ?? "—"} sub={featured.vehicles?.vehicle_code ?? undefined} />
              <Field label="Trip code" value={featured.trip_code ?? "—"} />
              <Field label="Start" value={featured.expected_start_time ?? "—"} />
              <Field label="Expected end" value={featured.expected_end_time ?? "—"} />
              <Field label="Started" value={featured.started_at ? new Date(featured.started_at).toLocaleTimeString() : "—"} />
              <Field label="Stops" value={String(featured.stop_progress.length)} />
            </div>

            <div className="flex flex-wrap gap-2">
              {(featured.status === "scheduled" || featured.status === "ready") && (
                <Button size="lg" onClick={() => { if (confirm("Start this trip? Driver, vehicle, and route will be locked.")) start.mutate(featured); }} disabled={start.isPending}>
                  <Play className="mr-2 h-5 w-5" /> Start trip
                </Button>
              )}
              {featured.status === "in_progress" && (
                <>
                  <Button size="lg" asChild>
                    <Link to="/driver/trip/$tripId" params={{ tripId: featured.id }}><Timer className="mr-2 h-5 w-5" /> Open live trip</Link>
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => pause.mutate(featured)}><Pause className="mr-2 h-5 w-5" /> Pause</Button>
                  <Button size="lg" variant="destructive" onClick={() => { if (confirm("End this trip? This cannot be undone.")) end.mutate(featured); }}>
                    <Square className="mr-2 h-5 w-5" /> End trip
                  </Button>
                </>
              )}
              {featured.status === "paused" && (
                <>
                  <Button size="lg" onClick={() => resume.mutate(featured)}><Play className="mr-2 h-5 w-5" /> Resume</Button>
                  <Button size="lg" variant="destructive" onClick={() => { if (confirm("End this trip?")) end.mutate(featured); }}>
                    <Square className="mr-2 h-5 w-5" /> End trip
                  </Button>
                </>
              )}
              {featured.status === "completed" && (
                <Badge variant="secondary"><CheckCircle2 className="mr-1 h-4 w-4" /> Completed</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {trips && trips.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">All today's trips</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {trips.map((t) => (
              <Link key={t.id} to="/driver/trip/$tripId" params={{ tripId: t.id }} className="block">
                <div className="flex items-center justify-between rounded-md border p-3 hover:bg-muted">
                  <div>
                    <div className="font-medium">{t.name ?? t.routes?.name}</div>
                    <div className="text-xs text-muted-foreground">{tripTypeLabel(t.trip_type)} · {t.expected_start_time ?? "—"}</div>
                  </div>
                  <Badge variant="outline">{tripStatusLabel(t.status)}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
