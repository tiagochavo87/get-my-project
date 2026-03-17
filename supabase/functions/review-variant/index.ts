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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate user via getClaims
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { action } = body;

    // === ACTION: Review a single variant ===
    if (action === "review_variant") {
      const { variant_id, case_id, review_status, review_notes } = body;
      if (!variant_id || !case_id || !review_status) {
        return new Response(
          JSON.stringify({ error: "variant_id, case_id, and review_status required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!["approved", "rejected", "pending"].includes(review_status)) {
        return new Response(
          JSON.stringify({ error: "review_status must be approved, rejected, or pending" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: caseData } = await supabase.from("cases").select("id, user_id").eq("id", case_id).single();
      if (!caseData || caseData.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateErr } = await supabase
        .from("variant_classifications")
        .update({
          review_status,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_notes: review_notes || null,
        })
        .eq("variant_id", variant_id);

      if (updateErr) {
        return new Response(JSON.stringify({ error: "Failed to update", details: updateErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("audit_logs").insert({
        actor_user_id: userId,
        entity_type: "variant_classification",
        entity_id: variant_id,
        action: `variant_${review_status}`,
        after_json: { review_status, review_notes, case_id },
      });

      return new Response(JSON.stringify({ success: true, review_status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: Finalize case review ===
    if (action === "finalize_case") {
      const { case_id } = body;
      if (!case_id) {
        return new Response(JSON.stringify({ error: "case_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: caseData } = await supabase.from("cases").select("id, user_id, status").eq("id", case_id).single();
      if (!caseData || caseData.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: pendingVariants } = await supabase
        .from("variant_classifications")
        .select("id, variant_id, tier, review_status")
        .in("variant_id", (
          await supabase.from("vcf_variants").select("id").eq("case_id", case_id)
        ).data?.map((v: any) => v.id) || [])
        .lte("tier", 3)
        .eq("review_status", "pending");

      if (pendingVariants && pendingVariants.length > 0) {
        return new Response(
          JSON.stringify({ error: "Cannot finalize — pending variants remain", pending_count: pendingVariants.length }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase.from("cases").update({
        status: "completed",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      }).eq("id", case_id);

      await supabase.from("interpretation_results").update({
        status: "completed",
        report_ready: true,
      }).eq("case_id", case_id);

      await supabase.from("audit_logs").insert({
        actor_user_id: userId,
        entity_type: "case",
        entity_id: case_id,
        action: "case_review_finalized",
        after_json: { status: "completed", reviewed_by: userId },
      });

      return new Response(
        JSON.stringify({ success: true, status: "completed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === ACTION: Get reviewable variants for a case ===
    if (action === "get_reviewable") {
      const case_id = body.case_id;
      if (!case_id) {
        return new Response(JSON.stringify({ error: "case_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: caseData } = await supabase
        .from("cases")
        .select("id, user_id, case_number, status, diagnosis, sample_type, assembly")
        .eq("id", case_id)
        .single();
      if (!caseData || caseData.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Query classifications with joined variant data — avoids loading all 29k+ variants
      const { data: classifications } = await supabase
        .from("variant_classifications")
        .select("*, vcf_variants!inner(id, chrom, pos, ref, alt, qual, filter, case_id)")
        .eq("vcf_variants.case_id", case_id)
        .lte("tier", 3);

      if (!classifications || classifications.length === 0) {
        return new Response(
          JSON.stringify({ case: caseData, variants: [], summary: { total: 0, pending: 0, approved: 0, rejected: 0 } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get annotations only for classified variants
      const classifiedVariantIds = classifications.map((c: any) => c.variant_id);
      const { data: annotations } = await supabase
        .from("variant_annotations")
        .select("*")
        .in("variant_id", classifiedVariantIds);

      const reviewableVariants = classifications
        .map((classif: any) => {
          const v = classif.vcf_variants;
          const annot = (annotations || []).find((a: any) => a.variant_id === classif.variant_id);
          return {
            id: v.id,
            chrom: v.chrom,
            pos: v.pos,
            ref: v.ref,
            alt: v.alt,
            qual: v.qual,
            gene: annot?.gene_symbol || null,
            consequence: annot?.consequence || null,
            hgvs_c: annot?.hgvs_c || null,
            hgvs_p: annot?.hgvs_p || null,
            allele_frequency: annot?.allele_frequency || null,
            read_depth: annot?.read_depth || null,
            is_hotspot: annot?.is_hotspot || false,
            clinvar_significance: annot?.clinvar_significance || null,
            clinvar_review_status: annot?.clinvar_review_status || null,
            tier: classif.tier,
            confidence: classif.confidence || null,
            clinical_significance: classif.clinical_significance || null,
            prognostic_significance: classif.prognostic_significance || null,
            requires_manual_review: classif.requires_manual_review || false,
            review_status: classif.review_status || "pending",
            review_notes: classif.review_notes || null,
            reviewed_at: classif.reviewed_at || null,
            rationale: classif.rationale_json || null,
          };
        })
        .sort((a: any, b: any) => (a.tier || 99) - (b.tier || 99));

      return new Response(
        JSON.stringify({
          case: caseData,
          variants: reviewableVariants,
          summary: {
            total: reviewableVariants.length,
            pending: reviewableVariants.filter((v: any) => v.review_status === "pending").length,
            approved: reviewableVariants.filter((v: any) => v.review_status === "approved").length,
            rejected: reviewableVariants.filter((v: any) => v.review_status === "rejected").length,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Review error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
