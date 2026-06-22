'use client';
import { useState, useMemo } from 'react';
import { Clock, User, GripVertical, Link2, BookOpen, AlertTriangle, Home } from 'lucide-react';
import { TimetableSlot } from '@/lib/types/timetable';

// ─── NOTE: Add these two fields to your TimetableSlot type if not already present ───
// status?: string;           // 'scheduled' | 'NTA'
// is_room_fallback?: boolean; // true when placed in RNA due to no preferred room

interface TimetableGridProps {
  slots: TimetableSlot[];
  currentWeek: { start: Date; end: Date; weekNumber: number };
  onSlotMove?: (slotId: string, newDayOfWeek: number, newPeriodId: number) => void;
  onSlotClick: (slot: TimetableSlot) => void;
  isAdmin: boolean;
  userId: number;
}

const DAYS: { name: string; short: string; value: number }[] = [
  { name: 'Monday',    short: 'Mon', value: 1 },
  { name: 'Tuesday',   short: 'Tue', value: 2 },
  { name: 'Wednesday', short: 'Wed', value: 3 },
  { name: 'Thursday',  short: 'Thu', value: 4 },
  { name: 'Friday',    short: 'Fri', value: 5 },
];

const GROUP_COLORS = [
  { accent: '#7c3aed', light: '#f5f3ff', border: '#c4b5fd', text: '#5b21b6', label: 'violet' },
  { accent: '#0891b2', light: '#ecfeff', border: '#a5f3fc', text: '#0e7490', label: 'cyan'   },
  { accent: '#d97706', light: '#fffbeb', border: '#fcd34d', text: '#b45309', label: 'amber'  },
  { accent: '#059669', light: '#ecfdf5', border: '#6ee7b7', text: '#047857', label: 'emerald'},
  { accent: '#dc2626', light: '#fef2f2', border: '#fca5a5', text: '#b91c1c', label: 'red'    },
  { accent: '#db2777', light: '#fdf2f8', border: '#f9a8d4', text: '#be185d', label: 'pink'   },
  { accent: '#65a30d', light: '#f7fee7', border: '#bef264', text: '#4d7c0f', label: 'lime'   },
  { accent: '#ea580c', light: '#fff7ed', border: '#fed7aa', text: '#c2410c', label: 'orange' },
];

// ── Slot type helpers ─────────────────────────────────────────────────────────
const isNTA = (slot: TimetableSlot) => (slot as any).status === 'NTA';
const isRoomFallback = (slot: TimetableSlot) => !!(slot as any).is_room_fallback && !isNTA(slot);

/**
 * ── TIMEZONE FIX ─────────────────────────────────────────────────────────────
 * Use .toISOString().slice(11,16) — always UTC, matches stored values.
 */
const fmt = (t: Date | string): string =>
  new Date(t).toISOString().slice(11, 16);

function breakBetween(
  a: { end_time: Date | string },
  b: { start_time: Date | string }
): string | null {
  const gapMin = Math.round(
    (new Date(b.start_time).getTime() - new Date(a.end_time).getTime()) / 60_000
  );
  if (gapMin <= 1) return null;
  return `${gapMin} min`;
}

