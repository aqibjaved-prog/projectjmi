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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontal, Plus, ChevronLeft, ChevronRight, Eye, Pencil, Trash2,
  Upload, Download, Bus, CheckCircle2, Wrench, AlertTriangle, Power,
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import {
  splitVehiclePayload, uploadVehiclePhoto, expiryStatus, expiryLabel,
  vehicleTypeLabel, vehicleStatusLabel, fuelTypeLabel, fetchVehicleOccupancy,
  fetchVehicleAssignments, vehicleAvailability, vehicleAvailabilityLabel,
  VEHICLE_TYPES, VEHICLE_STATUSES, FUEL_TYPES,
  type VehicleFormValues, type VehicleRow, type VehicleType, type VehicleStatus, type FuelType,
  type VehicleAvailability,
} from "@/lib/vehicles";
import { fetchPlanUsage, planLimitMessage, preflightCheck } from "@/lib/plan-limits";
import { PlanUsageCard } from "@/components/plan-usage-card";

export const Route = createFileRoute("/_authenticated/vehicles/")({
  head: () => ({ meta: [{ title: "Vehicles — School Van Guardian" }] }),
  component: VehiclesPage,
});

const PAGE_SIZE = 10;
type StatusFilter = "all" | VehicleStatus;
type TypeFilter = "all" | VehicleType;
type FuelFilter = "all" | FuelType;
type ExpiryFilter = "all" | "insurance" | "fitness" | "pollution" | "service";

type VehicleListRow = VehicleRow & { schools?: { id: string; name: string } | null };

