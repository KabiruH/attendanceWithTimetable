// app/api/class-subjects/[classId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

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
    const name = payload.name as string;

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// GET /api/class-subjects/[classId]?term_id=X&trainer_id=Y
// GET /api/class-subjects/[classId]?term_id=X&trainer_id=Y
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;
    const resolvedParams = await params;
    const classId = parseInt(resolvedParams.classId);

    if (isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const termIdParam = searchParams.get('term_id');
    const trainerIdParam = searchParams.get('trainer_id');

    console.log('🔍 RAW PARAMS:', { 
      termIdParam, 
      trainerIdParam, 
      classId,
      url: request.url 
    });

    if (!termIdParam) {
      return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
    }

    const termId = parseInt(termIdParam);
    const trainerId = trainerIdParam ? parseInt(trainerIdParam) : user.id;

    console.log('🔍 PARSED PARAMS:', { classId, termId, trainerId });

    // Fetch class subjects for this class and term
    const classSubjects = await db.classsubjects.findMany({
      where: {
        class_id: classId,
        term_id: termId
      },
      include: {
        subjects: {
          select: {
            id: true,
            name: true,
            code: true,
            credit_hours: true,
            department: true
          }
        }
      }
    });

    console.log('🔍 CLASS SUBJECTS COUNT:', classSubjects.length);
    console.log('🔍 CLASS SUBJECTS IDs:', classSubjects.map(cs => ({ 
      id: cs.id, 
      subject_id: cs.subject_id,
      code: cs.subjects.code 
    })));

    if (classSubjects.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // First, let's check ALL trainer assignments without the is_active filter
    const allTrainerAssignments = await db.trainersubjectassignments.findMany({
      where: {
        trainer_id: trainerId,
        term_id: termId
      },
      select: {
        id: true,
        subject_id: true,
        class_subject_id: true,
        is_active: true
      }
    });

    console.log('🔍 ALL TRAINER ASSIGNMENTS (no is_active filter):', allTrainerAssignments);

    // Now with is_active filter
    const trainerAssignments = await db.trainersubjectassignments.findMany({
      where: {
        trainer_id: trainerId,
        term_id: termId,
        is_active: true
      },
      select: {
        id: true,
        subject_id: true,
        class_subject_id: true,
        is_active: true
      }
    });

    console.log('🔍 FILTERED TRAINER ASSIGNMENTS (is_active=true):', trainerAssignments);

    // Create maps for quick lookup
    const assignedSubjectIds = new Set(trainerAssignments.map(a => a.subject_id));
    const assignmentBySubject = new Map(
      trainerAssignments.map(a => [a.subject_id, a.class_subject_id])
    );

    console.log('🔍 ASSIGNED SUBJECT IDs:', Array.from(assignedSubjectIds));

    // Transform data with assignment status
    const subjectsWithStatus = classSubjects.map(cs => {
      const isAssignedToAnyClass = assignedSubjectIds.has(cs.subject_id);
      const assignedToClassSubjectId = assignmentBySubject.get(cs.subject_id);
      
      const isAssignedToThisClass = isAssignedToAnyClass && assignedToClassSubjectId === cs.id;
      const isAssignedElsewhere = isAssignedToAnyClass && assignedToClassSubjectId !== cs.id;

      console.log(`🔍 SUBJECT ${cs.subjects.code}:`, {
        subject_id: cs.subject_id,
        class_subject_id: cs.id,
        isAssignedToAnyClass,
        assignedToClassSubjectId,
        isAssignedToThisClass,
        isAssignedElsewhere
      });

      return {
        id: cs.subjects.id,
        name: cs.subjects.name,
        code: cs.subjects.code,
        credit_hours: cs.subjects.credit_hours,
        department: cs.subjects.department,
        class_subject_id: cs.id,
        is_assigned: isAssignedToThisClass,
        is_assigned_elsewhere: isAssignedElsewhere
      };
    });

    console.log('🔍 FINAL RESPONSE:', subjectsWithStatus.map(s => ({ 
      code: s.code, 
      is_assigned: s.is_assigned 
    })));

    return NextResponse.json({ data: subjectsWithStatus });

  } catch (error) {
    console.error('Error fetching class subjects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch class subjects' },
      { status: 500 }
    );
  }
}