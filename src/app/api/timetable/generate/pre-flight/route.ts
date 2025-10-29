// app/api/timetable/generate/pre-flight/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

export async function GET(request: NextRequest) {
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

    // Get term_id from query
    const { searchParams } = new URL(request.url);
    const termIdParam = searchParams.get('term_id');

    if (!termIdParam) {
      return NextResponse.json(
        { error: 'term_id is required' },
        { status: 400 }
      );
    }

    const termId = parseInt(termIdParam);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    // Get term info
    const term = await db.terms.findUnique({
      where: { id: termId }
    });

    if (!term) {
      return NextResponse.json(
        { error: 'Term not found' },
        { status: 404 }
      );
    }

    // Calculate days since term start
    const now = new Date();
    const termStart = new Date(term.start_date);
    const daysSinceStart = Math.floor((now.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24));
    const canRegenerate = daysSinceStart <= 14; // Within 2 weeks

    // Get classes assigned to this term
    const termClasses = await db.termClasses.findMany({
      where: { term_id: termId },
      include: {
        class: {
          include: {
            trainerAssignments: {
              where: { is_active: true },
              include: {
                trainer: {
                  select: {
                    id: true,
                    name: true,
                    department: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Separate classes with and without trainers
    const classesWithTrainer: any[] = [];
    const classesWithoutTrainer: any[] = [];

    termClasses.forEach(tc => {
      const hasTrainer = tc.class.trainerAssignments.length > 0;
      const classInfo = {
        id: tc.class.id,
        name: tc.class.name,
        code: tc.class.code,
        department: tc.class.department,
        duration_hours: tc.class.duration_hours,
        has_trainer: hasTrainer,
        trainer: hasTrainer ? {
          id: tc.class.trainerAssignments[0].trainer.id,
          name: tc.class.trainerAssignments[0].trainer.name,
          department: tc.class.trainerAssignments[0].trainer.department
        } : null
      };

      if (hasTrainer) {
        classesWithTrainer.push(classInfo);
      } else {
        classesWithoutTrainer.push(classInfo);
      }
    });

    // Get unique trainers
    const trainerIds = new Set<number>();
    termClasses.forEach(tc => {
      tc.class.trainerAssignments.forEach(ta => {
        trainerIds.add(ta.trainer.id);
      });
    });

    const trainers = await db.users.findMany({
      where: {
        id: { in: Array.from(trainerIds) }
      },
      select: {
        id: true,
        name: true,
        department: true,
        trainerClassAssignments: {
          where: { is_active: true },
          select: { class_id: true }
        }
      }
    });

    const trainerList = trainers.map(t => ({
      id: t.id,
      name: t.name,
      department: t.department,
      classes_count: t.trainerClassAssignments.length
    }));

    // Get rooms
    const rooms = await db.rooms.findMany({
      where: { is_active: true }
    });

    // Get lesson periods
    const lessonPeriods = await db.lessonPeriods.findMany({
      where: { is_active: true },
      orderBy: { start_time: 'asc' }
    });

    // Check for existing timetable
    const existingSlots = await db.timetableSlots.findMany({
      where: { term_id: termId }
    });

    // Build errors and warnings with details
    const errors: string[] = [];
    const warnings: string[] = [];
    const errorDetails: any = {};

    if (termClasses.length === 0) {
      errors.push('No classes assigned to this term');
      errorDetails.no_classes = true;
    }

    if (classesWithoutTrainer.length > 0) {
      errors.push(`${classesWithoutTrainer.length} ${classesWithoutTrainer.length === 1 ? 'class has' : 'classes have'} no assigned trainer`);
      errorDetails.classes_without_trainer = classesWithoutTrainer;
    }

    if (rooms.length === 0) {
      errors.push('No active rooms available');
      errorDetails.no_rooms = true;
    }

    if (lessonPeriods.length === 0) {
      errors.push('No active lesson periods configured');
      errorDetails.no_lesson_periods = true;
    }

    if (trainers.length === 0 && termClasses.length > 0) {
      errors.push('No trainers assigned to any classes');
      errorDetails.no_trainers = true;
    }

    if (existingSlots.length > 0 && !canRegenerate) {
      errors.push(`Cannot regenerate: Term started ${daysSinceStart} days ago (limit: 14 days)`);
      errorDetails.regeneration_blocked = {
        days_since_start: daysSinceStart,
        limit_days: 14
      };
    }

    if (rooms.length < termClasses.length) {
      warnings.push(`Limited rooms (${rooms.length}) compared to classes (${termClasses.length}). Some classes may not be scheduled.`);
    }

    if (lessonPeriods.length < 3) {
      warnings.push(`Only ${lessonPeriods.length} lesson period(s) available. Consider adding more for better scheduling.`);
    }

    // Calculate working days count
    const workingDaysArray = Array.isArray(term.working_days) 
      ? term.working_days 
      : JSON.parse(term.working_days as any);
    const daysCount = workingDaysArray.length;

    const result = {
      passed: errors.length === 0,
      term_info: {
        id: term.id,
        name: term.name,
        start_date: term.start_date.toISOString().split('T')[0],
        end_date: term.end_date.toISOString().split('T')[0],
        working_days: workingDaysArray,
        days_count: daysCount
      },
      classes: {
        total: termClasses.length,
        with_trainer: classesWithTrainer.length,
        without_trainer: classesWithoutTrainer.length,
        details_with_trainer: classesWithTrainer,
        details_without_trainer: classesWithoutTrainer
      },
      trainers: {
        total: trainers.length,
        list: trainerList
      },
      rooms: {
        total: rooms.length,
        active: rooms.length
      },
      lesson_periods: {
        total: lessonPeriods.length,
        active: lessonPeriods.length,
        list: lessonPeriods.map(lp => ({
          id: lp.id,
          name: lp.name,
          start_time: lp.start_time.toTimeString().slice(0, 5),
          end_time: lp.end_time.toTimeString().slice(0, 5),
          duration: lp.duration
        }))
      },
      existing_timetable: {
        exists: existingSlots.length > 0,
        slots_count: existingSlots.length,
        can_regenerate: canRegenerate,
        days_since_term_start: daysSinceStart
      },
      errors,
      warnings,
      error_details: errorDetails
    };

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error running pre-flight checks:', error);
    
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
        error: 'Failed to run pre-flight checks',
        details: error.message 
      },
      { status: 500 }
    );
  }
}