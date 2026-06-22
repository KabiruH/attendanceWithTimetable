'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Combine, X, ChevronDown,
  CheckCircle2, Loader2, Search,
} from "lucide-react";
import { TimetableSlot } from "@/lib/types/timetable";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  selectedTerm: number | null;
  slot?: TimetableSlot;
  currentUser?: { id: number; role: string; has_timetable_admin?: boolean };
  allSlots?: TimetableSlot[];
}

interface ClassOption { id: number; name: string; code: string; department: string }
interface SubjectOption { id: number; name: string; code: string; department: string; credit_hours: number | null }
interface TrainerOption { id: number; name: string }
interface RoomOption { id: number; name: string; room_type?: string }
interface PeriodOption { id: number; name: string; start_time_formatted: string; end_time_formatted: string }
interface CombinedEntry { class_id: number; class_code: string; class_name: string }

interface ComboOption { id: number | string; label: string; sublabel?: string }

const DAYS: ComboOption[] = [
  { id: '1', label: 'Monday' },
  { id: '2', label: 'Tuesday' },
  { id: '3', label: 'Wednesday' },
  { id: '4', label: 'Thursday' },
  { id: '5', label: 'Friday' },
];

// ─── ComboInput ───────────────────────────────────────────────────────────────

interface ComboInputProps {
  id?: string;
  label: string;
  placeholder?: string;
  options: ComboOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
}

