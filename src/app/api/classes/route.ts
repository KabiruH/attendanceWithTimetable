// app/api/classes/route.ts
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

        // Verify user is still active and get has_timetable_admin status
        const user = await db.users.findUnique({
            where: { id: userId },
            select: { id: true, name: true, role: true, department: true, is_active: true, has_timetable_admin: true }
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

// GET /api/classes - Fetch all classes (Admin/Timetable Admin) or active classes (Trainers) WITH SUBJECT COUNT
export async function GET(request: NextRequest) {
    try {
        const authResult = await verifyAuth();
        if (authResult.error) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status });
        }

        if (!authResult.user) {
            return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
        }

        const { user } = authResult;
        const url = new URL(request.url);
        const activeOnly = url.searchParams.get('active_only') === 'true';

        // Build query conditions
        const whereConditions: any = {};

        // If not admin/timetable admin or explicitly requesting active only, filter for active classes
        if (!hasTimetableAdminAccess(user) || activeOnly) {
            whereConditions.is_active = true;
        }

        const classes = await db.classes.findMany({
            where: whereConditions,
            orderBy: [
                { department: 'asc' },
                { name: 'asc' }
            ],
            select: {
                id: true,
                name: true,
                code: true,
                description: true,
                department: true,
                duration_hours: true,
                is_active: true,
                created_at: true,
                created_by: true,
                updated_at: true,
                _count: {
                    select: {
                        classsubjects: true, // Count assigned subjects
                    },
                },
            },
        });

        // Transform response to have cleaner structure
        const formattedClasses = classes.map(classItem => ({
            ...classItem,
            _count: {
                subjects: classItem._count.classsubjects,
            },
        }));

        return NextResponse.json(formattedClasses);
    } catch (error) {
        console.error('Error fetching classes:', error);
        return NextResponse.json(
            { error: 'Failed to fetch classes' },
            { status: 500 }
        );
    }
}

// POST /api/classes - Create new class (Admin/Timetable Admin only)
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

        // Check if user is admin or timetable admin
        if (!hasTimetableAdminAccess(user)) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin or Timetable Admin access required.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { name, code, description, department, duration_hours } = body;

        // Validation
        if (!name || !code || !department) {
            return NextResponse.json(
                { error: 'Name, code, and department are required' },
                { status: 400 }
            );
        }

        // Check if class code already exists
        const existingClass = await db.classes.findUnique({
            where: { code: code.toUpperCase() }
        });

        if (existingClass) {
            return NextResponse.json(
                { error: 'Class code already exists' },
                { status: 400 }
            );
        }

        // Create new class
        const newClass = await db.classes.create({
            data: {
                name,
                code: code.toUpperCase(),
                description: description || null,
                department,
                duration_hours: duration_hours || 2,
                created_by: user.name
            }
        });

        return NextResponse.json(newClass, { status: 201 });
    } catch (error) {
        console.error('Error creating class:', error);
        return NextResponse.json(
            { error: 'Failed to create class' },
            { status: 500 }
        );
    }
}

// PUT /api/classes - Update existing class (Admin/Timetable Admin only)
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

        // Check if user is admin or timetable admin
        if (!hasTimetableAdminAccess(user)) {
            return NextResponse.json(
                { error: 'Unauthorized. Admin or Timetable Admin access required.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { id, name, code, description, department, duration_hours, is_active } = body;

        // Validation
        if (!id || !name || !code || !department) {
            return NextResponse.json(
                { error: 'ID, name, code, and department are required' },
                { status: 400 }
            );
        }

        // Check if class exists
        const existingClass = await db.classes.findUnique({
            where: { id }
        });

        if (!existingClass) {
            return NextResponse.json(
                { error: 'Class not found' },
                { status: 404 }
            );
        }

        // Check if code is being changed and if new code already exists
        if (code.toUpperCase() !== existingClass.code) {
            const codeExists = await db.classes.findUnique({
                where: { code: code.toUpperCase() }
            });

            if (codeExists) {
                return NextResponse.json(
                    { error: 'Class code already exists' },
                    { status: 400 }
                );
            }
        }

        // Update class
        const updatedClass = await db.classes.update({
            where: { id },
            data: {
                name,
                code: code.toUpperCase(),
                description: description || null,
                department,
                duration_hours: duration_hours || 2,
                is_active: is_active !== undefined ? is_active : true,
                updated_at: new Date()
            }
        });

        return NextResponse.json(updatedClass);
    } catch (error) {
        console.error('Error updating class:', error);
        return NextResponse.json(
            { error: 'Failed to update class' },
            { status: 500 }
        );
    }
}