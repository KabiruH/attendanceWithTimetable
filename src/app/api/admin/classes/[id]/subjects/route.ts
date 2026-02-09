// app/api/classes/[id]/subjects/route.ts
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
      select: { id: true, name: true, role: true, department: true, is_active: true, email: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// GET /api/classes/[id]/subjects - Get subjects assigned to this class
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

    const { user } = authResult;

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const params = await context.params;
    const classId = parseInt(params.id);

    if (isNaN(classId)) {
      return NextResponse.json(
        { error: 'Invalid class ID' },
        { status: 400 }
      );
    }

    // ✅ GET term_id from query params
    const { searchParams } = new URL(request.url);
    const termIdParam = searchParams.get('term_id');

    console.log('📚 Fetching subjects for class:', classId, 'term:', termIdParam || 'ALL');

    // ✅ Build where clause with term filter
    const whereClause: any = {
      class_id: classId,
    };

    // ✅ CRITICAL: Add term filter if provided
    if (termIdParam) {
      whereClause.term_id = parseInt(termIdParam);
    }

    console.log('🔍 Where clause:', whereClause);

    const assignedSubjects = await db.classsubjects.findMany({
      where: whereClause,
      include: {
        subjects: true,
        terms: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        assigned_at: 'desc',
      },
    });

    console.log(`✅ Found ${assignedSubjects.length} subjects for class ${classId}, term ${termIdParam || 'ALL'}`);

    // ✅ Transform the data to match component expectations
    const formattedSubjects = assignedSubjects.map(item => ({
      id: item.id,
      subject: item.subjects,
      term_id: item.term_id,
      is_active: item.is_active,
      assigned_at: item.assigned_at.toISOString(),
      term: item.terms
    }));

    return NextResponse.json(formattedSubjects);
  } catch (error) {
    console.error('❌ Error fetching assigned subjects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assigned subjects' },
      { status: 500 }
    );
  }
}

// POST /api/classes/[id]/subjects - Assign subject to class
export async function POST(
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
    const classId = parseInt(params.id);

    if (isNaN(classId)) {
      return NextResponse.json(
        { error: 'Invalid class ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { subjectId, term_id } = body;

    console.log('🔍 Admin adding subject - received:', {
      subjectId,
      term_id,
      classId,
      term_id_type: typeof term_id
    });

    if (!subjectId) {
      return NextResponse.json(
        { error: 'Subject ID is required' },
        { status: 400 }
      );
    }

    if (!term_id) {
      return NextResponse.json(
        { error: 'Term ID is required' },
        { status: 400 }
      );
    }

    // Check for existing class-subject-term combination
    const existing = await db.classsubjects.findFirst({
      where: {
        class_id: classId,
        subject_id: subjectId,
        term_id: term_id
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Subject already assigned to this class for this term' },
        { status: 400 }
      );
    }

    // ✅ Create assignment WITH term_id
    const assignment = await db.classsubjects.create({
      data: {
        class_id: classId,
        subject_id: subjectId,
        term_id: term_id,
        assigned_by: user.email || user.name,
        is_active: false,
      },
      include: {
        subjects: true,
        terms: true,
      },
    });

    console.log('✅ Created classsubject:', {
      id: assignment.id,
      class_id: assignment.class_id,
      subject_id: assignment.subject_id,
      term_id: assignment.term_id
    });

    // Transform response to match expected format
    const formattedAssignment = {
      id: assignment.id,
      subject: assignment.subjects,
      term_id: assignment.term_id,
      is_active: assignment.is_active,
      assigned_at: assignment.assigned_at.toISOString(),
      term: assignment.terms
    };

    return NextResponse.json(formattedAssignment);
  } catch (error) {
    console.error('❌ Error assigning subject:', error);
    return NextResponse.json(
      { error: 'Failed to assign subject' },
      { status: 500 }
    );
  }
}