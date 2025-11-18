// app/api/timetable/trainer/[id]/today/route.ts
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

// GET /api/timetable/trainer/[id]/today - Get trainer's today's scheduled subjects
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

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0-6 (Sunday-Saturday)
    const todayDateOnly = new Date(today.toDateString()); // Remove time component

    // Get active term
    const activeTerm = await db.terms.findFirst({
      where: {
        is_active: true,
        start_date: { lte: today },
        end_date: { gte: today }
      }
    });

    if (!activeTerm) {
      return NextResponse.json({
        success: true,
        message: 'No active term found',
        data: {
          date: today.toISOString(),
          day_of_week: dayOfWeek,
          subjects: [],
          work_check_in_status: null
        }
      });
    }

    // Check if trainer has checked in to work today
    const workAttendance = await db.attendance.findUnique({
      where: {
        employee_id_date: {
          employee_id: trainerId,
          date: todayDateOnly
        }
      },
      select: {
        check_in_time: true,
        check_out_time: true,
        status: true
      }
    });

    // Get today's timetable slots
    const todaySlots = await db.timetableslots.findMany({
      where: {
        employee_id: trainerId,
        term_id: activeTerm.id,
        day_of_week: dayOfWeek,
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
      orderBy: {
        lessonperiods: { start_time: 'asc' }
      }
    });

    // For each slot, check if there's attendance recorded
    const slotsWithAttendance = await Promise.all(
      todaySlots.map(async (slot) => {
        const classAttendance = await db.classattendance.findFirst({
          where: {
            trainer_id: trainerId,
            class_id: slot.class_id,
            date: todayDateOnly
          },
          select: {
            check_in_time: true,
            check_out_time: true,
            status: true,
            auto_checkout: true
          }
        });

        // Calculate if notification should be sent (15 minutes before)
        const periodStartTime = new Date(slot.lessonperiods.start_time);
        const notificationTime = new Date(today);
        notificationTime.setHours(periodStartTime.getHours());
        notificationTime.setMinutes(periodStartTime.getMinutes() - 15);

        // Calculate if class has started and grace period (30 minutes after start)
        const classStartTime = new Date(today);
        classStartTime.setHours(periodStartTime.getHours());
        classStartTime.setMinutes(periodStartTime.getMinutes());
        
        const gracePeriodEnd = new Date(classStartTime);
        gracePeriodEnd.setMinutes(gracePeriodEnd.getMinutes() + 30);

        const now = new Date();
        const shouldNotify = now >= notificationTime && now < classStartTime;
        const isGracePeriodActive = now >= classStartTime && now <= gracePeriodEnd;
        const hasPassedGracePeriod = now > gracePeriodEnd;

        return {
          timetable_slot_id: slot.id,
          subject: slot.subjects,
          class: slot.classes,
          room: slot.rooms,
          period: {
            ...slot.lessonperiods,
            start_time_formatted: slot.lessonperiods.start_time.toTimeString().slice(0, 5),
            end_time_formatted: slot.lessonperiods.end_time.toTimeString().slice(0, 5)
          },
          attendance: classAttendance ? {
            checked_in: !!classAttendance.check_in_time,
            checked_out: !!classAttendance.check_out_time,
            check_in_time: classAttendance.check_in_time,
            check_out_time: classAttendance.check_out_time,
            status: classAttendance.status,
            auto_checkout: classAttendance.auto_checkout
          } : {
            checked_in: false,
            checked_out: false,
            check_in_time: null,
            check_out_time: null,
            status: 'pending',
            auto_checkout: false
          },
          timing: {
            should_notify: shouldNotify,
            is_grace_period_active: isGracePeriodActive,
            has_passed_grace_period: hasPassedGracePeriod,
            class_start_time: classStartTime,
            grace_period_end: gracePeriodEnd
          }
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        date: today.toISOString(),
        day_of_week: dayOfWeek,
        day_name: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
        trainer_id: trainerId,
        work_check_in_status: workAttendance ? {
          checked_in: !!workAttendance.check_in_time,
          check_in_time: workAttendance.check_in_time,
          check_out_time: workAttendance.check_out_time,
          status: workAttendance.status
        } : {
          checked_in: false,
          check_in_time: null,
          check_out_time: null,
          status: 'not_checked_in'
        },
        subjects: slotsWithAttendance,
        total_subjects: slotsWithAttendance.length,
        checked_in_count: slotsWithAttendance.filter(s => s.attendance.checked_in).length,
        pending_count: slotsWithAttendance.filter(s => !s.attendance.checked_in).length
      }
    });

  } catch (error) {
    console.error('Error fetching today\'s timetable:', error);
    return NextResponse.json(
      { error: 'Failed to fetch today\'s timetable' },
      { status: 500 }
    );
  }
}