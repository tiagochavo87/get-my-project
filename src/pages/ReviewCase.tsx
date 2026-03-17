import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  Loader2, MessageSquare, ShieldCheck, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReviewableVariant {
  id: string;
  chrom: string;
  pos: number;
  ref: string;
  alt: string;
  qual: number | null;
  gene: string | null;
  consequence: string | null;
  hgvs_c: string | null;
  hgvs_p: string | null;
  allele_frequency: number | null;
  read_depth: number | null;
  is_hotspot: boolean;
  clinvar_significance: string | null;
  clinvar_review_status: string | null;
  tier: number;
  confidence: string;
  clinical_significance: string;
  prognostic_significance: string | null;
  requires_manual_review: boolean;
  review_status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  rationale: any;
}

interface ReviewSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

interface CaseInfo {
  id: string;
  case_number: string;
  status: string;
  diagnosis: string;
  sample_type: string;
  assembly: string;
}

const tierColors: Record<number, string> = {
  1: 'tier-badge-1',
  2: 'tier-badge-2',
  3: 'tier-badge-3',
  4: 'tier-badge-4',
};

const reviewStatusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: 'Pending', icon: AlertTriangle, className: 'status-badge-pending' },
  approved: { label: 'Approved', icon: CheckCircle2, className: 'status-badge-completed' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'status-badge-failed' },
};

