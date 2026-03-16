import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================
// GENE REFERENCE CACHE (loaded from DB at runtime)
// ============================================================
interface GeneRef {
  gene_symbol: string;
  chromosome: string;
  start_pos: number;
  end_pos: number;
  mm_relevance: string | null;
  mm_tier_default: number | null;
}

// ============================================================
// MM THERAPEUTIC MAP — Evidence-based, structured by region
// ============================================================
interface TherapyEntry {
  therapy: string;
  evidence: string;
  rationale: string;
  approved: Record<string, string>;
  line: string; // "1L", "2L", "3L+", "any"
  contraindicated_conditions?: string[];
}

const MM_THERAPEUTIC_MAP: Record<string, TherapyEntry[]> = {
  BRAF_V600E: [{
    therapy: "Vemurafenib + Cobimetinib",
    evidence: "C",
    rationale: "BRAF V600E is a targetable kinase mutation. Case reports and small series show durable responses in refractory MM with BRAF V600E.",
    approved: { us: "off-label", eu: "off-label", brazil: "off-label" },
    line: "3L+",
  }],
  KRAS: [{
    therapy: "MEK inhibitor (Trametinib — investigational)",
    evidence: "D",
    rationale: "RAS/MAPK pathway activation via KRAS mutation. Preclinical and early clinical data suggest MEK inhibitor sensitivity.",
    approved: { us: "investigational", eu: "investigational", brazil: "investigational" },
    line: "3L+",
  }],
  NRAS: [{
    therapy: "MEK inhibitor (Trametinib — investigational)",
    evidence: "D",
    rationale: "NRAS-driven MAPK activation. Similar rationale to KRAS-mutant cases.",
    approved: { us: "investigational", eu: "investigational", brazil: "investigational" },
    line: "3L+",
  }],
  TP53: [{
    therapy: "Bispecific T-cell engager (Teclistamab, Elranatamab)",
    evidence: "B",
    rationale: "TP53-mutant MM has poor response to standard therapies. Bispecific antibodies targeting BCMA show activity regardless of cytogenetic risk.",
    approved: { us: "FDA approved (≥4 prior lines)", eu: "EMA conditional", brazil: "not approved" },
    line: "3L+",
  }, {
    therapy: "CAR-T (Idecabtagene vicleucel / Ciltacabtagene autoleucel)",
    evidence: "B",
    rationale: "CAR-T anti-BCMA therapies show responses in high-risk cytogenetics including TP53 mutations, though durability may be reduced.",
    approved: { us: "FDA approved (≥4 prior lines)", eu: "EMA approved", brazil: "not approved" },
    line: "3L+",
  }],
  CCND1: [{
    therapy: "Venetoclax + Dexamethasone",
    evidence: "B",
    rationale: "CCND1 overexpression (via t(11;14)) is associated with BCL-2 dependence. Venetoclax shows high response rates in t(11;14)+ MM.",
    approved: { us: "breakthrough therapy", eu: "not approved for MM", brazil: "not approved for MM" },
    line: "2L+",
    contraindicated_conditions: ["Requires confirmation of t(11;14) by FISH"],
  }],
  CRBN: [{
    therapy: "Avoid IMiD-based regimens if CRBN mutated",
    evidence: "C",
    rationale: "CRBN (Cereblon) mutations confer resistance to immunomodulatory drugs (lenalidomide, pomalidomide). Consider proteasome inhibitor-based alternatives.",
    approved: { us: "clinical guidance", eu: "clinical guidance", brazil: "clinical guidance" },
    line: "any",
  }],
  XPO1: [{
    therapy: "Selinexor + Dexamethasone",
    evidence: "B",
    rationale: "XPO1 is the direct target of selinexor. E571K hotspot mutation may affect drug binding but overall XPO1 pathway activation supports use.",
    approved: { us: "FDA approved (≥4 prior lines)", eu: "EMA approved", brazil: "not approved" },
    line: "3L+",
  }],
  FGFR3: [{
    therapy: "Consider avoiding IMiD monotherapy; FGFR inhibitor investigational",
    evidence: "D",
    rationale: "FGFR3 overexpression via t(4;14). FGFR-targeting agents are investigational. Standard approach is proteasome inhibitor-based.",
    approved: { us: "investigational", eu: "investigational", brazil: "investigational" },
    line: "any",
  }],
  // === NEW: Drug resistance markers ===
  IKZF1: [{
    therapy: "Reduced IMiD sensitivity — consider alternative backbone",
    evidence: "C",
    rationale: "IKZF1 mutations may impair IMiD-mediated degradation of Ikaros, reducing lenalidomide/pomalidomide efficacy.",
    approved: { us: "clinical guidance", eu: "clinical guidance", brazil: "clinical guidance" },
    line: "any",
  }],
  IKZF3: [{
    therapy: "Reduced IMiD sensitivity — consider alternative backbone",
    evidence: "C",
    rationale: "IKZF3 (Aiolos) mutations may confer resistance to IMiD class agents.",
    approved: { us: "clinical guidance", eu: "clinical guidance", brazil: "clinical guidance" },
    line: "any",
  }],
  PSMB5: [{
    therapy: "Potential proteasome inhibitor resistance (Bortezomib/Carfilzomib)",
    evidence: "D",
    rationale: "PSMB5 mutations in the bortezomib-binding pocket can reduce proteasome inhibitor binding affinity. Consider carfilzomib or switch class.",
    approved: { us: "clinical guidance", eu: "clinical guidance", brazil: "clinical guidance" },
    line: "any",
  }],
  // === NEW: Actionable pathway targets ===
  BCL2: [{
    therapy: "Venetoclax (BCL-2 inhibitor)",
    evidence: "C",
    rationale: "BCL-2 overexpression or gain-of-function mutations may sensitize to venetoclax, especially in t(11;14) context.",
    approved: { us: "off-label", eu: "off-label", brazil: "off-label" },
    line: "2L+",
  }],
  ATM: [{
    therapy: "PARP inhibitor sensitivity (investigational in MM)",
    evidence: "D",
    rationale: "ATM loss-of-function creates synthetic lethal vulnerability to PARP inhibitors. Investigational in MM.",
    approved: { us: "investigational", eu: "investigational", brazil: "investigational" },
    line: "3L+",
  }],
  ATR: [{
    therapy: "ATR inhibitor (investigational)",
    evidence: "D",
    rationale: "ATR pathway defects may sensitize to ATR or CHK1 inhibitors. Early phase trials in hematologic malignancies.",
    approved: { us: "investigational", eu: "investigational", brazil: "investigational" },
    line: "3L+",
  }],
  // === NEW: NF-kB pathway ===
  TRAF3: [{
    therapy: "NF-kB pathway-targeted therapy (investigational)",
    evidence: "D",
    rationale: "TRAF3 loss leads to constitutive NF-kB activation. Proteasome inhibitors partially target this pathway.",
    approved: { us: "clinical guidance", eu: "clinical guidance", brazil: "clinical guidance" },
    line: "any",
  }],
  CYLD: [{
    therapy: "NF-kB pathway activation — proteasome inhibitor may retain benefit",
    evidence: "D",
    rationale: "CYLD loss activates NF-kB signaling. Bortezomib/carfilzomib target NF-kB via IκBα stabilization.",
    approved: { us: "clinical guidance", eu: "clinical guidance", brazil: "clinical guidance" },
    line: "any",
  }],
  // === NEW: Epigenetic targets ===
  KDM6A: [{
    therapy: "EZH2 inhibitor (Tazemetostat — investigational in MM)",
    evidence: "D",
    rationale: "KDM6A loss may create dependence on EZH2-mediated gene silencing. Tazemetostat is FDA-approved for other indications.",
    approved: { us: "investigational", eu: "investigational", brazil: "investigational" },
    line: "3L+",
  }],
  NSD2: [{
    therapy: "Histone methyltransferase inhibitor (investigational)",
    evidence: "D",
    rationale: "NSD2/MMSET overexpression via t(4;14) drives H3K36me2. Targeted agents in preclinical development.",
    approved: { us: "investigational", eu: "investigational", brazil: "investigational" },
    line: "3L+",
  }],
};

// ============================================================
// MM HOTSPOT MUTATIONS — GRCh37 + GRCh38
// ============================================================
const MM_HOTSPOTS_37: Record<string, { positions: number[]; significance: string }> = {
  TP53: { positions: [7577548, 7577539, 7577120, 7578406, 7578190, 7578271, 7578212], significance: "DNA binding domain hotspot" },
  KRAS: { positions: [25245350, 25245347, 25227342], significance: "GTPase domain (G12/G13/Q61)" },
  NRAS: { positions: [114716126, 114713908, 114713909], significance: "GTPase domain (G12/G13/Q61)" },
  BRAF: { positions: [140753336, 140753335], significance: "Kinase domain (V600)" },
  XPO1: { positions: [61714532], significance: "E571K hotspot" },
};

const MM_HOTSPOTS_38: Record<string, { positions: number[]; significance: string }> = {
  TP53: { positions: [7674220, 7674211, 7673792, 7675078, 7674862, 7674943, 7674884], significance: "DNA binding domain hotspot" },
  KRAS: { positions: [25245350, 25245347, 25227342], significance: "GTPase domain (G12/G13/Q61)" },
  NRAS: { positions: [114713464, 114711246, 114711247], significance: "GTPase domain (G12/G13/Q61)" },
  BRAF: { positions: [140753336, 140753335], significance: "Kinase domain (V600)" },
  XPO1: { positions: [61534527], significance: "E571K hotspot" },
};

// ============================================================
// VCF PARSER — Robust with validation
// ============================================================
interface ParsedVariant {
  chrom: string;
  pos: number;
  id_field: string;
  ref: string;
  alt: string;
  qual: number | null;
  filter: string;
  info: Record<string, string>;
  format_fields: string[];
  sample_data: Record<string, string>;
}

