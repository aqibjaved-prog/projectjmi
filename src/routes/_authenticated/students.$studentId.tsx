import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Pencil, Power, Trash2, Download, Printer, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { StudentForm } from "@/components/students/student-form";
import {
  cleanNullable, downloadDataUrl, makeQRDataUrl, printQR,
  type StudentFormValues, type StudentRow,
} from "@/lib/students";
import { fetchVehicleOccupancy, isCapacityError, type VehicleOccupancyRow } from "@/lib/vehicles";

type Detail = StudentRow & {
  routes?: { id: string; name: string } | null;
  vehicles?: { id: string; registration_number: string; model: string | null } | null;
  schools?: { id: string; name: string } | null;
};

export const Route = createFileRoute("/_authenticated/students/$studentId")({
  head: () => ({ meta: [{ title: "Student — School Van Guardian" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ edit: s.edit ? 1 : undefined } as { edit?: number }),
  component: StudentDetailPage,
});

function StudentDetailPage() {
  const { studentId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(!!search.edit);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [assignRouteOpen, setAssignRouteOpen] = useState(false);
  const [assignVehicleOpen, setAssignVehicleOpen] = useState(false);

  useEffect(() => { setEditOpen(!!search.edit); }, [search.edit]);

  const { data: student, isLoading } = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, routes:route_id(id,name), vehicles:vehicle_id(id,registration_number,model), schools:school_id(id,name)")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data as Detail | null;
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (student?.qr_code) {
      makeQRDataUrl(student.qr_code, 320).then((d) => { if (!cancelled) setQrDataUrl(d); });
    }
    return () => { cancelled = true; };
  }, [student?.qr_code]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["student", studentId] });
    qc.invalidateQueries({ queryKey: ["students-list"] });
    qc.invalidateQueries({ queryKey: ["school-stats"] });
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
  };

  const update = useMutation({
    mutationFn: async (values: StudentFormValues & { photo_url?: string | null }) => {
      const payload = cleanNullable({
        ...values,
        full_name: `${values.first_name ?? ""} ${values.last_name ?? ""}`.trim(),
      });
      const { error } = await supabase.from("students").update(payload).eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student updated");
      invalidate();
      setEditOpen(false);
      navigate({ to: "/students/$studentId", params: { studentId }, search: { edit: undefined } });
    },
    onError: (e) => {
      if (isCapacityError(e)) toast.error("This vehicle has reached its maximum seating capacity.");
      else toast.error(e instanceof Error ? e.message : "Failed");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("students")
        .update({ is_active: !(student?.is_active ?? true) })
        .eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("students").delete().eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student deleted");
      invalidate();
      navigate({ to: "/students" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const regenQR = useMutation({
    mutationFn: async () => {
      const newCode = "SVG-" + crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabase.from("students").update({ qr_code: newCode }).eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("QR regenerated"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const assignRoute = useMutation({
    mutationFn: async (route_id: string | null) => {
      const { error } = await supabase.from("students").update({ route_id }).eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Route updated"); invalidate(); setAssignRouteOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const assignVehicle = useMutation({
    mutationFn: async (vehicle_id: string | null) => {
      const { error } = await supabase.from("students").update({ vehicle_id }).eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vehicle updated"); invalidate(); setAssignVehicleOpen(false); },
    onError: (e) => {
      if (isCapacityError(e)) toast.error("This vehicle has reached its maximum seating capacity.");
      else toast.error(e instanceof Error ? e.message : "Failed");
    },
  });

  const { data: routes } = useQuery({
    enabled: !!student?.school_id,
    queryKey: ["routes-for-school", student?.school_id],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id,name").eq("school_id", student!.school_id).order("name");
      return data ?? [];
    },
  });
  const { data: vehicles } = useQuery({
    enabled: !!student?.school_id,
    queryKey: ["vehicles-for-school", student?.school_id],
    queryFn: async () => {
      const { data } = await supabase.from("vehicles").select("id,registration_number,model,capacity").eq("school_id", student!.school_id).order("registration_number");
      return data ?? [];
    },
  });
  const { data: occupancy } = useQuery({
    enabled: !!student?.school_id,
    queryKey: ["vehicle-occupancy", student?.school_id],
    queryFn: () => fetchVehicleOccupancy(student?.school_id),
  });

  const defaults = useMemo(() => {
    if (!student) return undefined;
    return {
      first_name: student.first_name ?? student.full_name?.split(" ")[0] ?? "",
      last_name: student.last_name ?? student.full_name?.split(" ").slice(1).join(" ") ?? "",
      admission_number: student.admission_number ?? "",
      roll_number: student.roll_number ?? "",
      date_of_birth: student.date_of_birth ?? "",
      gender: student.gender ?? "",
      blood_group: student.blood_group ?? "",
      grade: student.grade ?? "",
      class_section: student.class_section ?? "",
      parent_name: student.parent_name ?? "",
      parent_phone: student.parent_phone ?? "",
      parent_email: student.parent_email ?? "",
      emergency_contact: student.emergency_contact ?? "",
      pickup_address: student.pickup_address ?? "",
      drop_address: student.drop_address ?? "",
      pickup_lat: student.pickup_lat,
      pickup_lng: student.pickup_lng,
      drop_lat: student.drop_lat,
      drop_lng: student.drop_lng,
      route_id: student.route_id,
      vehicle_id: student.vehicle_id,
      is_active: student.is_active,
      photo_url: student.photo_url,
    };
  }, [student]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!student) return <EmptyState title="Student not found" description="This student may have been deleted." />;

  return (
    <>
      <PageHeader
        title={student.full_name}
        description={`${student.student_code ?? ""}${student.schools?.name ? ` · ${student.schools.name}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/students"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!routes || routes.length === 0) {
                  toast.info("No routes available. Please create a route first.");
                  return;
                }
                setAssignRouteOpen(true);
              }}
              title={routes && routes.length === 0 ? "No routes available. Please create a route first." : undefined}
            >
              Assign route
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!vehicles || vehicles.length === 0) {
                  toast.info("No vehicles available. Please add a vehicle first.");
                  return;
                }
                setAssignVehicleOpen(true);
              }}
              title={vehicles && vehicles.length === 0 ? "No vehicles available. Please add a vehicle first." : undefined}
            >
              Assign vehicle
            </Button>
            <Button variant="outline" onClick={() => toggleActive.mutate()}>
              <Power className="mr-2 h-4 w-4" /> {student.is_active ? "Deactivate" : "Activate"}
            </Button>
            <Button onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
            <Button
              variant="destructive"
              onClick={() => { if (confirm(`Delete ${student.full_name}?`)) remove.mutate(); }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border bg-muted">
                {student.photo_url ? (
                  <img src={student.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg">{(student.full_name ?? "?").slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <Info label="Student ID" value={student.student_code} />
                <Info label="Admission #" value={student.admission_number} />
                <Info label="Roll #" value={student.roll_number} />
                <Info label="Class" value={student.grade} />
                <Info label="Section" value={student.class_section} />
                <Info label="DOB" value={student.date_of_birth} />
                <Info label="Gender" value={student.gender} />
                <Info label="Blood group" value={student.blood_group} />
                <Info label="Status" value={<Badge variant={student.is_active ? "default" : "secondary"}>{student.is_active ? "Active" : "Inactive"}</Badge>} />
                <Info label="Created" value={new Date(student.created_at).toLocaleString()} />
                <Info label="Last updated" value={new Date(student.updated_at).toLocaleString()} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>QR Code</CardTitle>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" title="Regenerate" onClick={() => regenQR.mutate()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" title="Download"
                onClick={() => qrDataUrl && downloadDataUrl(qrDataUrl, `${student.student_code ?? "student"}.png`)}
              ><Download className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Print"
                onClick={() => qrDataUrl && printQR(qrDataUrl, `${student.full_name} — ${student.student_code ?? ""}`)}
              ><Printer className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="grid place-items-center gap-2">
            {qrDataUrl ? <img src={qrDataUrl} alt="QR" className="h-56 w-56" /> : <Skeleton className="h-56 w-56" />}
            <div className="break-all text-center text-xs text-muted-foreground">{student.qr_code}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Parent</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Name" value={student.parent_name} />
            <Info label="Phone" value={student.parent_phone} />
            <Info label="Email" value={student.parent_email} />
            <Info label="Emergency contact" value={student.emergency_contact} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Transport</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Pickup address" value={student.pickup_address} />
            <Info label="Pickup GPS" value={student.pickup_lat != null ? `${student.pickup_lat}, ${student.pickup_lng}` : null} />
            <Info label="Drop address" value={student.drop_address} />
            <Info label="Drop GPS" value={student.drop_lat != null ? `${student.drop_lat}, ${student.drop_lng}` : null} />
            <Info label="Route" value={student.routes?.name} />
            <Info
              label="Vehicle"
              value={student.vehicles ? (() => {
                const occ = student.vehicle_id ? occupancy?.get(student.vehicle_id) : null;
                const label = `${student.vehicles!.registration_number}${student.vehicles!.model ? ` — ${student.vehicles!.model}` : ""}`;
                return occ ? `${label} · Occupied ${occ.occupied} / ${occ.capacity}` : label;
              })() : null}
            />
          </CardContent>
        </Card>
      </div>


      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) navigate({ to: "/students/$studentId", params: { studentId }, search: { edit: undefined } }); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit student</DialogTitle><DialogDescription className="sr-only">Update this student's details.</DialogDescription></DialogHeader>
          {defaults && (
            <StudentForm
              schoolId={student.school_id}
              studentId={student.id}
              defaultValues={defaults}
              submitting={update.isPending}
              submitLabel="Save changes"
              onSubmit={(v) => update.mutate(v)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AssignDialog
        open={assignRouteOpen}
        onOpenChange={setAssignRouteOpen}
        title="Assign route"
        value={student.route_id}
        options={(routes ?? []).map((r) => ({ id: r.id, label: r.name }))}
        onSave={(v) => assignRoute.mutate(v)}
        saving={assignRoute.isPending}
      />
      <AssignDialog
        open={assignVehicleOpen}
        onOpenChange={setAssignVehicleOpen}
        title="Assign vehicle"
        value={student.vehicle_id}
        options={(vehicles ?? []).map((v) => {
          const occ = occupancy?.get(v.id);
          const cap = occ?.capacity ?? v.capacity ?? 0;
          const used = occ?.occupied ?? 0;
          const isCurrent = v.id === student.vehicle_id;
          const disabled = !isCurrent && occ ? occ.available <= 0 : false;
          const suffix = ` · Occupied ${used} / ${cap}${disabled ? " (full)" : ""}`;
          return {
            id: v.id,
            label: `${v.registration_number}${v.model ? ` — ${v.model}` : ""}${suffix}`,
            disabled,
          };
        })}
        onSave={(v) => assignVehicle.mutate(v)}
        saving={assignVehicle.isPending}
      />
    </>
  );
}


function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

function AssignDialog({
  open, onOpenChange, title, value, options, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  value: string | null;
  options: { id: string; label: string }[];
  onSave: (id: string | null) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<string>(value ?? "none");
  useEffect(() => { setSelected(value ?? "none"); }, [value, open]);
  const empty = options.length === 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">Choose an option to assign, or clear the current assignment.</DialogDescription></DialogHeader>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            {title.toLowerCase().includes("route")
              ? "No routes available. Please create a route first."
              : "No vehicles available. Please add a vehicle first."}
          </p>
        ) : (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || empty} onClick={() => onSave(selected === "none" ? null : selected)}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
