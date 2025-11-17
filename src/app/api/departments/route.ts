// app/api/departments/route.ts
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
    const email = payload.email as string;
    const name = payload.name as string;

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, is_active: true, role: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, role, email, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// GET /api/departments - Get all active departments
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const departments = await db.departments.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        is_active: true,
      },
    });

    return NextResponse.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch departments' },
      { status: 500 }
    );
  }
}

// POST /api/departments - Create new department (Admin only)
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

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name: deptName, code, description } = body;

    if (!deptName || !code) {
      return NextResponse.json(
        { error: 'Department name and code are required' },
        { status: 400 }
      );
    }

    // Check if code or name already exists
    const existing = await db.departments.findFirst({
      where: {
        OR: [
          { code },
          { name: deptName },
        ],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Department with this name or code already exists' },
        { status: 400 }
      );
    }

    const department = await db.departments.create({
      data: {
        name: deptName,
        code,
        description: description || null,
        is_active: true,
        created_by: user.email || user.name,
      },
    });

    return NextResponse.json(department);
  } catch (error) {
    console.error('Error creating department:', error);
    return NextResponse.json(
      { error: 'Failed to create department' },
      { status: 500 }
    );
  }
}

// PUT /api/departments - Update existing department (Admin only)
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

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, name, code, description, is_active } = body;

    // Validation
    if (!id) {
      return NextResponse.json(
        { error: 'Department ID is required' },
        { status: 400 }
      );
    }

    if (!name || !code) {
      return NextResponse.json(
        { error: 'Department name and code are required' },
        { status: 400 }
      );
    }

    // Check if department exists
    const existingDepartment = await db.departments.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingDepartment) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      );
    }

    // Check if code or name is being changed and if new values already exist
    const duplicateCheck = await db.departments.findFirst({
      where: {
        AND: [
          { id: { not: parseInt(id) } },
          {
            OR: [
              { code },
              { name },
            ],
          },
        ],
      },
    });

    if (duplicateCheck) {
      return NextResponse.json(
        { error: 'Department with this name or code already exists' },
        { status: 400 }
      );
    }

    const updatedDepartment = await db.departments.update({
      where: { id: parseInt(id) },
      data: {
        name,
        code,
        description: description || null,
        is_active: is_active !== undefined ? is_active : existingDepartment.is_active,
        updated_at: new Date(),
      },
    });

    return NextResponse.json(updatedDepartment);
  } catch (error) {
    console.error('Error updating department:', error);
    return NextResponse.json(
      { error: 'Failed to update department' },
      { status: 500 }
    );
  }
}

// DELETE /api/departments - Soft delete department (Admin only)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Department ID is required' },
        { status: 400 }
      );
    }

    // Check if department exists
    const department = await db.departments.findUnique({
      where: { id: parseInt(id) },
    });

    if (!department) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      );
    }

    // Check if department is being used by any classes or subjects
    const classesCount = await db.classes.count({
      where: { department: department.name },
    });

    const subjectsCount = await db.subjects.count({
      where: { department: department.name },
    });

    if (classesCount > 0 || subjectsCount > 0) {
      return NextResponse.json(
        { 
          error: `Cannot delete department. It is being used by ${classesCount} class(es) and ${subjectsCount} subject(s)` 
        },
        { status: 400 }
      );
    }

    // Soft delete - set is_active to false
    await db.departments.update({
      where: { id: parseInt(id) },
      data: {
        is_active: false,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({ 
      message: 'Department deactivated successfully' 
    });
  } catch (error) {
    console.error('Error deleting department:', error);
    return NextResponse.json(
      { error: 'Failed to delete department' },
      { status: 500 }
    );
  }
}