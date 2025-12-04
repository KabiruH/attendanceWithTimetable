// app/api/classes/import/route.ts
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
        
        // ✅ Add validation for userId
        if (!userId || isNaN(userId)) {
            console.error('Invalid user ID in token:', payload.id);
            return { error: 'Invalid user ID in token', status: 401 };
        }

        const role = payload.role as string;
        const name = payload.name as string;

        // Now this query should work - also get has_timetable_admin
        const user = await db.users.findUnique({
            where: { id: userId },
            select: { id: true, name: true, role: true, department: true, is_active: true, has_timetable_admin: true }
        });

        if (!user || !user.is_active) {
            return { error: 'User not found or inactive', status: 401 };
        }

        return { user: { ...user, id: userId, role, name } };
    } catch (error) {
        console.error('Auth verification error:', error);
        return { error: 'Invalid token', status: 401 };
    }
}

// Helper function to check if user has timetable admin access
function hasTimetableAdminAccess(user: any): boolean {
    return user.role === 'admin' || user.has_timetable_admin === true;
}

// POST /api/classes/import - Bulk import classes from Excel (Admin/Timetable Admin only)
export async function POST(request: NextRequest) {
    try {
        const authResult = await verifyAuth();
        if (authResult.error) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status });
        }

        // ✅ Explicit check for user existence
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
        const { classes } = body;

        if (!classes || !Array.isArray(classes)) {
            return NextResponse.json(
                { error: 'Invalid data format. Expected array of classes.' },
                { status: 400 }
            );
        }

        const results = {
            imported: 0,
            skipped: 0,
            errors: [] as string[]
        };

        // Get existing class codes to avoid duplicates
        const existingClasses = await db.classes.findMany({
            select: { code: true }
        });
        const existingCodes = new Set(existingClasses.map(c => c.code));

        // Process each class
        for (let i = 0; i < classes.length; i++) {
            const classData = classes[i];

            try {
                // Validation
                if (!classData.name || !classData.code || !classData.department) {
                    results.errors.push(`Row ${i + 1}: Missing required fields (name, code, department)`);
                    results.skipped++;
                    continue;
                }

                const upperCode = classData.code.toString().toUpperCase();

                // Check for duplicate codes in this import batch or existing data
                if (existingCodes.has(upperCode)) {
                    results.errors.push(`Row ${i + 1}: Class code '${upperCode}' already exists`);
                    results.skipped++;
                    continue;
                }

                // Add to existing codes set to prevent duplicates within this batch
                existingCodes.add(upperCode);

                // Create class
                await db.classes.create({
                    data: {
                        name: classData.name,
                        code: upperCode,
                        description: classData.description || null,
                        department: classData.department,
                        duration_hours: classData.duration_hours || 2,
                        is_active: classData.is_active !== false,
                        created_by: classData.created_by || user.name
                    }
                });

                results.imported++;
            } catch (error) {
                console.error(`Error importing class at row ${i + 1}:`, error);
                results.errors.push(`Row ${i + 1}: Failed to create class - ${error instanceof Error ? error.message : 'Unknown error'}`);
                results.skipped++;
            }
        }

        // Return results
        if (results.imported === 0 && results.errors.length > 0) {
            return NextResponse.json(
                {
                    error: 'No classes were imported',
                    details: results
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            message: `Successfully imported ${results.imported} classes`,
            imported: results.imported,
            skipped: results.skipped,
            errors: results.errors
        });

    } catch (error) {
        console.error('Error importing classes:', error);
        return NextResponse.json(
            { error: 'Failed to import classes' },
            { status: 500 }
        );
    }
}