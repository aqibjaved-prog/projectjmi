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
  Upload, Download, Users, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { StudentForm } from "@/components/students/student-form";
import { cleanNullable, type StudentRow, type StudentFormValues } from "@/lib/students";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({ meta: [{ title: "Students — School Van Guardian" }] }),
  component: StudentsPage,
});

const PAGE_SIZE = 10;
type StatusFilter = "all" | "active" | "inactive";

type StudentListRow = StudentRow & {
  routes?: { id: string; name: string } | null;
  vehicles?: { id: string; registration_number: string } | null;
  schools?: { id: string; name: string } | null;
};

function StudentsPage() {
  const { primaryRole, schoolId } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
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

  const { data: students, isLoading } = useQuery({
    queryKey: ["students-list", isSuper ? schoolFilter : schoolId],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("*, routes:route_id(id,name), vehicles:vehicle_id(id,registration_number), schools:school_id(id,name)")
        .order("created_at", { ascending: false });
      if (!isSuper && schoolId) q = q.eq("school_id", schoolId);
      else if (isSuper && schoolFilter !== "all") q = q.eq("school_id", schoolFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StudentListRow[];
    },
  });

  const classes = useMemo(
    () => Array.from(new Set((students ?? []).map((s) => s.grade).filter(Boolean))) as string[],
    [students],
  );
  const sections = useMemo(
    () => Array.from(new Set((students ?? []).map((s) => s.class_section).filter(Boolean))) as string[],
    [students],
  );
  const routes = useMemo(() => {
    const map = new Map<string, string>();
    (students ?? []).forEach((s) => s.routes && map.set(s.routes.id, s.routes.name));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [students]);
  const vehicles = useMemo(() => {
    const map = new Map<string, string>();
    (students ?? []).forEach((s) => s.vehicles && map.set(s.vehicles.id, s.vehicles.registration_number));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [students]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (students ?? []).filter((row) => {
      if (s) {
        const blob = `${row.full_name} ${row.admission_number ?? ""} ${row.roll_number ?? ""} ${row.parent_name ?? ""} ${row.parent_phone ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (classFilter !== "all" && row.grade !== classFilter) return false;
      if (sectionFilter !== "all" && row.class_section !== sectionFilter) return false;
      if (routeFilter !== "all" && row.route_id !== routeFilter) return false;
      if (vehicleFilter !== "all" && row.vehicle_id !== vehicleFilter) return false;
      return true;
    });
  }, [students, search, status, classFilter, sectionFilter, routeFilter, vehicleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const list = students ?? [];
    return {
      total: list.length,
      active: list.filter((s) => s.is_active).length,
      inactive: list.filter((s) => !s.is_active).length,
    };
  }, [students]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["students-list"] });
    qc.invalidateQueries({ queryKey: ["school-stats"] });
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
  };

  const create = useMutation({
    mutationFn: async (values: StudentFormValues & { photo_url?: string | null }) => {
      const target = activeSchoolId;
      if (!target) throw new Error("Select a school first.");
      const payload = cleanNullable({
        ...values,
        school_id: target,
        full_name: `${values.first_name ?? ""} ${values.last_name ?? ""}`.trim(),
      });
      const { error } = await supabase.from("students").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student added");
      invalidate();
      setCreateOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const setActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("students").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.is_active ? "Student activated" : "Student deactivated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Student deleted"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // ---------- Import ----------
  const importRows = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const target = activeSchoolId;
      if (!target) throw new Error("Select a school first.");
      const payload = rows
        .filter((r) => r && (r.first_name || r.full_name))
        .map((r) => cleanNullable({
          school_id: target,
          first_name: (r.first_name as string) ?? null,
          last_name: (r.last_name as string) ?? null,
          full_name: ((r.full_name as string) ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()) || "Unnamed",
          admission_number: (r.admission_number as string) ?? null,
          roll_number: (r.roll_number as string) ?? null,
          grade: (r.grade as string) ?? (r.class as string) ?? null,
          class_section: (r.class_section as string) ?? (r.section as string) ?? null,
          gender: (r.gender as string) ?? null,
          blood_group: (r.blood_group as string) ?? null,
          date_of_birth: (r.date_of_birth as string) ?? null,
          parent_name: (r.parent_name as string) ?? null,
          parent_phone: (r.parent_phone as string) ?? null,
          parent_email: (r.parent_email as string) ?? null,
          emergency_contact: (r.emergency_contact as string) ?? null,
          pickup_address: (r.pickup_address as string) ?? null,
          drop_address: (r.drop_address as string) ?? null,
          is_active: r.is_active === false || r.is_active === "false" ? false : true,
        }));
      if (payload.length === 0) throw new Error("No valid rows found.");
      const { error } = await supabase.from("students").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => { toast.success(`Imported ${n} students`); invalidate(); },
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
    filtered.map((s) => ({
      student_code: s.student_code ?? "",
      admission_number: s.admission_number ?? "",
      roll_number: s.roll_number ?? "",
      full_name: s.full_name,
      first_name: s.first_name ?? "",
      last_name: s.last_name ?? "",
      grade: s.grade ?? "",
      class_section: s.class_section ?? "",
      gender: s.gender ?? "",
      blood_group: s.blood_group ?? "",
      date_of_birth: s.date_of_birth ?? "",
      parent_name: s.parent_name ?? "",
      parent_phone: s.parent_phone ?? "",
      parent_email: s.parent_email ?? "",
      pickup_address: s.pickup_address ?? "",
      drop_address: s.drop_address ?? "",
      route: s.routes?.name ?? "",
      vehicle: s.vehicles?.registration_number ?? "",
      status: s.is_active ? "active" : "inactive",
    }));

  const exportCSV = () => {
    const csv = Papa.unparse(exportData());
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(URL.createObjectURL(blob), "students.csv");
  };
  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(exportData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "students.xlsx");
  };
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Students", 14, 14);
    const rows = exportData().map((r) => [
      r.student_code, r.admission_number, r.full_name, r.grade, r.class_section,
      r.parent_name, r.parent_phone, r.route, r.vehicle, r.status,
    ]);
    autoTable(doc, {
      startY: 20,
      head: [["Code", "Admission", "Name", "Class", "Section", "Parent", "Phone", "Route", "Vehicle", "Status"]],
      body: rows,
      styles: { fontSize: 8 },
    });
    doc.save("students.pdf");
  };

  if (primaryRole !== "super_admin" && primaryRole !== "school_admin") {
    return <EmptyState title="Not allowed" description="Only administrators can manage students." />;
  }

  return (
    <>
      <PageHeader
        title="Students"
        description={isSuper ? "All students across every tenant." : "Manage students enrolled in transport."}
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
                  <Button disabled={!activeSchoolId}><Plus className="mr-2 h-4 w-4" /> Add student</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Add student</DialogTitle></DialogHeader>
                  {activeSchoolId && (
                    <StudentForm
                      schoolId={activeSchoolId}
                      submitting={create.isPending}
                      submitLabel="Create student"
                      onSubmit={(v) => create.mutate(v)}
                    />
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total students" value={totals.total} icon={Users} loading={isLoading} />
        <StatCard label="Active" value={totals.active} icon={CheckCircle2} loading={isLoading} tone="success" />
        <StatCard label="Inactive" value={totals.inactive} icon={XCircle} loading={isLoading} tone="warning" />
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
              placeholder="Search name, admission, roll, parent, phone…"
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
            <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sectionFilter} onValueChange={(v) => { setSectionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Section" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={routeFilter} onValueChange={(v) => { setRouteFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Route" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All routes</SelectItem>
                {routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={vehicleFilter} onValueChange={(v) => { setVehicleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Vehicle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vehicles</SelectItem>
                {vehicles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              {filtered.length} student{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No students match"
                description={students?.length ? "Try a different search or filter." : "Add your first student to get started."}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Route / Vehicle</TableHead>
                    {isSuper && <TableHead>School</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border bg-muted text-xs">
                            {s.photo_url ? <img src={s.photo_url} alt="" className="h-full w-full object-cover" /> : (s.full_name ?? "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <Link to="/students/$studentId" params={{ studentId: s.id }} search={{}} className="font-medium hover:underline">
                              {s.full_name}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {s.student_code ?? "—"}{s.admission_number ? ` · ${s.admission_number}` : ""}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{s.grade ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.class_section ? `Sec ${s.class_section}` : ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{s.parent_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.parent_phone ?? s.parent_email ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{s.routes?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.vehicles?.registration_number ?? ""}</div>
                      </TableCell>
                      {isSuper && <TableCell className="text-sm">{s.schools?.name ?? "—"}</TableCell>}
                      <TableCell>
                        <Badge variant={s.is_active ? "default" : "secondary"}>
                          {s.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/students/$studentId" params={{ studentId: s.id }} search={{}}>
                                <Eye className="mr-2 h-4 w-4" /> View details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to="/students/$studentId" params={{ studentId: s.id }} search={{ edit: 1 }}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setActive.mutate({ id: s.id, is_active: !s.is_active })}>
                              <Power className="mr-2 h-4 w-4" /> {s.is_active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => { if (confirm(`Delete ${s.full_name}?`)) remove.mutate(s.id); }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
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
