import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MoreHorizontal, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  createSchoolAdmin,
  updateSchoolAdmin,
  resetSchoolAdminPassword,
  deactivateSchoolAdmin,
  activateSchoolAdmin,
  deleteSchoolAdmin,
  listSchoolAdmins,
} from "@/lib/school-admins.functions";

export const Route = createFileRoute("/_authenticated/school-admins")({
  head: () => ({ meta: [{ title: "School Admins — School Van Guardian" }] }),
  component: SchoolAdminsPage,
});

type Admin = Awaited<ReturnType<typeof listSchoolAdmins>>[number];

function SchoolAdminsPage() {
  const { primaryRole } = useAuth();
  const qc = useQueryClient();

  const listFn = useServerFn(listSchoolAdmins);
  const createFn = useServerFn(createSchoolAdmin);
  const updateFn = useServerFn(updateSchoolAdmin);
  const resetFn = useServerFn(resetSchoolAdminPassword);
  const deactivateFn = useServerFn(deactivateSchoolAdmin);
  const activateFn = useServerFn(activateSchoolAdmin);
  const deleteFn = useServerFn(deleteSchoolAdmin);

  const { data: admins, isLoading } = useQuery({
    enabled: primaryRole === "super_admin",
    queryKey: ["school-admins"],
    queryFn: () => listFn(),
  });

  const { data: schools } = useQuery({
    enabled: primaryRole === "super_admin",
    queryKey: ["schools-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Admin | null>(null);
  const [resetting, setResetting] = useState<Admin | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["school-admins"] });

  const createMut = useMutation({
    mutationFn: (data: { email: string; password: string; fullName: string; phone?: string; schoolId: string }) =>
      createFn({ data }),
    onSuccess: (res) => {
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("School admin created"); invalidate(); setCreateOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const updateMut = useMutation({
    mutationFn: (data: { userId: string; fullName?: string; phone?: string | null; schoolId?: string }) =>
      updateFn({ data }),
    onSuccess: () => { toast.success("Updated"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (data: { userId: string; password: string }) => resetFn({ data }),
    onSuccess: () => { toast.success("Password reset"); setResetting(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (admins ?? []).filter((a) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return a.email.toLowerCase().includes(s) || a.fullName.toLowerCase().includes(s) || a.schoolName.toLowerCase().includes(s);
  });

  if (primaryRole !== "super_admin") {
    return <EmptyState title="Not authorized" description="Only Super Admins can manage school administrators." />;
  }

  return (
    <>
      <PageHeader
        title="School Admins"
        description="Create and manage administrator accounts for each school."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New school admin</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create school admin</DialogTitle><DialogDescription className="sr-only">Invite a new administrator for a school.</DialogDescription></DialogHeader>
              <CreateForm schools={schools ?? []} pending={createMut.isPending} onSubmit={(v) => createMut.mutate(v)} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4">
        <Input placeholder="Search by name, email, or school…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No school admins yet" description="Create the first school admin to get started." />
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <Card key={a.userId}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{a.fullName || a.email}</span>
                    <Badge variant={a.active ? "secondary" : "destructive"}>{a.active ? "Active" : "Deactivated"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{a.email} · {a.schoolName}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(a)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setResetting(a)}>Reset password</DropdownMenuItem>
                    {a.active ? (
                      <DropdownMenuItem
                        onClick={() => deactivateFn({ data: { userId: a.userId } }).then(() => { toast.success("Deactivated"); invalidate(); }).catch((e) => toast.error(e.message))}
                      >Deactivate</DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => activateFn({ data: { userId: a.userId } }).then(() => { toast.success("Activated"); invalidate(); }).catch((e) => toast.error(e.message))}
                      >Activate</DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (!confirm(`Delete admin ${a.email}? This removes their login.`)) return;
                        deleteFn({ data: { userId: a.userId } }).then(() => { toast.success("Deleted"); invalidate(); }).catch((e) => toast.error(e.message));
                      }}
                    >Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit school admin</DialogTitle><DialogDescription className="sr-only">Update this administrator's details.</DialogDescription></DialogHeader>
          {editing && (
            <EditForm
              admin={editing}
              schools={schools ?? []}
              pending={updateMut.isPending}
              onSubmit={(v) => updateMut.mutate({ userId: editing.userId, ...v })}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription className="sr-only">Set a new password for this administrator.</DialogDescription></DialogHeader>
          {resetting && (
            <ResetForm
              admin={resetting}
              pending={resetMut.isPending}
              onSubmit={(password) => resetMut.mutate({ userId: resetting.userId, password })}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateForm({ schools, pending, onSubmit }: { schools: { id: string; name: string }[]; pending: boolean; onSubmit: (v: { email: string; password: string; fullName: string; phone?: string; schoolId: string }) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [schoolId, setSchoolId] = useState("");

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!schoolId) return toast.error("Select a school"); onSubmit({ email, password, fullName, phone: phone || undefined, schoolId }); }} className="space-y-4">
      <div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Temporary password</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
      <div className="space-y-2"><Label>Phone (optional)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div className="space-y-2">
        <Label>School</Label>
        <Select value={schoolId} onValueChange={setSchoolId}>
          <SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger>
          <SelectContent>
            {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button>
      </DialogFooter>
    </form>
  );
}

function EditForm({ admin, schools, pending, onSubmit }: { admin: Admin; schools: { id: string; name: string }[]; pending: boolean; onSubmit: (v: { fullName?: string; phone?: string | null; schoolId?: string }) => void }) {
  const [fullName, setFullName] = useState(admin.fullName);
  const [phone, setPhone] = useState(admin.phone ?? "");
  const [schoolId, setSchoolId] = useState(admin.schoolId ?? "");

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ fullName, phone: phone || null, schoolId: schoolId || undefined }); }} className="space-y-4">
      <div className="space-y-2"><Label>Email</Label><Input value={admin.email} disabled /></div>
      <div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div className="space-y-2">
        <Label>Assigned school</Label>
        <Select value={schoolId} onValueChange={setSchoolId}>
          <SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger>
          <SelectContent>
            {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
      </DialogFooter>
    </form>
  );
}

function ResetForm({ admin, pending, onSubmit }: { admin: Admin; pending: boolean; onSubmit: (p: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(password); }} className="space-y-4">
      <p className="text-sm text-muted-foreground">Set a new temporary password for <span className="font-medium">{admin.email}</span>.</p>
      <div className="space-y-2"><Label>New password</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reset password</Button>
      </DialogFooter>
    </form>
  );
}
