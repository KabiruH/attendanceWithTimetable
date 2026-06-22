// app/api/timetable/class-load/route.ts
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

// Each session = 1 period = 2 hrs regardless of lesson type.
// lesson_type only affects how the generator groups sessions (consecutive pairs/triples).

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized. Admin or Timetable Admin access required.' }, { status: 403 });
    }

    const currentTerm = await db.terms.findFirst({
      where: { is_active: true },
      orderBy: { start_date: 'desc' }
    });

    if (!currentTerm) {
      return NextResponse.json({ error: 'No active term found.' }, { status: 404 });
    }

    const termClasses = await db.termclasses.findMany({
      where: { term_id: currentTerm.id },
      include: {
        classes: {
          select: { id: true, name: true, code: true, department: true, is_active: true }
        }
      },
      orderBy: { classes: { name: 'asc' } }
    });

    const activeTermClasses = termClasses.filter(tc => tc.classes.is_active);

    if (activeTermClasses.length === 0) {
      return NextResponse.json({
        term: { id: currentTerm.id, name: currentTerm.name, start_date: currentTerm.start_date, end_date: currentTerm.end_date },
        summary: { total_classes: 0, ok: 0, over: 0, departments: [] },
        classes: []
      });
    }

    const classIds = activeTermClasses.map(tc => tc.class_id);

    const allClassSubjects = await db.classsubjects.findMany({
      where: { class_id: { in: classIds }, term_id: currentTerm.id },
      include: {
        subjects: { select: { id: true, name: true, code: true } },
        trainersubjectassignments: {
          where: { term_id: currentTerm.id, is_active: true },
          include: { users: { select: { id: true, name: true } } },
          take: 1
        }
      }
    });

    const subjectsByClass = new Map<number, typeof allClassSubjects>();
    allClassSubjects.forEach(cs => {
      const existing = subjectsByClass.get(cs.class_id) ?? [];
      existing.push(cs);
      subjectsByClass.set(cs.class_id, existing);
    });

    // 20 sessions max per class per week, each session = 2 hrs = 40 hrs max
    const SESSIONS_MAX = 20;
    const HOURS_PER_SESSION = 2;
    const HOURS_MAX = SESSIONS_MAX * HOURS_PER_SESSION;

    const classes = activeTermClasses.map(tc => {
      const cls = tc.classes;
      const subjects = subjectsByClass.get(cls.id) ?? [];
      const activeSubjects = subjects.filter(cs => cs.is_active);

      // Total sessions = sum of sessions_per_week (lesson_type does not affect count)
      const totalSessions = activeSubjects.reduce((sum, cs) => sum + cs.sessions_per_week, 0);
      const totalHours = totalSessions * HOURS_PER_SESSION;
      const assignedCount = activeSubjects.filter(cs => cs.trainersubjectassignments.length > 0).length;

      const status: 'ok' | 'over' = totalSessions > SESSIONS_MAX ? 'over' : 'ok';

      return {
        id: cls.id,
        name: cls.name,
        code: cls.code,
        department: cls.department,
        total_periods: totalSessions,
        total_hours: totalHours,
        periods_max: SESSIONS_MAX,
        hours_max: HOURS_MAX,
        gap: SESSIONS_MAX - totalSessions,
        subject_count: activeSubjects.length,
        assigned_trainer_count: assignedCount,
        status
      };
    });

    const deptMap = new Map<string, { total: number; over: number }>();
    classes.forEach(c => {
      const existing = deptMap.get(c.department) ?? { total: 0, over: 0 };
      existing.total++;
      if (c.status === 'over') existing.over++;
      deptMap.set(c.department, existing);
    });

    const departments = Array.from(deptMap.entries())
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      term: {
        id: currentTerm.id,
        name: currentTerm.name,
        start_date: currentTerm.start_date,
        end_date: currentTerm.end_date
      },
      summary: {
        total_classes: classes.length,
        ok: classes.filter(c => c.status === 'ok').length,
        over: classes.filter(c => c.status === 'over').length,
        departments
      },
      classes
    });

  } catch (error) {
    console.error('Error fetching class load:', error);
    return NextResponse.json({ error: 'Failed to fetch class load data' }, { status: 500 });
  }
}