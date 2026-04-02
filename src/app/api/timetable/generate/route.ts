// app/api/timetable/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';
import { randomUUID } from 'crypto';

interface GenerationSettings {
  term_id: number;
  sessions_per_week: number;
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

// ─── Core scheduling algorithm ─────────────────────────────────────────────────
function generateSlots(
  trainerAssignments: any[],
  workingDaysArray: number[],
  lessonPeriods: any[],
  rooms: any[],
  subjectRoomMap: Map<number, number[]>,
  sessions_per_week: number,
  term_id: number
) {
  const slotsToCreate: Array<{
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
  }> = [];

  const skippedAssignments: Array<{
    trainer_assignment_id: number;
    subject_code: string;
    subject_name: string;
    class_code: string;
    trainer_name: string;
    scheduled: number;
    requested: number;
    reason: string;
  }> = [];

  const scheduledSlots = new Map<string, boolean>();
  const usedRooms = new Set<number>();
  const usedTrainers = new Set<number>();

  const isSlotAvailable = (
    day: number,
    periodId: number,
    roomId: number,
    trainerId: number,
    classId: number
  ): boolean => {
    return (
      !scheduledSlots.has(`room-${day}-${periodId}-${roomId}`) &&
      !scheduledSlots.has(`trainer-${day}-${periodId}-${trainerId}`) &&
      !scheduledSlots.has(`class-${day}-${periodId}-${classId}`)
    );
  };

  const markSlotUsed = (
    day: number,
    periodId: number,
    roomId: number,
    trainerId: number,
    classId: number
  ) => {
    scheduledSlots.set(`room-${day}-${periodId}-${roomId}`, true);
    scheduledSlots.set(`trainer-${day}-${periodId}-${trainerId}`, true);
    scheduledSlots.set(`class-${day}-${periodId}-${classId}`, true);
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  for (const assignment of trainerAssignments) {
    const classSubject = assignment.classsubjects;
    const subject = classSubject.subjects;
    const classData = classSubject.classes;
    const trainer = assignment.users;

    const trainerId = trainer.id;
    const classId = classData.id;
    const subjectId = subject.id;

    // ── Only consider rooms mapped to this subject ───────────────────────────
    const allowedRoomIds = new Set(subjectRoomMap.get(subjectId) ?? []);
    const allowedRooms = rooms.filter(r => allowedRoomIds.has(r.id));

    const possibleSlots: Array<{ day: number; periodId: number }> = [];
    for (const day of workingDaysArray) {
      for (const period of lessonPeriods) {
        possibleSlots.push({ day, periodId: period.id });
      }
    }

    const shuffledSlots = shuffleArray(possibleSlots);
    let sessionsScheduled = 0;
    const scheduledDays = new Set<number>();

    // First pass: spread across different days
    for (const slot of shuffledSlots) {
      if (sessionsScheduled >= sessions_per_week) break;
      if (
        scheduledDays.has(slot.day) &&
        scheduledDays.size < Math.min(sessions_per_week, workingDaysArray.length)
      ) continue;

      const availableRooms = allowedRooms.filter(room =>
        isSlotAvailable(slot.day, slot.periodId, room.id, trainerId, classId)
      );
      if (availableRooms.length === 0) continue;

      const selectedRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];
      const now = new Date();

      slotsToCreate.push({
        id: randomUUID(),
        term_id,
        class_id: classId,
        subject_id: subjectId,
        employee_id: trainerId,
        room_id: selectedRoom.id,
        lesson_period_id: slot.periodId,
        day_of_week: slot.day,
        status: 'scheduled',
        is_online_session: false,
        created_at: now,
        updated_at: now
      });

      markSlotUsed(slot.day, slot.periodId, selectedRoom.id, trainerId, classId);
      scheduledDays.add(slot.day);
      usedRooms.add(selectedRoom.id);
      usedTrainers.add(trainerId);
      sessionsScheduled++;
    }

    // Second pass: fill remaining (allow same day)
    if (sessionsScheduled < sessions_per_week) {
      for (const slot of shuffledSlots) {
        if (sessionsScheduled >= sessions_per_week) break;

        const availableRooms = allowedRooms.filter(room =>
          isSlotAvailable(slot.day, slot.periodId, room.id, trainerId, classId)
        );
        if (availableRooms.length === 0) continue;

        const selectedRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];
        const now = new Date();

        slotsToCreate.push({
          id: randomUUID(),
          term_id,
          class_id: classId,
          subject_id: subjectId,
          employee_id: trainerId,
          room_id: selectedRoom.id,
          lesson_period_id: slot.periodId,
          day_of_week: slot.day,
          status: 'scheduled',
          is_online_session: false,
          created_at: now,
          updated_at: now
        });

        markSlotUsed(slot.day, slot.periodId, selectedRoom.id, trainerId, classId);
        usedRooms.add(selectedRoom.id);
        usedTrainers.add(trainerId);
        sessionsScheduled++;
      }
    }

    if (sessionsScheduled < sessions_per_week) {
      skippedAssignments.push({
        trainer_assignment_id: assignment.id,
        subject_code: subject.code,
        subject_name: subject.name,
        class_code: classData.code,
        trainer_name: trainer.name,
        scheduled: sessionsScheduled,
        requested: sessions_per_week,
        reason: `Only ${sessionsScheduled}/${sessions_per_week} sessions scheduled — not enough available slots in assigned rooms`
      });
    }
  }

  const stats = {
    slots_created: slotsToCreate.length,
    trainer_assignments_processed: trainerAssignments.length,
    assignments_fully_scheduled: trainerAssignments.length - skippedAssignments.length,
    trainers_assigned: usedTrainers.size,
    rooms_used: usedRooms.size,
    subjects_scheduled: new Set(slotsToCreate.map(s => s.subject_id)).size,
    assignments_partially_scheduled: skippedAssignments.length
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
    const { term_id, sessions_per_week, min_classes_per_day, regenerate } = body;

    if (!term_id) {
      return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
    }
    if (!sessions_per_week || sessions_per_week < 1 || sessions_per_week > 5) {
      return NextResponse.json(
        { error: 'sessions_per_week must be between 1 and 5' },
        { status: 400 }
      );
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

    // ── Trainer assignments ──────────────────────────────────────────────────
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
            subjects: { select: { id: true, name: true, code: true, credit_hours: true } }
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

    // ── Hard block: any scheduled subject missing a room mapping ────────────
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
          blocking_subjects: blockingSubjects.map(s => ({
            id: s.id,
            name: s.name,
            code: s.code
          })),
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
        sessions_per_week,
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