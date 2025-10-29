// app/api/timetable/route.ts
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

/**
 * GET /api/timetable
 * Fetch timetable slots with filters
 * Query params:
 * - term_id: Filter by term
 * - trainer_id: Filter by trainer/employee
 * - department: Filter by department
 * - day_of_week: Filter by specific day (0-6)
 * - class_id: Filter by specific class
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;
    const { searchParams } = new URL(request.url);

    // Build filter conditions
    const whereConditions: any = {};

    // Term filter
    const termId = searchParams.get('term_id');
    if (termId) {
      whereConditions.term_id = parseInt(termId);
    }

    // Trainer filter
    const trainerId = searchParams.get('trainer_id');
    if (trainerId) {
      whereConditions.employee_id = parseInt(trainerId);
    }

    // Department filter (filter by class department)
    const department = searchParams.get('department');

    // Day of week filter
    const dayOfWeek = searchParams.get('day_of_week');
    if (dayOfWeek) {
      whereConditions.day_of_week = parseInt(dayOfWeek);
    }

    // Class filter
    const classId = searchParams.get('class_id');
    if (classId) {
      whereConditions.class_id = parseInt(classId);
    }

    // If not admin, only show their own slots
    if (user.role !== 'admin') {
      whereConditions.employee_id = user.id;
    }

    // Fetch timetable slots
    const timetableSlots = await db.timetableSlots.findMany({
      where: department ? {
        ...whereConditions,
        class: {
          department: department
        }
      } : whereConditions,
      include: {
        class: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            department: true,
            duration_hours: true
          }
        },
        room: {
          select: {
            id: true,
            name: true,
            capacity: true,
            room_type: true
          }
        },
        lessonPeriod: {
          select: {
            id: true,
            name: true,
            start_time: true,
            end_time: true,
            duration: true
          }
        },
        trainer: {
          select: {
            id: true,
            name: true,
            role: true,
            department: true
          }
        },
        term: {
          select: {
            id: true,
            name: true,
            start_date: true,
            end_date: true,
            is_active: true
          }
        }
      },
      orderBy: [
        { day_of_week: 'asc' },
        { lessonPeriod: { start_time: 'asc' } }
      ]
    });

    return NextResponse.json({
      success: true,
      data: timetableSlots,
      count: timetableSlots.length
    });

  } catch (error: any) {
    console.error('Error fetching timetable:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch timetable',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/timetable
 * Create a new timetable slot (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;

    // Check if user is admin
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      term_id,
      class_id,
      employee_id,
      room_id,
      lesson_period_id,
      day_of_week,
      status = 'scheduled'
    } = body;

    // Validation
    if (!term_id || !class_id || !employee_id || !room_id || !lesson_period_id || day_of_week === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: term_id, class_id, employee_id, room_id, lesson_period_id, day_of_week' },
        { status: 400 }
      );
    }

    // Validate day_of_week is between 0-6
    if (day_of_week < 0 || day_of_week > 6) {
      return NextResponse.json(
        { error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)' },
        { status: 400 }
      );
    }

    // Check for conflicts (same room, same time, same day)
    const existingSlot = await db.timetableSlots.findFirst({
      where: {
        term_id,
        day_of_week,
        lesson_period_id,
        OR: [
          { room_id }, // Same room
          { employee_id } // Same trainer
        ]
      },
      include: {
        class: { select: { name: true, code: true } },
        room: { select: { name: true } },
        trainer: { select: { name: true } }
      }
    });

    if (existingSlot) {
      let conflictMessage = '';
      if (existingSlot.room_id === room_id) {
        conflictMessage = `Room ${existingSlot.room.name} is already booked at this time`;
      } else if (existingSlot.employee_id === employee_id) {
        conflictMessage = `Trainer ${existingSlot.trainer.name} is already scheduled for ${existingSlot.class.name} at this time`;
      }
      
      return NextResponse.json(
        { error: 'Scheduling conflict', details: conflictMessage },
        { status: 409 }
      );
    }

    // Verify all referenced records exist
    const [term, classRecord, trainer, room, lessonPeriod] = await Promise.all([
      db.terms.findUnique({ where: { id: term_id } }),
      db.classes.findUnique({ where: { id: class_id } }),
      db.users.findUnique({ where: { id: employee_id } }),
      db.rooms.findUnique({ where: { id: room_id } }),
      db.lessonPeriods.findUnique({ where: { id: lesson_period_id } })
    ]);

    if (!term) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (!trainer) {
      return NextResponse.json({ error: 'Trainer not found' }, { status: 404 });
    }
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    if (!lessonPeriod) {
      return NextResponse.json({ error: 'Lesson period not found' }, { status: 404 });
    }

    // Create timetable slot
    const timetableSlot = await db.timetableSlots.create({
      data: {
        term_id,
        class_id,
        employee_id,
        room_id,
        lesson_period_id,
        day_of_week,
        status
      },
      include: {
        class: true,
        room: true,
        lessonPeriod: true,
        trainer: true,
        term: true
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Timetable slot created successfully',
      data: timetableSlot
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating timetable slot:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create timetable slot',
        details: error.message 
      },
      { status: 500 }
    );
  }
}