'use client';
import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, MapPin, User, Trash2, BookOpen,
  GraduationCap, Wifi, Link2, Pencil, Users,
  AlertTriangle, Home, Lightbulb, ChevronDown, ChevronUp,
  CalendarCheck, ArrowRight, ShieldCheck,
} from "lucide-react";
import { TimetableSlot } from '@/lib/types/timetable';
import CreateSlotDialog from '@/components/timetable/CreateSlotDialog';

interface SlotDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: TimetableSlot;
  onDelete: () => void;
  onUpdate: () => void;
  isAdmin: boolean;
  selectedTerm: number | null;
  sessionGroupSize?: number;
  /** All slots in the current timetable — used to compute free slot recommendations */
  allSlots?: TimetableSlot[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fmt = (t: Date | string) => new Date(t).toISOString().slice(11, 16);

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'default',
  cancelled:  'destructive',
  completed:  'secondary',
  NTA:        'destructive',
};

type SessionType = 'single' | 'double' | 'triple';

const SESSION_TYPE_STYLES: Record<SessionType, string> = {
  single: 'bg-gray-100 text-gray-700 border-gray-200',
  double: 'bg-teal-100  text-teal-700  border-teal-200',
  triple: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const isNTA          = (s: TimetableSlot) => (s as any).status === 'NTA';
const isRoomFallback = (s: TimetableSlot) => !!(s as any).is_room_fallback;

// ─── Free slot finder ─────────────────────────────────────────────────────────
// Checks ALL constraints:
//   • Trainer must be free (no other slot with this trainer at that day+period)
//   • Primary class must be free
//   • All combined classes must be free
//   • Room must be free

// These are client-side hints only. The server ALWAYS enforces the DB unique
// constraint and route-level conflict checks on save — nothing is bypassed.
// ─────────────────────────────────────────────────────────────────────────────

interface FreeSlot {
  day: number;
  dayName: string;
  periodId: number;
  periodName: string;
  periodTime: string;
}

function findFreeSlots(
  trainerId: number,
  classId: number,
  roomId: number,
  combinedClassIds: number[],
  allSlots: TimetableSlot[],
  excludeSlotId: string
): FreeSlot[] {
  const trainerBusy = new Set<string>();
  const classBusy   = new Set<string>();
  const roomBusy    = new Set<string>();

  allSlots.forEach(s => {
    if (s.id === excludeSlotId) return;
    const key = `${s.day_of_week}-${s.lesson_period_id}`;

    // Trainer conflict
    if (s.employee_id === trainerId) trainerBusy.add(key);

    // Room conflict
    if (s.room_id === roomId) roomBusy.add(key);

    // Primary class conflict — direct or via combined_class_ids
    if (s.class_id === classId) classBusy.add(key);
    if (s.timetableslotclasses?.some(c => c.class_id === classId)) classBusy.add(key);

    // Combined class conflicts — every class combined on THIS slot must also
    // be free at the target time
    combinedClassIds.forEach(cid => {
      if (s.class_id === cid) classBusy.add(key);
      if (s.timetableslotclasses?.some(c => c.class_id === cid)) classBusy.add(key);
    });
  });

  // Derive all unique periods from the live timetable
  const periodMap = new Map<number, {
    name: string;
    start_time: string | Date;
    end_time: string | Date;
  }>();
  allSlots.forEach(s => {
    if (s.lessonperiods) periodMap.set(s.lesson_period_id, s.lessonperiods);
  });

  const free: FreeSlot[] = [];
  for (const day of [1, 2, 3, 4, 5]) {
    for (const [periodId, period] of periodMap.entries()) {
      const key = `${day}-${periodId}`;
      if (
        !trainerBusy.has(key) &&
        !classBusy.has(key)   &&
        !roomBusy.has(key)
      ) {
        free.push({
          day,
          dayName:    DAY_NAMES[day],
          periodId,
          periodName: period.name,
          periodTime: `${fmt(period.start_time as string)} – ${fmt(period.end_time as string)}`,
        });
      }
    }
  }

  return free
    .sort((a, b) => a.day !== b.day ? a.day - b.day : a.periodName.localeCompare(b.periodName))
    .slice(0, 8); // cap at 8 so the panel stays scannable
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SlotDetailsDialog({
  open,
  onOpenChange,
  slot,
  onDelete,
  onUpdate,
  isAdmin,
  selectedTerm,
  sessionGroupSize = 1,
  allSlots = [],
}: SlotDetailsDialogProps) {
  const [editOpen,            setEditOpen]            = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  // When a free slot card is clicked we store a synthetic slot override so
  // CreateSlotDialog opens with the suggested day+period pre-filled while
  // keeping all other fields (subject, trainer, room, class) unchanged.
  const [slotOverride, setSlotOverride] = useState<TimetableSlot | null>(null);

  const sessionType: SessionType =
    sessionGroupSize >= 3 ? 'triple'
    : sessionGroupSize === 2 ? 'double'
    : 'single';

  const isGrouped    = sessionType !== 'single';
  const ntaSlot      = isNTA(slot);
  const rnaSlot      = isRoomFallback(slot);
  const hasFlagIssue = ntaSlot || rnaSlot;

 const siblingSlots = useMemo(() =>
  slot.session_group_id
    ? allSlots.filter(s =>
        s.session_group_id === slot.session_group_id &&
        s.id !== slot.id &&
        s.class_id !== slot.class_id  // deduplicate by class (triple has 3 periods per class)
      ).filter((s, i, arr) =>
        arr.findIndex(x => x.class_id === s.class_id) === i
      )
    : [],
  [slot.session_group_id, slot.id, slot.class_id, allSlots]
);

const isCombined = siblingSlots.length > 0;

const combinedClassIds = useMemo(
  () => siblingSlots.map(s => s.class_id),
  [siblingSlots]
);

  // ── Free slot computation ─────────────────────────────────────────────────
  // All four constraint sets (trainer, class, combined classes, room) are
  // checked. Results are suggestions only — the server validates on save.
  const freeSlots = useMemo(() => {
    if (!hasFlagIssue || !isAdmin || allSlots.length === 0) return [];
    return findFreeSlots(
      slot.employee_id,
      slot.class_id,
      slot.room_id,
      combinedClassIds,
      allSlots,
      slot.id
    );
  }, [
    hasFlagIssue, isAdmin, allSlots,
    slot.employee_id, slot.class_id, slot.room_id,
    combinedClassIds, slot.id,
  ]);

  const handleEditSaved = () => {
    setEditOpen(false);
    setSlotOverride(null);
    onUpdate();
  };

  // Regular edit — no override
  const handleEditClick = () => {
    setSlotOverride(null);
    onOpenChange(false);
    setEditOpen(true);
  };

  // Free slot card clicked — pre-fill edit form with suggested day + period
  const handleFreeSlotClick = (fs: FreeSlot) => {
    setSlotOverride({
      ...slot,
      day_of_week:      fs.day,
      lesson_period_id: fs.periodId,
      lessonperiods: {
        ...(slot.lessonperiods ?? {}),
        id:         fs.periodId,
        name:       fs.periodName,
      } as TimetableSlot['lessonperiods'],
    });
    onOpenChange(false);
    setEditOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Slot Details</span>
              <div className="flex items-center gap-2">

                {/* Session type badge */}
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${SESSION_TYPE_STYLES[sessionType]}`}>
                  {isGrouped && <Link2 className="h-3 w-3" />}
                  {sessionType.charAt(0).toUpperCase() + sessionType.slice(1)}
                </span>

                {/* Online badge */}
                {slot.is_online_session && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 border border-sky-200 px-2.5 py-0.5 text-xs font-semibold">
                    <Wifi className="h-3 w-3" />Online
                  </span>
                )}

                {/* Status */}
                <Badge variant={STATUS_VARIANT[slot.status] ?? 'outline'}>
                  {ntaSlot
                    ? 'No Trainer'
                    : slot.status.charAt(0).toUpperCase() + slot.status.slice(1)}
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">

            {/* ── NTA warning ─────────────────────────────────────────────── */}
            {ntaSlot && (
              <div className="rounded-lg border-2 border-dashed border-red-400 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800 text-sm">
                      Class Not Available(CNA)
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      This session was scheduled but{' '}
                      <strong>{slot.users.name}</strong> had no free periods when
                      the timetable was generated. A trainer must be assigned
                      before the term starts.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── RNA warning ─────────────────────────────────────────────── */}
            {rnaSlot && (
              <div className="rounded-lg border-2 border-dotted border-orange-400 bg-orange-50 p-4">
                <div className="flex items-start gap-3">
                  <Home className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-orange-800 text-sm">
                      Room Fallback — RNA
                    </p>
                    <p className="text-xs text-orange-700 mt-1">
                      <strong>{slot.subjects.code}</strong> has no preferred room
                      so the scheduler placed it in the catch-all room{' '}
                      <strong>RNA</strong>. The session will run but RNA should
                      not be the permanent venue.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Recommendations (admin only, collapsible) ────────────────── */}
            {hasFlagIssue && isAdmin && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100 transition-colors"
                  onClick={() => setShowRecommendations(v => !v)}
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">
                      How to resolve
                      {freeSlots.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-amber-700">
                          · {freeSlots.length} free slot{freeSlots.length !== 1 ? 's' : ''} found — click to move
                        </span>
                      )}
                    </span>
                  </div>
                  {showRecommendations
                    ? <ChevronUp   className="h-4 w-4 text-amber-600" />
                    : <ChevronDown className="h-4 w-4 text-amber-600" />
                  }
                </button>

                {showRecommendations && (
                  <div className="border-t border-amber-200 px-4 pb-4 space-y-4">

                    {/* ── Resolution steps ──────────────────────────────── */}
                    <div className="pt-3 space-y-3">
                      {ntaSlot && (
                        <>
                          <div className="flex items-start gap-3">
                            <User className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-gray-800">
                                Assign a trainer
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                Use{' '}
                                <span className="font-medium">Resolve — Edit Slot</span>{' '}
                                below to assign a different trainer directly. The
                                intended trainer was{' '}
                                <strong>{slot.users.name}</strong>.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Clock className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-gray-800">
                                Check {slot.users.name.split(' ')[0]}'s schedule
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                This trainer was fully booked at generation time.
                                If they exceed 20 sessions/week, redistribute some
                                subjects then regenerate the timetable.
                              </p>
                            </div>
                          </div>
                        </>
                      )}

                      {rnaSlot && (
                        <div className="flex items-start gap-3">
                          <MapPin className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-gray-800">
                              Assign a permanent room
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              Go to{' '}
                              <span className="font-medium">
                                Subject → Room Assignments
                              </span>{' '}
                              and link{' '}
                              <strong>{slot.subjects.code}</strong> to a proper
                              room. Or use{' '}
                              <span className="font-medium">Resolve — Edit Slot</span>{' '}
                              to change the room on this slot only.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Free slot cards ─────────────────────────────────── */}
                    {freeSlots.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <CalendarCheck className="h-4 w-4 text-green-600" />
                          <p className="text-xs font-semibold text-gray-700">
                            Available slots where trainer, class
                            {combinedClassIds.length > 0 ? ', combined classes,' : ''}
                            {' '}and room are all free — click to move there:
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          {freeSlots.map((fs, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleFreeSlotClick(fs)}
                              className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs text-left hover:bg-green-100 hover:border-green-400 hover:shadow-sm transition-all group"
                            >
                              <ArrowRight className="h-3 w-3 text-green-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                              <div>
                                <span className="font-semibold text-green-800">
                                  {DAY_SHORT[fs.day]}
                                </span>
                                <span className="text-green-700 ml-1">
                                  {fs.periodName}
                                </span>
                                <div className="text-green-600 text-[10px]">
                                  {fs.periodTime}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Enforcement disclaimer */}
                        <div className="flex items-start gap-1.5 mt-2">
                          <ShieldCheck className="h-3 w-3 text-gray-400 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-gray-400">
                            These slots are free for the trainer, class
                            {combinedClassIds.length > 0 ? ', all combined classes,' : ''}
                            {' '}and room based on current timetable data. Clicking
                            opens the edit form pre-filled — all scheduling rules
                            (no double-booking, class conflicts, room conflicts) are
                            still enforced by the server on save. If the timetable
                            changed since this dialog opened, the server will reject
                            any violation.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* No free slots message */}
                    {freeSlots.length === 0 && ntaSlot && (
                      <div className="rounded-md bg-red-100 border border-red-200 px-3 py-2 text-xs text-red-700">
                        <strong>No free slots found</strong> — both{' '}
                        {slot.users.name.split(' ')[0]} and {slot.classes.code} are
                        fully booked across all periods. A trainer swap or load
                        reduction will be needed before this can be resolved.
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

            {/* ── Subject ─────────────────────────────────────────────────── */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-600 shrink-0" />
                <h3 className="font-semibold text-gray-900 text-base leading-tight">
                  {slot.subjects.name}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 pl-6">
                <span className="font-mono text-xs font-semibold bg-gray-100 px-1.5 py-0.5 rounded">
                  {slot.subjects.code}
                </span>
                <span>{slot.subjects.department}</span>
                {slot.subjects.credit_hours && (
                  <span>{slot.subjects.credit_hours}h</span>
                )}
              </div>
              {slot.subjects.description && (
                <p className="text-xs text-gray-500 pl-6">
                  {slot.subjects.description}
                </p>
              )}
            </div>

            {/* ── Session type ─────────────────────────────────────────────── */}
            <div className={`rounded-lg border p-4 ${
              isGrouped ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Session Type
              </p>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  {(['single', 'double', 'triple'] as SessionType[]).map(type => (
                    <span
                      key={type}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold capitalize
                        ${sessionType === type
                          ? SESSION_TYPE_STYLES[type] + ' ring-2 ring-offset-1 ring-current'
                          : 'bg-white text-gray-400 border-gray-200'
                        }`}
                    >
                      {type !== 'single' && <Link2 className="h-3 w-3" />}
                      {type}
                    </span>
                  ))}
                </div>
                {isAdmin && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    Use <span className="font-medium">Edit Slot</span> to change
                  </span>
                )}
              </div>
              {isGrouped && (
                <p className="text-xs text-teal-700 mt-2 flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  This slot spans {sessionGroupSize} consecutive periods.
                </p>
              )}
            </div>

            {/* ── Primary class ────────────────────────────────────────────── */}
            <div className="rounded-lg border p-4 bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap className="h-4 w-4 text-blue-600" />
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                  {isCombined ? 'Primary Class' : 'Class'}
                </p>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="font-semibold text-blue-900">{slot.classes.name}</p>
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                  {slot.classes.code}
                </Badge>
              </div>
              {slot.classes.department && (
                <p className="text-xs text-blue-700 mt-0.5">
                  {slot.classes.department}
                </p>
              )}
            </div>

            {/* ── Combined classes ─────────────────────────────────────────── */}
          {/* ── Combined classes ─────────────────────────────────────────────── */}
{isCombined && (
  <div className="rounded-lg border p-4 bg-indigo-50 border-indigo-200">
    <div className="flex items-center gap-2 mb-2">
      <Users className="h-4 w-4 text-indigo-600" />
      <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">
        Combined with ({siblingSlots.length} other {siblingSlots.length === 1 ? 'class' : 'classes'})
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      {siblingSlots.map(s => (
        <div
          key={s.class_id}
          className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded-full px-2.5 py-1 text-xs"
        >
          <span className="font-mono font-semibold text-indigo-800">
            {s.classes?.code ?? s.class_id}
          </span>
          {s.classes?.name && (
            <span className="text-indigo-600">{s.classes.name}</span>
          )}
        </div>
      ))}
    </div>
    <p className="text-[10px] text-indigo-500 mt-2 flex items-center gap-1">
      <Link2 className="h-3 w-3" />
      All classes share the same trainer, room, and time slot.
    </p>
  </div>
)}

            {/* ── Schedule details ─────────────────────────────────────────── */}
            <div className="rounded-lg border p-4 space-y-3">

              {/* Day & time */}
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 shrink-0">
                  <Clock className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Schedule</p>
                  <p className="text-sm font-medium">
                    {DAY_NAMES[slot.day_of_week]}, {slot.lessonperiods.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {fmt(slot.lessonperiods.start_time)} – {fmt(slot.lessonperiods.end_time)}
                    {' '}({slot.lessonperiods.duration} min)
                  </p>
                </div>
              </div>

              {/* Room */}
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                  rnaSlot ? 'bg-orange-100' : 'bg-purple-100'
                }`}>
                  {rnaSlot
                    ? <Home   className="h-4 w-4 text-orange-600" />
                    : <MapPin className="h-4 w-4 text-purple-600" />
                  }
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">Room</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{slot.rooms.name}</p>
                    {rnaSlot && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-300">
                        <Home className="h-2.5 w-2.5" />
                        RNA Fallback
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {[
                      slot.rooms.room_type,
                      slot.rooms.capacity ? `Capacity: ${slot.rooms.capacity}` : '',
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>

              {/* Trainer */}
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                  ntaSlot ? 'bg-red-100' : 'bg-orange-100'
                }`}>
                  <User className={`h-4 w-4 ${ntaSlot ? 'text-red-600' : 'text-orange-600'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">Trainer</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${ntaSlot ? 'line-through text-gray-400' : ''}`}>
                      {slot.users.name}
                    </p>
                    {ntaSlot && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        NTA — Unavailable
                      </span>
                    )}
                  </div>
                  {!ntaSlot && slot.users.department && (
                    <p className="text-xs text-gray-500">{slot.users.department}</p>
                  )}
                  {ntaSlot && (
                    <p className="text-xs text-red-500">
                      No free periods when timetable was generated
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Actions ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <div>
                {isAdmin && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { onDelete(); onOpenChange(false); }}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                {isAdmin && (
                  <Button
                    size="sm"
                    className={hasFlagIssue ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
                    onClick={handleEditClick}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    {hasFlagIssue ? 'Resolve — Edit Slot' : 'Edit Slot'}
                  </Button>
                )}
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog — slotOverride is set when coming from a free slot click,
          null when coming from the regular Edit Slot button. The server enforces
          all scheduling rules on save regardless of how the form was opened. */}
      {editOpen && (
        <CreateSlotDialog
          open={editOpen}
          onOpenChange={open => {
            setEditOpen(open);
            if (!open) setSlotOverride(null);
          }}
          onSuccess={handleEditSaved}
          selectedTerm={selectedTerm}
          slot={slotOverride ?? slot}
        />
      )}
    </>
  );
}