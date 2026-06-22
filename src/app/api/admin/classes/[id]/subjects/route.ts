// app/api/classes/[id]/subjects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

async function verifyAuth() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');
    if (!token) return { error: 'No token found', status: 401 };

    const { payload } = await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );

    const userId = Number(payload.id);
    const role = payload.role as string;
    const name = payload.name as string;

    const user = await db.users.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, role: true,
        department: true, is_active: true,
        email: true, has_timetable_admin: true  // ← add
      }
    });

    if (!user || !user.is_active) return { error: 'User not found or inactive', status: 401 };
    return { user: { ...user, id: userId, role, name } };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

// GET /api/classes/[id]/subjects
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

    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const params = await context.params;
    const classId = parseInt(params.id);
    if (isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const termIdParam = searchParams.get('term_id');
    const whereClause: any = { class_id: classId };
    if (termIdParam) whereClause.term_id = parseInt(termIdParam);

    const assignedSubjects = await db.classsubjects.findMany({
      where: whereClause,
      include: {
        subjects: true,
        terms: { select: { id: true, name: true } }
      },
      orderBy: { assigned_at: 'desc' }
    });

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
    return NextResponse.json({ error: 'Failed to fetch assigned subjects' }, { status: 500 });
  }
}

// POST /api/classes/[id]/subjects
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

    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const params = await context.params;
    const classId = parseInt(params.id);
    if (isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 });
    }

    const body = await request.json();
    const { subjectId, term_id } = body;

    if (!subjectId) {
      return NextResponse.json({ error: 'Subject ID is required' }, { status: 400 });
    }
    if (!term_id) {
      return NextResponse.json({ error: 'Term ID is required' }, { status: 400 });
    }

    const existing = await db.classsubjects.findFirst({
      where: { class_id: classId, subject_id: subjectId, term_id }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Subject already assigned to this class for this term' },
        { status: 400 }
      );
    }

    const assignment = await db.classsubjects.create({
      data: {
        class_id: classId,
        subject_id: subjectId,
        term_id,
        assigned_by: user.email || user.name,
        is_active: false
      },
      include: {
        subjects: true,
        terms: true
      }
    });

    return NextResponse.json({
      id: assignment.id,
      subject: assignment.subjects,
      term_id: assignment.term_id,
      is_active: assignment.is_active,
      assigned_at: assignment.assigned_at.toISOString(),
      term: assignment.terms
    });
  } catch (error) {
    console.error('❌ Error assigning subject:', error);
    return NextResponse.json({ error: 'Failed to assign subject' }, { status: 500 });
  }
}