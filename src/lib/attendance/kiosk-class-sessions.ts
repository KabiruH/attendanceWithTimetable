// lib/attendance/kiosk-class-sessions.ts

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db/db';

// ─────────────────────────────────────────────────────────────────────────────
// EAT time helpers — Kenya is UTC+3 with no daylight saving
// ─────────────────────────────────────────────────────────────────────────────

export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Methods the kiosk records. Rows with one of these are kiosk rows; mobile rows have null. */
export const KIOSK_METHODS = ['fingerprint', 'card'] as const;
export type KioskMethod = (typeof KIOSK_METHODS)[number];

/** Shift a real instant to an "EAT wall clock" Date. Read it ONLY with getUTC*. */
export function toEAT(d: Date): Date {
  return new Date(d.getTime() + EAT_OFFSET_MS);
}

/** Convert an EAT wall-clock Date back to the real instant we store. */
export function eatToInstant(eatWall: Date): Date {
  return new Date(eatWall.getTime() - EAT_OFFSET_MS);
}

export function getEATClock() {
  const utcNow = new Date();
  const eatNow = toEAT(utcNow);
  const dateString = eatNow.toISOString().split('T')[0];
  return {
    utcNow,                                  // real instant — what we STORE
    eatNow,                                  // wall clock — what we COMPARE
    dateString,                              // Nairobi calendar date
    currentDate: new Date(dateString),       // for `date` columns (UTC midnight of the EAT date)
    dayOfWeek: eatNow.getUTCDay(),           // Nairobi weekday, 0 = Sunday
  };
}
export type EATClock = ReturnType<typeof getEATClock>;

/**
 * Place a lesson period's time of day on an EAT calendar date.
 * `eatDate` is a `date` column value or clock.currentDate (UTC midnight of that date).
 * The result is an EAT wall-clock Date, comparable with clock.eatNow.
 */
export function lessonTimeOn(stored: Date, eatDate: Date): Date {
  const d = new Date(eatDate);
  d.setUTCHours(stored.getUTCHours(), stored.getUTCMinutes(), 0, 0);
  return d;
}

