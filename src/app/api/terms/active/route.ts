// app/api/terms/active/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { db } from '@/lib/db/db';

/**
 * GET /api/terms/active
 * Get the currently active term
 * Supports both web (cookies) and mobile (Authorization header) authentication
 */
export async function GET(request: NextRequest) {
  try {
    // Use centralized auth that supports both web (cookies) and mobile (Authorization header)
    const authResult = await verifyAuth(request);
    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { 
          success: false,
          error: authResult.error || "Unauthorized" 
        },
        { status: authResult.status || 401 }
      );
    }

    console.log('✅ Fetching active term for user:', authResult.user.id);

    const today = new Date();

    // Find term that is active and current date falls within its range
    const activeTerm = await db.terms.findFirst({
      where: {
        is_active: true,
        start_date: { lte: today },
        end_date: { gte: today }
      },
      include: {
        _count: {
          select: {
            timetableslots: true
          }
        }
      }
    });

    if (!activeTerm) {
      console.log('⚠️ No active term found for current date');
      return NextResponse.json(
        {
          success: false,
          message: 'No active term found for current date',
          data: null
        },
        { status: 404 }
      );
    }

    console.log('✅ Active term found:', activeTerm.name);

    return NextResponse.json({
      success: true,
      data: activeTerm
    });

  } catch (error: any) {
    console.error('❌ Error fetching active term:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch active term',
        details: error.message 
      },
      { status: 500 }
    );
  }
}