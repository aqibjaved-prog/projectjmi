import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Pencil, Trash2, Power, Printer, MapPin, Users, Car, UserCog, Route as RouteIcon, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { RouteForm } from "@/components/routes/route-form";
import {
  routeFormToPayload, routeToFormDefaults, routeTypeLabel, normalizeStops, fetchRouteStudentCounts,
  type RouteRow, type RouteFormValues,
} from "@/lib/routes";

export const Route = createFileRoute("/_authenticated/routes/$routeId")({
  head: ({ params }) => ({ meta: [{ title: `Route ${params.routeId.slice(0, 6)} — School Van Guardian` }] }),
  validateSearch: (s: Record<string, unknown>) => ({ edit: s.edit ? 1 : undefined } as { edit?: number }),
  component: RouteDetailPage,
});

type DetailRow = RouteRow & {
  schools?: { id: string; name: string } | null;
  drivers?: { id: string; full_name: string; phone: string | null } | null;
  vehicles?: { id: string; registration_number: string; vehicle_code: string | null; capacity: number; status: string } | null;
};

type StudentRow = {
  id: string; full_name: string; student_code: string | null;
  grade: string | null; class_section: string | null; route_id: string | null; is_active: boolean;
};

function RouteDetailPage() {
  const { routeId } = Route.useParams();
  const { edit } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { primaryRole, schoolId } = useAuth();

  const [editOpen, setEditOpen] = useState(!!edit);
  const [assignDriverOpen, setAssignDriverOpen] = useState(false);
  const [assignVehicleOpen, setAssignVehicleOpen] = useState(false);
  const [assignStudentsOpen, setAssignStudentsOpen] = useState(false);

  useEffect(() => { setEditOpen(!!edit); }, [edit]);

  const { data: route, isLoading } = useQuery({
    queryKey: ["route", routeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("routes")
        .select("*, schools:school_id(id,name), drivers:driver_id(id,full_name,phone), vehicles:vehicle_id(id,registration_number,vehicle_code,capacity,status)")
        .eq("id", routeId).maybeSingle();
      if (error) throw error;
      return data as unknown as DetailRow | null;
    },
  });

  const canManage = primaryRole === "school_admin" && !!route && route.school_id === schoolId;
  const routeSchoolId = route?.school_id;

  const { data: students } = useQuery({
    enabled: !!routeSchoolId,
    queryKey: ["route-students", routeId, routeSchoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id,full_name,student_code,grade,class_section,route_id,is_active")
        .eq("school_id", routeSchoolId!).order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });
  const assignedStudents = useMemo(() => (students ?? []).filter((s) => s.route_id === routeId), [students, routeId]);

  const { data: drivers } = useQuery({
    enabled: canManage && !!routeSchoolId,
    queryKey: ["drivers-lite", routeSchoolId],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("id,full_name")
        .eq("school_id", routeSchoolId!).eq("is_active", true).order("full_name");
      return data ?? [];
    },
  });
  const { data: vehicles } = useQuery({
    enabled: canManage && !!routeSchoolId,
    queryKey: ["vehicles-lite", routeSchoolId],
    queryFn: async () => {
      const { data } = await supabase.from("vehicles")
        .select("id,registration_number,vehicle_code,capacity,status")
        .eq("school_id", routeSchoolId!).order("registration_number");
      return (data ?? []) as Array<{ id: string; registration_number: string; vehicle_code: string | null; capacity: number; status: string }>;
    },
  });
  const activeVehicles = useMemo(() => (vehicles ?? []).filter((v) => v.status === "active"), [vehicles]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["route", routeId] });
    qc.invalidateQueries({ queryKey: ["routes-list"] });
    qc.invalidateQueries({ queryKey: ["route-students", routeId] });
    qc.invalidateQueries({ queryKey: ["route-counts"] });
    qc.invalidateQueries({ queryKey: ["school-stats"] });
  };

  const update = useMutation({
    mutationFn: async (values: RouteFormValues) => {
      const payload = routeFormToPayload(values);
      if (payload.vehicle_id) {
        const v = activeVehicles.find((x) => x.id === payload.vehicle_id);
        const target = payload.max_students ?? assignedStudents.length;
        if (v && target > v.capacity) {
          throw new Error("Vehicle capacity exceeded. Choose another vehicle or reduce Maximum students.");
        }
      }
      const { error } = await supabase.from("routes").update(payload).eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Route updated"); invalidate();
      setEditOpen(false);
      navigate({ to: "/routes/$routeId", params: { routeId }, search: { edit: undefined } });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("routes").delete().eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Route deleted"); invalidate(); navigate({ to: "/routes" }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("routes").update({ is_active: !route!.is_active }).eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const assignDriver = useMutation({
    mutationFn: async (driver_id: string | null) => {
      const { error } = await supabase.from("routes").update({ driver_id }).eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Driver updated"); invalidate(); setAssignDriverOpen(false); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const assignVehicle = useMutation({
    mutationFn: async (vehicle_id: string | null) => {
      if (vehicle_id) {
        const v = activeVehicles.find((x) => x.id === vehicle_id);
        const target = route?.max_students ?? assignedStudents.length;
        if (v && target > v.capacity) {
          throw new Error("Vehicle capacity exceeded. Choose another vehicle or reduce Maximum students.");
        }
      }
      const { error } = await supabase.from("routes").update({ vehicle_id }).eq("id", routeId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vehicle updated"); invalidate(); setAssignVehicleOpen(false); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const saveStudents = useMutation({
    mutationFn: async (selectedIds: string[]) => {
      const capacity = route?.vehicles?.capacity ?? null;
      const max = route?.max_students ?? null;
      const limit = Math.min(...[capacity, max].filter((n): n is number => n != null));
      if (Number.isFinite(limit) && selectedIds.length > (limit as number)) {
        throw new Error("Vehicle capacity exceeded. Choose another vehicle or remove students.");
      }
      const currentIds = new Set(assignedStudents.map((s) => s.id));
      const next = new Set(selectedIds);
      const toAdd = selectedIds.filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !next.has(id));
      if (toRemove.length) {
        const { error } = await supabase.from("students").update({ route_id: null }).in("id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase.from("students").update({ route_id: routeId }).in("id", toAdd);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Students updated"); invalidate(); setAssignStudentsOpen(false); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const defaults = useMemo(() => (route ? routeToFormDefaults(route) : undefined), [route]);
  const stops = useMemo(() => (route ? normalizeStops(route.stops) : []), [route]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!route) return <EmptyState title="Route not found" description="This route may have been deleted." />;

  const capacity = route.vehicles?.capacity ?? null;
  const maxStudents = route.max_students ?? capacity;
  const current = assignedStudents.length;

  return (
    <>
      <PageHeader
        title={route.name}
        description={`${route.route_code ?? "—"} · ${route.schools?.name ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link to="/routes"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link></Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</Button>
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setAssignDriverOpen(true)}><UserCog className="mr-2 h-4 w-4" /> Driver</Button>
                <Button variant="outline" onClick={() => setAssignVehicleOpen(true)}><Car className="mr-2 h-4 w-4" /> Vehicle</Button>
                <Button variant="outline" onClick={() => setAssignStudentsOpen(true)}><Users className="mr-2 h-4 w-4" /> Students</Button>
                <Button variant="outline" onClick={() => toggleActive.mutate()}>
                  <Power className="mr-2 h-4 w-4" /> {route.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
                <Button variant="destructive" onClick={() => { if (confirm(`Delete route "${route.name}"?`)) remove.mutate(); }}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Route information</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Info label="Route ID" value={<code className="text-xs">{route.route_code ?? route.id.slice(0, 8)}</code>} />
            <Info label="Type" value={<Badge variant="outline">{routeTypeLabel(route.route_type)}</Badge>} />
            <Info label="Status" value={route.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>} />
            <Info label="Color" value={route.route_color ? <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: route.route_color }} />{route.route_color}</span> : "—"} />
            <Info label="Starting point" value={route.starting_point} />
            <Info label="Ending point" value={route.ending_point} />
            <Info label="Total distance (km)" value={route.total_distance} />
            <Info label="Estimated duration (min)" value={route.estimated_duration} />
            <Info label="Pickup start" value={route.pickup_start_time} />
            <Info label="Drop start" value={route.drop_start_time} />
            <Info label="Occupancy" value={`${current}${maxStudents != null ? ` / ${maxStudents}` : ""}`} />
            <Info label="Created" value={new Date(route.created_at).toLocaleString()} />
            <Info label="Last updated" value={new Date(route.updated_at).toLocaleString()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Assignments</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Driver" value={route.drivers ? `${route.drivers.full_name}${route.drivers.phone ? ` · ${route.drivers.phone}` : ""}` : "Unassigned"} />
            <Info label="Vehicle" value={route.vehicles ? `${route.vehicles.vehicle_code ?? route.vehicles.registration_number} (cap ${route.vehicles.capacity})` : "Unassigned"} />
            <Info label="Students" value={current} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Stops ({stops.length})</CardTitle></CardHeader>
          <CardContent>
            {stops.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stops defined. Edit the route to add stops.</p>
            ) : (
              <ol className="space-y-2">
                {stops.map((s, i) => (
                  <li key={s.id} className="flex items-start gap-3 rounded-md border p-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.name}</div>
                      {s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {(s.lat != null && s.lng != null) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.lat}, {s.lng}</span>}
                        {s.arrival_time && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Arr {s.arrival_time}</span>}
                        {s.departure_time && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Dep {s.departure_time}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><RouteIcon className="h-4 w-4" /> Map</CardTitle></CardHeader>
          <CardContent>
            <div className="relative grid h-64 place-items-center overflow-hidden rounded-md border bg-muted/30 text-center text-sm text-muted-foreground">
              <div>
                <MapPin className="mx-auto mb-2 h-6 w-6" />
                Google Maps integration placeholder
                <div className="mt-1 text-xs">
                  Start {coord(route.start_lat, route.start_lng)} → End {coord(route.end_lat, route.end_lng)} · {stops.length} stops
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Assigned students ({assignedStudents.length})</CardTitle></CardHeader>
          <CardContent>
            {assignedStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students assigned. {canManage ? "Use the Students button above to assign." : ""}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {assignedStudents.map((s) => (
                  <li key={s.id} className="rounded-md border p-3 text-sm">
                    <Link to="/students/$studentId" params={{ studentId: s.id }} className="font-medium hover:underline">{s.full_name}</Link>
                    <div className="text-xs text-muted-foreground">
                      {s.student_code ?? "—"}{s.grade ? ` · Class ${s.grade}` : ""}{s.class_section ? `-${s.class_section}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {route.notes && (
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent><div className="whitespace-pre-wrap text-sm text-muted-foreground">{route.notes}</div></CardContent>
          </Card>
        )}
      </div>

      {canManage && (
        <Dialog open={editOpen} onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) navigate({ to: "/routes/$routeId", params: { routeId }, search: { edit: undefined } });
        }}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader><DialogTitle>Edit route</DialogTitle><DialogDescription className="sr-only">Update route details, stops and assignments.</DialogDescription></DialogHeader>
            {defaults && (
              <RouteForm
                defaults={defaults}
                drivers={drivers ?? []}
                vehicles={activeVehicles}
                submitting={update.isPending}
                submitLabel="Save changes"
                onSubmit={(v) => update.mutate(v)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {canManage && (
        <AssignDriverDialog
          open={assignDriverOpen} onOpenChange={setAssignDriverOpen}
          drivers={drivers ?? []} current={route.driver_id}
          submitting={assignDriver.isPending} onSubmit={(id) => assignDriver.mutate(id)}
        />
      )}
      {canManage && (
        <AssignVehicleDialog
          open={assignVehicleOpen} onOpenChange={setAssignVehicleOpen}
          vehicles={activeVehicles} current={route.vehicle_id}
          submitting={assignVehicle.isPending} onSubmit={(id) => assignVehicle.mutate(id)}
        />
      )}
      {canManage && (
        <AssignStudentsDialog
          open={assignStudentsOpen} onOpenChange={setAssignStudentsOpen}
          allStudents={students ?? []} currentRouteId={routeId}
          capacity={maxStudents}
          submitting={saveStudents.isPending} onSubmit={(ids) => saveStudents.mutate(ids)}
        />
      )}
    </>
  );
}

function coord(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "(not set)";
  return `(${lat}, ${lng})`;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value != null && value !== "" ? value : "—"}</div>
    </div>
  );
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "Failed");
  if (msg.includes("routes_unique_active_driver")) return "This driver is already assigned to another active route.";
  if (msg.includes("routes_unique_active_vehicle")) return "This vehicle is already assigned to another active route.";
  if (msg.toLowerCase().includes("route has reached") || msg.toLowerCase().includes("vehicle has reached")) {
    return "Vehicle capacity exceeded. Choose another vehicle or remove students.";
  }
  return msg;
}

/* ---------------- Assignment dialogs ---------------- */

function AssignDriverDialog({
  open, onOpenChange, drivers, current, submitting, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  drivers: Array<{ id: string; full_name: string }>;
  current: string | null; submitting: boolean;
  onSubmit: (id: string | null) => void;
}) {
  const [value, setValue] = useState<string>(current ?? "none");
  useEffect(() => { if (open) setValue(current ?? "none"); }, [open, current]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign driver</DialogTitle>
          <DialogDescription>A driver can only be assigned to one active route at a time.</DialogDescription>
        </DialogHeader>
        {drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active drivers available. Add drivers first.</p>
        ) : (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submitting} onClick={() => onSubmit(value === "none" ? null : value)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignVehicleDialog({
  open, onOpenChange, vehicles, current, submitting, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  vehicles: Array<{ id: string; registration_number: string; vehicle_code: string | null; capacity: number }>;
  current: string | null; submitting: boolean;
  onSubmit: (id: string | null) => void;
}) {
  const [value, setValue] = useState<string>(current ?? "none");
  useEffect(() => { if (open) setValue(current ?? "none"); }, [open, current]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign vehicle</DialogTitle>
          <DialogDescription>A vehicle can only serve one active route. Capacity will be enforced.</DialogDescription>
        </DialogHeader>
        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active vehicles available. Add vehicles first.</p>
        ) : (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.vehicle_code ?? v.registration_number} · cap {v.capacity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submitting} onClick={() => onSubmit(value === "none" ? null : value)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignStudentsDialog({
  open, onOpenChange, allStudents, currentRouteId, capacity, submitting, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  allStudents: StudentRow[]; currentRouteId: string;
  capacity: number | null; submitting: boolean;
  onSubmit: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) {
      setSelected(new Set(allStudents.filter((s) => s.route_id === currentRouteId).map((s) => s.id)));
      setQ("");
    }
  }, [open, allStudents, currentRouteId]);

  const filtered = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    return allStudents
      .filter((s) => s.is_active)
      .filter((s) => !s.route_id || s.route_id === currentRouteId)
      .filter((s) => !q2 || `${s.full_name} ${s.student_code ?? ""} ${s.grade ?? ""} ${s.class_section ?? ""}`.toLowerCase().includes(q2));
  }, [allStudents, currentRouteId, q]);

  const overCapacity = capacity != null && selected.size > capacity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Assign students</DialogTitle>
          <DialogDescription>Each student can belong to only one active route. Selecting a student moves them to this route.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <Input placeholder="Search students…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="whitespace-nowrap text-sm text-muted-foreground">
            Selected {selected.size}{capacity != null ? ` / ${capacity}` : ""}
          </div>
        </div>
        {overCapacity && (
          <p className="text-sm text-destructive">Vehicle capacity exceeded. Choose another vehicle or remove students.</p>
        )}
        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No students available.</p>
          ) : (
            <ul className="divide-y">
              {filtered.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(s.id); else next.delete(s.id);
                        setSelected(next);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{s.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.student_code ?? "—"}{s.grade ? ` · Class ${s.grade}` : ""}{s.class_section ? `-${s.class_section}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={submitting || overCapacity} onClick={() => onSubmit([...selected])}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
