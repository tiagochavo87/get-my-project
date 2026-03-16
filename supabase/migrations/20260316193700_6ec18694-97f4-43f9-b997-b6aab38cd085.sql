
-- ============================================================
-- MYELOMA GENESINSIGHT — COMPLETE SCHEMA
-- ============================================================

-- 1. CASES
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  case_number TEXT NOT NULL DEFAULT ('MM-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','review_required')),
  sample_type TEXT NOT NULL CHECK (sample_type IN ('somatic_tumor','germline_constitutional','tumor_normal_paired')),
  assembly TEXT NOT NULL CHECK (assembly IN ('GRCh37','GRCh38')),
  diagnosis TEXT NOT NULL CHECK (diagnosis IN ('mgus','smoldering_mm','newly_diagnosed_mm','relapsed_refractory_mm')),
  regulatory_region TEXT NOT NULL DEFAULT 'brazil' CHECK (regulatory_region IN ('brazil','us','eu','other')),
  patient_age INTEGER NOT NULL,
  patient_sex TEXT NOT NULL CHECK (patient_sex IN ('male','female','other')),
  prior_treatment_lines INTEGER NOT NULL DEFAULT 0,
  transplant_eligibility TEXT NOT NULL DEFAULT 'unknown' CHECK (transplant_eligibility IN ('eligible','ineligible','unknown')),
  iss_stage TEXT,
  riss_stage TEXT,
  r2iss_stage TEXT,
  creatinine NUMERIC,
  clinical_notes TEXT,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_path TEXT NOT NULL,
  total_variants INTEGER NOT NULL DEFAULT 0,
  relevant_variants INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own cases" ON public.cases FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own cases" ON public.cases FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own cases" ON public.cases FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- 2. SAMPLES
CREATE TABLE public.samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  sample_label TEXT,
  context_type TEXT,
  assembly TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own samples" ON public.samples FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid()));

-- 3. VCF_VARIANTS
CREATE TABLE public.vcf_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  sample_id UUID REFERENCES public.samples(id) ON DELETE SET NULL,
  chrom TEXT NOT NULL,
  pos BIGINT NOT NULL,
  ref TEXT NOT NULL,
  alt TEXT NOT NULL,
  qual NUMERIC,
  filter TEXT,
  info_json JSONB,
  format_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vcf_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own variants" ON public.vcf_variants FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid()));

CREATE INDEX idx_vcf_variants_case ON public.vcf_variants(case_id);
CREATE INDEX idx_vcf_variants_chrom_pos ON public.vcf_variants(chrom, pos);

-- 4. VARIANT_ANNOTATIONS
CREATE TABLE public.variant_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES public.vcf_variants(id) ON DELETE CASCADE NOT NULL,
  gene_symbol TEXT,
  consequence TEXT,
  hgvs_c TEXT,
  hgvs_p TEXT,
  annotation_source TEXT,
  annotation_version TEXT,
  allele_frequency NUMERIC,
  read_depth INTEGER,
  is_hotspot BOOLEAN DEFAULT false,
  sources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.variant_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own annotations" ON public.variant_annotations FOR ALL TO authenticated
  USING (variant_id IN (SELECT id FROM public.vcf_variants WHERE case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid())));

-- 5. VARIANT_CLASSIFICATIONS
CREATE TABLE public.variant_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES public.vcf_variants(id) ON DELETE CASCADE NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
  confidence TEXT,
  clinical_significance TEXT,
  prognostic_significance TEXT,
  therapeutic_significance TEXT,
  requires_manual_review BOOLEAN DEFAULT false,
  rationale_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.variant_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own classifications" ON public.variant_classifications FOR ALL TO authenticated
  USING (variant_id IN (SELECT id FROM public.vcf_variants WHERE case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid())));

-- 6. THERAPY_OPTIONS
CREATE TABLE public.therapy_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.vcf_variants(id) ON DELETE SET NULL,
  therapy_name TEXT NOT NULL,
  evidence_level TEXT,
  region TEXT,
  approved_status TEXT,
  rationale_text TEXT,
  contraindicated_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.therapy_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own therapies" ON public.therapy_options FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid()));

-- 7. BIOMARKER_INTERPRETATIONS
CREATE TABLE public.biomarker_interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  biomarker_name TEXT NOT NULL,
  biomarker_type TEXT,
  status TEXT,
  evidence_level TEXT,
  clinical_implication TEXT,
  requires_confirmation BOOLEAN DEFAULT false,
  confirmation_method TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.biomarker_interpretations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own biomarkers" ON public.biomarker_interpretations FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid()));

-- 8. INTERPRETATION_RESULTS
CREATE TABLE public.interpretation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  job_id UUID,
  status TEXT,
  sample_context TEXT,
  qc_summary JSONB,
  molecular_summary JSONB,
  clinically_relevant_variants JSONB,
  biomarkers JSONB,
  therapy_support JSONB,
  limitations JSONB,
  manual_review_reasons JSONB,
  flags JSONB,
  report_ready BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.interpretation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own interpretations" ON public.interpretation_results FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid()));

-- 9. ANALYSIS_JOBS
CREATE TABLE public.analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  current_step TEXT,
  steps_log JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own jobs" ON public.analysis_jobs FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid()));

-- 10. QC_SUMMARIES
CREATE TABLE public.qc_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  job_id UUID,
  total_variants INTEGER,
  passed_filter INTEGER,
  failed_filter INTEGER,
  mean_depth INTEGER,
  mean_quality NUMERIC,
  genome_build_detected TEXT,
  genome_build_match BOOLEAN,
  fields_detected JSONB,
  fields_missing JSONB,
  warnings JSONB,
  cnv_assessed BOOLEAN DEFAULT false,
  fusion_assessed BOOLEAN DEFAULT false,
  sv_assessed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qc_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own qc" ON public.qc_summaries FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid()));

-- 11. UPLOADED_FILES
CREATE TABLE public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
  sample_id UUID REFERENCES public.samples(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  upload_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own files" ON public.uploaded_files FOR ALL TO authenticated
  USING (case_id IN (SELECT id FROM public.cases WHERE user_id = auth.uid()));

-- 12. AUDIT_LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());
CREATE POLICY "Service can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- 13. GENE_REFERENCES (lookup table — public read)
CREATE TABLE public.gene_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_symbol TEXT NOT NULL,
  chromosome TEXT NOT NULL,
  start_pos BIGINT NOT NULL,
  end_pos BIGINT NOT NULL,
  assembly TEXT NOT NULL CHECK (assembly IN ('GRCh37','GRCh38')),
  mm_relevance TEXT CHECK (mm_relevance IN ('high_risk','recurrent','known','research')),
  mm_tier_default INTEGER CHECK (mm_tier_default BETWEEN 1 AND 4),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gene_symbol, assembly)
);

ALTER TABLE public.gene_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read gene references" ON public.gene_references FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_gene_refs_assembly ON public.gene_references(assembly);
CREATE INDEX idx_gene_refs_chrom_pos ON public.gene_references(chromosome, start_pos, end_pos);

-- STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) VALUES ('vcf-files', 'vcf-files', false);

CREATE POLICY "Users upload own VCF files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vcf-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own VCF files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vcf-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own VCF files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vcf-files' AND (storage.foldername(name))[1] = auth.uid()::text);
