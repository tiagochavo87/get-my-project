export type SampleType = 'somatic_tumor' | 'germline_constitutional' | 'tumor_normal_paired';
export type Assembly = 'GRCh37' | 'GRCh38';
export type Diagnosis = 'mgus' | 'smoldering_mm' | 'newly_diagnosed_mm' | 'relapsed_refractory_mm';
export type RegulatoryRegion = 'brazil' | 'us' | 'eu' | 'other';
export type TransplantEligibility = 'eligible' | 'ineligible' | 'unknown';
export type CaseStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'review_required';
export type UserRole = 'admin' | 'molecular_pathologist' | 'hematologist_oncologist' | 'lab_technician' | 'viewer';
export type VariantTier = 1 | 2 | 3 | 4;
export type VariantClassification = 'pathogenic' | 'likely_pathogenic' | 'vus' | 'likely_benign' | 'benign';
export type VariantOrigin = 'somatic' | 'germline' | 'unknown';
export type EvidenceLevel = 'A' | 'B' | 'C' | 'D' | 'E';

export interface ClinicalCase {
  id: string;
  caseNumber: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  sampleType: SampleType;
  assembly: Assembly;
  diagnosis: Diagnosis;
  regulatoryRegion: RegulatoryRegion;
  patientAge: number;
  patientSex: 'male' | 'female' | 'other';
  priorTreatmentLines: number;
  transplantEligibility: TransplantEligibility;
  issStage?: string;
  rissStage?: string;
  r2issStage?: string;
  creatinine?: number;
  clinicalNotes?: string;
  fileName: string;
  fileSize: number;
  totalVariants: number;
  relevantVariants: number;
  createdBy: string;
  reviewedBy?: string;
}

export interface ClinicalVariant {
  id: string;
  gene: string;
  chromosome: string;
  position: number;
  ref: string;
  alt: string;
  hgvsc?: string;
  hgvsp?: string;
  consequence: string;
  tier: VariantTier;
  classification: VariantClassification;
  origin: VariantOrigin;
  alleleFrequency?: number;
  readDepth?: number;
  qualityScore?: number;
  clinicalSignificance: string;
  evidenceLevel: EvidenceLevel;
  sources: string[];
  curationDate: string;
  isHighRisk: boolean;
  isBiomarker: boolean;
  biomarkerType?: 'diagnostic' | 'prognostic' | 'therapeutic';
  therapeuticImplications?: string[];
  prognosticImplications?: string;
}

export interface TherapeuticOption {
  id: string;
  drug: string;
  category: string;
  evidenceLevel: EvidenceLevel;
  supportingVariants: string[];
  approvalStatus: Record<string, string>;
  contraindications?: string[];
  notes: string;
  references: string[];
  isDecisionSupport: true;
}

export interface QualityControl {
  totalVariants: number;
  passedFilter: number;
  failedFilter: number;
  meanDepth?: number;
  meanQuality?: number;
  genomeBuildDetected: Assembly;
  genomeBuildMatch: boolean;
  fieldsDetected: string[];
  fieldsMissing: string[];
  warnings: string[];
  cnvAssessed: boolean;
  fusionAssessed: boolean;
  svAssessed: boolean;
}

export interface CaseReport {
  caseId: string;
  reportVersion: number;
  generatedAt: string;
  qc: QualityControl;
  variants: ClinicalVariant[];
  therapeuticOptions: TherapeuticOption[];
  prognosticSummary: {
    molecularPrognosis: string;
    riskCategory: 'high' | 'standard' | 'favorable' | 'insufficient_data';
    highRiskFeatures: string[];
    favorableFeatures: string[];
    limitations: string[];
  };
  complementaryTests: string[];
  auditTrail: AuditEntry[];
  disclaimer: string;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  user: string;
  details: string;
}
