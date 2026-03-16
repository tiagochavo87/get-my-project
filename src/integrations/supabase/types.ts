export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      analysis_jobs: {
        Row: {
          case_id: string
          completed_at: string | null
          created_at: string
          current_step: string | null
          error_message: string | null
          id: string
          result_json: Json | null
          started_at: string | null
          status: string
          steps_log: Json | null
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          id?: string
          result_json?: Json | null
          started_at?: string | null
          status?: string
          steps_log?: Json | null
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          id?: string
          result_json?: Json | null
          started_at?: string | null
          status?: string
          steps_log?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      biomarker_interpretations: {
        Row: {
          biomarker_name: string
          biomarker_type: string | null
          case_id: string
          clinical_implication: string | null
          confirmation_method: string | null
          created_at: string
          evidence_level: string | null
          id: string
          requires_confirmation: boolean | null
          source: string | null
          status: string | null
        }
        Insert: {
          biomarker_name: string
          biomarker_type?: string | null
          case_id: string
          clinical_implication?: string | null
          confirmation_method?: string | null
          created_at?: string
          evidence_level?: string | null
          id?: string
          requires_confirmation?: boolean | null
          source?: string | null
          status?: string | null
        }
        Update: {
          biomarker_name?: string
          biomarker_type?: string | null
          case_id?: string
          clinical_implication?: string | null
          confirmation_method?: string | null
          created_at?: string
          evidence_level?: string | null
          id?: string
          requires_confirmation?: boolean | null
          source?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "biomarker_interpretations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assembly: string
          case_number: string
          clinical_notes: string | null
          created_at: string
          creatinine: number | null
          diagnosis: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          iss_stage: string | null
          patient_age: number
          patient_sex: string
          prior_treatment_lines: number
          r2iss_stage: string | null
          regulatory_region: string
          relevant_variants: number
          reviewed_at: string | null
          reviewed_by: string | null
          riss_stage: string | null
          sample_type: string
          status: string
          total_variants: number
          transplant_eligibility: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assembly: string
          case_number?: string
          clinical_notes?: string | null
          created_at?: string
          creatinine?: number | null
          diagnosis: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          iss_stage?: string | null
          patient_age: number
          patient_sex: string
          prior_treatment_lines?: number
          r2iss_stage?: string | null
          regulatory_region?: string
          relevant_variants?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          riss_stage?: string | null
          sample_type: string
          status?: string
          total_variants?: number
          transplant_eligibility?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assembly?: string
          case_number?: string
          clinical_notes?: string | null
          created_at?: string
          creatinine?: number | null
          diagnosis?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          iss_stage?: string | null
          patient_age?: number
          patient_sex?: string
          prior_treatment_lines?: number
          r2iss_stage?: string | null
          regulatory_region?: string
          relevant_variants?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          riss_stage?: string | null
          sample_type?: string
          status?: string
          total_variants?: number
          transplant_eligibility?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gene_references: {
        Row: {
          assembly: string
          chromosome: string
          created_at: string
          description: string | null
          end_pos: number
          gene_symbol: string
          id: string
          mm_relevance: string | null
          mm_tier_default: number | null
          start_pos: number
        }
        Insert: {
          assembly: string
          chromosome: string
          created_at?: string
          description?: string | null
          end_pos: number
          gene_symbol: string
          id?: string
          mm_relevance?: string | null
          mm_tier_default?: number | null
          start_pos: number
        }
        Update: {
          assembly?: string
          chromosome?: string
          created_at?: string
          description?: string | null
          end_pos?: number
          gene_symbol?: string
          id?: string
          mm_relevance?: string | null
          mm_tier_default?: number | null
          start_pos?: number
        }
        Relationships: []
      }
      interpretation_results: {
        Row: {
          biomarkers: Json | null
          case_id: string
          clinically_relevant_variants: Json | null
          created_at: string
          flags: Json | null
          id: string
          job_id: string | null
          limitations: Json | null
          manual_review_reasons: Json | null
          molecular_summary: Json | null
          qc_summary: Json | null
          report_ready: boolean | null
          sample_context: string | null
          status: string | null
          therapy_support: Json | null
        }
        Insert: {
          biomarkers?: Json | null
          case_id: string
          clinically_relevant_variants?: Json | null
          created_at?: string
          flags?: Json | null
          id?: string
          job_id?: string | null
          limitations?: Json | null
          manual_review_reasons?: Json | null
          molecular_summary?: Json | null
          qc_summary?: Json | null
          report_ready?: boolean | null
          sample_context?: string | null
          status?: string | null
          therapy_support?: Json | null
        }
        Update: {
          biomarkers?: Json | null
          case_id?: string
          clinically_relevant_variants?: Json | null
          created_at?: string
          flags?: Json | null
          id?: string
          job_id?: string | null
          limitations?: Json | null
          manual_review_reasons?: Json | null
          molecular_summary?: Json | null
          qc_summary?: Json | null
          report_ready?: boolean | null
          sample_context?: string | null
          status?: string | null
          therapy_support?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "interpretation_results_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_summaries: {
        Row: {
          case_id: string
          cnv_assessed: boolean | null
          created_at: string
          failed_filter: number | null
          fields_detected: Json | null
          fields_missing: Json | null
          fusion_assessed: boolean | null
          genome_build_detected: string | null
          genome_build_match: boolean | null
          id: string
          job_id: string | null
          mean_depth: number | null
          mean_quality: number | null
          passed_filter: number | null
          sv_assessed: boolean | null
          total_variants: number | null
          warnings: Json | null
        }
        Insert: {
          case_id: string
          cnv_assessed?: boolean | null
          created_at?: string
          failed_filter?: number | null
          fields_detected?: Json | null
          fields_missing?: Json | null
          fusion_assessed?: boolean | null
          genome_build_detected?: string | null
          genome_build_match?: boolean | null
          id?: string
          job_id?: string | null
          mean_depth?: number | null
          mean_quality?: number | null
          passed_filter?: number | null
          sv_assessed?: boolean | null
          total_variants?: number | null
          warnings?: Json | null
        }
        Update: {
          case_id?: string
          cnv_assessed?: boolean | null
          created_at?: string
          failed_filter?: number | null
          fields_detected?: Json | null
          fields_missing?: Json | null
          fusion_assessed?: boolean | null
          genome_build_detected?: string | null
          genome_build_match?: boolean | null
          id?: string
          job_id?: string | null
          mean_depth?: number | null
          mean_quality?: number | null
          passed_filter?: number | null
          sv_assessed?: boolean | null
          total_variants?: number | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_summaries_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      samples: {
        Row: {
          assembly: string | null
          case_id: string
          context_type: string | null
          created_at: string
          id: string
          sample_label: string | null
        }
        Insert: {
          assembly?: string | null
          case_id: string
          context_type?: string | null
          created_at?: string
          id?: string
          sample_label?: string | null
        }
        Update: {
          assembly?: string | null
          case_id?: string
          context_type?: string | null
          created_at?: string
          id?: string
          sample_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "samples_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      therapy_options: {
        Row: {
          approved_status: string | null
          case_id: string
          contraindicated_flag: boolean | null
          created_at: string
          evidence_level: string | null
          id: string
          rationale_text: string | null
          region: string | null
          therapy_name: string
          variant_id: string | null
        }
        Insert: {
          approved_status?: string | null
          case_id: string
          contraindicated_flag?: boolean | null
          created_at?: string
          evidence_level?: string | null
          id?: string
          rationale_text?: string | null
          region?: string | null
          therapy_name: string
          variant_id?: string | null
        }
        Update: {
          approved_status?: string | null
          case_id?: string
          contraindicated_flag?: boolean | null
          created_at?: string
          evidence_level?: string | null
          id?: string
          rationale_text?: string | null
          region?: string | null
          therapy_name?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "therapy_options_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapy_options_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vcf_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          case_id: string
          created_at: string
          file_size: number | null
          file_type: string | null
          filename: string
          id: string
          sample_id: string | null
          storage_path: string
          upload_status: string | null
          user_id: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          filename: string
          id?: string
          sample_id?: string | null
          storage_path: string
          upload_status?: string | null
          user_id?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          filename?: string
          id?: string
          sample_id?: string | null
          storage_path?: string
          upload_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_files_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_annotations: {
        Row: {
          allele_frequency: number | null
          annotation_source: string | null
          annotation_version: string | null
          clinvar_conditions: string[] | null
          clinvar_review_status: string | null
          clinvar_significance: string | null
          clinvar_variation_id: string | null
          consequence: string | null
          created_at: string
          gene_symbol: string | null
          hgvs_c: string | null
          hgvs_p: string | null
          id: string
          is_hotspot: boolean | null
          read_depth: number | null
          sources: Json | null
          variant_id: string
        }
        Insert: {
          allele_frequency?: number | null
          annotation_source?: string | null
          annotation_version?: string | null
          clinvar_conditions?: string[] | null
          clinvar_review_status?: string | null
          clinvar_significance?: string | null
          clinvar_variation_id?: string | null
          consequence?: string | null
          created_at?: string
          gene_symbol?: string | null
          hgvs_c?: string | null
          hgvs_p?: string | null
          id?: string
          is_hotspot?: boolean | null
          read_depth?: number | null
          sources?: Json | null
          variant_id: string
        }
        Update: {
          allele_frequency?: number | null
          annotation_source?: string | null
          annotation_version?: string | null
          clinvar_conditions?: string[] | null
          clinvar_review_status?: string | null
          clinvar_significance?: string | null
          clinvar_variation_id?: string | null
          consequence?: string | null
          created_at?: string
          gene_symbol?: string | null
          hgvs_c?: string | null
          hgvs_p?: string | null
          id?: string
          is_hotspot?: boolean | null
          read_depth?: number | null
          sources?: Json | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_annotations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vcf_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_classifications: {
        Row: {
          clinical_significance: string | null
          confidence: string | null
          created_at: string
          id: string
          prognostic_significance: string | null
          rationale_json: Json | null
          requires_manual_review: boolean | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          therapeutic_significance: string | null
          tier: number
          variant_id: string
        }
        Insert: {
          clinical_significance?: string | null
          confidence?: string | null
          created_at?: string
          id?: string
          prognostic_significance?: string | null
          rationale_json?: Json | null
          requires_manual_review?: boolean | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          therapeutic_significance?: string | null
          tier: number
          variant_id: string
        }
        Update: {
          clinical_significance?: string | null
          confidence?: string | null
          created_at?: string
          id?: string
          prognostic_significance?: string | null
          rationale_json?: Json | null
          requires_manual_review?: boolean | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          therapeutic_significance?: string | null
          tier?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_classifications_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "vcf_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      vcf_variants: {
        Row: {
          alt: string
          case_id: string
          chrom: string
          created_at: string
          filter: string | null
          format_json: Json | null
          id: string
          info_json: Json | null
          pos: number
          qual: number | null
          ref: string
          sample_id: string | null
        }
        Insert: {
          alt: string
          case_id: string
          chrom: string
          created_at?: string
          filter?: string | null
          format_json?: Json | null
          id?: string
          info_json?: Json | null
          pos: number
          qual?: number | null
          ref: string
          sample_id?: string | null
        }
        Update: {
          alt?: string
          case_id?: string
          chrom?: string
          created_at?: string
          filter?: string | null
          format_json?: Json | null
          id?: string
          info_json?: Json | null
          pos?: number
          qual?: number | null
          ref?: string
          sample_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vcf_variants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vcf_variants_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
