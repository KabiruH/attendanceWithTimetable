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

    return { user: payload };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const resolvedParams = await params;
    const trainerUserId = parseInt(resolvedParams.id);
    const body = await request.json();
    const { term_id, class_subject_id, subject_id, is_active } = body;

    if (!term_id || !class_subject_id || !subject_id || is_active === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if assignment exists
    const existingAssignment = await db.trainersubjectassignments.findFirst({
      where: {
        trainer_id: trainerUserId,
        subject_id: subject_id,
        term_id: term_id,
        class_subject_id: class_subject_id
      }
    });

    if (existingAssignment) {
      // Update existing assignment
      await db.trainersubjectassignments.update({
        where: { id: existingAssignment.id },
        data: { is_active }
      });
    } else if (is_active) {
      // Create new assignment only if activating
      await db.trainersubjectassignments.create({
        data: {
          trainer_id: trainerUserId,
          subject_id: subject_id,
          term_id: term_id,
          class_subject_id: class_subject_id,
          is_active: true
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating subject assignment:', error);
    return NextResponse.json({ error: 'Failed to update subject assignment' }, { status: 500 });
  }
}