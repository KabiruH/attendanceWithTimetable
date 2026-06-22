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
const departmentParam = searchParams.get('department') ?? null; // ← add

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

    // ── Parse working days ────────────────────────────────────────────────────
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
      where: { class_id: { in: classIds }, term_id: termId, is_active: true },
      include: {
        classes: { select: { id: true, name: true, code: true, department: true } },
        subjects: {
          select: {
            id: true, name: true, code: true, department: true,
            credit_hours: true, sessions_per_week: true, lesson_type: true
          }
        }
      }
    });

    // ── Class load check (blocks generation if any class exceeds 20 sessions) ──
    // 1 session = 1 period = 2 hrs → 20 sessions max = 40 hrs max per class per week
    const SESSIONS_MAX = 20;
    const HOURS_PER_SESSION = 2;

    const periodsByClass = new Map<number, {
      class_id: number;
      class_name: string;
      class_code: string;
      total_periods: number;
      total_hours: number;
    }>();

    allClassSubjects.forEach(cs => {
      // sessions_per_week IS the period count — lesson_type does not multiply it
      const sessions = cs.sessions_per_week;
      const existing = periodsByClass.get(cs.class_id);
      if (existing) {
        existing.total_periods += sessions;
        existing.total_hours = existing.total_periods * HOURS_PER_SESSION;
      } else {
        periodsByClass.set(cs.class_id, {
          class_id: cs.class_id,
          class_name: cs.classes.name,
          class_code: cs.classes.code,
          total_periods: sessions,
          total_hours: sessions * HOURS_PER_SESSION
        });
      }
    });

    const overloadedClasses = Array.from(periodsByClass.values())
      .filter(c => c.total_periods > SESSIONS_MAX)
      .sort((a, b) => b.total_periods - a.total_periods);

    // ── Trainer assignments with scheduling config ─────────────────────────────
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
            subjects: {
              select: {
                id: true,
                name: true,
                code: true,
                department: true,
                credit_hours: true,
                sessions_per_week: true,
                lesson_type: true
              }
            }
          }
        },
        users: { select: { id: true, name: true, department: true } }
      }
    });

const filteredAssignments = departmentParam
  ? trainerAssignments.filter(ta =>
      ta.classsubjects.subjects.department?.toLowerCase() === departmentParam.toLowerCase()
    )
  : trainerAssignments;

