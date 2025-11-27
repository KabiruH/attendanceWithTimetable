// app/api/users/timetable-admin/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyJwtToken } from '@/lib/auth/jwt';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get the ID from params
    const { id } = await params;

    // Extract token from cookies
    const cookieHeader = request.headers.get('cookie');
    const token = cookieHeader?.split(';')
      .find(cookie => cookie.trim().startsWith('token='))
      ?.split('=')[1];

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: No token provided" },
        { status: 401 }
      );
    }

    // Verify admin token
    const decodedToken = await verifyJwtToken(token);
    if (!decodedToken || decodedToken.role !== 'admin') {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 401 }
      );
    }

    // Validate user ID
    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json(
        { error: "Invalid user ID" },
        { status: 400 }
      );
    }

    // Get the request body
    const body = await request.json();
    const { has_timetable_admin } = body;

    // Validate the input
    if (typeof has_timetable_admin !== 'boolean') {
      return NextResponse.json(
        { error: "Invalid input: has_timetable_admin must be a boolean" },
        { status: 400 }
      );
    }

    // Update the user's timetable admin status
    const updatedUser = await db.users.update({
      where: { id: userId },
      data: { has_timetable_admin },
    });

    return NextResponse.json({
      message: `Timetable admin privileges ${has_timetable_admin ? 'granted' : 'revoked'} successfully`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        has_timetable_admin: updatedUser.has_timetable_admin,
      }
    });

  } catch (error) {
    console.error('Error updating timetable admin status:', error);
    return NextResponse.json(
      { error: "Failed to update timetable admin status" },
      { status: 500 }
    );
  }
}