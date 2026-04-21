// app/api/subject-scheduling/route.ts
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
      select: { id: true, name: true, role: true, is_active: true, email: true, has_timetable_admin: true }
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

// GET /api/subject-scheduling
// Returns all subjects that have active trainersubjectassignments in the current term
// "Current term" = the term whose end_date is the furthest in the future (or most recently active)
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized. Admin or Timetable Admin access required.' }, { status: 403 });
    }

    // Get current active term
    const currentTerm = await db.terms.findFirst({
      where: { is_active: true },
      orderBy: { start_date: 'desc' }
    });

    if (!currentTerm) {
      return NextResponse.json({ error: 'No active term found.' }, { status: 404 });
    }

    // Get all subjects that have active assignments in this term
    const assignedSubjectIds = await db.trainersubjectassignments.findMany({
      where: {
        term_id: currentTerm.id,
        is_active: true
      },
      select: { subject_id: true },
      distinct: ['subject_id']
    });

    const subjectIds = assignedSubjectIds.map(a => a.subject_id);

    if (subjectIds.length === 0) {
      return NextResponse.json({
        term: currentTerm,
        subjects: []
      });
    }

    // Fetch full subject data with per-assignment overrides
    const subjects = await db.subjects.findMany({
      where: {
        id: { in: subjectIds },
        is_active: true
      },
      orderBy: { name: 'asc' },
      include: {
        trainersubjectassignments: {
          where: {
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
          }
        }
      }
    });

    // Shape the response
    const result = subjects.map(subject => ({
      id: subject.id,
      name: subject.name,
      code: subject.code,
      department: subject.department,
      classification: subject.classification,
      // Subject-level defaults
      default_sessions_per_week: subject.sessions_per_week,
      default_lesson_type: subject.lesson_type,
      can_be_online: subject.can_be_online,
      // All active assignments for this subject in the current term
      assignments: subject.trainersubjectassignments.map(a => ({
        id: a.id,
        trainer_id: a.trainer_id,
        trainer_name: a.users.name,
        trainer_department: a.users.department,
        class_subject_id: a.class_subject_id,
        class_id: a.classsubjects.classes.id,
        class_name: a.classsubjects.classes.name,
        class_code: a.classsubjects.classes.code,
        class_department: a.classsubjects.classes.department,
        // Per-assignment overrides (fall back to subject defaults if null)
        sessions_per_week: a.sessions_per_week ?? subject.sessions_per_week,
        lesson_type: a.lesson_type ?? subject.lesson_type,
      }))
    }));

    return NextResponse.json({
      term: {
        id: currentTerm.id,
        name: currentTerm.name,
        start_date: currentTerm.start_date,
        end_date: currentTerm.end_date
      },
      subjects: result
    });

  } catch (error) {
    console.error('Error fetching subject scheduling:', error);
    return NextResponse.json({ error: 'Failed to fetch subject scheduling data' }, { status: 500 });
  }
}

// PATCH /api/subject-scheduling
// Updates subject-level defaults for sessions_per_week and lesson_type
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized. Admin or Timetable Admin access required.' }, { status: 403 });
    }

    const body = await request.json();
    const { subject_id, sessions_per_week, lesson_type } = body;

    if (!subject_id) {
      return NextResponse.json({ error: 'subject_id is required' }, { status: 400 });
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

    const subject = await db.subjects.findUnique({ where: { id: parseInt(subject_id) } });
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    const updated = await db.subjects.update({
      where: { id: parseInt(subject_id) },
      data: {
        ...(sessions_per_week !== undefined && { sessions_per_week: parseInt(sessions_per_week) }),
        ...(lesson_type !== undefined && { lesson_type }),
        updated_at: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      subject_id: updated.id,
      sessions_per_week: updated.sessions_per_week,
      lesson_type: updated.lesson_type
    });

  } catch (error) {
    console.error('Error updating subject scheduling defaults:', error);
    return NextResponse.json({ error: 'Failed to update subject' }, { status: 500 });
  }
}