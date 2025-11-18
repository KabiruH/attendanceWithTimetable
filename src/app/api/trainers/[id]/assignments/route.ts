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
    const { class_ids, term_id } = body; // ✅ NOW REQUIRES term_id

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

    // ✅ NEW: Use transaction to update BOTH tables
    const result = await db.$transaction(async (tx) => {
      // 1. Deactivate current class assignments
      await tx.trainerclassassignments.updateMany({
        where: { trainer_id: trainerUserId, is_active: true },
        data: { is_active: false }
      });

      // 2. Deactivate current subject assignments for this term
      await tx.trainersubjectassignments.updateMany({
        where: {
          trainer_id: trainerUserId,
          term_id: term_id,
          is_active: true
        },
        data: { is_active: false }
      });

      let classAssignmentsCreated = 0;
      let subjectAssignmentsCreated = 0;

      if (numericClassIds.length > 0) {
        // 3. Handle TrainerClassAssignments (existing logic)
        const existingClassAssignments = await tx.trainerclassassignments.findMany({
          where: { trainer_id: trainerUserId, class_id: { in: numericClassIds } }
        });

        const existingClassIds = existingClassAssignments.map(a => a.class_id);
        const newClassIds = numericClassIds.filter(id => !existingClassIds.includes(id));

        // Reactivate existing class assignments
        if (existingClassAssignments.length > 0) {
          for (const a of existingClassAssignments) {
            await tx.trainerclassassignments.update({
              where: { id: a.id },
              data: { is_active: true, assigned_by: user.name, assigned_at: new Date() }
            });
            classAssignmentsCreated++;
          }
        }

        // Create new class assignments
        if (newClassIds.length > 0) {
          const createResult = await tx.trainerclassassignments.createMany({
            data: newClassIds.map(classId => ({
              trainer_id: trainerUserId,
              class_id: classId,
              assigned_by: user.name,
              is_active: true
            }))
          });
          classAssignmentsCreated += createResult.count;
        }

        // ✅ 4. NEW: Get all subjects for these classes and create TrainerSubjectAssignments
// 4. NEW: Get all subjects for these classes
const classSubjects = await tx.classsubjects.findMany({
  where: {
    class_id: { in: numericClassIds }
  },
  select: {
    id: true,
    subject_id: true
  }
});

console.log(`Found ${classSubjects.length} subjects across ${numericClassIds.length} classes`);

// Fetch ALL existing assignments in ONE query
const existingAssignments = await tx.trainersubjectassignments.findMany({
  where: {
    trainer_id: trainerUserId,
    term_id: term_id,
    class_subject_id: { in: classSubjects.map(cs => cs.id) }
  },
  select: { id: true, class_subject_id: true }
});

const existingMap = new Map(
  existingAssignments.map(a => [a.class_subject_id, a.id])
);

let toReactivate: number[] = [];
let toCreate: any[] = [];

for (const cs of classSubjects) {
  if (existingMap.has(cs.id)) {
    // Reactivate this assignment
    toReactivate.push(existingMap.get(cs.id)!);
  } else {
    // Create new assignment
    toCreate.push({
      trainer_id: trainerUserId,
      subject_id: cs.subject_id,
      class_subject_id: cs.id,
      term_id: term_id,
      is_active: true
    });
  }
}

// Reactivate ALL existing subject assignments
if (toReactivate.length > 0) {
  await tx.trainersubjectassignments.updateMany({
    where: { id: { in: toReactivate } },
    data: { is_active: true }
  });
}

// Create NEW subject assignments
if (toCreate.length > 0) {
  await tx.trainersubjectassignments.createMany({
    data: toCreate
  });
}

subjectAssignmentsCreated = toReactivate.length + toCreate.length;
       
      }

      return {
        classAssignmentsCreated,
        subjectAssignmentsCreated,
        assigned_classes: numericClassIds.length
      };
    });

    return NextResponse.json({
      message: `Successfully updated assignments. ${result.assigned_classes} classes assigned with ${result.subjectAssignmentsCreated} subjects.`,
      class_assignments: result.classAssignmentsCreated,
      subject_assignments: result.subjectAssignmentsCreated,
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