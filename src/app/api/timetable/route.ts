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

    // Verify user is still active and fetch has_timetable_admin
    const user = await db.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        department: true,
        is_active: true,
        has_timetable_admin: true
      }
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
 * - subject_id: Filter by specific subject
 * - is_online_session: Filter by online/physical sessions (true/false)
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

    // Subject filter
    const subjectId = searchParams.get('subject_id');
    if (subjectId) {
      whereConditions.subject_id = parseInt(subjectId);
    }

    // Room filter 
    const roomId = searchParams.get('room_id');
    if (roomId) {
      whereConditions.room_id = parseInt(roomId);
    }

    // ✅ NEW: Online session filter
    const isOnlineSession = searchParams.get('is_online_session');
    if (isOnlineSession !== null) {
      whereConditions.is_online_session = isOnlineSession === 'true';
    }

    // Department filter (filter by class department)
    const department = searchParams.get('department');
    if (department) {
      whereConditions.subjects = {
        department: department
      };
    }

    const status = searchParams.get('status');
    if (status) {
      whereConditions.status = status;
    }

    const isRoomFallback = searchParams.get('is_room_fallback');
    if (isRoomFallback !== null) {
      whereConditions.is_room_fallback = isRoomFallback === 'true';
    }

    const hasTimetableAccess = user.role === 'admin' || user.has_timetable_admin === true;

    // If user doesn't have timetable access, only show their own slots
    if (!hasTimetableAccess) {
      whereConditions.employee_id = user.id;
    }

    // Fetch timetable slots
    const timetableSlots = await db.timetableslots.findMany({
      where: whereConditions,
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
            description: true,
            can_be_online: true,
            lesson_type: true,
            sessions_per_week: true
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
        },
        users: {
          select: {
            id: true,
            name: true,
            role: true,
            department: true
          }
        },
        terms: {
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
        { lessonperiods: { start_time: 'asc' } }
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
 * Create a new timetable slot (Admin or Timetable Admin only)
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

    const hasTimetableAccess = user.role === 'admin' || user.has_timetable_admin === true;

    if (!hasTimetableAccess) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      term_id,
      class_id,
      subject_id,
      employee_id,
      room_id,
      lesson_period_id,
      day_of_week,
      status = 'scheduled',
      is_online_session = false // ✅ NEW: Default to false (physical class)
    } = body;

    // Validation
    if (!term_id || !class_id || !subject_id || !employee_id || !room_id || !lesson_period_id || day_of_week === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: term_id, class_id, subject_id, employee_id, room_id, lesson_period_id, day_of_week' },
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

    const validStatuses = ['scheduled', 'TFL', 'CNA'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify all referenced records exist
    const [term, classRecord, subject, trainer, room, lessonPeriod] = await Promise.all([
      db.terms.findUnique({ where: { id: term_id } }),
      db.classes.findUnique({ where: { id: class_id } }),
      db.subjects.findUnique({ where: { id: subject_id } }),
      db.users.findUnique({ where: { id: employee_id } }),
      db.rooms.findUnique({ where: { id: room_id } }),
      db.lessonperiods.findUnique({ where: { id: lesson_period_id } })
    ]);

    if (!term) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
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

    // ✅ NEW: Validate subject can be online if is_online_session is true
    if (is_online_session && !subject.can_be_online) {
      return NextResponse.json({
        error: 'Subject cannot be online',
        details: `${subject.name} (${subject.code}) is not configured to allow online sessions`
      }, { status: 400 });
    }

    // Check if the class is assigned to this term
    const termClass = await db.termclasses.findUnique({
      where: {
        term_id_class_id: {
          term_id: term_id,
          class_id: class_id
        }
      }
    });

    if (!termClass) {
      return NextResponse.json({
        error: 'Class not assigned to term',
        details: `${classRecord.name} (${classRecord.code}) must be assigned to ${term.name} before scheduling subjects`
      }, { status: 400 });
    }

    // Check if the subject is assigned to this class for this term
    const classSubject = await db.classsubjects.findFirst({
      where: {
        class_id: class_id,
        subject_id: subject_id,
        term_id: term_id
      }
    });

    if (!classSubject) {
      return NextResponse.json({
        error: 'Subject not assigned to class for this term',
        details: `${subject.name} (${subject.code}) must be assigned to ${classRecord.name} for ${term.name} before scheduling`
      }, { status: 400 });
    }

    // Check for conflicts (same room, same time, same day OR same trainer, same time, same day)
    const existingSlot = await db.timetableslots.findFirst({
      where: {
        term_id,
        day_of_week,
        lesson_period_id,
        OR: [
          { room_id }, // Same room
          { employee_id }, // Same trainer
          { class_id }
        ]
      },
      include: {
        classes: { select: { name: true, code: true } },
        subjects: { select: { name: true, code: true } },
        rooms: { select: { name: true } },
        users: { select: { name: true } }
      }
    });

    if (existingSlot) {
      let conflictMessage = '';
      if (existingSlot.room_id === room_id) {
        conflictMessage = `Room ${existingSlot.rooms.name} is already booked for ${existingSlot.subjects.name} (${existingSlot.classes.name}) at this time`;
      } else if (existingSlot.employee_id === employee_id) {
        conflictMessage = `Trainer ${existingSlot.users.name} is already scheduled for ${existingSlot.subjects.name} (${existingSlot.classes.name}) at this time`;
      } else if (existingSlot.class_id === class_id) {
        conflictMessage = `Class ${classRecord.name} is already scheduled for ${existingSlot.subjects.name} at this time`;
      }

      return NextResponse.json(
        { error: 'Scheduling conflict', details: conflictMessage },
        { status: 409 }
      );
    }

    // Create timetable slot
    const timetableSlot = await db.timetableslots.create({
      data: {
        id: crypto.randomUUID(),
        term_id,
        class_id,
        subject_id,
        employee_id,
        room_id,
        lesson_period_id,
        day_of_week,
        status,
        is_online_session, // ✅ NEW: Set online flag
        created_at: new Date(),
        updated_at: new Date()
      },
      include: {
        classes: true,
        subjects: true,
        rooms: true,
        lessonperiods: true,
        users: true,
        terms: true
      }
    });

    return NextResponse.json({
      success: true,
      message: `Timetable slot created successfully${is_online_session ? ' (Online Session)' : ''}`,
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


 // PATCH /api/timetable
  
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;
    const hasTimetableAccess = user.role === 'admin' || user.has_timetable_admin === true;
    if (!hasTimetableAccess) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required to modify timetable slots.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, is_online_session, status, room_id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Timetable slot ID is required' },
        { status: 400 }
      );
    }

    const existingSlot = await db.timetableslots.findUnique({
      where: { id },
      include: {
        subjects: {
          select: { id: true, name: true, code: true, can_be_online: true }
        }
      }
    });

    if (!existingSlot) {
      return NextResponse.json({ error: 'Timetable slot not found' }, { status: 404 });
    }

    if (is_online_session === true && !existingSlot.subjects?.can_be_online) {
      return NextResponse.json({
        error: 'Subject cannot be online',
        details: `${existingSlot.subjects?.name} is not configured to allow online sessions`
      }, { status: 400 });
    }

    // ── Room change handling ───────────────────────────────────────────────
    let isRoomFallback: boolean | undefined;

    if (room_id !== undefined) {
      const newRoom = await db.rooms.findUnique({
        where: { id: room_id },
        select: { id: true, name: true, room_type: true }
      });

      if (!newRoom) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }

      // Workshop rooms allow multiple simultaneous bookings — skip room conflict check.
      // All other rooms must be free at this time slot.
      const isWorkshop = newRoom.room_type === 'workshop';

      if (!isWorkshop) {
        const roomConflict = await db.timetableslots.findFirst({
          where: {
            id: { not: id }, // exclude current slot
            term_id: existingSlot.term_id,
            day_of_week: existingSlot.day_of_week,
            lesson_period_id: existingSlot.lesson_period_id,
            room_id
          },
          include: {
            classes: { select: { name: true, code: true } },
            subjects: { select: { name: true } }
          }
        });

        if (roomConflict) {
          return NextResponse.json({
            error: 'Room conflict',
            details: `${newRoom.name} is already booked for ${roomConflict.subjects.name} (${roomConflict.classes.name}) at this time`
          }, { status: 409 });
        }
      }

      // Auto-flag RNA: if the new room is named RNA, mark as room fallback
      const isRna =
        newRoom.name?.toUpperCase() === 'RNA' ||
        newRoom.name?.toUpperCase().includes('RNA');

      isRoomFallback = isRna ? true : false;
    }

    // ── Build update payload ──────────────────────────────────────────────
    const updateData: any = { updated_at: new Date() };

    if (is_online_session !== undefined) updateData.is_online_session = is_online_session;
    if (status !== undefined)            updateData.status = status;
    if (room_id !== undefined)           updateData.room_id = room_id;
    if (isRoomFallback !== undefined)    updateData.is_room_fallback = isRoomFallback;

    const updatedSlot = await db.timetableslots.update({
      where: { id },
      data: updateData,
      include: {
        classes: true,
        subjects: true,
        rooms: true,
        lessonperiods: true,
        users: true,
        terms: true
      }
    });

    return NextResponse.json({
      success: true,
      message: [
        'Timetable slot updated successfully',
        is_online_session !== undefined
          ? is_online_session ? '— marked as ONLINE' : '— marked as PHYSICAL'
          : null,
        room_id !== undefined && isRoomFallback
          ? '— moved to RNA (room fallback)'
          : null,
      ].filter(Boolean).join(' '),
      data: updatedSlot
    });

  } catch (error: any) {
    console.error('Error updating timetable slot:', error);
    return NextResponse.json(
      { error: 'Failed to update timetable slot', details: error.message },
      { status: 500 }
    );
  }
}