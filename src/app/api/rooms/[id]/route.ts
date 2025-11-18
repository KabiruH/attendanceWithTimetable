// app/api/rooms/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/rooms/[id]
 * Get a specific room by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const roomId = parseInt(resolvedParams.id);

    if (isNaN(roomId)) {
      return NextResponse.json(
        { error: 'Invalid room ID' },
        { status: 400 }
      );
    }

    const room = await prisma.rooms.findUnique({
      where: { id: roomId },
      include: {
        _count: {
          select: {
            timetableslots: true
          }
        }
      }
    });

    if (!room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: room
    });

  } catch (error: any) {
    console.error('Error fetching room:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch room',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/rooms/[id]
 * Update a room
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const roomId = parseInt(resolvedParams.id);

    if (isNaN(roomId)) {
      return NextResponse.json(
        { error: 'Invalid room ID' },
        { status: 400 }
      );
    }

    // Check if room exists
    const existingRoom = await prisma.rooms.findUnique({
      where: { id: roomId }
    });

    if (!existingRoom) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, capacity, room_type, equipment, department, is_active } = body;

    // Prepare update data
    const updateData: any = {};

    if (name !== undefined) {
      // Check if new name conflicts with another room
      const nameConflict = await prisma.rooms.findFirst({
        where: {
          name: name.trim(),
          id: { not: roomId },
          is_active: true
        }
      });

      if (nameConflict) {
        return NextResponse.json(
          { error: 'A room with this name already exists' },
          { status: 409 }
        );
      }

      updateData.name = name.trim();
    }

    if (capacity !== undefined) updateData.capacity = capacity;
    if (room_type !== undefined) updateData.room_type = room_type;
    if (equipment !== undefined) updateData.equipment = equipment;
    if (department !== undefined) updateData.department = department;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Update the room
    const updatedRoom = await prisma.rooms.update({
      where: { id: roomId },
      data: updateData,
      include: {
        _count: {
          select: {
            timetableslots: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Room updated successfully',
      data: updatedRoom
    });

  } catch (error: any) {
    console.error('Error updating room:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update room',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rooms/[id]
 * Delete a room (soft delete by setting is_active to false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const roomId = parseInt(resolvedParams.id);

    if (isNaN(roomId)) {
      return NextResponse.json(
        { error: 'Invalid room ID' },
        { status: 400 }
      );
    }

    // Check if room has associated timetable slots
    const slotsCount = await prisma.timetableslots.count({
      where: { room_id: roomId }
    });

    if (slotsCount > 0) {
      // Soft delete - just deactivate
      const updatedRoom = await prisma.rooms.update({
        where: { id: roomId },
        data: { is_active: false }
      });

      return NextResponse.json({
        success: true,
        message: `Room deactivated (used in ${slotsCount} timetable slots)`,
        data: updatedRoom
      });
    } else {
      // Hard delete if no associated data
      await prisma.rooms.delete({
        where: { id: roomId }
      });

      return NextResponse.json({
        success: true,
        message: 'Room deleted successfully'
      });
    }

  } catch (error: any) {
    console.error('Error deleting room:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete room',
        details: error.message 
      },
      { status: 500 }
    );
  }
}