const filteredClassSubjects = departmentParam
  ? allClassSubjects.filter(cs =>
      cs.subjects.department?.toLowerCase() === departmentParam.toLowerCase()
    )
  : allClassSubjects;

    // ── Lesson periods ────────────────────────────────────────────────────────
    const lessonPeriods = await db.lessonperiods.findMany({
      where: { is_active: true },
      orderBy: { start_time: 'asc' }
    });

    // ── Subject combinations for this term ────────────────────────────────────
    const assignmentIds = trainerAssignments.map(ta => ta.id);

    const subjectCombinations = await db.subjectcombinations.findMany({
      where: {
        OR: [
          { primary_assignment_id: { in: assignmentIds } },
          { combined_assignment_id: { in: assignmentIds } }
        ]
      },
      include: {
        subjects: { select: { id: true, name: true, code: true } },
        primary_assignment: {
          include: {
            users: { select: { id: true, name: true } },
            classsubjects: {
              include: {
                classes: { select: { id: true, name: true, code: true } }
              }
            }
          }
        },
        combined_assignment: {
          include: {
            users: { select: { id: true, name: true } },
            classsubjects: {
              include: {
                classes: { select: { id: true, name: true, code: true } }
              }
            }
          }
        }
      }
    });

    // ── Rooms (with department for fallback matching) ──────────────────────────
    const rooms = await db.rooms.findMany({
      where: { is_active: true },
      select: { id: true, name: true, capacity: true, room_type: true, department: true }
    });

    const workshopRooms = rooms.filter(r => r.room_type === 'workshop');

    // ── Room mapping check (fallback-aware) ───────────────────────────────────
    const uniqueActiveSubjects = Array.from(
      new Map(
        allClassSubjects.map(cs => [cs.subjects.id, {
          id: cs.subjects.id,
          name: cs.subjects.name,
          code: cs.subjects.code,
          department: cs.subjects.department
        }])
      ).values()
    );

    const allSubjectRoomMappings = await db.subjectrooms.findMany({
      select: { subject_id: true }
    });

    const mappedSubjectIds = new Set(allSubjectRoomMappings.map(m => m.subject_id));

    const subjectsExplicitlyMapped = uniqueActiveSubjects.filter(s => mappedSubjectIds.has(s.id));

    const subjectsUsingFallback = uniqueActiveSubjects.filter(s => {
      if (mappedSubjectIds.has(s.id)) return false;
      return rooms.some(r => r.department?.toLowerCase() === s.department?.toLowerCase() || r.department?.toLowerCase() === 'all');
    });

    const subjectsWithoutRooms = uniqueActiveSubjects.filter(s => {
      if (mappedSubjectIds.has(s.id)) return false;
      return !rooms.some(r => r.department?.toLowerCase() === s.department?.toLowerCase() || r.department?.toLowerCase() === 'all');
    });

    // ── Build trainer assignment lookup ───────────────────────────────────────
    const classSubjectIdsWithTrainer = new Set(
      trainerAssignments.map(ta => ta.class_subject_id)
    );

    // ── Effective sessions and lesson type — read from classsubjects ──────────
    const subjectsWithTrainer = trainerAssignments.map(ta => {
      const effectiveSessions = ta.classsubjects.sessions_per_week;
      const effectiveLessonType = ta.classsubjects.lesson_type;
      return {
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
        sessions_per_week: effectiveSessions,
        lesson_type: effectiveLessonType,
        is_override: false,
        trainer: {
          id: ta.users.id,
          name: ta.users.name,
          department: ta.users.department
        }
      };
    });

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
        credit_hours: cs.subjects.credit_hours,
        sessions_per_week: cs.sessions_per_week,
        lesson_type: cs.lesson_type
      }));

    // ── Trainer summary map ───────────────────────────────────────────────────
    const trainerMap = new Map<number, {
      id: number;
      name: string;
      department: string | null;
      subjects_count: number;
      total_periods_per_week: number;
      subjects: Array<{
        code: string;
        name: string;
        class_code: string;
        sessions_per_week: number;
        lesson_type: string;
        periods_per_week: number;
      }>;
    }>();

    trainerAssignments.forEach(ta => {
      const effectiveSessions = ta.classsubjects.sessions_per_week;
      const effectiveLessonType = ta.classsubjects.lesson_type;
      // periods_per_week = sessions_per_week (1 session = 1 period)
      const periodsPerWeek = effectiveSessions;
      const existing = trainerMap.get(ta.users.id);
      if (existing) {
        existing.subjects_count++;
        existing.total_periods_per_week += periodsPerWeek;
        existing.subjects.push({
          code: ta.classsubjects.subjects.code,
          name: ta.classsubjects.subjects.name,
          class_code: ta.classsubjects.classes.code,
          sessions_per_week: effectiveSessions,
          lesson_type: effectiveLessonType,
          periods_per_week: periodsPerWeek
        });
      } else {
        trainerMap.set(ta.users.id, {
          id: ta.users.id,
          name: ta.users.name,
          department: ta.users.department,
          subjects_count: 1,
          total_periods_per_week: periodsPerWeek,
          subjects: [{
            code: ta.classsubjects.subjects.code,
            name: ta.classsubjects.subjects.name,
            class_code: ta.classsubjects.classes.code,
            sessions_per_week: effectiveSessions,
            lesson_type: effectiveLessonType,
            periods_per_week: periodsPerWeek
          }]
        });
      }
    });

    const trainerList = Array.from(trainerMap.values());

