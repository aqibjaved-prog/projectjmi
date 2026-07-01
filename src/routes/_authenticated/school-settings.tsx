import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SchoolForm } from "@/components/schools/school-form";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/school-settings")({
  head: () => ({ meta: [{ title: "School Settings — School Van Guardian" }] }),
  component: SchoolSettingsPage,
});

function SchoolSettingsPage() {
  const { schoolId, primaryRole } = useAuth();
  const qc = useQueryClient();

  const { data: school, isLoading } = useQuery({
    enabled: !!schoolId,
    queryKey: ["my-school", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data, error } = await supabase.from("schools").select("*").eq("id", schoolId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateMut = useMutation({
    mutationFn: async (values: Parameters<Parameters<typeof SchoolForm>[0]["onSubmit"]>[0]) => {
      if (!schoolId) throw new Error("No school");
      const { error } = await supabase
        .from("schools")
        .update({
          name: values.name,
          contact_person: values.contact_person || null,
          email: values.email || null,
          phone: values.phone || null,
          address: values.address || null,
          city: values.city || null,
          country: values.country || null,
          logo_url: values.logo_url ?? null,
        })
        .eq("id", schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("School details updated");
      qc.invalidateQueries({ queryKey: ["my-school", schoolId] });
      qc.invalidateQueries({ queryKey: ["header-school", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (primaryRole !== "school_admin") {
    return <EmptyState title="Not available" description="Only school administrators can edit school settings." />;
  }

  return (
    <>
      <PageHeader title="School settings" description="Update the details for your school." />
      <Card className="max-w-3xl">
        <CardHeader><CardTitle>{school?.name ?? "Your school"}</CardTitle></CardHeader>
        <CardContent>
          {isLoading || !school ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <SchoolForm
              defaultValues={{
                id: school.id,
                name: school.name,
                contact_person: school.contact_person ?? "",
                email: school.email ?? "",
                phone: school.phone ?? "",
                address: school.address ?? "",
                city: school.city ?? "",
                country: school.country ?? "",
                logo_url: school.logo_url,
              }}
              submitting={updateMut.isPending}
              submitLabel="Save changes"
              onSubmit={(v) => updateMut.mutate(v)}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
