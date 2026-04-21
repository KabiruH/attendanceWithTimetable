// app/api/subject-scheduling/[subjectId]/assignments/route.ts
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

// GET /api/subject-scheduling/[subjectId]/assignments
// Returns all active trainersubjectassignments for a subject in the current term
// with full class and trainer details, plus per-assignment overrides
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

    // Get current active term
    const currentTerm = await db.terms.findFirst({
      where: { is_active: true },
      orderBy: { start_date: 'desc' }
    });

    if (!currentTerm) {
      return NextResponse.json({ error: 'No active term found.' }, { status: 404 });
    }

    const subject = await db.subjects.findUnique({
      where: { id: numericSubjectId },
      select: {
        id: true,
        name: true,
        code: true,
        sessions_per_week: true,
        lesson_type: true
      }
    });

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const assignments = await db.trainersubjectassignments.findMany({
      where: {
        subject_id: numericSubjectId,
        term_id: currentTerm.id,
        is_active: true
      },
      include: {
        users: {
          select: { id: true, name: true, department: true }
        },
        classsubjects: {
          include: {
            classes: {
              select: { id: true, name: true, code: true, department: true }
            }
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
      term: {
        id: currentTerm.id,
        name: currentTerm.name
      },
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
        // Per-assignment overrides — null means "use subject default"
        sessions_per_week: a.sessions_per_week ?? subject.sessions_per_week,
        lesson_type: a.lesson_type ?? subject.lesson_type,
        is_override: a.sessions_per_week !== null || a.lesson_type !== null
      }))
    });

  } catch (error) {
    console.error('Error fetching subject assignments:', error);
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
  }
}

// PATCH /api/subject-scheduling/[subjectId]/assignments
// Updates sessions_per_week and/or lesson_type for a specific trainersubjectassignment
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

    // Validate the assignment belongs to this subject
    const assignment = await db.trainersubjectassignments.findFirst({
      where: {
        id: parseInt(assignment_id),
        subject_id: numericSubjectId,
        is_active: true
      }
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found for this subject' }, { status: 404 });
    }

    // If reset_to_default, clear the overrides
    if (reset_to_default) {
      const updated = await db.trainersubjectassignments.update({
        where: { id: parseInt(assignment_id) },
        data: {
          sessions_per_week: null,
          lesson_type: null
        }
      });
      return NextResponse.json({
        success: true,
        message: 'Assignment reset to subject defaults',
        assignment_id: updated.id,
        sessions_per_week: null,
        lesson_type: null
      });
    }

    // Validate sessions_per_week
    if (sessions_per_week !== undefined) {
      const sessions = parseInt(sessions_per_week);
      if (isNaN(sessions) || sessions < 1 || sessions > 4) {
        return NextResponse.json({ error: 'sessions_per_week must be between 1 and 4' }, { status: 400 });
      }
    }

    // Validate lesson_type
    const validLessonTypes = ['single', 'double', 'triple'];
    if (lesson_type !== undefined && !validLessonTypes.includes(lesson_type)) {
      return NextResponse.json({ error: 'lesson_type must be single, double, or triple' }, { status: 400 });
    }

    const updated = await db.trainersubjectassignments.update({
      where: { id: parseInt(assignment_id) },
      data: {
        ...(sessions_per_week !== undefined && { sessions_per_week: parseInt(sessions_per_week) }),
        ...(lesson_type !== undefined && { lesson_type })
      }
    });

    return NextResponse.json({
      success: true,
      assignment_id: updated.id,
      sessions_per_week: updated.sessions_per_week,
      lesson_type: updated.lesson_type
    });

  } catch (error) {
    console.error('Error updating assignment override:', error);
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
  }
}