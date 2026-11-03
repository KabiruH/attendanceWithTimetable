// app/api/attendance/admin-class-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { db } from '@/lib/db/db';
import jwt from 'jsonwebtoken';
import { groupIntoSessions, minutesOfDay } from '@/lib/utils/classSessions';

// Helper function to verify JWT and get user 
async function getAuthenticatedUser(req: NextRequest) {
  const token = req.cookies.get('token')?.value;

  if (!token) {
    throw new Error('No authentication token found');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    const user = await db.users.findUnique({
      where: { id: decoded.userId || decoded.id },
      select: { id: true, name: true, role: true, is_active: true }
    });

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    if (user.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }

    return user;
  } catch (error) {
    console.error('Auth error details:', error);
    throw new Error('Invalid authentication token');
  }
}

/** The current term: active flag AND today inside its date range. */
async function getCurrentTerm() {
  const now = new Date();
  return db.terms.findFirst({
    where: {
      is_active: true,
      start_date: { lte: now },
      end_date: { gte: now }
    },
    orderBy: { start_date: 'desc' }
  });
}

/** "08:00"-style label from a stored lesson time */
function hhmm(stored: Date): string {
  return `${String(stored.getUTCHours()).padStart(2, '0')}:${String(stored.getUTCMinutes()).padStart(2, '0')}`;
}

// Check-in window defaults — must match app/api/attendance/class-checkin
const DEFAULT_CHECKIN_WINDOW = 15;  // minutes before the session it opens
const DEFAULT_LATE_THRESHOLD = 10;  // minutes after the start it closes

type CheckInState = 'checked_in' | 'checked_out' | 'upcoming' | 'awaiting' | 'missed' | 'absent';

