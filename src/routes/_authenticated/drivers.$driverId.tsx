import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Pencil, Power, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { DriverForm } from "@/components/drivers/driver-form";
import {
  driverToFormDefaults, getDriverPhotoUrl, licenseStatus, licenseStatusLabel,
  mergeMetadata, splitDriverPayload, uploadDriverPhoto,
  type DriverFormValues, type DriverRow,
} from "@/lib/drivers";

type Detail = DriverRow & { schools?: { id: string; name: string } | null };

export const Route = createFileRoute("/_authenticated/drivers/$driverId")({
  head: () => ({ meta: [{ title: "Driver — School Van Guardian" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ edit: s.edit ? 1 : undefined } as { edit?: number }),
  component: DriverDetailPage,
});

function DriverDetailPage() {
  const { driverId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(!!search.edit);

  useEffect(() => { setEditOpen(!!search.edit); }, [search.edit]);

  const { data: driver, isLoading } = useQuery({
    queryKey: ["driver", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*, schools:school_id(id,name)")
        .eq("id", driverId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Detail | null;
    },
  });

  const { data: photoUrl } = useQuery({
    enabled: !!driver?.metadata?.photo_path,
    queryKey: ["driver-photo", driverId, driver?.metadata?.photo_path],
    queryFn: () => getDriverPhotoUrl(driver?.metadata?.photo_path ?? null),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["driver", driverId] });
    qc.invalidateQueries({ queryKey: ["drivers-list"] });
    qc.invalidateQueries({ queryKey: ["school-stats"] });
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
  };

  const update = useMutation({
    mutationFn: async ({ values, photo }: { values: DriverFormValues; photo: File | null }) => {
      if (!driver) throw new Error("Driver not loaded");
      const existingPath = driver.metadata?.photo_path ?? null;
      let photoPath = existingPath;
      if (photo) {
        photoPath = await uploadDriverPhoto(driver.school_id, driver.id, photo);
      }
      const { columns, metadata } = splitDriverPayload(values, photoPath);
      const merged = mergeMetadata(driver.metadata ?? null, metadata);
      const { error } = await supabase
        .from("drivers")
        .update({ ...columns, metadata: merged })
        .eq("id", driver.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Driver updated");
      invalidate();
      setEditOpen(false);
      navigate({ to: "/drivers/$driverId", params: { driverId }, search: { edit: undefined } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("drivers")
        .update({ is_active: !(driver?.is_active ?? true) })
        .eq("id", driverId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("drivers").delete().eq("id", driverId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Driver deleted");
      invalidate();
      navigate({ to: "/drivers" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const defaults = useMemo(() => (driver ? driverToFormDefaults(driver) : undefined), [driver]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!driver) return <EmptyState title="Driver not found" description="This driver may have been deleted." />;

  const ls = licenseStatus(driver.license_expiry);
  const m = driver.metadata ?? {};
  const addressLine = [m.address, m.city, m.state, m.pincode].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader
        title={driver.full_name}
        description={driver.schools?.name ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/drivers"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
            </Button>
            <Button variant="outline" onClick={() => toggleActive.mutate()}>
              <Power className="mr-2 h-4 w-4" /> {driver.is_active ? "Deactivate" : "Activate"}
            </Button>
            <Button onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
            <Button
              variant="destructive"
              onClick={() => { if (confirm(`Delete ${driver.full_name}?`)) remove.mutate(); }}
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
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
                {photoUrl ? (
                  <img src={photoUrl} alt={driver.full_name} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-12 w-12" />
                )}
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Info label="Driver ID" value={<code className="text-xs">{driver.id.slice(0, 8)}</code>} />
                <Info label="Full name" value={driver.full_name} />
                <Info label="Date of birth" value={m.date_of_birth} />
                <Info label="Gender" value={m.gender} />
                <Info label="Blood group" value={m.blood_group} />
                <Info label="Aadhaar" value={m.aadhaar_number} />
                <Info label="Phone" value={driver.phone} />
                <Info label="Email" value={m.email} />
                <Info label="Address" value={addressLine || "—"} />
                <Info
                  label="Status"
                  value={
                    <Badge variant={driver.is_active ? "default" : "secondary"}>
                      {driver.is_active ? "Active" : "Inactive"}
                    </Badge>
                  }
                />
                <Info label="Created" value={new Date(driver.created_at).toLocaleString()} />
                <Info label="Last updated" value={new Date(driver.updated_at).toLocaleString()} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>License</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Number" value={driver.license_number} />
            <Info label="Class" value={m.license_class} />
            <Info label="Issue date" value={m.license_issue_date} />
            <Info label="Expiry date" value={driver.license_expiry} />
            <Info label="Experience" value={m.experience_years != null ? `${m.experience_years} years` : "—"} />
            <Info
              label="License status"
              value={
                <Badge variant={ls === "expired" ? "destructive" : ls === "expiring" ? "secondary" : "outline"}>
                  {licenseStatusLabel(ls)}
                </Badge>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Emergency contact</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Name" value={m.emergency_contact_name} />
            <Info label="Phone" value={m.emergency_contact_number ?? m.emergency_contact} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info label="Joining date" value={m.joining_date} />
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

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) navigate({ to: "/drivers/$driverId", params: { driverId }, search: { edit: undefined } });
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit driver</DialogTitle><DialogDescription className="sr-only">Update this driver's details.</DialogDescription></DialogHeader>
          {defaults && (
            <DriverForm
              defaultValues={defaults}
              existingPhotoUrl={photoUrl ?? null}
              submitting={update.isPending}
              submitLabel="Save changes"
              onSubmit={(values, photo) => update.mutate({ values, photo })}
            />
          )}
        </DialogContent>
      </Dialog>
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
