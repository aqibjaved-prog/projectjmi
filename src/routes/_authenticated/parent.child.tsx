import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Baby, Bus, MapPin, Phone, Route as RouteIcon, School as SchoolIcon, ShieldAlert, User } from "lucide-react";
import { useParentChildren } from "@/hooks/use-parent-children";

export const Route = createFileRoute("/_authenticated/parent/child")({
  head: () => ({ meta: [{ title: "My children" }] }),
  component: ParentChildrenPage,
});

function ParentChildrenPage() {
  const { data: children, isLoading } = useParentChildren();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = children?.find((c) => c.id === selectedId) ?? children?.[0];

  if (isLoading) return <Skeleton className="h-96" />;
  if (!children || children.length === 0) {
    return (
      <>
        <PageHeader title="My children" description="Students registered against your mobile number." />
        <EmptyState title="No children linked" description="Contact your school to register your mobile number." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="My children" description={`${children.length} child${children.length > 1 ? "ren" : ""} linked to your account.`} />

      {children.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {children.map((c) => {
            const active = (selected?.id ?? children[0].id) === c.id;
            return (
              <Button
                key={c.id}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setSelectedId(c.id)}
              >
                <Baby className="mr-2 h-4 w-4" />
                {c.full_name}
              </Button>
            );
          })}
        </div>
      )}

      {selected && (
        <Card>
          <CardHeader className="flex-row items-center gap-4 space-y-0">
            <Avatar className="h-16 w-16">
              <AvatarImage src={selected.photo_url ?? undefined} />
              <AvatarFallback className="text-lg">
                {selected.full_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle>{selected.full_name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {selected.grade ? `Grade ${selected.grade}` : ""}
                {selected.class_section ? ` · Section ${selected.class_section}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Admission #{selected.admission_number ?? "—"} · {selected.student_code ?? "—"}
              </p>
            </div>
            <Badge variant="secondary">{selected.schools?.name ?? "—"}</Badge>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Section title="Transport">
              <Row icon={RouteIcon} label="Route" value={selected.routes?.name ?? "Not assigned"} />
              <Row icon={Bus} label="Vehicle" value={selected.vehicles?.registration_number ?? "—"} />
              <Row icon={User} label="Driver" value={selected.drivers?.full_name ?? "Unassigned"} />
              {selected.drivers?.phone ? (
                <Row icon={Phone} label="Driver phone" value={selected.drivers.phone} />
              ) : null}
            </Section>
            <Section title="Addresses">
              <Row icon={MapPin} label="Pickup" value={selected.pickup_address ?? "—"} />
              <Row icon={MapPin} label="Drop" value={selected.drop_address ?? "—"} />
            </Section>
            <Section title="Emergency">
              <Row icon={ShieldAlert} label="Emergency contact" value={selected.emergency_contact ?? "—"} />
              <Row icon={Phone} label="Parent phone" value={selected.parent_phone ?? "—"} />
            </Section>
            <Section title="School">
              <Row icon={SchoolIcon} label="School" value={selected.schools?.name ?? "—"} />
            </Section>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="break-words">{value}</div>
      </div>
    </div>
  );
}
