// app/api/lesson-periods/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/lesson-periods
 * Create a new lesson period
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, start_time, end_time } = body;

    // Validation
    if (!name || !start_time || !end_time) {
      return NextResponse.json(
        { error: 'Name, start_time, and end_time are required' },
        { status: 400 }
      );
    }

    // Parse times - expecting format like "09:00:00" or "09:00"
    const startTime = new Date(`1970-01-01T${start_time}`);
    const endTime = new Date(`1970-01-01T${end_time}`);

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

    // Calculate duration in minutes
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    // Check for overlapping periods
    const overlappingPeriod = await prisma.lessonperiods.findFirst({
      where: {
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
          error: 'This time slot overlaps with an existing lesson period',
          overlapping_period: overlappingPeriod
        },
        { status: 409 }
      );
    }

    // Create the lesson period
    const lessonPeriod = await prisma.lessonperiods.create({
      data: {
        name: name.trim(),
        start_time: startTime,
        end_time: endTime,
        duration: durationMinutes,
        is_active: true
      }
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Lesson period created successfully',
        data: lessonPeriod
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('Error creating lesson period:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create lesson period',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/lesson-periods
 * Get all lesson periods with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('is_active');
    const includeInactive = searchParams.get('include_inactive');

    const whereClause: any = {};

    // Filter by active status
    if (isActive === 'true') {
      whereClause.is_active = true;
    } else if (isActive === 'false') {
      whereClause.is_active = false;
    } else if (!includeInactive) {
      // By default, only show active periods
      whereClause.is_active = true;
    }

    const lessonPeriods = await prisma.lessonperiods.findMany({
      where: whereClause,
      orderBy: [
        { start_time: 'asc' }
      ],
      include: {
        _count: {
          select: {
            timetableslots: true
          }
        }
      }
    });

    // Format times for better readability
    const formattedPeriods = lessonPeriods.map(period => ({
      ...period,
      start_time_formatted: period.start_time.toTimeString().slice(0, 5), // HH:MM
      end_time_formatted: period.end_time.toTimeString().slice(0, 5) // HH:MM
    }));

    return NextResponse.json({
      success: true,
      data: formattedPeriods,
      count: formattedPeriods.length
    });

  } catch (error: any) {
    console.error('Error fetching lesson periods:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch lesson periods',
        details: error.message 
      },
      { status: 500 }
    );
  }
}