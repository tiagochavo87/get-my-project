// deno-lint-ignore-file no-explicit-any
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
    const format = url.searchParams.get("format") || "html";
    if (!caseId) {
      return new Response(JSON.stringify({ error: "case_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user via getUser
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
    const variantIdsPromise = supabase.from("vcf_variants").select("id").eq("case_id", caseId);
    const [{ data: qcData }, { data: therapies }, { data: biomarkers }, variantIdsResult, { data: audit }] = await Promise.all([
      supabase.from("qc_summaries").select("*").eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).single(),
      supabase.from("therapy_options").select("*").eq("case_id", caseId),
      supabase.from("biomarker_interpretations").select("*").eq("case_id", caseId),
      variantIdsPromise,
      supabase.from("audit_logs").select("*").eq("entity_id", caseId).order("created_at", { ascending: false }),
    ]);

    const allVariantIds = variantIdsResult.data?.map((v: any) => v.id) || [];

    const { data: classifications } = allVariantIds.length > 0
      ? await supabase.from("variant_classifications").select("*").in("variant_id", allVariantIds).lte("tier", 2)
      : { data: [] };

    const relevantIds = (classifications || []).map((c: any) => c.variant_id);
    const [{ data: variants }, { data: annotations }] = relevantIds.length > 0
      ? await Promise.all([
          supabase.from("vcf_variants").select("id, chrom, pos, ref, alt, qual, filter").in("id", relevantIds),
          supabase.from("variant_annotations").select("*").in("variant_id", relevantIds),
        ])
      : [{ data: [] }, { data: [] }];

    const qc = qcData || interp.qc_summary;
    const molSummary = interp.molecular_summary as any;
    const now = new Date().toISOString();

    // Build enriched variants
    const enrichedVariants = (classifications || []).map((c: any) => {
      const v = (variants || []).find((x: any) => x.id === c.variant_id);
      const a = (annotations || []).find((x: any) => x.variant_id === c.variant_id);
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
      disclaimer: "CLINICAL DECISION SUPPORT ONLY — This report does NOT constitute a medical diagnosis. All findings must be independently reviewed and validated by a qualified physician. Variant classifications are based on available evidence at the time of analysis and may change with new data. Therapeutic options are presented as decision support based on published guidelines and clinical evidence; they do not represent prescriptions or medical advice. This system has NOT been validated for clinical diagnostic use.",
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
    const diagnosisLabels: Record<string, string> = {
      mgus: "MGUS", smoldering_mm: "Smoldering Multiple Myeloma",
      newly_diagnosed_mm: "Newly Diagnosed Multiple Myeloma", relapsed_refractory_mm: "Relapsed/Refractory Multiple Myeloma",
    };
    const sampleLabels: Record<string, string> = {
      somatic_tumor: "Somatic Tumor", germline_constitutional: "Germline Constitutional", tumor_normal_paired: "Tumor-Normal Paired",
    };
    const tierColors: Record<number, string> = { 1: "#dc2626", 2: "#ea580c", 3: "#ca8a04", 4: "#6b7280" };

    const variantRows = enrichedVariants.map((v: any) => `
      <tr>
        <td style="font-weight:600;font-family:monospace">${v.gene}${v.is_hotspot ? ' 🔥' : ''}</td>
        <td style="font-family:monospace;font-size:11px">chr${v.chrom}:${v.pos}</td>
        <td style="font-family:monospace;font-size:11px">${v.ref}→${v.alt}</td>
        <td style="font-family:monospace;font-size:11px">${v.hgvs_p || v.hgvs_c || '—'}</td>
        <td><span style="background:${tierColors[v.tier]};color:white;padding:2px 8px;border-radius:4px;font-size:11px">Tier ${v.tier}</span></td>
        <td style="font-size:11px">${v.classification?.replace(/_/g, ' ') || '—'}</td>
        <td style="font-size:11px">${v.af ? (v.af * 100).toFixed(1) + '%' : '—'}</td>
        <td style="font-size:11px">${v.clinvar_significance?.replace(/_/g, ' ') || '—'}</td>
        <td style="font-size:11px"><span style="color:${v.review_status === 'approved' ? '#16a34a' : v.review_status === 'rejected' ? '#dc2626' : '#9ca3af'}">${v.review_status || '—'}</span></td>
      </tr>
    `).join("");

    const biomarkerRows = (reportData.biomarkers || []).map((b: any) => {
      const statusColor = b.status === "positive" ? "#dc2626" : b.status === "negative" ? "#16a34a" : "#9ca3af";
      return `<tr>
        <td style="font-weight:500">${b.name}</td>
        <td><span style="background:${statusColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px">${b.status}</span></td>
        <td style="font-size:11px">${b.type}</td>
        <td style="font-size:11px">Level ${b.evidence_level}</td>
        <td style="font-size:11px">${b.clinical_implication}</td>
        ${b.requires_confirmation ? `<td style="font-size:11px;color:#ea580c">⚠ ${b.confirmation_method}</td>` : '<td style="font-size:11px">—</td>'}
      </tr>`;
    }).join("");

    const therapyRows = (reportData.therapeutic_options || []).map((t: any) => `
      <tr>
        <td style="font-weight:500">${t.therapy}${t.contraindicated ? ' ⚠️' : ''}</td>
        <td style="font-size:11px">Level ${t.evidence_level}</td>
        <td style="font-size:11px">${t.approved_status}</td>
        <td style="font-size:11px">${t.rationale}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clinical Report — ${caseData.case_number}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #1a1a2e; line-height: 1.5; padding: 20px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 18px; color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 8px; margin-bottom: 14px; }
  h2 { font-size: 14px; color: #1e40af; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
  th { background: #f1f5f9; font-weight: 600; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 6px 0 14px; }
  .info-item { background: #f8fafc; padding: 6px 10px; border-radius: 4px; border: 1px solid #e2e8f0; }
  .info-item label { display: block; font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-item span { font-size: 12px; font-weight: 600; }
  .risk-box { padding: 10px 14px; border-radius: 6px; margin: 6px 0; }
  .risk-high { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
  .risk-standard { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
  .risk-insufficient { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
  .warning-box { background: #fffbeb; border: 1px solid #fde68a; padding: 8px 12px; border-radius: 4px; margin: 6px 0; font-size: 11px; }
  .disclaimer { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px 14px; border-radius: 4px; margin-top: 20px; font-size: 10px; color: #475569; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<h1>🧬 Myeloma GenesInsight — Clinical Report</h1>

<div class="info-grid">
  <div class="info-item"><label>Case Number</label><span>${caseData.case_number}</span></div>
  <div class="info-item"><label>Report ID</label><span style="font-size:10px;font-family:monospace">${reportData.report_id}</span></div>
  <div class="info-item"><label>Generated</label><span>${new Date(now).toLocaleString()}</span></div>
  <div class="info-item"><label>Diagnosis</label><span>${diagnosisLabels[caseData.diagnosis] || caseData.diagnosis}</span></div>
  <div class="info-item"><label>Sample Type</label><span>${sampleLabels[caseData.sample_type] || caseData.sample_type}</span></div>
  <div class="info-item"><label>Assembly</label><span>${caseData.assembly}</span></div>
  <div class="info-item"><label>Patient</label><span>${caseData.patient_sex}, ${caseData.patient_age}y</span></div>
  <div class="info-item"><label>Prior Lines</label><span>${caseData.prior_treatment_lines}</span></div>
  <div class="info-item"><label>Transplant</label><span>${caseData.transplant_eligibility}</span></div>
  ${caseData.iss_stage ? `<div class="info-item"><label>ISS</label><span>Stage ${caseData.iss_stage}</span></div>` : ''}
  ${caseData.riss_stage ? `<div class="info-item"><label>R-ISS</label><span>Stage ${caseData.riss_stage}</span></div>` : ''}
  <div class="info-item"><label>Pipeline</label><span>v${reportData.pipeline_version}</span></div>
</div>

<h2>Molecular Risk Assessment</h2>
<div class="risk-box ${molSummary?.risk_category === 'high' ? 'risk-high' : molSummary?.risk_category === 'insufficient_data' ? 'risk-insufficient' : 'risk-standard'}">
  <strong>${molSummary?.risk_category === 'high' ? '⚠ HIGH RISK' : molSummary?.risk_category === 'insufficient_data' ? 'INSUFFICIENT DATA' : '✓ STANDARD RISK'}</strong>
  <p style="margin-top:4px;font-size:11px">${molSummary?.molecular_prognosis || 'No molecular summary available.'}</p>
</div>
${(molSummary?.high_risk_features || []).length > 0 ? `<div style="margin:6px 0"><strong style="font-size:11px;color:#dc2626">High-Risk Features:</strong><ul style="margin:4px 0 0 16px;font-size:11px">${molSummary.high_risk_features.map((f: string) => `<li>${f}</li>`).join('')}</ul></div>` : ''}
${(molSummary?.double_hits || []).length > 0 ? `<div style="margin:6px 0"><strong style="font-size:11px;color:#dc2626">⚠ Multi-Hit Events:</strong><ul style="margin:4px 0 0 16px;font-size:11px">${molSummary.double_hits.map((d: string) => `<li>${d}</li>`).join('')}</ul></div>` : ''}

<h2>Quality Control</h2>
<div class="info-grid">
  <div class="info-item"><label>Total Variants</label><span>${reportData.qc.total_variants?.toLocaleString() || 'N/A'}</span></div>
  <div class="info-item"><label>Passed Filter</label><span>${reportData.qc.passed_filter?.toLocaleString() || 'N/A'}</span></div>
  <div class="info-item"><label>Mean Depth</label><span>${reportData.qc.mean_depth ? reportData.qc.mean_depth + 'x' : 'N/A'}</span></div>
  <div class="info-item"><label>Mean Quality</label><span>${reportData.qc.mean_quality || 'N/A'}</span></div>
  <div class="info-item"><label>Build Match</label><span>${reportData.qc.genome_build_match ? '✓ Yes' : '✗ Mismatch'}</span></div>
  <div class="info-item"><label>Assessments</label><span>CNV:${reportData.qc.cnv_assessed ? '✓' : '✗'} Fusion:${reportData.qc.fusion_assessed ? '✓' : '✗'} SV:${reportData.qc.sv_assessed ? '✓' : '✗'}</span></div>
</div>
${(reportData.qc.warnings || []).length > 0 ? `<div class="warning-box"><strong>⚠ QC Warnings:</strong><ul style="margin:4px 0 0 16px">${reportData.qc.warnings.map((w: string) => `<li>${w}</li>`).join('')}</ul></div>` : ''}

<h2>Clinically Relevant Variants (Tier I–II)</h2>
${enrichedVariants.length > 0 ? `
<table>
  <thead><tr><th>Gene</th><th>Position</th><th>Change</th><th>HGVS</th><th>Tier</th><th>Classification</th><th>AF</th><th>ClinVar</th><th>Review</th></tr></thead>
  <tbody>${variantRows}</tbody>
</table>` : '<p style="color:#6b7280;font-style:italic;margin:6px 0">No Tier I–II variants identified.</p>'}

<h2>Biomarkers</h2>
<table>
  <thead><tr><th>Biomarker</th><th>Status</th><th>Type</th><th>Evidence</th><th>Clinical Implication</th><th>Confirmation</th></tr></thead>
  <tbody>${biomarkerRows}</tbody>
</table>

<h2>Therapeutic Options (Decision Support)</h2>
${therapyRows ? `
<table>
  <thead><tr><th>Therapy</th><th>Evidence</th><th>Status</th><th>Rationale</th></tr></thead>
  <tbody>${therapyRows}</tbody>
</table>` : '<p style="color:#6b7280;font-style:italic;margin:6px 0">No actionable therapeutic options identified.</p>'}

${reportData.limitations.length > 0 ? `
<h2>Limitations & Caveats</h2>
<ul style="font-size:11px;margin-left:16px">${reportData.limitations.map((l: string) => `<li>${l}</li>`).join('')}</ul>` : ''}

${reportData.manual_review_reasons.length > 0 ? `
<h2>Manual Review Required</h2>
<div class="warning-box"><ul style="margin-left:16px">${reportData.manual_review_reasons.map((r: string) => `<li>${r}</li>`).join('')}</ul></div>` : ''}

<div class="disclaimer">
  <strong>⚖ DISCLAIMER</strong><br>
  ${reportData.disclaimer}
</div>

<div class="footer">
  Myeloma GenesInsight · Report ${reportData.report_id} · Generated ${new Date(now).toISOString()} · Pipeline v${reportData.pipeline_version}<br>
  Source: deterministic rule engine — no AI-generated interpretations
</div>
</body>
</html>`;

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
