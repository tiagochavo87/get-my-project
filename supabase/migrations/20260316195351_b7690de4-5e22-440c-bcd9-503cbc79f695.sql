ALTER TABLE public.variant_annotations 
  ADD COLUMN IF NOT EXISTS clinvar_significance text,
  ADD COLUMN IF NOT EXISTS clinvar_review_status text,
  ADD COLUMN IF NOT EXISTS clinvar_variation_id text,
  ADD COLUMN IF NOT EXISTS clinvar_conditions text[];