import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { useAuth } from "@/lib/auth-context";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canAccessPath, ROLE_HOME } from "@/lib/role-access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, loading, primaryRole, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Role-based route enforcement
  useEffect(() => {
    if (!primaryRole) return;
    if (pathname === "/" || pathname === "") {
      navigate({ to: ROLE_HOME[primaryRole] });
      return;
    }
    if (!canAccessPath(primaryRole, pathname)) {
      navigate({ to: ROLE_HOME[primaryRole], replace: true });
    }
  }, [primaryRole, pathname, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!primaryRole) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
            <ShieldAlert className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold">No role assigned</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account exists, but no role has been assigned. Please contact your school administrator.
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
