// app/api/terms/[id]/route.ts
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

    if (!userId || isNaN(userId)) {
      return { error: 'Invalid user ID in token', status: 401 };
    }

    // Verify user exists and is active
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, department: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// Helper function to check if user has timetable admin access
function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

/**
 * GET /api/terms/[id]
 * Get a specific term by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const resolvedParams = await params;
    const termId = parseInt(resolvedParams.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    const term = await db.terms.findUnique({
      where: { id: termId },
      include: {
        _count: {
          select: {
            timetableslots: true
          }
        }
      }
    });

    if (!term) {
      return NextResponse.json(
        { error: 'Term not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: term
    });

  } catch (error: any) {
    console.error('Error fetching term:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch term',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/terms/[id]
 * Update a term (Admin/Timetable Admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // Check if user is admin or timetable admin
    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const resolvedParams = await params;
    const termId = parseInt(resolvedParams.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    // Check if term exists
    const existingTerm = await db.terms.findUnique({
      where: { id: termId }
    });

    if (!existingTerm) {
      return NextResponse.json(
        { error: 'Term not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, start_date, end_date, working_days, holidays, is_active } = body;

    // Prepare update data
    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (working_days !== undefined) updateData.working_days = working_days;
    if (holidays !== undefined) updateData.holidays = holidays;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Handle date updates with validation
    if (start_date !== undefined || end_date !== undefined) {
      const startDate = start_date ? new Date(start_date) : existingTerm.start_date;
      const endDate = end_date ? new Date(end_date) : existingTerm.end_date;

      if (startDate >= endDate) {
        return NextResponse.json(
          { error: 'Start date must be before end date' },
          { status: 400 }
        );
      }

      if (start_date) updateData.start_date = startDate;
      if (end_date) updateData.end_date = endDate;

      // Check for overlapping terms (excluding current term)
      const overlappingTerm = await db.terms.findFirst({
        where: {
          id: { not: termId },
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

      if (overlappingTerm && (is_active === true || existingTerm.is_active)) {
        return NextResponse.json(
          { 
            error: 'Updated term dates would overlap with an existing active term',
            overlapping_term: overlappingTerm
          },
          { status: 409 }
        );
      }
    }

    // Update the term
    const updatedTerm = await db.terms.update({
      where: { id: termId },
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
      message: 'Term updated successfully',
      data: updatedTerm
    });

  } catch (error: any) {
    console.error('Error updating term:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update term',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/terms/[id]
 * Delete a term (soft delete by setting is_active to false) (Admin/Timetable Admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // Check if user is admin or timetable admin
    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const resolvedParams = await params;
    const termId = parseInt(resolvedParams.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    // Check if term has associated timetable slots
    const slotsCount = await db.timetableslots.count({
      where: { term_id: termId }
    });

    if (slotsCount > 0) {
      // Soft delete - just deactivate
      const updatedTerm = await db.terms.update({
        where: { id: termId },
        data: { is_active: false }
      });

      return NextResponse.json({
        success: true,
        message: `Term deactivated (has ${slotsCount} timetable slots)`,
        data: updatedTerm
      });
    } else {
      // Hard delete if no associated data
      await db.terms.delete({
        where: { id: termId }
      });

      return NextResponse.json({
        success: true,
        message: 'Term deleted successfully'
      });
    }

  } catch (error: any) {
    console.error('Error deleting term:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete term',
        details: error.message 
      },
      { status: 500 }
    );
  }
}