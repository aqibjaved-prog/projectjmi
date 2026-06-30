import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bus,
  LayoutDashboard,
  School,
  Users,
  UserCog,
  Car,
  MapPin,
  Calendar,
  Bell,
  CreditCard,
  Package,
  Settings,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/lib/auth-context";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: AppRole[];
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "school_admin", "driver", "parent"] },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Schools", url: "/schools", icon: School, roles: ["super_admin"] },
      { title: "Subscriptions", url: "/subscriptions", icon: CreditCard, roles: ["super_admin"] },
      { title: "Plans", url: "/plans", icon: Package, roles: ["super_admin"] },
    ],
  },
  {
    label: "School",
    items: [
      { title: "Students", url: "/students", icon: Users, roles: ["school_admin"] },
      { title: "Parents", url: "/parents", icon: Users, roles: ["school_admin"] },
      { title: "Drivers", url: "/drivers", icon: UserCog, roles: ["school_admin"] },
      { title: "Vehicles", url: "/vehicles", icon: Car, roles: ["school_admin"] },
      { title: "Routes", url: "/routes", icon: MapPin, roles: ["school_admin"] },
      { title: "Trips", url: "/trips", icon: Calendar, roles: ["school_admin", "driver"] },
    ],
  },
  {
    label: "Personal",
    items: [
      { title: "My children", url: "/my-children", icon: Users, roles: ["parent"] },
      { title: "Notifications", url: "/notifications", icon: Bell, roles: ["school_admin", "driver", "parent", "super_admin"] },
      { title: "Settings", url: "/settings", icon: Settings, roles: ["super_admin", "school_admin", "driver", "parent"] },
    ],
  },
];

export function AppSidebar() {
  const { primaryRole } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = primaryRole;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Bus className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">School Van Guardian</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {role?.replace("_", " ") ?? "—"}
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => {
          const visible = group.items.filter((i) => role && i.roles.includes(role));
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const active = pathname === item.url || pathname.startsWith(item.url + "/");
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                          <Link to={item.url}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
