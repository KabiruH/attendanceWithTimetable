// app/api/subjects/subject-scheduling/[subjectId]/assignments/route.ts
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
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) return { error: 'User not found or inactive', status: 401 };
    return { user: { ...user, id: userId } };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { subjectId } = await params;
    const numericSubjectId = parseInt(subjectId);
    if (isNaN(numericSubjectId)) {
      return NextResponse.json({ error: 'Invalid subject ID' }, { status: 400 });
    }

    const currentTerm = await db.terms.findFirst({
      where: { is_active: true },
      orderBy: { start_date: 'desc' }
    });
    if (!currentTerm) {
      return NextResponse.json({ error: 'No active term found.' }, { status: 404 });
    }

    const subject = await db.subjects.findUnique({
      where: { id: numericSubjectId },
      select: { id: true, name: true, code: true, sessions_per_week: true, lesson_type: true }
    });
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const assignments = await db.trainersubjectassignments.findMany({
      where: { subject_id: numericSubjectId, term_id: currentTerm.id, is_active: true },
      include: {
        users: { select: { id: true, name: true, department: true } },
        classsubjects: {
          include: {
            classes: { select: { id: true, name: true, code: true, department: true } }
          }
        }
      },
      orderBy: { assigned_at: 'asc' }
    });

    return NextResponse.json({
      subject: {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        default_sessions_per_week: subject.sessions_per_week,
        default_lesson_type: subject.lesson_type
      },
      term: { id: currentTerm.id, name: currentTerm.name },
      assignments: assignments.map(a => ({
        id: a.id,
        trainer_id: a.trainer_id,
        trainer_name: a.users.name,
        trainer_department: a.users.department,
        class_subject_id: a.class_subject_id,
        class_id: a.classsubjects.classes.id,
        class_name: a.classsubjects.classes.name,
        class_code: a.classsubjects.classes.code,
        class_department: a.classsubjects.classes.department,
        // ✅ classsubjects is now the source of truth
        sessions_per_week: a.classsubjects.sessions_per_week,
        lesson_type: a.classsubjects.lesson_type,
        is_override:
          a.classsubjects.sessions_per_week !== subject.sessions_per_week ||
          a.classsubjects.lesson_type !== subject.lesson_type
      }))
    });

  } catch (error) {
    console.error('Error fetching subject assignments:', error);
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
  }
}

// PATCH /api/subjects/subject-scheduling/[subjectId]/assignments
// Updates sessions_per_week and/or lesson_type on classsubjects (not trainersubjectassignments)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { subjectId } = await params;
    const numericSubjectId = parseInt(subjectId);
    if (isNaN(numericSubjectId)) {
      return NextResponse.json({ error: 'Invalid subject ID' }, { status: 400 });
    }

    const body = await request.json();
    const { assignment_id, sessions_per_week, lesson_type, reset_to_default } = body;

    if (!assignment_id) {
      return NextResponse.json({ error: 'assignment_id is required' }, { status: 400 });
    }

    // Resolve the trainersubjectassignment to get its class_subject_id
    const assignment = await db.trainersubjectassignments.findFirst({
      where: { id: parseInt(assignment_id), subject_id: numericSubjectId, is_active: true },
      include: { classsubjects: true }
    });
    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found for this subject' }, { status: 404 });
    }

    // If reset_to_default, copy subject-level defaults back to classsubjects
    if (reset_to_default) {
      const subject = await db.subjects.findUnique({
        where: { id: numericSubjectId },
        select: { sessions_per_week: true, lesson_type: true }
      });
      if (!subject) {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
      }
      const updated = await db.classsubjects.update({
        where: { id: assignment.class_subject_id },
        data: {
          sessions_per_week: subject.sessions_per_week,
          lesson_type: subject.lesson_type
        }
      });
      return NextResponse.json({
        success: true,
        message: 'Reset to subject defaults',
        class_subject_id: updated.id,
        sessions_per_week: updated.sessions_per_week,
        lesson_type: updated.lesson_type
      });
    }

    if (sessions_per_week !== undefined) {
      const s = parseInt(sessions_per_week);
      if (isNaN(s) || s < 0 || s > 20) {
        return NextResponse.json({ error: 'sessions_per_week must be between 0 and 20' }, { status: 400 });
      }
    }

    const validLessonTypes = ['single', 'double', 'triple'];
    if (lesson_type !== undefined && !validLessonTypes.includes(lesson_type)) {
      return NextResponse.json({ error: 'lesson_type must be single, double, or triple' }, { status: 400 });
    }

    // ✅ Write to classsubjects, not trainersubjectassignments
    const updated = await db.classsubjects.update({
      where: { id: assignment.class_subject_id },
      data: {
        ...(sessions_per_week !== undefined && { sessions_per_week: parseInt(sessions_per_week) }),
        ...(lesson_type !== undefined && { lesson_type })
      }
    });

    return NextResponse.json({
      success: true,
      class_subject_id: updated.id,
      sessions_per_week: updated.sessions_per_week,
      lesson_type: updated.lesson_type
    });

  } catch (error) {
    console.error('Error updating assignment override:', error);
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
  }
}