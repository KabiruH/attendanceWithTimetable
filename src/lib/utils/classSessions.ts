// lib/utils/classSessions.ts
//
// One definition of a "class session", shared by the check-in route and the
// admin dashboard so they always agree on what a double or triple lesson is.
//
// A double/triple is stored as separate timetable slots in consecutive periods
// with the same trainer, class and subject. session_group_id marks COMBINED
// classes sharing one period, not doubles, so it must not be used for this.
//
// "Consecutive" means NEXT IN THE PERIOD LIST, whatever the gap between them:
// a double that runs across tea or lunch (e.g. 08:00–10:00 then 10:30–12:30)
// is still ONE session — one check-in, one absence, checkout at its end.

/** Lesson times are wall-clock digits stored in UTC fields — read with getUTC*. */
export function minutesOfDay(stored: Date): number {
  return stored.getUTCHours() * 60 + stored.getUTCMinutes();
}

// Fallback only, when a caller can't supply the period list: periods closer
// than this count as back-to-back
export const CONTIGUOUS_GAP_MINUTES = 5;

/** Anything with a lesson period start time — pass the ACTIVE lesson periods */
export interface PeriodLike {
  start_time: Date;
}

export interface SessionSlot {
  id: string;
  class_id: number;
  subject_id: number;
  employee_id: number;
  lessonperiods?: { start_time: Date; end_time: Date } | null;
}

const startOf = (s: SessionSlot) =>
  s.lessonperiods ? minutesOfDay(s.lessonperiods.start_time) : 0;

/**
 * Collapse doubles/triples into one session. Slots are bucketed by
 * trainer + class + subject, sorted by start time, and each run of
 * consecutive periods becomes one session. `primary` is the earliest slot;
 * `siblings` are all slots of the session in time order.
 *
 * Pass slots from a single day (and term), and the active lesson periods so
 * that sessions can span breaks. Without `periods`, only periods at most
 * CONTIGUOUS_GAP_MINUTES apart are joined.
 */
export function groupIntoSessions<T extends SessionSlot>(
  slots: T[],
  periods?: PeriodLike[] | null
): Array<{ primary: T; siblings: T[] }> {
  // Position of each period start in the day's period sequence
  const order = periods && periods.length > 0
    ? Array.from(new Set(periods.map(p => minutesOfDay(p.start_time)))).sort((a, b) => a - b)
    : null;

  const isNextPeriod = (prev: T, slot: T): boolean => {
    if (!prev.lessonperiods || !slot.lessonperiods) return false;
    if (order) {
      const i = order.indexOf(minutesOfDay(prev.lessonperiods.start_time));
      const j = order.indexOf(minutesOfDay(slot.lessonperiods.start_time));
      if (i >= 0 && j >= 0) return j === i + 1; // next period, however long the break
    }
    const gap = minutesOfDay(slot.lessonperiods.start_time) - minutesOfDay(prev.lessonperiods.end_time);
    return gap >= 0 && gap <= CONTIGUOUS_GAP_MINUTES;
  };

  const buckets = new Map<string, T[]>();

  slots.forEach(slot => {
    const key = `${slot.employee_id}-${slot.class_id}-${slot.subject_id}`;
    buckets.set(key, [...(buckets.get(key) ?? []), slot]);
  });

  const sessions: Array<{ primary: T; siblings: T[] }> = [];

  buckets.forEach(bucket => {
    const sorted = [...bucket].sort((a, b) => startOf(a) - startOf(b));

    let run: T[] = [];
    sorted.forEach(slot => {
      const prev = run[run.length - 1];

      if (prev && !isNextPeriod(prev, slot)) {
        sessions.push({ primary: run[0], siblings: run });
        run = [];
      }
      run.push(slot);
    });
    if (run.length > 0) sessions.push({ primary: run[0], siblings: run });
  });

  // Chronological order across all sessions
  return sessions.sort((a, b) => startOf(a.primary) - startOf(b.primary));
}

export interface SessionInfo {
  primaryId: string;
  slotIds: string[];
  startMin: number | null; // minutes of day, Nairobi wall clock
  endMin: number | null;   // end of the LAST period of the session
}

/** Slot id → the session it belongs to (every slot of a double maps to the same info). */
export function buildSessionIndex<T extends SessionSlot>(
  slots: T[],
  periods?: PeriodLike[] | null
): Map<string, SessionInfo> {
  const index = new Map<string, SessionInfo>();

  groupIntoSessions(slots, periods).forEach(({ primary, siblings }) => {
    const last = siblings[siblings.length - 1];
    const info: SessionInfo = {
      primaryId: primary.id,
      slotIds: siblings.map(s => s.id),
      startMin: primary.lessonperiods ? minutesOfDay(primary.lessonperiods.start_time) : null,
      endMin: last.lessonperiods ? minutesOfDay(last.lessonperiods.end_time) : null,
    };
    siblings.forEach(s => index.set(s.id, info));
  });

  return index;
}

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // Kenya is UTC+3, no daylight saving

/**
 * Real instant for a Nairobi wall-clock time on a given attendance date.
 * `date` is a @db.Date value (the Nairobi calendar day, stored as UTC midnight).
 */
export function eatWallClockToInstant(date: Date, minutesOfDayEAT: number): Date {
  const midnightUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(midnightUTC + minutesOfDayEAT * 60_000 - EAT_OFFSET_MS);
}

/** Nairobi calendar date as a Date suitable for @db.Date columns. */
export function eatToday(now: Date = new Date()): Date {
  return new Date(new Date(now.getTime() + EAT_OFFSET_MS).toISOString().split('T')[0]);
}