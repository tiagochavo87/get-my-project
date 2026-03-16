import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error } = await anonClient.auth.getClaims(token);
  if (error || !claimsData?.claims) throw new Error("Invalid token");
  const userId = claimsData.claims.sub as string;

  const admin = createClient(supabaseUrl, serviceKey);

  // Check admin role
  const { data: roleData } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .single();

  if (!roleData) throw new Error("Forbidden: admin role required");

  return { admin, userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { admin, userId } = await verifyAdmin(req);
    const body = await req.json();
    const { action } = body;

    // ─── LIST USERS ───
    if (action === "list_users") {
      const { data: profiles } = await admin.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roles } = await admin.from("user_roles").select("*");

      const users = (profiles || []).map((p: any) => ({
        ...p,
        roles: (roles || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
      }));

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE USER ROLE ───
    if (action === "set_role") {
      const { target_user_id, role, remove } = body;
      if (!target_user_id || !role) {
        return new Response(JSON.stringify({ error: "target_user_id and role required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (remove) {
        await admin.from("user_roles").delete().eq("user_id", target_user_id).eq("role", role);
      } else {
        await admin.from("user_roles").upsert(
          { user_id: target_user_id, role },
          { onConflict: "user_id,role" }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── TOGGLE USER ACTIVE ───
    if (action === "toggle_active") {
      const { target_user_id, is_active } = body;
      await admin.from("profiles").update({ is_active }).eq("id", target_user_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST ALL CASES ───
    if (action === "list_cases") {
      const { data: cases } = await admin
        .from("cases")
        .select("id, case_number, status, diagnosis, sample_type, assembly, file_name, total_variants, relevant_variants, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(200);

      // Enrich with user emails
      const userIds = [...new Set((cases || []).map((c: any) => c.user_id))];
      const { data: profiles } = await admin.from("profiles").select("id, email, full_name").in("id", userIds);
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

      const enriched = (cases || []).map((c: any) => ({
        ...c,
        user_email: profileMap[c.user_id]?.email || "—",
        user_name: profileMap[c.user_id]?.full_name || "—",
      }));

      return new Response(JSON.stringify({ cases: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SYSTEM STATS ───
    if (action === "system_stats") {
      const [
        { count: totalCases },
        { count: totalUsers },
        { data: statusCounts },
        { data: recentJobs },
      ] = await Promise.all([
        admin.from("cases").select("*", { count: "exact", head: true }),
        admin.from("profiles").select("*", { count: "exact", head: true }),
        admin.from("cases").select("status"),
        admin.from("analysis_jobs").select("started_at, completed_at, status").order("created_at", { ascending: false }).limit(50),
      ]);

      const byStatus: Record<string, number> = {};
      for (const c of statusCounts || []) {
        byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      }

      // Avg processing time
      const completedJobs = (recentJobs || []).filter(
        (j: any) => j.status === "completed" && j.started_at && j.completed_at
      );
      let avgProcessingMs = 0;
      if (completedJobs.length > 0) {
        const totalMs = completedJobs.reduce((sum: number, j: any) => {
          return sum + (new Date(j.completed_at).getTime() - new Date(j.started_at).getTime());
        }, 0);
        avgProcessingMs = totalMs / completedJobs.length;
      }

      // Storage usage
      const { data: storageFiles } = await admin.from("uploaded_files").select("file_size");
      const { data: caseFiles } = await admin.from("cases").select("file_size");
      const totalStorageBytes =
        (storageFiles || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0) +
        (caseFiles || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0);

      // Total variants
      const { count: totalVariants } = await admin.from("vcf_variants").select("*", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          total_cases: totalCases || 0,
          total_users: totalUsers || 0,
          total_variants: totalVariants || 0,
          cases_by_status: byStatus,
          avg_processing_seconds: Math.round(avgProcessingMs / 1000),
          total_storage_mb: Math.round((totalStorageBytes / 1e6) * 10) / 10,
          recent_jobs_count: (recentJobs || []).length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── AUDIT LOGS ───
    if (action === "audit_logs") {
      const { data: logs } = await admin
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      // Enrich with user info
      const actorIds = [...new Set((logs || []).filter((l: any) => l.actor_user_id).map((l: any) => l.actor_user_id))];
      const { data: profiles } = actorIds.length > 0
        ? await admin.from("profiles").select("id, email").in("id", actorIds)
        : { data: [] };
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.email]));

      const enriched = (logs || []).map((l: any) => ({
        ...l,
        actor_email: profileMap[l.actor_user_id] || "system",
      }));

      return new Response(JSON.stringify({ logs: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const status = err.message === "Forbidden: admin role required" ? 403 : err.message === "Unauthorized" ? 401 : 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
