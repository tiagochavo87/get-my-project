import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  ArrowLeft, Shield, AlertTriangle, CheckCircle2, 
  Info, FileText, Activity, XCircle, Loader2, Beaker, Download, RefreshCw, ClipboardCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

const evidenceBadge = (level: string) => {
  const colors: Record<string, string> = {
    A: 'tier-badge-1', B: 'tier-badge-2', C: 'tier-badge-3', D: 'tier-badge-4', E: 'status-badge-pending',
  };
  return <span className={`clinical-badge ${colors[level] || 'status-badge-pending'}`}>Level {level}</span>;
};

const biomarkerStatusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    positive: { label: 'Positive', className: 'tier-badge-1' },
    negative: { label: 'Negative', className: 'tier-badge-4' },
    not_assessed: { label: 'Not Assessed', className: 'status-badge-pending' },
    indeterminate: { label: 'Indeterminate', className: 'tier-badge-3' },
  };
  const cfg = map[status] || map.not_assessed;
  return <span className={`clinical-badge ${cfg.className}`}>{cfg.label}</span>;
};

export default function CaseReport() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user) return;
    const fetchInterpretation = async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const { data: session } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/get-interpretation?case_id=${id}`,
          {
            headers: {
              Authorization: `Bearer ${session.session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        if (!resp.ok) throw new Error('Failed to fetch interpretation');
        const json = await resp.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchInterpretation();
  }, [id, user]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh] gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading report...
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="p-6 text-center">
          <p className="text-destructive">{error || 'Report not found'}</p>
          <Button variant="outline" className="mt-4" asChild><Link to="/dashboard">Back to Dashboard</Link></Button>
        </div>
      </AppLayout>
    );
  }

  const qc = data.qc_summary;
  const molSummary = data.molecular_summary;
  const variants = data.clinically_relevant_variants || [];
  const therapies = data.therapy_support || [];
  const biomarkers = data.biomarkers || [];
  const limitations = data.limitations || [];
  const auditTrail = data.audit_trail || [];
  const isPending = data.status === 'pending' || data.status === 'processing';

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{data.case_number || 'Case Report'}</h1>
              <p className="text-xs text-muted-foreground">
                Status: {data.status} · Sample: {data.sample_context?.replace(/_/g, ' ')}
                {data.pipeline_version && ` · Pipeline v${data.pipeline_version}`}
              </p>
            </div>
          </div>
          {!isPending && data.report_ready !== false && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                const { data: session } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();
                const url = `https://${projectId}.supabase.co/functions/v1/generate-report?case_id=${id}&format=html`;
                const resp = await fetch(url, {
                  headers: {
                    Authorization: `Bearer ${session.session?.access_token}`,
                    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  },
                });
                if (resp.ok) {
                  const html = await resp.text();
                  const blob = new Blob([html], { type: 'text/html' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `report-${data.case_number || id}.html`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }
              }}
            >
              <Download className="h-4 w-4 mr-1" />
              Download Report
            </Button>
          )}
          {(data.status === 'failed' || data.status === 'review_required' || data.status === 'completed') && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { supabase: sb } = await import('@/integrations/supabase/client');
                const { data: session } = await sb.auth.getSession();
                const res = await sb.functions.invoke('reprocess-case', {
                  body: { case_id: id },
                  headers: { Authorization: `Bearer ${session.session?.access_token}` },
                });
                if (res.error) {
                  const { toast } = await import('sonner');
                  toast.error('Failed to reprocess');
                } else {
                  const { toast } = await import('sonner');
                  toast.success('Reprocessing started');
                  setLoading(true);
                  setData(null);
                  // Re-fetch after a short delay
                  setTimeout(() => window.location.reload(), 2000);
                }
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Reprocess
            </Button>
          )}
        </div>

        {isPending && (
          <Card className="border-clinical-moderate-risk/30 bg-clinical-moderate-risk/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="h-5 w-5 animate-spin text-clinical-moderate-risk" />
                <p className="text-sm font-medium">Analysis is processing. Refresh to check for updates.</p>
              </div>
              {data.current_step && (
                <p className="text-xs text-muted-foreground">Current step: <span className="font-mono">{data.current_step}</span></p>
              )}
            </CardContent>
          </Card>
        )}

        {!isPending && (
          <Tabs defaultValue="summary" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
              {qc && <TabsTrigger value="qc" className="text-xs">Quality Control</TabsTrigger>}
              <TabsTrigger value="variants" className="text-xs">Variants ({variants.length})</TabsTrigger>
              <TabsTrigger value="biomarkers" className="text-xs">Biomarkers ({biomarkers.length})</TabsTrigger>
              <TabsTrigger value="therapy" className="text-xs">Therapeutics</TabsTrigger>
              <TabsTrigger value="audit" className="text-xs">Audit Trail</TabsTrigger>
            </TabsList>

            {/* SUMMARY */}
            <TabsContent value="summary">
              <div className="grid gap-4 md:grid-cols-2">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className={`border-l-4 ${molSummary?.risk_category === 'high' ? 'border-l-destructive' : 'border-l-accent'}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4" /> Molecular Risk Assessment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`clinical-badge ${molSummary?.risk_category === 'high' ? 'tier-badge-1' : molSummary?.risk_category === 'insufficient_data' ? 'status-badge-pending' : 'tier-badge-4'}`}>
                          {molSummary?.risk_category === 'high' ? '⚠ HIGH RISK' : molSummary?.risk_category === 'insufficient_data' ? 'INSUFFICIENT DATA' : 'STANDARD RISK'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {molSummary?.molecular_prognosis || 'No molecular summary available.'}
                      </p>
                      {molSummary?.high_risk_features?.length > 0 && (
                        <div className="text-xs">
                          <p className="font-medium mb-1 text-destructive">High-Risk Features:</p>
                          <ul className="space-y-0.5 text-muted-foreground">
                            {molSummary.high_risk_features.map((f: string, i: number) => (
                              <li key={i} className="flex items-start gap-1"><XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground italic">Source: {molSummary?.source || 'deterministic_rule_engine'}</p>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Flags & Review Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.flags?.manual_review_required && (
                        <div className="flex items-center gap-2 text-xs text-clinical-moderate-risk">
                          <AlertTriangle className="h-3.5 w-3.5" /> Manual review required
                        </div>
                      )}
                      {data.flags?.insufficient_clinical_context && (
                        <div className="flex items-center gap-2 text-xs text-clinical-moderate-risk">
                          <Info className="h-3.5 w-3.5" /> Insufficient clinical context
                        </div>
                      )}
                      {data.flags?.limited_file_scope && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Info className="h-3.5 w-3.5" /> Limited file scope (CNV/SV not assessed)
                        </div>
                      )}
                      {data.manual_review_reasons?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium">Review Reasons:</p>
                          {data.manual_review_reasons.map((r: string, i: number) => (
                            <p key={i} className="text-xs text-muted-foreground">• {r}</p>
                          ))}
                        </div>
                      )}
                      <div className="pt-2">
                        <span className={`clinical-badge ${data.report_ready ? 'status-badge-completed' : 'status-badge-pending'}`}>
                          {data.report_ready ? 'Report Ready' : 'Report Pending Review'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              {limitations.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card className="mt-4 border-clinical-moderate-risk/30 bg-clinical-moderate-risk/5">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-clinical-moderate-risk mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium mb-1">Limitations & Caveats</p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {limitations.map((l: string, i: number) => <li key={i}>• {l}</li>)}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </TabsContent>

            {/* QC */}
            {qc && (
              <TabsContent value="qc">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Technical Quality Control</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MiniStat label="Total Variants" value={(qc.total_variants || 0).toLocaleString()} />
                      <MiniStat label="Passed Filter" value={(qc.passed_filter || 0).toLocaleString()} />
                      <MiniStat label="Mean Depth" value={qc.mean_depth ? `${qc.mean_depth}x` : 'N/A'} />
                      <MiniStat label="Mean Quality" value={qc.mean_quality?.toFixed?.(1) || qc.mean_quality || 'N/A'} />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium mb-2">Fields Detected</p>
                        <div className="flex flex-wrap gap-1">
                          {(qc.fields_detected || []).map((f: string) => (
                            <span key={f} className="clinical-badge status-badge-completed">{f}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-2">Fields Missing</p>
                        <div className="flex flex-wrap gap-1">
                          {(qc.fields_missing || []).map((f: string) => (
                            <span key={f} className="clinical-badge status-badge-failed">{f}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {qc.warnings?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium">Warnings</p>
                        {qc.warnings.map((w: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 bg-clinical-moderate-risk/5 border border-clinical-moderate-risk/20 rounded p-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-clinical-moderate-risk mt-0.5 shrink-0" />
                            <p className="text-xs">{w}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <AssessmentBadge label="CNV" assessed={qc.cnv_assessed} />
                      <AssessmentBadge label="Fusions" assessed={qc.fusion_assessed} />
                      <AssessmentBadge label="Structural Variants" assessed={qc.sv_assessed} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* VARIANTS */}
            <TabsContent value="variants">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Clinically Relevant Variants (Tier I–II)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {variants.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No Tier I–II variants identified from this analysis.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Gene</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Position</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Change</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Tier</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Classification</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Confidence</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden lg:table-cell">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variants.map((v: any, i: number) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-3 py-2.5 font-mono font-semibold">
                                {v.gene || 'Unknown'}
                                {v.is_hotspot && <span className="ml-1 text-[9px] text-destructive">🔥</span>}
                                {v.requires_review && <AlertTriangle className="h-3 w-3 text-clinical-moderate-risk inline ml-1" />}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-[11px]">chr{v.chrom}:{v.pos}</td>
                              <td className="px-3 py-2.5 font-mono text-[11px]">{v.ref}→{v.alt}</td>
                              <td className="px-3 py-2.5">
                                <span className={`clinical-badge tier-badge-${v.tier}`}>Tier {v.tier}</span>
                              </td>
                              <td className="px-3 py-2.5 hidden md:table-cell capitalize text-muted-foreground">
                                {v.classification?.replace(/_/g, ' ') || '—'}
                              </td>
                              <td className="px-3 py-2.5 hidden md:table-cell capitalize text-muted-foreground">
                                {v.confidence || '—'}
                              </td>
                              <td className="px-3 py-2.5 hidden lg:table-cell text-[10px] text-muted-foreground font-mono">
                                {v.annotation_source || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* BIOMARKERS */}
            <TabsContent value="biomarkers">
              <div className="space-y-3">
                <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4">
                  <Beaker className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Biomarkers marked as <strong>"Not Assessed"</strong> cannot be determined from the current VCF file and require complementary testing (e.g., FISH, IHC).
                  </p>
                </div>
                {biomarkers.length === 0 ? (
                  <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No biomarker data available.</CardContent></Card>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {biomarkers.map((b: any, i: number) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                        <Card className={b.status === 'positive' ? 'border-l-4 border-l-destructive' : b.status === 'not_assessed' ? 'border-l-4 border-l-muted-foreground' : ''}>
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="text-sm font-semibold">{b.name}</h3>
                                <p className="text-[10px] text-muted-foreground capitalize">{b.type}</p>
                              </div>
                              {biomarkerStatusBadge(b.status)}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{b.clinical_implication}</p>
                            {b.requires_confirmation && b.confirmation_method && (
                              <p className="text-[10px] text-clinical-moderate-risk flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Confirmation needed: {b.confirmation_method}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              {evidenceBadge(b.evidence_level)}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* THERAPEUTICS */}
            <TabsContent value="therapy">
              <div className="space-y-3">
                <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4">
                  <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Decision Support Only.</strong> These therapeutic options are ranked by evidence level. 
                    They do NOT constitute treatment recommendations. All options must be evaluated by a qualified physician.
                  </p>
                </div>

                {therapies.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-sm text-muted-foreground">
                      No therapy support options identified. VUS variants do not generate therapeutic recommendations.
                    </CardContent>
                  </Card>
                ) : (
                  therapies.map((tx: any, i: number) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="text-sm font-semibold">{tx.therapy}</h3>
                              <p className="text-xs text-muted-foreground">
                                {tx.approved_status} · Region: {tx.region?.toUpperCase() || '—'}
                                {tx.contraindicated && <span className="text-destructive ml-1">⚠ Contraindication flag</span>}
                              </p>
                            </div>
                            {evidenceBadge(tx.evidence_level)}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{tx.rationale}</p>
                          <p className="text-[10px] text-muted-foreground mt-2 italic">
                            ⓘ This is a decision support option, not a prescription.
                          </p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* AUDIT */}
            <TabsContent value="audit">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Audit Trail</CardTitle>
                </CardHeader>
                <CardContent>
                  {auditTrail.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No audit entries.</p>
                  ) : (
                    <div className="space-y-3">
                      {auditTrail.map((entry: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 text-xs">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                          <div className="flex-1">
                            <span className="font-medium">{entry.action}</span>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {new Date(entry.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pipeline Steps */}
              {data.analysis_steps?.length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Pipeline Steps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.analysis_steps.map((step: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 text-xs">
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0" />
                          ) : step.status === 'failed' ? (
                            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          ) : (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                          )}
                          <span className="font-mono">{step.step}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {new Date(step.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="mt-4 bg-muted/50">
                <CardContent className="p-4">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <strong>DISCLAIMER: </strong>{data.disclaimer || 'CLINICAL DECISION SUPPORT ONLY — This report does NOT constitute a medical diagnosis.'}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 text-center">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function AssessmentBadge({ label, assessed }: { label: string; assessed: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center text-xs ${assessed ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
      {assessed ? <CheckCircle2 className="h-4 w-4 mx-auto mb-1" /> : <Info className="h-4 w-4 mx-auto mb-1" />}
      <p className="font-medium">{label}</p>
      <p className="text-[10px]">{assessed ? 'Assessed' : 'Not assessed from current file'}</p>
    </div>
  );
}
