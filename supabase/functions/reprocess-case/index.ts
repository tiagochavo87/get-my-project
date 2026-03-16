import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user via getClaims
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await anonClient.auth.getClaims(token);
    if (authErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub as string;

    const { case_id } = await req.json();
    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify ownership
    const { data: caseData } = await supabase.from("cases").select("id, user_id, file_path, status").eq("id", case_id).single();
    if (!caseData || caseData.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Case not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Don't reprocess if currently running
    const { data: runningJobs } = await supabase
      .from("analysis_jobs").select("id")
      .eq("case_id", case_id).eq("status", "running").limit(1);
    if (runningJobs && runningJobs.length > 0) {
      return new Response(JSON.stringify({ error: "Analysis is currently running" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Clear previous results
    await Promise.all([
      supabase.from("vcf_variants").delete().eq("case_id", case_id),
      supabase.from("therapy_options").delete().eq("case_id", case_id),
      supabase.from("biomarker_interpretations").delete().eq("case_id", case_id),
      supabase.from("interpretation_results").delete().eq("case_id", case_id),
      supabase.from("qc_summaries").delete().eq("case_id", case_id),
      supabase.from("samples").delete().eq("case_id", case_id),
    ]);

    // Mark old jobs as superseded
    await supabase.from("analysis_jobs").update({ status: "failed", error_message: "Superseded by reprocessing" }).eq("case_id", case_id).neq("status", "completed");

    // Reset case status
    await supabase.from("cases").update({
      status: "processing",
      total_variants: 0,
      relevant_variants: 0,
    }).eq("id", case_id);

    // Audit
    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      entity_type: "case",
      entity_id: case_id,
      action: "reprocess_initiated",
      after_json: { previous_status: caseData.status },
    });

    // Trigger re-analysis (fire-and-forget)
    const analyzeUrl = `${supabaseUrl}/functions/v1/analyze-vcf`;
    fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "apikey": anonKey,
      },
      body: JSON.stringify({ case_id }),
    }).catch(err => console.error("Re-analysis trigger error:", err));

    return new Response(JSON.stringify({
      success: true,
      case_id,
      message: "Reprocessing initiated. Previous results cleared.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Reprocess error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
