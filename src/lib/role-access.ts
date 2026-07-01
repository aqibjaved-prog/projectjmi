import type { AppRole } from "@/lib/auth-context";

// Home landing page per role
export const ROLE_HOME: Record<AppRole, string> = {
  super_admin: "/dashboard",
  school_admin: "/dashboard",
  driver: "/driver/dashboard",
  parent: "/parent/dashboard",
};

// Route prefixes each role may visit. Order matters: longest match wins.
const ROLE_ALLOWED_PREFIXES: Record<AppRole, string[]> = {
  super_admin: [
    "/dashboard",
    "/schools",
    "/school-admins",
    "/plans",
    "/subscriptions",
    "/vehicles",
    "/routes",
    "/dev-docs",
    "/settings",
    "/profile",
    "/notifications",
  ],
  school_admin: [
    "/dashboard",
    "/students",
    "/drivers",
    "/parents",
    "/vehicles",
    "/routes",
    "/trips",
    "/reports",
    "/school-settings",
    "/profile",
    "/notifications",
  ],
  driver: ["/driver", "/profile", "/notifications"],
  parent: ["/parent", "/my-children", "/profile", "/notifications"],
};

export function canAccessPath(role: AppRole, pathname: string): boolean {
  const prefixes = ROLE_ALLOWED_PREFIXES[role] ?? [];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function roleLabel(role: AppRole | null | undefined): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "school_admin":
      return "School Admin";
    case "driver":
      return "Driver";
    case "parent":
      return "Parent";
    default:
      return "—";
  }
}
