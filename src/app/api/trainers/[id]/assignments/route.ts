// app/api/trainers/[id]/assignments/route.ts
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

// GET /api/trainers/[id]/assignments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const trainerUserId = parseInt(resolvedParams.id);

    if (isNaN(trainerUserId)) {
      return NextResponse.json({ error: 'Invalid trainer ID' }, { status: 400 });
    }

    if (user.role !== 'admin' && user.id !== trainerUserId) {
      return NextResponse.json(
        { error: 'Unauthorized. You can only view your own assignments.' },
        { status: 403 }
      );
    }

    const assignments = await db.trainerclassassignments.findMany({
      where: { trainer_id: trainerUserId, is_active: true },
      select: { id: true, class_id: true, assigned_at: true }
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error('Error fetching trainer assignments:', error);
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
  }
}

// POST /api/trainers/[id]/assignments
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const trainerUserId = parseInt(resolvedParams.id);

    if (isNaN(trainerUserId)) {
      return NextResponse.json({ error: 'Invalid trainer ID' }, { status: 400 });
    }

    if (user.role !== 'admin' && user.id !== trainerUserId) {
      return NextResponse.json(
        { error: 'Unauthorized. You can only update your own assignments.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { class_ids, term_id } = body;

    if (!Array.isArray(class_ids)) {
      return NextResponse.json({ error: 'class_ids must be an array' }, { status: 400 });
    }

    if (!term_id) {
      return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
    }

    const numericClassIds = class_ids.map(id => {
      const numId = Number(id);
      if (isNaN(numId)) throw new Error(`Invalid class ID: ${id}`);
      return numId;
    });

    const trainerUser = await db.users.findUnique({ where: { id: trainerUserId } });
    if (!trainerUser || !trainerUser.is_active) {
      return NextResponse.json({ error: 'Trainer not found or inactive' }, { status: 404 });
    }

    if (trainerUser.role !== 'employee' && trainerUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only employees can be assigned to classes' },
        { status: 400 }
      );
    }

    // Verify term exists
    const term = await db.terms.findUnique({
      where: { id: term_id }
    });

    if (!term) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }

    // Verify all class IDs exist and are active
    if (numericClassIds.length > 0) {
      const validClasses = await db.classes.findMany({
        where: { id: { in: numericClassIds }, is_active: true },
        select: { id: true, name: true, code: true }
      });

      if (validClasses.length !== numericClassIds.length) {
        const foundIds = validClasses.map(c => c.id);
        const invalidIds = numericClassIds.filter(id => !foundIds.includes(id));
        return NextResponse.json(
          { error: `Some classes not found or inactive. Invalid IDs: ${invalidIds.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // ✅ OPTIMIZED: Use transaction with increased timeout and batched operations
    const result = await db.$transaction(async (tx) => {
      // 1. Deactivate ALL existing assignments in parallel
      await Promise.all([
        tx.trainerclassassignments.updateMany({
          where: { trainer_id: trainerUserId, is_active: true },
          data: { is_active: false }
        }),
        tx.trainersubjectassignments.updateMany({
          where: {
            trainer_id: trainerUserId,
            term_id: term_id,
            is_active: true
          },
          data: { is_active: false }
        })
      ]);

      let classAssignmentsCreated = 0;
      let subjectAssignmentsCreated = 0;
      let classSubjectsCreated = 0;

      if (numericClassIds.length > 0) {
        // ✅ NEW: Step 2a - Ensure ClassSubjects exist for all classes
        // Get all active subjects
        const allSubjects = await tx.subjects.findMany({
          where: { is_active: true },
          select: { id: true, name: true }
        });

        console.log(`📚 Found ${allSubjects.length} active subjects in system`);

        // For each class, ensure all subjects are in ClassSubjects
        for (const classId of numericClassIds) {
          // Get existing class subjects for this class and term
          const existingClassSubjects = await tx.classsubjects.findMany({
            where: {
              class_id: classId,
              term_id: term_id
            },
            select: { subject_id: true, id: true }
          });

          const existingSubjectIds = new Set(existingClassSubjects.map(cs => cs.subject_id));
          
          console.log(`  📋 Class ${classId} already has ${existingClassSubjects.length} subjects for term ${term_id}`);

          // Find subjects that need to be added
          const subjectsToAdd = allSubjects.filter(s => !existingSubjectIds.has(s.id));

          if (subjectsToAdd.length > 0) {
            console.log(`  ➕ Adding ${subjectsToAdd.length} missing subjects to class ${classId}`);
            
            await tx.classsubjects.createMany({
              data: subjectsToAdd.map(subject => ({
                class_id: classId,
                subject_id: subject.id,
                term_id: term_id,
                assigned_by: user.name,
                is_active: true
              })),
              skipDuplicates: true
            });
            
            classSubjectsCreated += subjectsToAdd.length;
          }
        }

        console.log(`✅ Created ${classSubjectsCreated} new class-subject associations`);

        // 2b. Fetch all needed data in parallel (NOW classSubjects should exist)
        const [existingClassAssignments, classSubjects, existingSubjectAssignments] = await Promise.all([
          tx.trainerclassassignments.findMany({
            where: { trainer_id: trainerUserId, class_id: { in: numericClassIds } },
            select: { id: true, class_id: true }
          }),
          tx.classsubjects.findMany({
            where: { 
              class_id: { in: numericClassIds },
              term_id: term_id,
              is_active: true
            },
            select: { id: true, subject_id: true, class_id: true }
          }),
          tx.trainersubjectassignments.findMany({
            where: {
              trainer_id: trainerUserId,
              term_id: term_id
            },
            select: { id: true, class_subject_id: true }
          })
        ]);

        console.log(`📊 Found ${classSubjects.length} class subjects to assign to trainer`);

        // 3. Process class assignments
        const existingClassMap = new Map(existingClassAssignments.map(a => [a.class_id, a.id]));
        const classIdsToReactivate: number[] = [];
        const classesToCreate: any[] = [];

        numericClassIds.forEach(classId => {
          const existingId = existingClassMap.get(classId);
          if (existingId) {
            classIdsToReactivate.push(existingId);
          } else {
            classesToCreate.push({
              trainer_id: trainerUserId,
              class_id: classId,
              assigned_by: user.name,
              is_active: true
            });
          }
        });

        // 4. Process subject assignments
        const existingSubjectMap = new Map(
          existingSubjectAssignments.map(a => [a.class_subject_id, a.id])
        );
        const subjectIdsToReactivate: number[] = [];
        const subjectsToCreate: any[] = [];

        classSubjects.forEach(cs => {
          const existingId = existingSubjectMap.get(cs.id);
          if (existingId) {
            subjectIdsToReactivate.push(existingId);
          } else {
            subjectsToCreate.push({
              trainer_id: trainerUserId,
              subject_id: cs.subject_id,
              class_subject_id: cs.id,
              term_id: term_id,
              is_active: true
            });
          }
        });

        console.log(`  🔄 Reactivating ${subjectIdsToReactivate.length} existing subject assignments`);
        console.log(`  ➕ Creating ${subjectsToCreate.length} new subject assignments`);

        // 5. Execute all updates/creates in parallel batches
        const operations: Promise<any>[] = [];

        // Reactivate class assignments
        if (classIdsToReactivate.length > 0) {
          operations.push(
            tx.trainerclassassignments.updateMany({
              where: { id: { in: classIdsToReactivate } },
              data: { is_active: true, assigned_by: user.name, assigned_at: new Date() }
            })
          );
          classAssignmentsCreated += classIdsToReactivate.length;
        }

        // Create new class assignments
        if (classesToCreate.length > 0) {
          operations.push(
            tx.trainerclassassignments.createMany({
              data: classesToCreate
            })
          );
          classAssignmentsCreated += classesToCreate.length;
        }

        // Reactivate subject assignments
        if (subjectIdsToReactivate.length > 0) {
          operations.push(
            tx.trainersubjectassignments.updateMany({
              where: { id: { in: subjectIdsToReactivate } },
              data: { is_active: true }
            })
          );
          subjectAssignmentsCreated += subjectIdsToReactivate.length;
        }

        // Create new subject assignments
        if (subjectsToCreate.length > 0) {
          operations.push(
            tx.trainersubjectassignments.createMany({
              data: subjectsToCreate
            })
          );
          subjectAssignmentsCreated += subjectsToCreate.length;
        }

        // Execute all operations in parallel
        await Promise.all(operations);
      }

      return {
        classAssignmentsCreated,
        subjectAssignmentsCreated,
        classSubjectsCreated,
        assigned_classes: numericClassIds.length
      };
    }, {
      timeout: 30000,
      maxWait: 35000
    });

    return NextResponse.json({
      message: `Successfully updated assignments. ${result.assigned_classes} classes assigned with ${result.subjectAssignmentsCreated} subjects.`,
      class_assignments: result.classAssignmentsCreated,
      subject_assignments: result.subjectAssignmentsCreated,
      class_subjects_created: result.classSubjectsCreated,
      total_classes: result.assigned_classes
    });
  } catch (error) {
    console.error('Error updating trainer assignments:', error);
    return NextResponse.json(
      { error: 'Failed to update assignments', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}