export default function TimetableGrid({
  slots,
  currentWeek,
  onSlotMove,
  onSlotClick,
  isAdmin,
  userId,
}: TimetableGridProps) {
  const [draggedSlot, setDraggedSlot]   = useState<TimetableSlot | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  // ── Derive sorted lesson periods ──────────────────────────────────────────
  const periods = useMemo(() => {
    const map = new Map<number, TimetableSlot['lessonperiods']>();
    slots.forEach(s => { if (s.lessonperiods) map.set(s.lesson_period_id, s.lessonperiods); });
    return [...map.values()].sort(
      (a, b) => new Date(a!.start_time).getTime() - new Date(b!.start_time).getTime()
    );
  }, [slots]);

  // ── Map slots by "day-period" key ─────────────────────────────────────────
  const slotMap = useMemo(() => {
    const m = new Map<string, TimetableSlot[]>();
    slots.forEach(s => {
      const k = `${s.day_of_week}-${s.lesson_period_id}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    });
    return m;
  }, [slots]);

  // ── Assign colors to session groups ──────────────────────────────────────
  const groupColorMap = useMemo(() => {
    const m  = new Map<string, typeof GROUP_COLORS[0]>();
    let idx  = 0;
    slots.forEach(s => {
      if (s.session_group_id && !m.has(s.session_group_id))
        m.set(s.session_group_id, GROUP_COLORS[idx++ % GROUP_COLORS.length]);
    });
    return m;
  }, [slots]);

  // ── Find continuation slot IDs ────────────────────────────────────────────
  const continuationIds = useMemo(() => {
    const cont    = new Set<string>();
    const grouped = new Map<string, TimetableSlot[]>();
    slots.forEach(s => {
      if (!s.session_group_id) return;
      const k = `${s.day_of_week}|${s.session_group_id}|${s.class_id}`;
      grouped.set(k, [...(grouped.get(k) ?? []), s]);
    });
    grouped.forEach(group => {
      const sorted = [...group].sort((a, b) => {
        const pa = periods.find(p => p?.id === a.lesson_period_id);
        const pb = periods.find(p => p?.id === b.lesson_period_id);
        if (!pa || !pb) return 0;
        return new Date(pa.start_time).getTime() - new Date(pb.start_time).getTime();
      });
      sorted.slice(1).forEach(s => cont.add(s.id));
    });
    return cont;
  }, [slots, periods]);

  // ── Build column spec ────────────────────────────────────────────────────
  type ColSpec =
    | { type: 'period'; period: NonNullable<TimetableSlot['lessonperiods']> }
    | { type: 'break';  label: string; from: string; to: string };

  const colSpecs = useMemo((): ColSpec[] => {
    const specs: ColSpec[] = [];
    periods.forEach((period, i) => {
      if (i > 0) {
        const prev = periods[i - 1]!;
        const gap  = breakBetween(prev, period!);
        if (gap) specs.push({ type: 'break', label: gap, from: fmt(prev.end_time as unknown as Date), to: fmt(period!.start_time as unknown as Date) });
      }
      specs.push({ type: 'period', period: period! });
    });
    return specs;
  }, [periods]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, slot: TimetableSlot) => {
    if (!isAdmin) return;
    setDraggedSlot(slot);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragEnd   = () => { setDraggedSlot(null); setDragOverCell(null); };
  const onDragOver  = (e: React.DragEvent, day: number, periodId: number) => {
    if (!isAdmin || !draggedSlot) return;
    e.preventDefault();
    setDragOverCell(`${day}-${periodId}`);
  };
  const onDragLeave = () => setDragOverCell(null);
  const onDrop = (e: React.DragEvent, day: number, periodId: number) => {
    e.preventDefault();
    if (!isAdmin || !draggedSlot || !onSlotMove) return;
    if (draggedSlot.day_of_week !== day || draggedSlot.lesson_period_id !== periodId)
      onSlotMove(draggedSlot.id, day, periodId);
    setDragOverCell(null);
    setDraggedSlot(null);
  };

  if (periods.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200 rounded-xl">
        <BookOpen className="h-10 w-10 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No timetable slots found</p>
        <p className="text-gray-400 text-sm mt-1">Try changing the term or filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600 no-print">
        <span className="font-semibold text-gray-700">Legend</span>

        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-indigo-100 border-l-2 border-indigo-500 inline-block" />
          Double / Triple block (first period)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-indigo-50 border border-dashed border-indigo-300 inline-block" />
          Continuation period
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-3 rounded-sm bg-gray-800 inline-block" />
          Break
        </span>

        {/* ── RNA fallback — RED ────────────────────────────────────────── */}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-50 border-l-2 border-red-600 inline-block" />
          <Home className="h-2.5 w-2.5 text-red-600" />
          Room fallback (RNA)
        </span>

        {/* ── NTA ──────────────────────────────────────────────────────── */}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-50 border-l-2 border-red-600 inline-block" />
          <AlertTriangle className="h-2.5 w-2.5 text-red-600" />
          Class Not Available (TFL)
        </span>

        {isAdmin && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-50 border-l-2 border-amber-500 inline-block" />
            Your slot
          </span>
        )}
        {isAdmin && (
          <span className="flex items-center gap-1.5 ml-auto text-gray-400 italic">
            <GripVertical className="h-3 w-3" /> Drag to reschedule
          </span>
        )}
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 900 }}>

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="w-[110px] px-3 py-3 text-left font-semibold text-xs tracking-wide text-gray-300 border-r border-gray-700 sticky left-0 z-20 bg-gray-800">
                Day
              </th>
              {colSpecs.map((col, i) => {
                if (col.type === 'break') {
                  return (
                    <th
                      key={`break-header-${i}`}
                      className="px-0 bg-gray-950 relative"
                      style={{ width: 20, minWidth: 20, maxWidth: 20 }}
                    >
                      <div className="flex flex-col items-center justify-center h-full py-2">
                        <span
                          className="text-gray-400 font-bold uppercase"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 7, letterSpacing: '0.1em' }}
                        >
                          {col.label}
                        </span>
                      </div>
                    </th>
                  );
                }
                const { period } = col;
                return (
                  <th
                    key={`period-header-${period.id}`}
                    className="px-3 py-3 text-center font-semibold border-r border-gray-700 last:border-r-0"
                    style={{ minWidth: 160 }}
                  >
                    <div className="text-sm">{period.name}</div>
                    <div className="flex items-center justify-center gap-1 text-xs font-normal text-gray-400 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {fmt(period.start_time as unknown as Date)}
                      <span className="text-gray-600">–</span>
                      {fmt(period.end_time as unknown as Date)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Body ────────────────────────────────────────────────────────── */}
          <tbody>
            {DAYS.map((day, dIdx) => {
              const date = new Date(
                currentWeek.start.getTime() + day.value * 24 * 60 * 60 * 1000
              );

              return (
                <tr key={day.value} className={dIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                  {/* ── Day label ────────────────────────────────────────── */}
                  <td className="px-3 py-3 border-r border-b-2 border-b-gray-400 border-gray-200 align-middle bg-gray-50 sticky left-0 z-10">
                    <div className="font-semibold text-gray-800 text-xs">{day.name}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </td>

                  {colSpecs.map((col, i) => {

                    // ── Break column ─────────────────────────────────────
                    if (col.type === 'break') {
                      return (
                        <td
                          key={`break-${day.value}-${i}`}
                          className="border-b-2 border-b-gray-400 align-middle"
                          style={{ width: 20, minWidth: 20, maxWidth: 20, padding: 0, background: '#111827' }}
                        />
                      );
                    }

                    // ── Period cell ──────────────────────────────────────
                    const { period }   = col;
                    const cellKey      = `${day.value}-${period.id}`;
                    const rawSlots     = slotMap.get(cellKey) ?? [];
                    const isDragTarget = dragOverCell === cellKey;

                    const primarySlots = rawSlots.filter(s => !continuationIds.has(s.id));
                    const contSlots    = rawSlots.filter(s =>  continuationIds.has(s.id));

                    const seenGroups = new Set<string>();
                    const cards: {
                      slot: TimetableSlot;
                      combinedCount: number;
                      groupSpan: number;
                      isCont: boolean;
                    }[] = [];

                    const addCards = (list: TimetableSlot[], isCont: boolean) => {
                      list.forEach(slot => {
                        const gk = (slot.session_group_id ?? slot.id) + (isCont ? '_c' : '_p');
                        if (seenGroups.has(gk)) return;
                        seenGroups.add(gk);

                        const combinedCount = slot.session_group_id
                          ? list.filter(s => s.session_group_id === slot.session_group_id).length
                          : 1;

                        const gSpan = slot.session_group_id
                          ? (() => {
                              const pids = new Set<number>();
                              slots.forEach(s => {
                                if (s.session_group_id === slot.session_group_id &&
                                    s.day_of_week      === slot.day_of_week &&
                                    s.class_id         === slot.class_id)
                                  pids.add(s.lesson_period_id);
                              });
                              return pids.size;
                            })()
                          : 1;

                        cards.push({ slot, combinedCount, groupSpan: gSpan, isCont });
                      });
                    };

                    addCards(primarySlots, false);
                    addCards(contSlots, true);

                    return (
                      <td
                        key={cellKey}
                        className={`px-1.5 py-1.5 border-r border-b-2 border-b-gray-400 border-gray-200 last:border-r-0 align-top transition-colors duration-150 ${
                          isDragTarget ? 'bg-blue-50 outline outline-2 outline-blue-400 outline-offset-[-2px]' : ''
                        }`}
                        style={{ minWidth: 140, verticalAlign: 'top' }}
                        onDragOver={e => onDragOver(e, day.value, period.id)}
                        onDragLeave={onDragLeave}
                        onDrop={e => onDrop(e, day.value, period.id)}
                      >
                        {cards.length === 0 ? (
                          <div className={`h-full min-h-[52px] flex items-center justify-center text-[11px] rounded transition-colors ${
                            isDragTarget ? 'text-blue-500 font-medium' : 'text-gray-300'
                          }`}>
                            {isDragTarget ? '↓ Drop here' : '—'}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {cards.map(({ slot, combinedCount, groupSpan, isCont }) => {
                              const ntaSlot  = isNTA(slot);
                              const rnaSlot  = isRoomFallback(slot);
                              const isOwn    = slot.employee_id === userId;
                              const gc       = slot.session_group_id ? groupColorMap.get(slot.session_group_id) : null;
                              const trainerFirst = slot.users?.name?.split(' ')[0] ?? '';

                              // ── NTA continuation card ───────────────────
                              if (isCont && ntaSlot) {
                                return (
                                  <div
                                    key={slot.id + '_cont_nta'}
                                    className="rounded overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                                    style={{ border: '1px solid #fca5a5', background: '#fff5f5' }}
                                    onClick={() => onSlotClick(slot)}
                                  >
                                    <div style={{ height: 3, background: '#dc2626' }} />
                                    <div className="flex items-center gap-1 px-2 py-1">
                                      <AlertTriangle className="h-2.5 w-2.5 text-red-500 shrink-0" />
                                      <span className="font-mono font-bold truncate text-red-700" style={{ fontSize: 10, lineHeight: 1 }}>
                                        {slot.subjects?.code}
                                      </span>
                                      <span className="ml-auto shrink-0 text-[8px] font-semibold leading-none text-red-400">
                                        NTA cont.
                                      </span>
                                    </div>
                                  </div>
                                );
                              }

                              // ── RNA-only continuation card — RED ─────────
                              if (isCont && rnaSlot) {
                                return (
                                  <div
                                    key={slot.id + '_cont_rna'}
                                    className="rounded overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                                    style={{ border: '1px solid #fca5a5', background: '#fef2f2' }}
                                    onClick={() => onSlotClick(slot)}
                                  >
                                    <div style={{ height: 3, background: '#dc2626' }} />
                                    <div className="flex items-center gap-1 px-2 py-1">
                                      <Home className="h-2.5 w-2.5 text-red-600 shrink-0" />
                                      <span className="font-mono font-bold truncate text-red-700" style={{ fontSize: 10, lineHeight: 1 }}>
                                        {slot.subjects?.code}
                                      </span>
                                      <span className="ml-auto shrink-0 text-[8px] font-semibold leading-none text-red-400">
                                        RNA cont.
                                      </span>
                                    </div>
                                  </div>
                                );
                              }

                              // ── Regular continuation card ───────────────
                              if (isCont) {
                                return (
                                  <div
                                    key={slot.id + '_cont'}
                                    className="rounded overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                                    style={{ border: `1px solid ${gc?.border ?? '#e5e7eb'}`, background: gc?.light ?? '#f9fafb' }}
                                    onClick={() => onSlotClick(slot)}
                                  >
                                    <div style={{ height: 3, background: gc?.accent ?? '#9ca3af' }} />
                                    <div className="flex items-center gap-1 px-2 py-1">
                                      <span className="font-mono font-bold truncate" style={{ fontSize: 10, color: gc?.text ?? '#6b7280', lineHeight: 1 }}>
                                        {slot.subjects?.code}
                                      </span>
                                      <span className="ml-auto shrink-0 text-[8px] font-semibold leading-none" style={{ color: gc?.text ?? '#9ca3af', opacity: 0.7 }}>
                                        cont.
                                      </span>
                                    </div>
                                  </div>
                                );
                              }

                              // ─────────────────────────────────────────────
                              // Primary cards below
                              // ─────────────────────────────────────────────

                              // ── NTA primary card ────────────────────────
                              if (ntaSlot) {
                                return (
                                  <div
                                    key={slot.id}
                                    className="rounded border px-2 py-1.5 cursor-pointer transition-all duration-150 hover:shadow-sm"
                                    style={{
                                      background: '#fef2f2',
                                      borderColor: '#fca5a5',
                                      borderLeft: '3px solid #dc2626',
                                    }}
                                    onClick={() => onSlotClick(slot)}
                                  >
                                    {/* Subject + NTA badge row */}
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-mono font-bold text-red-800 text-[11px] leading-none">
                                        {slot.subjects?.code}
                                      </span>
                                      <span className="inline-flex items-center gap-0.5 rounded text-[8px] font-bold px-1 py-0.5 bg-red-600 text-white leading-none shrink-0">
                                        <AlertTriangle className="h-2 w-2" />
                                        NTA
                                      </span>
                                    </div>

                                    {/* Subject name */}
                                    <div className="text-[9px] text-red-400 mt-0.5 truncate leading-none">
                                      {slot.subjects?.name}
                                    </div>

                                    {/* Intended trainer row */}
                                    <div className="flex items-center gap-0.5 mt-1">
                                      <User className="h-2.5 w-2.5 shrink-0 text-red-300" />
                                      <span className="text-[10px] text-red-400 truncate line-through">
                                        {trainerFirst}
                                      </span>
                                      <span className="ml-auto text-[8px] text-red-400 italic shrink-0">
                                        unavailable
                                      </span>
                                    </div>
                                  </div>
                                );
                              }

                              // ── RNA fallback primary card — RED ──────────
                              if (rnaSlot) {
                                const cardStyle: React.CSSProperties = {
                                  background: '#fef2f2',
                                  borderColor: '#fca5a5',
                                  borderLeft: '3px solid #dc2626',
                                };
                                return (
                                  <div
                                    key={slot.id}
                                    className={`rounded border px-2 py-1.5 transition-all duration-150 hover:shadow-sm ${
                                      isAdmin ? 'cursor-move' : 'cursor-pointer'
                                    } ${draggedSlot?.id === slot.id ? 'opacity-40 scale-95' : ''}`}
                                    style={cardStyle}
                                    draggable={isAdmin}
                                    onDragStart={e => onDragStart(e, slot)}
                                    onDragEnd={onDragEnd}
                                    onClick={() => onSlotClick(slot)}
                                  >
                                    {/* Subject + RNA badge row */}
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-mono font-bold text-red-800 text-[11px] leading-none">
                                        {slot.subjects?.code}
                                      </span>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <span className="inline-flex items-center gap-0.5 rounded text-[8px] font-bold px-1 py-0.5 bg-red-600 text-white leading-none">
                                          <Home className="h-2 w-2" />
                                          RNA
                                        </span>
                                        {groupSpan > 1 && gc && (
                                          <span
                                            className="inline-flex items-center gap-0.5 rounded text-[8px] font-bold px-1 py-0.5 text-white leading-none"
                                            style={{ background: gc.accent }}
                                          >
                                            <Link2 className="h-2 w-2" />
                                            {groupSpan === 2 ? 'DBL' : 'TRP'}
                                          </span>
                                        )}
                                        {isAdmin && <GripVertical className="h-2.5 w-2.5 text-gray-300" />}
                                      </div>
                                    </div>

                                    {/* Trainer row */}
                                    <div className="flex items-center gap-0.5 mt-1">
                                      <User className="h-2.5 w-2.5 shrink-0 text-red-400" />
                                      <span className="text-[10px] text-red-600 truncate">{trainerFirst}</span>
                                      {isOwn && (
                                        <span className="inline-flex rounded text-[8px] font-bold px-1 py-0.5 bg-amber-500 text-white leading-none ml-auto shrink-0">
                                          You
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              }

                              // ── Normal primary card (unchanged) ──────────
                              const cardStyle: React.CSSProperties = isOwn
                                ? { background: '#fffbeb', borderLeft: '3px solid #f59e0b' }
                                : gc
                                ? { background: gc.light, borderLeft: `3px solid ${gc.accent}` }
                                : { background: '#ffffff', borderLeft: '3px solid #e5e7eb' };

                              return (
                                <div
                                  key={slot.id}
                                  className={`rounded border border-gray-200 px-2 py-1.5 transition-all duration-150 hover:shadow-sm ${
                                    isAdmin ? 'cursor-move' : 'cursor-pointer'
                                  } ${draggedSlot?.id === slot.id ? 'opacity-40 scale-95' : ''}`}
                                  style={cardStyle}
                                  draggable={isAdmin}
                                  onDragStart={e => onDragStart(e, slot)}
                                  onDragEnd={onDragEnd}
                                  onClick={() => onSlotClick(slot)}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono font-bold text-gray-900 text-[11px] leading-none">
                                      {slot.subjects?.code}
                                    </span>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      {groupSpan > 1 && gc ? (
                                        <span
                                          className="inline-flex items-center gap-0.5 rounded text-[8px] font-bold px-1 py-0.5 text-white leading-none"
                                          style={{ background: gc.accent }}
                                        >
                                          <Link2 className="h-2 w-2" />
                                          {groupSpan === 2 ? 'DBL' : 'TRP'}
                                        </span>
                                      ) : (
                                        <span className="inline-flex rounded text-[8px] font-bold px-1 py-0.5 bg-gray-200 text-gray-500 leading-none">
                                          SGL
                                        </span>
                                      )}
                                      {isAdmin && <GripVertical className="h-2.5 w-2.5 text-gray-300" />}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-0.5 mt-1">
                                    <User className="h-2.5 w-2.5 shrink-0 text-gray-400" />
                                    <span className="text-[10px] text-gray-500 truncate">{trainerFirst}</span>
                                    {combinedCount > 1 && (
                                      <span
                                        className="ml-1 shrink-0 text-[8px] font-bold px-1 py-0.5 rounded leading-none"
                                        style={gc
                                          ? { background: gc.border, color: gc.text }
                                          : { background: '#e5e7eb', color: '#374151' }
                                        }
                                      >
                                        ×{combinedCount}
                                      </span>
                                    )}
                                    {isOwn && (
                                      <span className="inline-flex rounded text-[8px] font-bold px-1 py-0.5 bg-amber-500 text-white leading-none ml-auto shrink-0">
                                        You
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}