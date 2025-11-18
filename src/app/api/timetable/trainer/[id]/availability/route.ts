// app/api/trainers/[id]/availability/route.ts
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

// GET /api/trainers/[id]/availability - Check if trainer is available for a timetable slot
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const termId = searchParams.get('term_id');
    const dayOfWeek = searchParams.get('day_of_week');
    const lessonPeriodId = searchParams.get('lesson_period_id');
    const excludeSlotId = searchParams.get('exclude_slot_id'); // For updating existing slots

    // Validation
    if (!termId || !dayOfWeek || !lessonPeriodId) {
      return NextResponse.json(
        { 
          error: 'Missing required parameters: term_id, day_of_week, and lesson_period_id are required',
          example: '/api/trainers/[id]/availability?term_id=1&day_of_week=1&lesson_period_id=2'
        },
        { status: 400 }
      );
    }

    const parsedTermId = parseInt(termId);
    const parsedDayOfWeek = parseInt(dayOfWeek);
    const parsedLessonPeriodId = parseInt(lessonPeriodId);

    if (isNaN(parsedTermId) || isNaN(parsedDayOfWeek) || isNaN(parsedLessonPeriodId)) {
      return NextResponse.json(
        { error: 'Invalid parameter format. All IDs must be numbers.' },
        { status: 400 }
      );
    }

    if (parsedDayOfWeek < 0 || parsedDayOfWeek > 6) {
      return NextResponse.json(
        { error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)' },
        { status: 400 }
      );
    }

    // Check if trainer exists and is active
    const trainer = await db.users.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        name: true,
        role: true,
        is_active: true
      }
    });

    if (!trainer || !trainer.is_active) {
      return NextResponse.json(
        { error: 'Trainer not found or inactive' },
        { status: 404 }
      );
    }

    if (trainer.role !== 'employee' && trainer.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only employees can be assigned to timetable slots' },
        { status: 400 }
      );
    }

    // Verify term exists and is active
    const term = await db.terms.findUnique({
      where: { id: parsedTermId },
      select: { id: true, name: true, is_active: true }
    });

    if (!term) {
      return NextResponse.json(
        { error: 'Term not found' },
        { status: 404 }
      );
    }

    // Verify lesson period exists
    const lessonPeriod = await db.lessonperiods.findUnique({
      where: { id: parsedLessonPeriodId },
      select: {
        id: true,
        name: true,
        start_time: true,
        end_time: true,
        duration: true,
        is_active: true
      }
    });

    if (!lessonPeriod || !lessonPeriod.is_active) {
      return NextResponse.json(
        { error: 'Lesson period not found or inactive' },
        { status: 404 }
      );
    }

    // Check for existing timetable slot conflicts
    const whereClause: any = {
      employee_id: trainerId,
      term_id: parsedTermId,
      day_of_week: parsedDayOfWeek,
      lesson_period_id: parsedLessonPeriodId,
      status: { not: 'cancelled' }
    };

    // Exclude a specific slot if updating
    if (excludeSlotId) {
      whereClause.id = { not: excludeSlotId };
    }

    const conflictingSlot = await db.timetableslots.findFirst({
      where: whereClause,
      include: {
        classes: {
          select: {
            name: true,
            code: true
          }
        },
        subjects: {
          select: {
            name: true,
            code: true
          }
        },
        rooms: {
          select: {
            name: true
          }
        }
      }
    });

    const isAvailable = !conflictingSlot;

    return NextResponse.json({
      success: true,
      data: {
        trainer: {
          id: trainer.id,
          name: trainer.name
        },
        slot_details: {
          term_id: parsedTermId,
          term_name: term.name,
          day_of_week: parsedDayOfWeek,
          day_name: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parsedDayOfWeek],
          lesson_period: {
            id: lessonPeriod.id,
            name: lessonPeriod.name,
            start_time: lessonPeriod.start_time.toTimeString().slice(0, 5),
            end_time: lessonPeriod.end_time.toTimeString().slice(0, 5),
            duration: lessonPeriod.duration
          }
        },
        is_available: isAvailable,
        conflict: conflictingSlot ? {
          timetable_slot_id: conflictingSlot.id,
          subject: {
            name: conflictingSlot.subjects.name,
            code: conflictingSlot.subjects.code
          },
          class: {
            name: conflictingSlot.classes.name,
            code: conflictingSlot.classes.code
          },
          room: {
            name: conflictingSlot.rooms.name
          },
          message: `Trainer is already scheduled for "${conflictingSlot.subjects.name}" (${conflictingSlot.classes.name}) in ${conflictingSlot.rooms.name} at this time`
        } : null
      }
    });

  } catch (error) {
    console.error('Error checking trainer availability:', error);
    return NextResponse.json(
      { error: 'Failed to check availability' },
      { status: 500 }
    );
  }
}