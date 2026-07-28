// components/terms/CopyTermSettingsDialog.tsx
'use client';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, CheckCircle2, ArrowRight } from 'lucide-react';

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface CopySummary {
  source_term: { id: number; name: string };
  target_term: { id: number; name: string };
  term_classes: { to_copy: number; skipped_existing: number };
  class_subjects: { to_copy: number; skipped_existing: number };
  trainer_assignments: {
    to_copy: number;
    skipped_existing: number;
    skipped_no_class_subject: number;
  };
  combinations: { to_copy: number; skipped: number };
}

interface CopyTermSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetTerm: Term;
  terms: Term[];
  onSuccess: () => void;
}

export default function CopyTermSettingsDialog({
  open,
  onOpenChange,
  targetTerm,
  terms,
  onSuccess,
}: CopyTermSettingsDialogProps) {
  // Candidate source terms: everything except the target itself,
  // ordered by start_date descending (most recent first)
  const sourceCandidates = useMemo(
    () =>
      terms
        .filter((t) => t.id !== targetTerm.id)
        .sort(
          (a, b) =>
            new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        ),
    [terms, targetTerm.id]
  );

  // Default: most recent term that started before the target term
  const defaultSourceId = useMemo(() => {
    const targetStart = new Date(targetTerm.start_date).getTime();
    const prior = sourceCandidates.find(
      (t) => new Date(t.start_date).getTime() < targetStart
    );
    return prior?.id ?? sourceCandidates[0]?.id ?? null;
  }, [sourceCandidates, targetTerm.start_date]);

  const [sourceTermId, setSourceTermId] = useState<number | null>(null);
  const [include, setInclude] = useState({
    term_classes: true,
    class_subjects: true,
    trainer_assignments: true,
    combinations: true,
  });
  const [summary, setSummary] = useState<CopySummary | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState('');

  // Reset state whenever the dialog opens
  useEffect(() => {
    if (open) {
      setSourceTermId(defaultSourceId);
      setInclude({
        term_classes: true,
        class_subjects: true,
        trainer_assignments: true,
        combinations: true,
      });
      setSummary(null);
      setIsDone(false);
      setError('');
    }
  }, [open, defaultSourceId]);

  // Any change to source or options invalidates the current preview
  const invalidatePreview = () => {
    setSummary(null);
    setIsDone(false);
    setError('');
  };

  const handleToggle = (key: keyof typeof include) => {
    setInclude((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Combinations can't exist without trainer assignments
      if (key === 'trainer_assignments' && prev.trainer_assignments) {
        next.combinations = false;
      }
      if (key === 'combinations' && !prev.combinations && !prev.trainer_assignments) {
        return prev; // can't enable combinations alone
      }
      return next;
    });
    invalidatePreview();
  };

  const callApi = async (mode: 'preview' | 'execute') => {
    const response = await fetch('/api/terms/copy-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_term_id: sourceTermId,
        target_term_id: targetTerm.id,
        mode,
        include,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Failed to ${mode} copy`);
    }
    return data.data as CopySummary;
  };

  const handlePreview = async () => {
    if (!sourceTermId) return;
    setIsPreviewing(true);
    setError('');
    try {
      setSummary(await callApi('preview'));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPreviewing(false);
    }
  };

const handleExecute = async () => {
  if (!sourceTermId || !summary) return;
  setIsCopying(true);
  setError('');
  try {
    await callApi('execute');
    setIsDone(true);
  toast.success('Settings copied successfully', {
  description: `${totalToCopy} item${totalToCopy !== 1 ? 's' : ''} copied from ${summary.source_term.name} into ${targetTerm.name}.`,
});
    onSuccess();
  } catch (err: any) {
    setError(err.message);
  } finally {
    setIsCopying(false);
  }
};

  const totalToCopy = summary
    ? summary.term_classes.to_copy +
      summary.class_subjects.to_copy +
      summary.trainer_assignments.to_copy +
      summary.combinations.to_copy
    : 0;

  const rows = summary
    ? [
        {
          label: 'Classes attached to term',
          enabled: include.term_classes,
          copy: summary.term_classes.to_copy,
          skipped: summary.term_classes.skipped_existing,
        },
        {
          label: 'Class–subject assignments',
          enabled: include.class_subjects,
          copy: summary.class_subjects.to_copy,
          skipped: summary.class_subjects.skipped_existing,
        },
        {
          label: 'Trainer subject assignments',
          enabled: include.trainer_assignments,
          copy: summary.trainer_assignments.to_copy,
          skipped:
            summary.trainer_assignments.skipped_existing +
            summary.trainer_assignments.skipped_no_class_subject,
        },
        {
          label: 'Subject combinations',
          enabled: include.combinations,
          copy: summary.combinations.to_copy,
          skipped: summary.combinations.skipped,
        },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copy Settings into {targetTerm.name}
          </DialogTitle>
          <DialogDescription>
            Reuse class rosters, subject assignments, and scheduling settings
            from a previous term. Existing entries in this term are never
            overwritten — only missing ones are added.
          </DialogDescription>
        </DialogHeader>

        {isDone ? (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <div>
              <p className="font-medium">Settings copied successfully</p>
              <p className="text-sm text-gray-600 mt-1">
                {totalToCopy} item{totalToCopy !== 1 ? 's' : ''} copied from{' '}
                {summary?.source_term.name} into {targetTerm.name}.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Source term selector */}
            <div className="space-y-2">
              <Label>Copy from</Label>
              <Select
                value={sourceTermId ? String(sourceTermId) : undefined}
                onValueChange={(v) => {
                  setSourceTermId(Number(v));
                  invalidatePreview();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a source term" />
                </SelectTrigger>
                <SelectContent>
                  {sourceCandidates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                      {t.id === defaultSourceId ? ' (previous term)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* What to copy */}
            <div className="space-y-3">
              <Label>What to copy</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="copy-term-classes"
                    checked={include.term_classes}
                    onCheckedChange={() => handleToggle('term_classes')}
                  />
                  <label htmlFor="copy-term-classes" className="text-sm">
                    Classes attached to the term
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="copy-class-subjects"
                    checked={include.class_subjects}
                    onCheckedChange={() => handleToggle('class_subjects')}
                  />
                  <label htmlFor="copy-class-subjects" className="text-sm">
                    Class–subject assignments (incl. sessions per week &amp; lesson type)
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="copy-trainer-assignments"
                    checked={include.trainer_assignments}
                    onCheckedChange={() => handleToggle('trainer_assignments')}
                  />
                  <label htmlFor="copy-trainer-assignments" className="text-sm">
                    Trainer subject assignments
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="copy-combinations"
                    checked={include.combinations}
                    disabled={!include.trainer_assignments}
                    onCheckedChange={() => handleToggle('combinations')}
                  />
                  <label
                    htmlFor="copy-combinations"
                    className={`text-sm ${!include.trainer_assignments ? 'text-gray-400' : ''}`}
                  >
                    Subject combinations
                  </label>
                </div>
              </div>
            </div>

            {/* Preview results */}
            {summary && (
              <div className="rounded-md border bg-gray-50 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {summary.source_term.name}
                  <ArrowRight className="h-3.5 w-3.5" />
                  {summary.target_term.name}
                </p>
                <div className="space-y-1">
                  {rows
                    .filter((r) => r.enabled)
                    .map((r) => (
                      <div
                        key={r.label}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-600">{r.label}</span>
                        <span>
                          <span className="font-medium">{r.copy}</span> to copy
                          {r.skipped > 0 && (
                            <span className="text-amber-600">
                              {' '}· {r.skipped} skipped
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                </div>
                {summary.trainer_assignments.skipped_no_class_subject > 0 && (
                  <p className="text-xs text-amber-600">
                    {summary.trainer_assignments.skipped_no_class_subject} trainer
                    assignment(s) skipped because their class–subject pairing
                    won&apos;t exist in the target term.
                  </p>
                )}
                {totalToCopy === 0 && (
                  <p className="text-xs text-gray-600">
                    Nothing new to copy — the target term already has all of
                    these settings.
                  </p>
                )}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {isDone ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {!summary ? (
                <Button
                  onClick={handlePreview}
                  disabled={!sourceTermId || isPreviewing}
                >
                  {isPreviewing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Preview
                </Button>
              ) : (
                <Button
                  onClick={handleExecute}
                  disabled={isCopying || totalToCopy === 0}
                >
                  {isCopying && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isCopying
                    ? 'Copying...'
                    : `Copy ${totalToCopy} item${totalToCopy !== 1 ? 's' : ''}`}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}