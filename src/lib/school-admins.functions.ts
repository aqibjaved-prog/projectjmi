import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  phone: z.string().optional().nullable(),
  schoolId: z.string().uuid(),
});

const UpdateSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  schoolId: z.string().uuid().optional(),
});

const IdSchema = z.object({ userId: z.string().uuid() });
const ResetSchema = z.object({ userId: z.string().uuid(), password: z.string().min(8) });

async function assertSuperAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: super admin only");
}

export const createSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");

    const uid = created.user.id;

    await supabaseAdmin.from("profiles").upsert({
      id: uid,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone ?? null,
    });

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: "school_admin", school_id: data.schoolId });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(roleErr.message);
    }

    return { userId: uid };
  });

export const updateSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.fullName !== undefined || data.phone !== undefined) {
      await supabaseAdmin
        .from("profiles")
        .update({
          ...(data.fullName !== undefined ? { full_name: data.fullName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
        })
        .eq("id", data.userId);
    }

    if (data.schoolId) {
      // Replace school_admin role assignment
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "school_admin");
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: "school_admin", school_id: data.schoolId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const resetSchoolAdminPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deactivateSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "876000h",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const activateSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: "none",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSchoolAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRows, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, school_id")
      .eq("role", "school_admin");
    if (rolesErr) throw new Error(rolesErr.message);

    if (!roleRows || roleRows.length === 0) return [];

    const userIds = Array.from(new Set(roleRows.map((r) => r.user_id)));
    const schoolIds = Array.from(new Set(roleRows.map((r) => r.school_id).filter(Boolean))) as string[];

    const [{ data: profiles }, { data: schools }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, phone").in("id", userIds),
      schoolIds.length
        ? supabaseAdmin.from("schools").select("id, name").in("id", schoolIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    // Fetch auth users for banned/active status
    const bannedMap = new Map<string, boolean>();
    for (const uid of userIds) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
      const bannedUntil = (u.user as { banned_until?: string } | null)?.banned_until;
      bannedMap.set(
        uid,
        !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
      );
    }

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const schoolMap = new Map((schools ?? []).map((s) => [s.id, s]));

    return roleRows.map((r) => {
      const p = profileMap.get(r.user_id);
      const s = r.school_id ? schoolMap.get(r.school_id) : null;
      return {
        userId: r.user_id,
        email: p?.email ?? "",
        fullName: p?.full_name ?? "",
        phone: p?.phone ?? null,
        schoolId: r.school_id,
        schoolName: s?.name ?? "—",
        active: !bannedMap.get(r.user_id),
      };
    });
  });
