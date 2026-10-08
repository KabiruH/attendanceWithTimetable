// app/api/timetable/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/verify-auth';
import { db } from '@/lib/db/db';
import { findConflicts, invalidCombinedClasses } from '@/lib/timetable/conficts';

/**
 * GET /api/timetable
 * Fetch timetable slots with filters
 * Query params:
 * - term_id, trainer_id, day_of_week, class_id, subject_id, room_id,
 *   is_online_session, department, status, is_room_fallback
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

    const termId = searchParams.get('term_id');
    if (termId) whereConditions.term_id = parseInt(termId);

    const trainerId = searchParams.get('trainer_id');
    if (trainerId) whereConditions.employee_id = parseInt(trainerId);

    const dayOfWeek = searchParams.get('day_of_week');
    if (dayOfWeek) whereConditions.day_of_week = parseInt(dayOfWeek);

    const classId = searchParams.get('class_id');
    if (classId) whereConditions.class_id = parseInt(classId);

    const subjectId = searchParams.get('subject_id');
    if (subjectId) whereConditions.subject_id = parseInt(subjectId);

    const roomId = searchParams.get('room_id');
    if (roomId) whereConditions.room_id = parseInt(roomId);

    const isOnlineSession = searchParams.get('is_online_session');
    if (isOnlineSession !== null) {
      whereConditions.is_online_session = isOnlineSession === 'true';
    }

    // Department filter (by subject department)
    const department = searchParams.get('department');
    if (department) {
      whereConditions.subjects = { department };
    }

    const status = searchParams.get('status');
    if (status) whereConditions.status = status;

    const isRoomFallback = searchParams.get('is_room_fallback');
    if (isRoomFallback !== null) {
      whereConditions.is_room_fallback = isRoomFallback === 'true';
    }

    const hasTimetableAccess = user.role === 'admin' || user.has_timetable_admin === true;

    // Without timetable access, users only see their own slots
    if (!hasTimetableAccess) {
      whereConditions.employee_id = user.id;
    }

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
      { error: 'Failed to fetch timetable', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/timetable
 * Create a new timetable slot (Admin or Timetable Admin only).
 *
 * Optional combined_class_ids: other classes taught together with the primary
 * class in the same slot (same trainer, room, day and period). Each class gets
 * its own row, all sharing one session_group_id — the same structure the
 * generator produces.
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
      is_online_session = false
    } = body;

    // Validation
    if (!term_id || !class_id || !subject_id || !employee_id || !room_id || !lesson_period_id || day_of_week === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: term_id, class_id, subject_id, employee_id, room_id, lesson_period_id, day_of_week' },
        { status: 400 }
      );
    }

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

    if (!term) return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    if (!classRecord) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    if (!trainer) return NextResponse.json({ error: 'Trainer not found' }, { status: 404 });
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (!lessonPeriod) return NextResponse.json({ error: 'Lesson period not found' }, { status: 404 });

    if (is_online_session && !subject.can_be_online) {
      return NextResponse.json({
        error: 'Subject cannot be online',
        details: `${subject.name} (${subject.code}) is not configured to allow online sessions`
      }, { status: 400 });
    }

    // Class must be assigned to this term
    const termClass = await db.termclasses.findUnique({
      where: { term_id_class_id: { term_id, class_id } }
    });

    if (!termClass) {
      return NextResponse.json({
        error: 'Class not assigned to term',
        details: `${classRecord.name} (${classRecord.code}) must be assigned to ${term.name} before scheduling subjects`
      }, { status: 400 });
    }

    // Subject must be assigned to this class for this term
    const classSubject = await db.classsubjects.findFirst({
      where: { class_id, subject_id, term_id }
    });

    if (!classSubject) {
      return NextResponse.json({
        error: 'Subject not assigned to class for this term',
        details: `${subject.name} (${subject.code}) must be assigned to ${classRecord.name} for ${term.name} before scheduling`
      }, { status: 400 });
    }

    // ── Combined classes ──────────────────────────────────────────────────
    const combinedIds: number[] = [...new Set<number>((body.combined_class_ids ?? []).map(Number))]
      .filter(id => id !== class_id);

    const badCodes = await invalidCombinedClasses(term_id, subject_id, combinedIds);
    if (badCodes.length) {
      return NextResponse.json({
        error: 'Cannot combine these classes',
        details: `${badCodes.join(', ')} ${badCodes.length === 1 ? 'does' : 'do'} not take ${subject.name} this term`
      }, { status: 400 });
    }

    // ── Conflicts: trainer, room (non-workshop), and every class involved ──
    const conflicts = await findConflicts({
      termId: term_id,
      day: day_of_week,
      periodId: lesson_period_id,
      roomId: room_id,
      trainerId: employee_id,
      classIds: [class_id, ...combinedIds],
    });

    if (conflicts.length) {
      return NextResponse.json(
        { error: 'Scheduling conflict', details: conflicts.join('\n'), conflicts },
        { status: 409 }
      );
    }

    // ── Create one row per class, sharing a session group ─────────────────
    const now = new Date();
    const sessionGroupId = combinedIds.length ? crypto.randomUUID() : null;
    const base = {
      term_id,
      subject_id,
      employee_id,
      room_id,
      lesson_period_id,
      day_of_week,
      status,
      is_online_session,
      ...(sessionGroupId && {
        session_group_id: sessionGroupId,
        combined_class_ids: [class_id, ...combinedIds],
      }),
      created_at: now,
      updated_at: now,
    };

    const [timetableSlot] = await db.$transaction([
      db.timetableslots.create({
        data: { ...base, id: crypto.randomUUID(), class_id },
        include: {
          classes: true,
          subjects: true,
          rooms: true,
          lessonperiods: true,
          users: true,
          terms: true
        }
      }),
      ...combinedIds.map(cid =>
        db.timetableslots.create({
          data: { ...base, id: crypto.randomUUID(), class_id: cid }
        })
      ),
    ]);

    const combinedNote = combinedIds.length
      ? ` (combined with ${combinedIds.length} class${combinedIds.length > 1 ? 'es' : ''})`
      : '';

    return NextResponse.json({
      success: true,
      message: `Timetable slot created successfully${combinedNote}${is_online_session ? ' (Online Session)' : ''}`,
      data: timetableSlot
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating timetable slot:', error);
    return NextResponse.json(
      { error: 'Failed to create timetable slot', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/timetable
 * Quick updates to a slot: online flag, status, or room.
 */
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
      return NextResponse.json({ error: 'Timetable slot ID is required' }, { status: 400 });
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

      // Workshops are exempt inside findConflicts. The slot's own combined
      // siblings are excluded so a group can be moved one row at a time.
      const conflicts = await findConflicts({
        termId: existingSlot.term_id,
        day: existingSlot.day_of_week,
        periodId: existingSlot.lesson_period_id,
        roomId: room_id,
        trainerId: existingSlot.employee_id,
        classIds: [],                                   // only the room is changing
        excludeIds: [id],
        excludeGroupId: existingSlot.session_group_id,
        skipTrainer: true,
      });

      if (conflicts.length) {
        return NextResponse.json(
          { error: 'Room conflict', details: conflicts.join('\n'), conflicts },
          { status: 409 }
        );
      }

      // Auto-flag RNA: if the new room is named RNA, mark as room fallback
      const isRna =
        newRoom.name?.toUpperCase() === 'RNA' ||
        newRoom.name?.toUpperCase().includes('RNA');

      isRoomFallback = isRna;
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
          ? is_online_session ? '(marked as online)' : '(marked as physical)'
          : null,
        room_id !== undefined && isRoomFallback
          ? '(moved to RNA room fallback)'
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