/** Format an EAT wall-clock Date as e.g. "8:00 AM". */
export function formatEAT(d: Date): string {
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Term and settings
// ─────────────────────────────────────────────────────────────────────────────

export async function getCurrentTerm() {
  const now = new Date();
  return db.terms.findFirst({
    where: { is_active: true, start_date: { lte: now }, end_date: { gte: now } },
    orderBy: { start_date: 'desc' },
  });
}

export async function getKioskSettings() {
  const s = await db.timetablesettings.findFirst();
  return {
    windowBefore: s?.kiosk_checkin_window ?? 5,      // minutes before start the lesson opens
    cutoff: s?.attendance_checkin_cutoff ?? 30,      // minutes after start check-in closes
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessions and lessons
// ─────────────────────────────────────────────────────────────────────────────

type SlotWithPeriod = {
  id: string;
  class_id: number;
  employee_id: number;
  lesson_period_id: number;
  session_group_id: string | null;
  lessonperiods: { start_time: Date; end_time: Date } | null;
};

/** One class's single, double or triple: consecutive slots sharing a session_group_id. */
export type ClassSession<T> = { primary: T; siblings: T[]; start: Date; end: Date };

/**
 * One lesson as the secretary sees it: a trainer, a start period, and every class
 * taught together in it (combined classes). Times are the stored time-of-day values.
 */
export type Lesson<T> = { sessions: ClassSession<T>[]; start: Date; end: Date };

/** Same grouping the mobile route uses: doubles/triples collapse per class. */
export function groupIntoSessions<T extends SlotWithPeriod>(slots: T[]): ClassSession<T>[] {
  const groups = new Map<string, T[]>();
  for (const slot of slots) {
    if (!slot.lessonperiods) continue;
    const key = slot.session_group_id
      ? `${slot.session_group_id}-${slot.class_id}`
      : `single-${slot.id}`;
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }

  return Array.from(groups.values()).map(group => {
    const sorted = [...group].sort(
      (a, b) => a.lessonperiods!.start_time.getTime() - b.lessonperiods!.start_time.getTime()
    );
    const end = sorted.reduce(
      (max, s) => (s.lessonperiods!.end_time.getTime() > max.getTime() ? s.lessonperiods!.end_time : max),
      sorted[0].lessonperiods!.end_time
    );
    return { primary: sorted[0], siblings: sorted, start: sorted[0].lessonperiods!.start_time, end };
  });
}

/**
 * Sessions that share a trainer and a starting period are the same lesson taught to
 * combined classes (a trainer can only be in one room). They check in together.
 */
export function buildLessons<T extends SlotWithPeriod>(slots: T[]): Lesson<T>[] {
  const lessons = new Map<string, Lesson<T>>();
  for (const session of groupIntoSessions(slots)) {
    const key = `${session.primary.employee_id}-${session.primary.lesson_period_id}`;
    const lesson = lessons.get(key);
    if (!lesson) {
      lessons.set(key, { sessions: [session], start: session.start, end: session.end });
    } else {
      lesson.sessions.push(session);
      if (session.end.getTime() > lesson.end.getTime()) lesson.end = session.end;
    }
  }
  return Array.from(lessons.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled end and auto-close
// ─────────────────────────────────────────────────────────────────────────────

/** The real instant a class attendance row's session is scheduled to end. */
export async function scheduledEndInstant(row: {
  timetable_slot_id: string | null;
  date: Date;
}): Promise<Date | null> {
  if (!row.timetable_slot_id) return null;

  const slot = await db.timetableslots.findUnique({
    where: { id: row.timetable_slot_id },
    include: { lessonperiods: { select: { end_time: true } } },
  });
  if (!slot?.lessonperiods) return null;

  let lastEnd = slot.lessonperiods.end_time;
  if (slot.session_group_id) {
    const siblings = await db.timetableslots.findMany({
      where: {
        session_group_id: slot.session_group_id,
        class_id: slot.class_id,
        day_of_week: slot.day_of_week,
        term_id: slot.term_id,
      },
      include: { lessonperiods: { select: { end_time: true } } },
    });
    for (const s of siblings) {
      if (s.lessonperiods && s.lessonperiods.end_time.getTime() > lastEnd.getTime()) {
        lastEnd = s.lessonperiods.end_time;
      }
    }
  }

  return eatToInstant(lessonTimeOn(lastEnd, row.date));
}

/**
 * Closes every kiosk-recorded class session whose scheduled end has passed,
 * recording the scheduled end as the check-out time. Mobile rows are untouched.
 * Safe to call often; it only writes rows that are due.
 */
export async function closeExpiredKioskSessions(clock: EATClock = getEATClock()): Promise<number> {
  const open = await db.classattendance.findMany({
    where: {
      check_in_method: { in: [...KIOSK_METHODS] },
      check_in_time: { not: null },
      check_out_time: null,
      date: { lte: clock.currentDate },
    },
    select: { id: true, timetable_slot_id: true, date: true },
  });

  let closed = 0;
  for (const row of open) {
    const end = await scheduledEndInstant(row);
    if (end && clock.utcNow.getTime() >= end.getTime()) {
      await db.classattendance.update({
        where: { id: row.id },
        data: { check_out_time: end, auto_checkout: true },
      });
      closed++;
    }
  }
  return closed;
}

/**
 * Writes an Absent row for every lesson today whose check-in window has closed
 * without a check-in. Same behaviour as the mobile route, using the shared cutoff.
 */
export async function markMissedLessonsAsAbsent(clock: EATClock = getEATClock()) {
  const term = await getCurrentTerm();
  if (!term) return;
  const { cutoff } = await getKioskSettings();

  const slots = await db.timetableslots.findMany({
    where: { term_id: term.id, day_of_week: clock.dayOfWeek, status: 'scheduled' },
    include: { lessonperiods: { select: { start_time: true, end_time: true } } },
  });

  for (const { primary, siblings, start } of groupIntoSessions(slots)) {
    const closesAt = lessonTimeOn(start, clock.currentDate).getTime() + cutoff * 60_000;
    if (clock.eatNow.getTime() < closesAt) continue;

    const existing = await db.classattendance.findFirst({
      where: {
        trainer_id: primary.employee_id,
        class_id: primary.class_id,
        date: clock.currentDate,
        timetable_slot_id: { in: siblings.map(s => s.id) },
      },
      select: { id: true },
    });
    if (existing) continue;

    try {
      await db.classattendance.create({
        data: {
          trainer_id: primary.employee_id,
          class_id: primary.class_id,
          date: clock.currentDate,
          timetable_slot_id: primary.id,
          status: 'Absent',
          location_verified: false,
          is_online_attendance: primary.is_online_session || false,
        },
      });
    } catch (error) {
      // The mobile route may have written the same row a moment ago
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily (work) check-in
// ─────────────────────────────────────────────────────────────────────────────

type DbClient = Prisma.TransactionClient | typeof db;

/**
 * Makes sure the trainer is checked in to work today, creating the check-in if needed.
 * Callers must first confirm the trainer has not already checked OUT of work today.
 */
export async function ensureDailyCheckIn(client: DbClient, trainerId: number, clock: EATClock) {
  const existing = await client.attendance.findFirst({
    where: { employee_id: trainerId, date: clock.currentDate },
  });

  if (existing?.check_in_time) return { attendance: existing, created: false };

  if (existing) {
    // An auto-generated Absent row for today: upgrade it
    const attendance = await client.attendance.update({
      where: { id: existing.id },
      data: { check_in_time: clock.utcNow, status: 'Present' },
    });
    return { attendance, created: true };
  }

  const attendance = await client.attendance.create({
    data: {
      employee_id: trainerId,
      date: clock.currentDate,
      check_in_time: clock.utcNow,
      status: 'Present',
    },
  });
  return { attendance, created: true };
}