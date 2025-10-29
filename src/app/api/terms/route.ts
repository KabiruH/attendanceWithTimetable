// app/api/terms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/terms
 * Create a new term
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, start_date, end_date, working_days, holidays } = body;

    // Validation
    if (!name || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Name, start_date, and end_date are required' },
        { status: 400 }
      );
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (startDate >= endDate) {
      return NextResponse.json(
        { error: 'Start date must be before end date' },
        { status: 400 }
      );
    }

    // Check for overlapping terms
    const overlappingTerm = await prisma.terms.findFirst({
      where: {
        OR: [
          {
            AND: [
              { start_date: { lte: endDate } },
              { end_date: { gte: startDate } }
            ]
          }
        ],
        is_active: true
      }
    });

    if (overlappingTerm) {
      return NextResponse.json(
        { 
          error: 'Term dates overlap with an existing active term',
          overlapping_term: overlappingTerm
        },
        { status: 409 }
      );
    }

    // Create the term
    const term = await prisma.terms.create({
      data: {
        name,
        start_date: startDate,
        end_date: endDate,
        working_days: working_days || [1, 2, 3, 4, 5], // Default Mon-Fri
        holidays: holidays || [],
        is_active: true
      }
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Term created successfully',
        data: term
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('Error creating term:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create term',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/terms
 * Get all terms with optional filters
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
      // By default, only show active terms unless specified
      whereClause.is_active = true;
    }

    const terms = await prisma.terms.findMany({
      where: whereClause,
      orderBy: [
        { is_active: 'desc' },
        { start_date: 'desc' }
      ],
      include: {
        _count: {
          select: {
            timetableSlots: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: terms,
      count: terms.length
    });

  } catch (error: any) {
    console.error('Error fetching terms:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch terms',
        details: error.message 
      },
      { status: 500 }
    );
  }
}