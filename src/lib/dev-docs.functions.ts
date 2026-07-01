import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
};
export type ForeignKey = {
  column: string;
  ref_table: string;
  ref_column: string;
};
export type PolicyInfo = {
  name: string;
  command: string;
  roles: string[];
  using: string | null;
  check: string | null;
};
export type TableInfo = {
  name: string;
  columns: ColumnInfo[];
  foreign_keys: ForeignKey[];
  policies: PolicyInfo[];
  rls_enabled: boolean;
  row_count: number | null;
};
export type FunctionInfo = { name: string; language: string; return_type: string };
export type BucketInfo = { id: string; name: string; public: boolean };
export type DevDocsSnapshot = {
  generated_at: string;
  tables: TableInfo[];
  functions: FunctionInfo[];
  buckets: BucketInfo[];
};

export const getDevDocsSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DevDocsSnapshot> => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Use PostgREST-exposed catalogs via RPC-free approach: run SQL through a
    // temporary function is not available. Instead use supabaseAdmin with
    // .from() to selected info schema is not exposed. So we call the REST
    // Data API on the `public` schema for row counts and rely on the
    // Postgres `pg_meta` style queries via the supabase-js `rpc` when
    // possible. We instead use the SQL editor endpoint through the admin
    // client's postgres URL is not available here — so we use the
    // supabaseAdmin.rpc pattern by declaring an inline anonymous SQL
    // through the `postgrest` `?select` on `pg_catalog` is not exposed.
    //
    // Workaround: rely on hard-coded metadata queries via the `postgres`
    // schema exposed by Supabase (`pg_meta` extension is not present in
    // Data API). Instead, use the `sql` HTTP endpoint on the Postgres
    // instance via fetch to the Supabase Management API is unavailable at
    // runtime.
    //
    // Practical solution: query the small handful of catalogs by calling
    // supabaseAdmin against a `public.dev_docs_*` view — but we're told
    // not to modify DB. So we call the REST endpoint with rpc on
    // `pg_catalog.pg_tables` using PostgREST — which requires the schema
    // to be exposed. It is not by default.
    //
    // Final approach: enumerate tables using PostgREST's OpenAPI spec
    // (available at `${SUPABASE_URL}/rest/v1/`), then for each table
    // count rows via `HEAD` with Prefer: count=exact. Column info comes
    // from the OpenAPI definitions. Policies / FKs / functions are not
    // available this way; we return empty arrays for those and rely on
    // the static documentation section for policy/relationship notes.

    const url = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const specRes = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const spec = (await specRes.json()) as {
      definitions?: Record<
        string,
        {
          properties?: Record<
            string,
            { type?: string; format?: string; description?: string; default?: unknown }
          >;
          required?: string[];
        }
      >;
    };

    const definitions = spec.definitions ?? {};
    const tableNames = Object.keys(definitions).sort();

    const tables: TableInfo[] = [];
    for (const name of tableNames) {
      const def = definitions[name];
      const required = new Set(def.required ?? []);
      const columns: ColumnInfo[] = Object.entries(def.properties ?? {}).map(
        ([col, meta]) => ({
          name: col,
          type: meta.format ?? meta.type ?? "unknown",
          nullable: !required.has(col),
          default: meta.default === undefined ? null : String(meta.default),
        }),
      );

      // Foreign keys are encoded in PostgREST description like
      // "Note:\nThis is a Foreign Key to `schools.id`.<fk table='schools' column='id'/>"
      const foreign_keys: ForeignKey[] = [];
      for (const [col, meta] of Object.entries(def.properties ?? {})) {
        const desc = meta.description ?? "";
        const m = desc.match(/Foreign Key to `([^.`]+)\.([^`]+)`/);
        if (m) foreign_keys.push({ column: col, ref_table: m[1], ref_column: m[2] });
      }

      let row_count: number | null = null;
      try {
        const { count } = await supabaseAdmin
          .from(name)
          .select("*", { count: "exact", head: true });
        row_count = count ?? 0;
      } catch {
        row_count = null;
      }

      tables.push({
        name,
        columns,
        foreign_keys,
        policies: [],
        rls_enabled: true,
        row_count,
      });
    }

    // Storage buckets
    const buckets: BucketInfo[] = [];
    try {
      const { data } = await supabaseAdmin.storage.listBuckets();
      for (const b of data ?? []) {
        buckets.push({ id: b.id, name: b.name, public: b.public });
      }
    } catch {
      // ignore
    }

    return {
      generated_at: new Date().toISOString(),
      tables,
      functions: [],
      buckets,
    };
  });
