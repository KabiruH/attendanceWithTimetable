// components/timetable/GenerateTimetableDialog.tsx
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
import { Zap, Upload, Loader2, AlertTriangle, CheckCircle2, Info, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
import { format } from 'date-fns';

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
    list: Array<{
      id: number;
      name: string;
      code: string;
      department: string;
    }>;
  };
  subjects: {
    total: number;
    with_trainer: number;
    without_trainer: number;
    details_without_trainer: SubjectWithoutTrainer[];
  };
  trainers: {
    total: number;
    list: Array<{
      id: number;
      name: string;
      subjects_count: number;
    }>;
  };
  rooms: {
    active: number;
  };
  lesson_periods: {
    active: number;
  };
  existing_timetable: {
    exists: boolean;
    slots_count: number;
    can_regenerate: boolean;
    days_since_term_start: number;
  };
  errors: string[];
  warnings: string[];
  error_details?: any;
}

export default function GenerateTimetableDialog({
  open,
  onOpenChange,
  onSuccess,
  terms
}: GenerateTimetableDialogProps) {
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [method, setMethod] = useState<'auto' | 'manual'>('auto');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-generation settings
  const [sessionsPerWeek, setSessionsPerWeek] = useState(1);
  const [minClassesPerDay, setMinClassesPerDay] = useState(3);
  
  // Pre-flight check state
  const [isCheckingPreFlight, setIsCheckingPreFlight] = useState(false);
  const [preFlightResults, setPreFlightResults] = useState<PreFlightCheckResult | null>(null);
  const [showPreFlight, setShowPreFlight] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [canGenerate, setCanGenerate] = useState(true);
const [deadlineMessage, setDeadlineMessage] = useState('');

  // Collapsible states for error details
  const [showSubjectsWithoutTrainer, setShowSubjectsWithoutTrainer] = useState(false);

  const handleTermChange = (termId: string) => {
    setSelectedTerm(termId);
    setPreFlightResults(null);
    setShowPreFlight(false);
    setError('');
    setSuccess('');
    setShowSubjectsWithoutTrainer(false);
  };

  const runPreFlightChecks = async () => {
    if (!selectedTerm) {
      setError('Please select a term');
      return;
    }

    setIsCheckingPreFlight(true);
    setError('');
    setPreFlightResults(null);

    try {
      const response = await fetch(`/api/timetable/generate/pre-flight?term_id=${selectedTerm}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Pre-flight checks failed');
      }

      setPreFlightResults(data);
      setShowPreFlight(true);
    } catch (error) {
      console.error('Error running pre-flight checks:', error);
      setError(error instanceof Error ? error.message : 'Failed to run pre-flight checks');
    } finally {
      setIsCheckingPreFlight(false);
    }
  };

  const handleAutoGenerate = async () => {
    if (!selectedTerm || !preFlightResults) return;

    // Check if there are blocking errors
    if (!preFlightResults.passed) {
      setError('Cannot generate timetable. Please fix the errors listed above.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/timetable/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          term_id: parseInt(selectedTerm),
          sessions_per_week: sessionsPerWeek,
          min_classes_per_day: minClassesPerDay,
          regenerate: preFlightResults.existing_timetable.exists,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate timetable');
      }

      setSuccess(
        `Successfully generated timetable! Created ${data.stats.slots_created} slots for ${data.stats.subjects_scheduled} subjects.`
      );
      
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
        resetForm();
      }, 2000);
    } catch (error) {
      console.error('Generation error:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate timetable');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
  if (open) {
    checkGenerationDeadline();
  }
}, [open]);

const checkGenerationDeadline = async () => {
  try {
    const response = await fetch('/api/timetable-settings');
    if (!response.ok) throw new Error('Failed to fetch settings');
    const data = await response.json();
    
    if (data.data?.generation_deadline_enabled && data.data?.timetable_generation_deadline) {
      const deadline = new Date(data.data.timetable_generation_deadline);
      const now = new Date();
      
      if (now < deadline) {
        setCanGenerate(false);
        setDeadlineMessage(
          `Timetable generation is blocked until ${format(deadline, 'PPP')}. ` +
          `This allows trainers to complete their class and subject selections.`
        );
      } else {
        setCanGenerate(true);
        setDeadlineMessage('');
      }
    } else {
      setCanGenerate(true);
      setDeadlineMessage('');
    }
  } catch (error) {
    console.error('Error checking deadline:', error);
    setCanGenerate(true); // Allow generation if check fails
  }
};

  const handleManualRedirect = () => {
    onOpenChange(false);
  };

  const resetForm = () => {
    setSelectedTerm('');
    setMethod('auto');
    setSessionsPerWeek(1);
    setMinClassesPerDay(3);
    setError('');
    setSuccess('');
    setPreFlightResults(null);
    setShowPreFlight(false);
    setShowSubjectsWithoutTrainer(false);
  };

  const allowGenerate = preFlightResults?.passed && !isGenerating;

  return (
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
                  <Label htmlFor="sessionsPerWeek">Sessions per Week</Label>
                  <Input
                    id="sessionsPerWeek"
                    type="number"
                    min="1"
                    max="5"
                    value={sessionsPerWeek}
                    onChange={(e) => setSessionsPerWeek(parseInt(e.target.value) || 1)}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    How many times each subject meets per week (1-5)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minClassesPerDay">Minimum Subjects per Trainer/Day</Label>
                  <Input
                    id="minClassesPerDay"
                    type="number"
                    min="1"
                    max="8"
                    value={minClassesPerDay}
                    onChange={(e) => setMinClassesPerDay(parseInt(e.target.value) || 3)}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    Minimum number of subjects a trainer should teach per day (Mon-Fri)
                  </p>
                </div>
              </div>

              {/* Pre-flight Check Button */}
              {selectedTerm && !showPreFlight && (
                <Button
                  onClick={runPreFlightChecks}
                  disabled={isCheckingPreFlight}
                  variant="outline"
                  className="w-full"
                >
                  {isCheckingPreFlight ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Checks...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Run Pre-Flight Tests
                    </>
                  )}
                </Button>
              )}

              {/* Pre-flight Results */}
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

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Classes</p>
                      <p className="font-semibold">{preFlightResults.classes.total} in term</p>
                    </div>
                    <div>
                      <p className="text-gray-500 flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        Subjects
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
                    <div className="col-span-2">
                      <p className="text-gray-500">Lesson Periods</p>
                      <p className="font-semibold">{preFlightResults.lesson_periods.active}</p>
                    </div>
                  </div>

                  {/* Existing Timetable Warning */}
                  {preFlightResults.existing_timetable.exists && (
                    <Alert className="bg-amber-50 border-amber-200">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-800">
                        <strong>Existing timetable found ({preFlightResults.existing_timetable.slots_count} slots)</strong>
                        <br />
                        {preFlightResults.existing_timetable.can_regenerate ? (
                          <span>
                            Regeneration allowed (within 2 weeks of term start). 
                            Existing slots will be deleted.
                          </span>
                        ) : (
                          <span className="text-red-600 font-semibold">
                            Cannot regenerate: More than 2 weeks since term start 
                            ({preFlightResults.existing_timetable.days_since_term_start} days)
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Errors with Details */}
                  {preFlightResults.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Errors ({preFlightResults.errors.length}):</strong>
                        <ul className="list-disc list-inside mt-1 text-sm space-y-1">
                          {preFlightResults.errors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>

                        {/* Expandable Subjects Without Trainer */}
                        {preFlightResults.subjects.without_trainer > 0 && 
                         preFlightResults.subjects.details_without_trainer.length > 0 && (
                          <Collapsible
                            open={showSubjectsWithoutTrainer}
                            onOpenChange={setShowSubjectsWithoutTrainer}
                            className="mt-3"
                          >
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full justify-between text-xs"
                              >
                                <span className="flex items-center gap-1">
                                  <BookOpen className="h-3 w-3" />
                                  View Subjects Without Trainer
                                </span>
                                {showSubjectsWithoutTrainer ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-2">
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
                                          <div className="flex flex-col">
                                            <span className="font-mono font-semibold">{subj.subject_code}</span>
                                            <span className="text-gray-600">{subj.subject_name}</span>
                                          </div>
                                        </td>
                                        <td className="px-2 py-1">
                                          <div className="flex flex-col">
                                            <span className="font-mono">{subj.class_code}</span>
                                            <span className="text-gray-600">{subj.class_name}</span>
                                          </div>
                                        </td>
                                        <td className="px-2 py-1">
                                          <Badge variant="outline" className="text-xs">
                                            {subj.department}
                                          </Badge>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <p className="text-xs text-gray-600 italic">
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
                          {preFlightResults.warnings.map((warn, idx) => (
                            <li key={idx}>{warn}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Re-run button */}
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

          {!canGenerate && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>{deadlineMessage}</AlertDescription>
  </Alert>
)}

          {/* Manual Entry Section */}
          {method === 'manual' && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-3">
                Click &quot;Continue&quot; to close this dialog and add slots manually using the &quot;Add Slot&quot; button.
              </p>
              <Button
                onClick={handleManualRedirect}
                variant="outline"
                className="w-full"
              >
                Continue to Manual Entry
              </Button>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          {method === 'auto' && showPreFlight && (
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAutoGenerate}
                disabled={isGenerating || !selectedTerm || !canGenerate}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Generate Timetable
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}