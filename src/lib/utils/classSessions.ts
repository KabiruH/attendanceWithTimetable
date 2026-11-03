// lib/utils/classSessions.ts
//
// One definition of a "class session", shared by the check-in route and the
// admin dashboard so they always agree on what a double or triple lesson is.
//
// A double/triple is stored as separate timetable slots in consecutive periods
// with the same trainer, class and subject. session_group_id marks COMBINED
// classes sharing one period, not doubles, so it must not be used for this.

/** Lesson times are wall-clock digits stored in UTC fields — read with getUTC*. */
export function minutesOfDay(stored: Date): number {
  return stored.getUTCHours() * 60 + stored.getUTCMinutes();
}

// Periods closer than this count as back-to-back (absorbs small changeover
// gaps; a real break such as tea or lunch is longer and ends the session)
export const CONTIGUOUS_GAP_MINUTES = 5;

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
 * back-to-back periods becomes one session. `primary` is the earliest slot;
 * `siblings` are all slots of the session in time order.
 *
 * Pass slots from a single day (and term).
 */
export function groupIntoSessions<T extends SessionSlot>(
  slots: T[]
): Array<{ primary: T; siblings: T[] }> {
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
      let contiguous = false;
      if (prev?.lessonperiods && slot.lessonperiods) {
        const gap = minutesOfDay(slot.lessonperiods.start_time) - minutesOfDay(prev.lessonperiods.end_time);
        contiguous = gap >= 0 && gap <= CONTIGUOUS_GAP_MINUTES;
      }

      if (prev && !contiguous) {
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
export function buildSessionIndex<T extends SessionSlot>(slots: T[]): Map<string, SessionInfo> {
  const index = new Map<string, SessionInfo>();

  groupIntoSessions(slots).forEach(({ primary, siblings }) => {
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