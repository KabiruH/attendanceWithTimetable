// app/api/attendance/class-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { db } from '@/lib/db/db';
import jwt from 'jsonwebtoken';
import { verifyMobileJWT } from '@/lib/auth/mobile-jwt';

async function getAuthenticatedUser(req: NextRequest) {
  // 1. Try Bearer token first (mobile - both standard JWT and mobile JWT use Bearer)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // Try as mobile JWT first (has type: 'mobile')
    try {
      const mobileAuth = await verifyMobileJWT(req);
      if (mobileAuth.success && mobileAuth.payload) {
        const user = await db.users.findUnique({
          where: { id: mobileAuth.payload.userId }, // ✅ userId = users.id
          select: { id: true, name: true, role: true, is_active: true }
        });
        if (user?.is_active) return user;
      }
    } catch (error) {}

    // Try as standard JWT
    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number; id: number };
      const user = await db.users.findUnique({
        where: { id: decoded.userId || decoded.id },
        select: { id: true, name: true, role: true, is_active: true }
      });
      if (user?.is_active) return user;
    } catch (error) {}
  }

  // 2. Fall back to cookie (web)
  const token = req.cookies.get('token')?.value;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number; id: number };
      const user = await db.users.findUnique({
        where: { id: decoded.userId || decoded.id },
        select: { id: true, name: true, role: true, is_active: true }
      });
      if (user?.is_active) return user;
    } catch (error) {}
  }

  throw new Error('No valid authentication method provided');
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function calculateTotalHours(attendanceRecords: any[]): string {
  let totalMinutes = 0;

  attendanceRecords.forEach(record => {
    if (record.check_in_time && record.check_out_time) {
      const checkIn = new Date(record.check_in_time);
      const checkOut = new Date(record.check_out_time);
      const diffMs = checkOut.getTime() - checkIn.getTime();
      totalMinutes += Math.max(0, diffMs / (1000 * 60));
    }
  });

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);

  if (hours === 0 && minutes === 0) return '0';
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

async function getSubjectNameForAttendance(timetableSlotId: string | null) {
  if (!timetableSlotId) return null;

  const slot = await db.timetableslots.findUnique({
    where: { id: timetableSlotId },
    include: {
      subjects: {
        select: {
          name: true,
          code: true
        }
      }
    }
  });

  return slot?.subjects || null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    const currentDate = nowInKenya.toJSDate().toISOString().split('T')[0];
    const startOfMonth = new Date(nowInKenya.year, nowInKenya.month - 1, 1);
    const endOfMonth = new Date(nowInKenya.year, nowInKenya.month, 0);

    // Get today's class attendance
    const todayAttendance = await db.classattendance.findMany({
      where: {
        trainer_id: user.id,
        date: new Date(currentDate)
      },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            duration_hours: true
          }
        }
      },
      orderBy: {
        check_in_time: 'asc'
      }
    });

    // Enrich today's attendance with subject info
    const enrichedTodayAttendance = await Promise.all(
      todayAttendance.map(async (attendance) => {
        const subject = await getSubjectNameForAttendance(attendance.timetable_slot_id);
        return { ...attendance, subject };
      })
    );

    // Get monthly attendance - weekdays only
    const monthlyAttendanceRaw = await db.classattendance.findMany({
      where: {
        trainer_id: user.id,
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            duration_hours: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    // Enrich monthly attendance with subject info and filter weekends
    const enrichedMonthlyAttendance = (
      await Promise.all(
        monthlyAttendanceRaw.map(async (attendance) => {
          const subject = await getSubjectNameForAttendance(attendance.timetable_slot_id);
          return { ...attendance, subject };
        })
      )
    ).filter(record => isWeekday(new Date(record.date))); // ✅ Filter weekends

    // Get active term
    const activeTerm = await db.terms.findFirst({
      where: { is_active: true }
    });

    // Count scheduled classes for this trainer in active term
    let scheduledClassesCount = 0;
    if (activeTerm) {
      scheduledClassesCount = await db.timetableslots.count({
        where: {
          employee_id: user.id,
          term_id: activeTerm.id,
          status: 'scheduled'
        }
      });
    }

    // Stats - weekday records only
    const completedClassesThisMonth = enrichedMonthlyAttendance.filter(
      record => record.check_out_time !== null
    );

    const totalHoursThisMonth = calculateTotalHours(completedClassesThisMonth);

    // Active sessions (checked in but not checked out today)
    const now = nowInKenya.toJSDate();
  const activeClassSessions = enrichedTodayAttendance.filter(
  attendance => !attendance.check_out_time && attendance.check_in_time !== null
);

    const canCheckIntoNewClass = activeClassSessions.length === 0;

    // Today's timetable schedule
    const todayDayOfWeek = now.getDay();
    let todaySchedule: any[] = [];

    if (activeTerm) {
      todaySchedule = await db.timetableslots.findMany({
        where: {
          employee_id: user.id,
          term_id: activeTerm.id,
          day_of_week: todayDayOfWeek,
          status: 'scheduled'
        },
        include: {
          classes: {
            select: {
              id: true,
              name: true,
              code: true,
              department: true
            }
          },
          subjects: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          rooms: {
            select: {
              id: true,
              name: true
            }
          },
          lessonperiods: {
            select: {
              id: true,
              name: true,
              start_time: true,
              end_time: true,
              duration: true
            }
          }
        },
        orderBy: {
          lessonperiods: {
            start_time: 'asc'
          }
        }
      });

      // Enrich schedule with attendance status
      todaySchedule = todaySchedule.map(slot => {
        const attendance = enrichedTodayAttendance.find(
          att => att.timetable_slot_id === slot.id
        );
        return {
          ...slot,
          attendance,
          hasCheckedIn: !!attendance?.check_in_time,
          hasCheckedOut: !!attendance?.check_out_time
        };
      });
    }

    const stats = {
      totalClassesThisMonth: completedClassesThisMonth.length,
      hoursThisMonth: totalHoursThisMonth,
      scheduledClasses: scheduledClassesCount,
      activeSessionsToday: activeClassSessions.length,
      scheduledToday: todaySchedule.length
    };

    return NextResponse.json({
      success: true,
      todayAttendance: enrichedTodayAttendance,
      todaySchedule,
      attendanceHistory: enrichedMonthlyAttendance,
      activeClassSessions,
      canCheckIntoNewClass,
      stats,
      userRole: user.role,
      activeTerm: activeTerm ? {
        id: activeTerm.id,
        name: activeTerm.name
      } : null
    });

  } catch (error) {
    console.error('Error fetching class attendance status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}