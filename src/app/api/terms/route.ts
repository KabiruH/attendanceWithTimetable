// app/api/terms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { db } from '@/lib/db/db';

/**
 * POST /api/terms
 * Create a new term
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: authResult.status || 401 }
      );
    }

    const { user } = authResult;

    if (user.role !== 'admin' && !user.has_timetable_admin) {
      return NextResponse.json(
        { error: "Unauthorized: Only admins and timetable admins can create terms" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, start_date, end_date, working_days, holidays } = body;

    console.log('📅 Creating term with holidays:', {
      name,
      start_date,
      end_date,
      working_days,
      holidays,
      holidays_type: typeof holidays,
      holidays_length: Array.isArray(holidays) ? holidays.length : 0
    });

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

    // Validate holidays are within term range
    if (holidays && Array.isArray(holidays)) {
      for (const holiday of holidays) {
        const holidayDate = new Date(holiday);
        if (holidayDate < startDate || holidayDate > endDate) {
          return NextResponse.json(
            { error: `Holiday ${holiday} is outside the term date range` },
            { status: 400 }
          );
        }
      }
    }

    // Check for overlapping terms
    const overlappingTerm = await db.terms.findFirst({
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
    const now = new Date();
    const term = await db.terms.create({
      data: {
        name,
        start_date: startDate,
        end_date: endDate,
        working_days: working_days || [1, 2, 3, 4, 5], 
        holidays: holidays || [],
        is_active: true,
        updated_at: now
      }
    });

    // ✅ Type guard for holidays count
    const holidaysCount = Array.isArray(term.holidays) ? term.holidays.length : 0;

    console.log('✅ Term created with holidays:', {
      id: term.id,
      holidays: term.holidays,
      holidays_count: holidaysCount
    });

    return NextResponse.json(
      {
        success: true,
        message: `Term created successfully with ${holidaysCount} holiday${holidaysCount !== 1 ? 's' : ''}`,
        data: term
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('❌ Error creating term:', error);
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
    const authResult = await verifyAuth(request);
    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: authResult.status || 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('is_active');
    const includeInactive = searchParams.get('include_inactive');

    const whereClause: any = {};

    if (isActive === 'true') {
      whereClause.is_active = true;
    } else if (isActive === 'false') {
      whereClause.is_active = false;
    } else if (!includeInactive) {
      whereClause.is_active = true;
    }

    const terms = await db.terms.findMany({
      where: whereClause,
      orderBy: [
        { is_active: 'desc' },
        { start_date: 'desc' }
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