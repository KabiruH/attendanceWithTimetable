// app/api/class-subjects/[id]/route.ts
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
      select: { id: true, name: true, role: true, department: true, is_active: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// GET /api/class-subjects/[id]?term_id=X&trainer_id=Y
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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
    const params = await context.params;
    const classId = parseInt(params.id);

    if (isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const termIdParam = searchParams.get('term_id');
    const trainerIdParam = searchParams.get('trainer_id');

    // Build where clause for classsubjects
    const whereClause: { class_id: number; term_id?: number } = {
      class_id: classId
    };

    let termId: number | null = null;
    if (termIdParam && termIdParam !== 'undefined' && termIdParam !== 'null') {
      termId = parseInt(termIdParam);
      whereClause.term_id = termId;
    }

    // Determine trainer ID - use provided or fall back to current user
    const trainerId = trainerIdParam ? parseInt(trainerIdParam) : user.id;

    console.log('🔍 Fetching subjects:', { classId, termId, trainerId });

    // Fetch class subjects
    const classSubjects = await db.classsubjects.findMany({
      where: whereClause,
      include: {
        subjects: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            credit_hours: true,
            description: true
          }
        },
        terms: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { is_active: 'desc' },
        { subjects: { name: 'asc' } }
      ]
    });

    console.log('🔍 Found classSubjects:', classSubjects.length);

    if (classSubjects.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        count: 0
      });
    }

    // Fetch trainer's subject assignments for this term
    let trainerAssignments: { subject_id: number; class_subject_id: number }[] = [];
    
    if (termId && trainerId) {
      trainerAssignments = await db.trainersubjectassignments.findMany({
        where: {
          trainer_id: trainerId,
          term_id: termId,
          is_active: true
        },
        select: {
          subject_id: true,
          class_subject_id: true
        }
      });
    }

    console.log('🔍 Found trainerAssignments:', trainerAssignments);

    // Create lookup maps
    const assignedSubjectIds = new Set(trainerAssignments.map(a => a.subject_id));
    const assignmentBySubject = new Map(
      trainerAssignments.map(a => [a.subject_id, a.class_subject_id])
    );

    // Transform data with trainer's assignment status
    const formattedSubjects = classSubjects.map(cs => {
      const isAssignedToAnyClass = assignedSubjectIds.has(cs.subject_id);
      const assignedToClassSubjectId = assignmentBySubject.get(cs.subject_id);
      
      // Check if assigned to THIS class's class_subject_id
      const isAssignedToThisClass = isAssignedToAnyClass && assignedToClassSubjectId === cs.id;
      // Check if assigned to a DIFFERENT class
      const isAssignedElsewhere = isAssignedToAnyClass && assignedToClassSubjectId !== cs.id;

      return {
        id: cs.subjects.id,
        name: cs.subjects.name,
        code: cs.subjects.code,
        department: cs.subjects.department,
        credit_hours: cs.subjects.credit_hours,
        class_subject_id: cs.id,
        is_assigned: isAssignedToThisClass,
        is_assigned_elsewhere: isAssignedElsewhere
      };
    });

    console.log('🔍 Formatted subjects:', formattedSubjects.map(s => ({ 
      code: s.code, 
      is_assigned: s.is_assigned,
      is_assigned_elsewhere: s.is_assigned_elsewhere 
    })));

    return NextResponse.json({
      success: true,
      data: formattedSubjects,
      count: formattedSubjects.length
    });

  } catch (error) {
    console.error('Error fetching class subjects:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch class subjects',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// DELETE /api/class-subjects/[id] - Remove subject from class
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
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

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const params = await context.params;
    const classSubjectId = parseInt(params.id);

    if (isNaN(classSubjectId)) {
      return NextResponse.json({ error: 'Invalid class subject ID' }, { status: 400 });
    }

    const classSubject = await db.classsubjects.findUnique({
      where: { id: classSubjectId },
    });

    if (!classSubject) {
      return NextResponse.json({ error: 'Class subject assignment not found' }, { status: 404 });
    }

    if (classSubject.is_active && classSubject.term_id) {
      await db.trainersubjectassignments.updateMany({
        where: { class_subject_id: classSubjectId },
        data: { is_active: false }
      });

      await db.classsubjects.update({
        where: { id: classSubjectId },
        data: { 
          is_active: false
        }
      });
    }

    await db.classsubjects.delete({
      where: { id: classSubjectId },
    });

    return NextResponse.json({ message: 'Subject removed successfully from class' });

  } catch (error) {
    console.error('Error removing subject:', error);
    return NextResponse.json({ error: 'Failed to remove subject' }, { status: 500 });
  }
}