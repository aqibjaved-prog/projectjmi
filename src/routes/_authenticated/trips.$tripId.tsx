import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Play, Pause, CheckCircle2, XCircle, Clock, MapPin, User, Car, Route as RouteIcon,
  Pencil, Users, Gauge, Navigation, Fuel, ShieldCheck, RefreshCcw, Download, Flag,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  normalizeTrip, tripStatusLabel, tripTypeLabel, tripFormToPayload, delayMinutes, delayLabel,
  type TripRow, type TripStopProgress, type TripFormValues, type TripLiveLocation,
} from "@/lib/trips";
import { TripForm } from "@/components/trips/trip-form";
import { isGoogleMapsConfigured, loadGoogleMaps } from "@/lib/google-maps-loader";

const searchSchema = z.object({ edit: z.coerce.number().optional(), start: z.coerce.number().optional() });

export const Route = createFileRoute("/_authenticated/trips/$tripId")({
  head: () => ({ meta: [{ title: "Trip — School Van Guardian" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: TripDetailPage,
});

function TripDetailPage() {
  const { tripId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { primaryRole, schoolId } = useAuth();
  const qc = useQueryClient();

  const canManage = primaryRole === "school_admin" || primaryRole === "super_admin";
  const [editOpen, setEditOpen] = useState(Boolean(search.edit));
  const [tab, setTab] = useState("overview");

  const { data: trip, isLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("trips" as never) as unknown as {
        select: (s: string) => { eq: (k: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } };
      }).select("*, routes:route_id(id,name,route_code,stops,total_distance,estimated_duration,start_lat,start_lng,end_lat,end_lng,starting_point,ending_point,route_color), drivers:driver_id(id,full_name,phone), vehicles:vehicle_id(id,registration_number,vehicle_code,capacity,color,insurance_expiry,fitness_expiry,metadata,status), schools:school_id(id,name,logo_url)")
        .eq("id", tripId).maybeSingle();
      if (error) throw error as Error;
      return data ? (normalizeTrip(data as Record<string, unknown>) as TripDetailRow) : null;
    },
    refetchInterval: (q) => {
      const d = q.state.data as TripDetailRow | null | undefined;
      return d && d.status === "in_progress" ? 5000 : false;
    },
  });

  const { data: assignedStudents } = useQuery({
    enabled: !!trip?.route_id,
    queryKey: ["trip-students", trip?.route_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id,full_name,student_code,pickup_address,parent_phone")
        .eq("route_id", trip!.route_id)
        .eq("is_active", true)
        .order("full_name");
      return (data ?? []) as Array<{ id: string; full_name: string; student_code: string | null; pickup_address: string | null; parent_phone: string | null }>;
    },
  });

  const { data: routes } = useQuery({
    enabled: editOpen && !!(trip?.school_id ?? schoolId),
    queryKey: ["routes-lite", trip?.school_id ?? schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("routes")
        .select("id,name,route_code,driver_id,vehicle_id,pickup_start_time,drop_start_time")
        .eq("school_id", trip?.school_id ?? schoolId!).eq("is_active", true).order("name");
      return (data ?? []) as Array<{ id: string; name: string; route_code: string | null; driver_id: string | null; vehicle_id: string | null; pickup_start_time: string | null; drop_start_time: string | null }>;
    },
  });

  const { data: drivers } = useQuery({
    enabled: editOpen && !!(trip?.school_id ?? schoolId),
    queryKey: ["drivers-lite", trip?.school_id ?? schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("id,full_name")
        .eq("school_id", trip?.school_id ?? schoolId!).eq("is_active", true).order("full_name");
      return (data ?? []) as Array<{ id: string; full_name: string }>;
    },
  });

  const { data: vehicles } = useQuery({
    enabled: editOpen && !!(trip?.school_id ?? schoolId),
    queryKey: ["vehicles-lite", trip?.school_id ?? schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("vehicles").select("id,registration_number,vehicle_code,status")
        .eq("school_id", trip?.school_id ?? schoolId!).order("registration_number");
      return (data ?? []) as Array<{ id: string; registration_number: string; vehicle_code: string | null; status: string }>;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trip", tripId] });
    qc.invalidateQueries({ queryKey: ["trips-list"] });
  };

  const patchTrip = async (patch: Record<string, unknown>) => {
    const { error } = await (supabase.from("trips" as never) as unknown as {
      update: (p: unknown) => { eq: (k: string, v: unknown) => Promise<{ error: unknown }> };
    }).update(patch).eq("id", tripId);
    if (error) throw error as Error;
  };

  const startTrip = useMutation({
    mutationFn: async () => {
      if (!trip) throw new Error("Trip not loaded");
      const snapshot = {
        route_name: trip.routes?.name ?? null,
        driver_name: trip.drivers?.full_name ?? null,
        vehicle_registration: trip.vehicles?.registration_number ?? null,
        vehicle_capacity: trip.vehicles?.capacity ?? null,
        student_ids: (assignedStudents ?? []).map((s) => s.id),
        student_count: (assignedStudents ?? []).length,
        locked_at: new Date().toISOString(),
      };
      const timeline = [...trip.timeline, {
        id: crypto.randomUUID(), event_type: "trip.started",
        message: "Trip started", at: new Date().toISOString(),
      }];
      await patchTrip({
        status: "in_progress",
        started_at: new Date().toISOString(),
        snapshot,
        timeline,
      });
    },
    onSuccess: () => { toast.success("Trip started — student list, driver, vehicle and route locked."); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const pauseTrip = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      const timeline = [...trip.timeline, { id: crypto.randomUUID(), event_type: "trip.paused", message: "Trip paused", at: new Date().toISOString() }];
      await patchTrip({ status: "paused", timeline });
    },
    onSuccess: () => { toast.success("Trip paused"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resumeTrip = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      const timeline = [...trip.timeline, { id: crypto.randomUUID(), event_type: "trip.resumed", message: "Trip resumed", at: new Date().toISOString() }];
      await patchTrip({ status: "in_progress", timeline });
    },
    onSuccess: () => { toast.success("Trip resumed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const completeTrip = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      const timeline = [...trip.timeline, { id: crypto.randomUUID(), event_type: "trip.completed", message: "Trip completed", at: new Date().toISOString() }];
      await patchTrip({ status: "completed", ended_at: new Date().toISOString(), timeline });
    },
    onSuccess: () => { toast.success("Trip completed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const cancelTrip = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      const timeline = [...trip.timeline, { id: crypto.randomUUID(), event_type: "trip.canceled", message: "Trip cancelled", at: new Date().toISOString() }];
      await patchTrip({ status: "canceled", canceled_at: new Date().toISOString(), timeline });
    },
    onSuccess: () => { toast.success("Trip cancelled"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const markStop = useMutation({
    mutationFn: async ({ stopId, action, boarded, missing }: { stopId: string; action: "arrive" | "depart"; boarded?: number; missing?: number }) => {
      if (!trip) return;
      const now = new Date().toISOString();
      const nextStops: TripStopProgress[] = trip.stop_progress.map((s) => {
        if (s.stop_id !== stopId) return s;
        if (action === "arrive") return { ...s, actual_arrival: now, status: "reached", students_boarded: boarded ?? s.students_boarded, students_missing: missing ?? s.students_missing };
        return { ...s, actual_departure: now, status: "departed", students_boarded: boarded ?? s.students_boarded, students_missing: missing ?? s.students_missing };
      });
      const stop = nextStops.find((s) => s.stop_id === stopId);
      const timeline = [...trip.timeline, {
        id: crypto.randomUUID(),
        event_type: action === "arrive" ? "stop.reached" : "stop.departed",
        message: action === "arrive" ? `Reached ${stop?.name}` : `Departed ${stop?.name}`,
        at: now,
      }];
      await patchTrip({ stop_progress: nextStops, timeline });
    },
    onSuccess: () => { toast.success("Stop updated"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const mockGps = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      // Pick the next pending stop as a fake current position, else route start.
      const nextStop = trip.stop_progress.find((s) => s.status !== "departed" && s.lat != null && s.lng != null);
      const base = nextStop ?? (trip.routes?.start_lat != null ? { lat: trip.routes.start_lat, lng: trip.routes.start_lng } : null);
      if (!base?.lat || !base?.lng) throw new Error("No coordinates available on route to mock GPS.");
      const jitter = () => (Math.random() - 0.5) * 0.001;
      const loc: TripLiveLocation = {
        lat: Number(base.lat) + jitter(),
        lng: Number(base.lng) + jitter(),
        speed_kmh: Math.round(20 + Math.random() * 25),
        heading: Math.round(Math.random() * 360),
        recorded_at: new Date().toISOString(),
      };
      await patchTrip({ live_location: loc });
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const editTrip = useMutation({
    mutationFn: async (values: TripFormValues) => {
      await patchTrip(tripFormToPayload(values));
    },
    onSuccess: () => { toast.success("Trip updated"); setEditOpen(false); invalidate(); navigate({ to: "/trips/$tripId", params: { tripId }, search: {} }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Auto-start dialog trigger
  useEffect(() => {
    if (search.start && trip && (trip.status === "scheduled" || trip.status === "ready")) {
      if (confirm("Start this trip now? Student list, driver, vehicle and route will be locked.")) {
        startTrip.mutate();
      }
      navigate({ to: "/trips/$tripId", params: { tripId }, search: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.start, trip?.id]);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-64" /></div>;
  if (!trip) return <EmptyState title="Trip not found" description="This trip may have been deleted or you don't have access." />;

  const live = trip.status === "in_progress" || trip.status === "paused";
  const distanceKm = Number(trip.routes?.total_distance ?? 0);
  const durationMin = Number(trip.routes?.estimated_duration ?? 0);

  return (
    <>
      <PageHeader
        title={trip.name ?? trip.trip_code ?? "Trip"}
        description={`${tripTypeLabel(trip.trip_type)} · ${trip.trip_date} · ${trip.trip_code ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild><Link to="/trips"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link></Button>
            {canManage && trip.status === "scheduled" && (
              <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
            )}
            {canManage && (trip.status === "scheduled" || trip.status === "ready") && (
              <Button onClick={() => { if (confirm("Start trip? Student list, driver, vehicle and route will be locked.")) startTrip.mutate(); }} disabled={startTrip.isPending}>
                <Play className="mr-2 h-4 w-4" /> Start trip
              </Button>
            )}
            {canManage && trip.status === "in_progress" && (
              <>
                <Button variant="outline" onClick={() => pauseTrip.mutate()}><Pause className="mr-2 h-4 w-4" /> Pause</Button>
                <Button onClick={() => { if (confirm("Complete this trip?")) completeTrip.mutate(); }}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Complete
                </Button>
              </>
            )}
            {canManage && trip.status === "paused" && (
              <Button onClick={() => resumeTrip.mutate()}><Play className="mr-2 h-4 w-4" /> Resume</Button>
            )}
            {canManage && trip.status !== "completed" && trip.status !== "canceled" && (
              <Button variant="destructive" onClick={() => { if (confirm("Cancel trip?")) cancelTrip.mutate(); }}>
                <XCircle className="mr-2 h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard icon={Flag} label="Status" value={<TripStatusPill status={trip.status} />} />
        <InfoCard icon={RouteIcon} label="Route" value={trip.routes?.name ?? "—"} sub={trip.routes?.route_code ?? undefined} />
        <InfoCard icon={User} label="Driver" value={trip.drivers?.full_name ?? "Unassigned"} sub={trip.drivers?.phone ?? undefined} />
        <InfoCard icon={Car} label="Vehicle" value={trip.vehicles ? (trip.vehicles.vehicle_code ?? trip.vehicles.registration_number) : "Unassigned"} sub={trip.vehicles?.registration_number ?? undefined} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="map">Live map</TabsTrigger>
          <TabsTrigger value="stops">Stops</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
              <Field label="Trip type" value={tripTypeLabel(trip.trip_type)} />
              <Field label="Date" value={trip.trip_date} />
              <Field label="Expected start" value={trip.expected_start_time ?? "—"} />
              <Field label="Expected end" value={trip.expected_end_time ?? "—"} />
              <Field label="Actual start" value={fmtDT(trip.started_at)} />
              <Field label="Actual end" value={fmtDT(trip.ended_at)} />
              <Field label="Distance" value={distanceKm ? `${distanceKm} km` : "—"} />
              <Field label="Estimated duration" value={durationMin ? `${durationMin} min` : "—"} />
              <Field label="Total stops" value={String(trip.stop_progress.length)} />
            </CardContent>
          </Card>
          {trip.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{trip.notes}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="map">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Live map</CardTitle>
              {live && canManage && (
                <Button size="sm" variant="outline" onClick={() => mockGps.mutate()}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Simulate GPS ping
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <TripLiveMap trip={trip} />
              {trip.live_location && (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                  <Field label="Position" value={`${trip.live_location.lat.toFixed(5)}, ${trip.live_location.lng.toFixed(5)}`} />
                  <Field label="Speed" value={trip.live_location.speed_kmh != null ? `${trip.live_location.speed_kmh} km/h` : "—"} icon={Gauge} />
                  <Field label="Heading" value={trip.live_location.heading != null ? `${trip.live_location.heading}°` : "—"} icon={Navigation} />
                  <Field label="Updated" value={fmtDT(trip.live_location.recorded_at)} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stops">
          <StopTable trip={trip} canManage={canManage} onArrive={(id) => markStop.mutate({ stopId: id, action: "arrive" })} onDepart={(id) => markStop.mutate({ stopId: id, action: "depart" })} onCounts={(id, boarded, missing) => markStop.mutate({ stopId: id, action: "depart", boarded, missing })} />
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle className="text-base">Trip timeline</CardTitle></CardHeader>
            <CardContent>
              {trip.timeline.length === 0 ? (
                <EmptyState title="No events yet" description="Timeline updates as the trip progresses." />
              ) : (
                <ol className="relative border-l pl-4">
                  {[...trip.timeline].reverse().map((e) => (
                    <li key={e.id} className="mb-4">
                      <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-primary" />
                      <div className="text-sm font-medium">{e.message}</div>
                      <div className="text-xs text-muted-foreground">{fmtDT(e.at)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Students {trip.snapshot?.locked_at ? <Badge variant="outline">Locked at start</Badge> : null}</CardTitle></CardHeader>
            <CardContent>
              {(assignedStudents ?? []).length === 0 ? (
                <EmptyState title="No students on this route" description="Assign students to the route to populate this list." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Pickup address</TableHead>
                      <TableHead>Parent phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(assignedStudents ?? []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.student_code ?? "—"}</TableCell>
                        <TableCell>{s.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.pickup_address ?? "—"}</TableCell>
                        <TableCell>{s.parent_phone ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vehicle">
          <VehicleHealth trip={trip} occupied={(assignedStudents ?? []).length} />
        </TabsContent>

        <TabsContent value="report">
          <TripReport trip={trip} assigned={(assignedStudents ?? []).length} />
        </TabsContent>
      </Tabs>

      {canManage && (
        <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) navigate({ to: "/trips/$tripId", params: { tripId }, search: {} }); }}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit trip</DialogTitle>
              <DialogDescription className="sr-only">Update trip details. Some fields lock after the trip starts.</DialogDescription>
            </DialogHeader>
            <TripForm
              defaultValues={{
                name: trip.name ?? "",
                trip_type: trip.trip_type,
                trip_date: trip.trip_date,
                expected_start_time: trip.expected_start_time ?? "",
                expected_end_time: trip.expected_end_time ?? "",
                route_id: trip.route_id,
                driver_id: trip.driver_id,
                vehicle_id: trip.vehicle_id,
                notes: trip.notes ?? "",
              }}
              routes={routes ?? []}
              drivers={drivers ?? []}
              vehicles={vehicles ?? []}
              submitting={editTrip.isPending}
              submitLabel="Save changes"
              onSubmit={(v) => editTrip.mutate(v)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* -------------------- helpers -------------------- */

interface TripDetailRow extends TripRow {
  routes?: {
    id: string; name: string; route_code: string | null; stops: unknown;
    total_distance: number | null; estimated_duration: number | null;
    start_lat: number | null; start_lng: number | null; end_lat: number | null; end_lng: number | null;
    starting_point: string | null; ending_point: string | null; route_color: string | null;
  } | null;
  drivers?: { id: string; full_name: string; phone: string | null } | null;
  vehicles?: {
    id: string; registration_number: string; vehicle_code: string | null; capacity: number;
    color: string | null; insurance_expiry: string | null; fitness_expiry: string | null;
    metadata: Record<string, unknown> | null; status: string;
  } | null;
  schools?: { id: string; name: string; logo_url: string | null } | null;
}

function InfoCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: string }) {
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

function Field({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function TripStatusPill({ status }: { status: TripRow["status"] }) {
  const map: Record<string, string> = {
    scheduled: "bg-muted text-muted-foreground",
    ready: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    in_progress: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    paused: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
    completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    canceled: "bg-destructive/15 text-destructive",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map.scheduled}`}>{tripStatusLabel(status)}</span>;
}

function fmtDT(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/* -------------------- Stops -------------------- */

function StopTable({
  trip, canManage, onArrive, onDepart, onCounts,
}: {
  trip: TripDetailRow;
  canManage: boolean;
  onArrive: (id: string) => void;
  onDepart: (id: string) => void;
  onCounts: (id: string, boarded: number, missing: number) => void;
}) {
  const stops = trip.stop_progress ?? [];
  const active = trip.status === "in_progress";
  if (stops.length === 0) return <EmptyState title="No stops" description="This route has no stops configured." />;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Stops</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Stop</TableHead>
              <TableHead>Sched. arrival</TableHead>
              <TableHead>Actual arrival</TableHead>
              <TableHead>Sched. departure</TableHead>
              <TableHead>Actual departure</TableHead>
              <TableHead>Delay</TableHead>
              <TableHead>Boarded / Missing</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-[220px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {stops.map((s, i) => {
              const d = delayMinutes(s.scheduled_arrival, s.actual_arrival, trip.trip_date);
              const dl = delayLabel(d);
              return (
                <TableRow key={s.stop_id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.scheduled_arrival ?? "—"}</TableCell>
                  <TableCell>{fmtDT(s.actual_arrival)}</TableCell>
                  <TableCell>{s.scheduled_departure ?? "—"}</TableCell>
                  <TableCell>{fmtDT(s.actual_departure)}</TableCell>
                  <TableCell>
                    <Badge variant={dl.tone === "destructive" ? "destructive" : "outline"}>{dl.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{s.students_boarded ?? 0} / {s.students_missing ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{s.status ?? "pending"}</Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {active && !s.actual_arrival && (
                          <Button size="sm" variant="outline" onClick={() => onArrive(s.stop_id)}>Arrive</Button>
                        )}
                        {active && s.actual_arrival && !s.actual_departure && (
                          <StopDepartInline
                            initialBoarded={s.students_boarded ?? 0}
                            initialMissing={s.students_missing ?? 0}
                            onDepart={(b, m) => onCounts(s.stop_id, b, m)}
                          />
                        )}
                        {active && s.actual_arrival && s.actual_departure && (
                          <Badge variant="secondary">Done</Badge>
                        )}
                        {!active && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StopDepartInline({ initialBoarded, initialMissing, onDepart }: { initialBoarded: number; initialMissing: number; onDepart: (b: number, m: number) => void }) {
  const [b, setB] = useState(initialBoarded);
  const [m, setM] = useState(initialMissing);
  return (
    <div className="flex items-center gap-1">
      <Input className="h-8 w-16" type="number" min={0} value={b} onChange={(e) => setB(Number(e.target.value) || 0)} title="Boarded" />
      <Input className="h-8 w-16" type="number" min={0} value={m} onChange={(e) => setM(Number(e.target.value) || 0)} title="Missing" />
      <Button size="sm" onClick={() => onDepart(b, m)}>Depart</Button>
    </div>
  );
}

/* -------------------- Live map -------------------- */

function TripLiveMap({ trip }: { trip: TripDetailRow }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const vehicleRef = useRef<google.maps.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const configured = isGoogleMapsConfigured();

  useEffect(() => {
    if (!configured || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps(["places", "geometry"]).then((g) => {
      if (cancelled || !ref.current) return;
      const start = trip.routes?.start_lat != null
        ? { lat: Number(trip.routes.start_lat), lng: Number(trip.routes.start_lng) }
        : { lat: 12.9716, lng: 77.5946 };
      const map = new g.maps.Map(ref.current, { center: start, zoom: 13, disableDefaultUI: false, streetViewControl: false });
      mapRef.current = map;
      setReady(true);
    }).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load map"));
    return () => { cancelled = true; };
  }, [configured, trip.routes?.start_lat, trip.routes?.start_lng]);

  useEffect(() => {
    if (!ready || !mapRef.current || typeof google === "undefined") return;
    const map = mapRef.current;
    // Clear previous markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();

    // School start
    if (trip.routes?.start_lat != null && trip.routes.start_lng != null) {
      const p = { lat: Number(trip.routes.start_lat), lng: Number(trip.routes.start_lng) };
      markersRef.current.push(new google.maps.Marker({ position: p, map, label: "S", title: "School / Start" }));
      bounds.extend(p);
    }
    // Stops
    (trip.stop_progress ?? []).forEach((s, i) => {
      if (s.lat == null || s.lng == null) return;
      const p = { lat: Number(s.lat), lng: Number(s.lng) };
      const color = s.status === "departed" ? "#10b981" : s.status === "reached" ? "#f59e0b" : "#3b82f6";
      markersRef.current.push(new google.maps.Marker({
        position: p, map, title: s.name,
        label: { text: String(i + 1), color: "#fff", fontSize: "11px" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: 12,
          fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
        },
      }));
      bounds.extend(p);
    });
    // End
    if (trip.routes?.end_lat != null && trip.routes.end_lng != null) {
      const p = { lat: Number(trip.routes.end_lat), lng: Number(trip.routes.end_lng) };
      markersRef.current.push(new google.maps.Marker({ position: p, map, label: "E", title: "End" }));
      bounds.extend(p);
    }

    // Vehicle
    if (vehicleRef.current) { vehicleRef.current.setMap(null); vehicleRef.current = null; }
    if (trip.live_location) {
      const p = { lat: trip.live_location.lat, lng: trip.live_location.lng };
      vehicleRef.current = new google.maps.Marker({
        position: p, map, title: "Vehicle",
        icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 5, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, rotation: trip.live_location.heading ?? 0 },
        zIndex: 999,
      });
      bounds.extend(p);
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 40);
  }, [ready, trip.stop_progress, trip.live_location, trip.routes?.end_lat, trip.routes?.end_lng, trip.routes?.start_lat, trip.routes?.start_lng]);

  if (!configured) {
    return <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Google Maps is not configured. Connect it to view the live map.</div>;
  }
  return (
    <div className="space-y-2">
      {err && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}
      <div ref={ref} className="h-[420px] w-full rounded-md border bg-muted" />
    </div>
  );
}

/* -------------------- Vehicle health -------------------- */

function VehicleHealth({ trip, occupied }: { trip: TripDetailRow; occupied: number }) {
  const v = trip.vehicles;
  if (!v) return <EmptyState title="No vehicle assigned" description="Assign a vehicle to see health information." />;
  const meta = (v.metadata ?? {}) as Record<string, unknown>;
  const fuel = (meta.fuel_type as string) ?? "—";
  const insStatus = expiryTone(v.insurance_expiry);
  const fitStatus = expiryTone(v.fitness_expiry);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4" /> Vehicle health</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
        <Field label="Fuel type" value={<span className="capitalize">{fuel}</span>} icon={Fuel} />
        <Field label="Capacity" value={String(v.capacity ?? "—")} />
        <Field label="Current students" value={`${occupied} / ${v.capacity ?? "?"}`} />
        <Field label="Driver" value={trip.drivers?.full_name ?? "Unassigned"} />
        <Field label="Insurance" value={<Badge variant={insStatus.variant}>{insStatus.label}{v.insurance_expiry ? ` · ${v.insurance_expiry}` : ""}</Badge>} icon={ShieldCheck} />
        <Field label="Fitness" value={<Badge variant={fitStatus.variant}>{fitStatus.label}{v.fitness_expiry ? ` · ${v.fitness_expiry}` : ""}</Badge>} icon={ShieldCheck} />
      </CardContent>
    </Card>
  );
}

function expiryTone(date: string | null | undefined): { variant: "default" | "secondary" | "destructive" | "outline"; label: string } {
  if (!date) return { variant: "outline", label: "Not set" };
  const d = new Date(date).getTime();
  if (Number.isNaN(d)) return { variant: "outline", label: "Unknown" };
  const days = Math.floor((d - Date.now()) / 86_400_000);
  if (days < 0) return { variant: "destructive", label: "Expired" };
  if (days <= 30) return { variant: "secondary", label: `${days}d left` };
  return { variant: "default", label: "Valid" };
}

/* -------------------- Report -------------------- */

function TripReport({ trip, assigned }: { trip: TripDetailRow; assigned: number }) {
  const stats = useMemo(() => {
    const stops = trip.stop_progress ?? [];
    const durationMs = trip.started_at && trip.ended_at ? new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime() : null;
    const durationMin = durationMs != null ? Math.round(durationMs / 60000) : null;
    const boarded = stops.reduce((n, s) => n + (s.students_boarded ?? 0), 0);
    const missing = stops.reduce((n, s) => n + (s.students_missing ?? 0), 0);
    const delays = stops.map((s) => delayMinutes(s.scheduled_arrival, s.actual_arrival, trip.trip_date)).filter((n): n is number => n != null && n > 0);
    const avgDelay = delays.length === 0 ? 0 : Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
    const distanceKm = Number(trip.routes?.total_distance ?? 0);
    // Rough estimate: 8 km / L average
    const fuelEstL = distanceKm ? +(distanceKm / 8).toFixed(2) : null;
    return { durationMin, boarded, missing, avgDelay, distanceKm, fuelEstL };
  }, [trip]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Trip Report — ${trip.name ?? trip.trip_code ?? "Trip"}`, 14, 14);
    autoTable(doc, {
      startY: 22,
      head: [["Metric", "Value"]],
      body: [
        ["Trip code", trip.trip_code ?? "—"],
        ["Type", tripTypeLabel(trip.trip_type)],
        ["Date", trip.trip_date],
        ["Status", tripStatusLabel(trip.status)],
        ["Distance", `${stats.distanceKm} km`],
        ["Duration", stats.durationMin != null ? `${stats.durationMin} min` : "—"],
        ["Students transported", String(stats.boarded)],
        ["Students missing", String(stats.missing)],
        ["Assigned students", String(assigned)],
        ["Average delay", `${stats.avgDelay} min`],
        ["Fuel estimate", stats.fuelEstL != null ? `${stats.fuelEstL} L` : "—"],
        ["Route", trip.routes?.name ?? "—"],
        ["Driver", trip.drivers?.full_name ?? "—"],
        ["Vehicle", trip.vehicles?.registration_number ?? "—"],
      ],
    });
    doc.save(`${trip.trip_code ?? "trip"}-report.pdf`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Trip report</CardTitle>
        <Button size="sm" variant="outline" onClick={exportPDF}><Download className="mr-2 h-4 w-4" /> Export PDF</Button>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
        <Field label="Distance" value={`${stats.distanceKm} km`} />
        <Field label="Duration" value={stats.durationMin != null ? `${stats.durationMin} min` : "—"} icon={Clock} />
        <Field label="Students transported" value={String(stats.boarded)} icon={Users} />
        <Field label="Students missing" value={String(stats.missing)} />
        <Field label="Average delay" value={`${stats.avgDelay} min`} icon={Clock} />
        <Field label="Fuel estimate" value={stats.fuelEstL != null ? `${stats.fuelEstL} L @ 8 km/L` : "—"} icon={Fuel} />
      </CardContent>
    </Card>
  );
}
