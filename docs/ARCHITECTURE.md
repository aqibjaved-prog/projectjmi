# School Van Guardian — Architecture

## Stack

- **Frontend**: TanStack Start (React 19 + Vite 7), TypeScript, Tailwind v4, shadcn/ui.
- **Backend**: Lovable Cloud (managed PostgreSQL + Auth + Storage + Realtime).
  Standard Postgres + PostgREST/Supabase APIs — portable to any Supabase or
  self-hosted Postgres provider.
- **Future mobile**: Flutter apps connect via the official `supabase_flutter`
  SDK to the same database, the same Auth, and the same RLS policies. No
  backend changes are required.

## Multi-tenancy model

Every domain table carries a `school_id UUID` column referencing
`public.schools(id)`. Tenant isolation is enforced at the database level by
Row-Level Security policies — the app cannot accidentally leak data across
schools because Postgres refuses the query.

```
schools (tenant root)
  └── vehicles, drivers, routes, parents, students,
      trips, qr_logs, speed_logs, notifications, subscriptions
```

## Roles & access

Roles live in `public.user_roles` (NEVER on `profiles`):

| Role          | Scope                | Access                                              |
| ------------- | -------------------- | --------------------------------------------------- |
| super_admin   | platform-wide        | Every school, every table                           |
| school_admin  | one or more schools  | Only their school's data; full CRUD within it       |
| driver        | one school           | Their own driver record, their routes & trips       |
| parent        | one school           | Their own children, their children's trips & alerts |

Security-definer helpers (in `public`) avoid RLS recursion:

- `has_role(uid, role)`
- `is_super_admin(uid)`
- `is_school_admin_of(uid, school_id)`
- `user_belongs_to_school(uid, school_id)`

## Tables

| Table          | Purpose                                          |
| -------------- | ------------------------------------------------ |
| schools        | Tenant root: name, slug, status, settings        |
| profiles       | One row per auth user (full_name, phone, avatar) |
| user_roles     | (user_id, role, school_id) assignments           |
| vehicles       | Per-school vehicle fleet                         |
| drivers        | Per-school drivers, optional linked auth user    |
| routes         | Pickup/drop routes with stops JSONB              |
| parents        | Per-school parents, optional linked auth user    |
| students       | Per-school students, linked to parent + route    |
| trips          | Pickup/drop trip instances by date               |
| qr_logs        | QR scan events (board / alight)                  |
| speed_logs     | Vehicle speed samples and violations             |
| notifications  | Per-user, per-school notifications               |
| subscriptions  | Plan + billing status per school                 |

## Auth flow

1. User signs up at `/auth` (email + password).
2. Trigger `on_auth_user_created` inserts a `profiles` row.
3. Trigger `on_auth_user_bootstrap` grants `super_admin` to the very first
   account on the platform.
4. Super Admin creates schools and invites School Admins (CRUD via UI).
5. School Admin invites Drivers and Parents and links them to records.
6. The `_authenticated` route gate redirects unauthenticated requests to
   `/auth` and shows a "no role" screen if the account has none yet.

## Frontend layout

- `src/routes/__root.tsx` — providers (QueryClient, Theme, Auth, Toaster).
- `src/routes/_authenticated/route.tsx` — auth gate + sidebar/header shell.
- `src/components/layout/app-sidebar.tsx` — role-filtered navigation.
- `src/components/layout/app-header.tsx` — search, theme toggle, profile.

## Portability to other Postgres

Every schema object lives in `public` and uses standard Postgres features
(RLS, security-definer functions, triggers). Migrations can be exported and
re-applied to any Supabase project or vanilla Postgres + PostgREST. No
proprietary Lovable Cloud-only constructs are used in the data layer.
