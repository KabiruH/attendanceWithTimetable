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

export async function POST(request: NextRequest) {
  try {
    // Authentication
    const cookieStore = await cookies();
    const token = cookieStore.get('token');
   
    if (!token) {
      return NextResponse.json(
        { error: 'No token found' },
        { status: 401 }
      );
    }

    const { payload } = await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );

    const userId = Number(payload.id);

    if (!userId || isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID in token' },
        { status: 401 }
      );
    }

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true }
    });

    if (!user || !user.is_active) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 401 }
      );
    }

    // Only admin can generate timetables
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    // Parse request body
    const body: GenerationSettings = await request.json();
    const { term_id, sessions_per_week, min_classes_per_day, regenerate } = body;

    // Validation
    if (!term_id) {
      return NextResponse.json(
        { error: 'term_id is required' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Term not found' },
        { status: 404 }
      );
    }

    // Parse working days
    const workingDaysArray = Array.isArray(term.working_days) 
      ? term.working_days 
      : JSON.parse(term.working_days as any);

    // Check if regeneration is allowed
    if (regenerate) {
      const now = new Date();
      const termStart = new Date(term.start_date);
      const daysSinceStart = Math.floor((now.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceStart > 14) {
        return NextResponse.json(
          { error: 'Cannot regenerate timetable: More than 2 weeks have passed since term start' },
          { status: 403 }
        );
      }

      // Delete existing timetable slots
      await db.timetableslots.deleteMany({
        where: { term_id: term_id }
      });
    } else {
      // Check if timetable already exists
      const existingSlots = await db.timetableslots.count({
        where: { term_id: term_id }
      });

      if (existingSlots > 0) {
        return NextResponse.json(
          { error: 'Timetable already exists for this term. Use regenerate option if within 2 weeks of term start.' },
          { status: 409 }
        );
      }
    }

    // ✅ Get all classes assigned to this term
    const termClasses = await db.termclasses.findMany({
      where: { term_id: term_id },
      include: {
        classes: true
      }
    });

    if (termClasses.length === 0) {
      return NextResponse.json(
        { error: 'No classes assigned to this term' },
        { status: 400 }
      );
    }

    const classIds = termClasses.map(tc => tc.class_id);

    // ✅ NEW: Get all trainer-subject assignments for this term
    const trainerAssignments = await db.trainersubjectassignments.findMany({
      where: {
        term_id: term_id,
        is_active: true,
        classsubjects: {
          class_id: { in: classIds },
          is_active: true
        }
      },
      include: {
        classsubjects: {
          include: {
            classes: true,
            subjects: true
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

    if (trainerAssignments.length === 0) {
      return NextResponse.json(
        { error: 'No trainer assignments found for this term' },
        { status: 400 }
      );
    }

    // Get all active rooms
    const rooms = await db.rooms.findMany({
      where: { is_active: true }
    });

    if (rooms.length === 0) {
      return NextResponse.json(
        { error: 'No active rooms available' },
        { status: 400 }
      );
    }

    // Get all active lesson periods, sorted by start time
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

    // Prepare generation
    const slotsToCreate: any[] = [];
    const skippedAssignments: any[] = [];
    const usedRooms = new Set<number>();
    const usedTrainers = new Set<number>();

    // Track scheduling: Map<"day-period-room", true> and Map<"day-period-trainer", true>
    const scheduledSlots = new Map<string, boolean>();

    // Track trainer's classes per day to ensure minimum
    const trainerDailyClasses = new Map<string, number>(); // key: "trainerId-day"

    // Helper function to check if a slot is available
    const isSlotAvailable = (day: number, periodId: number, roomId: number, trainerId: number): boolean => {
      const roomKey = `${day}-${periodId}-room-${roomId}`;
      const trainerKey = `${day}-${periodId}-trainer-${trainerId}`;
      
      return !scheduledSlots.has(roomKey) && !scheduledSlots.has(trainerKey);
    };

    // Helper function to mark slot as used
    const markSlotUsed = (day: number, periodId: number, roomId: number, trainerId: number) => {
      const roomKey = `${day}-${periodId}-room-${roomId}`;
      const trainerKey = `${day}-${periodId}-trainer-${trainerId}`;
      
      scheduledSlots.set(roomKey, true);
      scheduledSlots.set(trainerKey, true);
    };

    // Helper function to shuffle array (for randomization)
    const shuffleArray = <T,>(array: T[]): T[] => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    // ✅ UPDATED ALGORITHM: Process each trainer assignment
    for (const trainerAssignment of trainerAssignments) {
      const classSubject = trainerAssignment.classsubjects;
      const subjectData = classSubject.subjects;
      const classData = classSubject.classes;
      const trainer = trainerAssignment.users;
      const trainerId = trainer.id;

      // Create a list of all possible slots (day-period combinations)
      const possibleSlots: Array<{ day: number; periodId: number }> = [];
      for (const day of workingDaysArray) {
        for (const period of lessonPeriods) {
          possibleSlots.push({ day, periodId: period.id });
        }
      }

      // Shuffle to add randomness
      const shuffledSlots = shuffleArray(possibleSlots);

      // Try to schedule sessions_per_week sessions, spreading them across different days
      let sessionsScheduled = 0;
      const scheduledDays = new Set<number>();

      // First pass: Try to schedule on different days
      for (const slot of shuffledSlots) {
        if (sessionsScheduled >= sessions_per_week) break;

        if (scheduledDays.has(slot.day) && sessionsScheduled < sessions_per_week && scheduledDays.size < sessions_per_week) {
          continue;
        }

        const period = lessonPeriods.find(p => p.id === slot.periodId);
        if (!period) continue;

        const availableRooms = rooms.filter(room => 
          isSlotAvailable(slot.day, period.id, room.id, trainerId)
        );

        if (availableRooms.length === 0) continue;

        const randomRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];

        slotsToCreate.push({
          id: randomUUID(),
          term_id: term_id,
          class_id: classData.id,
          subject_id: subjectData.id,
          employee_id: trainerId,
          room_id: randomRoom.id,
          lesson_period_id: period.id,
          day_of_week: slot.day,
          status: 'scheduled'
        });

        markSlotUsed(slot.day, period.id, randomRoom.id, trainerId);
        scheduledDays.add(slot.day);

        const trainerDayKey = `${trainerId}-${slot.day}`;
        trainerDailyClasses.set(
          trainerDayKey, 
          (trainerDailyClasses.get(trainerDayKey) || 0) + 1
        );

        usedRooms.add(randomRoom.id);
        usedTrainers.add(trainerId);

        sessionsScheduled++;
      }

      // Second pass: If we couldn't schedule all sessions on different days, fill remaining slots
      if (sessionsScheduled < sessions_per_week) {
        for (const slot of shuffledSlots) {
          if (sessionsScheduled >= sessions_per_week) break;

          const period = lessonPeriods.find(p => p.id === slot.periodId);
          if (!period) continue;

          const availableRooms = rooms.filter(room => 
            isSlotAvailable(slot.day, period.id, room.id, trainerId)
          );

          if (availableRooms.length === 0) continue;

          const randomRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];

          slotsToCreate.push({
            id: randomUUID(),
            term_id: term_id,
            class_id: classData.id,
            subject_id: subjectData.id,
            employee_id: trainerId,
            room_id: randomRoom.id,
            lesson_period_id: period.id,
            day_of_week: slot.day,
            status: 'scheduled'
          });

          markSlotUsed(slot.day, period.id, randomRoom.id, trainerId);

          const trainerDayKey = `${trainerId}-${slot.day}`;
          trainerDailyClasses.set(
            trainerDayKey, 
            (trainerDailyClasses.get(trainerDayKey) || 0) + 1
          );

          usedRooms.add(randomRoom.id);
          usedTrainers.add(trainerId);

          sessionsScheduled++;
        }
      }

      // If still couldn't schedule all sessions
      if (sessionsScheduled < sessions_per_week) {
        skippedAssignments.push({
          assignment_id: trainerAssignment.id,
          subject_id: subjectData.id,
          subject_code: subjectData.code,
          subject_name: subjectData.name,
          class_name: classData.name,
          class_code: classData.code,
          trainer_name: trainer.name,
          trainer_id: trainerId,
          scheduled: sessionsScheduled,
          requested: sessions_per_week,
          reason: `Could only schedule ${sessionsScheduled} of ${sessions_per_week} sessions (no available slots)`
        });
      }
    }

    // Create all timetable slots in database
    if (slotsToCreate.length > 0) {
      await db.timetableslots.createMany({
        data: slotsToCreate
      });
    }

    // Prepare response
    const result = {
      success: true,
      message: `Successfully generated timetable for ${term.name}`,
      stats: {
        slots_created: slotsToCreate.length,
        trainer_assignments_processed: trainerAssignments.length,
        assignments_fully_scheduled: trainerAssignments.length - skippedAssignments.length,
        trainers_assigned: usedTrainers.size,
        rooms_used: usedRooms.size,
        assignments_partially_scheduled: skippedAssignments.length
      },
      skipped_assignments: skippedAssignments
    };

    return NextResponse.json(result, { status: 201 });

  } catch (error: any) {
    console.error('Error generating timetable:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('jwt expired')) {
        return NextResponse.json(
          { error: 'Token expired' },
          { status: 401 }
        );
      }
      if (error.message.includes('invalid token')) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to generate timetable',
        details: error.message 
      },
      { status: 500 }
    );
  }
}