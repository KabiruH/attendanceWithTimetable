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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Users,
  BookOpen,
  DoorOpen,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Zap,
  Trash2,
  Expand,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import DraftTimetablePreview from './DraftTimetablePreview';

interface DraftStats {
  slots_created: number;
  trainer_assignments_processed: number;
  assignments_fully_scheduled: number;
  trainers_assigned: number;
  rooms_used: number;
  subjects_scheduled: number;
  assignments_partially_scheduled: number;
}

interface SkippedAssignment {
  trainer_assignment_id: number;
  subject_code: string;
  subject_name: string;
  class_code: string;
  trainer_name: string;
  scheduled: number;
  requested: number;
  reason: string;
}

interface SlotData {
  id: string;
  term_id: number;
  class_id: number;
  subject_id: number;
  employee_id: number;
  room_id: number;
  lesson_period_id: number;
  day_of_week: number;
  status: string;
  is_online_session: boolean;
}

interface Draft {
  draft_id: number;
  draft_number: number;
  stats: DraftStats;
  skipped_count: number;
  skipped_assignments?: SkippedAssignment[];
  slots?: SlotData[];
}

interface LookupMaps {
  subjects: Map<number, { name: string; code: string; department: string }>;
  classes: Map<number, { name: string; code: string }>;
  rooms: Map<number, { name: string }>;
  trainers: Map<number, { name: string }>;
  periods: Map<number, { name: string; start_time: string; end_time: string }>;
}

interface DraftSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts?: Draft[];
  termName: string;
  termId?: number;
  generatedAt?: string;
  generatedBy?: string;
  onConfirm: (draftId: number) => Promise<void>;
  onDiscard: () => Promise<void>;
}

const OPTION_LABELS = ['Option A', 'Option B', 'Option C'];
const OPTION_ACCENTS = [
  { border: 'border-blue-500', bg: 'bg-blue-50', badge: 'bg-blue-600', text: 'text-blue-700', selected: 'border-blue-600 ring-2 ring-blue-400 bg-blue-50/60' },
  { border: 'border-violet-500', bg: 'bg-violet-50', badge: 'bg-violet-600', text: 'text-violet-700', selected: 'border-violet-600 ring-2 ring-violet-400 bg-violet-50/60' },
  { border: 'border-emerald-500', bg: 'bg-emerald-50', badge: 'bg-emerald-600', text: 'text-emerald-700', selected: 'border-emerald-600 ring-2 ring-emerald-400 bg-emerald-50/60' },
];

