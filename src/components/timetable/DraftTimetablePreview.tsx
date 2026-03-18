'use client';
import { useState, useEffect, useCallback } from 'react';
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
  X,
  CheckCircle2,
  MapPin,
  User,
  Clock,
  BookOpen,
  Wifi,
  Building,
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

  // These are stored flat in the JSON — no Prisma includes
  // We reconstruct display info from the lookup maps below
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
  // The full slots array — passed in by parent who fetches it
  slots?: SlotData[];
}

// Lookup maps resolved from the slots themselves + metadata passed in
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

const DAYS: { label: string; value: number }[] = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
];

const OPTION_COLORS = [
  { accent: '#3b82f6', light: '#eff6ff', border: '#bfdbfe', badge: 'bg-blue-600', label: 'Option A' },
  { accent: '#7c3aed', light: '#f5f3ff', border: '#ddd6fe', badge: 'bg-violet-600', label: 'Option B' },
  { accent: '#059669', light: '#ecfdf5', border: '#a7f3d0', badge: 'bg-emerald-600', label: 'Option C' },
];

// Department colour palette — deterministic by dept name hash
const DEPT_COLORS = [
  'bg-sky-100 border-sky-300 text-sky-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-teal-100 border-teal-300 text-teal-800',
  'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
  'bg-lime-100 border-lime-300 text-lime-800',
];

function deptColor(dept: string) {
  let hash = 0;
  for (let i = 0; i < dept.length; i++) hash = (hash * 31 + dept.charCodeAt(i)) & 0xffffffff;
  return DEPT_COLORS[Math.abs(hash) % DEPT_COLORS.length];
}

function formatTime(timeStr: string) {
  try {
    return new Date(timeStr).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false
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

  // ── Build period list from slots ──────────────────────────────────────────
  const periods = Array.from(lookupMaps.periods.entries())
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // ── Index slots by day+period ─────────────────────────────────────────────
  const slotIndex = new Map<string, SlotData[]>();
  slots.forEach(slot => {
    const key = `${slot.day_of_week}-${slot.lesson_period_id}`;
    const existing = slotIndex.get(key) ?? [];
    slotIndex.set(key, [...existing, slot]);
  });

  const getSlots = (day: number, periodId: number) =>
    slotIndex.get(`${day}-${periodId}`) ?? [];

  const navigate = useCallback((dir: 'prev' | 'next') => {
    setCurrentIndex(i =>
      dir === 'next'
        ? Math.min(i + 1, drafts.length - 1)
        : Math.max(i - 1, 0)
    );
  }, [drafts.length]);

  // Keyboard navigation
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
    ? Math.round((draft.stats.assignments_fully_scheduled / draft.stats.trainer_assignments_processed) * 100)
    : 100;

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

            {/* Draft navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('prev')}
                disabled={currentIndex === 0}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Dot indicators */}
              <div className="flex gap-1.5">
                {drafts.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    className={`h-2.5 w-2.5 rounded-full transition-all ${
                      i === currentIndex
                        ? 'scale-125'
                        : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    style={i === currentIndex ? { backgroundColor: color.accent } : {}}
                  />
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('next')}
                disabled={currentIndex === drafts.length - 1}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-6 mt-2 text-xs text-gray-500 flex-wrap">
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
              <strong
                className={
                  coveragePercent === 100 ? 'text-emerald-600' :
                  coveragePercent >= 80 ? 'text-amber-600' : 'text-red-500'
                }
              >
                {coveragePercent}%
              </strong>
            </span>
            {draft.skipped_count > 0 && (
              <span className="text-amber-600">
                ⚠ {draft.skipped_count} partially scheduled
              </span>
            )}
            <span className="ml-auto text-gray-400 italic hidden sm:block">
              ← → arrow keys to navigate
            </span>
          </div>
        </DialogHeader>

        {/* ── Timetable Grid ── */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50">
          {periods.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              No periods found in this draft.
            </div>
          ) : (
            <div
              className="inline-grid gap-px bg-gray-200 rounded-lg overflow-hidden min-w-full border border-gray-200"
              style={{
                gridTemplateColumns: `180px repeat(${DAYS.length}, minmax(180px, 1fr))`,
              }}
            >
              {/* Corner cell */}
              <div className="bg-gray-800 p-3 flex items-center justify-center">
                <Clock className="h-4 w-4 text-gray-400" />
              </div>

              {/* Day headers */}
              {DAYS.map(day => (
                <div
                  key={day.value}
                  className="bg-gray-800 p-3 text-center"
                >
                  <div className="text-white font-semibold text-sm">{day.label}</div>
                </div>
              ))}

              {/* Period rows */}
              {periods.map(period => (
                <>
                  {/* Period label */}
                  <div
                    key={`period-${period.id}`}
                    className="bg-white p-3 flex flex-col justify-center border-r border-gray-200"
                  >
                    <div className="font-semibold text-sm text-gray-800">{period.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(period.start_time)} – {formatTime(period.end_time)}
                    </div>
                  </div>

                  {/* Day cells */}
                  {DAYS.map(day => {
                    const cellSlots = getSlots(day.value, period.id);

                    return (
                      <div
                        key={`${day.value}-${period.id}`}
                        className="bg-white p-1.5 min-h-[100px] flex flex-col gap-1"
                      >
                        {cellSlots.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center text-gray-300 text-xs border border-dashed border-gray-200 rounded-md">
                            Free
                          </div>
                        ) : (
                          cellSlots.map(slot => {
                            const subject = lookupMaps.subjects.get(slot.subject_id);
                            const cls = lookupMaps.classes.get(slot.class_id);
                            const room = lookupMaps.rooms.get(slot.room_id);
                            const trainer = lookupMaps.trainers.get(slot.employee_id);
                            const dept = subject?.department ?? '';
                            const colorClass = deptColor(dept);

                            return (
                              <div
                                key={slot.id}
                                className={`rounded-md border p-2 flex flex-col gap-1 text-xs ${colorClass}`}
                              >
                                {/* Subject code + online badge */}
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-bold font-mono text-[11px] leading-tight">
                                    {subject?.code ?? `SUB-${slot.subject_id}`}
                                  </span>
                                  {slot.is_online_session && (
                                    <span className="flex items-center gap-0.5 text-[9px] bg-blue-100 text-blue-700 border border-blue-200 rounded px-1 py-0.5 shrink-0">
                                      <Wifi className="h-2.5 w-2.5" />Online
                                    </span>
                                  )}
                                </div>

                                {/* Subject name */}
                                <div className="font-medium leading-tight line-clamp-2 text-[11px]">
                                  {subject?.name ?? '—'}
                                </div>

                                {/* Class */}
                                <div className="flex items-center gap-1 opacity-80">
                                  <BookOpen className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{cls?.code ?? '—'} · {cls?.name ?? '—'}</span>
                                </div>

                                {/* Trainer */}
                                <div className="flex items-center gap-1 opacity-80">
                                  <User className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{trainer?.name ?? '—'}</span>
                                </div>

                                {/* Room */}
                                <div className="flex items-center gap-1 opacity-80">
                                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{room?.name ?? '—'}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </>
              ))}
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
              onClick={() => {
                onSelectDraft(draft.draft_id);
                onOpenChange(false);
              }}
              className={`${isSelected ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
              style={!isSelected ? { backgroundColor: color.accent } : {}}
            >
              {isSelected ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Selected
                </>
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