// app/api/classes/import/route.ts
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

        if (!userId || isNaN(userId)) {
            return { error: 'Invalid user ID in token', status: 401 };
        }

        const role = payload.role as string;
        const name = payload.name as string;

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

function hasTimetableAdminAccess(user: any): boolean {
    return user.role === 'admin' || user.has_timetable_admin === true;
}

function sanitizeText(value: any): string {
    if (!value) return '';
    return value
        .toString()
        .replace(/\u2013/g, '-')   // en dash → hyphen
        .replace(/\u2014/g, '-')   // em dash → hyphen
        .replace(/\u2018|\u2019/g, "'")  // smart single quotes → straight
        .replace(/\u201C|\u201D/g, '"')  // smart double quotes → straight
        .replace(/\u00A0/g, ' ')   // non-breaking space → regular space
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width characters → remove
        .trim();
}

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

        if (classes.length > 500) {
            return NextResponse.json({
                error: `File contains ${classes.length} rows. Maximum allowed is 500 rows per import. Please split your file into smaller batches.`
            }, { status: 400 });
        }

        // ── Fetch valid departments once upfront ──────────────────────────────
        const activeDepartments = await db.departments.findMany({
            where: { is_active: true },
            select: { name: true }
        });

        if (activeDepartments.length === 0) {
            return NextResponse.json({
                error: 'No active departments found in the system. Please create departments before importing classes.',
                hint: 'Go to Settings → Departments and create at least one department first.'
            }, { status: 400 });
        }

        const validDeptNames = new Set(activeDepartments.map(d => d.name.trim().toLowerCase()));
        const validDeptNamesDisplay = activeDepartments.map(d => d.name).join(', ');

        const results = {
            imported: 0,
            skipped: 0,
            errors: [] as string[]
        };

        // ── Get existing class codes to avoid duplicates ──────────────────────
        const existingClasses = await db.classes.findMany({
            select: { code: true }
        });
        const existingCodes = new Set(existingClasses.map(c => c.code.toUpperCase().trim()));

        // ── Process each class ────────────────────────────────────────────────
        for (let i = 0; i < classes.length; i++) {
            const classData = classes[i];

            try {
                // Validate required fields
                if (!classData.name || !classData.code || !classData.department) {
                    results.errors.push(
                        `Row ${i + 2}: Missing required field(s): ${[
                            !classData.name && 'Name',
                            !classData.code && 'Code',
                            !classData.department && 'Department'
                        ].filter(Boolean).join(', ')}`
                    );
                    results.skipped++;
                    continue;
                }

                const upperCode = sanitizeText(classData.code).toUpperCase();

                // Validate code length
                if (upperCode.length > 50) {
                    results.errors.push(
                        `Row ${i + 2}: Class code "${upperCode}" is too long (${upperCode.length} characters). Maximum is 20.`
                    );
                    results.skipped++;
                    continue;
                }

                // Validate department against DB
                const department = sanitizeText(classData.department);
                if (!validDeptNames.has(department.toLowerCase())) {
                    results.errors.push(
                        `Row ${i + 2}: Department "${department}" does not exist or is inactive. Valid departments are: ${validDeptNamesDisplay}.`
                    );
                    results.skipped++;
                    continue;
                }

                // Check for duplicate codes
                // Add to set to prevent duplicates within this batch
                if (existingCodes.has(upperCode)) {
                    // Update existing class instead of skipping
                    await db.classes.update({
                        where: { code: upperCode },
                        data: {
                            name: sanitizeText(classData.name),
                            description: sanitizeText(classData.description) || null,
                            department: sanitizeText(classData.department),
                            duration_hours: classData.duration_hours || 2,
                        }
                    });
                    results.imported++;
                    continue;
                }

                existingCodes.add(upperCode);

                await db.classes.create({
                    data: {
                        name: sanitizeText(classData.name),
                        code: upperCode,
                        description: sanitizeText(classData.description) || null,
                        department: sanitizeText(classData.department),
                        duration_hours: classData.duration_hours || 2,
                        is_active: classData.is_active !== false,
                        created_by: user.name
                    }
                });

                results.imported++;
            } catch (error) {
                console.error(`Error importing class at row ${i + 2}:`, error);
                results.errors.push(
                    `Row ${i + 2}: Failed to create class — ${error instanceof Error ? error.message : 'Unknown error'}`
                );
                results.skipped++;
            }
        }

        // ── Build skip summary ────────────────────────────────────────────────
        const allSkipped = results.imported === 0 && results.skipped > 0;

        const skipReasonGroups: Record<string, number> = {};
        for (const err of results.errors) {
            const reasonKey = err.split(':').slice(1).join(':').trim().split('"')[0].trim();
            skipReasonGroups[reasonKey] = (skipReasonGroups[reasonKey] || 0) + 1;
        }

        const skipSummary = Object.entries(skipReasonGroups)
            .map(([reason, count]) => `${count} row(s): ${reason}`)
            .join(' | ');

        if (allSkipped) {
            return NextResponse.json({
                success: false,
                error: `All ${results.skipped} row(s) were skipped. Nothing was imported.`,
                hint: 'Check the errors below for details on what needs to be fixed before re-importing.',
                imported: 0,
                skipped: results.skipped,
                errors: results.errors,
                summary: skipSummary
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${results.imported + results.skipped} class(es). ${results.imported} imported${results.skipped > 0 ? `, ${results.skipped} skipped — ${skipSummary}` : '.'
                }`,
            imported: results.imported,
            skipped: results.skipped,
            errors: results.errors.length > 0 ? results.errors : undefined
        });

    } catch (error) {
        console.error('Error importing classes:', error);
        return NextResponse.json(
            { error: 'Failed to import classes' },
            { status: 500 }
        );
    }
}