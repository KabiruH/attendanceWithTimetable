// app/api/class-subjects/[id]/route.ts
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
    const role = payload.role as string;
    const name = payload.name as string;

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, department: true, is_active: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// DELETE /api/class-subjects/[id] - Remove subject from class
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const params = await context.params;
    const classSubjectId = parseInt(params.id);

    if (isNaN(classSubjectId)) {
      return NextResponse.json(
        { error: 'Invalid class subject ID' },
        { status: 400 }
      );
    }

    // Check if subject is activated for a term
    const classSubject = await db.classsubjects.findUnique({
      where: { id: classSubjectId },
    });

    if (!classSubject) {
      return NextResponse.json(
        { error: 'Class subject assignment not found' },
        { status: 404 }
      );
    }

    if (classSubject.is_active && classSubject.term_id) {
      return NextResponse.json(
        { 
          error: 'Cannot remove subject that is active in a term. Deactivate it first.' 
        },
        { status: 400 }
      );
    }

    await db.classsubjects.delete({
      where: { id: classSubjectId },
    });

    return NextResponse.json({ 
      message: 'Subject removed successfully from class' 
    });
  } catch (error) {
    console.error('Error removing subject:', error);
    return NextResponse.json(
      { error: 'Failed to remove subject' },
      { status: 500 }
    );
  }
}