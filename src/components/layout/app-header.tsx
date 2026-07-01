import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Moon, Sun, LogOut, User as UserIcon, Search, Bell, School as SchoolIcon } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "@/lib/theme-provider";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { roleLabel } from "@/lib/role-access";

export function AppHeader() {
  const { resolved, setTheme } = useTheme();
  const { user, primaryRole, schoolId, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  const { data: school } = useQuery({
    enabled: !!schoolId && primaryRole === "school_admin",
    queryKey: ["header-school", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data } = await supabase
        .from("schools")
        .select("id,name,logo_url")
        .eq("id", schoolId)
        .maybeSingle();
      return data;
    },
  });

  const { data: unread } = useQuery({
    enabled: !!user,
    queryKey: ["header-unread", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger />
      <Badge variant="outline" className="hidden text-[10px] font-semibold uppercase tracking-wider sm:inline-flex">
        {roleLabel(primaryRole)}
      </Badge>
      {primaryRole === "school_admin" && school && (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            {school.logo_url ? <AvatarImage src={school.logo_url} alt={school.name} /> : null}
            <AvatarFallback><SchoolIcon className="h-3.5 w-3.5" /></AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline">{school.name}</span>
        </div>
      )}
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search…" className="pl-9" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Link to="/notifications">
            <Bell className="h-4 w-4" />
            {unread && unread > 0 ? (
              <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[10px]">
                {unread > 99 ? "99+" : unread}
              </Badge>
            ) : null}
          </Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setTheme(resolved === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.email}</span>
                <span className="text-xs text-muted-foreground capitalize">{primaryRole?.replace("_", " ")}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile"><UserIcon className="mr-2 h-4 w-4" /> Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
