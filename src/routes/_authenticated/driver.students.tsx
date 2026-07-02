import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDriverStudents } from "@/lib/driver-portal";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/driver/students")({
  head: () => ({ meta: [{ title: "My Students" }] }),
  component: StudentsPage,
});

function StudentsPage() {
  const { data, isLoading } = useDriverStudents();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter((r) =>
      r.full_name.toLowerCase().includes(s) ||
      (r.student_code ?? "").toLowerCase().includes(s) ||
      (r.grade ?? "").toLowerCase().includes(s) ||
      (r.pickup_address ?? "").toLowerCase().includes(s),
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <PageHeader title="My students" description="Students assigned to your route." />
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">{isLoading ? "Loading…" : `${filtered.length} student(s)`}</CardTitle>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code / stop" className="pl-8" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-40 w-full" /> : filtered.length === 0 ? (
            <EmptyState title="No students" description="You have no students assigned to your route yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14"></TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Drop</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Avatar className="h-9 w-9">
                        {s.photo_url && <AvatarImage src={s.photo_url} />}
                        <AvatarFallback>{s.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{s.full_name}</div>
                      <div className="text-xs text-muted-foreground">{s.student_code ?? "—"}</div>
                    </TableCell>
                    <TableCell>{[s.grade, s.class_section].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{s.pickup_address ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{s.drop_address ?? "—"}</TableCell>
                    <TableCell className="text-sm">{s.parent_name ?? "—"}<div className="text-xs text-muted-foreground">{s.parent_phone ?? ""}</div></TableCell>
                    <TableCell><Badge variant="outline">Active</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