function VehiclesPage() {
  const { primaryRole, schoolId } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [typeF, setTypeF] = useState<TypeFilter>("all");
  const [fuelF, setFuelF] = useState<FuelFilter>("all");
  const [expiryF, setExpiryF] = useState<ExpiryFilter>("all");
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

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["vehicles-list", isSuper ? schoolFilter : schoolId],
    queryFn: async () => {
      let q = supabase
        .from("vehicles")
        .select("*, schools:school_id(id,name)")
        .order("created_at", { ascending: false });
      if (!isSuper && schoolId) q = q.eq("school_id", schoolId);
      else if (isSuper && schoolFilter !== "all") q = q.eq("school_id", schoolFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VehicleListRow[];
    },
  });

  // Occupancy per school (super admin gets a map only when a specific school is selected).
  const occupancyScope = isSuper ? (schoolFilter !== "all" ? schoolFilter : null) : (schoolId ?? null);
  const { data: occupancy } = useQuery({
    enabled: !!occupancyScope,
    queryKey: ["vehicle-occupancy", occupancyScope],
    queryFn: () => fetchVehicleOccupancy(occupancyScope),
  });

  const { data: assignments } = useQuery({
    enabled: !!occupancyScope,
    queryKey: ["vehicle-assignments", occupancyScope],
    queryFn: () => fetchVehicleAssignments(occupancyScope),
  });

  useVehicleAssignmentsRealtime(occupancyScope);

  const { data: planUsage } = useQuery({
    enabled: !!occupancyScope,
    queryKey: ["plan-usage", occupancyScope],
    queryFn: () => fetchPlanUsage(occupancyScope),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (vehicles ?? []).filter((v) => {
      const m = v.metadata ?? {};
      if (s) {
        const blob = `${v.vehicle_number ?? m.vehicle_number ?? ""} ${v.registration_number ?? ""} ${m.brand ?? ""} ${v.model ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      if (status !== "all" && v.status !== status) return false;
      if (typeF !== "all" && m.vehicle_type !== typeF) return false;
      if (fuelF !== "all" && m.fuel_type !== fuelF) return false;
      if (expiryF !== "all") {
        const target =
          expiryF === "insurance" ? v.insurance_expiry :
          expiryF === "fitness" ? v.fitness_expiry :
          expiryF === "pollution" ? m.pollution_expiry :
          m.service_due_date;
        const st = expiryStatus(target ?? null);
        if (st !== "expiring" && st !== "expired") return false;
      }
      return true;
    });
  }, [vehicles, search, status, typeF, fuelF, expiryF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const list = vehicles ?? [];
    const count = (pred: (v: VehicleListRow) => boolean) => list.filter(pred).length;
    const flagged = (getDate: (v: VehicleListRow) => string | null | undefined) =>
      count((v) => {
        const s = expiryStatus(getDate(v));
        return s === "expiring" || s === "expired";
      });
    const activeVehicles = list.filter((v) => v.status === "active");
    const totalCapacity = activeVehicles.reduce((sum, v) => sum + (v.capacity ?? 0), 0);
    const occupiedSeats = occupancy
      ? activeVehicles.reduce((sum, v) => sum + (occupancy.get(v.id)?.occupied ?? 0), 0)
      : null;
    const availableSeats = occupiedSeats == null ? null : Math.max(totalCapacity - occupiedSeats, 0);
    return {
      total: list.length,
      active: activeVehicles.length,
      maintenance: count((v) => v.status === "maintenance"),
      insurance: flagged((v) => v.insurance_expiry),
      fitness: flagged((v) => v.fitness_expiry),
      pollution: flagged((v) => v.metadata?.pollution_expiry),
      service: flagged((v) => v.metadata?.service_due_date),
      totalCapacity,
      occupiedSeats,
      availableSeats,
    };
  }, [vehicles, occupancy]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["vehicles-list"] });
    qc.invalidateQueries({ queryKey: ["vehicle-assignments"] });
    qc.invalidateQueries({ queryKey: ["vehicle-occupancy"] });
    qc.invalidateQueries({ queryKey: ["school-stats"] });
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
  };

  const create = useMutation({
    mutationFn: async ({ values, photo }: { values: VehicleFormValues; photo: File | null }) => {
      if (!activeSchoolId) throw new Error("No school selected.");
      if (planUsage) {
        const err = preflightCheck(planUsage.vehicles);
        if (err) throw new Error("PLAN_LIMIT_VEHICLES: " + err);
      }
      const { columns, metadata } = splitVehiclePayload(values);
      const { data: inserted, error } = await supabase
        .from("vehicles")
        .insert({ ...columns, school_id: activeSchoolId, metadata })
        .select("id")
        .single();
      if (error) throw error;
      if (photo && inserted?.id) {
        const path = await uploadVehiclePhoto(activeSchoolId, inserted.id, photo);
        await supabase.from("vehicles").update({ metadata: { ...metadata, photo_path: path } }).eq("id", inserted.id);
      }
    },
    onSuccess: () => { toast.success("Vehicle added"); invalidate(); setCreateOpen(false); },
    onError: (e) => toast.error(planLimitMessage(e) ?? (e instanceof Error ? e.message : "Failed")),
  });

  const setStatusM = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: VehicleStatus }) => {
      const { error } = await supabase.from("vehicles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(`Marked ${vehicleStatusLabel(v.status)}`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vehicle deleted"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // ---------- Import ----------
  const importRows = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      if (!activeSchoolId) throw new Error("No school selected.");
      const asStr = (v: unknown) => (v == null ? "" : String(v));
      const payload = rows
        .filter((r) => r && (r.registration_number || r.vehicle_number))
        .map((r) => {
          const values: VehicleFormValues = {
            vehicle_number: asStr(r.vehicle_number),
            registration_number: asStr(r.registration_number),
            vehicle_type: (VEHICLE_TYPES.includes(asStr(r.vehicle_type) as VehicleType)
              ? asStr(r.vehicle_type)
              : "school_van") as VehicleType,
            brand: asStr(r.brand),
            model: asStr(r.model),
            manufacturing_year: asStr(r.manufacturing_year),
            capacity: asStr(r.capacity || 0),
            fuel_type: (FUEL_TYPES.includes(asStr(r.fuel_type) as FuelType) ? asStr(r.fuel_type) : "") as FuelType | "",
            color: asStr(r.color),
            chassis_number: asStr(r.chassis_number),
            engine_number: asStr(r.engine_number),
            insurance_number: asStr(r.insurance_number),
            insurance_expiry: asStr(r.insurance_expiry),
            fitness_number: asStr(r.fitness_number),
            fitness_expiry: asStr(r.fitness_expiry),
            pollution_number: asStr(r.pollution_number),
            pollution_expiry: asStr(r.pollution_expiry),
            rc_number: asStr(r.rc_number),
            gps_device_id: asStr(r.gps_device_id),
            notes: asStr(r.notes),
            status: (VEHICLE_STATUSES.includes(asStr(r.status) as VehicleStatus) ? asStr(r.status) : "active") as VehicleStatus,
          };
          const { columns, metadata } = splitVehiclePayload(values);
          return { ...columns, school_id: activeSchoolId, metadata };
        });
      if (payload.length === 0) throw new Error("No valid rows found.");
      const { error } = await supabase.from("vehicles").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => { toast.success(`Imported ${n} vehicles`); invalidate(); },
    onError: (e) => toast.error(planLimitMessage(e) ?? (e instanceof Error ? e.message : "Import failed")),
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

  // ---------- Export ----------
  const exportData = () =>
    filtered.map((v) => {
      const m = v.metadata ?? {};
      return {
        vehicle_code: v.vehicle_code ?? "",
        vehicle_number: v.vehicle_number ?? m.vehicle_number ?? "",
        registration_number: v.registration_number,
        vehicle_type: vehicleTypeLabel(m.vehicle_type),
        brand: m.brand ?? "",
        model: v.model ?? "",
        manufacturing_year: m.manufacturing_year ?? "",
        capacity: v.capacity,
        fuel_type: fuelTypeLabel(m.fuel_type),
        color: v.color ?? "",
        chassis_number: m.chassis_number ?? "",
        engine_number: m.engine_number ?? "",
        insurance_number: m.insurance_number ?? "",
        insurance_expiry: v.insurance_expiry ?? "",
        fitness_number: m.fitness_number ?? "",
        fitness_expiry: v.fitness_expiry ?? "",
        pollution_number: m.pollution_number ?? "",
        pollution_expiry: m.pollution_expiry ?? "",
        rc_number: m.rc_number ?? "",
        gps_device_id: m.gps_device_id ?? "",
        status: vehicleStatusLabel(v.status),
        notes: m.notes ?? "",
      };
    });

  const exportCSV = () => {
    const csv = Papa.unparse(exportData());
    triggerDownload(URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), "vehicles.csv");
  };
  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(exportData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vehicles");
    XLSX.writeFile(wb, "vehicles.xlsx");
  };
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Vehicles", 14, 14);
    const rows = exportData().map((r) => [
      r.vehicle_code, r.vehicle_number, r.registration_number, r.vehicle_type,
      r.brand, r.model, r.capacity, r.fuel_type, r.insurance_expiry, r.fitness_expiry, r.status,
    ]);
    autoTable(doc, {
      startY: 20,
      head: [["Code", "Number", "Reg #", "Type", "Brand", "Model", "Cap", "Fuel", "Ins exp", "Fit exp", "Status"]],
      body: rows.map((r) => r.map((x) => String(x ?? ""))),
      styles: { fontSize: 8 },
    });
    doc.save("vehicles.pdf");
  };

  if (!isSuper && primaryRole !== "school_admin") {
    return <EmptyState title="Not allowed" description="Only administrators can view vehicles." />;
  }

  return (
    <>
      <PageHeader
        title="Vehicles"
        description={isSuper ? "All vehicles across every tenant." : "Vehicles in your school's fleet."}
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
                  <Button disabled={!activeSchoolId}><Plus className="mr-2 h-4 w-4" /> Add vehicle</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Add vehicle</DialogTitle><DialogDescription className="sr-only">Register a new vehicle for this school.</DialogDescription></DialogHeader>
                  {activeSchoolId && (
                    <VehicleForm
                      submitting={create.isPending}
                      submitLabel="Create vehicle"
                      onSubmit={(values, photo) => create.mutate({ values, photo })}
                    />
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total vehicles" value={totals.total} icon={Bus} loading={isLoading} />
        <StatCard label="Active" value={totals.active} icon={CheckCircle2} loading={isLoading} tone="success" />
        <StatCard label="Under maintenance" value={totals.maintenance} icon={Wrench} loading={isLoading} tone="warning" />
        <StatCard label="Insurance expiring" value={totals.insurance} icon={AlertTriangle} loading={isLoading} tone="warning" />
        <StatCard label="Fitness expiring" value={totals.fitness} icon={AlertTriangle} loading={isLoading} tone="warning" />
        <StatCard label="Pollution expiring" value={totals.pollution} icon={AlertTriangle} loading={isLoading} tone="warning" />
        <StatCard label="Service due" value={totals.service} icon={Wrench} loading={isLoading} tone="warning" />
        <StatCard label="Total capacity" value={totals.totalCapacity} icon={Bus} loading={isLoading} />
        <StatCard label="Occupied seats" value={totals.occupiedSeats ?? "—"} icon={CheckCircle2} loading={isLoading} />
        <StatCard label="Available seats" value={totals.availableSeats ?? "—"} icon={CheckCircle2} loading={isLoading} tone="success" />
      </div>

      {planUsage ? <PlanUsageCard usage={planUsage} /> : null}

      <Card className="mt-4">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b p-3">
            {isSuper && (
              <Select value={schoolFilter} onValueChange={(v) => { setSchoolFilter(v); setPage(1); }}>
                <SelectTrigger className="w-56"><SelectValue placeholder="All schools" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All schools</SelectItem>
                  {(schools ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Input
              placeholder="Search number, reg, brand, model…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="max-w-sm"
            />
            <Select value={typeF} onValueChange={(v: TypeFilter) => { setTypeF(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{vehicleTypeLabel(t)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v: StatusFilter) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{vehicleStatusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fuelF} onValueChange={(v: FuelFilter) => { setFuelF(v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Fuel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fuels</SelectItem>
                {FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{fuelTypeLabel(f)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={expiryF} onValueChange={(v: ExpiryFilter) => { setExpiryF(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Expiry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any expiry</SelectItem>
                <SelectItem value="insurance">Insurance expiring/expired</SelectItem>
                <SelectItem value="fitness">Fitness expiring/expired</SelectItem>
                <SelectItem value="pollution">Pollution expiring/expired</SelectItem>
                <SelectItem value="service">Service due</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              {filtered.length} vehicle{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No vehicles match"
                description={vehicles?.length ? "Try a different search or filter." : "Add your first vehicle to get started."}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned driver</TableHead>
                    <TableHead>Assigned route</TableHead>
                    <TableHead>Current trip</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Availability</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead>Fitness</TableHead>
                    {isSuper && <TableHead>School</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((v) => {
                    const m = v.metadata ?? {};
                    const ins = expiryStatus(v.insurance_expiry);
                    const fit = expiryStatus(v.fitness_expiry);
                    const a = assignments?.get(v.id);
                    const availability = vehicleAvailability(v.status, a);
                    return (
                      <TableRow key={v.id}>
                        <TableCell>
                          <Link to="/vehicles/$vehicleId" params={{ vehicleId: v.id }} className="font-medium hover:underline">
                            {v.vehicle_number ?? m.vehicle_number ?? v.registration_number}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {v.registration_number} · {v.vehicle_code ?? ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{vehicleTypeLabel(m.vehicle_type)}</div>
                          <div className="text-xs text-muted-foreground">{[m.brand, v.model].filter(Boolean).join(" ")}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {a?.driver ? (
                            <Link to="/drivers/$driverId" params={{ driverId: a.driver.id }} className="hover:underline">
                              {a.driver.full_name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Not Assigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {a?.route ? (
                            <Link to="/routes/$routeId" params={{ routeId: a.route.id }} className="hover:underline">
                              {a.route.name}
                              {a.route.route_code && <div className="text-xs text-muted-foreground">{a.route.route_code}</div>}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Not Assigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const trip = a?.todayTrip ?? a?.upcomingTrip ?? null;
                            if (!trip) return <span className="text-muted-foreground">Not Assigned</span>;
                            const isActive = trip.status === "in_progress" || trip.status === "paused";
                            return (
                              <Link to="/trips/$tripId" params={{ tripId: trip.id }} className="hover:underline">
                                <div>{trip.name ?? trip.trip_code ?? "Trip"}</div>
                                <div className="text-xs text-muted-foreground">
                                  {isActive ? "In Trip" : trip.status === "scheduled" ? "Scheduled" : trip.status.replace("_", " ")}
                                </div>
                              </Link>
                            );
                          })()}
                        </TableCell>

                        <TableCell className="text-sm">
                          {(() => {
                            const occ = occupancy?.get(v.id);
                            const cap = v.capacity ?? 0;
                            const used = occ?.occupied ?? 0;
                            const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
                            return (
                              <div>
                                <div className="font-medium">{occ ? `${used} / ${cap}` : `— / ${cap}`}</div>
                                <div className="text-xs text-muted-foreground">{occ ? `${pct}% utilised` : "select a school"}</div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell><AvailabilityBadge availability={availability} /></TableCell>
                        <TableCell>
                          <div className="text-xs">{v.insurance_expiry ?? "—"}</div>
                          <ExpiryBadge status={ins} />
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{v.fitness_expiry ?? "—"}</div>
                          <ExpiryBadge status={fit} />
                        </TableCell>
                        {isSuper && <TableCell className="text-sm">{v.schools?.name ?? "—"}</TableCell>}
                        <TableCell>
                          <StatusBadge status={v.status} />

                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to="/vehicles/$vehicleId" params={{ vehicleId: v.id }}>
                                  <Eye className="mr-2 h-4 w-4" /> View details
                                </Link>
                              </DropdownMenuItem>
                              {canManage && (
                                <>
                                  <DropdownMenuItem asChild>
                                    <Link to="/vehicles/$vehicleId" params={{ vehicleId: v.id }} search={{ edit: 1 }}>
                                      <Pencil className="mr-2 h-4 w-4" /> Edit
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setStatusM.mutate({ id: v.id, status: "active" })}>
                                    <Power className="mr-2 h-4 w-4" /> Mark active
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setStatusM.mutate({ id: v.id, status: "inactive" })}>
                                    <Power className="mr-2 h-4 w-4" /> Mark inactive
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setStatusM.mutate({ id: v.id, status: "maintenance" })}>
                                    <Wrench className="mr-2 h-4 w-4" /> Under maintenance
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => { if (confirm(`Delete vehicle ${v.registration_number}?`)) remove.mutate(v.id); }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
                <div>Page {page} of {totalPages}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isSuper && !activeSchoolId && (
        <p className="mt-3 text-xs text-muted-foreground">
          Tip: super admins can view all vehicles. Only school admins can add, edit, or delete vehicles for their assigned school.
        </p>
      )}
    </>
  );
}

function ExpiryBadge({ status }: { status: ReturnType<typeof expiryStatus> }) {
  if (status === "unknown") return null;
  const variant = status === "expired" ? "destructive" : status === "expiring" ? "secondary" : "outline";
  return <Badge variant={variant}>{expiryLabel(status)}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "active" ? "default" : status === "maintenance" ? "secondary" : "outline";
  return <Badge variant={variant}>{vehicleStatusLabel(status)}</Badge>;
}

function AvailabilityBadge({ availability }: { availability: VehicleAvailability }) {
  const variant =
    availability === "available" ? "default" :
    availability === "in_trip" ? "secondary" :
    availability === "scheduled" ? "secondary" :
    availability === "unassigned" ? "outline" :
    "outline";
  return <Badge variant={variant}>{vehicleAvailabilityLabel(availability)}</Badge>;
}


function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
