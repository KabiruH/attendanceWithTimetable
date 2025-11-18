// app/api/terms/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/terms/[id]
 * Get a specific term by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const termId = parseInt(resolvedParams.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    const term = await prisma.terms.findUnique({
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
 * Update a term
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const termId = parseInt(resolvedParams.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    // Check if term exists
    const existingTerm = await prisma.terms.findUnique({
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
      const overlappingTerm = await prisma.terms.findFirst({
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
    const updatedTerm = await prisma.terms.update({
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
 * Delete a term (soft delete by setting is_active to false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const termId = parseInt(resolvedParams.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    // Check if term has associated timetable slots
    const slotsCount = await prisma.timetableslots.count({
      where: { term_id: termId }
    });

    if (slotsCount > 0) {
      // Soft delete - just deactivate
      const updatedTerm = await prisma.terms.update({
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
      await prisma.terms.delete({
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