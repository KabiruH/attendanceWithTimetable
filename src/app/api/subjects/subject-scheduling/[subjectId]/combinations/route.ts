// app/api/subject-scheduling/[subjectId]/combinations/route.ts
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
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true, email: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) return { error: 'User not found or inactive', status: 401 };
    return { user: { ...user, id: userId } };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

// GET /api/subject-scheduling/[subjectId]/combinations
// Returns all existing combinations for a subject, grouped by session number
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { subjectId } = await params;
    const numericSubjectId = parseInt(subjectId);
    if (isNaN(numericSubjectId)) {
      return NextResponse.json({ error: 'Invalid subject ID' }, { status: 400 });
    }

    const combinations = await db.subjectcombinations.findMany({
      where: { subject_id: numericSubjectId },
      include: {
        primary_assignment: {
          include: {
            users: { select: { id: true, name: true } },
            classsubjects: {
              include: {
                classes: { select: { id: true, name: true, code: true } }
              }
            }
          }
        },
        combined_assignment: {
          include: {
            users: { select: { id: true, name: true } },
            classsubjects: {
              include: {
                classes: { select: { id: true, name: true, code: true } }
              }
            }
          }
        }
      },
      orderBy: { session_number: 'asc' }
    });

    // Group by session number
    const grouped: Record<number, any[]> = {};
    for (const combo of combinations) {
      const session = combo.session_number;
      if (!grouped[session]) grouped[session] = [];
      grouped[session].push({
        id: combo.id,
        session_number: combo.session_number,
        primary_assignment_id: combo.primary_assignment_id,
        primary_trainer: combo.primary_assignment.users.name,
        primary_class: combo.primary_assignment.classsubjects.classes.name,
        primary_class_code: combo.primary_assignment.classsubjects.classes.code,
        combined_assignment_id: combo.combined_assignment_id,
        combined_trainer: combo.combined_assignment.users.name,
        combined_class: combo.combined_assignment.classsubjects.classes.name,
        combined_class_code: combo.combined_assignment.classsubjects.classes.code,
        created_at: combo.created_at,
        created_by: combo.created_by
      });
    }

    return NextResponse.json({
      subject_id: numericSubjectId,
      combinations: grouped,
      total: combinations.length
    });

  } catch (error) {
    console.error('Error fetching combinations:', error);
    return NextResponse.json({ error: 'Failed to fetch combinations' }, { status: 500 });
  }
}

// POST /api/subject-scheduling/[subjectId]/combinations
// Creates a combination between two assignments for a specific session number
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { user } = authResult;
    const { subjectId } = await params;
    const numericSubjectId = parseInt(subjectId);
    if (isNaN(numericSubjectId)) {
      return NextResponse.json({ error: 'Invalid subject ID' }, { status: 400 });
    }

    const body = await request.json();
    const { session_number, primary_assignment_id, combined_assignment_id } = body;

    if (!session_number || !primary_assignment_id || !combined_assignment_id) {
      return NextResponse.json({
        error: 'session_number, primary_assignment_id, and combined_assignment_id are required'
      }, { status: 400 });
    }

    if (primary_assignment_id === combined_assignment_id) {
      return NextResponse.json({
        error: 'Cannot combine an assignment with itself'
      }, { status: 400 });
    }

    // Validate session number against the subject's sessions_per_week
    const subject = await db.subjects.findUnique({
      where: { id: numericSubjectId },
      select: { sessions_per_week: true, name: true }
    });

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    if (session_number < 1 || session_number > subject.sessions_per_week) {
      return NextResponse.json({
        error: `Session number must be between 1 and ${subject.sessions_per_week} for this subject`
      }, { status: 400 });
    }

    // Validate both assignments belong to this subject and are active
    const [primaryAssignment, combinedAssignment] = await Promise.all([
      db.trainersubjectassignments.findFirst({
        where: { id: parseInt(primary_assignment_id), subject_id: numericSubjectId, is_active: true }
      }),
      db.trainersubjectassignments.findFirst({
        where: { id: parseInt(combined_assignment_id), subject_id: numericSubjectId, is_active: true }
      })
    ]);

    if (!primaryAssignment) {
      return NextResponse.json({ error: 'Primary assignment not found for this subject' }, { status: 404 });
    }
    if (!combinedAssignment) {
      return NextResponse.json({ error: 'Combined assignment not found for this subject' }, { status: 404 });
    }

    // Check for duplicate combination
    const existing = await db.subjectcombinations.findFirst({
      where: {
        subject_id: numericSubjectId,
        session_number: parseInt(session_number),
        OR: [
          {
            primary_assignment_id: parseInt(primary_assignment_id),
            combined_assignment_id: parseInt(combined_assignment_id)
          },
          {
            primary_assignment_id: parseInt(combined_assignment_id),
            combined_assignment_id: parseInt(primary_assignment_id)
          }
        ]
      }
    });

    if (existing) {
      return NextResponse.json({
        error: 'These two assignments are already combined for this session'
      }, { status: 400 });
    }

    const combination = await db.subjectcombinations.create({
      data: {
        subject_id: numericSubjectId,
        session_number: parseInt(session_number),
        primary_assignment_id: parseInt(primary_assignment_id),
        combined_assignment_id: parseInt(combined_assignment_id),
        created_by: user.name || user.email || 'system'
      }
    });

    return NextResponse.json({
      success: true,
      combination_id: combination.id,
      message: `Session ${session_number} combination created successfully`
    });

  } catch (error: any) {
    console.error('Error creating combination:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'This combination already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create combination' }, { status: 500 });
  }
}

// DELETE /api/subject-scheduling/[subjectId]/combinations
// Removes a specific combination by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { subjectId } = await params;
    const numericSubjectId = parseInt(subjectId);
    if (isNaN(numericSubjectId)) {
      return NextResponse.json({ error: 'Invalid subject ID' }, { status: 400 });
    }

    const body = await request.json();
    const { combination_id } = body;

    if (!combination_id) {
      return NextResponse.json({ error: 'combination_id is required' }, { status: 400 });
    }

    const combination = await db.subjectcombinations.findFirst({
      where: {
        id: parseInt(combination_id),
        subject_id: numericSubjectId
      }
    });

    if (!combination) {
      return NextResponse.json({ error: 'Combination not found' }, { status: 404 });
    }

    await db.subjectcombinations.delete({
      where: { id: parseInt(combination_id) }
    });

    return NextResponse.json({
      success: true,
      message: 'Combination removed successfully'
    });

  } catch (error) {
    console.error('Error deleting combination:', error);
    return NextResponse.json({ error: 'Failed to delete combination' }, { status: 500 });
  }
}