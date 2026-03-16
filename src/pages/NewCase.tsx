import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export default function NewCase() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [svFile, setSvFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [svDragOver, setSvDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [sampleType, setSampleType] = useState('');
  const [assembly, setAssembly] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [regulatoryRegion, setRegulatoryRegion] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientSex, setPatientSex] = useState('');
  const [priorTreatmentLines, setPriorTreatmentLines] = useState('');
  const [transplantEligibility, setTransplantEligibility] = useState('');
  const [issStage, setIssStage] = useState('');
  const [rissStage, setRissStage] = useState('');
  const [creatinine, setCreatinine] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  const isVcfFile = (f: File) => {
    const name = f.name.toLowerCase();
    return name.endsWith('.vcf') || name.endsWith('.vcf.gz') || name.endsWith('.gvcf') || name.endsWith('.gvcf.gz');
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && isVcfFile(f)) {
      setFile(f);
    } else {
      toast.error('Please upload a .vcf, .vcf.gz, .gvcf, or .gvcf.gz file');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSvFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setSvDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && isVcfFile(f)) {
      setSvFile(f);
    } else {
      toast.error('Please upload a .vcf or .vcf.gz file');
    }
  };

  const handleSvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setSvFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    if (!sampleType || !assembly || !diagnosis) {
      toast.error('Please fill all required fields (Sample Type, Assembly, Diagnosis)');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload VCF file to storage
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('vcf-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 1b. Upload SV VCF if provided
      let svFilePath: string | null = null;
      if (svFile) {
        svFilePath = `${user.id}/${Date.now()}_sv_${svFile.name}`;
        const { error: svUploadError } = await supabase.storage
          .from('vcf-files')
          .upload(svFilePath, svFile);
        if (svUploadError) throw svUploadError;
      }

      // 2. Insert case record
      const { data: caseData, error: caseError } = await (supabase
        .from('cases' as any)
        .insert({
          user_id: user.id,
          sample_type: sampleType,
          assembly,
          diagnosis,
          regulatory_region: regulatoryRegion || 'brazil',
          patient_age: patientAge ? parseInt(patientAge) : 0,
          patient_sex: patientSex || 'other',
          prior_treatment_lines: priorTreatmentLines ? parseInt(priorTreatmentLines) : 0,
          transplant_eligibility: transplantEligibility || 'unknown',
          iss_stage: issStage || null,
          riss_stage: rissStage || null,
          creatinine: creatinine ? parseFloat(creatinine) : null,
          clinical_notes: clinicalNotes || null,
          file_name: file.name,
          file_size: file.size,
          file_path: filePath,
          status: 'processing',
        } as any)
        .select()
        .single());

      if (caseError) throw caseError;
      const insertedCase = caseData as any;

      // 2b. If SV file, register it in uploaded_files
      if (svFile && svFilePath) {
        await supabase.from('uploaded_files' as any).insert({
          case_id: insertedCase.id,
          user_id: user.id,
          filename: svFile.name,
          storage_path: svFilePath,
          file_type: 'sv_vcf',
          file_size: svFile.size,
          upload_status: 'completed',
        } as any);
      }

      toast.success('Case submitted. Starting analysis pipeline...');

      // 3. Trigger VCF analysis pipeline
      const { data: session } = await supabase.auth.getSession();
      supabase.functions.invoke('analyze-vcf', {
        body: { case_id: insertedCase.id, sv_file_path: svFilePath },
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      }).then((res) => {
        if (res.error) {
          console.error('Analysis error:', res.error);
        }
      });

      navigate('/dashboard');
    } catch (err: any) {
      console.error('Submit error:', err);
      toast.error(err.message || 'Failed to submit case');
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = file && sampleType && assembly && diagnosis;

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Case</h1>
          <p className="text-sm text-muted-foreground">Upload a VCF file and provide clinical context for analysis</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">VCF File Upload</CardTitle>
                <CardDescription>Accepts .vcf or .vcf.gz from exome or whole genome sequencing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Main VCF */}
                <div>
                  <Label className="text-xs font-medium mb-2 block">SNV / Indel VCF *</Label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                      dragOver ? 'border-primary bg-primary/5' : file ? 'border-accent bg-accent/5' : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => document.getElementById('vcf-input')?.click()}
                  >
                    {file ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle2 className="h-6 w-6 text-accent" />
                        <div className="text-left">
                          <p className="font-medium text-sm">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{(file.size / 1e6).toFixed(1)} MB</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Drag & drop your VCF file here</p>
                        <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                      </>
                    )}
                    <input
                      id="vcf-input"
                      type="file"
                      accept=".vcf,.vcf.gz"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                </div>

                {/* SV VCF */}
                <div>
                  <Label className="text-xs font-medium mb-2 block">
                    Structural Variants VCF <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setSvDragOver(true); }}
                    onDragLeave={() => setSvDragOver(false)}
                    onDrop={handleSvFileDrop}
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                      svDragOver ? 'border-primary bg-primary/5' : svFile ? 'border-accent bg-accent/5' : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => document.getElementById('sv-vcf-input')?.click()}
                  >
                    {svFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-accent" />
                        <div className="text-left">
                          <p className="font-medium text-sm">{svFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(svFile.size / 1e6).toFixed(1)} MB</p>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-destructive hover:underline ml-2"
                          onClick={(e) => { e.stopPropagation(); setSvFile(null); }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Drop a .sv.vcf / .sv.vcf.gz here for translocations, deletions, inversions, etc.
                        </p>
                      </>
                    )}
                    <input
                      id="sv-vcf-input"
                      type="file"
                      accept=".vcf,.vcf.gz"
                      className="hidden"
                      onChange={handleSvFileSelect}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Clinical Context */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Clinical Context
                </CardTitle>
                <CardDescription>Required information for accurate interpretation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sample Type *</Label>
                    <Select value={sampleType} onValueChange={setSampleType}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="somatic_tumor">Somatic Tumor</SelectItem>
                        <SelectItem value="germline_constitutional">Germline Constitutional</SelectItem>
                        <SelectItem value="tumor_normal_paired">Tumor-Normal Paired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Genome Assembly *</Label>
                    <Select value={assembly} onValueChange={setAssembly}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GRCh37">GRCh37 (hg19)</SelectItem>
                        <SelectItem value="GRCh38">GRCh38 (hg38)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Clinical Diagnosis *</Label>
                    <Select value={diagnosis} onValueChange={setDiagnosis}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mgus">MGUS</SelectItem>
                        <SelectItem value="smoldering_mm">Smoldering MM</SelectItem>
                        <SelectItem value="newly_diagnosed_mm">Newly Diagnosed MM</SelectItem>
                        <SelectItem value="relapsed_refractory_mm">Relapsed/Refractory MM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Regulatory Region</Label>
                    <Select value={regulatoryRegion} onValueChange={setRegulatoryRegion}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="brazil">Brazil (ANVISA)</SelectItem>
                        <SelectItem value="us">United States (FDA)</SelectItem>
                        <SelectItem value="eu">European Union (EMA)</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Patient Age</Label>
                    <Input type="number" placeholder="Years" min={0} max={120} value={patientAge} onChange={e => setPatientAge(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Patient Sex</Label>
                    <Select value={patientSex} onValueChange={setPatientSex}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prior Treatment Lines</Label>
                    <Input type="number" placeholder="0" min={0} value={priorTreatmentLines} onChange={e => setPriorTreatmentLines(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Transplant Eligibility</Label>
                    <Select value={transplantEligibility} onValueChange={setTransplantEligibility}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eligible">Eligible</SelectItem>
                        <SelectItem value="ineligible">Ineligible</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">ISS Stage</Label>
                    <Select value={issStage} onValueChange={setIssStage}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="I">I</SelectItem>
                        <SelectItem value="II">II</SelectItem>
                        <SelectItem value="III">III</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">R-ISS Stage</Label>
                    <Select value={rissStage} onValueChange={setRissStage}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="I">I</SelectItem>
                        <SelectItem value="II">II</SelectItem>
                        <SelectItem value="III">III</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Creatinine (mg/dL)</Label>
                    <Input type="number" placeholder="—" step={0.1} min={0} value={creatinine} onChange={e => setCreatinine(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Clinical Notes</Label>
                  <Textarea placeholder="Additional clinical context, observations, or relevant history..." rows={3} value={clinicalNotes} onChange={e => setClinicalNotes(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Info box */}
          <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              The VCF file will be validated for format, genome build, and available fields before analysis begins. 
              If CNV, fusion, or structural variant data is not present, the report will explicitly state those alterations were not assessed.
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>Cancel</Button>
            <Button type="submit" disabled={!isFormValid || submitting}>
              {submitting ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Submitting...
                </>
              ) : (
                <>Submit Case</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
