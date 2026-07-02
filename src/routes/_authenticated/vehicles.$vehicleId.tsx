import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Pencil, Trash2, Power, Wrench, Bus, User, Route as RouteIcon, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import {
  vehicleToFormDefaults, splitVehiclePayload, mergeMetadata, uploadVehiclePhoto,
  getVehiclePhotoUrl, expiryStatus, expiryLabel,
  vehicleTypeLabel, vehicleStatusLabel, fuelTypeLabel, fetchVehicleOccupancy,
  fetchVehicleAssignments, vehicleAvailability, vehicleAvailabilityLabel,
  type VehicleFormValues, type VehicleRow, type VehicleStatus,
} from "@/lib/vehicles";

type Detail = VehicleRow & { schools?: { id: string; name: string } | null };

export const Route = createFileRoute("/_authenticated/vehicles/$vehicleId")({
  head: () => ({ meta: [{ title: "Vehicle — School Van Guardian" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ edit: s.edit ? 1 : undefined } as { edit?: number }),
  component: VehicleDetailPage,
});

function VehicleDetailPage() {
  const { vehicleId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { primaryRole } = useAuth();
  const canManage = primaryRole === "school_admin";
  const [editOpen, setEditOpen] = useState(!!search.edit);
  useEffect(() => { setEditOpen(!!search.edit); }, [search.edit]);

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*, schools:school_id(id,name)")
        .eq("id", vehicleId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Detail | null;
    },
  });

  const { data: occupancy } = useQuery({
    enabled: !!vehicle?.school_id,
    queryKey: ["vehicle-occupancy", vehicle?.school_id],
    queryFn: () => fetchVehicleOccupancy(vehicle?.school_id),
  });
  const occ = vehicle ? occupancy?.get(vehicle.id) : undefined;

  const { data: photoUrl } = useQuery({
    enabled: !!vehicle?.metadata?.photo_path,
    queryKey: ["vehicle-photo", vehicleId, vehicle?.metadata?.photo_path],
    queryFn: () => getVehiclePhotoUrl(vehicle?.metadata?.photo_path ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
    qc.invalidateQueries({ queryKey: ["vehicles-list"] });
  };

  const update = useMutation({
    mutationFn: async ({ values, photo }: { values: VehicleFormValues; photo: File | null }) => {
      if (!vehicle) throw new Error("Vehicle not loaded");
      const existingPath = vehicle.metadata?.photo_path ?? null;
      let photoPath = existingPath;
      if (photo) photoPath = await uploadVehiclePhoto(vehicle.school_id, vehicle.id, photo);
      const { columns, metadata } = splitVehiclePayload(values, photoPath);
      const merged = mergeMetadata(vehicle.metadata ?? null, metadata);
      const { error } = await supabase
        .from("vehicles")
        .update({ ...columns, metadata: merged })
        .eq("id", vehicle.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle updated");
      invalidate();
      setEditOpen(false);
      navigate({ to: "/vehicles/$vehicleId", params: { vehicleId }, search: { edit: undefined } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const setStatus = useMutation({
    mutationFn: async (status: VehicleStatus) => {
      const { error } = await supabase.from("vehicles").update({ status }).eq("id", vehicleId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vehicle deleted"); invalidate(); navigate({ to: "/vehicles" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const defaults = useMemo(() => (vehicle ? vehicleToFormDefaults(vehicle) : undefined), [vehicle]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!vehicle) return <EmptyState title="Vehicle not found" description="This vehicle may have been deleted." />;

  const m = vehicle.metadata ?? {};
  const ins = expiryStatus(vehicle.insurance_expiry);
  const fit = expiryStatus(vehicle.fitness_expiry);
  const pol = expiryStatus(m.pollution_expiry);

  return (
    <>
      <PageHeader
        title={vehicle.vehicle_number ?? m.vehicle_number ?? vehicle.registration_number}
        description={vehicle.schools?.name ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/vehicles"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
            </Button>
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setStatus.mutate(vehicle.status === "active" ? "inactive" : "active")}>
                  <Power className="mr-2 h-4 w-4" /> {vehicle.status === "active" ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="outline" onClick={() => setStatus.mutate("maintenance")}>
                  <Wrench className="mr-2 h-4 w-4" /> Under maintenance
                </Button>
                <Button onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
                <Button
                  variant="destructive"
                  onClick={() => { if (confirm(`Delete vehicle ${vehicle.registration_number}?`)) remove.mutate(); }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Vehicle profile</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <div className="grid h-32 w-40 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Bus className="h-10 w-10" />
                )}
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Info label="Vehicle ID" value={<code className="text-xs">{vehicle.vehicle_code ?? vehicle.id.slice(0, 8)}</code>} />
                <Info label="Vehicle number" value={vehicle.vehicle_number ?? m.vehicle_number} />
                <Info label="Registration number" value={vehicle.registration_number} />
                <Info label="Vehicle type" value={vehicleTypeLabel(m.vehicle_type)} />
                <Info label="Brand" value={m.brand} />
                <Info label="Model" value={vehicle.model} />
                <Info label="Manufacturing year" value={m.manufacturing_year} />
                <Info label="Fuel type" value={fuelTypeLabel(m.fuel_type)} />
                <Info label="Capacity" value={vehicle.capacity} />
                <Info label="Occupied seats" value={occ ? occ.occupied : "—"} />
                <Info
                  label="Available seats"
                  value={occ ? <>{occ.available}{occ.available <= 0 && <Badge variant="destructive" className="ml-2">Full</Badge>}</> : "—"}
                />
                <Info label="Color" value={vehicle.color} />
                <Info label="GPS device ID" value={m.gps_device_id} />
                <Info label="Status" value={<Badge>{vehicleStatusLabel(vehicle.status)}</Badge>} />
                <Info label="Created" value={new Date(vehicle.created_at).toLocaleString()} />
                <Info label="Last updated" value={new Date(vehicle.updated_at).toLocaleString()} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Identifiers</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Chassis #" value={m.chassis_number} />
            <Info label="Engine #" value={m.engine_number} />
            <Info label="RC #" value={m.rc_number} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Insurance</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Number" value={m.insurance_number} />
            <Info label="Expiry" value={vehicle.insurance_expiry} />
            <Info label="Status" value={<Badge variant={ins === "expired" ? "destructive" : ins === "expiring" ? "secondary" : "outline"}>{expiryLabel(ins)}</Badge>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Fitness</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Certificate #" value={m.fitness_number} />
            <Info label="Expiry" value={vehicle.fitness_expiry} />
            <Info label="Status" value={<Badge variant={fit === "expired" ? "destructive" : fit === "expiring" ? "secondary" : "outline"}>{expiryLabel(fit)}</Badge>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pollution</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Certificate #" value={m.pollution_number} />
            <Info label="Expiry" value={m.pollution_expiry} />
            <Info label="Status" value={<Badge variant={pol === "expired" ? "destructive" : pol === "expiring" ? "secondary" : "outline"}>{expiryLabel(pol)}</Badge>} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm text-muted-foreground">
              {m.notes?.trim() ? m.notes : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <Dialog
          open={editOpen}
          onOpenChange={(o) => {
            setEditOpen(o);
            if (!o) navigate({ to: "/vehicles/$vehicleId", params: { vehicleId }, search: { edit: undefined } });
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader><DialogTitle>Edit vehicle</DialogTitle><DialogDescription className="sr-only">Update this vehicle's details.</DialogDescription></DialogHeader>
            {defaults && (
              <VehicleForm
                defaults={defaults}
                photoPreviewUrl={photoUrl ?? null}
                submitting={update.isPending}
                submitLabel="Save changes"
                onSubmit={(values, photo) => update.mutate({ values, photo })}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value != null && value !== "" ? value : "—"}</div>
    </div>
  );
}
