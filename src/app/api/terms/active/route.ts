// app/api/terms/active/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/terms/active
 * Get the currently active term
 */
export async function GET(request: NextRequest) {
  try {
    const today = new Date();

    // Find term that is active and current date falls within its range
    const activeTerm = await prisma.terms.findFirst({
      where: {
        is_active: true,
        start_date: { lte: today },
        end_date: { gte: today }
      },
      include: {
        _count: {
          select: {
            timetableSlots: true
          }
        }
      }
    });

    if (!activeTerm) {
      return NextResponse.json(
        {
          success: false,
          message: 'No active term found for current date',
          data: null
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: activeTerm
    });

  } catch (error: any) {
    console.error('Error fetching active term:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch active term',
        details: error.message 
      },
      { status: 500 }
    );
  }
}