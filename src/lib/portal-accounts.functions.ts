import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Portal account provisioning for Driver / Parent records.
 *
 * Authorization: Super Admin, or School Admin of the target school.
 * Mirrors the School Admin creation flow — creates an auth user (email confirmed),
 * assigns the role in user_roles (scoped to school_id), then links the
 * drivers/parents record back via user_id.
 */

type Kind = "driver" | "parent";

const KindSchema = z.enum(["driver", "parent"]);

const ProvisionSchema = z.object({
  kind: KindSchema,
  recordId: z.string().uuid(),
  schoolId: z.string().uuid(),
  email: z.string().email().max(255),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(40).optional().nullable(),
});

const ResetSchema = z.object({
  kind: KindSchema,
  recordId: z.string().uuid(),
  schoolId: z.string().uuid(),
  password: z.string().min(8),
});

const UpdateEmailSchema = z.object({
  kind: KindSchema,
  recordId: z.string().uuid(),
  schoolId: z.string().uuid(),
  email: z.string().email().max(255),
});

const DeleteSchema = z.object({
  kind: KindSchema,
  recordId: z.string().uuid(),
  schoolId: z.string().uuid(),
});

const RestoreSchema = z.object({
  kind: KindSchema,
  recordId: z.string().uuid(),
  schoolId: z.string().uuid(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(8).optional(),
});

async function assertCanManageSchool(callerId: string, schoolId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role, school_id")
    .eq("user_id", callerId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { role: string; school_id: string | null }[];
  const isSuper = rows.some((r) => r.role === "super_admin");
  const isSchoolAdmin = rows.some((r) => r.role === "school_admin" && r.school_id === schoolId);
  if (!isSuper && !isSchoolAdmin) {
    throw new Error("Forbidden: only Super Admin or the School Admin of this school can manage portal accounts.");
  }
}

function recordTable(kind: Kind) {
  return kind === "driver" ? "drivers" : "parents";
}

async function loadRecord(kind: Kind, recordId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from(recordTable(kind))
    .select("id, school_id, user_id, full_name, phone")
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${kind} record not found`);
  return data as { id: string; school_id: string; user_id: string | null; full_name: string; phone: string | null };
}

export const provisionPortalAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProvisionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManageSchool(context.userId, data.schoolId);
    const record = await loadRecord(data.kind, data.recordId);
    if (record.school_id !== data.schoolId) {
      return { ok: false as const, error: "Record does not belong to this school." };
    }
    if (record.user_id) {
      return { ok: false as const, error: "This record already has a linked account." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (existingProfile) {
      return { ok: false as const, error: "A user with this email already exists." };
    }

    const fullName = (data.fullName ?? record.full_name ?? data.email).trim();
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created.user) {
      const msg = createErr?.message ?? "Failed to create user";
      const friendly = /already been registered|already exists/i.test(msg)
        ? "A user with this email already exists."
        : msg;
      return { ok: false as const, error: friendly };
    }
    const uid = created.user.id;

    await supabaseAdmin.from("profiles").upsert({
      id: uid,
      full_name: fullName,
      email: data.email,
      phone: data.phone ?? record.phone ?? null,
    });

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: data.kind, school_id: data.schoolId });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      return { ok: false as const, error: roleErr.message };
    }

    const { error: linkErr } = await supabaseAdmin
      .from(recordTable(data.kind))
      .update({ user_id: uid })
      .eq("id", data.recordId)
      .eq("school_id", data.schoolId);
    if (linkErr) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      await supabaseAdmin.auth.admin.deleteUser(uid);
      return { ok: false as const, error: linkErr.message };
    }

    return { ok: true as const, userId: uid };
  });

export const resetPortalPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManageSchool(context.userId, data.schoolId);
    const record = await loadRecord(data.kind, data.recordId);
    if (record.school_id !== data.schoolId) {
      return { ok: false as const, error: "Record does not belong to this school." };
    }
    if (!record.user_id) {
      return { ok: false as const, error: "This record has no linked account yet." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(record.user_id, {
      password: data.password,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const updatePortalEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateEmailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManageSchool(context.userId, data.schoolId);
    const record = await loadRecord(data.kind, data.recordId);
    if (record.school_id !== data.schoolId) {
      return { ok: false as const, error: "Record does not belong to this school." };
    }
    if (!record.user_id) {
      return { ok: false as const, error: "This record has no linked account yet." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reject duplicates (excluding the user's own row)
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .neq("id", record.user_id)
      .maybeSingle();
    if (existing) {
      return { ok: false as const, error: "A user with this email already exists." };
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(record.user_id, {
      email: data.email,
      email_confirm: true,
    });
    if (error) {
      const friendly = /already been registered|already exists/i.test(error.message)
        ? "A user with this email already exists."
        : error.message;
      return { ok: false as const, error: friendly };
    }
    await supabaseAdmin.from("profiles").update({ email: data.email }).eq("id", record.user_id);
    return { ok: true as const };
  });

/**
 * Delete a driver/parent portal account.
 * Soft-deletes the profile row (drivers only for now), deletes the auth user,
 * removes their role rows, and revokes all active sessions.
 * The linked user_id becomes NULL via the FK's ON DELETE SET NULL.
 */
export const deletePortalAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManageSchool(context.userId, data.schoolId);
    const record = await loadRecord(data.kind, data.recordId);
    if (record.school_id !== data.schoolId) {
      return { ok: false as const, error: "Record does not belong to this school." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Revoke sessions + delete auth user (cascades user_roles via FK)
    if (record.user_id) {
      try {
        await supabaseAdmin.auth.admin.signOut(record.user_id, "global");
      } catch { /* best-effort */ }
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(record.user_id);
      if (delErr && !/not.?found|does not exist/i.test(delErr.message)) {
        return { ok: false as const, error: delErr.message };
      }
      // Explicit cleanup in case the FK is not cascading in this deployment
      await supabaseAdmin.from("user_roles").delete().eq("user_id", record.user_id);
    }

    // 2) Soft-delete the driver/parent record (preserves history + allows restore)
    if (data.kind === "driver") {
      const { error } = await supabaseAdmin
        .from("drivers")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: context.userId,
          is_active: false,
          user_id: null,
        })
        .eq("id", data.recordId)
        .eq("school_id", data.schoolId);
      if (error) return { ok: false as const, error: error.message };
    } else {
      // Parents don't have a soft-delete column yet — hard delete
      const { error } = await supabaseAdmin
        .from("parents")
        .delete()
        .eq("id", data.recordId)
        .eq("school_id", data.schoolId);
      if (error) return { ok: false as const, error: error.message };
    }

    return { ok: true as const };
  });

/**
 * Restore a soft-deleted driver. Optionally re-provision a fresh login account
 * (new email + temporary password). Driver-only.
 */
export const restorePortalAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RestoreSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.kind !== "driver") {
      return { ok: false as const, error: "Only drivers support restore." };
    }
    await assertCanManageSchool(context.userId, data.schoolId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rec, error: loadErr } = await supabaseAdmin
      .from("drivers")
      .select("id, school_id, user_id, full_name, phone, deleted_at")
      .eq("id", data.recordId)
      .maybeSingle();
    if (loadErr) return { ok: false as const, error: loadErr.message };
    if (!rec) return { ok: false as const, error: "Driver not found." };
    if (rec.school_id !== data.schoolId) {
      return { ok: false as const, error: "Record does not belong to this school." };
    }

    // Un-soft-delete
    const { error: restoreErr } = await supabaseAdmin
      .from("drivers")
      .update({ deleted_at: null, deleted_by: null, is_active: true })
      .eq("id", data.recordId);
    if (restoreErr) return { ok: false as const, error: restoreErr.message };

    // Optionally re-provision login
    if (data.email && data.password) {
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles").select("id").eq("email", data.email).maybeSingle();
      if (existingProfile) {
        return { ok: false as const, error: "A user with this email already exists." };
      }
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: rec.full_name },
      });
      if (createErr || !created.user) {
        return { ok: false as const, error: createErr?.message ?? "Failed to create login." };
      }
      const uid = created.user.id;
      await supabaseAdmin.from("profiles").upsert({
        id: uid, full_name: rec.full_name, email: data.email, phone: rec.phone ?? null,
      });
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles").insert({ user_id: uid, role: "driver", school_id: data.schoolId });
      if (roleErr) {
        await supabaseAdmin.auth.admin.deleteUser(uid);
        return { ok: false as const, error: roleErr.message };
      }
      const { error: linkErr } = await supabaseAdmin
        .from("drivers").update({ user_id: uid }).eq("id", data.recordId);
      if (linkErr) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
        await supabaseAdmin.auth.admin.deleteUser(uid);
        return { ok: false as const, error: linkErr.message };
      }
      return { ok: true as const, userId: uid };
    }

    return { ok: true as const };
  });

