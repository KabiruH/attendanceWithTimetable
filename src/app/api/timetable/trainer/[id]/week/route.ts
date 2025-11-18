// app/api/timetable/trainer/[id]/week/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

// Helper function to verify authentication
async function verifyAuth() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');
   
    if (!token) {
      return { error: 'No token found', status: 401 };
    }

    const { payload } = await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );

    const userId = Number(payload.id);
    const role = payload.role as string;
    const name = payload.name as string;

    // Verify user is still active
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, department: true, is_active: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// Helper function to get start and end of current week
function getCurrentWeekRange() {
  const today = new Date();
  const currentDay = today.getDay(); // 0 (Sunday) to 6 (Saturday)
  
  // Get start of week (Sunday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - currentDay);
  startOfWeek.setHours(0, 0, 0, 0);
  
  // Get end of week (Saturday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  return { startOfWeek, endOfWeek };
}

// GET /api/timetable/trainer/[id]/week - Get trainer's weekly schedule with attendance
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;
    const params = await context.params;
    const trainerId = parseInt(params.id);

    if (isNaN(trainerId)) {
      return NextResponse.json({ error: 'Invalid trainer ID' }, { status: 400 });
    }

    // Check authorization
    if (user.role !== 'admin' && user.id !== trainerId) {
      return NextResponse.json(
        { error: 'Unauthorized. You can only view your own schedule.' },
        { status: 403 }
      );
    }

    const { startOfWeek, endOfWeek } = getCurrentWeekRange();

    // Get active term
    const activeTerm = await db.terms.findFirst({
      where: {
        is_active: true,
        start_date: { lte: endOfWeek },
        end_date: { gte: startOfWeek }
      }
    });

    if (!activeTerm) {
      return NextResponse.json({
        success: true,
        message: 'No active term found for this week',
        data: {
          week_start: startOfWeek.toISOString(),
          week_end: endOfWeek.toISOString(),
          schedule: {},
          total_subjects: 0
        }
      });
    }

    // Get all timetable slots for the trainer in active term
    const timetableSlots = await db.timetableslots.findMany({
      where: {
        employee_id: trainerId,
        term_id: activeTerm.id,
        status: { not: 'cancelled' }
      },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            department: true,
            duration_hours: true
          }
        },
        subjects: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            credit_hours: true,
            description: true
          }
        },
        rooms: {
          select: {
            id: true,
            name: true,
            capacity: true,
            room_type: true
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
      orderBy: [
        { day_of_week: 'asc' },
        { lessonperiods: { start_time: 'asc' } }
      ]
    });

    // Get all class attendance for this week
    const weekAttendance = await db.classattendance.findMany({
      where: {
        trainer_id: trainerId,
        date: {
          gte: startOfWeek,
          lte: endOfWeek
        }
      },
      select: {
        class_id: true,
        date: true,
        check_in_time: true,
        check_out_time: true,
        status: true,
        auto_checkout: true
      }
    });

    // Create attendance map: "classId_date" -> attendance
    const attendanceMap = new Map();
    weekAttendance.forEach(att => {
      const dateStr = att.date.toISOString().split('T')[0];
      const key = `${att.class_id}_${dateStr}`;
      attendanceMap.set(key, att);
    });

    // Group slots by day and add attendance info
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekSchedule: any = {};

    // Initialize all days
    daysOfWeek.forEach((day, index) => {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + index);
      
      weekSchedule[day] = {
        date: dayDate.toISOString().split('T')[0],
        day_of_week: index,
        subjects: []
      };
    });

    // Fill in the subjects
    timetableSlots.forEach(slot => {
      const dayName = daysOfWeek[slot.day_of_week];
      const dayDate = weekSchedule[dayName].date;
      const attendanceKey = `${slot.class_id}_${dayDate}`;
      const attendance = attendanceMap.get(attendanceKey);

      weekSchedule[dayName].subjects.push({
        timetable_slot_id: slot.id,
        subject: slot.subjects,
        class: slot.classes,
        room: slot.rooms,
        period: {
          ...slot.lessonperiods,
          start_time_formatted: slot.lessonperiods.start_time.toTimeString().slice(0, 5),
          end_time_formatted: slot.lessonperiods.end_time.toTimeString().slice(0, 5)
        },
        attendance: attendance ? {
          checked_in: !!attendance.check_in_time,
          checked_out: !!attendance.check_out_time,
          check_in_time: attendance.check_in_time,
          check_out_time: attendance.check_out_time,
          status: attendance.status,
          auto_checkout: attendance.auto_checkout
        } : {
          checked_in: false,
          checked_out: false,
          status: 'pending'
        }
      });
    });

    // Calculate statistics
    const totalSubjects = timetableSlots.length;
    const attendedSubjects = weekAttendance.filter(a => a.status === 'Present').length;
    const absentSubjects = weekAttendance.filter(a => a.status === 'Absent').length;
    const pendingSubjects = totalSubjects - attendedSubjects - absentSubjects;

    return NextResponse.json({
      success: true,
      data: {
        trainer_id: trainerId,
        term: {
          id: activeTerm.id,
          name: activeTerm.name
        },
        week_range: {
          start: startOfWeek.toISOString().split('T')[0],
          end: endOfWeek.toISOString().split('T')[0]
        },
        schedule: weekSchedule,
        statistics: {
          total_subjects: totalSubjects,
          attended: attendedSubjects,
          absent: absentSubjects,
          pending: pendingSubjects,
          attendance_rate: totalSubjects > 0 
            ? ((attendedSubjects / totalSubjects) * 100).toFixed(2) + '%' 
            : '0%'
        }
      }
    });

  } catch (error) {
    console.error('Error fetching weekly timetable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly timetable' },
      { status: 500 }
    );
  }
}