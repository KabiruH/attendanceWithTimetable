// lib/utils/classAbsences.ts
//
// THE one place that marks trainers absent from class. Every route that wants
// absences up to date calls markMissedClassesAsAbsent() — never keep a local
// copy: older copies in other routes (10-minute rule, one row per period) were
// marking the second half of doubles absent.
//
// Rules:
//  • One absence per SESSION — a double/triple (consecutive periods, same
//    trainer + class + subject, even across a break) is one session.
//  • Only once the session has ENDED (check-in stays open until then).
//  • Only if no period of the session has any attendance row.
//  • The row sits on the session's first slot (where check-ins are recorded).

import { db } from '@/lib/db/db';
import { groupIntoSessions, minutesOfDay } from '@/lib/utils/classSessions';

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // Kenya is UTC+3, no daylight saving

// Runs at most once a minute per server instance, and concurrent callers share
// the run in progress — many routes and devices call this.
const ABSENCE_MIN_INTERVAL_MS = 60_000;
let lastAbsenceRun = 0;
let absenceRunInFlight: Promise<void> | null = null;

export function markMissedClassesAsAbsent(): Promise<void> {
  if (absenceRunInFlight) return absenceRunInFlight;
  if (Date.now() - lastAbsenceRun < ABSENCE_MIN_INTERVAL_MS) return Promise.resolve();

  lastAbsenceRun = Date.now();
  absenceRunInFlight = runMarkMissedClassesAsAbsent().finally(() => {
    absenceRunInFlight = null;
  });
  return absenceRunInFlight;
}

async function runMarkMissedClassesAsAbsent() {
  try {
    // Nairobi wall clock (read with getUTC*), calendar date and weekday
    const eatNow = new Date(Date.now() + EAT_OFFSET_MS);
    const currentDate = new Date(eatNow.toISOString().split('T')[0]);
    const dayOfWeek = eatNow.getUTCDay();
    const nowMinutes = eatNow.getUTCHours() * 60 + eatNow.getUTCMinutes();

    const now = new Date();
    const activeTerm = await db.terms.findFirst({
      where: {
        is_active: true,
        start_date: { lte: now },
        end_date: { gte: now }
      },
      orderBy: { start_date: 'desc' }
    });
    if (!activeTerm) return;

    const [todaySlots, periods] = await Promise.all([
      db.timetableslots.findMany({
        where: {
          term_id: activeTerm.id,
          day_of_week: dayOfWeek,
          status: 'scheduled'
        },
        include: {
          lessonperiods: { select: { start_time: true, end_time: true } }
        }
      }),
      db.lessonperiods.findMany({
        where: { is_active: true },
        select: { start_time: true }
      })
    ]);

    // Sessions that have ENDED (end of their last period)
    const closedSessions = groupIntoSessions(todaySlots, periods).filter(({ siblings }) => {
      const lastPeriod = siblings[siblings.length - 1].lessonperiods;
      return !!lastPeriod && nowMinutes >= minutesOfDay(lastPeriod.end_time);
    });
    if (closedSessions.length === 0) return;

    // ONE query for every attendance row already recorded against these slots
    const slotIds = closedSessions.flatMap(({ siblings }) => siblings.map(sib => sib.id));
    const existing = await db.classattendance.findMany({
      where: { date: currentDate, timetable_slot_id: { in: slotIds } },
      select: { timetable_slot_id: true }
    });
    const recorded = new Set(existing.map(e => e.timetable_slot_id));

    // Any row on any period of the session counts
    const missing = closedSessions.filter(
      ({ siblings }) => !siblings.some(sib => recorded.has(sib.id))
    );
    if (missing.length === 0) return;

    // ONE insert; skipDuplicates covers a race with another server instance
    await db.classattendance.createMany({
      data: missing.map(({ primary }) => ({
        trainer_id: primary.employee_id,
        class_id: primary.class_id,
        date: currentDate,
        timetable_slot_id: primary.id,
        status: 'Absent',
        location_verified: false,
        is_online_attendance: primary.is_online_session || false,
        check_in_time: null,
        check_out_time: null,
        work_attendance_id: null
      })),
      skipDuplicates: true
    });
  } catch (error) {
    console.error('❌ Error marking absences:', error);
  }
}