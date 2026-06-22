'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  MapPin,
  User,
  Clock,
  BookOpen,
  Wifi,
  Building,
  Link2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  session_group_id?: string;
  combined_class_ids?: number[];
}

interface DraftStats {
  slots_created: number;
  trainer_assignments_processed: number;
  assignments_fully_scheduled: number;
  trainers_assigned: number;
  rooms_used: number;
  subjects_scheduled: number;
  assignments_partially_scheduled: number;
}

interface Draft {
  draft_id: number;
  draft_number: number;
  stats: DraftStats;
  skipped_count: number;
  skipped_assignments?: any[];
  slots?: SlotData[];
}

interface LookupMaps {
  subjects: Map<number, { name: string; code: string; department: string }>;
  classes: Map<number, { name: string; code: string }>;
  rooms: Map<number, { name: string }>;
  trainers: Map<number, { name: string }>;
  periods: Map<number, { name: string; start_time: string; end_time: string }>;
}

interface DraftTimetablePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: Draft[];
  initialDraftIndex?: number;
  lookupMaps: LookupMaps;
  onSelectDraft: (draftId: number) => void;
  selectedDraftId: number | null;
  termName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: { label: string; short: string; value: number }[] = [
  { label: 'Monday',    short: 'Mon', value: 1 },
  { label: 'Tuesday',   short: 'Tue', value: 2 },
  { label: 'Wednesday', short: 'Wed', value: 3 },
  { label: 'Thursday',  short: 'Thu', value: 4 },
  { label: 'Friday',    short: 'Fri', value: 5 },
];

const OPTION_COLORS = [
  { accent: '#3b82f6', light: '#eff6ff', border: '#bfdbfe', badge: 'bg-blue-600',    label: 'Option A' },
  { accent: '#7c3aed', light: '#f5f3ff', border: '#ddd6fe', badge: 'bg-violet-600',  label: 'Option B' },
  { accent: '#059669', light: '#ecfdf5', border: '#a7f3d0', badge: 'bg-emerald-600', label: 'Option C' },
];