export default function ReviewCase() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [variants, setVariants] = useState<ReviewableVariant[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [expandedVariant, setExpandedVariant] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id || !user) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/review-variant`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'get_reviewable', case_id: id }),
        }
      );
      if (!resp.ok) throw new Error('Failed to fetch review data');
      const json = await resp.json();
      setCaseInfo(json.case);
      setVariants(json.variants || []);
      setSummary(json.summary || { total: 0, pending: 0, approved: 0, rejected: 0 });
      // Pre-populate notes
      const notes: Record<string, string> = {};
      for (const v of json.variants || []) {
        if (v.review_notes) notes[v.id] = v.review_notes;
      }
      setReviewNotes(notes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReview = async (variantId: string, reviewStatus: 'approved' | 'rejected') => {
    setActionLoading(variantId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/review-variant`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'review_variant',
            variant_id: variantId,
            case_id: id,
            review_status: reviewStatus,
            review_notes: reviewNotes[variantId] || null,
          }),
        }
      );
      if (!resp.ok) throw new Error('Failed to review variant');

      // Update local state
      setVariants(prev =>
        prev.map(v =>
          v.id === variantId
            ? { ...v, review_status: reviewStatus, reviewed_at: new Date().toISOString() }
            : v
        )
      );
      setSummary(prev => {
        const oldStatus = variants.find(v => v.id === variantId)?.review_status || 'pending';
        return {
          ...prev,
          [oldStatus]: Math.max(0, prev[oldStatus as keyof ReviewSummary] as number - 1),
          [reviewStatus]: (prev[reviewStatus as keyof ReviewSummary] as number) + 1,
        };
      });
      toast.success(`Variant ${reviewStatus}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/review-variant`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'finalize_case', case_id: id }),
        }
      );
      const json = await resp.json();
      if (!resp.ok) {
        if (json.pending_count) {
          toast.error(`${json.pending_count} variant(s) still pending review`);
        } else {
          toast.error(json.error || 'Failed to finalize');
        }
        return;
      }
      toast.success('Case review finalized — report is now ready');
      navigate(`/case/${id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh] gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading review data...
        </div>
      </AppLayout>
    );
  }

  if (error || !caseInfo) {
    return (
      <AppLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">{error || 'Case not found'}</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const allReviewed = summary.pending === 0 && summary.total > 0;

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/case/${id}`}><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Variant Review</h1>
              <p className="text-xs text-muted-foreground">
                {caseInfo.case_number} · {caseInfo.diagnosis?.replace(/_/g, ' ')} · {caseInfo.sample_type?.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <Button
            onClick={handleFinalize}
            disabled={!allReviewed || finalizing}
            className="gap-2"
            size="sm"
          >
            {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Finalize Review
          </Button>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Review Progress</span>
                  <span>{summary.approved + summary.rejected} / {summary.total}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500 rounded-full"
                    style={{ width: `${summary.total > 0 ? ((summary.approved + summary.rejected) / summary.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground" /> {summary.pending} pending
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-accent" /> {summary.approved} approved
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-destructive" /> {summary.rejected} rejected
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Variant List */}
        {variants.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No Tier I–III variants to review.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {variants.map((v, i) => {
              const isExpanded = expandedVariant === v.id;
              const statusCfg = reviewStatusConfig[v.review_status] || reviewStatusConfig.pending;
              const StatusIcon = statusCfg.icon;

              return (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Card className={`transition-shadow ${isExpanded ? 'shadow-md ring-1 ring-primary/20' : ''} ${v.review_status === 'approved' ? 'border-l-4 border-l-accent' : v.review_status === 'rejected' ? 'border-l-4 border-l-destructive' : ''}`}>
                    {/* Collapsed Header */}
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedVariant(isExpanded ? null : v.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-sm">
                                {v.gene || 'Unknown'}
                              </span>
                              {v.is_hotspot && <span className="text-[10px] text-destructive">🔥 Hotspot</span>}
                              <span className={`clinical-badge ${tierColors[v.tier]}`}>
                                Tier {v.tier}
                              </span>
                              <span className={`clinical-badge ${statusCfg.className}`}>
                                <StatusIcon className="h-3 w-3" />
                                {statusCfg.label}
                              </span>
                              {v.clinvar_significance && (
                                <span className="clinical-badge status-badge-processing text-[10px]">
                                  ClinVar: {v.clinvar_significance.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground font-mono mt-1">
                              chr{v.chrom}:{v.pos} {v.ref}→{v.alt}
                              {v.hgvs_p && <span className="ml-2 text-foreground">{v.hgvs_p}</span>}
                              {v.consequence && <span className="ml-2">{v.consequence}</span>}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </div>
                      </CardContent>
                    </button>

                    {/* Expanded Detail */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                            {/* Details Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <DetailItem label="Quality" value={v.qual?.toFixed(1) || 'N/A'} />
                              <DetailItem label="Read Depth" value={v.read_depth ? `${v.read_depth}x` : 'N/A'} />
                              <DetailItem label="Allele Freq" value={v.allele_frequency ? `${(v.allele_frequency * 100).toFixed(1)}%` : 'N/A'} />
                              <DetailItem label="Confidence" value={v.confidence || 'N/A'} />
                            </div>

                            {/* Classification details */}
                            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                              <p><span className="font-medium">Classification:</span> {v.clinical_significance?.replace(/_/g, ' ') || '—'}</p>
                              {v.prognostic_significance && (
                                <p><span className="font-medium">Prognostic:</span> {v.prognostic_significance}</p>
                              )}
                              {v.clinvar_significance && (
                                <p><span className="font-medium">ClinVar:</span> {v.clinvar_significance.replace(/_/g, ' ')} ({v.clinvar_review_status || 'N/A'})</p>
                              )}
                              {v.rationale?.is_high_risk_gene && (
                                <p className="text-destructive font-medium">⚠ High-risk gene per IMWG guidelines</p>
                              )}
                              {v.rationale?.is_hotspot && (
                                <p className="text-destructive">🔥 Known hotspot position</p>
                              )}
                            </div>

                            {/* Review Notes */}
                            <div className="space-y-2">
                              <label className="text-xs font-medium flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" /> Review Notes
                              </label>
                              <Textarea
                                value={reviewNotes[v.id] || ''}
                                onChange={(e) => setReviewNotes(prev => ({ ...prev, [v.id]: e.target.value }))}
                                placeholder="Add clinical notes, rationale for approval/rejection..."
                                className="text-xs min-h-[60px] resize-none"
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={v.review_status === 'approved' ? 'default' : 'outline'}
                                className="gap-1.5 flex-1"
                                disabled={actionLoading === v.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReview(v.id, 'approved');
                                }}
                              >
                                {actionLoading === v.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant={v.review_status === 'rejected' ? 'destructive' : 'outline'}
                                className="gap-1.5 flex-1"
                                disabled={actionLoading === v.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReview(v.id, 'rejected');
                                }}
                              >
                                {actionLoading === v.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5" />
                                )}
                                Reject
                              </Button>
                            </div>

                            {v.reviewed_at && (
                              <p className="text-[10px] text-muted-foreground">
                                Last reviewed: {new Date(v.reviewed_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Finalize Banner */}
        {allReviewed && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-medium">All variants reviewed</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.approved} approved, {summary.rejected} rejected. Ready to finalize.
                    </p>
                  </div>
                </div>
                <Button onClick={handleFinalize} disabled={finalizing} size="sm" className="gap-1.5">
                  {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Finalize
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background rounded p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-mono font-medium">{value}</p>
    </div>
  );
}
