// app/api/subjects/route.ts
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
      select: { id: true, name: true, role: true, department: true, is_active: true, email: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// Helper function to check if user has timetable admin access
function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

// GET /api/subjects - Get all subjects
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const subjects = await db.subjects.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(subjects);
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subjects' },
      { status: 500 }
    );
  }
}

// POST /api/subjects - Create new subject
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;

    // Check if user is either an admin OR has timetable admin privileges
    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, code, department, credit_hours, description, can_be_online } = body; // ✅ Added can_be_online

    // Validation
    if (!name || !code || !department) {
      return NextResponse.json(
        { error: 'Name, code, and department are required' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existing = await db.subjects.findUnique({
      where: { code },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Subject code already exists' },
        { status: 400 }
      );
    }
    
    const now = new Date();
    const subject = await db.subjects.create({
      data: {
        name,
        code,
        department,
        credit_hours: credit_hours ? parseInt(credit_hours) : null,
        description: description || null,
        is_active: true,
        can_be_online: can_be_online !== undefined ? can_be_online : true, // ✅ Default to true
        created_by: user.email || user.name,
        updated_at: now
      },
    });

    return NextResponse.json(subject);
  } catch (error) {
    console.error('Error creating subject:', error);
    return NextResponse.json(
      { error: 'Failed to create subject' },
      { status: 500 }
    );
  }
}

// PUT /api/subjects - Update existing subject
export async function PUT(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;

    // Check if user is either an admin OR has timetable admin privileges
    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, name, code, department, credit_hours, description, is_active, can_be_online } = body; // ✅ Added can_be_online

    // Validation
    if (!id) {
      return NextResponse.json(
        { error: 'Subject ID is required' },
        { status: 400 }
      );
    }

    if (!name || !code || !department) {
      return NextResponse.json(
        { error: 'Name, code, and department are required' },
        { status: 400 }
      );
    }

    // Check if subject exists
    const existingSubject = await db.subjects.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingSubject) {
      return NextResponse.json(
        { error: 'Subject not found' },
        { status: 404 }
      );
    }

    // Check if code is being changed and if new code already exists
    if (code !== existingSubject.code) {
      const codeExists = await db.subjects.findUnique({
        where: { code },
      });

      if (codeExists) {
        return NextResponse.json(
          { error: 'Subject code already exists' },
          { status: 400 }
        );
      }
    }

    const updatedSubject = await db.subjects.update({
      where: { id: parseInt(id) },
      data: {
        name,
        code,
        department,
        credit_hours: credit_hours ? parseInt(credit_hours) : null,
        description: description || null,
        is_active: is_active !== undefined ? is_active : existingSubject.is_active,
        can_be_online: can_be_online !== undefined ? can_be_online : existingSubject.can_be_online, // ✅ Update can_be_online
        updated_at: new Date(),
      },
    });

    return NextResponse.json(updatedSubject);
  } catch (error) {
    console.error('Error updating subject:', error);
    return NextResponse.json(
      { error: 'Failed to update subject' },
      { status: 500 }
    );
  }
}