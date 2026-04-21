// app/api/timetable/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';
import { randomUUID } from 'crypto';

interface GenerationSettings {
  term_id: number;
  min_classes_per_day: number;
  regenerate: boolean;
}

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotToCreate {
  id: string;
  term_id: number;
  class_id: number;
  subject_id: number;
  employee_id: number;
  room_id: number;
  lesson_period_id: number;
  day_of_week: number;
  status: string;
  is_online_session: boolean;
  created_at: Date;
  updated_at: Date;
  // Extra metadata stored in draft JSON for combination handling at confirm time
  combined_class_ids?: number[];
  session_group_id?: string; // links double/triple slots that belong to same session
}

interface SkippedAssignment {
  trainer_assignment_id: number;
  subject_code: string;
  subject_name: string;
  class_code: string;
  trainer_name: string;
  scheduled: number;
  requested: number;
  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Core scheduling algorithm ─────────────────────────────────────────────────
function generateSlots(
  trainerAssignments: any[],
  workingDaysArray: number[],
  lessonPeriods: any[],  // already sorted by start_time asc
  rooms: any[],
  subjectRoomMap: Map<number, number[]>,
  subjectCombinations: any[], // from db.subjectcombinations
  term_id: number
) {
  const slotsToCreate: SlotToCreate[] = [];
  const skippedAssignments: SkippedAssignment[] = [];

  // slot availability tracking
  // keys: `room-{day}-{periodId}-{roomId}`, `trainer-{day}-{periodId}-{trainerId}`, `class-{day}-{periodId}-{classId}`
  const scheduledSlots = new Map<string, boolean>();
  const usedRooms = new Set<number>();
  const usedTrainers = new Set<number>();

  // ── Build combination lookup ──────────────────────────────────────────────
  // Map: assignment_id → Map<session_number, paired_assignment_id>
  const combinationMap = new Map<number, Map<number, number>>();

  // Set of assignment IDs that appear as "combined" (secondary) — 
  // these will be handled when their primary is processed
  const secondaryAssignmentIds = new Set<number>();

  subjectCombinations.forEach(combo => {
    // primary side
    if (!combinationMap.has(combo.primary_assignment_id)) {
      combinationMap.set(combo.primary_assignment_id, new Map());
    }
    combinationMap.get(combo.primary_assignment_id)!.set(
      combo.session_number,
      combo.combined_assignment_id
    );

    // mark combined as secondary so we skip it in the main loop
    secondaryAssignmentIds.add(combo.combined_assignment_id);
  });

  // ── Build assignment lookup by ID ─────────────────────────────────────────
  const assignmentById = new Map<number, any>();
  trainerAssignments.forEach(ta => assignmentById.set(ta.id, ta));

  // ── Slot availability helpers ─────────────────────────────────────────────
  const isSlotAvailable = (
    day: number,
    periodId: number,
    roomId: number,
    trainerId: number,
    classIds: number[]
  ): boolean => {
    if (scheduledSlots.has(`room-${day}-${periodId}-${roomId}`)) return false;
    if (scheduledSlots.has(`trainer-${day}-${periodId}-${trainerId}`)) return false;
    for (const classId of classIds) {
      if (scheduledSlots.has(`class-${day}-${periodId}-${classId}`)) return false;
    }
    return true;
  };

  const markSlotUsed = (
    day: number,
    periodId: number,
    roomId: number,
    trainerId: number,
    classIds: number[]
  ) => {
    scheduledSlots.set(`room-${day}-${periodId}-${roomId}`, true);
    scheduledSlots.set(`trainer-${day}-${periodId}-${trainerId}`, true);
    for (const classId of classIds) {
      scheduledSlots.set(`class-${day}-${periodId}-${classId}`, true);
    }
  };

  // ── Find consecutive period groups ────────────────────────────────────────
  // Returns arrays of period IDs that are consecutive in the lessonPeriods array
  // e.g. for double: [[p1,p2],[p2,p3]] — each group is a valid consecutive pair
  const getConsecutivePeriodGroups = (count: number): number[][] => {
    const groups: number[][] = [];
    for (let i = 0; i <= lessonPeriods.length - count; i++) {
      const group = lessonPeriods.slice(i, i + count).map((p: any) => p.id);
      groups.push(group);
    }
    return groups;
  };

  // ── Create a single-period slot object ────────────────────────────────────
  const makeSlot = (
    termId: number,
    classId: number,
    subjectId: number,
    trainerId: number,
    roomId: number,
    periodId: number,
    day: number,
    combinedClassIds?: number[],
    sessionGroupId?: string
  ): SlotToCreate => ({
    id: randomUUID(),
    term_id: termId,
    class_id: classId,
    subject_id: subjectId,
    employee_id: trainerId,
    room_id: roomId,
    lesson_period_id: periodId,
    day_of_week: day,
    status: 'scheduled',
    is_online_session: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...(combinedClassIds && combinedClassIds.length > 0 ? { combined_class_ids: combinedClassIds } : {}),
    ...(sessionGroupId ? { session_group_id: sessionGroupId } : {})
  });

  // ── Main scheduling loop ──────────────────────────────────────────────────
  for (const assignment of trainerAssignments) {
    // Skip secondary assignments — they are handled when their primary is processed
    if (secondaryAssignmentIds.has(assignment.id)) continue;

    const classSubject = assignment.classsubjects;
    const subject = classSubject.subjects;
    const classData = classSubject.classes;
    const trainer = assignment.users;

    const trainerId = trainer.id;
    const primaryClassId = classData.id;
    const subjectId = subject.id;

    // Effective sessions and lesson type — assignment override or subject default
    const sessionsPerWeek: number = assignment.sessions_per_week ?? subject.sessions_per_week ?? 1;
    const lessonType: string = assignment.lesson_type ?? subject.lesson_type ?? 'single';
    const periodsPerSession = lessonType === 'triple' ? 3 : lessonType === 'double' ? 2 : 1;

    // Rooms allowed for this subject
    const allowedRoomIds = new Set(subjectRoomMap.get(subjectId) ?? []);
    const allowedRooms = rooms.filter(r => allowedRoomIds.has(r.id));

    // Check if this assignment has any combinations configured
    const combosBySession = combinationMap.get(assignment.id); // Map<session_number, combined_assignment_id> | undefined

    let sessionsScheduled = 0;
    const scheduledDays = new Set<number>();

    const shuffledDays = shuffleArray([...workingDaysArray]);

    for (let sessionNum = 1; sessionNum <= sessionsPerWeek; sessionNum++) {
      if (sessionsScheduled >= sessionsPerWeek) break;

      // Is this session combined with another class?
      const combinedAssignmentId = combosBySession?.get(sessionNum);
      const combinedAssignment = combinedAssignmentId ? assignmentById.get(combinedAssignmentId) : null;
      const combinedClassId = combinedAssignment?.classsubjects?.classes?.id ?? null;

      // All class IDs that must be free for this slot
      const allClassIds = combinedClassId
        ? [primaryClassId, combinedClassId]
        : [primaryClassId];

      // Also check combined trainer if different
      // In most cases it's the same trainer, but handle it properly
      const combinedTrainerId = combinedAssignment?.users?.id ?? null;

      let placed = false;

      // Try to spread across different days first
      const daysToTry = [
        ...shuffledDays.filter(d => !scheduledDays.has(d)),
        ...shuffledDays.filter(d => scheduledDays.has(d))
      ];

      for (const day of daysToTry) {
        if (placed) break;

        if (periodsPerSession === 1) {
          // ── Single period ──────────────────────────────────────────────────
          const shuffledPeriods = shuffleArray(lessonPeriods);
          for (const period of shuffledPeriods) {
            const availableRooms = allowedRooms.filter(room =>
              isSlotAvailable(day, period.id, room.id, trainerId, allClassIds) &&
              // If combined trainer is different, check their availability too
              (!combinedTrainerId || combinedTrainerId === trainerId ||
                !scheduledSlots.has(`trainer-${day}-${period.id}-${combinedTrainerId}`))
            );
            if (availableRooms.length === 0) continue;

            const selectedRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];

            slotsToCreate.push(makeSlot(
              term_id, primaryClassId, subjectId, trainerId,
              selectedRoom.id, period.id, day,
              combinedClassId ? [combinedClassId] : undefined
            ));

            markSlotUsed(day, period.id, selectedRoom.id, trainerId, allClassIds);
            if (combinedTrainerId && combinedTrainerId !== trainerId) {
              scheduledSlots.set(`trainer-${day}-${period.id}-${combinedTrainerId}`, true);
            }

            usedRooms.add(selectedRoom.id);
            usedTrainers.add(trainerId);
            scheduledDays.add(day);
            sessionsScheduled++;
            placed = true;
            break;
          }
        } else {
          // ── Double or Triple: need consecutive periods ──────────────────────
          const consecutiveGroups = shuffleArray(getConsecutivePeriodGroups(periodsPerSession));
          const sessionGroupId = randomUUID(); // links slots from this session together

          for (const periodGroup of consecutiveGroups) {
            // Check all periods in the group are available
            const allPeriodsAvailable = periodGroup.every(periodId => {
              const availableRooms = allowedRooms.filter(room =>
                isSlotAvailable(day, periodId, room.id, trainerId, allClassIds) &&
                (!combinedTrainerId || combinedTrainerId === trainerId ||
                  !scheduledSlots.has(`trainer-${day}-${periodId}-${combinedTrainerId}`))
              );
              return availableRooms.length > 0;
            });

            if (!allPeriodsAvailable) continue;

            // Find a room that's free for ALL periods in the group
            const roomFreeForAll = allowedRooms.find(room =>
              periodGroup.every(periodId =>
                isSlotAvailable(day, periodId, room.id, trainerId, allClassIds) &&
                (!combinedTrainerId || combinedTrainerId === trainerId ||
                  !scheduledSlots.has(`trainer-${day}-${periodId}-${combinedTrainerId}`))
              )
            );

            if (!roomFreeForAll) continue;

            // Create one slot per period in the group, all linked by sessionGroupId
            for (const periodId of periodGroup) {
              slotsToCreate.push(makeSlot(
                term_id, primaryClassId, subjectId, trainerId,
                roomFreeForAll.id, periodId, day,
                combinedClassId ? [combinedClassId] : undefined,
                sessionGroupId
              ));

              markSlotUsed(day, periodId, roomFreeForAll.id, trainerId, allClassIds);
              if (combinedTrainerId && combinedTrainerId !== trainerId) {
                scheduledSlots.set(`trainer-${day}-${periodId}-${combinedTrainerId}`, true);
              }
            }

            usedRooms.add(roomFreeForAll.id);
            usedTrainers.add(trainerId);
            scheduledDays.add(day);
            sessionsScheduled++;
            placed = true;
            break;
          }
        }
      }

      if (!placed) {
        // Could not place this session — record partial skip
        // We continue trying remaining sessions rather than giving up entirely
      }
    }

    if (sessionsScheduled < sessionsPerWeek) {
      skippedAssignments.push({
        trainer_assignment_id: assignment.id,
        subject_code: subject.code,
        subject_name: subject.name,
        class_code: classData.code,
        trainer_name: trainer.name,
        scheduled: sessionsScheduled,
        requested: sessionsPerWeek,
        reason: sessionsScheduled === 0
          ? `No available slots found — check room assignments and period availability for ${lessonType} sessions`
          : `Only ${sessionsScheduled}/${sessionsPerWeek} sessions placed — insufficient consecutive slots for ${lessonType} sessions`
      });
    }
  }

