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
  FileBarChart,
  ShieldCheck,
  User,
  BookOpen,
  Navigation as NavigationIcon,
  QrCode,
  History,
  Baby,
  Radio,
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
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "school_admin"] },
      { title: "Dashboard", url: "/driver/dashboard", icon: LayoutDashboard, roles: ["driver"] },
      { title: "Dashboard", url: "/parent/dashboard", icon: LayoutDashboard, roles: ["parent"] },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Schools", url: "/schools", icon: School, roles: ["super_admin"] },
      { title: "School Admins", url: "/school-admins", icon: ShieldCheck, roles: ["super_admin"] },
      { title: "Subscriptions", url: "/subscriptions", icon: CreditCard, roles: ["super_admin"] },
      { title: "Plans", url: "/plans", icon: Package, roles: ["super_admin"] },
      { title: "All Vehicles", url: "/vehicles", icon: Car, roles: ["super_admin"] },
    ],
  },
  {
    label: "School",
    items: [
      { title: "Students", url: "/students", icon: Users, roles: ["school_admin"] },
      { title: "Drivers", url: "/drivers", icon: UserCog, roles: ["school_admin"] },
      { title: "Parents", url: "/parents", icon: Users, roles: ["school_admin"] },
      { title: "Vehicles", url: "/vehicles", icon: Car, roles: ["school_admin"] },
      { title: "Routes", url: "/routes", icon: MapPin, roles: ["school_admin", "super_admin"] },
      { title: "Trips", url: "/trips", icon: Calendar, roles: ["school_admin"] },
      { title: "Reports", url: "/reports", icon: FileBarChart, roles: ["school_admin"] },
    ],
  },
  {
    label: "Driver",
    items: [
      { title: "Today's Trip", url: "/driver/today", icon: Calendar, roles: ["driver"] },
      { title: "Navigation", url: "/driver/navigation", icon: NavigationIcon, roles: ["driver"] },
      { title: "Students", url: "/driver/students", icon: Users, roles: ["driver"] },
      { title: "QR Scanner", url: "/driver/qr", icon: QrCode, roles: ["driver"] },
      { title: "Trip History", url: "/driver/history", icon: History, roles: ["driver"] },
    ],
  },
  {
    label: "Parent",
    items: [
      { title: "My Children", url: "/parent/child", icon: Baby, roles: ["parent"] },
      { title: "Live Bus", url: "/parent/live", icon: Radio, roles: ["parent"] },
      { title: "Trip History", url: "/parent/history", icon: History, roles: ["parent"] },

    ],
  },
  {
    label: "Personal",
    items: [
      { title: "Notifications", url: "/notifications", icon: Bell, roles: ["super_admin", "school_admin", "driver", "parent"] },
      { title: "School Settings", url: "/school-settings", icon: Settings, roles: ["school_admin"] },
      { title: "Platform Settings", url: "/settings", icon: Settings, roles: ["super_admin"] },
      { title: "My Profile", url: "/profile", icon: User, roles: ["super_admin", "school_admin", "driver", "parent"] },
      { title: "Developer Docs", url: "/dev-docs", icon: BookOpen, roles: ["super_admin"] },
    ],
  },
];

export function AppSidebar() {
  const { primaryRole } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = primaryRole;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[image:var(--gradient-ember)] text-primary-foreground shadow-[var(--shadow-glow)]">
            <Bus className="h-[18px] w-[18px]" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-display text-[13px] font-semibold tracking-tight">
              School Van Guardian
            </span>
            <span className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {role?.replace("_", " ") ?? "—"}
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1">
        {NAV.map((group) => {
          const visible = group.items.filter((i) => role && i.roles.includes(role));
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const active = pathname === item.url || pathname.startsWith(item.url + "/");
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="h-9 gap-2.5 rounded-md text-[13px] font-medium transition-colors data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-xs"
                        >
                          <Link to={item.url}>
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.title}</span>
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
