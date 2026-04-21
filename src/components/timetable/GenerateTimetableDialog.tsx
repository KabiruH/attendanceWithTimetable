'use client';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Zap, Upload, Loader2, AlertTriangle, CheckCircle2,
  Info, BookOpen, ChevronDown, ChevronUp, Combine
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format } from 'date-fns';
import DraftSelectionDialog from './DraftSelectionDialogue';

interface Term {
  id: number;
  name: string;
  is_active: boolean;
  start_date: string;
}

interface GenerateTimetableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  terms: Term[];
}

interface SubjectWithoutTrainer {
  id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  class_id: number;
  class_code: string;
  class_name: string;
  department: string;
  credit_hours?: number | null;
}

interface PreFlightCheckResult {
  passed: boolean;
  term_info: {
    name: string;
    start_date: string;
    days_count: number;
  };
  classes: {
    total: number;
    list: Array<{ id: number; name: string; code: string; department: string }>;
  };
  subjects: {
    total: number;
    with_trainer: number;
    without_trainer: number;
    details_without_trainer: SubjectWithoutTrainer[];
  };
  scheduling_config: {
    lesson_type_breakdown: { single: number; double: number; triple: number };
    total_period_slots_needed_per_week: number;
    subjects_with_overrides: number;
  };
  combinations: {
    total: number;
    subjects_with_combinations: number;
    details: Array<{
      subject_id: number;
      subject_name: string;
      subject_code: string;
      combination_count: number;
    }>;
  };
  trainers: {
    total: number;
    list: Array<{
      id: number;
      name: string;
      subjects_count: number;
      total_sessions_per_week: number;
    }>;
  };
  rooms: { active: number };
  lesson_periods: { active: number };
  existing_timetable: {
    exists: boolean;
    slots_count: number;
    can_regenerate: boolean;
    days_since_term_start: number;
  };
  errors: string[];
  warnings: string[];
}

interface Draft {
  draft_id: number;
  draft_number: number;
  stats: {
    slots_created: number;
    trainer_assignments_processed: number;
    assignments_fully_scheduled: number;
    trainers_assigned: number;
    rooms_used: number;
    subjects_scheduled: number;
    assignments_partially_scheduled: number;
    combined_assignments: number;
    double_triple_sessions: number;
    combined_slots: number;
  };
  skipped_count: number;
  skipped_assignments?: any[];
}

