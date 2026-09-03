// app/api/attendance/admin-class-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { db } from '@/lib/db/db';
import jwt from 'jsonwebtoken';

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

/** Lesson times are wall-clock digits stored in UTC fields — read with getUTC*. */
function minutesOfDay(stored: Date): number {
  return stored.getUTCHours() * 60 + stored.getUTCMinutes();
}

/** Collapse doubles/triples into one session, keyed on the earliest period. */
function groupIntoSessions<T extends {
  id: string;
  class_id: number;
  session_group_id: string | null;
  lessonperiods?: { start_time: Date; end_time: Date; duration: number } | null;
}>(slots: T[]): Array<{ primary: T; siblings: T[] }> {
  const groups = new Map<string, T[]>();

  slots.forEach(slot => {
    const key = slot.session_group_id
      ? `${slot.session_group_id}-${slot.class_id}`
      : `single-${slot.id}`;
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  });

  return Array.from(groups.values()).map(group => {
    const sorted = [...group].sort(
      (a, b) =>
        (a.lessonperiods ? minutesOfDay(a.lessonperiods.start_time) : 0) -
        (b.lessonperiods ? minutesOfDay(b.lessonperiods.start_time) : 0)
    );
    return { primary: sorted[0], siblings: sorted };
  });
}

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

    const enrichedTodayAttendance = todayAttendance.map(attendance => ({
      ...attendance,
      subject: attendance.timetableslots?.subjects ?? null,
      room: attendance.timetableslots?.rooms ?? null,
      lessonPeriod: attendance.timetableslots?.lessonperiods ?? null
    }));

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

    // Collapse doubles/triples — a double is one session, not two
    const sessions = groupIntoSessions(todaySlots);

    const todaySchedule = sessions.map(({ primary, siblings }) => {
      const lastPeriod = siblings[siblings.length - 1].lessonperiods;
      const totalDuration = siblings.reduce(
        (sum, s) => sum + (s.lessonperiods?.duration ?? 0), 0
      );

      const startMin = primary.lessonperiods ? minutesOfDay(primary.lessonperiods.start_time) : null;
      const endMin = lastPeriod ? minutesOfDay(lastPeriod.end_time) : null;

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
        // Is this session running right now (by the timetable, not attendance)?
        inSessionNow:
          startMin !== null && endMin !== null &&
          nowMinutes >= startMin && nowMinutes < endMin,
        hasStarted: startMin !== null && nowMinutes >= startMin
      };
    });

    // ── Currently active sessions: actually checked in, not yet checked out.
    // Auto-marked 'Absent' rows have no check_in_time and must be excluded —
    // including them was reporting every absence as an in-progress class.
    const activeClassSessions = enrichedTodayAttendance.filter(attendance =>
      attendance.check_in_time !== null &&
      attendance.check_out_time === null &&
      attendance.status !== 'Absent'
    );

    // ── Metrics, computed the way the dashboard should read them
    const inSessionNow = todaySchedule.filter(s => s.inSessionNow);
    const scheduledSoFar = todaySchedule.filter(s => s.hasStarted);
    const completedToday = enrichedTodayAttendance.filter(a => a.check_out_time !== null);
    const absentToday = enrichedTodayAttendance.filter(a => a.status === 'Absent');
    const checkedInSoFar = enrichedTodayAttendance.filter(a => a.check_in_time !== null);

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