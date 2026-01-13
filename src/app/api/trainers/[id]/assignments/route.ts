// app/api/trainers/[id]/assignments/route.ts
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
      select: { 
        id: true, 
        name: true, 
        role: true, 
        department: true, 
        is_active: true,
        is_blocked: true,
        has_timetable_admin: true
      }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// ADD THIS HELPER FUNCTION
async function isSubjectSelectionBlocked(): Promise<boolean> {
  const settings = await db.timetablesettings.findFirst();
  return settings?.block_all_subject_selection || false;
}

// GET /api/trainers/[id]/assignments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error || !authResult.user) {
      return NextResponse.json({ error: authResult.error || 'Auth failed' }, { status: authResult.status || 401 });
    }

    const { user } = authResult;
    const resolvedParams = await params;
    const trainerUserId = parseInt(resolvedParams.id);

    if (isNaN(trainerUserId)) {
      return NextResponse.json({ error: 'Invalid trainer ID' }, { status: 400 });
    }

    // ✅ UPDATED PERMISSION LOGIC
    const isSelf = user.id === trainerUserId;
    const isPrivileged = user.role === 'admin' || user.has_timetable_admin === true;

    if (!isPrivileged && !isSelf) {
      return NextResponse.json(
        { error: 'Unauthorized. You do not have permission to view these assignments.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get('term_id');

    const whereClause: any = { 
      trainer_id: trainerUserId, 
      is_active: true 
    };

    if (termId) {
      whereClause.term_id = parseInt(termId);
    }

    const assignments = await db.trainerclassassignments.findMany({
      where: whereClause,
      select: { id: true, class_id: true, term_id: true, assigned_at: true }
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
    if (authResult.error || !authResult.user) {
      return NextResponse.json({ error: authResult.error || 'Auth failed' }, { status: authResult.status || 401 });
    }

    const { user } = authResult;
    const resolvedParams = await params;
    const trainerUserId = parseInt(resolvedParams.id);

    // ✅ UPDATED PERMISSION LOGIC
    const isSelf = user.id === trainerUserId;
    const isPrivileged = user.role === 'admin' || user.has_timetable_admin === true;

    if (!isPrivileged && !isSelf) {
      return NextResponse.json(
        { error: 'Unauthorized. You do not have permission to modify these assignments.' },
        { status: 403 }
      );
    }

    // ✅ CHECK GLOBAL BLOCK (ADD THIS)
const isGloballyBlocked = await isSubjectSelectionBlocked();
    if (isGloballyBlocked && !isPrivileged) {
      return NextResponse.json(
        { error: 'Class selection is currently disabled by administrator.' },
        { status: 403 }
      );
    }

    // ✅ CHECK INDIVIDUAL BLOCK (Privileged users bypass this)
    if (user.is_blocked && !isPrivileged) {
      return NextResponse.json(
        { error: 'Your account is blocked from selecting classes.' },
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

    const numericTermId = Number(term_id);
    const numericClassIds = class_ids.map(id => {
      const numId = Number(id);
      if (isNaN(numId)) throw new Error(`Invalid class ID: ${id}`);
      return numId;
    });

    // Validate trainer exists and is active
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

    // Validate term exists
    const term = await db.terms.findUnique({ where: { id: numericTermId } });
    if (!term) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }

    // Validate all classes exist and are active
    if (numericClassIds.length > 0) {
      const validClasses = await db.classes.findMany({
        where: { id: { in: numericClassIds }, is_active: true },
        select: { id: true }
      });

      if (validClasses.length !== numericClassIds.length) {
        const foundIds = new Set(validClasses.map(c => c.id));
        const invalidIds = numericClassIds.filter(id => !foundIds.has(id));
        return NextResponse.json(
          { error: `Some classes not found or inactive. Invalid IDs: ${invalidIds.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const result = await db.$transaction(async (tx) => {
      // 1. Deactivate existing class assignments
      await tx.trainerclassassignments.updateMany({
        where: { trainer_id: trainerUserId, is_active: true },
        data: { is_active: false }
      });

      // Note: We do NOT deactivate subject assignments here.
      // Subject assignments are managed separately via /subject-assignments route

      let classAssignmentsCreated = 0;

      if (numericClassIds.length === 0) {
        return { classAssignmentsCreated, assigned_classes: 0 };
      }

      // 2. Get existing class assignments
      const existingClassAssignments = await tx.trainerclassassignments.findMany({
        where: { trainer_id: trainerUserId, class_id: { in: numericClassIds } },
        select: { id: true, class_id: true }
      });

      // 3. Process class assignments - reactivate or create
      const existingClassMap = new Map(existingClassAssignments.map(a => [a.class_id, a.id]));
      const classIdsToReactivate: number[] = [];
      const classesToCreate: Array<{
        trainer_id: number;
        class_id: number;
        assigned_by: string;
        is_active: boolean;
      }> = [];

      for (const classId of numericClassIds) {
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
      }

      // 4. Execute database operations
      const operations: Promise<unknown>[] = [];

      if (classIdsToReactivate.length > 0) {
        operations.push(
          tx.trainerclassassignments.updateMany({
            where: { id: { in: classIdsToReactivate } },
            data: { is_active: true, assigned_by: user.name, assigned_at: new Date() }
          })
        );
        classAssignmentsCreated += classIdsToReactivate.length;
      }

      if (classesToCreate.length > 0) {
        operations.push(
          tx.trainerclassassignments.createMany({ data: classesToCreate })
        );
        classAssignmentsCreated += classesToCreate.length;
      }

      await Promise.all(operations);

      return {
        classAssignmentsCreated,
        assigned_classes: numericClassIds.length
      };
    }, {
      timeout: 30000,
      maxWait: 35000
    });

    return NextResponse.json({
      message: `Successfully updated assignments. ${result.assigned_classes} classes assigned.`,
      class_assignments: result.classAssignmentsCreated,
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