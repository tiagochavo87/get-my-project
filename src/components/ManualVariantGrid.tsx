import { useState } from 'react';
import { Plus, Trash2, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export interface ManualVariant {
  gene: string;
  chrom: string;
  pos: string;
  ref: string;
  alt: string;
  hgvs_c: string;
  hgvs_p: string;
}

const EMPTY_VARIANT: ManualVariant = {
  gene: '', chrom: '', pos: '', ref: '', alt: '', hgvs_c: '', hgvs_p: '',
};

const CHROMOSOMES = [
  '1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','X','Y',
];

interface Props {
  variants: ManualVariant[];
  onChange: (variants: ManualVariant[]) => void;
}

export function ManualVariantGrid({ variants, onChange }: Props) {
  const addRow = () => onChange([...variants, { ...EMPTY_VARIANT }]);

  const removeRow = (idx: number) => {
    const next = variants.filter((_, i) => i !== idx);
    onChange(next.length === 0 ? [{ ...EMPTY_VARIANT }] : next);
  };

  const updateRow = (idx: number, field: keyof ManualVariant, value: string) => {
    const next = [...variants];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const lines = text.trim().split('\n').filter(l => l.trim());
      if (lines.length === 0) return;

      const parsed: ManualVariant[] = [];
      for (const line of lines) {
        const cols = line.split(/\t|,/).map(c => c.trim());
        if (cols.length >= 5) {
          parsed.push({
            gene: cols[0] || '',
            chrom: cols[1]?.replace('chr', '') || '',
            pos: cols[2] || '',
            ref: cols[3] || '',
            alt: cols[4] || '',
            hgvs_c: cols[5] || '',
            hgvs_p: cols[6] || '',
          });
        }
      }

      if (parsed.length > 0) {
        onChange([...variants.filter(v => v.gene || v.chrom || v.pos), ...parsed]);
        toast.success(`${parsed.length} variant(s) pasted`);
      } else {
        toast.error('Could not parse pasted data. Expected: Gene, Chr, Pos, Ref, Alt [, HGVS.c, HGVS.p]');
      }
    } catch {
      toast.error('Clipboard access denied');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Enter variants manually. Min fields: <strong>Chr, Pos, Ref, Alt</strong>. Gene recommended.
        </p>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handlePaste}>
          <ClipboardPaste className="h-3 w-3" /> Paste from clipboard
        </Button>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium text-muted-foreground px-2 py-2 w-[100px]">Gene</th>
              <th className="text-left font-medium text-muted-foreground px-2 py-2 w-[70px]">Chr</th>
              <th className="text-left font-medium text-muted-foreground px-2 py-2 w-[100px]">Position *</th>
              <th className="text-left font-medium text-muted-foreground px-2 py-2 w-[70px]">Ref *</th>
              <th className="text-left font-medium text-muted-foreground px-2 py-2 w-[70px]">Alt *</th>
              <th className="text-left font-medium text-muted-foreground px-2 py-2 w-[120px]">HGVS.c</th>
              <th className="text-left font-medium text-muted-foreground px-2 py-2 w-[120px]">HGVS.p</th>
              <th className="px-2 py-2 w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, idx) => (
              <tr key={idx} className="border-b last:border-0">
                <td className="px-1 py-1">
                  <Input
                    value={v.gene}
                    onChange={e => updateRow(idx, 'gene', e.target.value.toUpperCase())}
                    placeholder="TP53"
                    className="h-7 text-xs font-mono"
                  />
                </td>
                <td className="px-1 py-1">
                  <Select value={v.chrom} onValueChange={val => updateRow(idx, 'chrom', val)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHROMOSOMES.map(c => (
                        <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-1">
                  <Input
                    value={v.pos}
                    onChange={e => updateRow(idx, 'pos', e.target.value.replace(/\D/g, ''))}
                    placeholder="7674220"
                    className="h-7 text-xs font-mono"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    value={v.ref}
                    onChange={e => updateRow(idx, 'ref', e.target.value.toUpperCase().replace(/[^ACGT]/g, ''))}
                    placeholder="G"
                    className="h-7 text-xs font-mono"
                    maxLength={50}
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    value={v.alt}
                    onChange={e => updateRow(idx, 'alt', e.target.value.toUpperCase().replace(/[^ACGT]/g, ''))}
                    placeholder="A"
                    className="h-7 text-xs font-mono"
                    maxLength={50}
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    value={v.hgvs_c}
                    onChange={e => updateRow(idx, 'hgvs_c', e.target.value)}
                    placeholder="c.742C>T"
                    className="h-7 text-xs font-mono"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    value={v.hgvs_p}
                    onChange={e => updateRow(idx, 'hgvs_p', e.target.value)}
                    placeholder="p.R248W"
                    className="h-7 text-xs font-mono"
                  />
                </td>
                <td className="px-1 py-1 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(idx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addRow}>
        <Plus className="h-3 w-3" /> Add Variant
      </Button>
    </div>
  );
}

export function getValidManualVariants(variants: ManualVariant[]): ManualVariant[] {
  return variants.filter(v => v.chrom && v.pos && v.ref && v.alt);
}
