import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db'; // Using your existing db instance
import { verifyJwtToken } from '@/lib/auth/jwt';

/**
 * GET /api/trainers
 * Fetches sanitized list of trainers for Timetable Admin use
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Extract Token
    const cookieHeader = request.headers.get('cookie');
    const token = cookieHeader?.split(';')
      .find(cookie => cookie.trim().startsWith('token='))
      ?.split('=')[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized: No token" }, { status: 401 });
    }

    // 2. Verify Token
    const decodedToken = await verifyJwtToken(token);
    if (!decodedToken || !decodedToken.id) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    // 3. Database check for permissions (Solves the TS error)
    const userRequesting = await db.users.findUnique({
      where: { id: decodedToken.id as number },
      select: { role: true, has_timetable_admin: true }
    });

    const canAccess = userRequesting?.role === 'admin' || userRequesting?.has_timetable_admin === true;

    if (!userRequesting || !canAccess) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions" }, 
        { status: 403 }
      );
    }

    // 4. Fetch the Trainers (Employees)
    // We only select non-sensitive fields to protect user privacy
    const trainers = await db.users.findMany({
      where: {
        role: 'employee',
        is_active: true
      },
      select: {
        id: true,
        name: true,
        department: true,
        phone_number: true // Helpful for timetable coordination
      },
      orderBy: {
        name: 'asc'
      }
    });

    // 5. Return in the format your frontend expects (data.data)
    return NextResponse.json({
      success: true,
      data: trainers,
      count: trainers.length
    });

  } catch (error: any) {
    console.error('Error fetching trainers:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch trainers',
        details: error.message 
      },
      { status: 500 }
    );
  }
}