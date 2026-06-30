import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Bus, ShieldCheck, MapPin, Bell } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "School Van Guardian — School Transport Management" },
      { name: "description", content: "Multi-tenant SaaS platform for managing school transport, routes, vehicles, drivers and student safety." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Bus className="h-5 w-5" />
            </div>
            <span className="font-semibold tracking-tight">School Van Guardian</span>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        <section className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Multi-tenant SaaS · for schools, drivers & parents
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
            Safe school transport, <span className="text-primary">end to end</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Manage vehicles, routes, drivers, students and parents from one secure dashboard.
            Built so each school's data stays completely isolated.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </section>

        <section className="mx-auto mt-20 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShieldCheck, title: "Role-based access", body: "Super Admin, School Admin, Driver, Parent — each sees only what they should." },
            { icon: Bus, title: "Fleet & routes", body: "Vehicles, drivers, routes and stops, organized per school." },
            { icon: MapPin, title: "Trips & tracking", body: "Pickup & drop trips, QR scans and speed monitoring (ready to wire)." },
            { icon: Bell, title: "Notifications", body: "Real-time alerts to parents, drivers and admins." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 shadow-[var(--shadow-card)]">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
