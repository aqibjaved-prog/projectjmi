import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "school_admin" | "driver" | "parent";

export interface UserRoleRow {
  role: AppRole;
  school_id: string | null;
}

export interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: UserRoleRow[];
  primaryRole: AppRole | null;
  schoolId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

const ROLE_PRIORITY: AppRole[] = ["super_admin", "school_admin", "driver", "parent"];

function pickPrimary(roles: UserRoleRow[]): AppRole | null {
  for (const r of ROLE_PRIORITY) if (roles.some((x) => x.role === r)) return r;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string) => {
    let { data } = await supabase
      .from("user_roles")
      .select("role, school_id")
      .eq("user_id", uid);
    let roleRows = (data as UserRoleRow[]) ?? [];

    // Parent OTP auto-link: if the signed-in user has a phone but no role yet,
    // try to link them to any matching students by parent_phone.
    if (roleRows.length === 0) {
      const { data: authData } = await supabase.auth.getUser();
      const phone = authData.user?.phone;
      if (phone) {
        try {
          await supabase.rpc("link_parent_by_phone" as never);
          const re = await supabase.from("user_roles").select("role, school_id").eq("user_id", uid);
          roleRows = ((re.data as UserRoleRow[]) ?? []);
        } catch {
          // ignored — user will see "no role" state
        }
      }
    }

    // Enforce driver account lifecycle: block disabled or soft-deleted drivers.
    if (roleRows.some((r) => r.role === "driver")) {
      const { data: drv } = await supabase
        .from("drivers")
        .select("id, is_active, deleted_at")
        .eq("user_id", uid)
        .maybeSingle();
      const blocked = !drv || drv.deleted_at != null || drv.is_active === false;
      if (blocked) {
        await supabase.auth.signOut();
        setRoles([]);
        setSession(null);
        setUser(null);
        const { toast } = await import("sonner");
        toast.error("Your account has been disabled. Please contact your school administrator.");
        return;
      }
    }

    setRoles(roleRows);
  };


  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadRoles(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
  };

  const refreshRoles = async () => {
    if (user) await loadRoles(user.id);
  };

  const primaryRole = pickPrimary(roles);
  const schoolId = roles.find((r) => r.role === primaryRole)?.school_id ?? null;

  return (
    <Ctx.Provider value={{ user, session, roles, primaryRole, schoolId, loading, signOut, refreshRoles }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
};
