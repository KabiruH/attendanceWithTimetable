// app/api/timetable/[id]/route.ts
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

    // Verify user is still active and get has_timetable_admin
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, department: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// Helper function to check if user has timetable admin access
function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

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
    const params = await context.params;
    const slotId = params.id;

    const timetableSlot = await db.timetableslots.findUnique({
      where: { id: slotId },
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
      }
    });

    if (!timetableSlot) {
      return NextResponse.json(
        { error: 'Timetable slot not found' },
        { status: 404 }
      );
    }

    // If not admin or timetable admin, only allow viewing their own slots
    if (!hasTimetableAdminAccess(user) && timetableSlot.employee_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: timetableSlot
    });

  } catch (error: any) {
    console.error('Error fetching timetable slot:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch timetable slot',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/timetable/[id]
 * Update a timetable slot (reschedule)
 * Admin/Timetable Admin: Can update any slot
 * Trainer: Can only reschedule their own slots
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
    const params = await context.params;
    const slotId = params.id;

    // Get existing slot
    const existingSlot = await db.timetableslots.findUnique({
      where: { id: slotId }
    });

    if (!existingSlot) {
      return NextResponse.json(
        { error: 'Timetable slot not found' },
        { status: 404 }
      );
    }

    // Check authorization
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
      status
    } = body;

    // Prepare update data
    const updateData: any = {};
    
    if (term_id !== undefined) updateData.term_id = term_id;
    if (class_id !== undefined) updateData.class_id = class_id;
    if (subject_id !== undefined) updateData.subject_id = subject_id;
    
    if (employee_id !== undefined) {
      // Only admin or timetable admin can change trainer
      if (!isAdminOrTimetableAdmin) {
        return NextResponse.json(
          { error: 'Only admin or timetable admin can change the assigned trainer' },
          { status: 403 }
        );
      }
      updateData.employee_id = employee_id;
    }
    
    if (room_id !== undefined) updateData.room_id = room_id;
    if (lesson_period_id !== undefined) updateData.lesson_period_id = lesson_period_id;
    
    if (day_of_week !== undefined) {
      // Validate day_of_week
      if (day_of_week < 0 || day_of_week > 6) {
        return NextResponse.json(
          { error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)' },
          { status: 400 }
        );
      }
      updateData.day_of_week = day_of_week;
    }
    
    if (status !== undefined) updateData.status = status;

    // ✅ Validate class-subject relationship if being changed
    if (class_id !== undefined || subject_id !== undefined) {
      const checkClassId = class_id ?? existingSlot.class_id;
      const checkSubjectId = subject_id ?? existingSlot.subject_id;
      const checkTermId = term_id ?? existingSlot.term_id;

      const classSubject = await db.classsubjects.findFirst({
        where: {
          class_id: checkClassId,
          subject_id: checkSubjectId,
          term_id: checkTermId
        }
      });

      if (!classSubject) {
        return NextResponse.json({
          error: 'Invalid class-subject combination',
          details: 'The subject must be assigned to the class for this term'
        }, { status: 400 });
      }
    }

    // Check for conflicts if rescheduling
    if (room_id !== undefined || lesson_period_id !== undefined || day_of_week !== undefined) {
      const checkRoomId = room_id ?? existingSlot.room_id;
      const checkPeriodId = lesson_period_id ?? existingSlot.lesson_period_id;
      const checkDay = day_of_week ?? existingSlot.day_of_week;
      const checkTrainerId = employee_id ?? existingSlot.employee_id;
      const checkTermId = term_id ?? existingSlot.term_id;

      const conflictingSlot = await db.timetableslots.findFirst({
        where: {
          id: { not: slotId }, // Exclude current slot
          term_id: checkTermId,
          day_of_week: checkDay,
          lesson_period_id: checkPeriodId,
          OR: [
            { room_id: checkRoomId }, // Same room
            { employee_id: checkTrainerId } // Same trainer
          ]
        },
        include: {
          classes: { select: { name: true, code: true } },
          subjects: { select: { name: true, code: true } },
          rooms: { select: { name: true } },
          users: { select: { name: true } }
        }
      });

      if (conflictingSlot) {
        let conflictMessage = '';
        if (conflictingSlot.room_id === checkRoomId) {
          conflictMessage = `Room ${conflictingSlot.rooms.name} is already booked for ${conflictingSlot.subjects.name} (${conflictingSlot.classes.name}) at this time`;
        } else if (conflictingSlot.employee_id === checkTrainerId) {
          conflictMessage = `Trainer ${conflictingSlot.users.name} is already scheduled for ${conflictingSlot.subjects.name} (${conflictingSlot.classes.name}) at this time`;
        }
        
        return NextResponse.json(
          { error: 'Scheduling conflict', details: conflictMessage },
          { status: 409 }
        );
      }
    }

    // Update the slot
    const updatedSlot = await db.timetableslots.update({
      where: { id: slotId },
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
      message: 'Timetable slot updated successfully',
      data: updatedSlot
    });

  } catch (error: any) {
    console.error('Error updating timetable slot:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update timetable slot',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/timetable/[id]
 * Delete a timetable slot (Admin/Timetable Admin only)
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
    const params = await context.params;
    const slotId = params.id;

    // Only admin or timetable admin can delete slots
    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Only admin or timetable admin can delete timetable slots.' },
        { status: 403 }
      );
    }

    // Check if slot exists
    const existingSlot = await db.timetableslots.findUnique({
      where: { id: slotId },
      include: {
        classes: { select: { name: true, code: true } },
        subjects: { select: { name: true, code: true } }
      }
    });

    if (!existingSlot) {
      return NextResponse.json(
        { error: 'Timetable slot not found' },
        { status: 404 }
      );
    }

    // Delete the slot
    await db.timetableslots.delete({
      where: { id: slotId }
    });

    return NextResponse.json({
      success: true,
      message: `Timetable slot for ${existingSlot.subjects.name} (${existingSlot.classes.name}) deleted successfully`
    });

  } catch (error: any) {
    console.error('Error deleting timetable slot:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete timetable slot',
        details: error.message 
      },
      { status: 500 }
    );
  }
}