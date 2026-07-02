import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Database, HardDrive, Shield, Users, FolderTree, Layers, Rocket, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { getDevDocsSnapshot, type DevDocsSnapshot } from "@/lib/dev-docs.functions";

export const Route = createFileRoute("/_authenticated/dev-docs")({
  head: () => ({
    meta: [{ title: "Developer Docs — School Van Guardian" }],
  }),
  component: DevDocsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <PageHeader title="Developer Docs" description="Failed to load documentation." />
        <div className="rounded-lg border bg-destructive/5 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
        <Button
          className="mt-4"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

// ─── Static, curated documentation ───────────────────────────────────────────

const ARCHITECTURE = `
School Van Guardian is a multi-tenant SaaS built on TanStack Start v1 (React 19,
Vite 7) with Lovable Cloud (Supabase) as the backend. Server logic runs as
TanStack server functions (createServerFn) executing on Cloudflare Workers.
Row-Level Security enforces tenant isolation for every school-scoped table.
`.trim();

const FOLDER_STRUCTURE = `
src/
├── routes/
│   ├── __root.tsx                 Root layout, providers, head metadata
│   ├── index.tsx                  Public landing
│   ├── auth.tsx                   Sign-in / sign-up
│   └── _authenticated/
│       ├── route.tsx              Auth gate (integration-managed)
│       ├── dashboard.tsx          Role-aware dashboards
│       ├── schools*.tsx           School CRUD + detail
│       ├── school-admins.tsx      Super-admin managed accounts
│       ├── subscriptions.tsx      Plan assignment per school
│       ├── plans.tsx              Plan CRUD
│       ├── students*.tsx          Student CRUD + profile + QR
│       ├── drivers*.tsx           Driver CRUD + profile + license
│       └── dev-docs.tsx           This page (super-admin only)
├── components/
│   ├── layout/                    Sidebar, header
│   ├── ui/                        shadcn primitives
│   ├── schools/  students/  drivers/   Feature forms
│   └── page-header.tsx
├── lib/
│   ├── *.functions.ts             createServerFn endpoints
│   ├── auth-context.tsx           useAuth() hook
│   └── schools.ts / students.ts / drivers.ts   Zod schemas + helpers
├── integrations/supabase/         Generated clients (do not edit)
└── styles.css                     Tailwind v4 theme tokens
`.trim();

const USER_ROLES = [
  { role: "super_admin", scope: "Platform-wide", capabilities: "Manage schools, plans, subscriptions, school admins. Full access." },
  { role: "school_admin", scope: "Single school (school_id)", capabilities: "Manage students, drivers, parents, vehicles, routes, trips within their school." },
  { role: "driver", scope: "Assigned trips", capabilities: "Execute trips, scan QR codes for pickup/drop." },
  { role: "parent", scope: "Own children", capabilities: "View children, receive notifications." },
];

const AUTH_FLOW = `
1. User signs in on /auth via Supabase email+password (open sign-ups disabled).
2. Supabase issues an access token stored in localStorage.
3. The _authenticated layout runs beforeLoad → supabase.auth.getUser() and
   redirects to /auth if unauthenticated (ssr: false to avoid SSR loops).
4. useAuth() reads user_roles for the current user and exposes primaryRole.
5. Server functions using requireSupabaseAuth receive the bearer token via
   the registered functionMiddleware in src/start.ts and act as that user
   under RLS. Privileged operations (createSchoolAdmin, role grants) load
   supabaseAdmin inside the handler after an explicit super-admin check.
`.trim();

const MODULES: Array<{ name: string; status: "Complete" | "In Progress" | "Planned"; notes: string }> = [
  { name: "Authentication & Roles", status: "Complete", notes: "Email/password, role-aware sidebar, RLS everywhere." },
  { name: "School Management", status: "Complete", notes: "CRUD, search, filters, pagination, detail page, logo upload." },
  { name: "Subscription Plans", status: "Complete", notes: "Trial / Basic / Standard / Premium; assign/upgrade/renew; MRR + revenue metrics. Plan limits enforced end-to-end: Postgres triggers students_check_plan_limit and vehicles_check_plan_limit reject any INSERT/UPDATE that exceeds the school's active plan's student_limit / vehicle_limit (raising PLAN_LIMIT_STUDENTS / PLAN_LIMIT_VEHICLES with SQLSTATE P0001). Frontend uses src/lib/plan-limits.ts (fetchPlanUsage, preflightCheck, planLimitMessage, isPlanLimitError) and the shared <PlanUsageCard/> to show live usage with progress bars, warning at ≥80% and danger badge at 100%. Same validator pattern will be reused for Drivers, Routes, Parents, Trips, GPS Devices, and Storage — add a new limit column on subscription_plans and a matching trigger + entry in the plan-usage RPC. The school_plan_usage(school_id) RPC is the single source of truth for usage snapshots (SECURITY DEFINER, search_path locked). SUBSCRIPTION DATE CALCULATION: periodEndFor(start, cycle, plan.duration_days) in src/lib/plans.ts is the single source for period end. Trial → Start + plan.duration_days (throws if missing/<1; NO hardcoded 30-day fallback anywhere). Monthly → Start + 1 month. Yearly → Start + 1 year. If plan.duration_days is set on a non-trial plan it overrides the cycle default (useful for custom billing windows). School creation seeds a trial only when the active Trial plan has a valid duration_days. planSchema.refine enforces trial plans require duration_days ≥ 1. Changing a plan's duration later does NOT mutate existing subscriptions; Super Admin must click 'Recalculate dates' (records a 'recalculated' entry in subscription_history) or 'Renew' on a school's subscription panel to adopt the new duration. SUBSCRIPTION OVERVIEW CARD (schools.$schoolId.tsx → SubscriptionPanel): renders <SubscriptionOverview/> above the plan controls with Current Plan, Billing Cycle, Start/End Date, Days Remaining, Next Renewal, Payment Status, Amount, and 4 resource UsageBars (Students/Vehicles/Drivers/Routes) fed by fetchPlanUsage(schoolId). Status badge via <SubStatusBadge/> maps sub.status + expiryState → Active (emerald) / Trial (amber) / Expiring soon (orange, ≤7 days) / Expired (red) / Suspended (slate). Days Remaining = ceil((current_period_end - now) / 86_400_000); negative → 'Expired N days ago' in red; ≤7 → orange. UsageBar color thresholds: 0–79% emerald, 80–99% orange, 100%+ red; unlimited (limit=null) renders an Infinity chip instead of a Progress bar. Apply Plan Change / Renew / Recalculate all call invalidateSubscriptionQueries which refreshes school, school-stats, schools-with-subs, subscriptions, platform-stats, sub-history, plan-usage and plans-active so Overview + Dashboard update immediately." },
  { name: "School Admin Management", status: "Complete", notes: "Super-admin creates accounts; password reset; tenant assignment." },
  { name: "Student Management", status: "Complete", notes: "31 fields, QR generation, CSV/Excel/PDF import/export, photo upload." },
  { name: "Driver Management", status: "Complete", notes: "Profile photo, license tracking with <30-day warnings, import/export. Add/Edit dialogs now include Portal Access (email + temporary password + confirm) so School Admins can provision Driver Portal logins alongside the driver record. Uses src/lib/portal-accounts.functions.ts (provisionPortalAccount / resetPortalPassword / updatePortalEmail); the server function authorizes Super Admin or the School Admin of the target school, creates the auth user (email_confirmed), inserts user_roles(role='driver', school_id), and links drivers.user_id. Duplicate email addresses are blocked both pre-flight (profiles.email) and via Supabase Auth error mapping. Edit mode surfaces password reset and email change against the linked auth user." },
  { name: "Vehicle Management", status: "Complete", notes: "Full fleet CRUD, photo upload, insurance/fitness/pollution expiry tracking, import/export, super-admin read-only cross-tenant view. Backend-enforced seating capacity: a Postgres trigger (students_check_vehicle_capacity) rejects INSERT/UPDATE that would exceed a vehicle's capacity; the vehicle_occupancy view (security_invoker) exposes capacity/occupied/available seats per vehicle and powers frontend badges, disabled selects, and dashboard totals." },
  { name: "Route Management", status: "Complete", notes: "Full CRUD at /routes and /routes/$routeId. Auto-generated route_code (RTE-00001 per school via trg_routes_before_insert). Fields: name, route_type (morning/afternoon/both), is_active, start/end points + GPS, total_distance, estimated_duration, pickup/drop times, max_students, route_color, notes, and JSONB stops[] with drag-and-drop reordering (dnd-kit). Assignments: driver_id and vehicle_id each guarded by partial unique indexes (routes_unique_active_driver, routes_unique_active_vehicle) so an active driver/vehicle can serve only one route at a time. Student-to-route link uses students.route_id; trg_students_route_capacity blocks assignment above max_students, and the existing vehicle capacity trigger enforces seat limits when a vehicle is attached. Search by name/code/driver/vehicle, filters by status/type/driver/vehicle, CSV+Excel import, CSV/Excel/PDF export via papaparse/xlsx/jspdf. Super Admin has cross-tenant read-only view via existing routes RLS; School Admin manages only their school. Google Maps integration is stubbed as a placeholder card that already surfaces stored lat/lng for start/end/stops. Dashboard route stats read from the same routes/students queries so counts refresh on every mutation via route-counts, routes-list, and school-stats query invalidations." },
  { name: "Parent Management", status: "Complete", notes: "Full CRUD at /parents and /parents/$parentId with school-scoped RLS. School Admins provision Parent Portal logins directly from the Add/Edit dialogs (email + temporary password + confirm). Backed by src/lib/portal-accounts.functions.ts (provisionPortalAccount / resetPortalPassword / updatePortalEmail) — same architecture as createSchoolAdmin: authorizes Super Admin OR School Admin of the target school, creates the auth user (email_confirmed), inserts user_roles(role='parent', school_id), then links parents.user_id. Duplicate emails rejected pre-flight and via Supabase Auth error mapping. Edit dialog exposes password reset and email update against the linked auth user." },
  { name: "Trip Management", status: "Complete", notes: "Morning/Afternoon/Special/Emergency trips with inherited stops, live Google Map, stop arrive/depart with delay detection, boarding counts, timeline, and PDF report export." },
  { name: "Driver Portal", status: "Complete", notes: "Fully separated /driver/* module. Reads via existing RLS (drivers.user_id = auth.uid()): Trips tenant read + Trips driver/admin write allow drivers to list/start/pause/resume/end their own trips only; Students tenant read exposes only students on the driver's assigned route; Vehicles/Routes filtered via join. Dashboard shows Vehicle, Route, Today's/Completed/Upcoming counts, notifications, and live trip banner. Today page manages full lifecycle (Start locks driver/vehicle/route via snapshot; Pause/Resume/End write timeline events). Live Trip page (/driver/trip/$tripId) renders Google Map with color-coded stops (pending=blue, reached=amber, departed=emerald) + red arrow vehicle marker, per-stop Arrive/Depart/Skip actions with boarded/missing counts, per-student Boarded/Absent/Late (pickup) or Dropped/Absent/Wrong-stop (drop) attendance stored in trips.metadata.attendance, and a rolling timeline. GPS tracking uses navigator.geolocation.watchPosition (high-accuracy, ≤1 update / 8s) writing trips.live_location {lat,lng,speed_kmh,heading,recorded_at} while status = in_progress. Navigation page deep-links Google Maps driving directions to next stop / end. QR Scanner uses getUserMedia (env-facing) with local scan history (decoder lands with QR Check-in/out module). SOS button is available on Dashboard + Live Trip; confirmation dialog appends a driver.sos event to the live trip's timeline (push delivery deferred). Multi-tenant isolation is enforced by RLS + the useMyDriver hook — a driver can never read another driver's trips/students/vehicles/routes. Sidebar exposes Dashboard, Today's Trip, Navigation, Students, QR Scanner, Trip History, plus shared Notifications and My Profile." },
  { name: "QR Check-in/out Logs", status: "Planned", notes: "Audit trail per student per trip." },
  { name: "Notifications", status: "Planned", notes: "Email/SMS/push; branded sender domain pending." },
  { name: "Reports", status: "In Progress", notes: "Placeholder route present; analytics TBD." },
];

const FUTURE_MODULES = [
  "Live GPS tracking with map overlays",
  "Parent mobile app (push notifications, live trip view)",
  "Driver mobile app (turn-by-turn, QR scanner)",
  "Automated billing & invoicing (Stripe/Paddle)",
  "AI incident detection (speed, harsh braking)",
  "Multi-language support",
];

const PENDING_TASKS = [
  "Configure custom sender domain and branded auth emails",
  "Implement password reset email delivery (deferred by user)",
  "Build Route, Parent, Trip, QR Logs modules",
  "Wire assign-route / assign-vehicle actions on student & driver profiles",
  "Add analytics & reporting dashboards",
];

const API_SERVICES = [
  { name: "createServerFn (@tanstack/react-start)", purpose: "App-internal RPC. All CRUD, business logic, admin operations." },
  { name: "src/lib/school-admins.functions.ts", purpose: "Super-admin managed school-admin accounts (create/update/delete/reset)." },
  { name: "src/lib/dev-docs.functions.ts", purpose: "Live schema introspection for this page (super-admin only)." },
  { name: "Supabase Data API (PostgREST)", purpose: "Client-side reads/writes via @/integrations/supabase/client under RLS." },
  { name: "Supabase Auth", purpose: "Email/password sessions; role lookup via public.user_roles + has_role()." },
  { name: "Supabase Storage", purpose: "Private buckets for logos, student & driver photos with school-scoped RLS." },
];

// ─── Component ───────────────────────────────────────────────────────────────

function DevDocsPage() {
  const { primaryRole } = useAuth();
  const fetchSnapshot = useServerFn(getDevDocsSnapshot);
  const query = useQuery<DevDocsSnapshot>({
    queryKey: ["dev-docs-snapshot"],
    queryFn: () => fetchSnapshot(),
    enabled: primaryRole === "super_admin",
    staleTime: 60_000,
  });

  if (primaryRole !== "super_admin") {
    return (
      <div className="p-6">
        <PageHeader title="Developer Docs" />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium">Restricted</p>
              <p className="text-sm text-muted-foreground">
                Developer documentation is available to platform super admins only.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const snapshot = query.data;

  return (
    <div className="p-6">
      <PageHeader
        title="Developer Documentation"
        description={
          snapshot
            ? `Live snapshot generated ${new Date(snapshot.generated_at).toLocaleString()}. Schema, storage buckets, and row counts refresh automatically.`
            : "Live schema introspection combined with curated notes."
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview"><Layers className="mr-1.5 h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="structure"><FolderTree className="mr-1.5 h-3.5 w-3.5" />Structure</TabsTrigger>
          <TabsTrigger value="database"><Database className="mr-1.5 h-3.5 w-3.5" />Database</TabsTrigger>
          <TabsTrigger value="roles"><Users className="mr-1.5 h-3.5 w-3.5" />Roles & Auth</TabsTrigger>
          <TabsTrigger value="storage"><HardDrive className="mr-1.5 h-3.5 w-3.5" />Storage & RLS</TabsTrigger>
          <TabsTrigger value="modules"><Rocket className="mr-1.5 h-3.5 w-3.5" />Modules</TabsTrigger>
          <TabsTrigger value="roadmap"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Roadmap</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Project Architecture</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {ARCHITECTURE}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>API / Backend Services</CardTitle>
              <CardDescription>Endpoints and integrations powering the app.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Purpose</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {API_SERVICES.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-mono text-xs">{s.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.purpose}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structure">
          <Card>
            <CardHeader><CardTitle>Folder Structure</CardTitle></CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs leading-relaxed">
                {FOLDER_STRUCTURE}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Database Tables</CardTitle>
              <CardDescription>
                Introspected live from PostgREST. Row counts execute under service role.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {query.isLoading && <Skeleton className="h-24 w-full" />}
              {snapshot && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead>Columns</TableHead>
                      <TableHead>Foreign Keys</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.tables.map((t) => (
                      <TableRow key={t.name}>
                        <TableCell className="font-mono text-xs">{t.name}</TableCell>
                        <TableCell className="text-sm">{t.columns.length}</TableCell>
                        <TableCell className="text-sm">
                          {t.foreign_keys.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {t.foreign_keys.map((fk) => (
                                <Badge key={fk.column} variant="secondary" className="font-mono text-[10px]">
                                  {fk.column} → {fk.ref_table}.{fk.ref_column}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {t.row_count ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {snapshot && (
            <Card>
              <CardHeader>
                <CardTitle>Relationships</CardTitle>
                <CardDescription>Foreign-key graph across the public schema.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {snapshot.tables.flatMap((t) =>
                    t.foreign_keys.map((fk) => (
                      <li key={`${t.name}.${fk.column}`} className="font-mono text-xs">
                        <span className="text-primary">{t.name}</span>.{fk.column}{" "}
                        <span className="text-muted-foreground">→</span>{" "}
                        <span className="text-primary">{fk.ref_table}</span>.{fk.ref_column}
                      </li>
                    )),
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {snapshot && (
            <Card>
              <CardHeader>
                <CardTitle>Column Detail</CardTitle>
                <CardDescription>Expand per-table column definitions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.tables.map((t) => (
                  <details key={t.name} className="rounded-md border bg-card/50 p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      {t.name}{" "}
                      <span className="text-muted-foreground">({t.columns.length} columns)</span>
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Column</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Nullable</TableHead>
                            <TableHead>Default</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {t.columns.map((c) => (
                            <TableRow key={c.name}>
                              <TableCell className="font-mono text-xs">{c.name}</TableCell>
                              <TableCell className="font-mono text-xs">{c.type}</TableCell>
                              <TableCell className="text-xs">{c.nullable ? "YES" : "NO"}</TableCell>
                              <TableCell className="font-mono text-xs">{c.default ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </details>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>User Roles</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Capabilities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {USER_ROLES.map((r) => (
                    <TableRow key={r.role}>
                      <TableCell><Badge variant="outline" className="font-mono">{r.role}</Badge></TableCell>
                      <TableCell className="text-sm">{r.scope}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.capabilities}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Authentication Flow</CardTitle></CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {AUTH_FLOW}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Storage Buckets</CardTitle>
              <CardDescription>Introspected live from Supabase Storage.</CardDescription>
            </CardHeader>
            <CardContent>
              {query.isLoading && <Skeleton className="h-16 w-full" />}
              {snapshot && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bucket</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead>Purpose</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.buckets.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs">{b.name}</TableCell>
                        <TableCell>
                          <Badge variant={b.public ? "default" : "secondary"}>
                            {b.public ? "Public" : "Private"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {b.name === "school-logos" && "School branding assets"}
                          {b.name === "student-photos" && "Student profile & ID photos"}
                          {b.name === "driver-photos" && "Driver profile photos & license scans"}
                          {b.name === "vehicle-photos" && "Vehicle profile photos"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" /> RLS Policies
              </CardTitle>
              <CardDescription>Tenant isolation guarantees.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                RLS is enabled on every table in the <code>public</code> schema.
                All school-scoped tables authorize using the SECURITY DEFINER
                functions:
              </p>
              <ul className="list-inside list-disc space-y-1 font-mono text-xs">
                <li>has_role(_user_id, _role app_role)</li>
                <li>is_super_admin(_user_id)</li>
                <li>user_belongs_to_school(_user_id, _school_id)</li>
                <li>is_school_admin_of(_user_id, _school_id)</li>
              </ul>
              <p>
                Storage buckets mirror this pattern: object paths are prefixed
                with <code>{"{school_id}/"}</code> and policies filter on the
                first path segment.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle>Module Status</CardTitle>
              <CardDescription>
                Update the MODULES array in <code>src/routes/_authenticated/dev-docs.tsx</code> when shipping new modules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MODULES.map((m) => (
                    <TableRow key={m.name}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.status === "Complete"
                              ? "default"
                              : m.status === "In Progress"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roadmap" className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Future Modules</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {FUTURE_MODULES.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Pending Tasks</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {PENDING_TASKS.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
