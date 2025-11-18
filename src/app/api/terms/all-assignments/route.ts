// app/api/terms/all-assignments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';

/**
 * GET /api/terms/all-assignments
 * Get all term-class assignments (for checking conflicts)
 */
export async function GET(request: NextRequest) {
  try {
    const assignments = await db.termclasses.findMany({
      include: {
        terms: {
          select: {
            id: true,
            name: true,
            is_active: true,
            start_date: true,
            end_date: true
          }
        },
        classes: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: assignments
    });

  } catch (error: any) {
    console.error('Error fetching term assignments:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch term assignments',
        details: error.message 
      },
      { status: 500 }
    );
  }
}