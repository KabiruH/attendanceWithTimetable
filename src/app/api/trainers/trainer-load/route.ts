// app/api/timetable/trainer-load/route.ts
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

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) return { error: 'User not found or inactive', status: 401 };
    return { user: { ...user, id: userId, role } };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

// GET /api/timetable/trainer-load?term_id=X
// Returns all trainers with active class + subject assignments for the given term.
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const termIdParam = searchParams.get('term_id');

    // Resolve term — use provided term_id or fall back to current active term
    let termId: number;
    let term: { id: number; name: string; start_date: Date; end_date: Date } | null = null;

    if (termIdParam) {
      termId = parseInt(termIdParam);
      if (isNaN(termId)) {
        return NextResponse.json({ error: 'Invalid term_id' }, { status: 400 });
      }
      term = await db.terms.findUnique({
        where: { id: termId },
        select: { id: true, name: true, start_date: true, end_date: true }
      });
    } else {
      term = await db.terms.findFirst({
        where: { is_active: true },
        orderBy: { start_date: 'desc' },
        select: { id: true, name: true, start_date: true, end_date: true }
      });
      termId = term?.id ?? 0;
    }

    if (!term) {
      return NextResponse.json({ error: 'No active term found.' }, { status: 404 });
    }

    // ── Single query: all active trainersubjectassignments for the term ────────
    // Join through classsubjects to get class + subject detail in one shot.
    const subjectAssignments = await db.trainersubjectassignments.findMany({
      where: {
        term_id: termId,
        is_active: true,
      },
      include: {
        users: {
          select: { id: true, name: true, department: true, role: true }
        },
        classsubjects: {
          include: {
            classes: {
              select: { id: true, name: true, code: true, department: true }
            },
            subjects: {
              select: { id: true, name: true, code: true, credit_hours: true }
            }
          }
        }
      },
      orderBy: [
        { users: { name: 'asc' } },
        { classsubjects: { classes: { name: 'asc' } } }
      ]
    });

    // ── Group by trainer → class → subjects ───────────────────────────────────
    // trainerMap: trainerId → trainer info + Map<classId, class info + subjects[]>
    const trainerMap = new Map<number, {
      id: number;
      name: string;
      department: string | null;
      role: string;
      classes: Map<number, {
        class_id: number;
        class_name: string;
        class_code: string;
        class_department: string | null;
        subjects: Array<{
          assignment_id: number;
          subject_id: number;
          subject_name: string;
          subject_code: string;
          credit_hours: number;
          class_subject_id: number;
        }>;
      }>;
    }>();

    subjectAssignments.forEach(sa => {
      const trainer = sa.users;
      const cls = sa.classsubjects.classes;
      const subject = sa.classsubjects.subjects;

      if (!trainerMap.has(trainer.id)) {
        trainerMap.set(trainer.id, {
          id: trainer.id,
          name: trainer.name,
          department: trainer.department,
          role: trainer.role,
          classes: new Map()
        });
      }
      const trainerEntry = trainerMap.get(trainer.id)!;

      if (!trainerEntry.classes.has(cls.id)) {
        trainerEntry.classes.set(cls.id, {
          class_id: cls.id,
          class_name: cls.name,
          class_code: cls.code,
          class_department: cls.department,
          subjects: []
        });
      }

      trainerEntry.classes.get(cls.id)!.subjects.push({
        assignment_id: sa.id,
        subject_id: subject.id,
        subject_name: subject.name,
        subject_code: subject.code,
        credit_hours: subject.credit_hours ?? 0,
        class_subject_id: sa.class_subject_id
      });
    });

    // ── Serialise to response shape ───────────────────────────────────────────
    const trainers = Array.from(trainerMap.values()).map(t => {
      const classArray = Array.from(t.classes.values());
      const totalSubjects = classArray.reduce((sum, c) => sum + c.subjects.length, 0);
      return {
        id: t.id,
        name: t.name,
        department: t.department,
        role: t.role,
        total_classes: classArray.length,
        total_subjects: totalSubjects,
        classes: classArray
      };
    });

    return NextResponse.json({
      term: {
        id: term.id,
        name: term.name,
        start_date: term.start_date.toISOString().split('T')[0],
        end_date: term.end_date.toISOString().split('T')[0]
      },
      trainers,
      summary: {
        total_trainers: trainers.length,
        total_class_assignments: trainers.reduce((s, t) => s + t.total_classes, 0),
        total_subject_assignments: trainers.reduce((s, t) => s + t.total_subjects, 0),
        heavy_load_trainers: trainers.filter(t => t.total_subjects > 6).length
      }
    });

  } catch (error) {
    console.error('Error fetching trainer load:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch trainer load',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}