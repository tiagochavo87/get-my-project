// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderHtml } from "./html-renderer.ts";

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
    const format = url.searchParams.get("format") || "html";
    if (!caseId) {
      return new Response(JSON.stringify({ error: "case_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch case
    const { data: caseData } = await supabase.from("cases").select("*").eq("id", caseId).single();
    if (!caseData || caseData.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Case not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch interpretation
    const { data: interp } = await supabase
      .from("interpretation_results").select("*")
      .eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).single();

    if (!interp) {
      return new Response(JSON.stringify({ error: "No interpretation available" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch related data in parallel
    const [{ data: qcData }, { data: therapies }, { data: biomarkers }, variantIdsResult] = await Promise.all([
      supabase.from("qc_summaries").select("*").eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).single(),
      supabase.from("therapy_options").select("*").eq("case_id", caseId),
      supabase.from("biomarker_interpretations").select("*").eq("case_id", caseId),
      supabase.from("vcf_variants").select("id").eq("case_id", caseId),
    ]);

    const allVariantIds = variantIdsResult.data?.map((v: any) => v.id) || [];

    const { data: classifications } = allVariantIds.length > 0
      ? await supabase.from("variant_classifications").select("*").in("variant_id", allVariantIds).lte("tier", 2)
      : { data: [] as any[] };

    const relevantIds = (classifications || []).map((c: any) => c.variant_id);
    const [variantsResult, annotationsResult] = relevantIds.length > 0
      ? await Promise.all([
          supabase.from("vcf_variants").select("id, chrom, pos, ref, alt, qual, filter").in("id", relevantIds),
          supabase.from("variant_annotations").select("*").in("variant_id", relevantIds),
        ])
      : [{ data: [] as any[] }, { data: [] as any[] }];

    const variants = variantsResult.data || [];
    const annotations = annotationsResult.data || [];
    const qc = qcData || interp.qc_summary;
    const molSummary = interp.molecular_summary as any;
    const now = new Date().toISOString();

    // Build enriched variants
    const enrichedVariants = (classifications || []).map((c: any) => {
      const v = variants.find((x: any) => x.id === c.variant_id);
      const a = annotations.find((x: any) => x.variant_id === c.variant_id);
      return {
        gene: a?.gene_symbol || "Unknown",
        chrom: v?.chrom, pos: v?.pos, ref: v?.ref, alt: v?.alt,
        hgvs_c: a?.hgvs_c, hgvs_p: a?.hgvs_p, consequence: a?.consequence,
        tier: c.tier, classification: c.clinical_significance, confidence: c.confidence,
        is_hotspot: a?.is_hotspot, af: a?.allele_frequency, dp: a?.read_depth,
        clinvar_significance: a?.clinvar_significance,
        clinvar_review_status: a?.clinvar_review_status,
        review_status: c.review_status,
      };
    });

    const reportData = {
      report_id: `RPT-${caseData.case_number}-${Date.now()}`,
      generated_at: now,
      pipeline_version: "2.1",
      case: {
        id: caseData.id, case_number: caseData.case_number,
        sample_type: caseData.sample_type, assembly: caseData.assembly,
        diagnosis: caseData.diagnosis, regulatory_region: caseData.regulatory_region,
        patient_age: caseData.patient_age, patient_sex: caseData.patient_sex,
        prior_treatment_lines: caseData.prior_treatment_lines,
        transplant_eligibility: caseData.transplant_eligibility,
        iss_stage: caseData.iss_stage, riss_stage: caseData.riss_stage,
        r2iss_stage: caseData.r2iss_stage, clinical_notes: caseData.clinical_notes,
      },
      qc: {
        total_variants: qc?.total_variants, passed_filter: qc?.passed_filter,
        mean_depth: qc?.mean_depth, mean_quality: qc?.mean_quality,
        genome_build_detected: qc?.genome_build_detected,
        genome_build_match: qc?.genome_build_match,
        warnings: qc?.warnings || [], cnv_assessed: qc?.cnv_assessed,
        fusion_assessed: qc?.fusion_assessed, sv_assessed: qc?.sv_assessed,
      },
      molecular_summary: molSummary,
      clinically_relevant_variants: enrichedVariants,
      biomarkers: (biomarkers || []).map((b: any) => ({
        name: b.biomarker_name, type: b.biomarker_type, status: b.status,
        evidence_level: b.evidence_level, clinical_implication: b.clinical_implication,
        requires_confirmation: b.requires_confirmation, confirmation_method: b.confirmation_method,
      })),
      therapeutic_options: (therapies || []).map((t: any) => ({
        therapy: t.therapy_name, evidence_level: t.evidence_level, region: t.region,
        approved_status: t.approved_status, rationale: t.rationale_text,
        contraindicated: t.contraindicated_flag,
      })),
      limitations: interp.limitations || [],
      manual_review_reasons: interp.manual_review_reasons || [],
      flags: interp.flags || {},
      disclaimer: "CLINICAL DECISION SUPPORT ONLY \u2014 This report does NOT constitute a medical diagnosis. All findings must be independently reviewed and validated by a qualified physician. Variant classifications are based on available evidence at the time of analysis and may change with new data. Therapeutic options are presented as decision support based on published guidelines and clinical evidence; they do not represent prescriptions or medical advice. This system has NOT been validated for clinical diagnostic use.",
    };

    if (format === "json") {
      await supabase.from("audit_logs").insert({
        actor_user_id: userId, entity_type: "report", entity_id: caseId,
        action: "report_generated", after_json: { format: "json", report_id: reportData.report_id },
      });
      return new Response(JSON.stringify(reportData), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // HTML report
    const html = renderHtml(reportData, caseData, enrichedVariants, molSummary, now);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId, entity_type: "report", entity_id: caseId,
      action: "report_generated", after_json: { format: "html", report_id: reportData.report_id },
    });

    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Report generation error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