function ComboInput({
  id, label, placeholder = 'Type to search…',
  options, value, onChange,
  disabled = false, loading = false,
}: ComboInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id.toString() === value);

  useEffect(() => {
    if (selectedOption) {
      setQuery(selectedOption.label);
    } else if (!value) {
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, selectedOption?.label, options.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (selectedOption) setQuery(selectedOption.label);
        else setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedOption]);

  const filtered = query.trim() === ''
    ? options
    : options.filter(o =>
      o.label.toLowerCase().includes(query.toLowerCase()) ||
      o.sublabel?.toLowerCase().includes(query.toLowerCase())
    );

  const handleSelect = (opt: ComboOption) => {
    onChange(opt.id.toString());
    setQuery(opt.label);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          id={id}
          value={query}
          disabled={disabled || loading}
          placeholder={loading ? 'Loading…' : placeholder}
          className="pl-8 pr-8"
          autoComplete="off"
          onChange={e => {
            setQuery(e.target.value);
            onChange('');
            setOpen(true);
            setTouched(true);
          }}
          onFocus={() => { setOpen(true); setTouched(true); }}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />}
          {!loading && query && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={handleClear}
              className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {!loading && !query && (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          )}
        </div>
      </div>

      {open && !disabled && !loading && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-xs text-muted-foreground text-center">
              {touched && query ? `No results for "${query}"` : 'No options available'}
            </li>
          ) : (
            filtered.map(opt => (
              <li key={opt.id}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleSelect(opt)}
                  className={`w-full flex flex-col px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors
                    ${opt.id.toString() === value ? 'bg-muted/40 font-medium' : ''}`}
                >
                  <span>{opt.label}</span>
                  {opt.sublabel && (
                    <span className="text-xs text-muted-foreground">{opt.sublabel}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreateSlotDialog({
  open, onOpenChange, onSuccess, selectedTerm, slot, currentUser = { id: 0, role: 'admin' }, allSlots = [],
}: CreateSlotDialogProps) {
  const isEditMode = !!slot;
const canEditTrainer = currentUser.role === 'admin' || currentUser.has_timetable_admin === true;

  // ── Form ──────────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    class_id: '', subject_id: '', employee_id: '',
    room_id: '', lesson_period_id: '', day_of_week: '',
  });

  const pendingSubjectId = useRef<string>('');

  // ── Combine ───────────────────────────────────────────────────────────────
  const [combineEnabled, setCombineEnabled] = useState(false);
  const [combinedEntries, setCombinedEntries] = useState<CombinedEntry[]>([]);
  // Cache of classId → subjects fetched for that class (used for eligible lookup)
  const [classSubjectsCache, setClassSubjectsCache] = useState<Map<number, SubjectOption[]>>(new Map());
  // True while we're batch-fetching subjects for all picker classes
  const [loadingEligible, setLoadingEligible] = useState(false);

  // ── Options ───────────────────────────────────────────────────────────────
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [allClasses, setAllClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);

  // ── Status ────────────────────────────────────────────────────────────────
  const [loadingInit, setLoadingInit] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── ComboOption arrays ────────────────────────────────────────────────────
  const classOptions: ComboOption[] = classes.map(c => ({
    id: c.id, label: `${c.code} — ${c.name}`, sublabel: c.department,
  }));
  const subjectOptions: ComboOption[] = subjects.map(s => ({
    id: s.id, label: `${s.code} — ${s.name}`,
    sublabel: s.credit_hours ? `${s.credit_hours}h · ${s.department}` : s.department,
  }));
  const trainerOptions: ComboOption[] = trainers.map(t => ({ id: t.id, label: t.name }));
  const dayAndPeriodSelected = !!formData.day_of_week && !!formData.lesson_period_id;

const filteredRoomOptions: ComboOption[] = !dayAndPeriodSelected ? [] : rooms
  .filter(r => {
    if (r.room_type === 'workshop') return true;
    const isOccupied = allSlots.some(s =>
      s.room_id === r.id &&
      s.day_of_week.toString() === formData.day_of_week &&
      s.lesson_period_id.toString() === formData.lesson_period_id &&
      (isEditMode ? s.id !== slot!.id : true)
    );
    return !isOccupied;
  })
  .map(r => {
    if (r.room_type === 'workshop') {
      const occupancyCount = allSlots.filter(s =>
        s.room_id === r.id &&
        s.day_of_week.toString() === formData.day_of_week &&
        s.lesson_period_id.toString() === formData.lesson_period_id &&
        (isEditMode ? s.id !== slot!.id : true)
      ).length;
      return {
        id: r.id,
        label: r.name,
        sublabel: occupancyCount > 0
          ? `Workshop · ${occupancyCount} subject${occupancyCount !== 1 ? 's' : ''} in this slot`
          : 'Workshop · available',
      };
    }
    return { id: r.id, label: r.name };
  });
 
  const periodOptions: ComboOption[] = periods.map(p => ({
    id: p.id, label: p.name,
    sublabel: `${p.start_time_formatted} – ${p.end_time_formatted}`,
  }));

  // ── Eligible classes for combining ────────────────────────────────────────
  // A class is eligible if:
  //   1. It's not the primary class
  //   2. It's not already in combinedEntries
  //   3. Its cached subjects include the currently selected subject
  const eligibleClasses: ClassOption[] = combineEnabled && formData.subject_id
    ? allClasses.filter(c => {
        if (c.id.toString() === formData.class_id) return false;
        if (combinedEntries.find(e => e.class_id === c.id)) return false;
        const cached = classSubjectsCache.get(c.id);
        if (!cached) return false; // not yet loaded — excluded until cache populates
        return cached.some(s => s.id.toString() === formData.subject_id);
      })
    : [];

  // ── Pre-fill on edit ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (isEditMode && slot) {
      pendingSubjectId.current = slot.subject_id.toString();
      setFormData({
        class_id: slot.class_id.toString(),
        subject_id: slot.subject_id.toString(),
        employee_id: slot.employee_id.toString(),
        room_id: slot.room_id.toString(),
        lesson_period_id: slot.lesson_period_id.toString(),
        day_of_week: slot.day_of_week.toString(),
      });
      if (slot.timetableslotclasses?.length) {
        setCombineEnabled(true);
        setCombinedEntries(
          slot.timetableslotclasses.map(c => ({
            class_id: c.class_id,
            class_code: c.classes?.code ?? '',
            class_name: c.classes?.name ?? '',
          }))
        );
      }
    } else {
      resetForm();
    }
  }, [open, isEditMode, slot]);

  useEffect(() => { if (open && selectedTerm) fetchOptions(); }, [open, selectedTerm]);

  // ── When class changes, fetch its subjects ────────────────────────────────
  useEffect(() => {
    if (formData.class_id && selectedTerm) {
      fetchSubjectsForClass(parseInt(formData.class_id), true);
    } else {
      setSubjects([]);
      setFormData(p => ({ ...p, subject_id: '' }));
    }
    if (!pendingSubjectId.current) {
      setCombinedEntries([]);
    }
  }, [formData.class_id]);

  useEffect(() => {
    if (!isEditMode) {
      setCombinedEntries([]);
      setClassSubjectsCache(new Map());
    }
  }, [formData.subject_id]);

  // ── Batch-fetch subjects for all picker classes when combine opens ─────────
  // Fires when combineEnabled turns on (or subject_id is set in edit mode after
  // combineEnabled is already true). Fetches only uncached classes in parallel,
  // then eligibleClasses derivation above does the filtering automatically.
  useEffect(() => {
    if (!combineEnabled || !formData.subject_id || !allClasses.length || !selectedTerm) return;

    const uncached = allClasses.filter(
      c => c.id.toString() !== formData.class_id && !classSubjectsCache.has(c.id)
    );
    if (uncached.length === 0) return; // everything already cached

    setLoadingEligible(true);
    Promise.all(uncached.map(c => fetchSubjectsForClass(c.id, false)))
      .finally(() => setLoadingEligible(false));
  // allClasses.length used instead of allClasses reference to avoid re-runs on
  // every render while keeping sensitivity to the list actually populating.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combineEnabled, formData.subject_id, allClasses.length]);

  // ─────────────────────────────────────────────────────────────────────────

  const fetchOptions = useCallback(async () => {
    if (!selectedTerm) return;
    setLoadingInit(true);
    try {
      const [tcRes, acRes, trRes, rmRes, prRes] = await Promise.all([
        fetch(`/api/terms/${selectedTerm}/classes`),
        fetch('/api/classes?active_only=true'),
        fetch('/api/users?role=employee&is_active=true'),
        fetch('/api/rooms?is_active=true'),
        fetch('/api/lesson-periods?is_active=true'),
      ]);
      const [tcData, acData, trData, rmData, prData] = await Promise.all([
        tcRes.json(), acRes.json(), trRes.json(), rmRes.json(), prRes.json(),
      ]);

      const toArray = (val: any): any[] =>
        Array.isArray(val?.data) ? val.data
          : Array.isArray(val) ? val
            : [];

      setClasses(toArray(tcData));
      setAllClasses(toArray(acData));
      setTrainers(toArray(trData));
setRooms(toArray(rmData).map((r: any) => ({ id: r.id, name: r.name, room_type: r.room_type })));
      setPeriods(toArray(prData));
    } catch {
      setError('Failed to load form options');
    } finally {
      setLoadingInit(false);
    }
  }, [selectedTerm]);

  // fetchSubjectsForClass: isPrimary=true → populates subjects dropdown
  //                        isPrimary=false → populates classSubjectsCache for eligibility check
  const fetchSubjectsForClass = async (classId: number, isPrimary = false) => {
    if (!selectedTerm) return;
    if (isPrimary) setLoadingSubjects(true);
    // Skip if already cached (only for non-primary; primary always re-fetches on class change)
    if (!isPrimary && classSubjectsCache.has(classId)) return;

    try {
      const res = await fetch(`/api/admin/classes/${classId}/subjects?term_id=${selectedTerm}`);
      const data = await res.json();
      const parsed: SubjectOption[] = res.ok
        ? data.map((i: any) => i.subject || i.subjects || i).filter(Boolean)
        : [];

      if (isPrimary) {
        setSubjects(parsed);
        // Restore pending subject_id after async subject load (edit mode)
        if (pendingSubjectId.current) {
          const subjectIdToRestore = pendingSubjectId.current;
          pendingSubjectId.current = '';
          setTimeout(() => {
            setFormData(prev => ({ ...prev, subject_id: subjectIdToRestore }));
          }, 0);
        }
      } else {
        setClassSubjectsCache(p => new Map(p).set(classId, parsed));
      }
    } catch {
      if (isPrimary) setSubjects([]);
    } finally {
      if (isPrimary) setLoadingSubjects(false);
    }
  };

  const addCombinedEntry = (cls: ClassOption) => {
    if (!combinedEntries.find(e => e.class_id === cls.id))
      setCombinedEntries(p => [...p, { class_id: cls.id, class_code: cls.code, class_name: cls.name }]);
  };

  const removeCombinedEntry = (classId: number) =>
    setCombinedEntries(p => p.filter(e => e.class_id !== classId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { class_id, subject_id, employee_id, room_id, lesson_period_id, day_of_week } = formData;
    if (!class_id || !subject_id || !employee_id || !room_id || !lesson_period_id || !day_of_week) {
      setError('Please fill in all required fields');
      return;
    }
    if (!selectedTerm) { setError('No term selected'); return; }
    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {
        term_id: selectedTerm,
        class_id: parseInt(class_id),
        subject_id: parseInt(subject_id),
        employee_id: parseInt(employee_id),
        room_id: parseInt(room_id),
        lesson_period_id: parseInt(lesson_period_id),
        day_of_week: parseInt(day_of_week),
      };
      if (combineEnabled && combinedEntries.length > 0)
        payload.combined_class_ids = combinedEntries.map(e => e.class_id);

      const res = await fetch(
        isEditMode ? `/api/timetable/${slot!.id}` : '/api/timetable',
        {
          method: isEditMode ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || 'Failed to save slot');
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save slot');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ class_id: '', subject_id: '', employee_id: '', room_id: '', lesson_period_id: '', day_of_week: '' });
    setSubjects([]);
    setCombineEnabled(false);
    setCombinedEntries([]);
    setClassSubjectsCache(new Map());
    setError('');
    pendingSubjectId.current = '';
  };

  const selectedSubject = subjects.find(s => s.id.toString() === formData.subject_id);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Timetable Slot' : 'Add Timetable Slot'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Class */}
          <div className="space-y-1.5">
            <Label htmlFor="f-class">Class *</Label>
            <ComboInput
              id="f-class" label="Class"
              placeholder="Type class name or code…"
              options={classOptions} value={formData.class_id}
              onChange={v => setFormData({ ...formData, class_id: v, subject_id: '' })}
              loading={loadingInit}
            />
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="f-subject" className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Subject *
            </Label>
            <ComboInput
              id="f-subject" label="Subject"
              placeholder={!formData.class_id ? 'Select a class first' : 'Type subject name or code…'}
              options={subjectOptions} value={formData.subject_id}
              onChange={v => setFormData({ ...formData, subject_id: v })}
              disabled={!formData.class_id}
              loading={loadingSubjects}
            />
            {selectedSubject && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-0.5">
                <p><span className="font-medium">Subject:</span> {selectedSubject.name}</p>
                <p><span className="font-medium">Department:</span> {selectedSubject.department}</p>
                {selectedSubject.credit_hours && (
                  <p><span className="font-medium">Credit hours:</span> {selectedSubject.credit_hours}h</p>
                )}
              </div>
            )}
          </div>

{/* Trainer */}
<div className="space-y-1.5">
  <Label htmlFor="f-trainer">Trainer *</Label>
  {canEditTrainer ? (
    <ComboInput
      id="f-trainer" label="Trainer"
      placeholder="Type trainer name…"
      options={trainerOptions} value={formData.employee_id}
      onChange={v => setFormData({ ...formData, employee_id: v })}
      loading={loadingInit}
    />
  ) : (
    <div className="flex items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {loadingInit
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <span>{trainers.find(t => t.id.toString() === formData.employee_id)?.name ?? '—'}</span>
      }
    </div>
  )}
</div>
          {/* Day + Period */}
<div className="grid grid-cols-2 gap-3">
  <div className="space-y-1.5">
    <Label htmlFor="f-day">Day *</Label>
    <ComboInput
      id="f-day" label="Day" placeholder="e.g. Monday…"
      options={DAYS} value={formData.day_of_week}
      onChange={v => setFormData({ ...formData, day_of_week: v, room_id: '' })}
    />
  </div>
  <div className="space-y-1.5">
    <Label htmlFor="f-period">Period *</Label>
    <ComboInput
      id="f-period" label="Period" placeholder="Type session name…"
      options={periodOptions} value={formData.lesson_period_id}
      onChange={v => setFormData({ ...formData, lesson_period_id: v, room_id: '' })}
      loading={loadingInit}
    />
  </div>
</div>

{/* Room */}
<div className="space-y-1.5">
  <Label htmlFor="f-room">Room *</Label>
  <ComboInput
    id="f-room" label="Room"
    placeholder={!dayAndPeriodSelected ? 'Select a day and period first' : 'Type room name…'}
    options={filteredRoomOptions}
    value={formData.room_id}
    onChange={v => setFormData({ ...formData, room_id: v })}
    loading={loadingInit}
    disabled={!dayAndPeriodSelected}
  />
  {!dayAndPeriodSelected && (
    <p className="text-xs text-muted-foreground">Select a day and period to see available rooms</p>
  )}
  {dayAndPeriodSelected && filteredRoomOptions.length === 0 && !loadingInit && (
    <p className="text-xs text-destructive">No rooms available at this day and period</p>
  )}
</div>

          {/* Combine */}
          <div className="rounded-lg border overflow-hidden">
            <button
              type="button"
              disabled={!formData.subject_id}
              onClick={() => {
                setCombineEnabled(e => !e);
                if (combineEnabled) {
                  setCombinedEntries([]);
                  setClassSubjectsCache(new Map());
                }
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <Combine className="h-4 w-4 text-indigo-600" />
                Combine with another class
                {combinedEntries.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{combinedEntries.length} combined</Badge>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {!formData.subject_id ? 'Select a subject first'
                  : combineEnabled ? 'Click to disable' : 'Same subject, same slot'}
              </span>
            </button>

            {combineEnabled && formData.subject_id && (
              <div className="border-t bg-white">

                {/* Already-combined badges */}
                {combinedEntries.length > 0 && (
                  <div className="px-4 pt-3 flex flex-wrap gap-1.5">
                    {combinedEntries.map(entry => (
                      <div key={entry.class_id}
                        className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-full pl-2.5 pr-1.5 py-0.5 text-xs"
                      >
                        <CheckCircle2 className="h-3 w-3 text-indigo-500 shrink-0" />
                        <span className="font-mono font-semibold text-indigo-800">{entry.class_code}</span>
                        <span className="text-indigo-500 max-w-[120px] truncate">{entry.class_name}</span>
                        <button type="button" onClick={() => removeCombinedEntry(entry.class_id)}
                          className="ml-0.5 text-indigo-400 hover:text-red-500 rounded-full hover:bg-red-50 p-0.5 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Eligible classes list */}
                <div className="px-4 pb-4 pt-3">
                  {loadingEligible ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-6">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Finding classes that teach {selectedSubject?.name}…
                    </div>
                  ) : eligibleClasses.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      No other classes teach <span className="font-medium text-foreground">{selectedSubject?.name}</span> this term
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">
                        Classes below also teach{' '}
                        <span className="font-medium text-foreground">{selectedSubject?.name}</span>{' '}
                        this term:
                      </p>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto">
                        {eligibleClasses.map(cls => (
                          <div key={cls.id}
                            className="flex items-center justify-between rounded-lg border bg-white px-3 py-2.5 hover:bg-muted/10 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs font-semibold shrink-0">{cls.code}</span>
                              <span className="text-xs text-muted-foreground truncate">{cls.name}</span>
                              {cls.department && (
                                <span className="text-xs text-muted-foreground/50 shrink-0 hidden sm:inline">{cls.department}</span>
                              )}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className="h-6 text-xs px-2.5 shrink-0 ml-2"
                              onClick={() => addCombinedEntry(cls)}
                            >
                              + Add
                            </Button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" disabled={isSubmitting}
              onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || loadingInit}>
              {isSubmitting
                ? (isEditMode ? 'Saving…' : 'Creating…')
                : (isEditMode ? 'Save Changes' : 'Create Slot')}
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}