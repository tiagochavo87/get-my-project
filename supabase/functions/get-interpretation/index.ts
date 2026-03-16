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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const caseId = url.searchParams.get("case_id");
    if (!caseId) {
      return new Response(JSON.stringify({ error: "case_id query param required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify case ownership
    const { data: caseData, error: caseErr } = await supabase.from("cases").select("*").eq("id", caseId).single();
    if (caseErr || !caseData || caseData.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Case not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get interpretation
    const { data: interp } = await supabase
      .from("interpretation_results")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!interp) {
      // Check if there's a running job
      const { data: runningJob } = await supabase
        .from("analysis_jobs")
        .select("id, status, current_step, steps_log")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return new Response(JSON.stringify({
        case_id: caseId,
        case_number: caseData.case_number,
        status: runningJob?.status === "running" ? "processing" : "pending",
        current_step: runningJob?.current_step || null,
        steps_log: runningJob?.steps_log || [],
        sample_context: caseData.sample_type,
        qc_summary: null,
        molecular_summary: null,
        clinically_relevant_variants: [],
        biomarkers: [],
        therapy_support: [],
        limitations: [],
        manual_review_reasons: [],
        report_ready: false,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get QC
    const { data: qcData } = await supabase.from("qc_summaries").select("*").eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).single();

    // Get Tier 1-2 variant IDs from classifications (avoid loading all variants)
    const { data: classifications } = await supabase
      .from("variant_classifications")
      .select("*")
      .in("variant_id", (
        await supabase.from("vcf_variants").select("id").eq("case_id", caseId)
      ).data?.map((v: any) => v.id) || [])
      .lte("tier", 2);

    const relevantIds = (classifications || []).map((c: any) => c.variant_id);

    // Get variants and annotations only for relevant ones
    const { data: variants } = relevantIds.length > 0
      ? await supabase.from("vcf_variants").select("id, chrom, pos, ref, alt, qual, filter").in("id", relevantIds)
      : { data: [] };

    const { data: annotations } = relevantIds.length > 0
      ? await supabase.from("variant_annotations").select("*").in("variant_id", relevantIds)
      : { data: [] };

    // Get therapies
    const { data: therapies } = await supabase.from("therapy_options").select("*").eq("case_id", caseId);

    // Get biomarkers
    const { data: biomarkers } = await supabase.from("biomarker_interpretations").select("*").eq("case_id", caseId);

    // Get audit trail
    const { data: audit } = await supabase.from("audit_logs").select("*").eq("entity_id", caseId).order("created_at", { ascending: false });

    // Get job info
    const { data: jobData } = await supabase.from("analysis_jobs").select("id, current_step, steps_log, status").eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).single();

    // Build enriched variant list
    const enrichedVariants = (classifications || []).map((c: any) => {
      const variant = (variants || []).find((v: any) => v.id === c.variant_id);
      const annot = (annotations || []).find((a: any) => a.variant_id === c.variant_id);
      return {
        variant_id: c.variant_id,
        gene: annot?.gene_symbol || null,
        chrom: variant?.chrom,
        pos: variant?.pos,
        ref: variant?.ref,
        alt: variant?.alt,
        hgvs_c: annot?.hgvs_c,
        hgvs_p: annot?.hgvs_p,
        consequence: annot?.consequence,
        tier: c.tier,
        classification: c.clinical_significance,
        confidence: c.confidence,
        prognostic_significance: c.prognostic_significance,
        is_hotspot: annot?.is_hotspot || false,
        allele_frequency: annot?.allele_frequency,
        read_depth: annot?.read_depth,
        annotation_source: annot?.annotation_source,
        requires_review: c.requires_manual_review,
        rationale: c.rationale_json,
      };
    });

    const response = {
      case_id: caseId,
      case_number: caseData.case_number,
      status: interp.status,
      sample_context: interp.sample_context,
      pipeline_version: "2.0",
      qc_summary: qcData || interp.qc_summary,
      molecular_summary: interp.molecular_summary,
      clinically_relevant_variants: enrichedVariants,
      biomarkers: (biomarkers || []).map((b: any) => ({
        name: b.biomarker_name,
        type: b.biomarker_type,
        status: b.status,
        evidence_level: b.evidence_level,
        clinical_implication: b.clinical_implication,
        requires_confirmation: b.requires_confirmation,
        confirmation_method: b.confirmation_method,
      })),
      therapy_support: (therapies || []).map((t: any) => ({
        therapy: t.therapy_name,
        evidence_level: t.evidence_level,
        region: t.region,
        approved_status: t.approved_status,
        rationale: t.rationale_text,
        contraindicated: t.contraindicated_flag,
        is_decision_support: true,
      })),
      limitations: interp.limitations,
      manual_review_reasons: interp.manual_review_reasons,
      flags: interp.flags,
      report_ready: interp.report_ready,
      analysis_steps: jobData?.steps_log || [],
      audit_trail: (audit || []).map((a: any) => ({
        timestamp: a.created_at,
        action: a.action,
        details: a.after_json,
      })),
      disclaimer: "CLINICAL DECISION SUPPORT ONLY — This report does NOT constitute a medical diagnosis. All findings must be reviewed and validated by a qualified physician. Variant classifications are based on available evidence and may change. Therapeutic options are decision support only.",
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Interpretation error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
