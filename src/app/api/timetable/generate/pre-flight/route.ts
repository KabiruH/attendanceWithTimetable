// app/api/timetable/generate/pre-flight/route.ts
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

    if (!termIdParam) {
      return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
    }

    const termId = parseInt(termIdParam);
    if (isNaN(termId)) {
      return NextResponse.json({ error: 'Invalid term ID' }, { status: 400 });
    }

    const term = await db.terms.findUnique({ where: { id: termId } });
    if (!term) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }

    const now = new Date();
    const termStart = new Date(term.start_date);
    const daysSinceStart = Math.floor(
      (now.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const canRegenerate = daysSinceStart <= 14;

    // ── Term classes ──────────────────────────────────────────────────────────
    const termClasses = await db.termclasses.findMany({
      where: { term_id: termId },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            duration_hours: true,
            is_active: true
          }
        }
      }
    });

    const activeTermClasses = termClasses.filter(tc => tc.classes.is_active);
    const classIds = activeTermClasses.map(tc => tc.class_id);

    // ── Class subjects for this term ──────────────────────────────────────────
    const allClassSubjects = await db.classsubjects.findMany({
      where: { class_id: { in: classIds }, term_id: termId },
      include: {
        classes: { select: { id: true, name: true, code: true, department: true } },
        subjects: { select: { id: true, name: true, code: true, department: true, credit_hours: true } }
      }
    });

    // ── Trainer assignments ───────────────────────────────────────────────────
    const trainerAssignments = await db.trainersubjectassignments.findMany({
      where: {
        term_id: termId,
        is_active: true,
        class_subject_id: { in: allClassSubjects.map(cs => cs.id) }
      },
      include: {
        classsubjects: {
          include: {
            classes: { select: { id: true, name: true, code: true, department: true } },
            subjects: { select: { id: true, name: true, code: true, department: true, credit_hours: true } }
          }
        },
        users: { select: { id: true, name: true, department: true } }
      }
    });

    // ── Room mapping check (GLOBAL — not per term) ────────────────────────────
    // Fetch every active subject in the system
    const allActiveSubjects = await db.subjects.findMany({
      where: { is_active: true },
      select: { id: true, name: true, code: true, department: true }
    });

    // Fetch all existing subject-room mappings
    const allSubjectRoomMappings = await db.subjectrooms.findMany({
      select: { subject_id: true }
    });

    const mappedSubjectIds = new Set(allSubjectRoomMappings.map(m => m.subject_id));

    const subjectsWithoutRooms = allActiveSubjects.filter(
      s => !mappedSubjectIds.has(s.id)
    );

    // ── Build trainer map ─────────────────────────────────────────────────────
    const classSubjectIdsWithTrainer = new Set(
      trainerAssignments.map(ta => ta.class_subject_id)
    );

    const subjectsWithTrainer = trainerAssignments.map(ta => ({
      id: ta.classsubjects.id,
      trainer_assignment_id: ta.id,
      subject_id: ta.classsubjects.subjects.id,
      subject_name: ta.classsubjects.subjects.name,
      subject_code: ta.classsubjects.subjects.code,
      class_id: ta.classsubjects.classes.id,
      class_name: ta.classsubjects.classes.name,
      class_code: ta.classsubjects.classes.code,
      department: ta.classsubjects.classes.department,
      credit_hours: ta.classsubjects.subjects.credit_hours,
      trainer: {
        id: ta.users.id,
        name: ta.users.name,
        department: ta.users.department
      }
    }));

    const subjectsWithoutTrainer = allClassSubjects
      .filter(cs => !classSubjectIdsWithTrainer.has(cs.id))
      .map(cs => ({
        id: cs.id,
        subject_id: cs.subjects.id,
        subject_name: cs.subjects.name,
        subject_code: cs.subjects.code,
        class_id: cs.classes.id,
        class_name: cs.classes.name,
        class_code: cs.classes.code,
        department: cs.classes.department,
        credit_hours: cs.subjects.credit_hours
      }));

    const trainerMap = new Map<number, {
      id: number;
      name: string;
      department: string | null;
      subjects_count: number;
      subjects: Array<{ code: string; name: string; class_code: string }>;
    }>();

    trainerAssignments.forEach(ta => {
      const existing = trainerMap.get(ta.users.id);
      if (existing) {
        existing.subjects_count++;
        existing.subjects.push({
          code: ta.classsubjects.subjects.code,
          name: ta.classsubjects.subjects.name,
          class_code: ta.classsubjects.classes.code
        });
      } else {
        trainerMap.set(ta.users.id, {
          id: ta.users.id,
          name: ta.users.name,
          department: ta.users.department,
          subjects_count: 1,
          subjects: [{
            code: ta.classsubjects.subjects.code,
            name: ta.classsubjects.subjects.name,
            class_code: ta.classsubjects.classes.code
          }]
        });
      }
    });

    const trainerList = Array.from(trainerMap.values());

    // ── Rooms & periods ───────────────────────────────────────────────────────
    const rooms = await db.rooms.findMany({
      where: { is_active: true },
      select: { id: true, name: true, capacity: true, room_type: true }
    });

    const lessonPeriods = await db.lessonperiods.findMany({
      where: { is_active: true },
      orderBy: { start_time: 'asc' }
    });

    const existingSlots = await db.timetableslots.count({ where: { term_id: termId } });

    let workingDaysArray: number[] = [1, 2, 3, 4, 5];
    try {
      if (term.working_days) {
        workingDaysArray = Array.isArray(term.working_days)
          ? term.working_days
          : JSON.parse(term.working_days as string);
      }
    } catch {
      console.warn('Failed to parse working_days, using default Mon-Fri');
    }

    // ── Errors & warnings ─────────────────────────────────────────────────────
    const errors: string[] = [];
    const warnings: string[] = [];

    if (activeTermClasses.length === 0) {
      errors.push('No active classes assigned to this term.');
    }

    if (allClassSubjects.length === 0) {
      errors.push('No subjects assigned to classes for this term. Assign subjects to classes first.');
    }

    if (subjectsWithoutTrainer.length > 0) {
      errors.push(
        `${subjectsWithoutTrainer.length} subject(s) have no trainer assigned. Trainers must select their subjects before generating.`
      );
    }

    // ── Room mapping error — hard block, term-agnostic ────────────────────────
    if (subjectsWithoutRooms.length > 0) {
      errors.push(
        `${subjectsWithoutRooms.length} active subject(s) have no room assigned. ` +
        `Go to Subject — Room Assignments and assign at least one room to every subject before generating.`
      );
    }

    if (rooms.length === 0) {
      errors.push('No active rooms available. Add rooms before generating.');
    }

    if (lessonPeriods.length === 0) {
      errors.push('No lesson periods configured. Add lesson periods before generating.');
    }

    if (trainerList.length === 0 && allClassSubjects.length > 0) {
      errors.push('No trainers have selected subjects for this term.');
    }

    if (existingSlots > 0 && !canRegenerate) {
      errors.push(
        `Cannot regenerate: Term started ${daysSinceStart} days ago (limit is 14 days).`
      );
    }

    if (rooms.length < trainerList.length) {
      warnings.push(
        `Only ${rooms.length} room(s) for ${trainerList.length} trainer(s). Some sessions may conflict.`
      );
    }

    if (lessonPeriods.length < 4) {
      warnings.push(
        `Only ${lessonPeriods.length} lesson period(s). Consider adding more for flexible scheduling.`
      );
    }

    const totalSlotsPerWeek = workingDaysArray.length * lessonPeriods.length;
    trainerList.forEach(trainer => {
      if (trainer.subjects_count > totalSlotsPerWeek) {
        warnings.push(
          `${trainer.name} has ${trainer.subjects_count} subjects but only ${totalSlotsPerWeek} slots/week available.`
        );
      }
    });

    const result = {
      passed: errors.length === 0,
      term_info: {
        id: term.id,
        name: term.name,
        start_date: term.start_date.toISOString().split('T')[0],
        end_date: term.end_date.toISOString().split('T')[0],
        working_days: workingDaysArray,
        days_count: workingDaysArray.length
      },
      classes: {
        total: activeTermClasses.length,
        list: activeTermClasses.map(tc => ({
          id: tc.classes.id,
          name: tc.classes.name,
          code: tc.classes.code,
          department: tc.classes.department
        }))
      },
      subjects: {
        total: allClassSubjects.length,
        with_trainer: subjectsWithTrainer.length,
        without_trainer: subjectsWithoutTrainer.length,
        details_with_trainer: subjectsWithTrainer,
        details_without_trainer: subjectsWithoutTrainer
      },
      // ── Room mapping summary (global) ─────────────────────────────────────
      subject_room_mappings: {
        total_active_subjects: allActiveSubjects.length,
        mapped: allActiveSubjects.length - subjectsWithoutRooms.length,
        unmapped: subjectsWithoutRooms.length,
        unmapped_subjects: subjectsWithoutRooms.map(s => ({
          id: s.id,
          name: s.name,
          code: s.code,
          department: s.department
        }))
      },
      trainers: {
        total: trainerList.length,
        list: trainerList
      },
      rooms: {
        total: rooms.length,
        active: rooms.length,
        list: rooms
      },
      lesson_periods: {
        total: lessonPeriods.length,
        active: lessonPeriods.length,
        list: lessonPeriods.map(lp => ({
          id: lp.id,
          name: lp.name,
          start_time: lp.start_time.toISOString().slice(11, 16),
          end_time: lp.end_time.toISOString().slice(11, 16),
          duration: lp.duration
        }))
      },
      existing_timetable: {
        exists: existingSlots > 0,
        slots_count: existingSlots,
        can_regenerate: canRegenerate,
        days_since_term_start: daysSinceStart
      },
      errors,
      warnings
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error running pre-flight checks:', error);
    return NextResponse.json(
      {
        error: 'Failed to run pre-flight checks',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}