interface VcfParseResult {
  headerLines: string[];
  variants: ParsedVariant[];
  sampleNames: string[];
  assemblyDetected: string | null;
  infoFields: string[];
  formatFields: string[];
  vcfVersion: string | null;
  isValid: boolean;
  validationErrors: string[];
}

function parseVcfContent(content: string): VcfParseResult {
  const lines = content.split("\n");
  const headerLines: string[] = [];
  const dataLines: string[] = [];
  let sampleNames: string[] = [];
  let assemblyDetected: string | null = null;
  let vcfVersion: string | null = null;
  const infoFieldSet = new Set<string>();
  const formatFieldSet = new Set<string>();
  const validationErrors: string[] = [];
  let hasChromLine = false;

  for (const line of lines) {
    if (line.startsWith("##")) {
      headerLines.push(line);
      if (line.startsWith("##fileformat=")) vcfVersion = line.split("=")[1]?.trim() || null;
      if (line.includes("GRCh38") || line.includes("hg38")) assemblyDetected = "GRCh38";
      else if (line.includes("GRCh37") || line.includes("hg19")) assemblyDetected = assemblyDetected || "GRCh37";
      const infoMatch = line.match(/^##INFO=<ID=([^,]+)/);
      if (infoMatch) infoFieldSet.add(infoMatch[1]);
      const fmtMatch = line.match(/^##FORMAT=<ID=([^,]+)/);
      if (fmtMatch) formatFieldSet.add(fmtMatch[1]);
    } else if (line.startsWith("#CHROM")) {
      hasChromLine = true;
      const cols = line.split("\t");
      if (cols.length < 8) validationErrors.push("VCF header has fewer than 8 required columns.");
      sampleNames = cols.slice(9);
    } else if (line.trim().length > 0) {
      dataLines.push(line);
    }
  }

  if (!hasChromLine) validationErrors.push("Missing #CHROM header line — not a valid VCF file.");
  if (!vcfVersion) validationErrors.push("Missing ##fileformat line — VCF version not detected.");

  const variants: ParsedVariant[] = [];
  for (const line of dataLines) {
    const cols = line.split("\t");
    if (cols.length < 8) continue;

    const infoObj: Record<string, string> = {};
    if (cols[7] && cols[7] !== ".") {
      for (const part of cols[7].split(";")) {
        const eqIdx = part.indexOf("=");
        if (eqIdx > 0) {
          infoObj[part.substring(0, eqIdx)] = part.substring(eqIdx + 1);
        } else {
          infoObj[part] = "true";
        }
      }
    }

    const fmtArr = cols[8] ? cols[8].split(":") : [];
    const sampleObj: Record<string, string> = {};
    if (cols[9] && fmtArr.length > 0) {
      const vals = cols[9].split(":");
      fmtArr.forEach((f, i) => { sampleObj[f] = vals[i] || "."; });
    }

    const alts = cols[4].split(",");
    for (const alt of alts) {
      if (alt === "." || alt === "*") continue;
      variants.push({
        chrom: cols[0].replace("chr", ""),
        pos: parseInt(cols[1]),
        id_field: cols[2],
        ref: cols[3],
        alt,
        qual: cols[5] !== "." ? parseFloat(cols[5]) : null,
        filter: cols[6],
        info: infoObj,
        format_fields: fmtArr,
        sample_data: sampleObj,
      });
    }
  }

  return {
    headerLines,
    variants,
    sampleNames,
    assemblyDetected,
    infoFields: [...infoFieldSet],
    formatFields: [...formatFieldSet],
    vcfVersion,
    isValid: validationErrors.length === 0 && hasChromLine,
    validationErrors,
  };
}

// ============================================================
// ANNOTATION EXTRACTION — Gene, consequence, HGVS, rsID, transcript, effect
// ============================================================
interface ExtractedAnnotation {
  gene: string | null;
  consequence: string | null;
  hgvs_c: string | null;
  hgvs_p: string | null;
  transcript: string | null;
  rsid: string | null;
  predicted_effect: string | null;
  annotation_source: string;
}

function extractFullAnnotation(v: ParsedVariant, geneRefs: GeneRef[]): ExtractedAnnotation {
  const result: ExtractedAnnotation = {
    gene: null, consequence: null, hgvs_c: null, hgvs_p: null,
    transcript: null, rsid: null, predicted_effect: null,
    annotation_source: "none",
  };

  // rsID from VCF ID column or INFO
  if (v.id_field && v.id_field !== "." && v.id_field.startsWith("rs")) {
    result.rsid = v.id_field;
  } else if (v.info["RS"]) {
    result.rsid = `rs${v.info["RS"]}`;
  } else if (v.info["RSID"]) {
    result.rsid = v.info["RSID"];
  }

  // ANN field (SnpEff format): Allele|Annotation|Impact|Gene|GeneID|FeatureType|FeatureID|TranscriptBiotype|Rank|HGVS.c|HGVS.p|...
  if (v.info["ANN"]) {
    const p = v.info["ANN"].split("|");
    result.gene = p[3] || null;
    result.consequence = p[1] || null;
    result.transcript = p[6] || null;
    result.hgvs_c = p[9] || null;
    result.hgvs_p = p[10] || null;
    result.predicted_effect = p[2] || null; // Impact: HIGH, MODERATE, LOW, MODIFIER
    result.annotation_source = "snpeff_ann";
    return result;
  }

  // CSQ field (VEP format): Allele|Consequence|IMPACT|SYMBOL|Gene|Feature_type|Feature|BIOTYPE|EXON|INTRON|HGVSc|HGVSp|...
  if (v.info["CSQ"]) {
    const p = v.info["CSQ"].split("|");
    result.gene = p[3] || null;
    result.consequence = p[1] || null;
    result.transcript = p[6] || null;
    result.hgvs_c = p[10] || null;
    result.hgvs_p = p[11] || null;
    result.predicted_effect = p[2] || null; // IMPACT
    result.annotation_source = "vep_csq";
    return result;
  }

  // Direct INFO fields
  for (const key of ["GENE", "Gene", "gene", "SYMBOL"]) {
    if (v.info[key]) { result.gene = v.info[key]; result.annotation_source = "vcf_info_field"; break; }
  }
  if (v.info["EFFECT"]) result.consequence = v.info["EFFECT"];
  if (v.info["IMPACT"]) result.predicted_effect = v.info["IMPACT"];
  if (v.info["HGVS_C"] || v.info["HGVSc"]) result.hgvs_c = v.info["HGVS_C"] || v.info["HGVSc"];
  if (v.info["HGVS_P"] || v.info["HGVSp"]) result.hgvs_p = v.info["HGVS_P"] || v.info["HGVSp"];
  if (v.info["Feature"] || v.info["TRANSCRIPT"]) result.transcript = v.info["Feature"] || v.info["TRANSCRIPT"];

  // Positional lookup fallback
  if (!result.gene) {
    const geneRef = lookupGeneByPosition(v.chrom, v.pos, geneRefs);
    if (geneRef) {
      result.gene = geneRef.gene_symbol;
      result.annotation_source = "positional_lookup_v1";
    }
  }

  return result;
}

function lookupGeneByPosition(chrom: string, pos: number, geneRefs: GeneRef[]): GeneRef | null {
  const normalizedChrom = chrom.replace("chr", "");
  for (const g of geneRefs) {
    if (g.chromosome === normalizedChrom && pos >= g.start_pos && pos <= g.end_pos) {
      return g;
    }
  }
  return null;
}

// ============================================================
// QC SERVICE
// ============================================================
function generateQC(parsed: VcfParseResult, expectedAssembly: string) {
  const { variants, assemblyDetected, infoFields, formatFields } = parsed;
  const total = variants.length;
  const passed = variants.filter((v) => v.filter === "PASS" || v.filter === ".").length;
  const failed = total - passed;

  const depths = variants.map((v) => {
    const dp = v.info["DP"] || v.sample_data["DP"];
    return dp && dp !== "." ? parseInt(dp) : null;
  }).filter((d): d is number => d !== null);

  const quals = variants.map((v) => v.qual).filter((q): q is number => q !== null);

  const allFields = [...infoFields, ...formatFields];
  const expectedFields = ["QUAL", "DP", "AF", "FILTER", "GT", "AD", "GQ"];
  const detected = expectedFields.filter((f) => allFields.includes(f) || f === "QUAL" || f === "FILTER");
  const missing = expectedFields.filter((f) => !detected.includes(f));

  const warnings: string[] = [];
  if (!infoFields.includes("SVTYPE") && !infoFields.includes("SVLEN")) {
    warnings.push("Structural variant calls not detected — translocations not assessed from current file.");
  }
  warnings.push("CNV data not present in VCF — copy number alterations not assessed.");
  warnings.push("Gene fusion data not present — fusion events not assessed.");

  if (depths.length > 0) {
    const meanDp = depths.reduce((a, b) => a + b, 0) / depths.length;
    if (meanDp < 30) warnings.push(`Low mean read depth (${meanDp.toFixed(0)}x). Results may have reduced sensitivity.`);
  }

  if (!parsed.isValid) {
    for (const err of parsed.validationErrors) warnings.push(`VCF Validation: ${err}`);
  }

  return {
    total_variants: total,
    passed_filter: passed,
    failed_filter: failed,
    mean_depth: depths.length > 0 ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length) : null,
    mean_quality: quals.length > 0 ? parseFloat((quals.reduce((a, b) => a + b, 0) / quals.length).toFixed(1)) : null,
    genome_build_detected: assemblyDetected || "unknown",
    genome_build_match: assemblyDetected === expectedAssembly,
    fields_detected: detected,
    fields_missing: missing,
    warnings,
    cnv_assessed: false,
    fusion_assessed: false,
    sv_assessed: false,
  };
}

// ============================================================
// VARIANT QUALITY FILTER
// ============================================================
interface FilterConfig {
  min_qual: number;
  min_depth: number;
  min_af: number;
  max_population_af: number; // For germline filtering
  require_pass: boolean;
}

const SOMATIC_FILTER: FilterConfig = {
  min_qual: 20,
  min_depth: 10,
  min_af: 0.01,
  max_population_af: 1, // No population filtering for somatic
  require_pass: false,
};

const GERMLINE_FILTER: FilterConfig = {
  min_qual: 20,
  min_depth: 15,
  min_af: 0.15, // Germline expects ~50% or ~100% AF
  max_population_af: 0.01,
  require_pass: false,
};

function passesQualityFilter(v: ParsedVariant, config: FilterConfig): { passes: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const qual = v.qual || 0;
  const dp = parseInt(v.info["DP"] || v.sample_data["DP"] || "0");
  const af = parseFloat(v.info["AF"] || v.sample_data["AF"] || "0");

  if (config.require_pass && v.filter !== "PASS" && v.filter !== ".") reasons.push(`FILTER=${v.filter}`);
  if (qual > 0 && qual < config.min_qual) reasons.push(`QUAL=${qual}<${config.min_qual}`);
  if (dp > 0 && dp < config.min_depth) reasons.push(`DP=${dp}<${config.min_depth}`);
  // Don't filter on AF=0 (might not be present)
  if (af > 0 && af < config.min_af) reasons.push(`AF=${af}<${config.min_af}`);

  // Population allele frequency filtering (germline only)
  // Check gnomAD/ExAC/1000G population AF fields — exclude common polymorphisms
  if (config.max_population_af < 1) {
    const popAfKeys = [
      "gnomAD_AF", "gnomADg_AF", "gnomADe_AF", "AF_popmax", "gnomAD_AF_popmax",
      "ExAC_AF", "1000g2015aug_all", "ESP6500siv2_ALL",
      // VEP CSQ sub-fields sometimes appear as INFO
      "MAX_AF", "gnomADg_AF_NFE", "gnomADe_AF_NFE",
    ];
    for (const key of popAfKeys) {
      const val = v.info[key];
      if (val && val !== "." && val !== "") {
        const popAf = parseFloat(val);
        if (!isNaN(popAf) && popAf > config.max_population_af) {
          reasons.push(`POP_AF(${key})=${popAf}>${config.max_population_af}`);
          break; // One population AF filter is enough
        }
      }
    }
  }

  return { passes: reasons.length === 0, reasons };
}

// ============================================================
// CLINVAR LOOKUP — NCBI E-utilities (public, no API key)
// ============================================================
interface ClinVarResult {
  significance: string;
  review_status: string;
  variation_id: string;
  conditions: string[];
}

async function queryClinVar(
  chrom: string,
  pos: number,
  ref: string,
  alt: string,
  assembly: string,
): Promise<ClinVarResult | null> {
  try {
    const normalizedChrom = chrom.replace("chr", "");

    // === Attempt 1: NCBI Variation Services SPDI endpoint (exact allele match) ===
    // Map chromosome to RefSeq accession
    const chromAccessions38: Record<string, string> = {
      "1": "NC_000001.11", "2": "NC_000002.12", "3": "NC_000003.12", "4": "NC_000004.12",
      "5": "NC_000005.10", "6": "NC_000006.12", "7": "NC_000007.14", "8": "NC_000008.11",
      "9": "NC_000009.12", "10": "NC_000010.11", "11": "NC_000011.10", "12": "NC_000012.12",
      "13": "NC_000013.11", "14": "NC_000014.9", "15": "NC_000015.10", "16": "NC_000016.10",
      "17": "NC_000017.11", "18": "NC_000018.10", "19": "NC_000019.10", "20": "NC_000020.11",
      "21": "NC_000021.9", "22": "NC_000022.11", "X": "NC_000023.11", "Y": "NC_000024.10",
    };
    const chromAccessions37: Record<string, string> = {
      "1": "NC_000001.10", "2": "NC_000002.11", "3": "NC_000003.11", "4": "NC_000004.11",
      "5": "NC_000005.9", "6": "NC_000006.11", "7": "NC_000007.13", "8": "NC_000008.10",
      "9": "NC_000009.11", "10": "NC_000010.10", "11": "NC_000011.9", "12": "NC_000012.11",
      "13": "NC_000013.10", "14": "NC_000014.8", "15": "NC_000015.9", "16": "NC_000016.9",
      "17": "NC_000017.10", "18": "NC_000018.9", "19": "NC_000019.9", "20": "NC_000020.10",
      "21": "NC_000021.8", "22": "NC_000022.10", "X": "NC_000023.10", "Y": "NC_000024.9",
    };
    const accMap = assembly === "GRCh38" ? chromAccessions38 : chromAccessions37;
    const accession = accMap[normalizedChrom];

    if (accession) {
      try {
        // SPDI format: sequence:position:deleted_sequence:inserted_sequence (0-based position)
        const spdiPos = pos - 1; // Convert 1-based VCF to 0-based SPDI
        const spdiUrl = `https://api.ncbi.nlm.nih.gov/variation/v0/spdi/${accession}:${spdiPos}:${ref}:${alt}/clinvar`;
        const spdiResp = await fetch(spdiUrl, { signal: AbortSignal.timeout(5000) });
        
        if (spdiResp.ok) {
          const spdiData = await spdiResp.json();
          if (spdiData?.data?.clinical_significances?.length > 0) {
            const cs = spdiData.data.clinical_significances[0];
            return {
              significance: String(cs.description || cs.clinical_significance || "").toLowerCase().replace(/\s+/g, "_"),
              review_status: String(cs.review_status || "no_review"),
              variation_id: String(spdiData.data.variation_id || spdiData.data.rcv?.[0]?.accession || ""),
              conditions: (spdiData.data.rcv || []).map((r: any) => r.title || r.trait_name || "").filter(Boolean),
            };
          }
        }
      } catch (_spdiErr) {
        // SPDI failed — fall through to esearch
      }
    }

    // === Attempt 2: Fallback to E-utilities esearch/esummary ===
    const searchTerm = `${normalizedChrom}[Chromosome] AND ${pos}[Base Position for Assembly ${assembly === "GRCh38" ? "GRCh38" : "GRCh37"}]`;
    const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(searchTerm)}&retmode=json&retmax=10`;

    const searchResp = await fetch(esearchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchResp.ok) return null;
    const searchData = await searchResp.json();

    const ids: string[] = searchData?.esearchresult?.idlist || [];
    if (ids.length === 0) return null;

    const esummaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${ids.join(",")}&retmode=json`;
    const summaryResp = await fetch(esummaryUrl, { signal: AbortSignal.timeout(8000) });
    if (!summaryResp.ok) return null;
    const summaryData = await summaryResp.json();

    const results = summaryData?.result;
    if (!results) return null;

    for (const uid of ids) {
      const entry = results[uid];
      if (!entry) continue;

      // Check exact allele match via variation_set
      const varSet = entry.variation_set;
      let isExactMatch = false;
      if (varSet && Array.isArray(varSet)) {
        for (const vs of varSet) {
          if (vs.ref_allele === ref && vs.alt_allele === alt) {
            isExactMatch = true;
            break;
          }
        }
      }
      // Accept single result at position as likely match
      if (!isExactMatch && ids.length > 1) continue;

      const significance = entry.clinical_significance?.description ||
                          entry.germline_classification?.description ||
                          (typeof entry.clinical_significance === "string" ? entry.clinical_significance : null);
      if (!significance) continue;

      const reviewStatus = entry.clinical_significance?.review_status || entry.review_status || "no_review";
      const conditions: string[] = [];
      if (entry.trait_set) {
        for (const trait of (Array.isArray(entry.trait_set) ? entry.trait_set : [entry.trait_set])) {
          if (trait?.trait_name) conditions.push(trait.trait_name);
        }
      }

      return {
        significance: String(significance).toLowerCase().replace(/\s+/g, "_"),
        review_status: String(reviewStatus),
        variation_id: String(uid),
        conditions,
      };
    }
    return null;
  } catch (e) {
    console.warn("ClinVar lookup failed:", e);
    return null;
  }
}

