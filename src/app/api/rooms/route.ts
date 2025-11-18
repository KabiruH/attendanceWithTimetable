// app/api/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/rooms
 * Create a new room
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, capacity, room_type, equipment, department } = body;

    // Validation
    if (!name) {
      return NextResponse.json(
        { error: 'Room name is required' },
        { status: 400 }
      );
    }

    // Check if room name already exists
    const existingRoom = await prisma.rooms.findFirst({
      where: { 
        name: name.trim(),
        is_active: true
      }
    });

    if (existingRoom) {
      return NextResponse.json(
        { error: 'A room with this name already exists' },
        { status: 409 }
      );
    }

    // Create the room
  const now = new Date();
const room = await prisma.rooms.create({
  data: {
    name: name.trim(),
    capacity: capacity || null,
    room_type: room_type || null,
    equipment: equipment || null,
    department: department || null,
    is_active: true,
    updated_at: now
  }
});


    return NextResponse.json(
      {
        success: true,
        message: 'Room created successfully',
        data: room
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('Error creating room:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create room',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rooms
 * Get all rooms with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('is_active');
    const roomType = searchParams.get('room_type');
    const department = searchParams.get('department');
    const includeInactive = searchParams.get('include_inactive');

    const whereClause: any = {};

    // Filter by active status
    if (isActive === 'true') {
      whereClause.is_active = true;
    } else if (isActive === 'false') {
      whereClause.is_active = false;
    } else if (!includeInactive) {
      // By default, only show active rooms
      whereClause.is_active = true;
    }

    // Filter by room type
    if (roomType) {
      whereClause.room_type = roomType;
    }

    // Filter by department
    if (department) {
      whereClause.department = department;
    }

    const rooms = await prisma.rooms.findMany({
      where: whereClause,
      orderBy: [
        { is_active: 'desc' },
        { name: 'asc' }
      ],
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
      data: rooms,
      count: rooms.length
    });

  } catch (error: any) {
    console.error('Error fetching rooms:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch rooms',
        details: error.message 
      },
      { status: 500 }
    );
  }
}