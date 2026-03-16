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

    const url = new URL(req.url);
    const caseId = url.searchParams.get("case_id");
    if (!caseId) {
      return new Response(JSON.stringify({ error: "case_id query param required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify case ownership
    const { data: caseData, error: caseErr } = await supabase.from("cases").select("*").eq("id", caseId).single();
    if (caseErr || !caseData || caseData.user_id !== userId) {
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

    // Parallel data fetching
    const variantIdsPromise = supabase.from("vcf_variants").select("id").eq("case_id", caseId);

    const [{ data: qcData }, variantIdsResult, { data: therapies }, { data: biomarkers }, { data: audit }, { data: jobData }] = await Promise.all([
      supabase.from("qc_summaries").select("*").eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).single(),
      variantIdsPromise,
      supabase.from("therapy_options").select("*").eq("case_id", caseId),
      supabase.from("biomarker_interpretations").select("*").eq("case_id", caseId),
      supabase.from("audit_logs").select("*").eq("entity_id", caseId).order("created_at", { ascending: false }),
      supabase.from("analysis_jobs").select("id, current_step, steps_log, status").eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).single(),
    ]);

    const allVariantIds = variantIdsResult.data?.map((v: any) => v.id) || [];

    // Get Tier 1-3 classifications
    const { data: classifications } = allVariantIds.length > 0
      ? await supabase.from("variant_classifications").select("*").in("variant_id", allVariantIds).lte("tier", 3)
      : { data: [] };

    const relevantIds = (classifications || []).map((c: any) => c.variant_id);

    // Get variants and annotations for relevant ones
    const [{ data: variants }, { data: annotations }] = relevantIds.length > 0
      ? await Promise.all([
          supabase.from("vcf_variants").select("id, chrom, pos, ref, alt, qual, filter").in("id", relevantIds),
          supabase.from("variant_annotations").select("*").in("variant_id", relevantIds),
        ])
      : [{ data: [] }, { data: [] }];

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
        therapeutic_significance: c.therapeutic_significance,
        is_hotspot: annot?.is_hotspot || false,
        allele_frequency: annot?.allele_frequency,
        read_depth: annot?.read_depth,
        annotation_source: annot?.annotation_source,
        requires_review: c.requires_manual_review,
        rationale: c.rationale_json,
        clinvar_significance: annot?.clinvar_significance || null,
        clinvar_review_status: annot?.clinvar_review_status || null,
        clinvar_variation_id: annot?.clinvar_variation_id || null,
        clinvar_conditions: annot?.clinvar_conditions || null,
        review_status: c.review_status || "pending",
        review_notes: c.review_notes || null,
        reviewed_at: c.reviewed_at || null,
      };
    });

    const response = {
      case_id: caseId,
      case_number: caseData.case_number,
      status: interp.status,
      sample_context: interp.sample_context,
      pipeline_version: "2.1",
      // Case metadata for report
      case_metadata: {
        diagnosis: caseData.diagnosis,
        sample_type: caseData.sample_type,
        assembly: caseData.assembly,
        regulatory_region: caseData.regulatory_region,
        patient_age: caseData.patient_age,
        patient_sex: caseData.patient_sex,
        prior_treatment_lines: caseData.prior_treatment_lines,
        transplant_eligibility: caseData.transplant_eligibility,
        iss_stage: caseData.iss_stage,
        riss_stage: caseData.riss_stage,
        r2iss_stage: caseData.r2iss_stage,
        creatinine: caseData.creatinine,
        clinical_notes: caseData.clinical_notes,
        file_name: caseData.file_name,
        created_at: caseData.created_at,
      },
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
        source: b.source,
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
