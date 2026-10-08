// app/api/timetable/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { verifyAuth } from '@/lib/auth/verify-auth';
import { db } from '@/lib/db/db';
import { findConflicts, invalidCombinedClasses } from '@/lib/timetable/conficts';

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

const SLOT_INCLUDE = {
  classes: true,
  subjects: true,
  rooms: true,
  lessonperiods: true,
  users: true,
  terms: true,
} as const;

/**
 * GET /api/timetable/[id]
 * Get a specific timetable slot by ID
 */
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
    const { id: slotId } = await context.params;

    const timetableSlot = await db.timetableslots.findUnique({
      where: { id: slotId },
      include: {
        classes: {
          select: { id: true, name: true, code: true, description: true, department: true, duration_hours: true }
        },
        subjects: {
          select: { id: true, name: true, code: true, department: true, credit_hours: true, description: true }
        },
        rooms: {
          select: { id: true, name: true, capacity: true, room_type: true }
        },
        lessonperiods: {
          select: { id: true, name: true, start_time: true, end_time: true, duration: true }
        },
        users: {
          select: { id: true, name: true, role: true, department: true }
        },
        terms: {
          select: { id: true, name: true, start_date: true, end_date: true, is_active: true }
        }
      }
    });

    if (!timetableSlot) {
      return NextResponse.json({ error: 'Timetable slot not found' }, { status: 404 });
    }

    // Without timetable access, users may only view their own slots
    if (!hasTimetableAdminAccess(user) && timetableSlot.employee_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: timetableSlot });

  } catch (error: any) {
    console.error('Error fetching timetable slot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timetable slot', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/timetable/[id]
 * Update a timetable slot (reschedule, change room/trainer, combine classes).
 *
 * Combined classes are stored as separate rows sharing a session_group_id.
 * Doubles and triples also share it across their periods, so "siblings here"
 * means rows in the same group at the same day and period.
 *
 * - Changes to day, period, room and status move every class at this period
 *   together, so a combined group never splits.
 * - A trainer change only follows siblings that had the same trainer, so
 *   multi-trainer groups from the generator keep their own trainers.
 * - combined_class_ids (admin only) adds or removes classes across every
 *   period of the block. Omit it to leave combinations untouched.
 * - Workshop rooms allow multiple simultaneous bookings.
 * - Moving to the RNA room sets is_room_fallback; moving away clears it.
 */
export async function PUT(
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
    const { id: slotId } = await context.params;

    const existingSlot = await db.timetableslots.findUnique({ where: { id: slotId } });
    if (!existingSlot) {
      return NextResponse.json({ error: 'Timetable slot not found' }, { status: 404 });
    }

    const isAdminOrTimetableAdmin = hasTimetableAdminAccess(user);
    const isOwnSlot = existingSlot.employee_id === user.id;

    if (!isAdminOrTimetableAdmin && !isOwnSlot) {
      return NextResponse.json(
        { error: 'Unauthorized. You can only update your own slots.' },
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
      status,
      combined_class_ids,
    } = body;

    // ── Build update data for the edited row ──────────────────────────────
    const updateData: any = {};

    if (term_id !== undefined) updateData.term_id = term_id;
    if (class_id !== undefined) updateData.class_id = class_id;
    if (subject_id !== undefined) updateData.subject_id = subject_id;

    if (employee_id !== undefined && employee_id !== existingSlot.employee_id) {
      if (!isAdminOrTimetableAdmin) {
        return NextResponse.json(
          { error: 'Only admin or timetable admin can change the assigned trainer' },
          { status: 403 }
        );
      }
    }
    if (employee_id !== undefined) updateData.employee_id = employee_id;

    if (room_id !== undefined) updateData.room_id = room_id;
    if (lesson_period_id !== undefined) updateData.lesson_period_id = lesson_period_id;

    if (day_of_week !== undefined) {
      if (day_of_week < 0 || day_of_week > 6) {
        return NextResponse.json(
          { error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)' },
          { status: 400 }
        );
      }
      updateData.day_of_week = day_of_week;
    }

    if (status !== undefined) updateData.status = status;

    // ── Class-subject relationship ────────────────────────────────────────
    const checkTermIdForSubject = term_id ?? existingSlot.term_id;
    const checkSubjectId = subject_id ?? existingSlot.subject_id;

    if (class_id !== undefined || subject_id !== undefined) {
      const classSubject = await db.classsubjects.findFirst({
        where: {
          class_id: class_id ?? existingSlot.class_id,
          subject_id: checkSubjectId,
          term_id: checkTermIdForSubject,
        }
      });

      if (!classSubject) {
        return NextResponse.json({
          error: 'Invalid class-subject combination',
          details: 'The subject must be assigned to the class for this term'
        }, { status: 400 });
      }
    }

    // ── Combined group context ────────────────────────────────────────────
    const groupRows = existingSlot.session_group_id
      ? await db.timetableslots.findMany({ where: { session_group_id: existingSlot.session_group_id } })
      : [existingSlot];

    const isSamePeriod = (r: { day_of_week: number; lesson_period_id: number }) =>
      r.day_of_week === existingSlot.day_of_week &&
      r.lesson_period_id === existingSlot.lesson_period_id;

    const siblingsHere = groupRows.filter(r => r.id !== slotId && isSamePeriod(r));
    const currentCombined = [...new Set(siblingsHere.map(r => r.class_id))];
    const primaryId: number = class_id ?? existingSlot.class_id;

    // Only timetable admins can change combinations; anyone else's request
    // leaves them as they are.
    const desiredCombined: number[] =
      isAdminOrTimetableAdmin && Array.isArray(combined_class_ids)
        ? [...new Set<number>(combined_class_ids.map(Number))].filter(id => id !== primaryId)
        : currentCombined.filter(id => id !== primaryId);

    const added   = desiredCombined.filter(id => !currentCombined.includes(id));
    const removed = currentCombined.filter(id => !desiredCombined.includes(id));

    // The primary class's rows at the other periods of a double/triple
    const otherPeriodRows = groupRows.filter(
      r => !isSamePeriod(r) && r.class_id === existingSlot.class_id
    );

    const badCodes = await invalidCombinedClasses(checkTermIdForSubject, checkSubjectId, added);
    if (badCodes.length) {
      return NextResponse.json({
        error: 'Cannot combine these classes',
        details: `${badCodes.join(', ')} ${badCodes.length === 1 ? 'does' : 'do'} not take this subject this term`,
      }, { status: 400 });
    }

    // ── Conflict checks ───────────────────────────────────────────────────
    const needsCheck =
      room_id !== undefined || lesson_period_id !== undefined || day_of_week !== undefined ||
      employee_id !== undefined || class_id !== undefined || added.length > 0;

    if (needsCheck) {
      const checkRoomId    = room_id          ?? existingSlot.room_id;
      const checkPeriodId  = lesson_period_id ?? existingSlot.lesson_period_id;
      const checkDay       = day_of_week      ?? existingSlot.day_of_week;
      const checkTrainerId = employee_id      ?? existingSlot.employee_id;
      const checkTermId    = term_id          ?? existingSlot.term_id;

      const checkRoom = await db.rooms.findUnique({
        where: { id: checkRoomId },
        select: { name: true, room_type: true }
      });

      const isWorkshopRoom = checkRoom?.room_type?.toLowerCase() === 'workshop';

      // Auto-set is_room_fallback when the slot moves to or from RNA
      if (room_id !== undefined) {
        const isRna =
          checkRoom?.name?.toUpperCase() === 'RNA' ||
          (checkRoom?.name?.toUpperCase().includes('RNA') ?? false);
        updateData.is_room_fallback = isRna;
        // Moving out of RNA also clears TFL/CNA back to scheduled
        if (!isRna && (existingSlot.status === 'TFL' || existingSlot.status === 'CNA')) {
          updateData.status = 'scheduled';
        }
      }

      // TFL/CNA/RNA slots were force-placed knowing the trainer was already
      // double-booked. Skip the trainer check so the admin can move them.
      const isForceplacedSlot =
        existingSlot.status === 'TFL' ||
        existingSlot.status === 'CNA' ||
        existingSlot.is_room_fallback === true;

      const skipRoomCheck    = isWorkshopRoom;
      const skipTrainerCheck = isForceplacedSlot;

      // Trainer, room, and every class that will be in this period
      const conflicts = await findConflicts({
        termId: checkTermId,
        day: checkDay,
        periodId: checkPeriodId,
        roomId: checkRoomId,
        trainerId: checkTrainerId,
        classIds: [primaryId, ...desiredCombined],
        excludeIds: [slotId],
        excludeGroupId: existingSlot.session_group_id,
        skipRoom: skipRoomCheck,
        skipTrainer: skipTrainerCheck,
      });

      if (conflicts.length) {
        return NextResponse.json(
          { error: 'Scheduling conflict', details: conflicts.join('\n'), conflicts },
          { status: 409 }
        );
      }

      // Multi-trainer groups: every other trainer moving with the group
      // must also be free at the target time
      if (!skipTrainerCheck) {
        const otherTrainerIds = [...new Set(
          siblingsHere
            .filter(r => !removed.includes(r.class_id) && r.employee_id !== existingSlot.employee_id)
            .map(r => r.employee_id)
        )];

        for (const tid of otherTrainerIds) {
          const clashes = await findConflicts({
            termId: checkTermId,
            day: checkDay,
            periodId: checkPeriodId,
            roomId: checkRoomId,
            trainerId: tid,
            classIds: [],
            excludeIds: [slotId],
            excludeGroupId: existingSlot.session_group_id,
            skipRoom: true,
          });
          if (clashes.length) {
            return NextResponse.json(
              { error: 'Scheduling conflict', details: clashes.join('\n'), conflicts: clashes },
              { status: 409 }
            );
          }
        }
      }
    }

    // Newly added classes must also be free at the other periods of a
    // double/triple (room and trainer are already the group's)
    for (const tpl of added.length ? otherPeriodRows : []) {
      const clashes = await findConflicts({
        termId: tpl.term_id,
        day: tpl.day_of_week,
        periodId: tpl.lesson_period_id,
        roomId: tpl.room_id,
        trainerId: tpl.employee_id,
        classIds: added,
        excludeGroupId: existingSlot.session_group_id,
        skipRoom: true,
        skipTrainer: true,
      });
      if (clashes.length) {
        return NextResponse.json(
          { error: 'Scheduling conflict', details: clashes.join('\n'), conflicts: clashes },
          { status: 409 }
        );
      }
    }

    // ── Apply everything in one transaction ───────────────────────────────
    const now = new Date();
    const groupId =
      existingSlot.session_group_id ?? (desiredCombined.length ? crypto.randomUUID() : null);

    updateData.updated_at = now;
    if (groupId && !existingSlot.session_group_id) updateData.session_group_id = groupId;

    // class_id and employee_id are per-row; everything else is shared by the
    // classes at this period
    const { class_id: _primaryOnly, employee_id: newTrainerId, ...sharedData } = updateData;

    const keptSiblingIds = siblingsHere
      .filter(r => !removed.includes(r.class_id))
      .map(r => r.id);

    const thisPeriod = { ...existingSlot, ...updateData };

    const rowFrom = (tpl: any, cid: number) => ({
      id: crypto.randomUUID(),
      class_id: cid,
      session_group_id: groupId,
      term_id: tpl.term_id,
      subject_id: tpl.subject_id,
      employee_id: tpl.employee_id,
      room_id: tpl.room_id,
      lesson_period_id: tpl.lesson_period_id,
      day_of_week: tpl.day_of_week,
      status: tpl.status,
      is_online_session: tpl.is_online_session,
      is_room_fallback: tpl.is_room_fallback,
      created_at: now,
      updated_at: now,
    });

    const ops: any[] = [
      db.timetableslots.update({
        where: { id: slotId },
        data: updateData,
        include: SLOT_INCLUDE,
      }),
    ];

    // Move the other classes at this period with the edited row
    if (keptSiblingIds.length) {
      ops.push(db.timetableslots.updateMany({
        where: { id: { in: keptSiblingIds } },
        data: sharedData,
      }));
    }

    // A trainer change only follows siblings that had the same trainer
    if (newTrainerId !== undefined && newTrainerId !== existingSlot.employee_id) {
      const sameTrainerIds = siblingsHere
        .filter(r => keptSiblingIds.includes(r.id) && r.employee_id === existingSlot.employee_id)
        .map(r => r.id);
      if (sameTrainerIds.length) {
        ops.push(db.timetableslots.updateMany({
          where: { id: { in: sameTrainerIds } },
          data: { employee_id: newTrainerId },
        }));
      }
    }

    // Remove classes taken out of the combination, across every period of
    // the block (never the row being edited)
    if (removed.length && groupId) {
      ops.push(db.timetableslots.deleteMany({
        where: { session_group_id: groupId, class_id: { in: removed }, id: { not: slotId } },
      }));
    }

    // Add new classes at this period and at the other periods of the block
    for (const cid of added) {
      ops.push(db.timetableslots.create({ data: rowFrom(thisPeriod, cid) }));
      for (const tpl of otherPeriodRows) {
        ops.push(db.timetableslots.create({ data: rowFrom(tpl, cid) }));
      }
    }

    // Keep combined_class_ids in sync, as the generator does
    if (groupId && (added.length || removed.length)) {
      const finalIds = [primaryId, ...desiredCombined];
      ops.push(db.timetableslots.updateMany({
        where: { session_group_id: groupId },
        data: { combined_class_ids: finalIds.length > 1 ? finalIds : Prisma.DbNull },
      }));
    }

    const [updatedSlot] = await db.$transaction(ops);

    const changes = [
      added.length ? `${added.length} class${added.length > 1 ? 'es' : ''} combined` : null,
      removed.length ? `${removed.length} class${removed.length > 1 ? 'es' : ''} removed from combination` : null,
    ].filter(Boolean);

    return NextResponse.json({
      success: true,
      message: `Timetable slot updated successfully${changes.length ? ` (${changes.join(', ')})` : ''}`,
      data: updatedSlot,
    });

  } catch (error: any) {
    console.error('Error updating timetable slot:', error);
    return NextResponse.json(
      { error: 'Failed to update timetable slot', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/timetable/[id]
 * Delete a timetable slot (Admin/Timetable Admin only).
 * If the slot belongs to a combined group, the remaining rows keep the group
 * and their combined_class_ids are updated to match.
 */
export async function DELETE(
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
    const { id: slotId } = await context.params;

    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Only admin or timetable admin can delete timetable slots.' },
        { status: 403 }
      );
    }

    const existingSlot = await db.timetableslots.findUnique({
      where: { id: slotId },
      include: {
        classes: { select: { name: true, code: true } },
        subjects: { select: { name: true, code: true } }
      }
    });

    if (!existingSlot) {
      return NextResponse.json({ error: 'Timetable slot not found' }, { status: 404 });
    }

    await db.timetableslots.delete({ where: { id: slotId } });

    // Keep the rest of a combined group consistent
    if (existingSlot.session_group_id) {
      const remaining = await db.timetableslots.findMany({
        where: { session_group_id: existingSlot.session_group_id },
        select: { class_id: true },
      });
      const classIds = [...new Set(remaining.map(r => r.class_id))];
      if (remaining.length) {
        await db.timetableslots.updateMany({
          where: { session_group_id: existingSlot.session_group_id },
          data: { combined_class_ids: classIds.length > 1 ? classIds : Prisma.DbNull },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Timetable slot for ${existingSlot.subjects.name} (${existingSlot.classes.name}) deleted successfully`
    });

  } catch (error: any) {
    console.error('Error deleting timetable slot:', error);
    return NextResponse.json(
      { error: 'Failed to delete timetable slot', details: error.message },
      { status: 500 }
    );
  }
}