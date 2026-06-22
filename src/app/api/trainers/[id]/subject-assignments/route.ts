// app/api/trainers/[id]/subject-assignments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

async function verifyAuth() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');
    if (!token) return { error: 'No token found', status: 401 };

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

async function isSubjectSelectionBlocked(): Promise<boolean> {
  const settings = await db.timetablesettings.findFirst();
  return settings?.block_all_subject_selection || false;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error || 'Auth failed' }, { status: authResult.status || 401 });
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

    const isSelf = user.id === trainerUserId;
    const isPrivileged = user.role === 'admin' || user.has_timetable_admin === true;

    if (!isPrivileged && !isSelf) {
      return NextResponse.json(
        { error: 'Unauthorized. You do not have permission to update these subject assignments.' },
        { status: 403 }
      );
    }

    const isGloballyBlocked = await isSubjectSelectionBlocked();
    if (isGloballyBlocked && !isPrivileged) {
      return NextResponse.json(
        { error: 'Subject selection is currently disabled by administrator.' },
        { status: 403 }
      );
    }

    if (user.is_blocked && !isPrivileged) {
      return NextResponse.json(
        { error: 'Your account is blocked from selecting subjects.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { term_id, class_subject_id, subject_id, is_active } = body;

    if (!term_id || !class_subject_id || !subject_id || is_active === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const numericTermId = Number(term_id);
    const numericSubjectId = Number(subject_id);
    const numericClassSubjectId = Number(class_subject_id);

    // Validate the class_subject exists and belongs to the correct term
    const classSubject = await db.classsubjects.findUnique({
      where: { id: numericClassSubjectId },
      select: { id: true, term_id: true, subject_id: true, class_id: true }
    });

    if (!classSubject) {
      return NextResponse.json({ error: 'Class subject not found' }, { status: 404 });
    }

    if (classSubject.term_id !== numericTermId) {
      return NextResponse.json({ error: 'Term mismatch for class subject' }, { status: 400 });
    }

    if (classSubject.subject_id !== numericSubjectId) {
      return NextResponse.json({ error: 'Subject mismatch for class subject' }, { status: 400 });
    }

    // ── Check for existing assignment scoped to this specific class-subject ──

    const existingAssignment = await db.trainersubjectassignments.findFirst({
      where: {
        trainer_id: trainerUserId,
        subject_id: numericSubjectId,
        term_id: numericTermId,
        class_subject_id: numericClassSubjectId
      }
    });

    if (existingAssignment) {
      // Update the trainer assignment
      await db.trainersubjectassignments.update({
        where: { id: existingAssignment.id },
        data: { is_active }
      });

      if (is_active) {
        // Activating — ensure classsubject is also active
        await db.classsubjects.update({
          where: { id: numericClassSubjectId },
          data: { is_active: true }
        });
      } else {
        // Deactivating — only flip classsubject to false if no other
        // active trainer assignments remain for this class-subject
        const remainingActive = await db.trainersubjectassignments.count({
          where: {
            class_subject_id: numericClassSubjectId,
            is_active: true,
            id: { not: existingAssignment.id }
          }
        });

        if (remainingActive === 0) {
          await db.classsubjects.update({
            where: { id: numericClassSubjectId },
            data: { is_active: false }
          });
        }
      }

      return NextResponse.json({
        success: true,
        action: 'updated',
        message: is_active ? 'Subject activated' : 'Subject deactivated'
      });
    }

    // ── No existing assignment ────────────────────────────────────────────────

    if (is_active) {
      // Create the trainer assignment and activate the classsubject in a transaction
      await db.$transaction([
        db.trainersubjectassignments.create({
          data: {
            trainer_id: trainerUserId,
            subject_id: numericSubjectId,
            term_id: numericTermId,
            class_subject_id: numericClassSubjectId,
            is_active: true
          }
        }),
        db.classsubjects.update({
          where: { id: numericClassSubjectId },
          data: { is_active: true }
        })
      ]);

      return NextResponse.json({
        success: true,
        action: 'created',
        message: 'Subject assignment created and activated'
      });
    }

    // Trying to deactivate something that doesn't exist — no-op
    return NextResponse.json({
      success: true,
      action: 'none',
      message: 'No assignment to deactivate'
    });

  } catch (error) {
    console.error('Error updating subject assignment:', error);
    return NextResponse.json({
      error: 'Failed to update subject assignment',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}