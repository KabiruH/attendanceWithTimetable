// app/api/timetable/class-load/[classId]/route.ts
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
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { classId } = await params;
    const numericClassId = parseInt(classId);
    if (isNaN(numericClassId)) {
      return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 });
    }

    const currentTerm = await db.terms.findFirst({
      where: { is_active: true },
      orderBy: { start_date: 'desc' }
    });
    if (!currentTerm) {
      return NextResponse.json({ error: 'No active term found.' }, { status: 404 });
    }

    const cls = await db.classes.findUnique({
      where: { id: numericClassId },
      select: { id: true, name: true, code: true, department: true }
    });
    if (!cls) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const classSubjects = await db.classsubjects.findMany({
      where: { class_id: numericClassId, term_id: currentTerm.id },
      include: {
        subjects: {
          select: {
            id: true, name: true, code: true, department: true,
            classification: true,
            sessions_per_week: true,
            lesson_type: true
          }
        },
        trainersubjectassignments: {
          where: { term_id: currentTerm.id, is_active: true },
          include: { users: { select: { id: true, name: true } } },
          take: 1
        }
      },
      orderBy: { subjects: { name: 'asc' } }
    });

    // Collect all trainersubjectassignment IDs for this class
    const assignmentIds = classSubjects
      .flatMap(cs => cs.trainersubjectassignments.map(ta => ta.id));

    // Fetch all combinations where this class's assignments appear (either side)
    const combinations = assignmentIds.length > 0
      ? await db.subjectcombinations.findMany({
          where: {
            OR: [
              { primary_assignment_id: { in: assignmentIds } },
              { combined_assignment_id: { in: assignmentIds } }
            ]
          },
          include: {
            primary_assignment: {
              include: {
                classsubjects: {
                  include: { classes: { select: { id: true, name: true, code: true } } }
                },
                users: { select: { id: true, name: true } }
              }
            },
            combined_assignment: {
              include: {
                classsubjects: {
                  include: { classes: { select: { id: true, name: true, code: true } } }
                },
                users: { select: { id: true, name: true } }
              }
            }
          }
        })
      : [];

    // Build a lookup: assignment_id → list of combined classes per session
    // For each combination row, the "other" class is whichever side isn't this class
    const combinationsByAssignment = new Map<number, Array<{
      session_number: number;
      combined_class_id: number;
      combined_class_name: string;
      combined_class_code: string;
      combined_trainer: string;
    }>>();

    combinations.forEach(combo => {
      const primaryId = combo.primary_assignment_id;
      const combinedId = combo.combined_assignment_id;
      const isPrimary = assignmentIds.includes(primaryId);
      const isCombined = assignmentIds.includes(combinedId);

      // The "this class" assignment id
      const thisAssignmentId = isPrimary ? primaryId : combinedId;
      // The "other" side
      const otherAssignment = isPrimary ? combo.combined_assignment : combo.primary_assignment;
      const otherClass = otherAssignment.classsubjects.classes;

      // Only add if the other class is different from this class
      if (otherClass.id === numericClassId) return;

      const existing = combinationsByAssignment.get(thisAssignmentId) ?? [];
      // Avoid duplicates for the same session + class
      const alreadyAdded = existing.some(
        e => e.session_number === combo.session_number && e.combined_class_id === otherClass.id
      );
      if (!alreadyAdded) {
        existing.push({
          session_number: combo.session_number,
          combined_class_id: otherClass.id,
          combined_class_name: otherClass.name,
          combined_class_code: otherClass.code,
          combined_trainer: otherAssignment.users.name
        });
      }
      combinationsByAssignment.set(thisAssignmentId, existing);
    });

    // Each session = 1 period = 2 hrs. lesson_type only affects generator grouping.
    const SESSIONS_MAX = 20;
    const HOURS_PER_SESSION = 2;

    const subjects = classSubjects.map(cs => {
      const trainer = cs.trainersubjectassignments[0] ?? null;
      const assignmentId = trainer?.id ?? null;
      const combinedWith = assignmentId
        ? (combinationsByAssignment.get(assignmentId) ?? [])
        : [];

      return {
        class_subject_id: cs.id,
        subject_id: cs.subjects.id,
        subject_name: cs.subjects.name,
        subject_code: cs.subjects.code,
        subject_department: cs.subjects.department,
        classification: cs.subjects.classification,
        sessions_per_week: cs.sessions_per_week,
        lesson_type: cs.lesson_type,
        periods_consumed: cs.sessions_per_week,
        hours_per_week: cs.sessions_per_week * HOURS_PER_SESSION,
        is_active: cs.is_active,
        default_sessions_per_week: cs.subjects.sessions_per_week,
        default_lesson_type: cs.subjects.lesson_type,
        trainer: trainer ? { id: trainer.users.id, name: trainer.users.name } : null,
        combined_with: combinedWith
      };
    });

    const activeSubjects = subjects.filter(s => s.is_active);
    const totalSessions = activeSubjects.reduce((sum, s) => sum + s.sessions_per_week, 0);
    const totalHours = totalSessions * HOURS_PER_SESSION;
    const status: 'ok' | 'over' = totalSessions > SESSIONS_MAX ? 'over' : 'ok';

    return NextResponse.json({
      term: { id: currentTerm.id, name: currentTerm.name },
      class: cls,
      subjects,
      total_periods: totalSessions,
      total_hours: totalHours,
      periods_max: SESSIONS_MAX,
      hours_max: SESSIONS_MAX * HOURS_PER_SESSION,
      gap: SESSIONS_MAX - totalSessions,
      status
    });

  } catch (error) {
    console.error('Error fetching class load detail:', error);
    return NextResponse.json({ error: 'Failed to fetch class detail' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { classId } = await params;
    const numericClassId = parseInt(classId);
    if (isNaN(numericClassId)) {
      return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 });
    }

    const body = await request.json();
    const { class_subject_id, sessions_per_week, lesson_type } = body;

    if (!class_subject_id) {
      return NextResponse.json({ error: 'class_subject_id is required' }, { status: 400 });
    }

    const classSubject = await db.classsubjects.findFirst({
      where: { id: parseInt(class_subject_id), class_id: numericClassId }
    });
    if (!classSubject) {
      return NextResponse.json({ error: 'Subject not found for this class' }, { status: 404 });
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

    const updated = await db.classsubjects.update({
      where: { id: parseInt(class_subject_id) },
      data: {
        ...(sessions_per_week !== undefined && { sessions_per_week: parseInt(sessions_per_week) }),
        ...(lesson_type !== undefined && { lesson_type })
      }
    });

    return NextResponse.json({
      success: true,
      class_subject_id: updated.id,
      sessions_per_week: updated.sessions_per_week,
      lesson_type: updated.lesson_type,
      hours_per_week: updated.sessions_per_week * 2
    });

  } catch (error) {
    console.error('Error updating class subject load:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}