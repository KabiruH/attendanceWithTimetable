// app/(dashboard)/timetable/subject-scheduling/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Filter, BookOpen, Users, AlertTriangle, RefreshCw, ChevronDown, X, Plus, Trash2, RotateCcw, Combine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';


// ── Types ─────────────────────────────────────────────────────────────────────

interface Assignment {
  id: number;
  trainer_id: number;
  trainer_name: string;
  trainer_department: string | null;
  class_subject_id: number;
  class_id: number;
  class_name: string;
  class_code: string;
  class_department: string;
  sessions_per_week: number;
  lesson_type: string;
  is_override: boolean;
}

interface SubjectRow {
  id: number;
  name: string;
  code: string;
  department: string;
  classification: string;
  default_sessions_per_week: number;
  default_lesson_type: string;
  can_be_online: boolean;
  assignments: Assignment[];
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface Combination {
  id: number;
  session_number: number;
  primary_assignment_id: number;
  primary_trainer: string;
  primary_class: string;
  primary_class_code: string;
  combined_assignment_id: number;
  combined_trainer: string;
  combined_class: string;
  combined_class_code: string;
}

interface CombinationsData {
  subject_id: number;
  combinations: Record<number, Combination[]>;
  total: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LESSON_TYPE_OPTIONS = ['single', 'double', 'triple'];
const SESSION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const classificationColor: Record<string, string> = {
  basic: 'bg-blue-100 text-blue-700 border-blue-200',
  common: 'bg-purple-100 text-purple-700 border-purple-200',
  core: 'bg-orange-100 text-orange-700 border-orange-200',
};

const lessonTypeColor: Record<string, string> = {
  single: 'bg-gray-100 text-gray-700',
  double: 'bg-teal-100 text-teal-700',
  triple: 'bg-indigo-100 text-indigo-700',
};

// ── Combine Classes Modal ─────────────────────────────────────────────────────

// ── Combine Classes Modal (drop-in replacement) ───────────────────────────────
// Supports combining 2–N classes per session (no hard upper limit).
// Schema: still writes one subjectcombinations row per (primary, combined) pair,
// so the existing API and DB schema are unchanged.
// The UI groups them visually into a "session group" so the timetabler sees
// e.g. "Session 2: ARCH-A + ARCH-B + CIVIL-A" as one unit.

function CombineClassesModal({
  subject,
  onClose,
}: {
  subject: SubjectRow;
  onClose: () => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [combinations, setCombinations] = useState<CombinationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New group builder state
  const [selectedSession, setSelectedSession] = useState(1);
  // The set of assignment IDs chosen to form a new group
  const [groupSelections, setGroupSelections] = useState<Set<string>>(new Set());
  const [applyToAllSessions, setApplyToAllSessions] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [assignRes, comboRes] = await Promise.all([
        fetch(`/api/subjects/subject-scheduling/${subject.id}/assignments`),
        fetch(`/api/subjects/subject-scheduling/${subject.id}/combinations`),
      ]);
      if (assignRes.ok) {
        const data = await assignRes.json();
        setAssignments(data.assignments || []);
      }
      if (comboRes.ok) {
        const data = await comboRes.json();
        setCombinations(data);
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [subject.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived: build session groups from existing combinations ─────────────
  // Each session may have multiple (primary, combined) pairs. We reconstruct
  // the full group of class codes involved in each session.
  const sessionGroups = useMemo(() => {
    if (!combinations) return {};
    const result: Record<number, { ids: Set<number>; combos: Combination[] }> = {};
    const flat = Object.values(combinations.combinations).flat();
    flat.forEach(combo => {
      const sn = combo.session_number;
      if (!result[sn]) result[sn] = { ids: new Set(), combos: [] };
      result[sn].ids.add(combo.primary_assignment_id);
      result[sn].ids.add(combo.combined_assignment_id);
      result[sn].combos.push(combo);
    });
    return result;
  }, [combinations]);

  // ── Assignment lookup map ─────────────────────────────────────────────────
  const assignmentMap = useMemo(
    () => new Map(assignments.map(a => [a.id, a])),
    [assignments]
  );

  // ── Toggle a class in the group builder ──────────────────────────────────
  const toggleGroupMember = (id: string) => {
    setGroupSelections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Save new group ────────────────────────────────────────────────────────
  // The first selected assignment becomes the primary; the rest are combined.
  // We write one DB row per (primary, combined) pair.
  const handleSaveGroup = async () => {
    const ids = Array.from(groupSelections).map(Number);
    if (ids.length < 2) {
      toast.error('Select at least 2 classes to combine');
      return;
    }
    setSaving(true);
    const [primaryId, ...restIds] = ids;

    // If applyToAllSessions, create rows for every session number
    const sessionsToCreate = applyToAllSessions
      ? Array.from({ length: maxSessions }, (_, i) => i + 1)
      : [selectedSession];

    try {
      const results = await Promise.all(
        sessionsToCreate.flatMap(sessionNum =>
          restIds.map(combinedId =>
            fetch(`/api/subjects/subject-scheduling/${subject.id}/combinations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_number: sessionNum,
                primary_assignment_id: primaryId,
                combined_assignment_id: combinedId,
              }),
            }).then(r => r.json())
          )
        )
      );
      const anyError = results.find(r => r.error);
      if (anyError) {
        toast.error(anyError.error || 'Some combinations failed to save');
      } else {
        toast.success(
          applyToAllSessions
            ? `All ${maxSessions} sessions combined (${ids.length} classes)`
            : `Session ${selectedSession} group saved (${ids.length} classes)`
        );
        setGroupSelections(new Set());
        await fetchData();
      }
    } catch {
      toast.error('Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  // ── Remove an entire session group ────────────────────────────────────────
  const handleRemoveGroup = async (sessionNum: number) => {
    const group = sessionGroups[sessionNum];
    if (!group) return;
    setSaving(true);
    try {
      await Promise.all(
        group.combos.map(combo =>
          fetch(`/api/subjects/subject-scheduling/${subject.id}/combinations`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ combination_id: combo.id }),
          })
        )
      );
      toast.success(`Session ${sessionNum} combination removed`);
      await fetchData();
    } catch {
      toast.error('Failed to remove group');
    } finally {
      setSaving(false);
    }
  };

  // ── Remove a single class from a group ────────────────────────────────────
  // Removes all combo rows that reference this assignment in this session
  const handleRemoveFromGroup = async (sessionNum: number, assignmentId: number) => {
    const group = sessionGroups[sessionNum];
    if (!group) return;
    const rowsToDelete = group.combos.filter(
      c =>
        c.primary_assignment_id === assignmentId ||
        c.combined_assignment_id === assignmentId
    );
    if (rowsToDelete.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        rowsToDelete.map(combo =>
          fetch(`/api/subjects/subject-scheduling/${subject.id}/combinations`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ combination_id: combo.id }),
          })
        )
      );
      toast.success('Class removed from group');
      await fetchData();
    } catch {
      toast.error('Failed to remove class from group');
    } finally {
      setSaving(false);
    }
  };

  const maxSessions = subject.default_sessions_per_week;

  // Sessions that already have a group
  const configuredSessions = new Set(Object.keys(sessionGroups).map(Number));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Combine className="h-5 w-5 text-indigo-600" />
            Combine Classes — {subject.name}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{subject.code}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            {subject.default_sessions_per_week} session
            {subject.default_sessions_per_week > 1 ? 's' : ''} per week
            <span className="mx-2 text-muted-foreground">·</span>
            {subject.default_lesson_type}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : assignments.length < 2 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This subject needs at least 2 class assignments to create combinations.
              Currently assigned to {assignments.length} class
              {assignments.length !== 1 ? 'es' : ''}.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-5 pt-1">

            {/* ── All assignments reference chip row ── */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Assigned Classes This Term ({assignments.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {assignments.map(a => (
                  <div
                    key={a.id}
                    className="flex items-center gap-1.5 bg-white border rounded-md px-2.5 py-1 text-sm"
                  >
                    <span className="font-medium font-mono text-xs">{a.class_code}</span>
                    <span className="text-muted-foreground text-xs">· {a.trainer_name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Existing session groups ── */}
            {Object.keys(sessionGroups).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Configured Session Groups</p>
                <div className="rounded-lg border divide-y">
                  {Array.from({ length: maxSessions }, (_, i) => i + 1).map(sessionNum => {
                    const group = sessionGroups[sessionNum];
                    if (!group) return null;
                    const memberIds = Array.from(group.ids);
                    return (
                      <div key={sessionNum} className="p-3">
                        {/* Session header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Session {sessionNum}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveGroup(sessionNum)}
                            disabled={saving}
                            className="h-6 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove all
                          </Button>
                        </div>

                        {/* Member chips — each removable individually */}
                        <div className="flex flex-wrap gap-2 items-center">
                          {memberIds.map((assignId, idx) => {
                            const a = assignmentMap.get(assignId);
                            if (!a) return null;
                            return (
                              <>
                                {idx > 0 && (
                                  <span key={`plus-${assignId}`} className="text-muted-foreground text-sm font-medium">+</span>
                                )}
                                <div
                                  key={assignId}
                                  className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-full pl-2.5 pr-1 py-0.5 text-xs"
                                >
                                  <span className="font-mono font-semibold text-indigo-800">
                                    {a.class_code}
                                  </span>
                                  <span className="text-indigo-500">· {a.trainer_name}</span>
                                  {memberIds.length > 2 && (
                                    <button
                                      onClick={() => handleRemoveFromGroup(sessionNum, assignId)}
                                      disabled={saving}
                                      className="ml-1 text-indigo-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50 p-0.5"
                                      title={`Remove ${a.class_code} from this group`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </>
                            );
                          })}

                          {/* Inline add more to this session */}
                          <AddToGroupButton
                            sessionNum={sessionNum}
                            assignments={assignments}
                            existingIds={group.ids}
                            subjectId={subject.id}
                            onAdded={fetchData}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Build new group ── */}
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-600" />
                Create New Session Group
              </p>
              <p className="text-xs text-muted-foreground">
                Pick a session number, then tick the classes that should share that slot. You can combine 2 or more.
              </p>

              {/* Session selector */}
              {/* Apply to all sessions toggle */}
              <div className="flex items-center gap-2 rounded-md bg-muted/40 border px-3 py-2">
                <input
                  type="checkbox"
                  id="apply-all-sessions"
                  checked={applyToAllSessions}
                  onChange={e => setApplyToAllSessions(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                <label htmlFor="apply-all-sessions" className="text-xs font-medium cursor-pointer flex-1">
                  Apply to all {maxSessions} sessions
                  <span className="text-muted-foreground font-normal ml-1">
                    (recommended — combines these classes for every session of this subject)
                  </span>
                </label>
              </div>

              {/* Session selector — only shown when not applying to all */}
              {!applyToAllSessions && (
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    Session #
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {Array.from({ length: maxSessions }, (_, i) => i + 1).map(n => (
                      <button
                        key={n}
                        onClick={() => {
                          setSelectedSession(n);
                          setGroupSelections(new Set());
                        }}
                        className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors border
            ${selectedSession === n
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : configuredSessions.has(n)
                              ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                              : 'bg-white text-muted-foreground border-border hover:border-indigo-300'
                          }`}
                        title={configuredSessions.has(n) ? `Session ${n} already has a group` : `Session ${n}`}
                      >
                        {n}
                        {configuredSessions.has(n) && (
                          <span className="sr-only">(configured)</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {configuredSessions.has(selectedSession) && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Session {selectedSession} already has a group. Adding more will extend it.
                    </span>
                  )}
                </div>
              )}

              {/* Class checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {assignments.map(a => {
                  const checked = groupSelections.has(a.id.toString());
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleGroupMember(a.id.toString())}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all
                        ${checked
                          ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                          : 'border-border bg-white hover:border-indigo-200 hover:bg-muted/20'
                        }`}
                    >
                      {/* Checkbox indicator */}
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                        ${checked ? 'border-indigo-600 bg-indigo-600' : 'border-muted-foreground/40'}`}
                      >
                        {checked && (
                          <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-white">
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold">{a.class_code}</span>
                          <span className="text-xs text-muted-foreground truncate">{a.class_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{a.trainer_name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selection summary */}
              {groupSelections.size > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-700">
                  <Combine className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>{groupSelections.size} classes</strong> selected for Session {selectedSession}:&nbsp;
                    {Array.from(groupSelections)
                      .map(id => assignments.find(a => a.id.toString() === id)?.class_code)
                      .filter(Boolean)
                      .join(' + ')}
                  </span>
                  <button
                    onClick={() => setGroupSelections(new Set())}
                    className="ml-auto text-indigo-400 hover:text-indigo-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              <Button
                onClick={handleSaveGroup}
                disabled={saving || groupSelections.size < 2}
                size="sm"
                className="w-full"
              >
                {saving ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-2" />
                )}
                {saving
                  ? 'Saving...'
                  : groupSelections.size < 2
                    ? 'Select at least 2 classes'
                    : applyToAllSessions
                      ? `Combine ${groupSelections.size} classes for all ${maxSessions} sessions`
                      : `Combine ${groupSelections.size} classes for Session ${selectedSession}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Inline "Add more classes" button inside an existing group ─────────────────

function AddToGroupButton({
  sessionNum,
  assignments,
  existingIds,
  subjectId,
  onAdded,
  disabled,
}: {
  sessionNum: number;
  assignments: Assignment[];
  existingIds: Set<number>;
  subjectId: number;
  onAdded: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const available = assignments.filter(a => !existingIds.has(a.id));
  if (available.length === 0) return null;

  // The primary is the lowest-id in existing group (convention)
  const primaryId = Math.min(...Array.from(existingIds));

  const handleAdd = async (combinedId: number) => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/subjects/subject-scheduling/${subjectId}/combinations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_number: sessionNum,
            primary_assignment_id: primaryId,
            combined_assignment_id: combinedId,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to add class');
      } else {
        toast.success('Class added to group');
        setOpen(false);
        onAdded();
      }
    } catch {
      toast.error('Failed to add class');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled || saving}
        className="flex items-center gap-1 border border-dashed border-indigo-300 rounded-full px-2.5 py-0.5 text-xs text-indigo-500 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Add class
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-50 bg-white rounded-lg border shadow-lg p-1 min-w-[200px]">
          {available.map(a => (
            <button
              key={a.id}
              onClick={() => handleAdd(a.id)}
              disabled={saving}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md hover:bg-indigo-50 text-left"
            >
              <span className="font-mono font-semibold">{a.class_code}</span>
              <span className="text-muted-foreground truncate">{a.trainer_name}</span>
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="w-full text-center text-xs text-muted-foreground py-1 hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Assignment Override Row ───────────────────────────────────────────────────

function AssignmentOverrideRow({
  assignment,
  subjectId,
  defaultSessions,
  defaultLessonType,
  onUpdated,
}: {
  assignment: Assignment;
  subjectId: number;
  defaultSessions: number;
  defaultLessonType: string;
  onUpdated: () => void;
}) {
  const [sessions, setSessions] = useState(assignment.sessions_per_week);
  const [lessonType, setLessonType] = useState(assignment.lesson_type);
  const [saving, setSaving] = useState(false);

  const isDirty =
    sessions !== assignment.sessions_per_week ||
    lessonType !== assignment.lesson_type;

  const isOverride = assignment.is_override;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/subjects/subject-scheduling/${subjectId}/assignments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: assignment.id,
          sessions_per_week: sessions,
          lesson_type: lessonType,
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to save');
        return;
      }
      toast.success('Override saved');
      onUpdated();
    } catch {
      toast.error('Failed to save override');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/subjects/subject-scheduling/${subjectId}/assignments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: assignment.id,
          reset_to_default: true,
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to reset');
        return;
      }
      setSessions(defaultSessions);
      setLessonType(defaultLessonType);
      toast.success('Reset to subject defaults');
      onUpdated();
    } catch {
      toast.error('Failed to reset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-md text-sm ${isOverride ? 'bg-amber-50 border border-amber-200' : 'bg-muted/30'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-medium">{assignment.class_code}</span>
          <span className="text-muted-foreground text-xs truncate">{assignment.class_name}</span>
          <span className="text-muted-foreground text-xs">· {assignment.trainer_name}</span>
          {isOverride && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 h-4">
              Override
            </Badge>
          )}
        </div>
      </div>

      {/* Sessions */}
      <Select value={sessions.toString()} onValueChange={v => setSessions(parseInt(v))}>
        <SelectTrigger className="h-7 w-16 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SESSION_OPTIONS.map(n => (
            <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Lesson type */}
      <Select value={lessonType} onValueChange={setLessonType}>
        <SelectTrigger className="h-7 w-24 text-xs capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LESSON_TYPE_OPTIONS.map(t => (
            <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isDirty && (
        <Button size="sm" className="h-7 text-xs px-2" onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Save'}
        </Button>
      )}

      {isOverride && !isDirty && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs px-2 text-amber-600 hover:text-amber-700"
          onClick={handleReset}
          disabled={saving}
          title="Reset to subject defaults"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// ── Subject Row ───────────────────────────────────────────────────────────────

function SubjectTableRow({
  subject,
  onRefresh,
}: {
  subject: SubjectRow;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState(subject.default_sessions_per_week);
  const [lessonType, setLessonType] = useState(subject.default_lesson_type);
  const [saving, setSaving] = useState(false);
  const [showCombineModal, setShowCombineModal] = useState(false);

  const isDirty =
    sessions !== subject.default_sessions_per_week ||
    lessonType !== subject.default_lesson_type;

  const combinableCount = subject.assignments.length;

  const handleSaveDefaults = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/subjects/subject-scheduling', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_id: subject.id,
          sessions_per_week: sessions,
          lesson_type: lessonType,
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to save');
        return;
      }
      toast.success(`${subject.name} defaults updated`);
      onRefresh();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        {/* Main row */}
        <div className="flex items-center gap-3 p-3 bg-white hover:bg-muted/20 transition-colors">

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>

          {/* Subject info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{subject.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{subject.code}</span>
              <Badge variant="outline" className={`text-xs capitalize ${classificationColor[subject.classification] || ''}`}>
                {subject.classification}
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {subject.department}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {subject.assignments.length} assignment{subject.assignments.length !== 1 ? 's' : ''}
              </span>
              {subject.assignments.some(a => a.is_override) && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 h-4">
                  Has overrides
                </Badge>
              )}
            </div>
          </div>

          {/* Sessions per week */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <span className="text-xs text-muted-foreground">Sessions/wk</span>
            <Select value={sessions.toString()} onValueChange={v => setSessions(parseInt(v))}>
              <SelectTrigger className="h-8 w-16 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_OPTIONS.map(n => (
                  <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lesson type */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <span className="text-xs text-muted-foreground">Lesson Type</span>
            <Select value={lessonType} onValueChange={setLessonType}>
              <SelectTrigger className="h-8 w-24 text-sm capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LESSON_TYPE_OPTIONS.map(t => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Combine classes */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCombineModal(true)}
            disabled={combinableCount < 2}
            className="h-8 text-xs shrink-0 gap-1.5"
            title={combinableCount < 2 ? 'Needs at least 2 class assignments to combine' : 'Manage class combinations'}
          >
            <Combine className="h-3.5 w-3.5" />
            Combine
            {combinableCount >= 2 && (
              <Badge variant="secondary" className="h-4 text-xs px-1 ml-0.5">
                {combinableCount}
              </Badge>
            )}
          </Button>

          {/* Save button */}
          {isDirty && (
            <Button size="sm" className="h-8 text-xs shrink-0" onClick={handleSaveDefaults} disabled={saving}>
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          )}
        </div>

        {/* Expanded: per-assignment overrides */}
        {expanded && (
          <div className="border-t bg-muted/10 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Per-Assignment Overrides
            </p>
            {subject.assignments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active assignments.</p>
            ) : (
              subject.assignments.map(a => (
                <AssignmentOverrideRow
                  key={a.id}
                  assignment={a}
                  subjectId={subject.id}
                  defaultSessions={sessions}
                  defaultLessonType={lessonType}
                  onUpdated={onRefresh}
                />
              ))
            )}
          </div>
        )}
      </div>

      {showCombineModal && (
        <CombineClassesModal
          subject={{ ...subject, default_sessions_per_week: sessions, default_lesson_type: lessonType }}
          onClose={() => setShowCombineModal(false)}
        />
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SubjectSchedulingPage() {
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/subjects/subject-scheduling');
      if (res.status === 403) {
        setError('You do not have permission to access this page.');
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load data');
        return;
      }
      const data = await res.json();
      setTerm(data.term);
      setSubjects(data.subjects || []);
    } catch {
      setError('Network error. Failed to load subject scheduling data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived data
  const departments = Array.from(new Set(subjects.map(s => s.department))).sort();

  const filtered = subjects.filter(s => {
    const matchesSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase());
    const matchesDept = departmentFilter === 'all' || s.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading subject scheduling...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-indigo-600" />
            Subject Scheduling Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure sessions per week, lesson types, and class combinations for each subject.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 shrink-0">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Term banner */}
      {term && (
        <div className="flex items-center gap-3 rounded-lg border bg-indigo-50 px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-sm font-medium text-indigo-800">
            Current Term: {term.name}
          </span>
          <span className="text-xs text-indigo-600">
            {new Date(term.start_date).toLocaleDateString()} — {new Date(term.end_date).toLocaleDateString()}
          </span>
          <span className="ml-auto text-xs text-indigo-600 font-medium">
            {subjects.length} subject{subjects.length !== 1 ? 's' : ''} with active assignments
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Lesson types:</span>
        {LESSON_TYPE_OPTIONS.map(t => (
          <span key={t} className={`px-2 py-0.5 rounded-full capitalize font-medium ${lessonTypeColor[t]}`}>{t}</span>
        ))}
        <span className="mx-2 text-border">|</span>
        <span className="font-medium">Classification:</span>
        {Object.entries(classificationColor).map(([k, v]) => (
          <span key={k} className={`px-2 py-0.5 rounded-full capitalize font-medium border ${v}`}>{k}</span>
        ))}
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(search || departmentFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setDepartmentFilter('all'); }}
            className="text-muted-foreground h-9"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Results count */}
      {(search || departmentFilter !== 'all') && (
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {subjects.length} subjects
        </p>
      )}

      {/* Subject list */}
      {subjects.length === 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No subjects have active assignments in the current term. Assign trainers to subjects first via the Trainer Assignments page.
          </AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No subjects match your search.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(subject => (
            <SubjectTableRow
              key={subject.id}
              subject={subject}
              onRefresh={fetchData}
            />
          ))}
        </div>
      )}
    </div>
  );
}