// Batch ClinVar lookups with rate limiting (max 3/sec without API key)
async function batchClinVarLookup(
  variants: Array<{ chrom: string; pos: number; ref: string; alt: string; index: number }>,
  assembly: string,
): Promise<Map<number, ClinVarResult>> {
  const results = new Map<number, ClinVarResult>();
  const BATCH_DELAY = 350; // ~3 requests/sec

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const result = await queryClinVar(v.chrom, v.pos, v.ref, v.alt, assembly);
    if (result) {
      results.set(v.index, result);
    }
    // Rate limit
    if (i < variants.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  return results;
}

// ============================================================
// gnomAD POPULATION AF LOOKUP — GraphQL API (public, no key)
// ============================================================
interface GnomadResult {
  af: number | null;
  af_popmax: number | null;
  homozygote_count: number | null;
  source: string; // "gnomad_v4" | "gnomad_v2"
}

async function queryGnomAD(
  chrom: string,
  pos: number,
  ref: string,
  alt: string,
  assembly: string,
): Promise<GnomadResult | null> {
  try {
    const normalizedChrom = chrom.replace("chr", "");
    // gnomAD v4 uses GRCh38, v2 uses GRCh37
    const dataset = assembly === "GRCh38" ? "gnomad_r4" : "gnomad_r2_1";
    const variantId = `${normalizedChrom}-${pos}-${ref}-${alt}`;

    const query = `{
      variant(variantId: "${variantId}", dataset: ${dataset}) {
        variant_id
        exome {
          ac
          an
          homozygote_count
          populations {
            id
            ac
            an
          }
        }
        genome {
          ac
          an
          homozygote_count
          populations {
            id
            ac
            an
          }
        }
      }
    }`;

    const resp = await fetch("https://gnomad.broadinstitute.org/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const variant = data?.data?.variant;
    if (!variant) return null;

    // Compute overall AF from exome + genome
    let totalAc = 0, totalAn = 0, totalHom = 0;
    let popmaxAf = 0;

    for (const src of [variant.exome, variant.genome]) {
      if (!src) continue;
      totalAc += src.ac || 0;
      totalAn += src.an || 0;
      totalHom += src.homozygote_count || 0;

      // Compute popmax AF (highest AF across populations, excluding bottleneck pops)
      const excludePops = new Set(["oth", "ami", "mid", "remaining"]);
      for (const pop of (src.populations || [])) {
        if (excludePops.has(pop.id) || pop.an === 0) continue;
        const popAf = pop.ac / pop.an;
        if (popAf > popmaxAf) popmaxAf = popAf;
      }
    }

    const af = totalAn > 0 ? totalAc / totalAn : null;

    return {
      af,
      af_popmax: popmaxAf > 0 ? popmaxAf : af,
      homozygote_count: totalHom,
      source: assembly === "GRCh38" ? "gnomad_v4" : "gnomad_v2",
    };
  } catch (e) {
    console.warn("gnomAD lookup failed:", e);
    return null;
  }
}

// Batch gnomAD lookups with rate limiting
async function batchGnomADLookup(
  variants: Array<{ chrom: string; pos: number; ref: string; alt: string; index: number }>,
  assembly: string,
): Promise<Map<number, GnomadResult>> {
  const results = new Map<number, GnomadResult>();
  const BATCH_DELAY = 200; // gnomAD GraphQL is generous but be polite

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const result = await queryGnomAD(v.chrom, v.pos, v.ref, v.alt, assembly);
    if (result) {
      results.set(v.index, result);
    }
    if (i < variants.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  return results;
}

// Map ClinVar significance to our classification system
function mapClinVarSignificance(clinvarSig: string): {
  classification: string;
  tierAdjustment: number | null;
  confidence: string;
} {
  const sig = clinvarSig.toLowerCase().replace(/[\s_-]+/g, "_");
  
  if (sig.includes("pathogenic") && !sig.includes("likely") && !sig.includes("conflicting")) {
    return { classification: "pathogenic", tierAdjustment: 1, confidence: "high" };
  }
  if (sig.includes("likely_pathogenic")) {
    return { classification: "likely_pathogenic", tierAdjustment: 2, confidence: "moderate" };
  }
  if (sig.includes("uncertain") || sig.includes("vus")) {
    return { classification: "vus", tierAdjustment: 3, confidence: "low" };
  }
  if (sig.includes("likely_benign")) {
    return { classification: "likely_benign", tierAdjustment: 4, confidence: "moderate" };
  }
  if (sig.includes("benign") && !sig.includes("likely")) {
    return { classification: "benign", tierAdjustment: 4, confidence: "high" };
  }
  if (sig.includes("conflicting")) {
    return { classification: "vus", tierAdjustment: null, confidence: "low" };
  }
  return { classification: "vus", tierAdjustment: null, confidence: "low" };
}

// ============================================================
// CLASSIFICATION SERVICE
// ============================================================
function classifyVariant(
  v: ParsedVariant,
  gene: string | null,
  geneRef: GeneRef | null,
  contextType: string,
  assembly: string,
) {
  const af = parseFloat(v.info["AF"] || v.sample_data["AF"] || "0");
  const dp = parseInt(v.info["DP"] || v.sample_data["DP"] || "0");
  const qual = v.qual || 0;
  const lowQuality = (dp > 0 && dp < 20) || (qual > 0 && qual < 30);

  // Determine relevance from gene reference or hardcoded
  const relevance = geneRef?.mm_relevance || null;
  const isHighRisk = relevance === "high_risk";
  const isRecurrent = relevance === "recurrent";
  const isKnown = relevance === "known";

  // Check hotspot
  const hotspotMap = assembly === "GRCh38" ? MM_HOTSPOTS_38 : MM_HOTSPOTS_37;
  const isHotspot = gene && hotspotMap[gene]?.positions.includes(v.pos);

  let tier = 4;
  let confidence = "low";
  let clinicalSig = "benign_likely";
  let requires_review = false;
  let prognosticSig: string | null = null;

  if (isHighRisk && !lowQuality) {
    tier = 1;
    confidence = "high";
    clinicalSig = "pathogenic_likely";
    prognosticSig = "adverse";
    if (contextType === "germline_constitutional") requires_review = true;
  } else if (isRecurrent && !lowQuality) {
    tier = 2;
    confidence = isHotspot ? "high" : "moderate";
    clinicalSig = isHotspot ? "pathogenic" : "likely_pathogenic";
    prognosticSig = "variable";
  } else if (isKnown && !lowQuality) {
    tier = 3;
    confidence = "low";
    clinicalSig = "vus";
    requires_review = true;
  } else if (gene && !lowQuality) {
    tier = 3;
    confidence = "low";
    clinicalSig = "vus";
    requires_review = true;
  }

  if (lowQuality && tier < 4) {
    requires_review = true;
    confidence = "low";
  }

  // Hotspot upgrade
  if (isHotspot && tier > 2) {
    tier = 2;
    confidence = "moderate";
    clinicalSig = "likely_pathogenic";
  }

  return {
    tier,
    confidence,
    clinical_significance: clinicalSig,
    prognostic_significance: prognosticSig,
    therapeutic_significance: null as string | null,
    requires_manual_review: requires_review,
    is_hotspot: !!isHotspot,
    rationale_json: {
      gene,
      mm_relevance: relevance,
      af,
      dp,
      qual,
      is_high_risk_gene: isHighRisk,
      is_recurrent: isRecurrent,
      is_known: isKnown,
      is_hotspot: !!isHotspot,
      low_quality: lowQuality,
      context_type: contextType,
    },
  };
}

// ============================================================
// THERAPY ENGINE — Expanded
// ============================================================
function findTherapyOptions(gene: string | null, hgvsp: string | null, caseRegion: string, tier: number, clinicalSig: string) {
  if (!gene) return [];
  // VUS never generates therapy (clinical rule)
  if (clinicalSig === "vus") return [];

  const options: { therapy_name: string; evidence_level: string; rationale: string; region: string; approved_status: string; contraindicated_flag: boolean; line: string }[] = [];

  // Mutation-specific check first
  if (gene === "BRAF" && hgvsp && (hgvsp.includes("V600") || hgvsp.includes("Val600"))) {
    const entries = MM_THERAPEUTIC_MAP["BRAF_V600E"] || [];
    for (const e of entries) {
      options.push({
        therapy_name: e.therapy,
        evidence_level: e.evidence,
        rationale: e.rationale,
        region: caseRegion,
        approved_status: e.approved[caseRegion] || e.approved["us"] || "unknown",
        contraindicated_flag: false,
        line: e.line,
      });
    }
  }

  // Gene-level therapies
  const geneEntries = MM_THERAPEUTIC_MAP[gene];
  if (geneEntries) {
    for (const e of geneEntries) {
      // Avoid duplicates
      if (options.some(o => o.therapy_name === e.therapy)) continue;
      options.push({
        therapy_name: e.therapy,
        evidence_level: e.evidence,
        rationale: e.rationale,
        region: caseRegion,
        approved_status: e.approved[caseRegion] || e.approved["us"] || "unknown",
        contraindicated_flag: !!e.contraindicated_conditions?.length,
        line: e.line,
      });
    }
  }

  return options;
}

// ============================================================
// BIOMARKER EXTRACTION
// ============================================================
interface BiomarkerResult {
  biomarker_name: string;
  biomarker_type: string;
  status: string;
  evidence_level: string;
  clinical_implication: string;
  requires_confirmation: boolean;
  confirmation_method: string | null;
}

function extractBiomarkers(
  classifiedVariants: { gene: string | null; tier: number; classification: ReturnType<typeof classifyVariant> }[],
  qc: ReturnType<typeof generateQC>,
): BiomarkerResult[] {
  const biomarkers: BiomarkerResult[] = [];

  // TP53 status
  const tp53Variants = classifiedVariants.filter(v => v.gene === "TP53" && v.tier <= 2);
  biomarkers.push({
    biomarker_name: "TP53 mutation status",
    biomarker_type: "prognostic",
    status: tp53Variants.length > 0 ? "positive" : "negative",
    evidence_level: "A",
    clinical_implication: tp53Variants.length > 0
      ? "TP53 mutation detected — high-risk feature per IMWG/R-ISS/R2-ISS. Associated with poor prognosis and reduced response to standard therapies."
      : "No TP53 mutation detected from sequencing. Note: del(17p) cannot be assessed from VCF — FISH recommended.",
    requires_confirmation: tp53Variants.length > 0,
    confirmation_method: tp53Variants.length > 0 ? "FISH for del(17p) confirmation" : null,
  });

  // RAS pathway
  const rasVariants = classifiedVariants.filter(v => (v.gene === "KRAS" || v.gene === "NRAS") && v.tier <= 2);
  biomarkers.push({
    biomarker_name: "RAS pathway activation",
    biomarker_type: "therapeutic",
    status: rasVariants.length > 0 ? "positive" : "negative",
    evidence_level: "B",
    clinical_implication: rasVariants.length > 0
      ? `RAS mutation(s) detected (${rasVariants.map(v => v.gene).join(", ")}). MAPK pathway activated. Investigational MEK inhibitor sensitivity.`
      : "No RAS pathway mutations detected.",
    requires_confirmation: false,
    confirmation_method: null,
  });

  // BRAF V600E
  const brafVariants = classifiedVariants.filter(v => v.gene === "BRAF" && v.tier <= 2);
  if (brafVariants.length > 0) {
    biomarkers.push({
      biomarker_name: "BRAF V600E",
      biomarker_type: "therapeutic",
      status: "positive",
      evidence_level: "C",
      clinical_implication: "BRAF mutation detected. V600E is actionable with vemurafenib + cobimetinib (off-label, case reports).",
      requires_confirmation: false,
      confirmation_method: null,
    });
  }

  // CRBN (IMiD resistance)
  const crbnVariants = classifiedVariants.filter(v => v.gene === "CRBN" && v.tier <= 3);
  if (crbnVariants.length > 0) {
    biomarkers.push({
      biomarker_name: "Cereblon (CRBN) mutation",
      biomarker_type: "predictive",
      status: "positive",
      evidence_level: "C",
      clinical_implication: "CRBN mutation detected — potential resistance to immunomodulatory drugs (lenalidomide, pomalidomide).",
      requires_confirmation: true,
      confirmation_method: "Functional assay or clinical correlation",
    });
  }

  // XPO1
  const xpo1Variants = classifiedVariants.filter(v => v.gene === "XPO1" && v.tier <= 2);
  if (xpo1Variants.length > 0) {
    biomarkers.push({
      biomarker_name: "XPO1 mutation",
      biomarker_type: "therapeutic",
      status: "positive",
      evidence_level: "B",
      clinical_implication: "XPO1 mutation detected. Selinexor (XPO1 inhibitor) is FDA-approved for RRMM.",
      requires_confirmation: false,
      confirmation_method: null,
    });
  }

  // === NEW: Drug resistance biomarkers ===
  const ikzfVariants = classifiedVariants.filter(v => (v.gene === "IKZF1" || v.gene === "IKZF3") && v.tier <= 3);
  if (ikzfVariants.length > 0) {
    biomarkers.push({
      biomarker_name: "IKZF1/IKZF3 (IMiD pathway)",
      biomarker_type: "predictive",
      status: "positive",
      evidence_level: "C",
      clinical_implication: `${ikzfVariants.map(v => v.gene).join("/")} mutation detected — may reduce IMiD efficacy by impairing cereblon-mediated degradation.`,
      requires_confirmation: true,
      confirmation_method: "Clinical correlation and treatment response monitoring",
    });
  }

  const psmb5Variants = classifiedVariants.filter(v => v.gene === "PSMB5" && v.tier <= 3);
  if (psmb5Variants.length > 0) {
    biomarkers.push({
      biomarker_name: "PSMB5 (Proteasome inhibitor resistance)",
      biomarker_type: "predictive",
      status: "positive",
      evidence_level: "D",
      clinical_implication: "PSMB5 mutation detected — potential resistance to bortezomib. Consider carfilzomib or class switch.",
      requires_confirmation: true,
      confirmation_method: "Functional assay or clinical correlation",
    });
  }

  // === NEW: NF-kB pathway status ===
  const nfkbGenes = ["TRAF3", "CYLD", "BIRC2", "BIRC3"];
  const nfkbVariants = classifiedVariants.filter(v => v.gene && nfkbGenes.includes(v.gene) && v.tier <= 3);
  if (nfkbVariants.length > 0) {
    biomarkers.push({
      biomarker_name: "NF-κB pathway activation",
      biomarker_type: "prognostic",
      status: "positive",
      evidence_level: "C",
      clinical_implication: `NF-κB pathway gene mutation(s) detected: ${[...new Set(nfkbVariants.map(v => v.gene))].join(", ")}. Constitutive NF-κB activation may influence proteasome inhibitor response.`,
      requires_confirmation: false,
      confirmation_method: null,
    });
  }

  // === NEW: DNA damage repair status ===
  const ddrGenes = ["ATM", "ATR", "BRCA1", "BRCA2"];
  const ddrVariants = classifiedVariants.filter(v => v.gene && ddrGenes.includes(v.gene) && v.tier <= 3);
  if (ddrVariants.length > 0) {
    biomarkers.push({
      biomarker_name: "DNA Damage Repair deficiency",
      biomarker_type: "therapeutic",
      status: "positive",
      evidence_level: "D",
      clinical_implication: `DDR gene mutation(s): ${[...new Set(ddrVariants.map(v => v.gene))].join(", ")}. Potential synthetic lethality with PARP inhibitors (investigational in MM).`,
      requires_confirmation: true,
      confirmation_method: "Germline vs somatic confirmation; functional DDR testing",
    });
  }

  // Translocation markers — always "not_assessed" from VCF
  for (const transloc of [
    { name: "t(4;14) / NSD2-FGFR3", type: "prognostic", implication: "Cannot assess from VCF. FISH required. Adverse prognosis if present." },
    { name: "t(11;14) / CCND1-IGH", type: "therapeutic", implication: "Cannot assess from VCF. FISH required. Venetoclax sensitivity if present." },
    { name: "t(14;16) / MAF-IGH", type: "prognostic", implication: "Cannot assess from VCF. FISH required. High-risk if present." },
    { name: "t(14;20) / MAFB-IGH", type: "prognostic", implication: "Cannot assess from VCF. FISH required. High-risk if present." },
    { name: "del(17p)", type: "prognostic", implication: "Cannot confirm chromosomal deletion from VCF. FISH recommended." },
    { name: "gain(1q21)", type: "prognostic", implication: "Cannot assess from VCF. FISH or MLPA required. Adverse in R2-ISS." },
  ]) {
    biomarkers.push({
      biomarker_name: transloc.name,
      biomarker_type: transloc.type,
      status: "not_assessed",
      evidence_level: "A",
      clinical_implication: transloc.implication,
      requires_confirmation: true,
      confirmation_method: "FISH panel",
    });
  }

  // MSI / TMB — not assessable
  biomarkers.push({
    biomarker_name: "Microsatellite Instability (MSI)",
    biomarker_type: "predictive",
    status: "not_assessed",
    evidence_level: "D",
    clinical_implication: "MSI status not assessable from standard VCF. Requires dedicated MSI analysis pipeline.",
    requires_confirmation: true,
    confirmation_method: "MSI-specific panel or IHC for MMR proteins",
  });

  biomarkers.push({
    biomarker_name: "Tumor Mutational Burden (TMB)",
    biomarker_type: "predictive",
    status: "not_assessed",
    evidence_level: "D",
    clinical_implication: "TMB not calculated. Requires whole exome with matched normal for accurate estimation.",
    requires_confirmation: true,
    confirmation_method: "WES with matched normal + validated TMB pipeline",
  });

  return biomarkers;
}

// ============================================================
// MOLECULAR SUMMARY (deterministic — no AI fabrication)
// ============================================================
function generateMolecularSummary(
  qc: ReturnType<typeof generateQC>,
  classifiedVariants: { gene: string | null; tier: number; classification: ReturnType<typeof classifyVariant> }[],
  biomarkers: BiomarkerResult[],
  contextType: string,
) {
  const tier1 = classifiedVariants.filter((v) => v.tier === 1);
  const tier2 = classifiedVariants.filter((v) => v.tier === 2);
  const highRiskGenes = tier1.map((v) => v.gene).filter(Boolean);
  const allRelevantGenes = new Set(classifiedVariants.filter(v => v.tier <= 2).map(v => v.gene).filter(Boolean));

  let riskCategory: "high" | "standard" | "favorable" | "insufficient_data" = "standard";
  if (tier1.length > 0) riskCategory = "high";
  if (classifiedVariants.filter(v => v.tier <= 3).length === 0) riskCategory = "insufficient_data";

  // === DOUBLE-HIT / MULTI-HIT DETECTION ===
  const doubleHitPairs = [
    { genes: ["TP53", "RB1"], label: "TP53 + RB1 (double-hit tumor suppressor)", risk: "very_high" },
    { genes: ["TP53", "DIS3"], label: "TP53 + DIS3 (double high-risk)", risk: "very_high" },
    { genes: ["KRAS", "NRAS"], label: "KRAS + NRAS (dual RAS — rare, verify)", risk: "high" },
    { genes: ["TP53", "KRAS"], label: "TP53 + KRAS (high-risk + MAPK)", risk: "very_high" },
    { genes: ["TP53", "NRAS"], label: "TP53 + NRAS (high-risk + MAPK)", risk: "very_high" },
  ];

  const detectedDoubleHits: string[] = [];
  for (const pair of doubleHitPairs) {
    if (pair.genes.every(g => allRelevantGenes.has(g))) {
      detectedDoubleHits.push(pair.label);
      if (pair.risk === "very_high") riskCategory = "high";
    }
  }

  const summaryParts: string[] = [];

  // Double-hit alert first
  if (detectedDoubleHits.length > 0) {
    summaryParts.push(`⚠ MULTI-HIT DETECTED: ${detectedDoubleHits.join("; ")}. This combination is associated with ultra-high-risk disease and very poor prognosis.`);
  }

  if (tier1.length > 0) {
    summaryParts.push(`${tier1.length} Tier I variant(s) identified in high-risk gene(s): ${[...new Set(highRiskGenes)].join(", ")}.`);
  }
  if (tier2.length > 0) {
    summaryParts.push(`${tier2.length} Tier II variant(s) in recurrently mutated genes with potential clinical significance.`);
  }
  if (tier1.length === 0 && tier2.length === 0) {
    summaryParts.push("No Tier I or Tier II variants identified from current analysis.");
  }

  // Drug resistance alerts
  const resistanceMarkers = biomarkers.filter(b => b.status === "positive" && b.biomarker_type === "predictive");
  if (resistanceMarkers.length > 0) {
    summaryParts.push(`Drug resistance signals: ${resistanceMarkers.map(b => b.biomarker_name).join("; ")}.`);
  }

  // Biomarker-driven additions
  const positiveBiomarkers = biomarkers.filter(b => b.status === "positive" && b.biomarker_type !== "predictive");
  if (positiveBiomarkers.length > 0) {
    summaryParts.push(`Active biomarkers: ${positiveBiomarkers.map(b => b.biomarker_name).join("; ")}.`);
  }

  const notAssessed = biomarkers.filter(b => b.status === "not_assessed");
  if (notAssessed.length > 0) {
    summaryParts.push(`Not assessed from current file: ${notAssessed.map(b => b.biomarker_name).join("; ")}. Complementary testing recommended.`);
  }

  if (contextType === "somatic_tumor") {
    summaryParts.push("Analysis context: somatic tumor. Germline filtering was not applied.");
  } else if (contextType === "germline_constitutional") {
    summaryParts.push("Analysis context: germline constitutional. Somatic-specific classifications may not apply.");
  } else if (contextType === "tumor_normal_paired") {
    summaryParts.push("Analysis context: tumor-normal paired. Germline variants should be subtracted by caller.");
  }

  const highRiskFeatures = [
    ...highRiskGenes.map((g) => `${g} mutation identified — high-risk per IMWG guidelines`),
    ...detectedDoubleHits.map(d => `Multi-hit: ${d}`),
    ...resistanceMarkers.map(r => `Drug resistance: ${r.biomarker_name}`),
  ];

  return {
    molecular_prognosis: summaryParts.join(" "),
    risk_category: riskCategory,
    high_risk_features: highRiskFeatures,
    favorable_features: [] as string[],
    double_hits: detectedDoubleHits,
    resistance_markers: resistanceMarkers.map(r => r.biomarker_name),
    source: "deterministic_rule_engine_v2.1",
    disclaimer: "Generated by rule-based engine. Not AI-inferred. All findings require physician review.",
  };
}

// ============================================================
// STEP LOGGER
// ============================================================
async function logStep(
  supabase: any,
  jobId: string,
  step: string,
  status: "started" | "completed" | "failed",
  details?: Record<string, any>,
) {
  const { data: job } = await supabase.from("analysis_jobs").select("steps_log").eq("id", jobId).single();
  const log = Array.isArray(job?.steps_log) ? job.steps_log : [];
  log.push({ step, status, timestamp: new Date().toISOString(), ...details });
  await supabase.from("analysis_jobs").update({
    current_step: step,
    steps_log: log,
  }).eq("id", jobId);
}

// ============================================================
// MAIN HANDLER
// ============================================================
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate user via getClaims
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub as string;

    const { case_id } = await req.json();
    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch case
    const { data: caseData, error: caseErr } = await supabase.from("cases").select("*").eq("id", case_id).single();
    if (caseErr || !caseData) {
      return new Response(JSON.stringify({ error: "Case not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (caseData.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // IDEMPOTENCY: Check if analysis already exists for this case
    const { data: existingJobs } = await supabase
      .from("analysis_jobs")
      .select("id, status")
      .eq("case_id", case_id)
      .in("status", ["running", "completed"])
      .limit(1);

    if (existingJobs && existingJobs.length > 0) {
      return new Response(JSON.stringify({
        error: "Analysis already exists for this case",
        existing_job_id: existingJobs[0].id,
        existing_status: existingJobs[0].status,
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create analysis job with granular tracking
    const { data: job } = await supabase.from("analysis_jobs").insert({
      case_id,
      status: "running",
      current_step: "uploading",
      started_at: new Date().toISOString(),
      steps_log: [{ step: "job_created", status: "completed", timestamp: new Date().toISOString() }],
    }).select().single();

    const jobId = job!.id;

    // Create sample record
    const { data: sample } = await supabase.from("samples").insert({
      case_id,
      sample_label: caseData.file_name,
      context_type: caseData.sample_type,
      assembly: caseData.assembly,
    }).select().single();

    // ===== STEP 1: DOWNLOAD =====
    await logStep(supabase, jobId, "downloading", "started");
    const { data: fileData, error: dlErr } = await supabase.storage.from("vcf-files").download(caseData.file_path);
    if (dlErr || !fileData) {
      await logStep(supabase, jobId, "downloading", "failed", { error: "Failed to download VCF file" });
      await supabase.from("analysis_jobs").update({ status: "failed", error_message: "Failed to download VCF file", completed_at: new Date().toISOString() }).eq("id", jobId);
      await supabase.from("cases").update({ status: "failed" }).eq("id", case_id);
      return new Response(JSON.stringify({ error: "Failed to download VCF" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await logStep(supabase, jobId, "downloading", "completed");

    // ===== STEP 2: DECOMPRESS =====
    await logStep(supabase, jobId, "decompressing", "started");
    let vcfContent: string;
    if (caseData.file_name.endsWith(".gz")) {
      const ds = new DecompressionStream("gzip");
      const decompressed = fileData.stream().pipeThrough(ds);
      vcfContent = await new Response(decompressed).text();
    } else {
      vcfContent = await fileData.text();
    }
    await logStep(supabase, jobId, "decompressing", "completed", { content_length: vcfContent.length });

    // Record uploaded file metadata
    await supabase.from("uploaded_files").insert({
      case_id,
      sample_id: sample?.id || null,
      user_id: userId,
      filename: caseData.file_name,
      storage_path: caseData.file_path,
      file_type: caseData.file_name.endsWith(".gz") ? "vcf.gz" : "vcf",
      file_size: caseData.file_size,
      upload_status: "validated",
    });

    // ===== STEP 3: VALIDATION & PARSING =====
    await logStep(supabase, jobId, "validating", "started");
    const parsed = parseVcfContent(vcfContent);

    if (!parsed.isValid) {
      await logStep(supabase, jobId, "validating", "failed", { errors: parsed.validationErrors });
      await supabase.from("analysis_jobs").update({
        status: "failed",
        error_message: `VCF validation failed: ${parsed.validationErrors.join("; ")}`,
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
      await supabase.from("cases").update({ status: "failed" }).eq("id", case_id);
      return new Response(JSON.stringify({ error: "VCF validation failed", details: parsed.validationErrors }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.variants.length === 0) {
      await logStep(supabase, jobId, "validating", "failed", { error: "No variants" });
      await supabase.from("analysis_jobs").update({ status: "failed", error_message: "No variants found in VCF", completed_at: new Date().toISOString() }).eq("id", jobId);
      await supabase.from("cases").update({ status: "failed" }).eq("id", case_id);
      return new Response(JSON.stringify({ error: "No variants found in VCF file" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await logStep(supabase, jobId, "validating", "completed", {
      total_variants: parsed.variants.length,
      samples: parsed.sampleNames,
      assembly_detected: parsed.assemblyDetected,
      vcf_version: parsed.vcfVersion,
    });

    // ===== STEP 4: QC =====
    await logStep(supabase, jobId, "quality_control", "started");
    const qc = generateQC(parsed, caseData.assembly);
    await supabase.from("qc_summaries").insert({ case_id, job_id: jobId, ...qc });
    await logStep(supabase, jobId, "quality_control", "completed", {
      passed: qc.passed_filter,
      failed: qc.failed_filter,
      mean_depth: qc.mean_depth,
      warnings_count: qc.warnings.length,
    });

    // ===== STEP 5: LOAD GENE REFERENCES =====
    await logStep(supabase, jobId, "loading_references", "started");
    const { data: geneRefs } = await supabase
      .from("gene_references")
      .select("gene_symbol, chromosome, start_pos, end_pos, mm_relevance, mm_tier_default")
      .eq("assembly", caseData.assembly);
    const geneRefList: GeneRef[] = geneRefs || [];
    await logStep(supabase, jobId, "loading_references", "completed", { genes_loaded: geneRefList.length });

    // ===== STEP 6: FILTER, ANNOTATE, CLASSIFY =====
    await logStep(supabase, jobId, "classifying", "started");

    // Adaptive variant cap based on edge function timeout (~55s safety margin)
    const startTime = Date.now();
    const TIMEOUT_MS = 45000; // 45s safety margin (edge fn ~60s limit)
    const MAX_VARIANTS = 30000; // Hard cap
    const variantsToProcess = parsed.variants.slice(0, MAX_VARIANTS);
    const wasLimited = parsed.variants.length > MAX_VARIANTS;

    const classifiedVariants: { gene: string | null; tier: number; classification: ReturnType<typeof classifyVariant>; variantId?: string }[] = [];
    const therapyInserts: any[] = [];
    const CHUNK_SIZE = 500;
    let processedCount = 0;
    let timeoutReached = false;

    for (let i = 0; i < variantsToProcess.length; i += CHUNK_SIZE) {
      // Check time budget before each chunk
      if (Date.now() - startTime > TIMEOUT_MS) {
        timeoutReached = true;
        await logStep(supabase, jobId, "classifying", "completed", {
          warning: "Time budget exceeded — partial processing",
          processed: processedCount,
          total: variantsToProcess.length,
        });
        break;
      }

      const chunk = variantsToProcess.slice(i, i + CHUNK_SIZE);

      // Batch insert variants
      const variantRows = chunk.map((v) => ({
        case_id,
        sample_id: sample?.id || null,
        chrom: v.chrom,
        pos: v.pos,
        ref: v.ref,
        alt: v.alt,
        qual: v.qual,
        filter: v.filter,
        info_json: v.info,
        format_json: v.sample_data,
      }));
      const { data: inserted } = await supabase.from("vcf_variants").insert(variantRows).select("id");
      if (!inserted) continue;

      // Prepare batch arrays for annotations and classifications
      const annotationBatch: any[] = [];
      const classificationBatch: any[] = [];

      for (let j = 0; j < chunk.length; j++) {
        const v = chunk[j];
        const variantId = inserted[j]?.id;
        if (!variantId) continue;

        // Quality filter — select strategy based on sample type
        const filterConfig = caseData.sample_type === "germline_constitutional" ? GERMLINE_FILTER : SOMATIC_FILTER;
        const filterResult = passesQualityFilter(v, filterConfig);
        if (!filterResult.passes) continue;

        // Full annotation extraction (gene, consequence, HGVS, rsID, transcript, effect)
        const annot = extractFullAnnotation(v, geneRefList);
        const gene = annot.gene;
        const geneRef = gene ? geneRefList.find(g => g.gene_symbol === gene) || null : null;

        const classification = classifyVariant(v, gene, geneRef, caseData.sample_type, caseData.assembly);

        // Only store detailed data for potentially relevant variants (tier <= 3 or has gene)
        if (classification.tier <= 3 || gene) {
          const af = parseFloat(v.info["AF"] || v.sample_data["AF"] || "0");
          const dp = parseInt(v.info["DP"] || v.sample_data["DP"] || "0");

          annotationBatch.push({
            variant_id: variantId,
            gene_symbol: gene,
            consequence: annot.consequence,
            hgvs_c: annot.hgvs_c,
            hgvs_p: annot.hgvs_p,
            annotation_source: annot.annotation_source,
            annotation_version: "3.0",
            allele_frequency: af || null,
            read_depth: dp || null,
            is_hotspot: classification.is_hotspot,
            sources: gene ? ["rule_engine", annot.annotation_source] : [],
          });

          classificationBatch.push({
            variant_id: variantId,
            tier: classification.tier,
            confidence: classification.confidence,
            clinical_significance: classification.clinical_significance,
            prognostic_significance: classification.prognostic_significance,
            therapeutic_significance: classification.therapeutic_significance,
            requires_manual_review: classification.requires_manual_review,
            rationale_json: {
              ...classification.rationale_json,
              rsid: annot.rsid,
              transcript: annot.transcript,
              predicted_effect: annot.predicted_effect,
            },
          });

          classifiedVariants.push({ gene, tier: classification.tier, classification, variantId });
        }
      }

      // BATCH INSERT annotations and classifications
      if (annotationBatch.length > 0) {
        await supabase.from("variant_annotations").insert(annotationBatch);
      }
      if (classificationBatch.length > 0) {
        await supabase.from("variant_classifications").insert(classificationBatch);
      }
      processedCount += chunk.length;
    }

    if (!timeoutReached) {
      await logStep(supabase, jobId, "classifying", "completed", {
        total_classified: classifiedVariants.length,
        processed: processedCount,
        tier1: classifiedVariants.filter(v => v.tier === 1).length,
        tier2: classifiedVariants.filter(v => v.tier === 2).length,
        tier3: classifiedVariants.filter(v => v.tier === 3).length,
      });
    }

    // ===== STEP 7: VEP ANNOTATION (for unannotated variants) =====
    await logStep(supabase, jobId, "vep_annotation", "started");
    const unannotatedVariants = classifiedVariants.filter(
      v => v.variantId && v.tier <= 3 && (!v.classification.rationale_json?.predicted_effect || v.classification.rationale_json?.predicted_effect === null)
    );
    let vepHits = 0;
    const MAX_VEP_BATCH = 100; // Ensembl VEP POST endpoint supports up to 200 per batch

    if (unannotatedVariants.length > 0 && (Date.now() - startTime) < TIMEOUT_MS - 15000) {
      // Fetch coordinates for unannotated variants
      const unannotatedIds = unannotatedVariants.slice(0, MAX_VEP_BATCH).map(v => v.variantId!);
      const { data: unannotatedCoords } = await supabase
        .from("vcf_variants")
        .select("id, chrom, pos, ref, alt")
        .in("id", unannotatedIds);

      if (unannotatedCoords && unannotatedCoords.length > 0) {
        // Build VEP batch input: "chrom pos pos ref/alt" for SNVs, or HGVS-like for indels
        const vepInputs = unannotatedCoords.map((vc: any) => {
          const chrom = vc.chrom.replace("chr", "");
          if (vc.ref.length === 1 && vc.alt.length === 1) {
            // SNV
            return `${chrom} ${vc.pos} ${vc.pos} ${vc.ref}/${vc.alt} 1`;
          } else if (vc.ref.length > vc.alt.length) {
            // Deletion
            const delStart = vc.pos + 1;
            const delEnd = vc.pos + vc.ref.length - 1;
            return `${chrom} ${delStart} ${delEnd} ${vc.ref.substring(1) || "-"}/${vc.alt.substring(1) || "-"} 1`;
          } else {
            // Insertion
            return `${chrom} ${vc.pos} ${vc.pos} -/${vc.alt.substring(vc.ref.length)} 1`;
          }
        });

        try {
          const vepAssembly = caseData.assembly === "GRCh38" ? "grch38" : "grch37";
          const vepUrl = caseData.assembly === "GRCh38"
            ? "https://rest.ensembl.org/vep/homo_sapiens/region"
            : "https://grch37.rest.ensembl.org/vep/homo_sapiens/region";

          const vepResp = await fetch(vepUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({ variants: vepInputs }),
            signal: AbortSignal.timeout(20000),
          });

          if (vepResp.ok) {
            const vepResults = await vepResp.json();

            for (const vr of vepResults) {
              // Match back to our variant by position
              const inputParts = vr.input?.split(" ") || [];
              const vepChrom = inputParts[0];
              const vepPos = parseInt(inputParts[1]);

              // Find matching variant
              const matchedCoord = unannotatedCoords.find((vc: any) => {
                const vcChrom = vc.chrom.replace("chr", "");
                return vcChrom === vepChrom && vc.pos === vepPos;
              });
              if (!matchedCoord) continue;

              // Get the most severe consequence
              const tc = vr.most_severe_consequence;
              const transcriptConsequences = vr.transcript_consequences || [];
              // Pick the canonical transcript or first one
              const bestTc = transcriptConsequences.find((t: any) => t.canonical === 1) || transcriptConsequences[0];

              if (bestTc) {
                vepHits++;
                // Update annotation in DB
                await supabase.from("variant_annotations").update({
                  gene_symbol: bestTc.gene_symbol || null,
                  consequence: tc || bestTc.consequence_terms?.join(",") || null,
                  hgvs_c: bestTc.hgvsc || null,
                  hgvs_p: bestTc.hgvsp || null,
                  annotation_source: "ensembl_vep_rest",
                  annotation_version: "vep_rest_v1",
                }).eq("variant_id", matchedCoord.id);

                // Update the local classified variant gene if missing
                const cv = classifiedVariants.find(v => v.variantId === matchedCoord.id);
                if (cv && !cv.gene && bestTc.gene_symbol) {
                  cv.gene = bestTc.gene_symbol;
                }
              }
            }
          } else {
            const errText = await vepResp.text();
            console.warn("VEP API error:", vepResp.status, errText);
          }
        } catch (vepErr) {
          console.warn("VEP annotation failed:", vepErr);
        }
      }
    }

    await logStep(supabase, jobId, "vep_annotation", "completed", {
      unannotated_count: unannotatedVariants.length,
      vep_hits: vepHits,
      skipped: unannotatedVariants.length === 0 ? "all_variants_annotated" : undefined,
    });

    // ===== STEP 8: CLINVAR ANNOTATION =====
    await logStep(supabase, jobId, "clinvar_annotation", "started");
    // Collect variant coordinates for ClinVar lookup (limit to 50 to respect rate limits + time)
    const MAX_CLINVAR_LOOKUPS = 50;
    const clinvarTargets: Array<{ chrom: string; pos: number; ref: string; alt: string; index: number; variantId: string }> = [];

    // Query coordinates from vcf_variants for Tier 1-3
    const tier13VariantIds = classifiedVariants
      .filter(v => v.tier <= 3 && v.variantId)
      .slice(0, MAX_CLINVAR_LOOKUPS)
      .map(v => v.variantId!);

    if (tier13VariantIds.length > 0 && (Date.now() - startTime) < TIMEOUT_MS - 10000) {
      // Fetch coordinates
      const { data: variantCoords } = await supabase
        .from("vcf_variants")
        .select("id, chrom, pos, ref, alt")
        .in("id", tier13VariantIds);

      if (variantCoords) {
        for (let i = 0; i < variantCoords.length; i++) {
          const vc = variantCoords[i];
          clinvarTargets.push({
            chrom: vc.chrom,
            pos: vc.pos,
            ref: vc.ref,
            alt: vc.alt,
            index: i,
            variantId: vc.id,
          });
        }
      }

      // Execute ClinVar lookups
      const clinvarResults = await batchClinVarLookup(
        clinvarTargets.map(t => ({ chrom: t.chrom, pos: t.pos, ref: t.ref, alt: t.alt, index: t.index })),
        caseData.assembly,
      );

      let clinvarHits = 0;
      let clinvarUpgrades = 0;
      let clinvarDowngrades = 0;

      for (const [idx, clinvarResult] of clinvarResults.entries()) {
        const target = clinvarTargets[idx];
        if (!target) continue;
        clinvarHits++;

        // Update variant_annotations with ClinVar data
        await supabase.from("variant_annotations").update({
          clinvar_significance: clinvarResult.significance,
          clinvar_review_status: clinvarResult.review_status,
          clinvar_variation_id: clinvarResult.variation_id,
          clinvar_conditions: clinvarResult.conditions,
          sources: ["rule_engine", "clinvar"],
        }).eq("variant_id", target.variantId);

        // Refine classification based on ClinVar
        const mapped = mapClinVarSignificance(clinvarResult.significance);
        const classifiedVar = classifiedVariants.find(v => v.variantId === target.variantId);
        
        if (classifiedVar && mapped.tierAdjustment !== null) {
          const oldTier = classifiedVar.tier;
          const newTier = Math.min(mapped.tierAdjustment, oldTier); // ClinVar can upgrade (lower tier number) but not downgrade high-risk genes
          
          // ClinVar Pathogenic/Likely_Pathogenic can UPGRADE tier
          if (mapped.tierAdjustment < oldTier) {
            clinvarUpgrades++;
            classifiedVar.tier = newTier;
            classifiedVar.classification.clinical_significance = mapped.classification;
            classifiedVar.classification.confidence = mapped.confidence;
          }
          
          // ClinVar Benign/Likely_Benign can DOWNGRADE — but only if gene is NOT high-risk
          if (mapped.tierAdjustment > oldTier && classifiedVar.classification.rationale_json?.is_high_risk_gene !== true) {
            clinvarDowngrades++;
            classifiedVar.tier = mapped.tierAdjustment;
            classifiedVar.classification.clinical_significance = mapped.classification;
            classifiedVar.classification.confidence = mapped.confidence;
            // Benign variants should not require manual review
            if (mapped.classification === "benign" || mapped.classification === "likely_benign") {
              classifiedVar.classification.requires_manual_review = false;
            }
          }

          // Update classification in DB
          await supabase.from("variant_classifications").update({
            tier: classifiedVar.tier,
            clinical_significance: classifiedVar.classification.clinical_significance,
            confidence: classifiedVar.classification.confidence,
            requires_manual_review: classifiedVar.classification.requires_manual_review,
            rationale_json: {
              ...classifiedVar.classification.rationale_json,
              clinvar_significance: clinvarResult.significance,
              clinvar_review_status: clinvarResult.review_status,
              clinvar_adjusted: oldTier !== classifiedVar.tier,
            },
          }).eq("variant_id", target.variantId);
        }
      }

      await logStep(supabase, jobId, "clinvar_annotation", "completed", {
        candidates: clinvarTargets.length,
        hits: clinvarHits,
        upgrades: clinvarUpgrades,
        downgrades: clinvarDowngrades,
      });
    } else {
      await logStep(supabase, jobId, "clinvar_annotation", "completed", {
        skipped: true,
        reason: tier13VariantIds.length === 0 ? "no_tier_1_3_variants" : "time_budget_exceeded",
      });
    }

    // ===== STEP 9: THERAPIES =====
    // Re-compute therapies based on ClinVar-refined classifications
    await logStep(supabase, jobId, "therapy_matching", "started");

    // Clear previous therapy inserts and rebuild from refined classifications
    therapyInserts.length = 0;
    for (const cv of classifiedVariants) {
      if (cv.tier <= 2 && cv.gene && cv.classification.clinical_significance !== "vus") {
        // Get HGVS for this variant from annotations
        const { data: annot } = await supabase
          .from("variant_annotations")
          .select("hgvs_p")
          .eq("variant_id", cv.variantId)
          .single();
        
        const therapies = findTherapyOptions(
          cv.gene,
          annot?.hgvs_p || null,
          caseData.regulatory_region,
          cv.tier,
          cv.classification.clinical_significance,
        );
        for (const t of therapies) {
          therapyInserts.push({
            case_id,
            variant_id: cv.variantId,
            therapy_name: t.therapy_name,
            evidence_level: t.evidence_level,
            region: t.region,
            approved_status: t.approved_status,
            rationale_text: t.rationale,
            contraindicated_flag: t.contraindicated_flag,
          });
        }
      }
    }

    if (therapyInserts.length > 0) {
      await supabase.from("therapy_options").insert(therapyInserts);
    }
    await logStep(supabase, jobId, "therapy_matching", "completed", { options_found: therapyInserts.length });

    // ===== STEP 9: BIOMARKERS =====
    await logStep(supabase, jobId, "biomarker_extraction", "started");
    const biomarkers = extractBiomarkers(classifiedVariants, qc);
    // Store biomarkers
    const biomarkerInserts = biomarkers.map(b => ({
      case_id,
      biomarker_name: b.biomarker_name,
      biomarker_type: b.biomarker_type,
      status: b.status,
      evidence_level: b.evidence_level,
      clinical_implication: b.clinical_implication,
      requires_confirmation: b.requires_confirmation,
      confirmation_method: b.confirmation_method,
      source: "rule_engine_v2",
    }));
    if (biomarkerInserts.length > 0) {
      await supabase.from("biomarker_interpretations").insert(biomarkerInserts);
    }
    await logStep(supabase, jobId, "biomarker_extraction", "completed", {
      total: biomarkers.length,
      positive: biomarkers.filter(b => b.status === "positive").length,
      not_assessed: biomarkers.filter(b => b.status === "not_assessed").length,
    });

    // ===== STEP 10: INTERPRETATION =====
    await logStep(supabase, jobId, "interpretation", "started");
    const molecularSummary = generateMolecularSummary(qc, classifiedVariants, biomarkers, caseData.sample_type);

    const flags: Record<string, boolean> = {
      manual_review_required: classifiedVariants.some((v) => v.classification.requires_manual_review),
      insufficient_clinical_context: !caseData.diagnosis || !caseData.riss_stage,
      conflicting_evidence: false,
      limited_file_scope: !qc.cnv_assessed || !qc.sv_assessed,
    };

    const limitations: string[] = [...qc.warnings];
    if (timeoutReached) {
      limitations.push(`Processing time limit reached — only ${processedCount} of ${variantsToProcess.length} variants were analyzed. Clinically relevant variants in unprocessed regions may be missed.`);
      flags.manual_review_required = true;
    }
    if (wasLimited) {
      limitations.push(`VCF contains ${parsed.variants.length} variants. Only the first ${MAX_VARIANTS} were processed. Consider filtering the VCF before upload.`);
      flags.manual_review_required = true;
    }
    if (!caseData.riss_stage) limitations.push("R-ISS stage not provided — risk stratification incomplete.");
    if (caseData.sample_type === "somatic_tumor") limitations.push("Germline filtering not performed (somatic-only sample).");
    if (caseData.sample_type === "tumor_normal_paired") limitations.push("Tumor-normal paired analysis requires validated somatic caller output.");
    limitations.push("Gene annotation uses positional lookup, VCF INFO fields, and ClinVar variant-level lookup. VEP/gnomAD not yet integrated.");

    const manualReviewReasons: string[] = [];
    if (flags.manual_review_required) manualReviewReasons.push("One or more variants require manual curation review.");
    if (flags.insufficient_clinical_context) manualReviewReasons.push("Missing clinical staging data (R-ISS).");
    if (classifiedVariants.some((v) => v.classification.clinical_significance === "vus" && v.tier <= 3)) {
      manualReviewReasons.push("VUS variants present — cannot generate therapeutic recommendations for VUS.");
    }
    if (geneRefList.length === 0) {
      manualReviewReasons.push("Gene reference database empty or not loaded for this assembly.");
    }

    const relevantVariantsJson = classifiedVariants
      .filter((v) => v.tier <= 2)
      .map((v) => ({
        gene: v.gene,
        tier: v.tier,
        significance: v.classification.clinical_significance,
        confidence: v.classification.confidence,
        is_hotspot: v.classification.is_hotspot,
        requires_review: v.classification.requires_manual_review,
      }));

    const finalStatus = flags.manual_review_required ? "review_required" : "completed";

    await supabase.from("interpretation_results").insert({
      case_id,
      job_id: jobId,
      status: finalStatus,
      sample_context: caseData.sample_type,
      qc_summary: qc,
      molecular_summary: molecularSummary,
      clinically_relevant_variants: relevantVariantsJson,
      biomarkers: biomarkers,
      therapy_support: therapyInserts.map((t) => ({
        therapy: t.therapy_name,
        evidence: t.evidence_level,
        rationale: t.rationale_text,
        approved_status: t.approved_status,
      })),
      limitations,
      manual_review_reasons: manualReviewReasons,
      flags,
      report_ready: !flags.manual_review_required,
    });

    await logStep(supabase, jobId, "interpretation", "completed", {
      status: finalStatus,
      relevant_variants: relevantVariantsJson.length,
      biomarkers_positive: biomarkers.filter(b => b.status === "positive").length,
      therapy_options: therapyInserts.length,
    });

    // ===== FINALIZE =====
    await supabase.from("cases").update({
      status: finalStatus,
      total_variants: qc.total_variants,
      relevant_variants: classifiedVariants.filter((v) => v.tier <= 2).length,
    }).eq("id", case_id);

    await supabase.from("analysis_jobs").update({
      status: "completed",
      current_step: "completed",
      completed_at: new Date().toISOString(),
      result_json: {
        total_variants: qc.total_variants,
        relevant: relevantVariantsJson.length,
        biomarkers_positive: biomarkers.filter(b => b.status === "positive").length,
        therapy_options: therapyInserts.length,
        flags,
      },
    }).eq("id", jobId);

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      entity_type: "case",
      entity_id: case_id,
      action: "analysis_completed",
      after_json: {
        status: finalStatus,
        total_variants: qc.total_variants,
        relevant_variants: relevantVariantsJson.length,
        biomarkers: biomarkers.filter(b => b.status === "positive").map(b => b.biomarker_name),
        therapy_options: therapyInserts.length,
        pipeline_version: "2.0",
      },
    });

    return new Response(JSON.stringify({
      success: true,
      case_id,
      job_id: jobId,
      status: finalStatus,
      total_variants: qc.total_variants,
      relevant_variants: relevantVariantsJson.length,
      biomarkers_count: biomarkers.length,
      therapy_options_count: therapyInserts.length,
      flags,
      manual_review_reasons: manualReviewReasons,
      pipeline_version: "2.0",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Analysis error:", err);
    // Try to mark the case as failed if we have enough context
    try {
      const { case_id } = await req.clone().json().catch(() => ({}));
      if (case_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);
        await supabase.from("cases").update({ status: "failed" }).eq("id", case_id);
        await supabase.from("analysis_jobs").update({
          status: "failed",
          error_message: String(err),
          completed_at: new Date().toISOString(),
        }).eq("case_id", case_id).eq("status", "running");
      }
    } catch (_) { /* best effort */ }
    return new Response(JSON.stringify({ error: "Internal server error", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