export default function GenerateTimetableDialog({
  open,
  onOpenChange,
  onSuccess,
  terms,
}: GenerateTimetableDialogProps) {
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [method, setMethod] = useState<'auto' | 'manual'>('auto');
  const [error, setError] = useState('');
  const [minClassesPerDay, setMinClassesPerDay] = useState(3);

  const [isCheckingPreFlight, setIsCheckingPreFlight] = useState(false);
  const [preFlightResults, setPreFlightResults] = useState<PreFlightCheckResult | null>(null);
  const [showPreFlight, setShowPreFlight] = useState(false);
  const [showSubjectsWithoutTrainer, setShowSubjectsWithoutTrainer] = useState(false);
  const [showCombinations, setShowCombinations] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [canGenerate, setCanGenerate] = useState(true);
  const [deadlineMessage, setDeadlineMessage] = useState('');

  // Draft selection state
  const [isDraftDialogOpen, setIsDraftDialogOpen] = useState(false);
  const [generatedDrafts, setGeneratedDrafts] = useState<Draft[]>([]);
  const [draftTermName, setDraftTermName] = useState('');
  const [draftTermId, setDraftTermId] = useState<number | null>(null);

  useEffect(() => {
    if (open) checkGenerationDeadline();
  }, [open]);

  const checkGenerationDeadline = async () => {
    try {
      const response = await fetch('/api/timetable-settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();

      if (data.data?.generation_deadline_enabled && data.data?.timetable_generation_deadline) {
        const deadline = new Date(data.data.timetable_generation_deadline);
        if (new Date() < deadline) {
          setCanGenerate(false);
          setDeadlineMessage(
            `Timetable generation is blocked until ${format(deadline, 'PPP')}. ` +
            `This allows trainers to complete their class and subject selections.`
          );
          return;
        }
      }
      setCanGenerate(true);
      setDeadlineMessage('');
    } catch {
      setCanGenerate(true);
    }
  };

  const handleTermChange = (termId: string) => {
    setSelectedTerm(termId);
    setPreFlightResults(null);
    setShowPreFlight(false);
    setError('');
    setShowSubjectsWithoutTrainer(false);
    setShowCombinations(false);
  };

  const runPreFlightChecks = async () => {
    if (!selectedTerm) { setError('Please select a term'); return; }
    setIsCheckingPreFlight(true);
    setError('');
    setPreFlightResults(null);
    try {
      const response = await fetch(`/api/timetable/generate/pre-flight?term_id=${selectedTerm}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Pre-flight checks failed');
      setPreFlightResults(data);
      setShowPreFlight(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run pre-flight checks');
    } finally {
      setIsCheckingPreFlight(false);
    }
  };

  const handleAutoGenerate = async () => {
    if (!selectedTerm || !preFlightResults) return;
    if (!preFlightResults.passed) {
      setError('Cannot generate timetable. Please fix the errors listed above.');
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const response = await fetch('/api/timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_id: parseInt(selectedTerm),
          min_classes_per_day: minClassesPerDay,
          regenerate: preFlightResults.existing_timetable.exists,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate timetable');

      const termName = terms.find(t => t.id === parseInt(selectedTerm))?.name ?? '';
      setGeneratedDrafts(data.drafts);
      setDraftTermName(termName);
      setDraftTermId(parseInt(selectedTerm));
      onOpenChange(false);
      setIsDraftDialogOpen(true);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate timetable');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmDraft = async (draftId: number) => {
    const response = await fetch('/api/timetable/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: draftId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to confirm timetable');

    setIsDraftDialogOpen(false);
    setGeneratedDrafts([]);
    onSuccess();
  };

  const handleDiscardDrafts = async () => {
    if (!draftTermId) return;
    const deleteRes = await fetch(`/api/timetable/drafts?term_id=${draftTermId}`, {
      method: 'DELETE',
    });
    if (!deleteRes.ok) {
      const err = await deleteRes.json();
      throw new Error(err.error || 'Failed to discard drafts');
    }
    setIsDraftDialogOpen(false);
    setGeneratedDrafts([]);
    setDraftTermId(null);
    onOpenChange(true);
  };

  const resetForm = () => {
    setSelectedTerm('');
    setMethod('auto');
    setMinClassesPerDay(3);
    setError('');
    setPreFlightResults(null);
    setShowPreFlight(false);
    setShowSubjectsWithoutTrainer(false);
    setShowCombinations(false);
  };

  const lessonTypeLabel = (type: string) => ({
    single: 'Single',
    double: 'Double',
    triple: 'Triple',
  }[type] ?? type);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Timetable</DialogTitle>
            <DialogDescription>
              Automatically create subject schedules or add them manually.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">

            {/* Term Selection */}
            <div className="space-y-2">
              <Label htmlFor="term">Select Term *</Label>
              <Select value={selectedTerm} onValueChange={handleTermChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id.toString()}>
                      {term.name} {term.is_active && '(Active)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Method Selection */}
            <div className="space-y-2">
              <Label>Generation Method</Label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant={method === 'auto' ? 'default' : 'outline'}
                  onClick={() => setMethod('auto')}
                  className="h-20 flex-col gap-2"
                >
                  <Zap className="h-6 w-6" />
                  <span>Auto Generate</span>
                </Button>
                <Button
                  type="button"
                  variant={method === 'manual' ? 'default' : 'outline'}
                  onClick={() => setMethod('manual')}
                  className="h-20 flex-col gap-2"
                >
                  <Upload className="h-6 w-6" />
                  <span>Manual Entry</span>
                </Button>
              </div>
            </div>

            {/* Auto Generate Section */}
            {method === 'auto' && (
              <div className="space-y-4">

                {/* Settings */}
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                  <h3 className="font-semibold text-sm">Generation Settings</h3>
                  <div className="space-y-2">
                    <Label htmlFor="minClassesPerDay">Minimum Subjects per Trainer / Day</Label>
                    <Input
                      id="minClassesPerDay"
                      type="number"
                      min="1"
                      max="8"
                      value={minClassesPerDay}
                      onChange={(e) => setMinClassesPerDay(parseInt(e.target.value) || 3)}
                    />
                    <p className="text-xs text-gray-500">
                      Minimum number of subjects a trainer should teach per day
                    </p>
                  </div>
                  <Alert className="bg-blue-50 border-blue-200 mt-2">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 text-xs">
                      Sessions per week and lesson type (single / double / triple) are now configured
                      per subject in <strong>Subject Scheduling Configuration</strong>. The generator
                      will read those settings automatically.
                    </AlertDescription>
                  </Alert>
                </div>

                {/* Generation info banner */}
                <Alert className="bg-blue-50 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-sm">
                    Generation produces <strong>3 timetable options</strong> for you to compare and
                    select from. Drafts are saved until you make a choice.
                  </AlertDescription>
                </Alert>

                {/* Pre-flight trigger */}
                {selectedTerm && !showPreFlight && (
                  <Button
                    onClick={runPreFlightChecks}
                    disabled={isCheckingPreFlight}
                    variant="outline"
                    className="w-full"
                  >
                    {isCheckingPreFlight ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running Checks...</>
                    ) : (
                      <><CheckCircle2 className="mr-2 h-4 w-4" />Run Pre-Flight Tests</>
                    )}
                  </Button>
                )}

                {/* Pre-flight results */}
                {showPreFlight && preFlightResults && (
                  <div className="space-y-3 p-4 bg-white rounded-lg border">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Pre-Flight Check Results</h3>
                      {preFlightResults.passed ? (
                        <Badge className="bg-green-500">✓ Ready to Generate</Badge>
                      ) : (
                        <Badge variant="destructive">✗ Cannot Generate</Badge>
                      )}
                    </div>

                    <Separator />

                    {/* Summary grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Classes</p>
                        <p className="font-semibold">{preFlightResults.classes.total} in term</p>
                      </div>
                      <div>
                        <p className="text-gray-500 flex items-center gap-1">
                          <BookOpen className="h-3 w-3" /> Subjects
                        </p>
                        <p className="font-semibold">
                          {preFlightResults.subjects.total} total
                          {preFlightResults.subjects.without_trainer > 0 && (
                            <span className="text-red-600 ml-1">
                              ({preFlightResults.subjects.without_trainer} no trainer)
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Trainers</p>
                        <p className="font-semibold">{preFlightResults.trainers.total}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Rooms</p>
                        <p className="font-semibold">{preFlightResults.rooms.active} available</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Lesson Periods</p>
                        <p className="font-semibold">{preFlightResults.lesson_periods.active}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Period Slots / Week</p>
                        <p className="font-semibold">
                          {preFlightResults.scheduling_config?.total_period_slots_needed_per_week ?? '—'}
                        </p>
                      </div>
                    </div>

                    {/* Lesson type breakdown */}
                    {preFlightResults.scheduling_config && (
                      <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Lesson Type Breakdown
                        </p>
                        <div className="flex gap-3 flex-wrap">
                          {Object.entries(preFlightResults.scheduling_config.lesson_type_breakdown).map(
                            ([type, count]) => (
                              <div key={type} className="flex items-center gap-1.5 text-sm">
                                <Badge variant="outline" className="capitalize">{lessonTypeLabel(type)}</Badge>
                                <span className="font-medium">{count as number}</span>
                                <span className="text-muted-foreground text-xs">subject{(count as number) !== 1 ? 's' : ''}</span>
                              </div>
                            )
                          )}
                          {preFlightResults.scheduling_config.subjects_with_overrides > 0 && (
                            <div className="flex items-center gap-1.5 text-sm">
                              <Badge variant="outline" className="text-amber-600 border-amber-300">
                                Overrides
                              </Badge>
                              <span className="font-medium">{preFlightResults.scheduling_config.subjects_with_overrides}</span>
                              <span className="text-muted-foreground text-xs">assignment{preFlightResults.scheduling_config.subjects_with_overrides !== 1 ? 's' : ''}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Combinations summary */}
                    {preFlightResults.combinations && preFlightResults.combinations.total > 0 && (
                      <Collapsible open={showCombinations} onOpenChange={setShowCombinations}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                            <span className="flex items-center gap-1.5">
                              <Combine className="h-3.5 w-3.5 text-indigo-500" />
                              {preFlightResults.combinations.total} combination{preFlightResults.combinations.total !== 1 ? 's' : ''} across{' '}
                              {preFlightResults.combinations.subjects_with_combinations} subject{preFlightResults.combinations.subjects_with_combinations !== 1 ? 's' : ''}
                            </span>
                            {showCombinations ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="rounded-md border divide-y text-xs">
                            {preFlightResults.combinations.details.map(detail => (
                              <div key={detail.subject_id} className="px-3 py-2 flex items-center justify-between">
                                <div>
                                  <span className="font-mono font-semibold">{detail.subject_code}</span>
                                  <span className="text-muted-foreground ml-2">{detail.subject_name}</span>
                                </div>
                                <Badge variant="secondary" className="text-xs">
                                  {detail.combination_count} session{detail.combination_count !== 1 ? 's' : ''} combined
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Existing timetable warning */}
                    {preFlightResults.existing_timetable.exists && (
                      <Alert className="bg-amber-50 border-amber-200">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-800">
                          <strong>Existing timetable found ({preFlightResults.existing_timetable.slots_count} slots)</strong>
                          <br />
                          {preFlightResults.existing_timetable.can_regenerate ? (
                            <span>Regeneration allowed (within 2 weeks of term start). Existing slots will be deleted.</span>
                          ) : (
                            <span className="text-red-600 font-semibold">
                              Cannot regenerate: More than 2 weeks since term start ({preFlightResults.existing_timetable.days_since_term_start} days)
                            </span>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Errors */}
                    {preFlightResults.errors.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Errors ({preFlightResults.errors.length}):</strong>
                          <ul className="list-disc list-inside mt-1 text-sm space-y-1">
                            {preFlightResults.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                          </ul>

                          {/* Subjects without trainer expandable */}
                          {preFlightResults.subjects.without_trainer > 0 &&
                            preFlightResults.subjects.details_without_trainer.length > 0 && (
                              <Collapsible
                                open={showSubjectsWithoutTrainer}
                                onOpenChange={setShowSubjectsWithoutTrainer}
                                className="mt-3"
                              >
                                <CollapsibleTrigger asChild>
                                  <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <BookOpen className="h-3 w-3" />
                                      View Subjects Without Trainer
                                    </span>
                                    {showSubjectsWithoutTrainer ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="mt-2">
                                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                                    <table className="w-full text-xs">
                                      <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                          <th className="px-2 py-1 text-left font-semibold">Subject</th>
                                          <th className="px-2 py-1 text-left font-semibold">Class</th>
                                          <th className="px-2 py-1 text-left font-semibold">Dept</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y">
                                        {preFlightResults.subjects.details_without_trainer.map((subj) => (
                                          <tr key={subj.id} className="hover:bg-gray-50">
                                            <td className="px-2 py-1">
                                              <div className="font-mono font-semibold">{subj.subject_code}</div>
                                              <div className="text-gray-600">{subj.subject_name}</div>
                                            </td>
                                            <td className="px-2 py-1">
                                              <div className="font-mono">{subj.class_code}</div>
                                              <div className="text-gray-600">{subj.class_name}</div>
                                            </td>
                                            <td className="px-2 py-1">
                                              <Badge variant="outline" className="text-xs">{subj.department}</Badge>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <p className="text-xs text-gray-600 italic mt-1">
                                    💡 Assign trainers to these subjects before generating the timetable.
                                  </p>
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Warnings */}
                    {preFlightResults.warnings.length > 0 && (
                      <Alert className="bg-yellow-50 border-yellow-200">
                        <Info className="h-4 w-4 text-yellow-600" />
                        <AlertDescription className="text-yellow-800">
                          <strong>Warnings ({preFlightResults.warnings.length}):</strong>
                          <ul className="list-disc list-inside mt-1 text-sm">
                            {preFlightResults.warnings.map((warn, idx) => <li key={idx}>{warn}</li>)}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button
                      onClick={runPreFlightChecks}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={isCheckingPreFlight}
                    >
                      Re-run Checks
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Deadline block */}
            {!canGenerate && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{deadlineMessage}</AlertDescription>
              </Alert>
            )}

            {/* Manual entry */}
            {method === 'manual' && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-3">
                  Click &quot;Continue&quot; to close this dialog and add slots manually using the &quot;Add Slot&quot; button.
                </p>
                <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full">
                  Continue to Manual Entry
                </Button>
              </div>
            )}

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Action buttons */}
            {method === 'auto' && showPreFlight && (
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAutoGenerate}
                  disabled={isGenerating || !selectedTerm || !canGenerate || !preFlightResults?.passed}
                >
                  {isGenerating ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating 3 Options...</>
                  ) : (
                    <><Zap className="mr-2 h-4 w-4" />Generate 3 Options</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Draft Selection Dialog */}
      <DraftSelectionDialog
        open={isDraftDialogOpen}
        onOpenChange={setIsDraftDialogOpen}
        drafts={generatedDrafts}
        termName={draftTermName}
        termId={draftTermId ?? undefined}
        onConfirm={handleConfirmDraft}
        onDiscard={handleDiscardDrafts}
      />
    </>
  );
}