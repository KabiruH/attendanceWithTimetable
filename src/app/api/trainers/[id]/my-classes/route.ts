// app/api/trainers/[id]/my-classes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

// Helper function to verify authentication
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

// GET /api/trainers/[id]/my-classes
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
    const trainerUserId = parseInt(params.id);

    if (isNaN(trainerUserId)) {
      return NextResponse.json({ error: 'Invalid trainer ID' }, { status: 400 });
    }

    if (user.role !== 'admin' && user.id !== trainerUserId) {
      return NextResponse.json(
        { error: 'Unauthorized. You can only view your own classes.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const termIdParam = searchParams.get('term_id');

    if (!termIdParam || termIdParam === 'undefined' || termIdParam === 'null') {
      return NextResponse.json({ 
        error: 'term_id is required and must be a valid number' 
      }, { status: 400 });
    }

    const termId = parseInt(termIdParam);
    
    if (isNaN(termId)) {
      return NextResponse.json({ 
        error: 'term_id must be a valid number' 
      }, { status: 400 });
    }

    // Fetch trainer's active class assignments
    const assignments = await db.trainerclassassignments.findMany({
      where: {
        trainer_id: trainerUserId,
        is_active: true,
        classes: {
          is_active: true
        }
      },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            department: true,
            duration_hours: true
          }
        }
      },
      orderBy: {
        assigned_at: 'desc'
      }
    });

    console.log('📚 Found class assignments:', assignments.map(a => ({
      class_id: a.class_id,
      class_name: a.classes.name
    })));

    // For each assignment, get subjects
    const assignmentsWithDetails = await Promise.all(
      assignments.map(async (assignment) => {
        console.log(`\n🔍 Processing class: ${assignment.classes.name} (ID: ${assignment.class_id})`);

        // ✅ Step 1: Get ALL ClassSubjects for this class
        const allClassSubjects = await db.classsubjects.findMany({
          where: {
            class_id: assignment.class_id,
            is_active: true
          },
          include: {
            subjects: {
              select: {
                id: true,
                name: true,
                code: true,
                credit_hours: true
              }
            }
          }
        });

        console.log(`  📋 Found ${allClassSubjects.length} subjects for this class`);

        // ✅ Step 2: Get trainer's subject assignments for this term
        // We need to check which class_subject_ids belong to this class
        const classSubjectIds = allClassSubjects.map(cs => cs.id);

        console.log(`  🔑 ClassSubject IDs for this class:`, classSubjectIds);

        const trainerSubjectAssignments = await db.trainersubjectassignments.findMany({
          where: {
            trainer_id: trainerUserId,
            term_id: termId,
            is_active: true,
            class_subject_id: {
              in: classSubjectIds // ✅ Only get assignments for THIS class
            }
          },
          select: {
            subject_id: true,
            class_subject_id: true
          }
        });

        console.log(`  ✅ Trainer assigned to ${trainerSubjectAssignments.length} subjects in this class`);
        console.log(`  📝 Assigned subject IDs:`, trainerSubjectAssignments.map(tsa => tsa.subject_id));

        // ✅ Step 3: Create a set of assigned subject IDs
        const assignedSubjectIds = new Set(
          trainerSubjectAssignments.map(tsa => tsa.subject_id)
        );

        // ✅ Step 4: Map all subjects with their assignment status
        const subjects = allClassSubjects.map(cs => {
          const isAssigned = assignedSubjectIds.has(cs.subjects.id);
          console.log(`    • ${cs.subjects.name} (ID: ${cs.subjects.id}): ${isAssigned ? '✓ Assigned' : '✗ Not assigned'}`);
          
          return {
            id: cs.subjects.id,
            name: cs.subjects.name,
            code: cs.subjects.code,
            credit_hours: cs.subjects.credit_hours,
            class_subject_id: cs.id,
            is_assigned: isAssigned
          };
        });

        console.log(`  📊 Final subjects array: ${subjects.length} total, ${subjects.filter(s => s.is_assigned).length} assigned`);

        // Get the most recent attendance for this class
        const lastAttendance = await db.classattendance.findFirst({
          where: {
            trainer_id: trainerUserId,
            class_id: assignment.class_id
          },
          orderBy: {
            check_in_time: 'desc'
          },
          select: {
            date: true,
            check_in_time: true,
            check_out_time: true,
            status: true
          }
        });

        // Get total number of sessions for this class
        const totalSessions = await db.classattendance.count({
          where: {
            trainer_id: trainerUserId,
            class_id: assignment.class_id,
            status: 'Present'
          }
        });

        return {
          id: assignment.id,
          class_id: assignment.class_id,
          assigned_at: assignment.assigned_at,
          class: assignment.classes,
          subjects,
          lastAttendance: lastAttendance ? {
            date: lastAttendance.date.toISOString().split('T')[0],
            check_in_time: lastAttendance.check_in_time?.toISOString() || null,
            check_out_time: lastAttendance.check_out_time?.toISOString() || null,
            status: lastAttendance.status
          } : null,
          totalSessions
        };
      })
    );

    console.log('\n✅ Returning assignments with subjects');
    return NextResponse.json(assignmentsWithDetails);

  } catch (error) {
    console.error('❌ Error fetching trainer classes:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch assigned classes', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}