// deno-lint-ignore-file no-explicit-any

const tierColors: Record<number, string> = { 1: "#dc2626", 2: "#ea580c", 3: "#ca8a04", 4: "#6b7280" };

const diagnosisLabels: Record<string, string> = {
  mgus: "MGUS",
  smoldering_mm: "Smoldering Multiple Myeloma",
  newly_diagnosed_mm: "Newly Diagnosed Multiple Myeloma",
  relapsed_refractory_mm: "Relapsed/Refractory Multiple Myeloma",
};

const sampleLabels: Record<string, string> = {
  somatic_tumor: "Somatic Tumor",
  germline_constitutional: "Germline Constitutional",
  tumor_normal_paired: "Tumor-Normal Paired",
};

export function renderHtml(reportData: any, caseData: any, enrichedVariants: any[], molSummary: any, now: string): string {
  const variantRows = enrichedVariants.map((v: any) => `
    <tr>
      <td style="font-weight:600;font-family:monospace">${v.gene}${v.is_hotspot ? " \u{1F525}" : ""}</td>
      <td style="font-family:monospace;font-size:11px">chr${v.chrom}:${v.pos}</td>
      <td style="font-family:monospace;font-size:11px">${v.ref}\u2192${v.alt}</td>
      <td style="font-family:monospace;font-size:11px">${v.hgvs_p || v.hgvs_c || "\u2014"}</td>
      <td><span style="background:${tierColors[v.tier] || "#6b7280"};color:white;padding:2px 8px;border-radius:4px;font-size:11px">Tier ${v.tier}</span></td>
      <td style="font-size:11px">${v.classification?.replace(/_/g, " ") || "\u2014"}</td>
      <td style="font-size:11px">${v.af ? (v.af * 100).toFixed(1) + "%" : "\u2014"}</td>
      <td style="font-size:11px">${v.clinvar_significance?.replace(/_/g, " ") || "\u2014"}</td>
      <td style="font-size:11px"><span style="color:${v.review_status === "approved" ? "#16a34a" : v.review_status === "rejected" ? "#dc2626" : "#9ca3af"}">${v.review_status || "\u2014"}</span></td>
    </tr>
  `).join("");

  const biomarkerRows = (reportData.biomarkers || []).map((b: any) => {
    const sc = b.status === "positive" ? "#dc2626" : b.status === "negative" ? "#16a34a" : "#9ca3af";
    return `<tr>
      <td style="font-weight:500">${b.name}</td>
      <td><span style="background:${sc};color:white;padding:2px 8px;border-radius:4px;font-size:11px">${b.status}</span></td>
      <td style="font-size:11px">${b.type}</td>
      <td style="font-size:11px">Level ${b.evidence_level}</td>
      <td style="font-size:11px">${b.clinical_implication}</td>
      ${b.requires_confirmation ? `<td style="font-size:11px;color:#ea580c">\u26A0 ${b.confirmation_method}</td>` : '<td style="font-size:11px">\u2014</td>'}
    </tr>`;
  }).join("");

  const therapyRows = (reportData.therapeutic_options || []).map((t: any) => `
    <tr>
      <td style="font-weight:500">${t.therapy}${t.contraindicated ? " \u26A0\uFE0F" : ""}</td>
      <td style="font-size:11px">Level ${t.evidence_level}</td>
      <td style="font-size:11px">${t.approved_status}</td>
      <td style="font-size:11px">${t.rationale}</td>
    </tr>
  `).join("");

  const highRiskHtml = (molSummary?.high_risk_features || []).length > 0
    ? `<div style="margin:6px 0"><strong style="font-size:11px;color:#dc2626">High-Risk Features:</strong><ul style="margin:4px 0 0 16px;font-size:11px">${molSummary.high_risk_features.map((f: string) => `<li>${f}</li>`).join("")}</ul></div>`
    : "";

  const doubleHitsHtml = (molSummary?.double_hits || []).length > 0
    ? `<div style="margin:6px 0"><strong style="font-size:11px;color:#dc2626">\u26A0 Multi-Hit Events:</strong><ul style="margin:4px 0 0 16px;font-size:11px">${molSummary.double_hits.map((d: string) => `<li>${d}</li>`).join("")}</ul></div>`
    : "";

  const qcWarningsHtml = (reportData.qc.warnings || []).length > 0
    ? `<div class="warning-box"><strong>\u26A0 QC Warnings:</strong><ul style="margin:4px 0 0 16px">${reportData.qc.warnings.map((w: string) => `<li>${w}</li>`).join("")}</ul></div>`
    : "";

  const limitationsHtml = (reportData.limitations || []).length > 0
    ? `<h2>Limitations &amp; Caveats</h2><ul style="font-size:11px;margin-left:16px">${reportData.limitations.map((l: string) => `<li>${l}</li>`).join("")}</ul>`
    : "";

  const manualReviewHtml = (reportData.manual_review_reasons || []).length > 0
    ? `<h2>Manual Review Required</h2><div class="warning-box"><ul style="margin-left:16px">${reportData.manual_review_reasons.map((r: string) => `<li>${r}</li>`).join("")}</ul></div>`
    : "";

  const riskClass = molSummary?.risk_category === "high" ? "risk-high" : molSummary?.risk_category === "insufficient_data" ? "risk-insufficient" : "risk-standard";
  const riskLabel = molSummary?.risk_category === "high" ? "\u26A0 HIGH RISK" : molSummary?.risk_category === "insufficient_data" ? "INSUFFICIENT DATA" : "\u2713 STANDARD RISK";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clinical Report \u2014 ${caseData.case_number}</title>
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
<h1>\u{1F9EC} Myeloma GenesInsight \u2014 Clinical Report</h1>

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
  ${caseData.iss_stage ? `<div class="info-item"><label>ISS</label><span>Stage ${caseData.iss_stage}</span></div>` : ""}
  ${caseData.riss_stage ? `<div class="info-item"><label>R-ISS</label><span>Stage ${caseData.riss_stage}</span></div>` : ""}
  <div class="info-item"><label>Pipeline</label><span>v${reportData.pipeline_version}</span></div>
</div>

<h2>Molecular Risk Assessment</h2>
<div class="risk-box ${riskClass}">
  <strong>${riskLabel}</strong>
  <p style="margin-top:4px;font-size:11px">${molSummary?.molecular_prognosis || "No molecular summary available."}</p>
</div>
${highRiskHtml}
${doubleHitsHtml}

<h2>Quality Control</h2>
<div class="info-grid">
  <div class="info-item"><label>Total Variants</label><span>${reportData.qc.total_variants?.toLocaleString() || "N/A"}</span></div>
  <div class="info-item"><label>Passed Filter</label><span>${reportData.qc.passed_filter?.toLocaleString() || "N/A"}</span></div>
  <div class="info-item"><label>Mean Depth</label><span>${reportData.qc.mean_depth ? reportData.qc.mean_depth + "x" : "N/A"}</span></div>
  <div class="info-item"><label>Mean Quality</label><span>${reportData.qc.mean_quality || "N/A"}</span></div>
  <div class="info-item"><label>Build Match</label><span>${reportData.qc.genome_build_match ? "\u2713 Yes" : "\u2717 Mismatch"}</span></div>
  <div class="info-item"><label>Assessments</label><span>CNV:${reportData.qc.cnv_assessed ? "\u2713" : "\u2717"} Fusion:${reportData.qc.fusion_assessed ? "\u2713" : "\u2717"} SV:${reportData.qc.sv_assessed ? "\u2713" : "\u2717"}</span></div>
</div>
${qcWarningsHtml}

<h2>Clinically Relevant Variants (Tier I\u2013II)</h2>
${enrichedVariants.length > 0 ? `
<table>
  <thead><tr><th>Gene</th><th>Position</th><th>Change</th><th>HGVS</th><th>Tier</th><th>Classification</th><th>AF</th><th>ClinVar</th><th>Review</th></tr></thead>
  <tbody>${variantRows}</tbody>
</table>` : '<p style="color:#6b7280;font-style:italic;margin:6px 0">No Tier I\u2013II variants identified.</p>'}

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

${limitationsHtml}
${manualReviewHtml}

<div class="disclaimer">
  <strong>\u2696 DISCLAIMER</strong><br>
  ${reportData.disclaimer}
</div>

<div class="footer">
  Myeloma GenesInsight \u00B7 Report ${reportData.report_id} \u00B7 Generated ${new Date(now).toISOString()} \u00B7 Pipeline v${reportData.pipeline_version}<br>
  Source: deterministic rule engine \u2014 no AI-generated interpretations
</div>
</body>
</html>`;
}
