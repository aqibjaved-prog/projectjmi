import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontal, Plus, ChevronLeft, ChevronRight, Eye, Trash2, Download,
  Calendar as CalendarIcon, Play, CheckCircle2, XCircle, Clock, Activity,
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { TripForm } from "@/components/trips/trip-form";
import {
  TRIP_STATUSES, TRIP_TYPES, tripFormToPayload, tripStatusLabel, tripTypeLabel,
  type TripFormValues, type TripRow, type TripStatus, type TripType, normalizeTrip,
} from "@/lib/trips";

export const Route = createFileRoute("/_authenticated/trips/")({
  head: () => ({ meta: [{ title: "Trips — School Van Guardian" }] }),
  component: TripsPage,
});

const PAGE_SIZE = 10;

type ListRow = TripRow & {
  routes?: { id: string; name: string; route_code: string | null; stops: unknown } | null;
  drivers?: { id: string; full_name: string } | null;
  vehicles?: { id: string; registration_number: string; vehicle_code: string | null } | null;
  schools?: { id: string; name: string } | null;
};

function TripsPage() {
  const { primaryRole, schoolId } = useAuth();
  const qc = useQueryClient();

  const [schoolFilter, setSchoolFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | TripStatus>("all");
  const [type, setType] = useState<"all" | TripType>("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const isSuper = primaryRole === "super_admin";
  const canManage = primaryRole === "school_admin";
  const activeSchoolId = canManage ? schoolId : (schoolFilter !== "all" ? schoolFilter : null);

  const { data: schools } = useQuery({
    enabled: isSuper,
    queryKey: ["schools-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips-list", isSuper ? schoolFilter : schoolId],
    queryFn: async () => {
      let q = supabase
        .from("trips" as never)
        .select("*, routes:route_id(id,name,route_code,stops), drivers:driver_id(id,full_name), vehicles:vehicle_id(id,registration_number,vehicle_code), schools:school_id(id,name)")
        .order("trip_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (!isSuper && schoolId) q = q.eq("school_id", schoolId);
      else if (isSuper && schoolFilter !== "all") q = q.eq("school_id", schoolFilter);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => normalizeTrip(r) as ListRow);
    },
  });

  const { data: routes } = useQuery({
    enabled: !!activeSchoolId,
    queryKey: ["routes-lite", activeSchoolId],
    queryFn: async () => {
      const { data } = await supabase.from("routes")
        .select("id,name,route_code,driver_id,vehicle_id,pickup_start_time,drop_start_time,stops")
        .eq("school_id", activeSchoolId!).eq("is_active", true).order("name");
      return (data ?? []) as Array<{ id: string; name: string; route_code: string | null; driver_id: string | null; vehicle_id: string | null; pickup_start_time: string | null; drop_start_time: string | null; stops: unknown }>;
    },
  });

  const { data: drivers } = useQuery({
    enabled: !!activeSchoolId,
    queryKey: ["drivers-lite", activeSchoolId],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("id,full_name")
        .eq("school_id", activeSchoolId!).eq("is_active", true).order("full_name");
      return (data ?? []) as Array<{ id: string; full_name: string }>;
    },
  });

  const { data: vehicles } = useQuery({
    enabled: !!activeSchoolId,
    queryKey: ["vehicles-lite", activeSchoolId],
    queryFn: async () => {
      const { data } = await supabase.from("vehicles")
        .select("id,registration_number,vehicle_code,status")
        .eq("school_id", activeSchoolId!).order("registration_number");
      return (data ?? []) as Array<{ id: string; registration_number: string; vehicle_code: string | null; status: string }>;
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (trips ?? []).filter((t) => {
      if (s) {
        const blob = `${t.name ?? ""} ${t.trip_code ?? ""} ${t.routes?.name ?? ""} ${t.drivers?.full_name ?? ""} ${t.vehicles?.registration_number ?? ""} ${t.vehicles?.vehicle_code ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      if (status !== "all" && t.status !== status) return false;
      if (type !== "all" && t.trip_type !== type) return false;
      if (driverFilter !== "all" && t.driver_id !== driverFilter) return false;
      if (vehicleFilter !== "all" && t.vehicle_id !== vehicleFilter) return false;
      if (routeFilter !== "all" && t.route_id !== routeFilter) return false;
      if (dateFilter && t.trip_date !== dateFilter) return false;
      return true;
    });
  }, [trips, search, status, type, driverFilter, vehicleFilter, routeFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const list = trips ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return {
      today: list.filter((t) => t.trip_date === today).length,
      running: list.filter((t) => t.status === "in_progress" || t.status === "paused").length,
      completed: list.filter((t) => t.status === "completed").length,
      canceled: list.filter((t) => t.status === "canceled").length,
      delayed: list.filter((t) => {
        if (!t.expected_start_time || !t.started_at) return false;
        const [h, m] = t.expected_start_time.split(":").map(Number);
        const sched = new Date(`${t.trip_date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
        const act = new Date(t.started_at);
        return act.getTime() - sched.getTime() > 5 * 60000;
      }).length,
    };
  }, [trips]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trips-list"] });
    qc.invalidateQueries({ queryKey: ["trip"] });
  };

  const create = useMutation({
    mutationFn: async (values: TripFormValues) => {
      if (!activeSchoolId) throw new Error("No school selected.");
      const payload = tripFormToPayload(values);
      // Build a stop_progress skeleton from the selected route's stops
      const r = (routes ?? []).find((x) => x.id === payload.route_id);
      const stopsRaw = Array.isArray(r?.stops) ? (r!.stops as Array<Record<string, unknown>>) : [];
      const stop_progress = stopsRaw
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
        .map((s, i) => ({
          stop_id: String(s.id ?? crypto.randomUUID()),
          name: String(s.name ?? `Stop ${i + 1}`),
          order: i,
          scheduled_arrival: (s.arrival_time as string) ?? null,
          scheduled_departure: (s.departure_time as string) ?? null,
          actual_arrival: null,
          actual_departure: null,
          students_boarded: 0,
          students_missing: 0,
          status: "pending" as const,
          lat: s.lat == null ? null : Number(s.lat),
          lng: s.lng == null ? null : Number(s.lng),
        }));

      const timeline = [{
        id: crypto.randomUUID(),
        event_type: "trip.created",
        message: "Trip created",
        at: new Date().toISOString(),
      }];

      const { error } = await (supabase.from("trips" as never) as unknown as {
        insert: (p: unknown) => Promise<{ error: unknown }>;
      }).insert({
        ...payload,
        school_id: activeSchoolId,
        stop_progress,
        timeline,
      });
      if (error) throw error as Error;

    },
    onSuccess: () => { toast.success("Trip created"); invalidate(); setCreateOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create trip"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trips" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Trip deleted"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const cancel = useMutation({
    mutationFn: async (row: ListRow) => {
      const timeline = [...(row.timeline ?? []), {
        id: crypto.randomUUID(), event_type: "trip.canceled",
        message: "Trip cancelled", at: new Date().toISOString(),
      }];
      const { error } = await supabase.from("trips" as never)
        .update({ status: "canceled", canceled_at: new Date().toISOString(), timeline })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Trip cancelled"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const exportData = () => filtered.map((t) => ({
    trip_code: t.trip_code ?? "",
    name: t.name ?? "",
    type: tripTypeLabel(t.trip_type),
    status: tripStatusLabel(t.status),
    date: t.trip_date,
    start: t.expected_start_time ?? "",
    end: t.expected_end_time ?? "",
    route: t.routes?.name ?? "",
    driver: t.drivers?.full_name ?? "",
    vehicle: t.vehicles?.vehicle_code ?? t.vehicles?.registration_number ?? "",
    school: t.schools?.name ?? "",
    started_at: t.started_at ?? "",
    ended_at: t.ended_at ?? "",
    notes: t.notes ?? "",
  }));

  const exportCSV = () => {
    const csv = Papa.unparse(exportData());
    triggerDownload(URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), "trips.csv");
  };
  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(exportData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trips");
    XLSX.writeFile(wb, "trips.xlsx");
  };
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Trips", 14, 14);
    const rows = exportData().map((r) => [
      r.trip_code, r.name, r.type, r.status, r.date, r.start, r.route, r.driver, r.vehicle,
    ]);
    autoTable(doc, {
      startY: 20,
      head: [["Code", "Name", "Type", "Status", "Date", "Start", "Route", "Driver", "Vehicle"]],
      body: rows.map((r) => r.map((x) => String(x ?? ""))),
      styles: { fontSize: 8 },
    });
    doc.save("trips.pdf");
  };

  if (!isSuper && !canManage && primaryRole !== "driver") {
    return <EmptyState title="Not allowed" description="Only administrators and drivers can view trips." />;
  }

  return (
    <>
      <PageHeader
        title="Trips"
        description={isSuper ? "All trips across every tenant." : "Plan and monitor daily van trips."}
        actions={
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Download</DropdownMenuLabel>
                <DropdownMenuItem onClick={exportCSV}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportXLSX}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPDF}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button disabled={!activeSchoolId}><Plus className="mr-2 h-4 w-4" /> Add trip</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add trip</DialogTitle>
                    <DialogDescription className="sr-only">Create a new trip inheriting stops, driver, vehicle and students from a route.</DialogDescription>
                  </DialogHeader>
                  <TripForm
                    routes={routes ?? []}
                    drivers={drivers ?? []}
                    vehicles={vehicles ?? []}
                    submitting={create.isPending}
                    submitLabel="Create trip"
                    onSubmit={(v) => create.mutate(v)}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Trips today" value={totals.today} icon={CalendarIcon} loading={isLoading} />
        <StatCard label="Running" value={totals.running} icon={Activity} loading={isLoading} tone="success" />
        <StatCard label="Completed" value={totals.completed} icon={CheckCircle2} loading={isLoading} />
        <StatCard label="Cancelled" value={totals.canceled} icon={XCircle} loading={isLoading} tone="warning" />
        <StatCard label="Delayed" value={totals.delayed} icon={Clock} loading={isLoading} tone="warning" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {isSuper && (
          <Select value={schoolFilter} onValueChange={(v) => { setSchoolFilter(v); setPage(1); }}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All schools" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              {(schools ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Input placeholder="Search name, code, driver, vehicle, route…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-72" />
        <Input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1); }} className="w-44" />
        <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TRIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{tripStatusLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v as typeof type); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TRIP_TYPES.map((t) => <SelectItem key={t} value={t}>{tripTypeLabel(t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={routeFilter} onValueChange={(v) => { setRouteFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Route" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All routes</SelectItem>
            {(routes ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={driverFilter} onValueChange={(v) => { setDriverFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Driver" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All drivers</SelectItem>
            {(drivers ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={vehicleFilter} onValueChange={(v) => { setVehicleFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Vehicle" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vehicles</SelectItem>
            {(vehicles ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicle_code ?? v.registration_number}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Status</TableHead>
              {isSuper && <TableHead>School</TableHead>}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={isSuper ? 11 : 10}><Skeleton className="h-6" /></TableCell></TableRow>
              ))
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={isSuper ? 11 : 10}>
                <EmptyState title="No trips yet" description={canManage ? "Schedule your first trip to start tracking daily runs." : "No trips match your filters."} />
              </TableCell></TableRow>
            ) : (
              pageRows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.trip_code ?? "—"}</TableCell>
                  <TableCell>
                    <Link to="/trips/$tripId" params={{ tripId: t.id }} className="font-medium hover:underline">
                      {t.name ?? "Untitled trip"}
                    </Link>
                  </TableCell>
                  <TableCell><Badge variant="outline">{tripTypeLabel(t.trip_type)}</Badge></TableCell>
                  <TableCell>{t.trip_date}</TableCell>
                  <TableCell>{t.expected_start_time ?? "—"}</TableCell>
                  <TableCell>{t.routes?.name ?? "—"}</TableCell>
                  <TableCell>{t.drivers?.full_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell>{t.vehicles ? (t.vehicles.vehicle_code ?? t.vehicles.registration_number) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  {isSuper && <TableCell className="text-sm text-muted-foreground">{t.schools?.name ?? "—"}</TableCell>}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link to="/trips/$tripId" params={{ tripId: t.id }}><Eye className="mr-2 h-4 w-4" /> View</Link></DropdownMenuItem>
                        {canManage && (t.status === "scheduled" || t.status === "ready") && (
                          <DropdownMenuItem asChild>
                            <Link to="/trips/$tripId" params={{ tripId: t.id }} search={{ start: 1 }}><Play className="mr-2 h-4 w-4" /> Start</Link>
                          </DropdownMenuItem>
                        )}
                        {canManage && t.status !== "completed" && t.status !== "canceled" && (
                          <DropdownMenuItem onClick={() => { if (confirm("Cancel this trip?")) cancel.mutate(t); }}>
                            <XCircle className="mr-2 h-4 w-4" /> Cancel
                          </DropdownMenuItem>
                        )}
                        {canManage && (t.status === "scheduled" || t.status === "canceled") && (
                          <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(`Delete trip "${t.name ?? t.trip_code}"?`)) remove.mutate(t.id); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {pageRows.length} of {filtered.length}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Page {page} / {totalPages}</span>
          <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: TripStatus }) {
  const map: Record<TripStatus, { className: string; label: string }> = {
    scheduled: { className: "bg-muted text-muted-foreground", label: "Scheduled" },
    ready: { className: "bg-blue-500/15 text-blue-700 dark:text-blue-300", label: "Ready" },
    in_progress: { className: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300", label: "Live" },
    paused: { className: "bg-amber-500/20 text-amber-800 dark:text-amber-300", label: "Paused" },
    completed: { className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", label: "Completed" },
    canceled: { className: "bg-destructive/15 text-destructive", label: "Cancelled" },
  };
  const s = map[status] ?? map.scheduled;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