  // ── Also record skipped secondary assignments that had no primary ─────────
  // (edge case: secondary whose primary was also skipped)
  for (const assignmentId of secondaryAssignmentIds) {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment) continue;

    // Check if any slot was created for this class+subject
    const hasSlot = slotsToCreate.some(
      s => s.class_id === assignment.classsubjects.classes.id &&
           s.subject_id === assignment.classsubjects.subjects.id
    );

    if (!hasSlot) {
      skippedAssignments.push({
        trainer_assignment_id: assignment.id,
        subject_code: assignment.classsubjects.subjects.code,
        subject_name: assignment.classsubjects.subjects.name,
        class_code: assignment.classsubjects.classes.code,
        trainer_name: assignment.users.name,
        scheduled: 0,
        requested: assignment.sessions_per_week ?? assignment.classsubjects.subjects.sessions_per_week ?? 1,
        reason: 'Combined class — primary assignment could not be scheduled'
      });
    }
  }

  const stats = {
    slots_created: slotsToCreate.length,
    trainer_assignments_processed: trainerAssignments.length - secondaryAssignmentIds.size,
    combined_assignments: secondaryAssignmentIds.size,
    assignments_fully_scheduled: trainerAssignments.length - skippedAssignments.length,
    trainers_assigned: usedTrainers.size,
    rooms_used: usedRooms.size,
    subjects_scheduled: new Set(slotsToCreate.map(s => s.subject_id)).size,
    assignments_partially_scheduled: skippedAssignments.length,
    double_triple_sessions: slotsToCreate.filter(s => s.session_group_id).length,
    combined_slots: slotsToCreate.filter(s => s.combined_class_ids && s.combined_class_ids.length > 0).length
  };

  return { slots: slotsToCreate, stats, skipped: skippedAssignments };
}

