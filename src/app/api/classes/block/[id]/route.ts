// app/api/classes/block/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

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
    const role = payload.role as string;

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        name: true, 
        role: true, 
        is_active: true, 
        has_timetable_admin: true 
      }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const body = await request.json();
    const { reason } = body;

    // Check if user exists
    const userToBlock = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_blocked: true }
    });

    if (!userToBlock) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Cannot block admin users
    if (userToBlock.role === 'admin') {
      return NextResponse.json(
        { error: 'Cannot block admin users' },
        { status: 400 }
      );
    }

    // Check if already blocked
    if (userToBlock.is_blocked) {
      return NextResponse.json(
        { error: 'User is already blocked' },
        { status: 400 }
      );
    }

    // Block the user
    await db.users.update({
      where: { id: userId },
      data: {
        is_blocked: true,
        blocked_at: new Date(),
        blocked_reason: reason || null,
        blocked_by: authResult.user.id
      }
    });

    return NextResponse.json({
      success: true,
      message: `User ${userToBlock.name} has been blocked successfully`
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    return NextResponse.json(
      { error: 'Failed to block user' },
      { status: 500 }
    );
  }
}