import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PlanForm } from "@/components/plans/plan-form";
import { formatPrice, formatLimit, type Plan, type PlanFormValues } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [{ title: "Subscription plans" }] }),
  component: PlansPage,
});

function PlansPage() {
  const { primaryRole } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("price_cents", { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
  });

  const create = useMutation({
    mutationFn: async (v: PlanFormValues) => {
      const { error } = await supabase.from("subscription_plans").insert({
        ...v,
        features: v.features,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan created");
      qc.invalidateQueries({ queryKey: ["plans"] });
      setCreateOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: PlanFormValues }) => {
      const { error } = await supabase
        .from("subscription_plans")
        .update({ ...values, features: values.features })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan updated");
      qc.invalidateQueries({ queryKey: ["plans"] });
      setEditPlan(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan deleted");
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Plan in use — cannot delete."),
  });

  if (primaryRole !== "super_admin") {
    return <EmptyState title="Not allowed" description="Only Super Admins can manage plans." />;
  }

  return (
    <>
      <PageHeader
        title="Subscription plans"
        description="Catalog of plans schools can subscribe to."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New plan</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Create plan</DialogTitle></DialogHeader>
              <PlanForm submitLabel="Create plan" submitting={create.isPending} onSubmit={(v) => create.mutate(v)} />
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !plans || plans.length === 0 ? (
            <div className="p-4"><EmptyState title="No plans yet" description="Create your first plan." /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Vehicles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.code}</div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{p.tier}</Badge></TableCell>
                    <TableCell className="capitalize">{p.billing_cycle}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(p)}</TableCell>
                    <TableCell className="text-right">{formatLimit(p.student_limit)}</TableCell>
                    <TableCell className="text-right">{formatLimit(p.vehicle_limit)}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "outline"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditPlan(p)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => { if (confirm(`Delete plan "${p.name}"?`)) remove.mutate(p.id); }}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editPlan} onOpenChange={(o) => !o && setEditPlan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit plan</DialogTitle></DialogHeader>
          {editPlan && (
            <PlanForm
              defaultValues={editPlan}
              submitLabel="Save changes"
              submitting={update.isPending}
              onSubmit={(v) => update.mutate({ id: editPlan.id, values: v })}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