export default function DraftSelectionDialog({
  open,
  onOpenChange,
  drafts: initialDrafts = [],
  termName,
  termId,
  generatedAt,
  generatedBy,
  onConfirm,
  onDiscard,
}: DraftSelectionDialogProps) {
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [error, setError] = useState('');
  const [expandedSkipped, setExpandedSkipped] = useState<Set<number>>(new Set());

  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewStartIndex, setPreviewStartIndex] = useState(0);
  const [lookupMaps, setLookupMaps] = useState<LookupMaps>({
    subjects: new Map(),
    classes: new Map(),
    rooms: new Map(),
    trainers: new Map(),
    periods: new Map(),
  });

  useEffect(() => {
    if (initialDrafts.length > 0) setDrafts(initialDrafts);
  }, [initialDrafts]);

  // Fetch full slots + lookup data when dialog opens
  useEffect(() => {
    if (!open) return;
    const tid = termId;
    if (!tid) return;
    fetchFullDrafts(tid);
  }, [open, termId]);

  const fetchFullDrafts = async (tid: number) => {
    setIsLoadingSlots(true);
    try {
      const res = await fetch(`/api/timetable/drafts?term_id=${tid}&include_slots=true`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.has_drafts) return;

      // Merge full slots into draft objects
      const slotsByDraftNumber = new Map<number, SlotData[]>();
      data.drafts.forEach((d: any) => {
        slotsByDraftNumber.set(d.draft_number, d.slots ?? []);
      });

      setDrafts(prev =>
        prev.map(draft => ({
          ...draft,
          slots: slotsByDraftNumber.get(draft.draft_number) ?? draft.slots ?? [],
        }))
      );

      // Build lookup maps from metadata returned by the API
      setLookupMaps({
        subjects: new Map((data.subjects ?? []).map((s: any) => [s.id, { name: s.name, code: s.code, department: s.department ?? '' }])),
        classes: new Map((data.classes ?? []).map((c: any) => [c.id, { name: c.name, code: c.code }])),
        rooms: new Map((data.rooms ?? []).map((r: any) => [r.id, { name: r.name }])),
        trainers: new Map((data.trainers ?? []).map((t: any) => [t.id, { name: t.name }])),
        periods: new Map((data.periods ?? []).map((p: any) => [p.id, { name: p.name, start_time: p.start_time, end_time: p.end_time }])),
      });
    } catch {
      // Fail silently — summary cards still work
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const toggleSkipped = (draftId: number) => {
    const next = new Set(expandedSkipped);
    next.has(draftId) ? next.delete(draftId) : next.add(draftId);
    setExpandedSkipped(next);
  };

  const handleConfirm = async () => {
    if (!selectedDraftId) return;
    setIsConfirming(true);
    setError('');
    try {
      await onConfirm(selectedDraftId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to confirm timetable');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDiscard = async () => {
    setIsDiscarding(true);
    setError('');
    try {
      await onDiscard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to discard drafts');
    } finally {
      setIsDiscarding(false);
    }
  };

  const bestDraftId = drafts.length > 0
    ? drafts.reduce((best, d) => d.stats.slots_created > best.stats.slots_created ? d : best, drafts[0]).draft_id
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[960px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Zap className="h-5 w-5 text-amber-500" />
              Select a Timetable Option
            </DialogTitle>
            <DialogDescription>
              3 draft timetables were generated for <strong>{termName}</strong>.
              Compare the summaries, or open <strong>View Full Timetable</strong> to inspect every slot before deciding.
              {generatedBy && (
                <span className="block mt-1 text-xs text-gray-500">
                  Generated by {generatedBy}
                  {generatedAt && ` on ${new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Draft summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {drafts.map((draft, i) => {
                const accent = OPTION_ACCENTS[i] ?? OPTION_ACCENTS[0];
                const isSelected = selectedDraftId === draft.draft_id;
                const isBest = draft.draft_id === bestDraftId && drafts.length > 1;
                const coveragePercent = draft.stats.trainer_assignments_processed > 0
                  ? Math.round((draft.stats.assignments_fully_scheduled / draft.stats.trainer_assignments_processed) * 100)
                  : 100;

                return (
                  <div
                    key={draft.draft_id}
                    onClick={() => setSelectedDraftId(draft.draft_id)}
                    className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 space-y-3
                      ${isSelected
                        ? accent.selected
                        : `bg-white ${accent.border} hover:shadow-md hover:scale-[1.01]`
                      }`}
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`${accent.badge} text-white text-xs px-2`}>
                          {OPTION_LABELS[i]}
                        </Badge>
                        {isBest && (
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 bg-amber-50">
                            ✦ Best
                          </Badge>
                        )}
                      </div>
                      {isSelected && <CheckCircle2 className={`h-5 w-5 ${accent.text}`} />}
                    </div>

                    <Separator />

                    {/* Stats */}
                    <div className="space-y-2 text-sm">
                      <StatRow icon={<CalendarCheck className="h-4 w-4 text-gray-500" />} label="Slots Created" value={<span className="font-bold text-base">{draft.stats.slots_created}</span>} />
                      <StatRow icon={<BookOpen className="h-4 w-4 text-gray-500" />} label="Subjects" value={draft.stats.subjects_scheduled} />
                      <StatRow icon={<Users className="h-4 w-4 text-gray-500" />} label="Trainers" value={draft.stats.trainers_assigned} />
                      <StatRow icon={<DoorOpen className="h-4 w-4 text-gray-500" />} label="Rooms Used" value={draft.stats.rooms_used} />

                      <div className="pt-1">
                     
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${coveragePercent === 100 ? 'bg-emerald-500' : coveragePercent >= 80 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${coveragePercent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Skipped */}
                    {draft.skipped_count > 0 && draft.skipped_assignments && (
                      <Collapsible open={expandedSkipped.has(draft.draft_id)} onOpenChange={() => toggleSkipped(draft.draft_id)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200" onClick={e => e.stopPropagation()}>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {draft.skipped_count} partially scheduled
                            {expandedSkipped.has(draft.draft_id) ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 max-h-36 overflow-y-auto border rounded-lg divide-y text-xs">
                            {draft.skipped_assignments.map(s => (
                              <div key={s.trainer_assignment_id} className="px-2 py-1.5">
                                <span className="font-mono font-semibold">{s.subject_code}</span>
                                <span className="text-gray-500 ml-1">({s.class_code})</span>
                                <div className="text-gray-400">{s.scheduled}/{s.requested} sessions — {s.trainer_name}</div>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {draft.skipped_count === 0 && (
                      <div className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-2 py-1.5 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        All assignments fully scheduled
                      </div>
                    )}

                    {/* View Full Timetable */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-1 text-xs gap-1.5 border-dashed"
                      onClick={e => { e.stopPropagation(); setPreviewStartIndex(i); setIsPreviewOpen(true); }}
                      disabled={isLoadingSlots}
                    >
                      {isLoadingSlots
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Expand className="h-3 w-3" />
                      }
                      {isLoadingSlots ? 'Loading slots...' : 'View Full Timetable'}
                    </Button>
                  </div>
                );
              })}
            </div>

            {!selectedDraftId && (
              <p className="text-center text-sm text-gray-500 italic">
                Click a card to select an option, or use "View Full Timetable" to inspect all slots before deciding
              </p>
            )}

            {selectedDraftId && (
              <Alert className="bg-blue-50 border-blue-200">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>{OPTION_LABELS[drafts.findIndex(d => d.draft_id === selectedDraftId)]}</strong> selected.
                  Click <strong>Confirm Timetable</strong> to activate it. The other 2 options will be discarded.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleDiscard} disabled={isDiscarding || isConfirming}>
                {isDiscarding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Discard & Regenerate
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming || isDiscarding}>
                  Close (decide later)
                </Button>
                <Button onClick={handleConfirm} disabled={!selectedDraftId || isConfirming || isDiscarding} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {isConfirming
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Confirming...</>
                    : <><CheckCircle2 className="h-4 w-4 mr-2" />Confirm Timetable</>
                  }
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full timetable preview — separate full-screen modal */}
      <DraftTimetablePreview
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        drafts={drafts}
        initialDraftIndex={previewStartIndex}
        lookupMaps={lookupMaps}
        onSelectDraft={draftId => setSelectedDraftId(draftId)}
        selectedDraftId={selectedDraftId}
        termName={termName}
      />
    </>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-gray-600">{icon}{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}