// ─── POST /api/timetable/generate ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
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

    const body: GenerationSettings = await request.json();
    const { term_id, min_classes_per_day, regenerate } = body;

    if (!term_id) {
      return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
    }
    if (!min_classes_per_day || min_classes_per_day < 1) {
      return NextResponse.json(
        { error: 'min_classes_per_day must be at least 1' },
        { status: 400 }
      );
    }

    const term = await db.terms.findUnique({ where: { id: term_id } });
    if (!term) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }

    // ── Parse working days ───────────────────────────────────────────────────
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

    // ── Regenerate guard ─────────────────────────────────────────────────────
    if (regenerate) {
      const now = new Date();
      const termStart = new Date(term.start_date);
      const daysSinceStart = Math.floor(
        (now.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceStart > 14) {
        return NextResponse.json(
          { error: 'Cannot regenerate: More than 2 weeks since term start' },
          { status: 403 }
        );
      }
      await db.timetableslots.deleteMany({ where: { term_id } });
    } else {
      const existingSlots = await db.timetableslots.count({ where: { term_id } });
      if (existingSlots > 0) {
        return NextResponse.json(
          {
            error: 'A confirmed timetable already exists. Use regenerate option if within 2 weeks of term start.'
          },
          { status: 409 }
        );
      }
    }

    // ── Clear existing drafts ────────────────────────────────────────────────
    await db.timetabledrafts.deleteMany({ where: { term_id } });

    // ── Active classes in term ───────────────────────────────────────────────
    const termClasses = await db.termclasses.findMany({
      where: { term_id },
      include: {
        classes: { select: { id: true, name: true, code: true, is_active: true } }
      }
    });

    const activeTermClasses = termClasses.filter(tc => tc.classes.is_active);
    const classIds = activeTermClasses.map(tc => tc.class_id);

    if (classIds.length === 0) {
      return NextResponse.json(
        { error: 'No active classes assigned to this term' },
        { status: 400 }
      );
    }

    // ── Class subjects ───────────────────────────────────────────────────────
    const allClassSubjects = await db.classsubjects.findMany({
      where: { class_id: { in: classIds }, term_id },
      select: { id: true }
    });
    const classSubjectIds = allClassSubjects.map(cs => cs.id);

    // ── Trainer assignments with scheduling config ────────────────────────────
    const trainerAssignments = await db.trainersubjectassignments.findMany({
      where: {
        term_id,
        is_active: true,
        class_subject_id: { in: classSubjectIds }
      },
      include: {
        classsubjects: {
          include: {
            classes: { select: { id: true, name: true, code: true } },
            subjects: {
              select: {
                id: true,
                name: true,
                code: true,
                credit_hours: true,
                sessions_per_week: true,
                lesson_type: true
              }
            }
          }
        },
        users: { select: { id: true, name: true } }
      }
    });

    if (trainerAssignments.length === 0) {
      return NextResponse.json(
        { error: 'No trainer assignments found. Trainers must select their subjects first.' },
        { status: 400 }
      );
    }

    // ── Load subject combinations for this term's assignments ─────────────────
    const assignmentIds = trainerAssignments.map(ta => ta.id);

    const subjectCombinations = await db.subjectcombinations.findMany({
      where: {
        OR: [
          { primary_assignment_id: { in: assignmentIds } },
          { combined_assignment_id: { in: assignmentIds } }
        ]
      },
      select: {
        id: true,
        subject_id: true,
        session_number: true,
        primary_assignment_id: true,
        combined_assignment_id: true
      }
    });

    console.log(`📎 Found ${subjectCombinations.length} combination(s) for this term`);

    // ── Rooms with subject mappings ──────────────────────────────────────────
    const rooms = await db.rooms.findMany({
      where: { is_active: true },
      include: {
        subjectrooms: { select: { subject_id: true } }
      }
    });

    if (rooms.length === 0) {
      return NextResponse.json(
        { error: 'No active rooms available' },
        { status: 400 }
      );
    }

    // ── Build subject → room[] map ───────────────────────────────────────────
    const subjectRoomMap = new Map<number, number[]>();
    rooms.forEach(room => {
      room.subjectrooms.forEach(sr => {
        const existing = subjectRoomMap.get(sr.subject_id) ?? [];
        existing.push(room.id);
        subjectRoomMap.set(sr.subject_id, existing);
      });
    });

    // ── Hard block: subjects missing room mapping ─────────────────────────────
    const subjectIdsToSchedule = new Set(
      trainerAssignments.map(ta => ta.classsubjects.subjects.id)
    );

    const subjectsBlockingGeneration = [...subjectIdsToSchedule].filter(
      id => !subjectRoomMap.has(id) || (subjectRoomMap.get(id)?.length ?? 0) === 0
    );

    if (subjectsBlockingGeneration.length > 0) {
      const blockingSubjects = await db.subjects.findMany({
        where: { id: { in: subjectsBlockingGeneration } },
        select: { id: true, name: true, code: true }
      });

      return NextResponse.json(
        {
          error: `Cannot generate: ${blockingSubjects.length} subject(s) have no room assigned.`,
          blocking_subjects: blockingSubjects.map(s => ({ id: s.id, name: s.name, code: s.code })),
          hint: 'Go to Timetable Setup → Subject — Room Assignments and assign at least one room to each subject.'
        },
        { status: 422 }
      );
    }

    // ── Lesson periods ───────────────────────────────────────────────────────
    const lessonPeriods = await db.lessonperiods.findMany({
      where: { is_active: true },
      orderBy: { start_time: 'asc' }
    });

    if (lessonPeriods.length === 0) {
      return NextResponse.json(
        { error: 'No active lesson periods configured' },
        { status: 400 }
      );
    }

    // ── Generate 3 independent draft timetables ──────────────────────────────
    console.log('📅 Generating 3 draft timetables for term:', term_id);

    const draftsData = [];
    for (let draftNumber = 1; draftNumber <= 3; draftNumber++) {
      const { slots, stats, skipped } = generateSlots(
        trainerAssignments,
        workingDaysArray,
        lessonPeriods,
        rooms,
        subjectRoomMap,
        subjectCombinations,
        term_id
      );
      draftsData.push({ draftNumber, slots, stats, skipped });
    }

    // ── Save all 3 drafts ────────────────────────────────────────────────────
    const savedDrafts = await Promise.all(
      draftsData.map(({ draftNumber, slots, stats, skipped }) =>
        db.timetabledrafts.create({
          data: {
            term_id,
            draft_number: draftNumber,
            slots_json: slots as any,
            stats_json: stats as any,
            skipped_json: skipped.length > 0 ? (skipped as any) : null,
            generated_by: authResult.user!.id
          }
        })
      )
    );

    console.log('📅 Saved 3 drafts, IDs:', savedDrafts.map(d => d.id));

    return NextResponse.json(
      {
        success: true,
        message: `Generated 3 draft timetables for ${term.name}. Review and select one to confirm.`,
        term_id,
        drafts: draftsData.map(({ draftNumber, stats, skipped }, i) => ({
          draft_id: savedDrafts[i].id,
          draft_number: draftNumber,
          stats,
          skipped_count: skipped.length,
          skipped_assignments: skipped.length > 0 ? skipped : undefined
        }))
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error generating timetable:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate timetable',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}