// GET - Get all class attendance status for admin dashboard
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    // Current date/time in Kenya
    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    const currentDate = nowInKenya.toJSDate().toISOString().split('T')[0];
    const nowMinutes = nowInKenya.hour * 60 + nowInKenya.minute;
    const todayDayOfWeek = nowInKenya.weekday % 7; // Luxon Mon=1..Sun=7 → JS Sun=0..Sat=6

    // ── Today's class attendance, with subject resolved in the same query
    // (previously an N+1: one extra request per record)
    const todayAttendance = await db.classattendance.findMany({
      where: {
        date: new Date(currentDate)
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            department: true,
            email: true
          }
        },
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            duration_hours: true
          }
        },
        timetableslots: {
          include: {
            subjects: {
              select: { id: true, name: true, code: true }
            },
            rooms: {
              select: { id: true, name: true }
            },
            lessonperiods: {
              select: { id: true, name: true, start_time: true, end_time: true, duration: true }
            }
          }
        }
      },
      orderBy: {
        check_in_time: 'desc'
      }
    });

    // Same check-in window as the check-in route
    const [settings, periodRows] = await Promise.all([
      db.timetablesettings.findFirst(),
      db.lessonperiods.findMany({
        where: { is_active: true },
        select: { id: true, name: true, start_time: true, end_time: true },
        orderBy: { start_time: 'asc' }
      })
    ]);
    // For the period filter on the dashboard
    const lessonPeriods = periodRows.map(p => ({
      id: p.id,
      name: p.name,
      startTime: hhmm(p.start_time),
      endTime: hhmm(p.end_time)
    }));
    const checkInOpensBefore = settings?.attendance_check_in_window || DEFAULT_CHECKIN_WINDOW;
    const checkInClosesAfter = settings?.attendance_late_threshold || DEFAULT_LATE_THRESHOLD;

    // ── Today's schedule for all trainers
    const activeTerm = await getCurrentTerm();
    let todaySlots: any[] = [];

    if (activeTerm) {
      todaySlots = await db.timetableslots.findMany({
        where: {
          term_id: activeTerm.id,
          day_of_week: todayDayOfWeek,
          status: 'scheduled'
        },
        include: {
          users: {
            select: { id: true, name: true, department: true }
          },
          classes: {
            select: { id: true, name: true, code: true, department: true }
          },
          subjects: {
            select: { id: true, name: true, code: true }
          },
          rooms: {
            select: { id: true, name: true }
          },
          lessonperiods: {
            select: { id: true, name: true, start_time: true, end_time: true, duration: true }
          }
        },
        orderBy: {
          lessonperiods: {
            start_time: 'asc'
          }
        }
      });
    }

    // Index today's attendance by slot, and by trainer+class for rows
    // that aren't linked to a slot
    const attendanceBySlot = new Map<string, typeof todayAttendance>();
    const attendanceByTrainerClass = new Map<string, typeof todayAttendance>();
    todayAttendance.forEach(a => {
      if (a.timetable_slot_id) {
        attendanceBySlot.set(a.timetable_slot_id, [...(attendanceBySlot.get(a.timetable_slot_id) ?? []), a]);
      } else {
        const key = `${a.trainer_id}-${a.class_id}`;
        attendanceByTrainerClass.set(key, [...(attendanceByTrainerClass.get(key) ?? []), a]);
      }
    });

    // Collapse doubles/triples — a double is one session, not two
    const sessions = groupIntoSessions(todaySlots);

    const todaySchedule = sessions.map(({ primary, siblings }) => {
      const lastPeriod = siblings[siblings.length - 1].lessonperiods;
      const totalDuration = siblings.reduce(
        (sum, s) => sum + (s.lessonperiods?.duration ?? 0), 0
      );

      const startMin = primary.lessonperiods ? minutesOfDay(primary.lessonperiods.start_time) : null;
      const endMin = lastPeriod ? minutesOfDay(lastPeriod.end_time) : null;

      // Attendance for this session: linked to any of its slots, or an
      // unlinked row for the same trainer+class checked in during the session
      const linked = siblings.flatMap(s => attendanceBySlot.get(s.id) ?? []);
      const unlinked = (attendanceByTrainerClass.get(`${primary.employee_id}-${primary.class_id}`) ?? [])
        .filter(a => {
          if (!a.check_in_time || startMin === null || endMin === null) return false;
          const t = DateTime.fromJSDate(a.check_in_time).setZone('Africa/Nairobi');
          const m = t.hour * 60 + t.minute;
          return m >= startMin - checkInOpensBefore && m < endMin;
        });
      const records = [...linked, ...unlinked];
      const checkedIn = records.find(a => a.check_in_time !== null);

      let checkInState: CheckInState;
      if (checkedIn) {
        checkInState = checkedIn.check_out_time ? 'checked_out' : 'checked_in';
      } else if (records.some(a => a.status === 'Absent')) {
        checkInState = 'absent';
      } else if (startMin !== null && nowMinutes > startMin + checkInClosesAfter) {
        checkInState = 'missed';
      } else if (startMin !== null && nowMinutes < startMin - checkInOpensBefore) {
        checkInState = 'upcoming';   // check-in window not open yet
      } else {
        checkInState = 'awaiting';
      }

      return {
        ...primary,
        lessonperiods: primary.lessonperiods
          ? {
              ...primary.lessonperiods,
              end_time: lastPeriod?.end_time ?? primary.lessonperiods.end_time,
              duration: totalDuration
            }
          : primary.lessonperiods,
        sessionSpan: siblings.length,
        sessionSlotIds: siblings.map(s => s.id),
        startTime: primary.lessonperiods ? hhmm(primary.lessonperiods.start_time) : null,
        endTime: lastPeriod ? hhmm(lastPeriod.end_time) : null,
        checkIn: {
          state: checkInState,
          time: checkedIn?.check_in_time?.toISOString() ?? null,
          status: checkedIn?.status ?? null,       // Present / Late
          attendanceId: checkedIn?.id ?? null
        },
        // Is this session running right now (by the timetable, not attendance)?
        inSessionNow:
          startMin !== null && endMin !== null &&
          nowMinutes >= startMin && nowMinutes < endMin,
        hasStarted: startMin !== null && nowMinutes >= startMin
      };
    });

    // Slot id → its full session, so attendance rows report the session's
    // real end (a double runs to the end of its second period, not its first)
    const sessionBySlot = new Map<string, (typeof todaySchedule)[number]>();
    todaySchedule.forEach(s => s.sessionSlotIds.forEach((id: string) => sessionBySlot.set(id, s)));

    const enrichedTodayAttendance = todayAttendance.map(attendance => {
      const session = attendance.timetable_slot_id ? sessionBySlot.get(attendance.timetable_slot_id) : undefined;
      const period = attendance.timetableslots?.lessonperiods ?? null;

      return {
        ...attendance,
        subject: attendance.timetableslots?.subjects ?? null,
        room: attendance.timetableslots?.rooms ?? null,
        lessonPeriod: period && session?.lessonperiods
          ? { ...period, end_time: session.lessonperiods.end_time, duration: session.lessonperiods.duration }
          : period,
        sessionSpan: session?.sessionSpan ?? 1
      };
    });

    // ── Currently active sessions: actually checked in, not yet checked out.
    // Auto-marked 'Absent' rows have no check_in_time and must be excluded —
    // including them was reporting every absence as an in-progress class.
    // One row per session: a double with an attendance row per period shows once
    const seenSessions = new Set<string>();
    const activeClassSessions = enrichedTodayAttendance.filter(attendance => {
      if (
        attendance.check_in_time === null ||
        attendance.check_out_time !== null ||
        attendance.status === 'Absent'
      ) return false;

      const session = attendance.timetable_slot_id ? sessionBySlot.get(attendance.timetable_slot_id) : undefined;
      const key = session ? `session-${session.id}` : `attendance-${attendance.id}`;
      if (seenSessions.has(key)) return false;
      seenSessions.add(key);
      return true;
    });

    // ── Metrics, computed the way the dashboard should read them
    const inSessionNow = todaySchedule.filter(s => s.inSessionNow);
    const scheduledSoFar = todaySchedule.filter(s => s.hasStarted);
    const completedToday = enrichedTodayAttendance.filter(a => a.check_out_time !== null);
    const absentToday = enrichedTodayAttendance.filter(a => a.status === 'Absent');
    // Sessions (not attendance rows) that were checked into, so doubles count once
    const checkedInSoFar = scheduledSoFar.filter(
      s => s.checkIn.state === 'checked_in' || s.checkIn.state === 'checked_out'
    );

    const metrics = {
      inSessionNow: inSessionNow.length,               // lessons running right now
      checkedInNow: activeClassSessions.length,        // trainers actually in class now
      activeTrainersNow: new Set(activeClassSessions.map(a => a.trainer_id)).size,
      scheduledToday: todaySchedule.length,            // sessions, doubles counted once
      scheduledSoFar: scheduledSoFar.length,
      completedToday: completedToday.length,
      absentToday: absentToday.length,
      attendanceRate: scheduledSoFar.length > 0
        ? Math.round((checkedInSoFar.length / scheduledSoFar.length) * 100)
        : null
    };

    return NextResponse.json({
      success: true,
      todayAttendance: enrichedTodayAttendance,
      todaySchedule,
      activeClassSessions,
      inSessionNow,
      metrics,
      checkInWindow: { opensBefore: checkInOpensBefore, closesAfter: checkInClosesAfter },
      lessonPeriods,
      currentTime: nowInKenya.toISO(),
      activeTerm: activeTerm ? {
        id: activeTerm.id,
        name: activeTerm.name
      } : null
    });

  } catch (error) {
    console.error('=== Error in admin class status API ===');
    console.error('Error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}