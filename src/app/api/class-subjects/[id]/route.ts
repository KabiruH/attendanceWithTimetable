// app/api/class-subjects/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { db } from '@/lib/db/db';

// GET /api/class-subjects/[id]?term_id=X&trainer_id=Y
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request);
    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed' },
        { status: authResult.status || 401 }
      );
    }

    const { user } = authResult;
    const params = await context.params;
    const classId = parseInt(params.id);

    if (isNaN(classId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid class ID' },
        { status: 400 }
      );
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

    console.log('🔍 Fetching subjects:', { classId, termId, trainerId, userId: user.id });

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

    console.log('✅ Found classSubjects:', classSubjects.length);

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

    console.log('✅ Found trainerAssignments:', trainerAssignments.length);

    // ✅ FIXED: Create a Set of assigned class_subject_ids (not just subject_ids)
    // This allows the same subject to be assigned to multiple classes
    const assignedClassSubjectIds = new Set(
      trainerAssignments.map(a => a.class_subject_id)
    );

    // ✅ FIXED: Group assignments by subject_id to check if subject is assigned elsewhere
    const assignmentsBySubjectId = new Map<number, number[]>();
    trainerAssignments.forEach(assignment => {
      const existing = assignmentsBySubjectId.get(assignment.subject_id) || [];
      assignmentsBySubjectId.set(assignment.subject_id, [...existing, assignment.class_subject_id]);
    });

    // Transform data with trainer's assignment status
    const formattedSubjects = classSubjects.map(cs => {
      // ✅ FIXED: Check if THIS SPECIFIC class_subject assignment is active
      const isAssignedToThisClass = assignedClassSubjectIds.has(cs.id);
      
      // ✅ FIXED: Check if this subject is assigned to OTHER class_subject combinations
      const allAssignmentsForSubject = assignmentsBySubjectId.get(cs.subject_id) || [];
      const isAssignedElsewhere = allAssignmentsForSubject.length > 0 && !isAssignedToThisClass;

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

    return NextResponse.json({
      success: true,
      data: formattedSubjects,
      count: formattedSubjects.length
    });

  } catch (error) {
    console.error('❌ Error fetching class subjects:', error);
    return NextResponse.json(
      { 
        success: false,
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
    const authResult = await verifyAuth(request);
    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed' },
        { status: authResult.status || 401 }
      );
    }

    const { user } = authResult;

    if (user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const params = await context.params;
    const classSubjectId = parseInt(params.id);

    if (isNaN(classSubjectId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid class subject ID' },
        { status: 400 }
      );
    }

    const classSubject = await db.classsubjects.findUnique({
      where: { id: classSubjectId },
    });

    if (!classSubject) {
      return NextResponse.json(
        { success: false, error: 'Class subject assignment not found' },
        { status: 404 }
      );
    }

    if (classSubject.is_active && classSubject.term_id) {
      await db.trainersubjectassignments.updateMany({
        where: { class_subject_id: classSubjectId },
        data: { is_active: false }
      });

      await db.classsubjects.update({
        where: { id: classSubjectId },
        data: { is_active: false }
      });
    }

    await db.classsubjects.delete({
      where: { id: classSubjectId },
    });

    return NextResponse.json({
      success: true,
      message: 'Subject removed successfully from class'
    });

  } catch (error) {
    console.error('❌ Error removing subject:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove subject' },
      { status: 500 }
    );
  }
}