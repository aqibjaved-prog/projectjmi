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
  MoreHorizontal, Plus, ChevronLeft, ChevronRight, Eye, Pencil, Power, Trash2,
  Upload, Download, IdCard, CheckCircle2, XCircle, AlertTriangle, RotateCcw,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DriverForm } from "@/components/drivers/driver-form";
import {
  driverToFormDefaults, licenseStatus, licenseStatusLabel, mergeMetadata,
  splitDriverPayload, type DriverFormValues, type DriverRow,
} from "@/lib/drivers";

export const Route = createFileRoute("/_authenticated/drivers/")({
  head: () => ({ meta: [{ title: "Drivers — School Van Guardian" }] }),
  component: DriversPage,
});

const PAGE_SIZE = 10;
type StatusFilter = "all" | "active" | "inactive" | "deleted";
type LicenseFilter = "all" | "valid" | "expiring" | "expired" | "unknown";

type DriverListRow = DriverRow & { schools?: { id: string; name: string } | null; deleted_at?: string | null };

function DriversPage() {
  const { primaryRole, schoolId } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const isSuper = primaryRole === "super_admin";
  const canManage = primaryRole === "school_admin" || isSuper;
  const activeSchoolId = isSuper ? (schoolFilter !== "all" ? schoolFilter : null) : schoolId;

  const { data: schools } = useQuery({
    enabled: isSuper,
    queryKey: ["schools-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["drivers-list", isSuper ? schoolFilter : schoolId],
    queryFn: async () => {
      let q = supabase
        .from("drivers")
        .select("*, schools:school_id(id,name)")
        .order("created_at", { ascending: false });
      if (!isSuper && schoolId) q = q.eq("school_id", schoolId);
      else if (isSuper && schoolFilter !== "all") q = q.eq("school_id", schoolFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DriverListRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (drivers ?? []).filter((row) => {
      const isDeleted = !!row.deleted_at;
      if (status === "deleted") { if (!isDeleted) return false; }
      else if (isDeleted) return false;
      if (s) {
        const meta = row.metadata ?? {};
        const blob = `${row.full_name} ${row.phone ?? ""} ${row.license_number ?? ""} ${meta.email ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (licenseFilter !== "all" && licenseStatus(row.license_expiry) !== licenseFilter) return false;
      return true;
    });
  }, [drivers, search, status, licenseFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const list = drivers ?? [];
    let expiring = 0;
    let expired = 0;
    for (const d of list) {
      const s = licenseStatus(d.license_expiry);
      if (s === "expiring") expiring++;
      else if (s === "expired") expired++;
    }
    return {
      total: list.length,
      active: list.filter((d) => d.is_active).length,
      expiring,
      expired,
    };
  }, [drivers]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drivers-list"] });
    qc.invalidateQueries({ queryKey: ["school-stats"] });
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
  };

  const create = useMutation({
    mutationFn: async ({ values, photo, account }: { values: DriverFormValues; photo: File | null; account: { email: string; password: string } | null }) => {
      const target = activeSchoolId;
      if (!target) throw new Error("Select a school first.");
      const { columns, metadata } = splitDriverPayload(values);
      const { data: inserted, error } = await supabase
        .from("drivers")
        .insert({ ...columns, school_id: target, metadata })
        .select("id")
        .single();
      if (error) throw error;
      if (photo && inserted?.id) {
        const { uploadDriverPhoto } = await import("@/lib/drivers");
        const path = await uploadDriverPhoto(target, inserted.id, photo);
        await supabase
          .from("drivers")
          .update({ metadata: { ...metadata, photo_path: path } })
          .eq("id", inserted.id);
      }
      if (account && inserted?.id) {
        const { provisionPortalAccount } = await import("@/lib/portal-accounts.functions");
        const res = await provisionPortalAccount({
          data: {
            kind: "driver",
            recordId: inserted.id,
            schoolId: target,
            email: account.email,
            password: account.password,
            fullName: columns.full_name,
            phone: columns.phone,
          },
        });
        if (!res.ok) throw new Error(res.error);
      }
    },
    onSuccess: () => {
      toast.success("Driver added");
      invalidate();
      setCreateOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const setActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("drivers").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.is_active ? "Driver activated" : "Driver deactivated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (row: DriverListRow) => {
      const { deletePortalAccount } = await import("@/lib/portal-accounts.functions");
      const res = await deletePortalAccount({
        data: { kind: "driver", recordId: row.id, schoolId: row.school_id },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => { toast.success("Driver deleted. Login access revoked."); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const restore = useMutation({
    mutationFn: async (row: DriverListRow) => {
      const { restorePortalAccount } = await import("@/lib/portal-accounts.functions");
      const res = await restorePortalAccount({
        data: { kind: "driver", recordId: row.id, schoolId: row.school_id },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => { toast.success("Driver restored"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // ---------- Import ----------
  const importRows = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const target = activeSchoolId;
      if (!target) throw new Error("Select a school first.");
      const asStr = (v: unknown) => (v == null ? "" : String(v));
      const payload = rows
        .filter((r) => r && (r.first_name || r.full_name || r.name))
        .map((r) => {
          let first = asStr(r.first_name);
          let last = asStr(r.last_name);
          if (!first && (r.full_name || r.name)) {
            const parts = asStr(r.full_name ?? r.name).trim().split(/\s+/);
            first = parts[0] ?? "";
            last = parts.slice(1).join(" ");
          }
          const values: DriverFormValues = {
            first_name: first,
            last_name: last,
            phone: asStr(r.phone),
            email: asStr(r.email),
            date_of_birth: asStr(r.date_of_birth),
            gender: asStr(r.gender),
            blood_group: asStr(r.blood_group),
            address: asStr(r.address),
            city: asStr(r.city),
            state: asStr(r.state),
            pincode: asStr(r.pincode),
            aadhaar_number: asStr(r.aadhaar_number),
            license_number: asStr(r.license_number),
            license_class: asStr(r.license_class),
            license_issue_date: asStr(r.license_issue_date),
            license_expiry: asStr(r.license_expiry),
            experience_years: asStr(r.experience_years),
            emergency_contact_name: asStr(r.emergency_contact_name),
            emergency_contact_number: asStr(r.emergency_contact_number ?? r.emergency_contact),
            joining_date: asStr(r.joining_date),
            notes: asStr(r.notes),
            photo_url: "",
            is_active: !(r.is_active === false || r.is_active === "false"),
          };
          const { columns, metadata } = splitDriverPayload(values);
          return { ...columns, school_id: target, metadata };
        });
      if (payload.length === 0) throw new Error("No valid rows found.");
      const { error } = await supabase.from("drivers").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => { toast.success(`Imported ${n} drivers`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
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
    filtered.map((d) => {
      const m = d.metadata ?? {};
      return {
        first_name: m.first_name ?? "",
        last_name: m.last_name ?? "",
        full_name: d.full_name,
        phone: d.phone ?? "",
        email: m.email ?? "",
        date_of_birth: m.date_of_birth ?? "",
        gender: m.gender ?? "",
        blood_group: m.blood_group ?? "",
        address: m.address ?? "",
        city: m.city ?? "",
        state: m.state ?? "",
        pincode: m.pincode ?? "",
        aadhaar_number: m.aadhaar_number ?? "",
        license_number: d.license_number ?? "",
        license_class: m.license_class ?? "",
        license_issue_date: m.license_issue_date ?? "",
        license_expiry: d.license_expiry ?? "",
        license_status: licenseStatusLabel(licenseStatus(d.license_expiry)),
        experience_years: m.experience_years ?? "",
        emergency_contact_name: m.emergency_contact_name ?? "",
        emergency_contact_number: m.emergency_contact_number ?? m.emergency_contact ?? "",
        joining_date: m.joining_date ?? "",
        status: d.is_active ? "active" : "inactive",
      };
    });


  const exportCSV = () => {
    const csv = Papa.unparse(exportData());
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(URL.createObjectURL(blob), "drivers.csv");
  };
  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(exportData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Drivers");
    XLSX.writeFile(wb, "drivers.xlsx");
  };
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Drivers", 14, 14);
    const rows = exportData().map((r) => [
      r.full_name, r.phone, r.email, r.license_number, r.license_class,
      r.license_expiry, r.license_status, r.status,
    ]);
    autoTable(doc, {
      startY: 20,
      head: [["Name", "Phone", "Email", "License #", "Class", "Expiry", "License", "Status"]],
      body: rows,
      styles: { fontSize: 8 },
    });
    doc.save("drivers.pdf");
  };

  // Silence unused-import warning; mergeMetadata is used from the detail page.
  void mergeMetadata;
  void driverToFormDefaults;

  if (primaryRole !== "super_admin" && primaryRole !== "school_admin") {
    return <EmptyState title="Not allowed" description="Only administrators can manage drivers." />;
  }

  return (
    <>
      <PageHeader
        title="Drivers"
        description={isSuper ? "All drivers across every tenant." : "Drivers assigned to your school's fleet."}
        actions={
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!activeSchoolId}>
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
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
                  <Button disabled={!activeSchoolId}><Plus className="mr-2 h-4 w-4" /> Add driver</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Add driver</DialogTitle><DialogDescription className="sr-only">Register a new driver for this school.</DialogDescription></DialogHeader>
                  {activeSchoolId && (
                    <DriverForm
                      submitting={create.isPending}
                      submitLabel="Create driver"
                      accountMode="create"
                      onSubmit={(values, photo, account) => create.mutate({ values, photo, account })}
                    />

                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total drivers" value={totals.total} icon={IdCard} loading={isLoading} />
        <StatCard label="Active" value={totals.active} icon={CheckCircle2} loading={isLoading} tone="success" />
        <StatCard label="License expiring" value={totals.expiring} icon={AlertTriangle} loading={isLoading} tone="warning" />
        <StatCard label="License expired" value={totals.expired} icon={XCircle} loading={isLoading} tone="warning" />
      </div>

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
              placeholder="Search name, phone, license, email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="max-w-sm"
            />
            <Select value={status} onValueChange={(v: StatusFilter) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={licenseFilter} onValueChange={(v: LicenseFilter) => { setLicenseFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="License" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any license</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
                <SelectItem value="expiring">Expiring soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              {filtered.length} driver{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No drivers match"
                description={drivers?.length ? "Try a different search or filter." : "Add your first driver to get started."}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>License</TableHead>
                    <TableHead>Expiry</TableHead>
                    {isSuper && <TableHead>School</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((d) => {
                    const ls = licenseStatus(d.license_expiry);
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 place-items-center rounded-full border bg-muted text-xs">
                              {(d.full_name ?? "?").slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <Link to="/drivers/$driverId" params={{ driverId: d.id }} search={{}} className="font-medium hover:underline">
                                {d.full_name}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {d.metadata?.email ?? d.phone ?? "—"}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{d.phone ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{d.metadata?.email ?? ""}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{d.license_number ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{d.metadata?.license_class ?? ""}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{d.license_expiry ?? "—"}</div>
                          <Badge variant={ls === "expired" ? "destructive" : ls === "expiring" ? "secondary" : "outline"}>
                            {licenseStatusLabel(ls)}
                          </Badge>
                        </TableCell>
                        {isSuper && <TableCell className="text-sm">{d.schools?.name ?? "—"}</TableCell>}
                        <TableCell>
                          <Badge variant={d.is_active ? "default" : "secondary"}>
                            {d.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to="/drivers/$driverId" params={{ driverId: d.id }} search={{}}>
                                  <Eye className="mr-2 h-4 w-4" /> View details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to="/drivers/$driverId" params={{ driverId: d.id }} search={{ edit: 1 }}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setActive.mutate({ id: d.id, is_active: !d.is_active })}>
                                <Power className="mr-2 h-4 w-4" /> {d.is_active ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => { if (confirm(`Delete ${d.full_name}?`)) remove.mutate(d.id); }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
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
    </>
  );
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
