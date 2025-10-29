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

    const timetableSlot = await db.timetableSlots.findUnique({
      where: { id: slotId },
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
      }
    });

    if (!timetableSlot) {
      return NextResponse.json(
        { error: 'Timetable slot not found' },
        { status: 404 }
      );
    }

    // If not admin, only allow viewing their own slots
    if (user.role !== 'admin' && timetableSlot.employee_id !== user.id) {
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
 * Admin: Can update any slot
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
    const existingSlot = await db.timetableSlots.findUnique({
      where: { id: slotId }
    });

    if (!existingSlot) {
      return NextResponse.json(
        { error: 'Timetable slot not found' },
        { status: 404 }
      );
    }

    // Check authorization
    const isAdmin = user.role === 'admin';
    const isOwnSlot = existingSlot.employee_id === user.id;

    if (!isAdmin && !isOwnSlot) {
      return NextResponse.json(
        { error: 'Unauthorized. You can only update your own slots.' },
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
      status
    } = body;

    // Prepare update data
    const updateData: any = {};
    
    if (term_id !== undefined) updateData.term_id = term_id;
    if (class_id !== undefined) updateData.class_id = class_id;
    if (employee_id !== undefined) {
      // Only admin can change trainer
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Only admin can change the assigned trainer' },
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

    // Check for conflicts if rescheduling
    if (room_id !== undefined || lesson_period_id !== undefined || day_of_week !== undefined) {
      const checkRoomId = room_id ?? existingSlot.room_id;
      const checkPeriodId = lesson_period_id ?? existingSlot.lesson_period_id;
      const checkDay = day_of_week ?? existingSlot.day_of_week;
      const checkTrainerId = employee_id ?? existingSlot.employee_id;
      const checkTermId = term_id ?? existingSlot.term_id;

      const conflictingSlot = await db.timetableSlots.findFirst({
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
          class: { select: { name: true, code: true } },
          room: { select: { name: true } },
          trainer: { select: { name: true } }
        }
      });

      if (conflictingSlot) {
        let conflictMessage = '';
        if (conflictingSlot.room_id === checkRoomId) {
          conflictMessage = `Room ${conflictingSlot.room.name} is already booked for ${conflictingSlot.class.name} at this time`;
        } else if (conflictingSlot.employee_id === checkTrainerId) {
          conflictMessage = `Trainer ${conflictingSlot.trainer.name} is already scheduled for ${conflictingSlot.class.name} at this time`;
        }
        
        return NextResponse.json(
          { error: 'Scheduling conflict', details: conflictMessage },
          { status: 409 }
        );
      }
    }

    // Update the slot
    const updatedSlot = await db.timetableSlots.update({
      where: { id: slotId },
      data: updateData,
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
 * Delete a timetable slot (Admin only)
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

    // Only admin can delete slots
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Only admin can delete timetable slots.' },
        { status: 403 }
      );
    }

    // Check if slot exists
    const existingSlot = await db.timetableSlots.findUnique({
      where: { id: slotId },
      include: {
        class: { select: { name: true, code: true } }
      }
    });

    if (!existingSlot) {
      return NextResponse.json(
        { error: 'Timetable slot not found' },
        { status: 404 }
      );
    }

    // Delete the slot
    await db.timetableSlots.delete({
      where: { id: slotId }
    });

    return NextResponse.json({
      success: true,
      message: `Timetable slot for ${existingSlot.class.name} deleted successfully`
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