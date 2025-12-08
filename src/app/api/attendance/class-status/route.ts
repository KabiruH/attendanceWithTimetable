// app/api/attendance/class-status/route.ts
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
    const user = await db.users.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, role: true, is_active: true }
    });

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    return user;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

// Helper function to calculate total hours from attendance records
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

// Helper function to get subject name for attendance record
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

// GET - Get class attendance status and statistics
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    
    // Get current date info in Kenya timezone
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

    // Enrich today's attendance with subject information
    const enrichedTodayAttendance = await Promise.all(
      todayAttendance.map(async (attendance) => {
        const subject = await getSubjectNameForAttendance(attendance.timetable_slot_id);
        return {
          ...attendance,
          subject
        };
      })
    );

    // Get class attendance history for the current month
    const monthlyAttendance = await db.classattendance.findMany({
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

    // Enrich monthly attendance with subject information
    const enrichedMonthlyAttendance = await Promise.all(
      monthlyAttendance.map(async (attendance) => {
        const subject = await getSubjectNameForAttendance(attendance.timetable_slot_id);
        return {
          ...attendance,
          subject
        };
      })
    );

    // Get active term
    const activeTerm = await db.terms.findFirst({
      where: { is_active: true }
    });

    // Get total number of scheduled classes in timetable for this trainer
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

    // Calculate statistics
    const completedClassesThisMonth = monthlyAttendance.filter(
      record => record.check_out_time !== null
    );

    const totalHoursThisMonth = calculateTotalHours(completedClassesThisMonth);

    // Get currently active sessions (checked in but not checked out)
    const now = nowInKenya.toJSDate();
    const activeClassSessions = enrichedTodayAttendance.filter(attendance => {
      return !attendance.check_out_time;
    });

    // Check if user can check into a new class (no active sessions)
    const canCheckIntoNewClass = activeClassSessions.length === 0;

    // Get today's schedule from timetable
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
      todaySchedule, // NEW: Today's timetable schedule
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