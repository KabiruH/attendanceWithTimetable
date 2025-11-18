// app/api/lesson-periods/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/lesson-periods/[id]
 * Get a specific lesson period by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const periodId = parseInt(resolvedParams.id);

    if (isNaN(periodId)) {
      return NextResponse.json(
        { error: 'Invalid lesson period ID' },
        { status: 400 }
      );
    }

    const lessonPeriod = await prisma.lessonperiods.findUnique({
      where: { id: periodId },
      include: {
        _count: {
          select: {
            timetableslots: true
          }
        }
      }
    });

    if (!lessonPeriod) {
      return NextResponse.json(
        { error: 'Lesson period not found' },
        { status: 404 }
      );
    }

    // Format times for better readability
    const formattedPeriod = {
      ...lessonPeriod,
      start_time_formatted: lessonPeriod.start_time.toTimeString().slice(0, 5),
      end_time_formatted: lessonPeriod.end_time.toTimeString().slice(0, 5)
    };

    return NextResponse.json({
      success: true,
      data: formattedPeriod
    });

  } catch (error: any) {
    console.error('Error fetching lesson period:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch lesson period',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/lesson-periods/[id]
 * Update a lesson period
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
      const resolvedParams = await params;
    const periodId = parseInt(resolvedParams.id);

    if (isNaN(periodId)) {
      return NextResponse.json(
        { error: 'Invalid lesson period ID' },
        { status: 400 }
      );
    }

    // Check if lesson period exists
    const existingPeriod = await prisma.lessonperiods.findUnique({
      where: { id: periodId }
    });

    if (!existingPeriod) {
      return NextResponse.json(
        { error: 'Lesson period not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, start_time, end_time, is_active } = body;

    // Prepare update data
    const updateData: any = {};

    if (name !== undefined) updateData.name = name.trim();
    if (is_active !== undefined) updateData.is_active = is_active;

    // Handle time updates
    if (start_time !== undefined || end_time !== undefined) {
      const startTime = start_time 
        ? new Date(`1970-01-01T${start_time}`)
        : existingPeriod.start_time;
      
      const endTime = end_time 
        ? new Date(`1970-01-01T${end_time}`)
        : existingPeriod.end_time;

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return NextResponse.json(
          { error: 'Invalid time format. Use HH:MM:SS or HH:MM' },
          { status: 400 }
        );
      }

      if (startTime >= endTime) {
        return NextResponse.json(
          { error: 'Start time must be before end time' },
          { status: 400 }
        );
      }

      // Calculate new duration
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));

      // Check for overlapping periods (excluding current period)
      const overlappingPeriod = await prisma.lessonperiods.findFirst({
        where: {
          id: { not: periodId },
          is_active: true,
          OR: [
            {
              AND: [
                { start_time: { lt: endTime } },
                { end_time: { gt: startTime } }
              ]
            }
          ]
        }
      });

      if (overlappingPeriod) {
        return NextResponse.json(
          { 
            error: 'Updated time slot overlaps with an existing lesson period',
            overlapping_period: overlappingPeriod
          },
          { status: 409 }
        );
      }

      if (start_time) updateData.start_time = startTime;
      if (end_time) updateData.end_time = endTime;
      updateData.duration = durationMinutes;
    }

    // Update the lesson period
    const updatedPeriod = await prisma.lessonperiods.update({
      where: { id: periodId },
      data: updateData,
      include: {
        _count: {
          select: {
            timetableslots: true
          }
        }
      }
    });

    // Format times for response
    const formattedPeriod = {
      ...updatedPeriod,
      start_time_formatted: updatedPeriod.start_time.toTimeString().slice(0, 5),
      end_time_formatted: updatedPeriod.end_time.toTimeString().slice(0, 5)
    };

    return NextResponse.json({
      success: true,
      message: 'Lesson period updated successfully',
      data: formattedPeriod
    });

  } catch (error: any) {
    console.error('Error updating lesson period:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update lesson period',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/lesson-periods/[id]
 * Delete a lesson period (soft delete by setting is_active to false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const periodId = parseInt(resolvedParams.id);

    if (isNaN(periodId)) {
      return NextResponse.json(
        { error: 'Invalid lesson period ID' },
        { status: 400 }
      );
    }

    // Check if period has associated timetable slots
    const slotsCount = await prisma.timetableslots.count({
      where: { lesson_period_id: periodId }
    });

    if (slotsCount > 0) {
      // Soft delete - just deactivate
      const updatedPeriod = await prisma.lessonperiods.update({
        where: { id: periodId },
        data: { is_active: false }
      });

      return NextResponse.json({
        success: true,
        message: `Lesson period deactivated (used in ${slotsCount} timetable slots)`,
        data: updatedPeriod
      });
    } else {
      // Hard delete if no associated data
      await prisma.lessonperiods.delete({
        where: { id: periodId }
      });

      return NextResponse.json({
        success: true,
        message: 'Lesson period deleted successfully'
      });
    }

  } catch (error: any) {
    console.error('Error deleting lesson period:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete lesson period',
        details: error.message 
      },
      { status: 500 }
    );
  }
}