const existingSlots = departmentParam
  ? await db.timetableslots.count({
      where: {
        term_id: termId,
        subjects: { department: departmentParam }
      }
    })
  : await db.timetableslots.count({ where: { term_id: termId } });


    // ── Combination analysis ──────────────────────────────────────────────────
    const combinationsBySubject = new Map<number, typeof subjectCombinations>();
    subjectCombinations.forEach(combo => {
      const existing = combinationsBySubject.get(combo.subject_id) ?? [];
      existing.push(combo);
      combinationsBySubject.set(combo.subject_id, existing);
    });

    interface SessionGroupMeta {
      subjectId: number;
      subjectName: string;
      subjectCode: string;
      sessionNumber: number;
      trainerIds: Set<number>;
      trainerNames: string[];
      classCodes: string[];
      isMultiTrainer: boolean;
    }
    const sessionGroupMap = new Map<string, SessionGroupMeta>();

    subjectCombinations.forEach(combo => {
      const key = `${combo.subject_id}-${combo.session_number}`;
      const primaryTrainerId = combo.primary_assignment.users.id;
      const combinedTrainerId = combo.combined_assignment.users.id;

      if (!sessionGroupMap.has(key)) {
        sessionGroupMap.set(key, {
          subjectId: combo.subject_id,
          subjectName: combo.subjects.name,
          subjectCode: combo.subjects.code,
          sessionNumber: combo.session_number,
          trainerIds: new Set(),
          trainerNames: [],
          classCodes: [],
          isMultiTrainer: false
        });
      }
      const group = sessionGroupMap.get(key)!;

      if (!group.trainerIds.has(primaryTrainerId)) {
        group.trainerIds.add(primaryTrainerId);
        group.trainerNames.push(combo.primary_assignment.users.name);
      }
      if (!group.trainerIds.has(combinedTrainerId)) {
        group.trainerIds.add(combinedTrainerId);
        group.trainerNames.push(combo.combined_assignment.users.name);
      }
      const primaryCode = combo.primary_assignment.classsubjects.classes.code;
      const combinedCode = combo.combined_assignment.classsubjects.classes.code;
      if (!group.classCodes.includes(primaryCode)) group.classCodes.push(primaryCode);
      if (!group.classCodes.includes(combinedCode)) group.classCodes.push(combinedCode);
    });

    sessionGroupMap.forEach(group => {
      group.isMultiTrainer = group.trainerIds.size > 1;
    });

    const allSessionGroups = Array.from(sessionGroupMap.values());
    const multiTrainerGroups = allSessionGroups.filter(g => g.isMultiTrainer);
    const sameTrainerGroups = allSessionGroups.filter(g => !g.isMultiTrainer);

    const combinationSummary = Array.from(combinationsBySubject.entries()).map(
      ([subjectId, combos]) => {
        const subjectGroups = allSessionGroups.filter(g => g.subjectId === subjectId);
        return {
          subject_id: subjectId,
          subject_name: combos[0].subjects.name,
          subject_code: combos[0].subjects.code,
          combination_count: combos.length,
          session_groups: subjectGroups.map(g => ({
            session_number: g.sessionNumber,
            type: g.isMultiTrainer ? 'multi_trainer' : 'same_trainer',
            trainer_count: g.trainerIds.size,
            trainer_names: g.trainerNames,
            class_codes: g.classCodes,
            requires_workshop: g.isMultiTrainer
          })),
          combinations: combos.map(c => ({
            id: c.id,
            session_number: c.session_number,
            class_a: c.primary_assignment.classsubjects.classes.name,
            class_a_code: c.primary_assignment.classsubjects.classes.code,
            trainer_a: c.primary_assignment.users.name,
            class_b: c.combined_assignment.classsubjects.classes.name,
            class_b_code: c.combined_assignment.classsubjects.classes.code,
            trainer_b: c.combined_assignment.users.name,
          }))
        };
      }
    );

    // ── Scheduling config summary ─────────────────────────────────────────────
    const lessonTypeCounts = { single: 0, double: 0, triple: 0 };
    subjectsWithTrainer.forEach(s => {
      const lt = s.lesson_type as 'single' | 'double' | 'triple';
      if (lt in lessonTypeCounts) lessonTypeCounts[lt]++;
    });

    // total slots = sum of sessions_per_week (1 session = 1 slot)
    const totalSlotsNeeded = subjectsWithTrainer.reduce((sum, s) => sum + s.sessions_per_week, 0);

    // ── Errors & warnings ─────────────────────────────────────────────────────
    const errors: string[] = [];
    const warnings: string[] = [];

    if (activeTermClasses.length === 0) {
      errors.push('No active classes assigned to this term.');
    }

    if (allClassSubjects.length === 0) {
      errors.push('No subjects assigned to classes for this term. Assign subjects to classes first.');
    }

    // ── Class load check — blocks generation ─────────────────────────────────
    if (overloadedClasses.length > 0) {
      const classList = overloadedClasses
        .map(c => `${c.class_code} (${c.total_periods} sessions / ${c.total_hours} hrs)`)
        .join(', ');
      errors.push(
        `${overloadedClasses.length} class(es) exceed the 20-session (40 hr) weekly limit: ${classList}. ` +
        `Fix session counts in the Class Load page before generating.`
      );
    }

    if (subjectsWithoutTrainer.length > 0) {
      errors.push(
        `${subjectsWithoutTrainer.length} subject(s) have no trainer assigned. Trainers must select their subjects before generating.`
      );
    }

    if (subjectsWithoutRooms.length > 0) {
      errors.push(
        `${subjectsWithoutRooms.length} subject(s) have no eligible rooms — no explicit assignment and no ` +
        `active rooms match their department. Either assign rooms explicitly in Subject — Room Assignments, ` +
        `or ensure active rooms exist for their department.`
      );
    }

    if (subjectsUsingFallback.length > 0) {
      warnings.push(
        `${subjectsUsingFallback.length} subject(s) have no explicit room assignment and will be scheduled ` +
        `in any available room matching their department or marked as "all".`
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

    if (multiTrainerGroups.length > 0 && workshopRooms.length === 0) {
      errors.push(
        `${multiTrainerGroups.length} combined session group(s) involve multiple trainers sharing a room, ` +
        `but no workshop rooms are configured. ` +
        `Mark at least one room as "workshop" in Room Management so these sessions can be placed.`
      );
    } else if (multiTrainerGroups.length > 0 && workshopRooms.length > 0) {
      warnings.push(
        `${multiTrainerGroups.length} multi-trainer session group(s) will be placed in workshop rooms. ` +
        `Available workshops: ${workshopRooms.map(r => r.name).join(', ')}.`
      );
    }

    if (sameTrainerGroups.length > 0) {
      warnings.push(
        `${sameTrainerGroups.length} combined session group(s) share a single trainer across multiple classes — ` +
        `these will use any eligible room and follow normal conflict rules.`
      );
    }

    const doubleTripleSubjects = subjectsWithTrainer.filter(
      s => s.lesson_type === 'double' || s.lesson_type === 'triple'
    );

    if (doubleTripleSubjects.length > 0) {
      const doubleCount = doubleTripleSubjects.filter(s => s.lesson_type === 'double').length;
      const tripleCount = doubleTripleSubjects.filter(s => s.lesson_type === 'triple').length;

      if (doubleCount > 0 && lessonPeriods.length < 2) {
        errors.push(
          `${doubleCount} subject(s) require double periods but only ${lessonPeriods.length} lesson period(s) are configured. Add at least 2 lesson periods.`
        );
      }
      if (tripleCount > 0 && lessonPeriods.length < 3) {
        errors.push(
          `${tripleCount} subject(s) require triple periods but only ${lessonPeriods.length} lesson period(s) are configured. Add at least 3 lesson periods.`
        );
      }
      if (lessonPeriods.length >= 2) {
        warnings.push(
          `${doubleTripleSubjects.length} subject(s) require consecutive periods (${doubleCount} double, ${tripleCount} triple). ` +
          `The generator will find back-to-back slots for these — scheduling may be tighter.`
        );
      }
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

    // ── Per-trainer period availability check ─────────────────────────────────
    const totalSlotsPerWeek = workingDaysArray.length * lessonPeriods.length;
    trainerList.forEach(trainer => {
      if (trainer.total_periods_per_week > totalSlotsPerWeek) {
        warnings.push(
          `${trainer.name} needs ${trainer.total_periods_per_week} period(s)/week across ${trainer.subjects_count} subject(s), ` +
          `but only ${totalSlotsPerWeek} slots/week are available.`
        );
      }
    });

    const filteredClassIds = departmentParam
  ? [...new Set(filteredClassSubjects.map(cs => cs.class_id))]
  : classIds;

const filteredTermClasses = activeTermClasses.filter(tc =>
  filteredClassIds.includes(tc.class_id)
);

    const result = {
      passed: errors.length === 0,
      department: departmentParam ?? null, 
      term_info: {
        id: term.id,
        name: term.name,
        start_date: term.start_date.toISOString().split('T')[0],
        end_date: term.end_date.toISOString().split('T')[0],
        working_days: workingDaysArray,
        days_count: workingDaysArray.length
      },
      classes: {
  total: filteredTermClasses.length,
  list: filteredTermClasses.map(tc => ({
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
      scheduling_config: {
        lesson_type_breakdown: lessonTypeCounts,
        total_period_slots_needed_per_week: totalSlotsNeeded,
        subjects_with_overrides: 0
      },
      class_load: {
        sessions_max: SESSIONS_MAX,
        hours_max: SESSIONS_MAX * HOURS_PER_SESSION,
        overloaded_count: overloadedClasses.length,
        overloaded_classes: overloadedClasses
      },
      combinations: {
        total: subjectCombinations.length,
        session_groups_total: allSessionGroups.length,
        multi_trainer_groups: multiTrainerGroups.length,
        same_trainer_groups: sameTrainerGroups.length,
        workshop_rooms_available: workshopRooms.length,
        subjects_with_combinations: combinationsBySubject.size,
        details: combinationSummary
      },
      subject_room_mappings: {
        total_active_subjects: uniqueActiveSubjects.length,
        explicitly_mapped: subjectsExplicitlyMapped.length,
        using_fallback: subjectsUsingFallback.length,
        blocked: subjectsWithoutRooms.length,
        blocked_subjects: subjectsWithoutRooms.map(s => ({
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
        workshops: workshopRooms.length,
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