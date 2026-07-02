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
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ParentForm } from "@/components/parents/parent-form";
import { parentToFormDefaults, splitParentPayload, type ParentFormValues, type ParentRow } from "@/lib/parents";

type Detail = ParentRow & { schools?: { id: string; name: string } | null };

export const Route = createFileRoute("/_authenticated/parents/$parentId")({
  head: () => ({ meta: [{ title: "Parent — School Van Guardian" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ edit: s.edit ? 1 : undefined } as { edit?: number }),
  component: ParentDetailPage,
});

function ParentDetailPage() {
  const { parentId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(!!search.edit);

  useEffect(() => { setEditOpen(!!search.edit); }, [search.edit]);

  const { data: parent, isLoading } = useQuery({
    queryKey: ["parent", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parents")
        .select("*, schools:school_id(id,name)")
        .eq("id", parentId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Detail | null;
    },
  });

  const { data: linkedEmail } = useQuery({
    enabled: !!parent?.user_id,
    queryKey: ["parent-linked-email", parent?.user_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("email").eq("id", parent!.user_id!).maybeSingle();
      return (data?.email as string | undefined) ?? null;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["parent", parentId] });
    qc.invalidateQueries({ queryKey: ["parent-linked-email"] });
    qc.invalidateQueries({ queryKey: ["parents-list"] });
  };

  const update = useMutation({
    mutationFn: async ({ values, account }: { values: ParentFormValues; account: { email: string; password: string } | null }) => {
      if (!parent) throw new Error("Parent not loaded");
      const payload = splitParentPayload(values);
      const { error } = await supabase.from("parents").update(payload).eq("id", parent.id);
      if (error) throw error;

      if (account) {
        const emailChanged = !!parent.user_id && !!account.email && account.email !== (linkedEmail ?? "");
        const wantsPassword = !!account.password;
        if (!parent.user_id) {
          const { provisionPortalAccount } = await import("@/lib/portal-accounts.functions");
          const res = await provisionPortalAccount({
            data: {
              kind: "parent",
              recordId: parent.id,
              schoolId: parent.school_id,
              email: account.email,
              password: account.password,
              fullName: payload.full_name,
              phone: payload.phone,
            },
          });
          if (!res.ok) throw new Error(res.error);
        } else {
          if (emailChanged) {
            const { updatePortalEmail } = await import("@/lib/portal-accounts.functions");
            const res = await updatePortalEmail({
              data: { kind: "parent", recordId: parent.id, schoolId: parent.school_id, email: account.email },
            });
            if (!res.ok) throw new Error(res.error);
          }
          if (wantsPassword) {
            const { resetPortalPassword } = await import("@/lib/portal-accounts.functions");
            const res = await resetPortalPassword({
              data: { kind: "parent", recordId: parent.id, schoolId: parent.school_id, password: account.password },
            });
            if (!res.ok) throw new Error(res.error);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Parent updated");
      invalidate();
      setEditOpen(false);
      navigate({ to: "/parents/$parentId", params: { parentId }, search: { edit: undefined } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("parents").delete().eq("id", parentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parent deleted");
      invalidate();
      navigate({ to: "/parents" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const defaults = useMemo(() => (parent ? parentToFormDefaults(parent) : undefined), [parent]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!parent) return <EmptyState title="Parent not found" description="This parent may have been deleted." />;

  return (
    <>
      <PageHeader
        title={parent.full_name}
        description={parent.schools?.name ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/parents"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
            </Button>
            <Button onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
            <Button variant="destructive" onClick={() => { if (confirm(`Delete ${parent.full_name}?`)) remove.mutate(); }}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Info label="Full name" value={parent.full_name} />
            <Info label="Phone" value={parent.phone} />
            <Info label="Email" value={parent.email} />
            <Info label="Address" value={parent.address} />
            <Info label="Created" value={new Date(parent.created_at).toLocaleString()} />
            <Info label="Last updated" value={new Date(parent.updated_at).toLocaleString()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Portal login</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Info
              label="Status"
              value={
                <Badge variant={parent.user_id ? "default" : "secondary"}>
                  {parent.user_id ? "Login enabled" : "No login yet"}
                </Badge>
              }
            />
            <Info label="Linked email" value={linkedEmail ?? "—"} />
            <p className="text-xs text-muted-foreground">
              Use Edit to {parent.user_id ? "reset the password or change the email" : "create a login account"} for this parent.
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) navigate({ to: "/parents/$parentId", params: { parentId }, search: { edit: undefined } });
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit parent</DialogTitle><DialogDescription className="sr-only">Update parent details and portal login.</DialogDescription></DialogHeader>
          {defaults && (
            <ParentForm
              defaultValues={defaults}
              submitting={update.isPending}
              submitLabel="Save changes"
              accountMode="edit"
              hasAccount={!!parent.user_id}
              linkedEmail={linkedEmail ?? null}
              onSubmit={(values, account) => update.mutate({ values, account })}
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
