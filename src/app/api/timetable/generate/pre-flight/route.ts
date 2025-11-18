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

    // ✅ Get classes assigned to this term
    const termClasses = await db.termclasses.findMany({
      where: { term_id: termId },
      include: {
        classes: true
      }
    });

    if (termClasses.length === 0) {
      return NextResponse.json({
        passed: false,
        errors: ['No classes assigned to this term'],
        term_info: {
          id: term.id,
          name: term.name,
          start_date: term.start_date.toISOString().split('T')[0],
          end_date: term.end_date.toISOString().split('T')[0]
        }
      });
    }

    const classIds = termClasses.map(tc => tc.class_id);

    // ✅ NEW: Get subjects assigned to these classes with trainer assignments
    const classSubjects = await db.classsubjects.findMany({
      where: {
        class_id: { in: classIds }
      },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            duration_hours: true
          }
        },
        subjects: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            credit_hours: true
          }
        },
        trainersubjectassignments: {
          where: { 
            term_id: termId,
            is_active: true 
          },
          include: {
            users: {
              select: {
                id: true,
                name: true,
                department: true
              }
            }
          }
        }
      }
    });

    // ✅ Separate subjects with and without trainers
    const subjectsWithTrainer: any[] = [];
    const subjectsWithoutTrainer: any[] = [];

    classSubjects.forEach(cs => {
      const hasTrainer = cs.trainersubjectassignments.length > 0;
      const subjectInfo = {
        id: cs.id,
        subject_id: cs.subjects.id,
        subject_name: cs.subjects.name,
        subject_code: cs.subjects.code,
        class_id: cs.classes.id,
        class_name: cs.classes.name,
        class_code: cs.classes.code,
        department: cs.classes.department,
        credit_hours: cs.subjects.credit_hours,
        has_trainer: hasTrainer,
        trainer: hasTrainer ? {
          id: cs.trainersubjectassignments[0].users.id,
          name: cs.trainersubjectassignments[0].users.name,
          department: cs.trainersubjectassignments[0].users.department
        } : null
      };

      if (hasTrainer) {
        subjectsWithTrainer.push(subjectInfo);
      } else {
        subjectsWithoutTrainer.push(subjectInfo);
      }
    });

    // ✅ Get unique trainers from subject assignments
    const trainerIds = new Set<number>();
    classSubjects.forEach(cs => {
      cs.trainersubjectassignments.forEach(tsa => {
        trainerIds.add(tsa.users.id);
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
        trainersubjectassignments: {
          where: { 
            term_id: termId,
            is_active: true 
          },
          select: { 
            subject_id: true,
            subjects: {
              select: {
                name: true,
                code: true
              }
            }
          }
        }
      }
    });

    const trainerList = trainers.map(t => ({
      id: t.id,
      name: t.name,
      department: t.department,
      subjects_count: t.trainersubjectassignments.length,
      subjects: t.trainersubjectassignments.map(ts => ({
        id: ts.subject_id,
        name: ts.subjects.name,
        code: ts.subjects.code
      }))
    }));

    // Get rooms
    const rooms = await db.rooms.findMany({
      where: { is_active: true }
    });

    // Get lesson periods
    const lessonPeriods = await db.lessonperiods.findMany({
      where: { is_active: true },
      orderBy: { start_time: 'asc' }
    });

    // Check for existing timetable
    const existingSlots = await db.timetableslots.findMany({
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

    if (classSubjects.length === 0) {
      errors.push('No subjects assigned to classes in this term');
      errorDetails.no_subjects = true;
    }

    if (subjectsWithoutTrainer.length > 0) {
      errors.push(`${subjectsWithoutTrainer.length} ${subjectsWithoutTrainer.length === 1 ? 'subject has' : 'subjects have'} no assigned trainer for this term`);
      errorDetails.subjects_without_trainer = subjectsWithoutTrainer;
    }

    if (rooms.length === 0) {
      errors.push('No active rooms available');
      errorDetails.no_rooms = true;
    }

    if (lessonPeriods.length === 0) {
      errors.push('No active lesson periods configured');
      errorDetails.no_lesson_periods = true;
    }

    if (trainers.length === 0 && classSubjects.length > 0) {
      errors.push('No trainers assigned to any subjects for this term');
      errorDetails.no_trainers = true;
    }

    if (existingSlots.length > 0 && !canRegenerate) {
      errors.push(`Cannot regenerate: Term started ${daysSinceStart} days ago (limit: 14 days)`);
      errorDetails.regeneration_blocked = {
        days_since_start: daysSinceStart,
        limit_days: 14
      };
    }

    if (rooms.length < classSubjects.length) {
      warnings.push(`Limited rooms (${rooms.length}) compared to subjects (${classSubjects.length}). Some subjects may not be scheduled.`);
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
        list: termClasses.map(tc => ({
          id: tc.classes.id,
          name: tc.classes.name,
          code: tc.classes.code,
          department: tc.classes.department
        }))
      },
      subjects: {
        total: classSubjects.length,
        with_trainer: subjectsWithTrainer.length,
        without_trainer: subjectsWithoutTrainer.length,
        details_with_trainer: subjectsWithTrainer,
        details_without_trainer: subjectsWithoutTrainer
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