import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontal, Plus, AlertTriangle, ChevronLeft, ChevronRight, Eye, Pencil, Power, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SchoolForm } from "@/components/schools/school-form";
import { slugify } from "@/lib/schools";
import { expiryState, periodEndFor } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/schools")({
  head: () => ({ meta: [{ title: "Schools — School Van Guardian" }] }),
  component: SchoolsPage,
});

type SchoolRow = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  contact_person: string | null;
  logo_url: string | null;
  status: "active" | "suspended" | "pending";
  created_at: string;
  subscriptions?: Array<{ plan_id: string | null; billing_cycle: string; status: string; current_period_end: string | null; subscription_plans?: { name: string; tier: string } | null }> | null;
};

type Filter = "all" | "active" | "suspended" | "expired";
const PAGE_SIZE = 10;

function SchoolsPage() {
  const { primaryRole } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: schools, isLoading } = useQuery({
    queryKey: ["schools-with-subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("*, subscriptions(plan_id, billing_cycle, status, current_period_end, subscription_plans:plan_id(name, tier))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SchoolRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (schools ?? []).filter((row) => {
      if (s) {
        const blob = `${row.name} ${row.email ?? ""} ${row.city ?? ""} ${row.contact_person ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      const sub = row.subscriptions?.[0];
      const expiry = expiryState(sub?.current_period_end);
      if (filter === "active" && row.status !== "active") return false;
      if (filter === "suspended" && row.status !== "suspended") return false;
      if (filter === "expired" && expiry !== "expired") return false;
      return true;
    });
  }, [schools, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase.from("schools").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "active" ? "School activated" : "School suspended");
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schools").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School deleted");
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const create = useMutation({
    mutationFn: async (values: {
      name: string; contact_person?: string; email?: string; phone?: string;
      address?: string; city?: string; country?: string; logo_url?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("schools")
        .insert({
          name: values.name,
          slug: slugify(values.name),
          contact_person: values.contact_person || null,
          email: values.email || null,
          phone: values.phone || null,
          address: values.address || null,
          city: values.city || null,
          country: values.country || null,
          logo_url: values.logo_url || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // seed a trial subscription from the active Trial plan in the catalog
      const { data: trial } = await supabase
        .from("subscription_plans")
        .select("id, code, price_cents, currency, billing_cycle, duration_days")
        .eq("tier", "trial")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const start = new Date();
      const end = periodEndFor(start, trial?.billing_cycle ?? "trial", trial?.duration_days ?? 30);
      await supabase.from("subscriptions").insert({
        school_id: data.id,
        plan_id: trial?.id ?? null,
        plan_name: trial?.code ?? "trial",
        billing_cycle: trial?.billing_cycle ?? "trial",
        status: "trialing",
        payment_status: "pending",
        seats: 0,
        amount_cents: trial?.price_cents ?? 0,
        currency: trial?.currency ?? "USD",
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
        renewal_date: end.toISOString(),
      });
      if (trial) {
        await supabase.from("subscription_history").insert({
          school_id: data.id,
          to_plan: trial.code,
          to_cycle: trial.billing_cycle,
          action: "created",
          amount_cents: trial.price_cents,
          currency: trial.currency,
          period_start: start.toISOString(),
          period_end: end.toISOString(),
          notes: "Initial trial assigned on school creation",
        });
      }
      return data;
    },
    onSuccess: () => {
      toast.success("School created");
      qc.invalidateQueries({ queryKey: ["schools-with-subs"] });
      qc.invalidateQueries({ queryKey: ["platform-stats"] });
      setCreateOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (primaryRole !== "super_admin") {
    return <EmptyState title="Not allowed" description="Only Super Admins can manage schools." />;
  }

  return (
    <>
      <PageHeader
        title="Schools"
        description="Manage every school on the platform. Each tenant is fully isolated."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Add school</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Create school</DialogTitle></DialogHeader>
              <SchoolForm
                submitLabel="Create school"
                submitting={create.isPending}
                onSubmit={(v) => create.mutate(v)}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b p-3">
            <Input
              placeholder="Search by name, email, city…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="max-w-sm"
            />
            <Select value={filter} onValueChange={(v: Filter) => { setFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schools</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="expired">Expired subscription</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              {filtered.length} school{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No schools match"
                description={schools?.length ? "Try a different search or filter." : "Create your first school to get started."}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>School</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Renews</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((s) => {
                    const sub = s.subscriptions?.[0];
                    const planName = sub?.subscription_plans?.name ?? "—";
                    const expiry = expiryState(sub?.current_period_end);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-md border bg-muted text-xs">
                              {s.logo_url ? <img src={s.logo_url} alt="" className="h-full w-full object-cover" /> : s.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <Link to="/schools/$schoolId" params={{ schoolId: s.id }} className="font-medium hover:underline">
                                {s.name}
                              </Link>
                              <div className="text-xs text-muted-foreground">{s.city ?? "—"}{s.country ? `, ${s.country}` : ""}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{s.contact_person ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{s.email ?? s.phone ?? "—"}</div>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{plan.name}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={s.status === "active" ? "default" : s.status === "suspended" ? "destructive" : "secondary"} className="capitalize">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {sub?.current_period_end ? (
                            <div className="flex items-center gap-1.5 text-sm">
                              {expiry === "expired" || expiry === "expiring_soon" ? (
                                <AlertTriangle className={`h-3.5 w-3.5 ${expiry === "expired" ? "text-destructive" : "text-amber-500"}`} />
                              ) : null}
                              <span className={expiry === "expired" ? "text-destructive" : ""}>
                                {new Date(sub.current_period_end).toLocaleDateString()}
                              </span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to="/schools/$schoolId" params={{ schoolId: s.id }}>
                                  <Eye className="mr-2 h-4 w-4" /> View details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to="/schools/$schoolId" params={{ schoolId: s.id }} search={{ edit: 1 }}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {s.status === "active" ? (
                                <DropdownMenuItem onClick={() => setStatus.mutate({ id: s.id, status: "suspended" })}>
                                  <Power className="mr-2 h-4 w-4" /> Suspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setStatus.mutate({ id: s.id, status: "active" })}>
                                  <Power className="mr-2 h-4 w-4" /> Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete ${s.name}? This removes ALL of its data.`)) remove.mutate(s.id);
                                }}
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
