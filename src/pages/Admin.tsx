import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, BarChart3, FileText, ScrollText, Loader2,
  ShieldCheck, ShieldOff, UserCog, Eye, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const ROLES = ['admin', 'molecular_pathologist', 'hematologist_oncologist', 'lab_technician', 'viewer'] as const;

const roleBadgeColor: Record<string, string> = {
  admin: 'bg-destructive/10 text-destructive border-destructive/30',
  molecular_pathologist: 'bg-primary/10 text-primary border-primary/30',
  hematologist_oncologist: 'bg-accent/10 text-accent-foreground border-accent/30',
  lab_technician: 'bg-muted text-muted-foreground border-border',
  viewer: 'bg-muted text-muted-foreground border-border',
};

function useAdminApi() {
  const { user } = useAuth();

  const call = useCallback(async (action: string, extra: Record<string, any> = {}) => {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: session } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/admin-panel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...extra }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  }, [user]);

  return call;
}

export default function Admin() {
  const api = useAdminApi();
  const [tab, setTab] = useState('stats');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const loadTab = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      if (t === 'stats') {
        const data = await api('system_stats');
        setStats(data);
      } else if (t === 'users') {
        const data = await api('list_users');
        setUsers(data.users || []);
      } else if (t === 'cases') {
        const data = await api('list_cases');
        setCases(data.cases || []);
      } else if (t === 'audit') {
        const data = await api('audit_logs');
        setLogs(data.logs || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadTab(tab);
  }, [tab, loadTab]);

  const handleSetRole = async (targetUserId: string, role: string, remove: boolean) => {
    try {
      await api('set_role', { target_user_id: targetUserId, role, remove });
      toast.success(remove ? `Role ${role} removed` : `Role ${role} assigned`);
      loadTab('users');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleActive = async (targetUserId: string, isActive: boolean) => {
    try {
      await api('toggle_active', { target_user_id: targetUserId, is_active: isActive });
      toast.success(isActive ? 'User activated' : 'User deactivated');
      loadTab('users');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">System management and monitoring</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadTab(tab)}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="stats" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Statistics</TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Users</TabsTrigger>
            <TabsTrigger value="cases" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> All Cases</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="h-3.5 w-3.5" /> Audit Logs</TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading...
            </div>
          ) : error ? (
            <Card className="mt-4"><CardContent className="p-6 text-center text-destructive">{error}</CardContent></Card>
          ) : (
            <>
              {/* ─── STATS ─── */}
              <TabsContent value="stats">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Users" value={stats?.total_users ?? 0} />
                  <StatCard label="Total Cases" value={stats?.total_cases ?? 0} />
                  <StatCard label="Total Variants" value={(stats?.total_variants ?? 0).toLocaleString()} />
                  <StatCard label="Storage Used" value={`${stats?.total_storage_mb ?? 0} MB`} />
                  <StatCard label="Avg Processing" value={`${stats?.avg_processing_seconds ?? 0}s`} />
                  <StatCard label="Recent Jobs" value={stats?.recent_jobs_count ?? 0} />
                </div>

                {stats?.cases_by_status && (
                  <Card className="mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Cases by Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(stats.cases_by_status).map(([status, count]) => (
                          <div key={status} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                            <span className="text-xs text-muted-foreground capitalize">{status.replace(/_/g, ' ')}</span>
                            <span className="text-sm font-bold">{count as number}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ─── USERS ─── */}
              <TabsContent value="users">
                <div className="space-y-3">
                  {users.map((u) => (
                    <Card key={u.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{u.full_name || 'No name'}</span>
                              {!u.is_active && (
                                <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                            <div className="flex gap-1.5 mt-1.5 flex-wrap">
                              {(u.roles || []).map((r: string) => (
                                <span
                                  key={r}
                                  className={`text-[10px] px-2 py-0.5 rounded-full border font-medium cursor-pointer hover:opacity-70 ${roleBadgeColor[r] || ''}`}
                                  title="Click to remove"
                                  onClick={() => handleSetRole(u.id, r, true)}
                                >
                                  {r.replace(/_/g, ' ')}  ×
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Select onValueChange={(role) => handleSetRole(u.id, role, false)}>
                              <SelectTrigger className="w-[160px] h-8 text-xs">
                                <SelectValue placeholder="Add role..." />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.filter((r) => !(u.roles || []).includes(r)).map((r) => (
                                  <SelectItem key={r} value={r} className="text-xs">
                                    {r.replace(/_/g, ' ')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => handleToggleActive(u.id, !u.is_active)}
                            >
                              {u.is_active ? (
                                <><ShieldOff className="h-3 w-3 mr-1" /> Deactivate</>
                              ) : (
                                <><ShieldCheck className="h-3 w-3 mr-1" /> Activate</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {users.length === 0 && (
                    <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No users found.</CardContent></Card>
                  )}
                </div>
              </TabsContent>

              {/* ─── CASES ─── */}
              <TabsContent value="cases">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Case</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">User</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Status</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Diagnosis</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Variants</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden lg:table-cell">Date</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cases.map((c) => (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-3 py-2.5 font-mono font-medium">{c.case_number}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{c.user_email}</td>
                              <td className="px-3 py-2.5">
                                <span className={`clinical-badge ${
                                  c.status === 'completed' ? 'status-badge-completed' :
                                  c.status === 'failed' ? 'status-badge-failed' :
                                  c.status === 'processing' ? 'status-badge-processing' :
                                  'status-badge-pending'
                                }`}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground capitalize">
                                {c.diagnosis?.replace(/_/g, ' ')}
                              </td>
                              <td className="px-3 py-2.5 hidden md:table-cell">
                                {c.relevant_variants}/{c.total_variants}
                              </td>
                              <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">
                                {new Date(c.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-3 py-2.5">
                                <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                                  <Link to={`/case/${c.id}`}>
                                    <Eye className="h-3 w-3 mr-1" /> View
                                  </Link>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {cases.length === 0 && (
                        <div className="p-8 text-center text-sm text-muted-foreground">No cases found.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── AUDIT LOGS ─── */}
              <TabsContent value="audit">
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Timestamp</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Action</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">User</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Entity</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden lg:table-cell">Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((l) => (
                            <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-3 py-2.5 text-muted-foreground font-mono">
                                {new Date(l.created_at).toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 font-medium">{l.action}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{l.actor_email}</td>
                              <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">
                                {l.entity_type}
                              </td>
                              <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground truncate max-w-[200px]">
                                {l.after_json ? JSON.stringify(l.after_json).slice(0, 80) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {logs.length === 0 && (
                        <div className="p-8 text-center text-sm text-muted-foreground">No audit logs found.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
