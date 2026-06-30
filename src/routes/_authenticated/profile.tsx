import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile" }] }),
  component: Profile,
});

function Profile() {
  const { user, roles, primaryRole } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      setFullName(data?.full_name ?? "");
      setPhone(data?.phone ?? "");
      setLoading(false);
    });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, full_name: fullName, phone, email: user.email });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  };

  return (
    <>
      <PageHeader title="My profile" description="Manage your account information." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Account details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fn">Full name</Label>
              <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ph">Phone</Label>
              <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} />
            </div>
            <Button onClick={save} disabled={busy || loading}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-muted-foreground">Primary</div>
            <Badge variant="secondary" className="capitalize">{primaryRole?.replace("_", " ") ?? "none"}</Badge>
            <div className="mt-4 text-xs text-muted-foreground">All assignments</div>
            <div className="flex flex-wrap gap-1">
              {roles.length === 0 && <span className="text-sm text-muted-foreground">No roles</span>}
              {roles.map((r, i) => (
                <Badge key={i} variant="outline" className="capitalize">
                  {r.role.replace("_", " ")}
                  {r.school_id && <span className="ml-1 opacity-60">· school</span>}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
