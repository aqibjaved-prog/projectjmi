import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontal, Plus, ChevronLeft, ChevronRight, Eye, Pencil, Trash2,
  Upload, Download, MapPin, Route as RouteIcon, Power, Users, Car, UserCog,
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RouteForm } from "@/components/routes/route-form";
import {
  routeFormToPayload, fetchRouteStudentCounts, routeTypeLabel, ROUTE_TYPES,
  type RouteFormValues, type RouteRow, type RouteType,
} from "@/lib/routes";

export const Route = createFileRoute("/_authenticated/routes/")({
  head: () => ({ meta: [{ title: "Routes — School Van Guardian" }] }),
  component: RoutesPage,
});

const PAGE_SIZE = 10;
type StatusFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | RouteType;

type ListRow = RouteRow & {
  schools?: { id: string; name: string } | null;
  drivers?: { id: string; full_name: string } | null;
  vehicles?: { id: string; registration_number: string; vehicle_code: string | null; capacity: number } | null;
};

function RoutesPage() {
  const { primaryRole, schoolId } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [schoolFilter, setSchoolFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
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

  const { data: routes, isLoading } = useQuery({
    queryKey: ["routes-list", isSuper ? schoolFilter : schoolId],
    queryFn: async () => {
      let q = supabase
        .from("routes")
        .select("*, schools:school_id(id,name), drivers:driver_id(id,full_name), vehicles:vehicle_id(id,registration_number,vehicle_code,capacity)")
        .order("created_at", { ascending: false });
      if (!isSuper && schoolId) q = q.eq("school_id", schoolId);
      else if (isSuper && schoolFilter !== "all") q = q.eq("school_id", schoolFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ListRow[];
    },
  });

  const { data: drivers } = useQuery({
    enabled: !!activeSchoolId,
    queryKey: ["drivers-lite", activeSchoolId],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("id,full_name")
        .eq("school_id", activeSchoolId!).eq("is_active", true).order("full_name");
      return data ?? [];
    },
  });

  const { data: vehicles } = useQuery({
    enabled: !!activeSchoolId,
    queryKey: ["vehicles-lite", activeSchoolId],
    queryFn: async () => {
      const { data } = await supabase.from("vehicles")
        .select("id,registration_number,vehicle_code,capacity,status")
        .eq("school_id", activeSchoolId!).order("registration_number");
      return (data ?? []) as Array<{ id: string; registration_number: string; vehicle_code: string | null; capacity: number; status: string }>;
    },
  });
  const activeVehicles = useMemo(() => (vehicles ?? []).filter((v) => v.status === "active"), [vehicles]);

  const { data: counts } = useQuery({
    enabled: !!activeSchoolId,
    queryKey: ["route-counts", activeSchoolId],
    queryFn: () => fetchRouteStudentCounts(activeSchoolId),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (routes ?? []).filter((r) => {
      if (s) {
        const blob = `${r.name ?? ""} ${r.route_code ?? ""} ${r.drivers?.full_name ?? ""} ${r.vehicles?.registration_number ?? ""} ${r.vehicles?.vehicle_code ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      if (status !== "all" && (status === "active" ? !r.is_active : r.is_active)) return false;
      if (type !== "all" && r.route_type !== type) return false;
      if (driverFilter !== "all" && r.driver_id !== driverFilter) return false;
      if (vehicleFilter !== "all" && r.vehicle_id !== vehicleFilter) return false;
      return true;
    });
  }, [routes, search, status, type, driverFilter, vehicleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const list = routes ?? [];
    const c = counts ?? new Map<string, number>();
    let studentsAssigned = 0;
    const driverSet = new Set<string>();
    const vehicleSet = new Set<string>();
    for (const r of list) {
      studentsAssigned += c.get(r.id) ?? 0;
      if (r.driver_id) driverSet.add(r.driver_id);
      if (r.vehicle_id) vehicleSet.add(r.vehicle_id);
    }
    return {
      total: list.length,
      active: list.filter((r) => r.is_active).length,
      inactive: list.filter((r) => !r.is_active).length,
      studentsAssigned,
      driversAssigned: driverSet.size,
      vehiclesAssigned: vehicleSet.size,
    };
  }, [routes, counts]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["routes-list"] });
    qc.invalidateQueries({ queryKey: ["route-counts"] });
    qc.invalidateQueries({ queryKey: ["school-stats"] });
  };

  const create = useMutation({
    mutationFn: async (values: RouteFormValues) => {
      if (!activeSchoolId) throw new Error("No school selected.");
      const payload = routeFormToPayload(values);
      if (payload.vehicle_id) {
        const v = activeVehicles.find((x) => x.id === payload.vehicle_id);
        const students = payload.max_students ?? 0;
        if (v && students > v.capacity) {
          throw new Error("Vehicle capacity exceeded. Choose another vehicle or reduce Maximum students.");
        }
      }
      const { error } = await supabase.from("routes").insert({ ...payload, school_id: activeSchoolId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Route created"); invalidate(); setCreateOpen(false); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("routes").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.is_active ? "Route activated" : "Route deactivated"); invalidate(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("routes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Route deleted"); invalidate(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  // -------- Import --------
  const importRows = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      if (!activeSchoolId) throw new Error("No school selected.");
      const asStr = (v: unknown) => (v == null ? "" : String(v));
      const payload = rows
        .filter((r) => r && (r.name || r.route_name))
        .map((r) => {
          const values = {
            name: asStr(r.name ?? r.route_name),
            route_type: ((ROUTE_TYPES as readonly string[]).includes(asStr(r.route_type)) ? asStr(r.route_type) : "both") as RouteType,
            is_active: String(r.is_active ?? "true").toLowerCase() !== "false",
            starting_point: asStr(r.starting_point),
            ending_point: asStr(r.ending_point),
            start_lat: asStr(r.start_lat), start_lng: asStr(r.start_lng),
            end_lat: asStr(r.end_lat), end_lng: asStr(r.end_lng),
            total_distance: asStr(r.total_distance),
            estimated_duration: asStr(r.estimated_duration),
            pickup_start_time: asStr(r.pickup_start_time),
            drop_start_time: asStr(r.drop_start_time),
            max_students: asStr(r.max_students),
            route_color: asStr(r.route_color),
            vehicle_id: null, driver_id: null,
            notes: asStr(r.notes),
            stops: [],
          } as RouteFormValues;
          return { ...routeFormToPayload(values), school_id: activeSchoolId };
        });
      if (payload.length === 0) throw new Error("No valid rows found.");
      const { error } = await supabase.from("routes").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => { toast.success(`Imported ${n} routes`); invalidate(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const name = file.name.toLowerCase();
      let rows: Record<string, unknown>[] = [];
      if (name.endsWith(".csv")) {
        const text = await file.text();
        rows = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true }).data;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      }
      await importRows.mutateAsync(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  // -------- Export --------
  const exportData = () =>
    filtered.map((r) => ({
      route_code: r.route_code ?? "",
      name: r.name,
      route_type: routeTypeLabel(r.route_type),
      status: r.is_active ? "Active" : "Inactive",
      starting_point: r.starting_point ?? "",
      ending_point: r.ending_point ?? "",
      total_distance: r.total_distance ?? "",
      estimated_duration: r.estimated_duration ?? "",
      pickup_start_time: r.pickup_start_time ?? "",
      drop_start_time: r.drop_start_time ?? "",
      max_students: r.max_students ?? "",
      current_students: counts?.get(r.id) ?? 0,
      driver: r.drivers?.full_name ?? "",
      vehicle: r.vehicles?.vehicle_code ?? r.vehicles?.registration_number ?? "",
      stops: Array.isArray(r.stops) ? (r.stops as unknown[]).length : 0,
      notes: r.notes ?? "",
    }));

  const exportCSV = () => {
    const csv = Papa.unparse(exportData());
    triggerDownload(URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), "routes.csv");
  };
  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(exportData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Routes");
    XLSX.writeFile(wb, "routes.xlsx");
  };
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Routes", 14, 14);
    const rows = exportData().map((r) => [
      r.route_code, r.name, r.route_type, r.status, r.driver, r.vehicle,
      r.max_students, r.current_students, r.total_distance, r.estimated_duration, r.stops,
    ]);
    autoTable(doc, {
      startY: 20,
      head: [["Code", "Name", "Type", "Status", "Driver", "Vehicle", "Max", "Current", "Dist(km)", "Dur(min)", "Stops"]],
      body: rows.map((r) => r.map((x) => String(x ?? ""))),
      styles: { fontSize: 8 },
    });
    doc.save("routes.pdf");
  };

  if (!isSuper && !canManage) {
    return <EmptyState title="Not allowed" description="Only administrators can view routes." />;
  }

  return (
    <>
      <PageHeader
        title="Routes"
        description={isSuper ? "All routes across every tenant." : "Manage your school's pickup & drop routes."}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!activeSchoolId}>
                  <Upload className="mr-2 h-4 w-4" /> Import
                </Button>
              </>
            )}
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
                  <Button disabled={!activeSchoolId}><Plus className="mr-2 h-4 w-4" /> Add route</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Add route</DialogTitle><DialogDescription className="sr-only">Create a new route with optional stops and assignments.</DialogDescription></DialogHeader>
                  {activeSchoolId && (
                    <RouteForm
                      drivers={drivers ?? []}
                      vehicles={activeVehicles}
                      submitting={create.isPending}
                      submitLabel="Create route"
                      onSubmit={(v) => create.mutate(v)}
                    />
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Total routes" value={totals.total} icon={RouteIcon} loading={isLoading} />
        <StatCard label="Active" value={totals.active} icon={Power} loading={isLoading} tone="success" />
        <StatCard label="Inactive" value={totals.inactive} icon={Power} loading={isLoading} tone="warning" />
        <StatCard label="Students assigned" value={totals.studentsAssigned} icon={Users} loading={isLoading} />
        <StatCard label="Drivers assigned" value={totals.driversAssigned} icon={UserCog} loading={isLoading} />
        <StatCard label="Vehicles assigned" value={totals.vehiclesAssigned} icon={Car} loading={isLoading} />
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
        <Input placeholder="Search name, code, driver, vehicle…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-72" />
        <Select value={status} onValueChange={(v) => { setStatus(v as StatusFilter); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v as TypeFilter); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ROUTE_TYPES.map((t) => <SelectItem key={t} value={t}>{routeTypeLabel(t)}</SelectItem>)}
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
              <TableHead>Driver</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Stops</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Status</TableHead>
              {isSuper && <TableHead>School</TableHead>}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={isSuper ? 10 : 9}><Skeleton className="h-6" /></TableCell></TableRow>
              ))
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={isSuper ? 10 : 9}>
                <EmptyState title="No routes yet" description={canManage ? "Add your first route to start assigning drivers, vehicles, and students." : "No routes match your filters."} />
              </TableCell></TableRow>
            ) : (
              pageRows.map((r) => {
                const cnt = counts?.get(r.id) ?? 0;
                const cap = r.max_students ?? r.vehicles?.capacity ?? null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.route_code ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {r.route_color && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: r.route_color }} />}
                        <Link to="/routes/$routeId" params={{ routeId: r.id }} className="font-medium hover:underline">{r.name}</Link>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{routeTypeLabel(r.route_type)}</Badge></TableCell>
                    <TableCell>{r.drivers?.full_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell>{r.vehicles ? (r.vehicles.vehicle_code ?? r.vehicles.registration_number) : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell>{Array.isArray(r.stops) ? (r.stops as unknown[]).length : 0}</TableCell>
                    <TableCell>{cnt}{cap != null ? ` / ${cap}` : ""}</TableCell>
                    <TableCell>{r.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    {isSuper && <TableCell className="text-sm text-muted-foreground">{r.schools?.name ?? "—"}</TableCell>}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild><Link to="/routes/$routeId" params={{ routeId: r.id }}><Eye className="mr-2 h-4 w-4" /> View</Link></DropdownMenuItem>
                          {canManage && <>
                            <DropdownMenuItem asChild><Link to="/routes/$routeId" params={{ routeId: r.id }} search={{ edit: 1 }}><Pencil className="mr-2 h-4 w-4" /> Edit</Link></DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive.mutate({ id: r.id, is_active: !r.is_active })}>
                              <Power className="mr-2 h-4 w-4" /> {r.is_active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => {
                              if (confirm(`Delete route "${r.name}"? Students will be unassigned.`)) remove.mutate(r.id);
                            }}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                          </>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
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

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "Failed");
  if (msg.includes("routes_unique_active_driver")) return "This driver is already assigned to another active route.";
  if (msg.includes("routes_unique_active_vehicle")) return "This vehicle is already assigned to another active route.";
  if (msg.toLowerCase().includes("route has reached")) return "Route has reached its maximum student capacity.";
  if (msg.toLowerCase().includes("vehicle has reached")) return "Vehicle capacity exceeded. Choose another vehicle or remove students.";
  return msg;
}
