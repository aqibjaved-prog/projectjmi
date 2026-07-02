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
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, Plus, ChevronLeft, ChevronRight, Eye, Pencil, Trash2, Users, CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { ParentForm } from "@/components/parents/parent-form";
import { splitParentPayload, type ParentFormValues, type ParentRow } from "@/lib/parents";

export const Route = createFileRoute("/_authenticated/parents/")({
  head: () => ({ meta: [{ title: "Parents — School Van Guardian" }] }),
  component: ParentsPage,
});

const PAGE_SIZE = 10;
type ParentListRow = ParentRow & { schools?: { id: string; name: string } | null };

function ParentsPage() {
  const { primaryRole, schoolId } = useAuth();
  const qc = useQueryClient();

  const [schoolFilter, setSchoolFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "linked" | "unlinked">("all");
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

  const { data: parents, isLoading } = useQuery({
    queryKey: ["parents-list", isSuper ? schoolFilter : schoolId],
    queryFn: async () => {
      let q = supabase.from("parents").select("*, schools:school_id(id,name)").order("created_at", { ascending: false });
      if (!isSuper && schoolId) q = q.eq("school_id", schoolId);
      else if (isSuper && schoolFilter !== "all") q = q.eq("school_id", schoolFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ParentListRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (parents ?? []).filter((row) => {
      if (s) {
        const blob = `${row.full_name} ${row.phone ?? ""} ${row.email ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      if (status === "linked" && !row.user_id) return false;
      if (status === "unlinked" && row.user_id) return false;
      return true;
    });
  }, [parents, search, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    const list = parents ?? [];
    return {
      total: list.length,
      linked: list.filter((p) => !!p.user_id).length,
      unlinked: list.filter((p) => !p.user_id).length,
    };
  }, [parents]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["parents-list"] });
    qc.invalidateQueries({ queryKey: ["school-stats"] });
  };

  const create = useMutation({
    mutationFn: async ({ values, account }: { values: ParentFormValues; account: { email: string; password: string } | null }) => {
      const target = activeSchoolId;
      if (!target) throw new Error("Select a school first.");
      const payload = splitParentPayload(values);
      const { data: inserted, error } = await supabase
        .from("parents")
        .insert({ ...payload, school_id: target })
        .select("id")
        .single();
      if (error) throw error;
      if (account && inserted?.id) {
        const { provisionPortalAccount } = await import("@/lib/portal-accounts.functions");
        const res = await provisionPortalAccount({
          data: {
            kind: "parent",
            recordId: inserted.id,
            schoolId: target,
            email: account.email,
            password: account.password,
            fullName: payload.full_name,
            phone: payload.phone,
          },
        });
        if (!res.ok) throw new Error(res.error);
      }
    },
    onSuccess: () => { toast.success("Parent added"); invalidate(); setCreateOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Parent deleted"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (primaryRole !== "super_admin" && primaryRole !== "school_admin") {
    return <EmptyState title="Not allowed" description="Only administrators can manage parents." />;
  }

  return (
    <>
      <PageHeader
        title="Parents"
        description={isSuper ? "All parent accounts across every tenant." : "Parents linked to students in your school."}
        actions={
          canManage && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button disabled={!activeSchoolId}><Plus className="mr-2 h-4 w-4" /> Add parent</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader><DialogTitle>Add parent</DialogTitle><DialogDescription className="sr-only">Register a new parent for this school.</DialogDescription></DialogHeader>
                {activeSchoolId && (
                  <ParentForm
                    submitting={create.isPending}
                    submitLabel="Create parent"
                    accountMode="create"
                    onSubmit={(values, account) => create.mutate({ values, account })}
                  />
                )}
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total parents" value={totals.total} icon={Users} loading={isLoading} />
        <StatCard label="Portal login enabled" value={totals.linked} icon={CheckCircle2} loading={isLoading} tone="success" />
        <StatCard label="No login yet" value={totals.unlinked} icon={KeyRound} loading={isLoading} tone="warning" />
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
            <Input placeholder="Search name, phone, email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="max-w-sm" />
            <Select value={status} onValueChange={(v: "all" | "linked" | "unlinked") => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All parents</SelectItem>
                <SelectItem value="linked">With portal login</SelectItem>
                <SelectItem value="unlinked">No login</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">{filtered.length} parent{filtered.length === 1 ? "" : "s"}</div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No parents match" description={parents?.length ? "Try a different search or filter." : "Add your first parent to get started."} />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parent</TableHead>
                    <TableHead>Contact</TableHead>
                    {isSuper && <TableHead>School</TableHead>}
                    <TableHead>Portal</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link to="/parents/$parentId" params={{ parentId: p.id }} className="font-medium hover:underline">
                          {p.full_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{p.phone ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.email ?? ""}</div>
                      </TableCell>
                      {isSuper && <TableCell className="text-sm">{p.schools?.name ?? "—"}</TableCell>}
                      <TableCell>
                        <Badge variant={p.user_id ? "default" : "secondary"}>
                          {p.user_id ? "Login enabled" : "No login"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/parents/$parentId" params={{ parentId: p.id }}>
                                <Eye className="mr-2 h-4 w-4" /> View details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to="/parents/$parentId" params={{ parentId: p.id }} search={{ edit: 1 }}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => { if (confirm(`Delete ${p.full_name}?`)) remove.mutate(p.id); }}
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
