import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FilePlus, Search, Filter, ArrowUpRight, Clock, CheckCircle2, 
  AlertTriangle, XCircle, Loader2, FileText, Users, Activity 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppLayout } from '@/components/layout/AppLayout';
import type { CaseStatus } from '@/types/clinical';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  completed: { label: 'Completed', icon: CheckCircle2, className: 'status-badge-completed' },
  processing: { label: 'Processing', icon: Loader2, className: 'status-badge-processing' },
  pending: { label: 'Pending', icon: Clock, className: 'status-badge-pending' },
  review_required: { label: 'Review Required', icon: AlertTriangle, className: 'tier-badge-2' },
  failed: { label: 'Failed', icon: XCircle, className: 'status-badge-failed' },
};

const diagnosisLabels: Record<string, string> = {
  mgus: 'MGUS',
  smoldering_mm: 'Smoldering MM',
  newly_diagnosed_mm: 'Newly Diagnosed MM',
  relapsed_refractory_mm: 'Relapsed/Refractory MM',
};

interface DBCase {
  id: string;
  case_number: string;
  status: string;
  sample_type: string;
  assembly: string;
  diagnosis: string;
  regulatory_region: string;
  patient_age: number;
  patient_sex: string;
  file_name: string;
  file_size: number;
  total_variants: number;
  relevant_variants: number;
  created_at: string;
  updated_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cases, setCases] = useState<DBCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchCases = async () => {
      const { data, error } = await supabase
        .from('cases' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setCases(data as unknown as DBCase[]);
      setLoading(false);
    };
    fetchCases();
  }, [user]);

  const filtered = cases.filter(c => {
    const matchSearch = c.case_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.file_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = [
    { label: 'Total Cases', value: cases.length, icon: FileText, color: 'text-primary' },
    { label: 'Completed', value: cases.filter(c => c.status === 'completed').length, icon: CheckCircle2, color: 'text-accent' },
    { label: 'Processing', value: cases.filter(c => c.status === 'processing').length, icon: Loader2, color: 'text-clinical-moderate-risk' },
    { label: 'Pending', value: cases.filter(c => c.status === 'pending').length, icon: Clock, color: 'text-muted-foreground' },
  ];

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Recent cases and analysis overview</p>
          </div>
          <Button asChild>
            <Link to="/new-case">
              <FilePlus className="h-4 w-4 mr-2" />
              New Case
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${s.color}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by case number or file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="review_required">Review Required</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cases Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cases ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground text-sm flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading cases...
                </div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Case</th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Diagnosis</th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Status</th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Variants</th>
                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell">Created</th>
                        <th className="text-right font-medium text-muted-foreground px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => {
                        const st = statusConfig[c.status] || statusConfig.pending;
                        const StatusIcon = st.icon;
                        return (
                          <motion.tr
                            key={c.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.03 }}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium">{c.case_number}</div>
                              <div className="text-xs text-muted-foreground">{c.file_name}</div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="text-xs">{diagnosisLabels[c.diagnosis] || c.diagnosis}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`clinical-badge ${st.className}`}>
                                <StatusIcon className={`h-3 w-3 ${c.status === 'processing' ? 'animate-spin' : ''}`} />
                                {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {c.relevant_variants > 0 ? (
                                <span className="text-xs">
                                  <span className="font-medium">{c.relevant_variants}</span>
                                  <span className="text-muted-foreground"> / {c.total_variants.toLocaleString()}</span>
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                              {new Date(c.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {(c.status === 'completed' || c.status === 'review_required') && (
                                <Button variant="ghost" size="sm" asChild>
                                  <Link to={`/case/${c.id}`}>
                                    <span className="sr-only">View</span>
                                    <ArrowUpRight className="h-4 w-4" />
                                  </Link>
                                </Button>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      {cases.length === 0 ? 'No cases yet. Create your first case to get started.' : 'No cases match your filters.'}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
