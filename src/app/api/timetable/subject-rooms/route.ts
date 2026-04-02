// app/api/timetable/subject-rooms/route.ts

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

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) return { error: 'User not found or inactive', status: 401 };

    return { user: { ...user, id: userId, role } };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

// ─── GET /api/timetable/subject-rooms ────────────────────────────────────────
// Returns all active subjects and active rooms, with current mappings attached.
// Shape: { subjects: [...], rooms: [...], mappings: [...] }
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const [subjects, rooms, mappings] = await Promise.all([
      db.subjects.findMany({
        where: { is_active: true },
        select: { id: true, name: true, code: true, department: true },
        orderBy: { name: 'asc' }
      }),
      db.rooms.findMany({
        where: { is_active: true },
        select: { id: true, name: true, capacity: true, room_type: true, department: true },
        orderBy: { name: 'asc' }
      }),
      db.subjectrooms.findMany({
        select: {
          id: true,
          subject_id: true,
          room_id: true,
          assigned_at: true,
          assigned_by: true
        }
      })
    ]);

    return NextResponse.json({ subjects, rooms, mappings });
  } catch (error) {
    console.error('Error fetching subject-rooms:', error);
    return NextResponse.json({ error: 'Failed to fetch subject-room mappings' }, { status: 500 });
  }
}

// ─── POST /api/timetable/subject-rooms ───────────────────────────────────────
// Assigns a room to a subject. Silently skips if mapping already exists.
// Body: { subject_id: number, room_id: number }
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { subject_id, room_id } = body;

    if (!subject_id || !room_id) {
      return NextResponse.json(
        { error: 'subject_id and room_id are required' },
        { status: 400 }
      );
    }

    // Verify subject and room both exist and are active
    const [subject, room] = await Promise.all([
      db.subjects.findFirst({ where: { id: subject_id, is_active: true } }),
      db.rooms.findFirst({ where: { id: room_id, is_active: true } })
    ]);

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found or inactive' }, { status: 404 });
    }
    if (!room) {
      return NextResponse.json({ error: 'Room not found or inactive' }, { status: 404 });
    }

    // Upsert — safe to call multiple times (drag-drop can fire duplicate events)
    const mapping = await db.subjectrooms.upsert({
      where: { subject_id_room_id: { subject_id, room_id } },
      update: { assigned_by: authResult.user.name, assigned_at: new Date() },
      create: { subject_id, room_id, assigned_by: authResult.user.name }
    });

    return NextResponse.json({ success: true, mapping }, { status: 201 });
  } catch (error) {
    console.error('Error creating subject-room mapping:', error);
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
  }
}

// ─── DELETE /api/timetable/subject-rooms ─────────────────────────────────────
// Removes a subject-room mapping.
// Accepts either: { mapping_id: number } OR { subject_id: number, room_id: number }
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { mapping_id, subject_id, room_id } = body;

    if (!mapping_id && !(subject_id && room_id)) {
      return NextResponse.json(
        { error: 'Provide either mapping_id or both subject_id and room_id' },
        { status: 400 }
      );
    }

    if (mapping_id) {
      await db.subjectrooms.delete({ where: { id: mapping_id } });
    } else {
      await db.subjectrooms.delete({
        where: { subject_id_room_id: { subject_id, room_id } }
      });
    }

    return NextResponse.json({ success: true, message: 'Mapping removed' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }
    console.error('Error deleting subject-room mapping:', error);
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 });
  }
}