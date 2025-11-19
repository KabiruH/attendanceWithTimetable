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

// ✅ NEW: GET /api/class-subjects/[id] - Get all subjects for a class
export async function GET(
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

    const params = await context.params;
    const classId = parseInt(params.id);

    if (isNaN(classId)) {
      return NextResponse.json(
        { error: 'Invalid class ID' },
        { status: 400 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const termId = searchParams.get('term_id');

    // Build where clause
    const whereClause: any = {
      class_id: classId
    };

    // Add term filter if provided
    if (termId && termId !== 'undefined' && termId !== 'null') {
      whereClause.term_id = parseInt(termId);
    }

    // ✅ Fetch class subjects with the subjects relation included
    const classSubjects = await db.classsubjects.findMany({
      where: whereClause,
      include: {
        subjects: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            credit_hours: true,
            description: true
          }
        },
        terms: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { is_active: 'desc' },
        { subjects: { name: 'asc' } }
      ]
    });

    // Transform to match the expected format
    const formattedSubjects = classSubjects.map(cs => ({
      id: cs.id,
      subject: cs.subjects,
      term_id: cs.term_id,
      is_active: cs.is_active,
      assigned_at: cs.assigned_at.toISOString(),
      term: cs.terms
    }));

    return NextResponse.json({
      success: true,
      data: formattedSubjects,
      count: formattedSubjects.length
    });

  } catch (error) {
    console.error('Error fetching class subjects:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch class subjects',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
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
      // First, deactivate any trainer assignments
      await db.trainersubjectassignments.updateMany({
        where: { class_subject_id: classSubjectId },
        data: { is_active: false }
      });

      // Then update the class subject to inactive
      await db.classsubjects.update({
        where: { id: classSubjectId },
        data: { 
          is_active: false,
          term_id: null 
        }
      });
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