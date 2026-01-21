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

    if (!token) {
      return { error: 'No token found', status: 401 };
    }

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

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// Helper function to check if user has timetable admin access
function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

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

    // Validation
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

    // Get term
    const term = await db.terms.findUnique({
      where: { id: term_id }
    });

    if (!term) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }

    // Parse working days safely
    let workingDaysArray: number[] = [1, 2, 3, 4, 5]; // Default Mon-Fri
    try {
      if (term.working_days) {
        workingDaysArray = Array.isArray(term.working_days)
          ? term.working_days
          : JSON.parse(term.working_days as string);
      }
    } catch {
      console.warn('Failed to parse working_days, using default Mon-Fri');
    }

    // Check regeneration
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

      await db.timetableslots.deleteMany({
        where: { term_id: term_id }
      });
    } else {
      const existingSlots = await db.timetableslots.count({
        where: { term_id: term_id }
      });

      if (existingSlots > 0) {
        return NextResponse.json(
          { error: 'Timetable exists. Use regenerate option if within 2 weeks of term start.' },
          { status: 409 }
        );
      }
    }

    // Get classes assigned to this term
    const termClasses = await db.termclasses.findMany({
      where: { term_id: term_id },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            is_active: true
          }
        }
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

    console.log('📅 Generating timetable for classes:', classIds);

    // Get all class-subjects for this term
    const allClassSubjects = await db.classsubjects.findMany({
      where: {
        class_id: { in: classIds },
        term_id: term_id
      },
      select: { id: true }
    });

    const classSubjectIds = allClassSubjects.map(cs => cs.id);

    // Get trainer assignments - only filter by trainersubjectassignments.is_active
    const trainerAssignments = await db.trainersubjectassignments.findMany({
      where: {
        term_id: term_id,
        is_active: true,
        class_subject_id: { in: classSubjectIds }
      },
      include: {
        classsubjects: {
          include: {
            classes: {
              select: {
                id: true,
                name: true,
                code: true
              }
            },
            subjects: {
              select: {
                id: true,
                name: true,
                code: true,
                credit_hours: true
              }
            }
          }
        },
        users: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    console.log('📅 Found trainer assignments:', trainerAssignments.length);

    if (trainerAssignments.length === 0) {
      return NextResponse.json(
        { error: 'No trainer assignments found. Trainers must select their subjects first.' },
        { status: 400 }
      );
    }

    // Get all active rooms
    const rooms = await db.rooms.findMany({
      where: { is_active: true }
    });

    if (rooms.length === 0) {
      return NextResponse.json({ error: 'No active rooms available' }, { status: 400 });
    }

    // Get all active lesson periods
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

    // ========== SCHEDULING ALGORITHM ==========

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
      is_online_session: boolean; // ✅ NEW: Add online flag
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

    // Track conflicts:
    // - Room: Only one session per room per day-period
    // - Trainer: Only one session per trainer per day-period
    // - Class: Only one session per class per day-period
    const scheduledSlots = new Map<string, boolean>();

    const isSlotAvailable = (
      day: number,
      periodId: number,
      roomId: number,
      trainerId: number,
      classId: number
    ): boolean => {
      const roomKey = `room-${day}-${periodId}-${roomId}`;
      const trainerKey = `trainer-${day}-${periodId}-${trainerId}`;
      const classKey = `class-${day}-${periodId}-${classId}`;

      return (
        !scheduledSlots.has(roomKey) &&
        !scheduledSlots.has(trainerKey) &&
        !scheduledSlots.has(classKey)
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

    // Track stats
    const usedRooms = new Set<number>();
    const usedTrainers = new Set<number>();

    // Process each trainer assignment
    for (const assignment of trainerAssignments) {
      const classSubject = assignment.classsubjects;
      const subject = classSubject.subjects;
      const classData = classSubject.classes;
      const trainer = assignment.users;

      const trainerId = trainer.id;
      const classId = classData.id;
      const subjectId = subject.id;

      // Build all possible day-period combinations
      const possibleSlots: Array<{ day: number; periodId: number }> = [];
      for (const day of workingDaysArray) {
        for (const period of lessonPeriods) {
          possibleSlots.push({ day, periodId: period.id });
        }
      }

      const shuffledSlots = shuffleArray(possibleSlots);

      let sessionsScheduled = 0;
      const scheduledDays = new Set<number>();

      // First pass: Try to spread across different days
      for (const slot of shuffledSlots) {
        if (sessionsScheduled >= sessions_per_week) break;

        // Skip if already scheduled on this day (unless we need more sessions than days)
        if (scheduledDays.has(slot.day) && scheduledDays.size < Math.min(sessions_per_week, workingDaysArray.length)) {
          continue;
        }

        // Find an available room
        const availableRooms = rooms.filter(room =>
          isSlotAvailable(slot.day, slot.periodId, room.id, trainerId, classId)
        );

        if (availableRooms.length === 0) continue;

        const selectedRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];

        const now = new Date();
        slotsToCreate.push({
          id: randomUUID(),
          term_id: term_id,
          class_id: classId,
          subject_id: subjectId,
          employee_id: trainerId,
          room_id: selectedRoom.id,
          lesson_period_id: slot.periodId,
          day_of_week: slot.day,
          status: 'scheduled',
          is_online_session: false, // ✅ NEW: Default all generated slots to physical
          created_at: now,
          updated_at: now
        });

        markSlotUsed(slot.day, slot.periodId, selectedRoom.id, trainerId, classId);
        scheduledDays.add(slot.day);
        usedRooms.add(selectedRoom.id);
        usedTrainers.add(trainerId);

        sessionsScheduled++;
      }

      // Second pass: Fill remaining if needed (allow same day)
      if (sessionsScheduled < sessions_per_week) {
        for (const slot of shuffledSlots) {
          if (sessionsScheduled >= sessions_per_week) break;

          const availableRooms = rooms.filter(room =>
            isSlotAvailable(slot.day, slot.periodId, room.id, trainerId, classId)
          );

          if (availableRooms.length === 0) continue;

          const selectedRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];

          const now = new Date();
          slotsToCreate.push({
            id: randomUUID(),
            term_id: term_id,
            class_id: classId,
            subject_id: subjectId,
            employee_id: trainerId,
            room_id: selectedRoom.id,
            lesson_period_id: slot.periodId,
            day_of_week: slot.day,
            status: 'scheduled',
            is_online_session: false, // ✅ NEW: Default all generated slots to physical
            created_at: now,
            updated_at: now
          });

          markSlotUsed(slot.day, slot.periodId, selectedRoom.id, trainerId, classId);
          usedRooms.add(selectedRoom.id);
          usedTrainers.add(trainerId);

          sessionsScheduled++;
        }
      }

      // Track if we couldn't schedule all sessions
      if (sessionsScheduled < sessions_per_week) {
        skippedAssignments.push({
          trainer_assignment_id: assignment.id,
          subject_code: subject.code,
          subject_name: subject.name,
          class_code: classData.code,
          trainer_name: trainer.name,
          scheduled: sessionsScheduled,
          requested: sessions_per_week,
          reason: `Only ${sessionsScheduled}/${sessions_per_week} sessions scheduled (no available slots)`
        });
      }
    }

    // Insert all slots
    if (slotsToCreate.length > 0) {
      await db.timetableslots.createMany({
        data: slotsToCreate
      });
    }

    console.log('📅 Timetable generation complete:', {
      slots_created: slotsToCreate.length,
      trainers: usedTrainers.size,
      rooms: usedRooms.size,
      skipped: skippedAssignments.length
    });

    return NextResponse.json({
      success: true,
      message: `Successfully generated timetable for ${term.name}. All slots created as physical classes - admins can toggle specific slots to online as needed.`,
      stats: {
        slots_created: slotsToCreate.length,
        trainer_assignments_processed: trainerAssignments.length,
        assignments_fully_scheduled: trainerAssignments.length - skippedAssignments.length,
        trainers_assigned: usedTrainers.size,
        rooms_used: usedRooms.size,
        subjects_scheduled: new Set(slotsToCreate.map(s => s.subject_id)).size,
        assignments_partially_scheduled: skippedAssignments.length
      },
      skipped_assignments: skippedAssignments.length > 0 ? skippedAssignments : undefined
    }, { status: 201 });

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