// Session group color palette — each unique group_id gets a consistent color
const GROUP_COLORS = [
  { accent: '#7c3aed', light: '#f5f3ff', border: '#c4b5fd', text: '#5b21b6' },
  { accent: '#0891b2', light: '#ecfeff', border: '#a5f3fc', text: '#0e7490' },
  { accent: '#d97706', light: '#fffbeb', border: '#fcd34d', text: '#b45309' },
  { accent: '#059669', light: '#ecfdf5', border: '#6ee7b7', text: '#047857' },
  { accent: '#dc2626', light: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
  { accent: '#db2777', light: '#fdf2f8', border: '#f9a8d4', text: '#be185d' },
  { accent: '#65a30d', light: '#f7fee7', border: '#bef264', text: '#4d7c0f' },
  { accent: '#ea580c', light: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
];

function formatTime(timeStr: string) {
  try {
    return new Date(timeStr).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return timeStr;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DraftTimetablePreview({
  open,
  onOpenChange,
  drafts,
  initialDraftIndex = 0,
  lookupMaps,
  onSelectDraft,
  selectedDraftId,
  termName,
}: DraftTimetablePreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialDraftIndex);

  useEffect(() => {
    setCurrentIndex(initialDraftIndex);
  }, [initialDraftIndex, open]);

  const draft = drafts[currentIndex];
  const color = OPTION_COLORS[currentIndex] ?? OPTION_COLORS[0];
  const slots: SlotData[] = draft?.slots ?? [];

  // ── Build sorted period list ──────────────────────────────────────────────
  const periods = Array.from(lookupMaps.periods.entries())
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // ── Assign colors to session groups ──────────────────────────────────────
  const groupColorMap = useMemo(() => {
    const map = new Map<string, typeof GROUP_COLORS[0]>();
    let idx = 0;
    slots.forEach(slot => {
      if (slot.session_group_id && !map.has(slot.session_group_id)) {
        map.set(slot.session_group_id, GROUP_COLORS[idx++ % GROUP_COLORS.length]);
      }
    });
    return map;
  }, [slots]);

  // ── Identify continuation slot IDs ───────────────────────────────────────
  const continuationSlotIds = useMemo(() => {
    const cont = new Set<string>();
    const grouped = new Map<string, SlotData[]>();

    slots.forEach(slot => {
      if (!slot.session_group_id) return;
      const key = `${slot.day_of_week}-${slot.session_group_id}-${slot.class_id}`;
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    });

    grouped.forEach(group => {
      const sorted = [...group].sort((a, b) => {
        const pa = periods.find(p => p.id === a.lesson_period_id);
        const pb = periods.find(p => p.id === b.lesson_period_id);
        if (!pa || !pb) return 0;
        return new Date(pa.start_time).getTime() - new Date(pb.start_time).getTime();
      });
      sorted.slice(1).forEach(s => cont.add(s.id));
    });
    return cont;
  }, [slots, periods]);

  // ── Index slots by day+period ─────────────────────────────────────────────
  const slotIndex = useMemo(() => {
    const index = new Map<string, SlotData[]>();
    slots.forEach(slot => {
      const key = `${slot.day_of_week}-${slot.lesson_period_id}`;
      index.set(key, [...(index.get(key) ?? []), slot]);
    });
    return index;
  }, [slots]);

  const getSlots = (day: number, periodId: number) =>
    slotIndex.get(`${day}-${periodId}`) ?? [];

  const navigate = useCallback((dir: 'prev' | 'next') => {
    setCurrentIndex(i =>
      dir === 'next' ? Math.min(i + 1, drafts.length - 1) : Math.max(i - 1, 0)
    );
  }, [drafts.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') navigate('next');
      if (e.key === 'ArrowLeft') navigate('prev');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, navigate]);

  if (!draft) return null;

  const isSelected = selectedDraftId === draft.draft_id;
  const coveragePercent = draft.stats.trainer_assignments_processed > 0
    ? Math.min(100, Math.round(
        (draft.stats.assignments_fully_scheduled / draft.stats.trainer_assignments_processed) * 100
      ))
    : 100;

  // ── Render a primary slot card ────────────────────────────────────────────
  const renderSlotCard = (slot: SlotData) => {
    const subject  = lookupMaps.subjects.get(slot.subject_id);
    const cls      = lookupMaps.classes.get(slot.class_id);
    const room     = lookupMaps.rooms.get(slot.room_id);
    const trainer  = lookupMaps.trainers.get(slot.employee_id);

    const gc = slot.session_group_id ? groupColorMap.get(slot.session_group_id) : null;

    const groupSpan = slot.session_group_id
      ? slots.filter(s =>
          s.session_group_id === slot.session_group_id &&
          s.day_of_week === slot.day_of_week &&
          s.class_id === slot.class_id
        ).length
      : 1;

    const cardStyle: React.CSSProperties = gc
      ? { background: gc.light, borderLeft: `3px solid ${gc.accent}` }
      : { background: '#ffffff', borderLeft: '3px solid #e5e7eb' };

    return (
      <div
        key={slot.id}
        className="rounded-md border border-gray-200 px-2 py-1.5 text-xs flex flex-col gap-1"
        style={cardStyle}
      >
        {/* Top: code + badges */}
        <div className="flex items-start justify-between gap-1">
          <span className="font-mono font-bold text-[12px] text-gray-900 leading-tight">
            {subject?.code ?? `SUB-${slot.subject_id}`}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {groupSpan > 1 && gc && (
              <span
                className="inline-flex items-center gap-0.5 rounded text-[9px] font-bold px-1 py-0.5 text-white leading-none"
                style={{ background: gc.accent }}
              >
                <Link2 className="h-2 w-2" />
                {groupSpan === 2 ? 'DBL' : 'TRP'}
              </span>
            )}
            {slot.is_online_session && (
              <span className="inline-flex items-center gap-0.5 rounded text-[9px] font-bold px-1 py-0.5 bg-sky-500 text-white leading-none">
                <Wifi className="h-2 w-2" />
              </span>
            )}
          </div>
        </div>

        {/* Subject name */}
        <div className="text-[11px] text-gray-700 font-medium leading-tight line-clamp-2">
          {subject?.name ?? '—'}
        </div>

        {/* Class */}
        <div className="flex items-center gap-1 text-[11px] text-gray-600">
          <BookOpen className="h-2.5 w-2.5 shrink-0 text-gray-400" />
          <span
            className="font-mono font-semibold text-[10px] px-1 py-0.5 rounded"
            style={gc
              ? { background: gc.light, color: gc.text, border: `1px solid ${gc.border}` }
              : { background: '#f3f4f6', color: '#374151' }
            }
          >
            {cls?.code ?? '—'}
          </span>
          <span className="truncate text-[10px] text-gray-500">{cls?.name ?? '—'}</span>
        </div>

        {/* Trainer */}
        <div className="flex items-center gap-1 text-[11px] text-gray-600">
          <User className="h-2.5 w-2.5 shrink-0 text-gray-400" />
          <span className="truncate">{trainer?.name ?? '—'}</span>
        </div>

        {/* Room */}
        <div className="flex items-center gap-1 text-[11px] text-gray-600">
          <MapPin className="h-2.5 w-2.5 shrink-0 text-gray-400" />
          <span className="truncate">{room?.name ?? '—'}</span>
        </div>
      </div>
    );
  };

  // ── Render a continuation cell ────────────────────────────────────────────
  const renderContinuationCell = (slot: SlotData) => {
    const subject = lookupMaps.subjects.get(slot.subject_id);
    const gc = slot.session_group_id ? groupColorMap.get(slot.session_group_id) : null;

    return (
      <div
        key={slot.id}
        className="rounded-md border border-dashed px-2 py-2 flex items-center gap-2 text-[11px] min-h-[56px]"
        style={{
          background: gc?.light ?? '#f9fafb',
          borderColor: gc?.border ?? '#d1d5db',
          color: gc?.text ?? '#6b7280',
        }}
      >
        <Link2 className="h-3 w-3 shrink-0 opacity-50" />
        <div>
          <div className="font-mono font-bold text-[11px]">
            {subject?.code ?? '—'}
          </div>
          <div className="text-[10px] opacity-60 italic">continues…</div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-full h-[92vh] flex flex-col p-0 gap-0 overflow-hidden"
        style={{ borderTop: `4px solid ${color.accent}` }}
      >
        {/* ── Header ── */}
        <DialogHeader className="px-6 py-4 border-b shrink-0 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge className={`${color.badge} text-white px-3 py-1 text-sm`}>
                {color.label}
              </Badge>
              <DialogTitle className="text-lg font-semibold text-gray-800">
                Full Timetable Preview — {termName}
              </DialogTitle>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => navigate('prev')}
                disabled={currentIndex === 0}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex gap-1.5">
                {drafts.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    className="h-2.5 w-2.5 rounded-full transition-all bg-gray-300 hover:bg-gray-400"
                    style={i === currentIndex
                      ? { backgroundColor: color.accent, transform: 'scale(1.25)' }
                      : {}}
                  />
                ))}
              </div>
              <Button
                variant="outline" size="sm"
                onClick={() => navigate('next')}
                disabled={currentIndex === drafts.length - 1}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-5 mt-2 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              <strong className="text-gray-700">{draft.stats.slots_created}</strong> slots
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <strong className="text-gray-700">{draft.stats.trainers_assigned}</strong> trainers
            </span>
            <span className="flex items-center gap-1">
              <Building className="h-3 w-3" />
              <strong className="text-gray-700">{draft.stats.rooms_used}</strong> rooms
            </span>
            <span className="flex items-center gap-1">
              Coverage:
              <strong className={
                coveragePercent === 100 ? 'text-emerald-600'
                : coveragePercent >= 80 ? 'text-amber-600'
                : 'text-red-500'
              }>
                {coveragePercent}%
              </strong>
            </span>
            {draft.skipped_count > 0 && (
              <span className="text-amber-600">⚠ {draft.skipped_count} partially scheduled</span>
            )}
            <span className="flex items-center gap-1 text-gray-400">
              <Link2 className="h-3 w-3" />
              DBL/TRP = double/triple block
            </span>
            <span className="ml-auto text-gray-400 italic hidden sm:block">← → arrow keys to navigate</span>
          </div>
        </DialogHeader>

        {/* ── Timetable Grid ── */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {periods.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              No periods found in this draft.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full border-collapse text-sm bg-white" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="w-[130px] px-3 py-3 text-left font-semibold text-xs tracking-wide text-gray-300 border-r border-gray-700">
                      Period
                    </th>
                    {DAYS.map(day => (
                      <th
                        key={day.value}
                        className="px-3 py-3 text-center font-semibold text-sm border-r border-gray-700 last:border-r-0"
                      >
                        {day.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {periods.map((period, pIdx) => (
                    <tr key={period.id} className={pIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                      {/* Period label */}
                      <td className="px-3 py-2 border-r border-b border-gray-200 align-top bg-gray-50">
                        <div className="font-semibold text-xs text-gray-800">{period.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          {formatTime(period.start_time)}
                          <span className="text-gray-400">–</span>
                          {formatTime(period.end_time)}
                        </div>
                      </td>

                      {/* Day cells */}
                      {DAYS.map(day => {
                        const cellSlots = getSlots(day.value, period.id);

                        return (
                          <td
                            key={`${day.value}-${period.id}`}
                            className="px-1.5 py-1.5 border-r border-b border-gray-200 last:border-r-0 align-top"
                            style={{ minWidth: 160, verticalAlign: 'top' }}
                          >
                            {cellSlots.length === 0 ? (
                              <div className="min-h-[64px] flex items-center justify-center text-[11px] text-gray-300">
                                —
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {cellSlots.map(slot =>
                                  continuationSlotIds.has(slot.id)
                                    ? renderContinuationCell(slot)
                                    : renderSlotCard(slot)
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t bg-white shrink-0 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-500">
            Viewing <strong style={{ color: color.accent }}>{color.label}</strong> of {drafts.length} options
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close Preview
            </Button>
            <Button
              onClick={() => { onSelectDraft(draft.draft_id); onOpenChange(false); }}
              className={isSelected ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              style={!isSelected ? { backgroundColor: color.accent } : {}}
            >
              {isSelected ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Selected</>
              ) : (
                <>Select {color.label}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}