import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';
import * as XLSX from 'xlsx';

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
      select: {
        id: true, name: true, role: true,
        department: true, is_active: true,
        email: true, has_timetable_admin: true
      }
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

function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === 'yes' || lower === '1';
  }
  if (typeof value === 'number') return value === 1;
  return true;
}

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

    const { user } = authResult;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // ── Parse Excel ───────────────────────────────────────────────────────────
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No data found in file' }, { status: 400 });
    }

    // ── Fetch valid departments once upfront ──────────────────────────────────
// ── Fetch valid departments once upfront ──────────────────────────────────
const activeDepartments = await db.departments.findMany({
  where: { is_active: true },
  select: { name: true }
});

if (activeDepartments.length === 0) {
  return NextResponse.json({
    error: 'No active departments found in the system. Please create departments before importing subjects.',
    hint: 'Go to Settings → Departments and create at least one department first.'
  }, { status: 400 });
}

const validDeptNames = new Set(activeDepartments.map(d => d.name.trim().toLowerCase()));
const validDeptNamesDisplay = activeDepartments.map(d => d.name).join(', ');
    // ── Process rows ──────────────────────────────────────────────────────────
    let imported = 0;
    let updated = 0;

    const skipped: Array<{ row: number; code: string; name: string; reason: string }> = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      const rowNumber = i + 2;

      const rawName       = row['Subject Name'] || row['name'] || row['subject_name'];
      const rawCode       = row['Subject Code'] || row['code'] || row['subject_code'];
      const rawDept       = row['Department']   || row['department'];
      const rawCredits    = row['Credit Hours'] || row['credit_hours'] || row['credit hours'] || null;
      const rawDesc       = row['Description']  || row['description'] || null;
      const rawOnline     = row['Can Be Online'] || row['can_be_online'] || row['online'] || true;
      const rawClassification = row['Classification'] || row['classification'] || 'core';
      const rawLessonType     = row['Lesson Type']    || row['lesson_type']    || 'single';
      const rawSessionsPerWeek = row['Sessions Per Week'] || row['sessions_per_week'] || 1;

      const name       = rawName?.toString().trim();
      const code       = rawCode?.toString().toUpperCase().trim();
      const department = rawDept?.toString().trim();

      // ── Validate required fields ──────────────────────────────────────────
      if (!name || !code || !department) {
        skipped.push({
          row: rowNumber,
          code: code || '—',
          name: name || '—',
          reason: `Missing required field(s): ${[
            !name && 'Subject Name',
            !code && 'Subject Code',
            !department && 'Department'
          ].filter(Boolean).join(', ')}`
        });
        continue;
      }

      // Validate classification
const validClassifications = ['basic', 'common', 'core'];
const classification = rawClassification?.toString().toLowerCase().trim();
if (!validClassifications.includes(classification)) {
  skipped.push({
    row: rowNumber, code, name,
    reason: `Invalid classification "${rawClassification}". Must be: basic, common, or core.`
  });
  continue;
}

// Validate lesson_type
const validLessonTypes = ['single', 'double', 'triple'];
const lesson_type = rawLessonType?.toString().toLowerCase().trim();
if (!validLessonTypes.includes(lesson_type)) {
  skipped.push({
    row: rowNumber, code, name,
    reason: `Invalid lesson type "${rawLessonType}". Must be: single, double, or triple.`
  });
  continue;
}

// Validate sessions_per_week
const sessions_per_week = parseInt(rawSessionsPerWeek?.toString());
if (isNaN(sessions_per_week) || sessions_per_week < 1 || sessions_per_week > 4) {
  skipped.push({
    row: rowNumber, code, name,
    reason: `Invalid sessions per week "${rawSessionsPerWeek}". Must be a number between 1 and 4.`
  });
  continue;
}

      // ── Validate code length ──────────────────────────────────────────────
      if (code.length > 100) {
        skipped.push({
          row: rowNumber,
          code,
          name,
          reason: `Subject Code "${code}" is too long (${code.length} characters). Maximum is 100.`
        });
        continue;
      }

      // ── Validate department against DB ────────────────────────────────────
    if (!validDeptNames.has(department.toLowerCase())) {
  skipped.push({
    row: rowNumber,
    code,
    name,
    reason: `Department "${department}" does not exist or is inactive. Valid departments are: ${validDeptNamesDisplay}.`
  });
  continue;
}

      // ── Upsert ────────────────────────────────────────────────────────────
      try {
        const existingSubject = await db.subjects.findUnique({
          where: { code }
        });

        if (existingSubject) {
          await db.subjects.update({
            where: { code },
            data: {
              name,
              department,
              classification,
              lesson_type,
              sessions_per_week,
              credit_hours: rawCredits ? parseInt(rawCredits.toString()) : null,
              description: rawDesc?.toString().trim() || null,
              can_be_online: parseBoolean(rawOnline),
              updated_at: new Date()
            }
          });
          updated++;
        } else {
          await db.subjects.create({
            data: {
              name,
              code,
              department,
              classification,
              lesson_type,
              sessions_per_week,
              credit_hours: rawCredits ? parseInt(rawCredits.toString()) : null,
              description: rawDesc?.toString().trim() || null,
              is_active: true,
              can_be_online: parseBoolean(rawOnline),
              created_by: user.email || user.name,
              updated_at: new Date()
            }
          });
          imported++;
        }
      } catch (error: any) {
        skipped.push({
          row: rowNumber,
          code,
          name,
          reason: error.message || 'Database error'
        });
      }
    }

   const allSkipped = imported + updated === 0 && skipped.length > 0;

    const skipReasonGroups: Record<string, number> = {};
    for (const s of skipped) {
      const reasonKey = s.reason.split('"')[0].trim();
      skipReasonGroups[reasonKey] = (skipReasonGroups[reasonKey] || 0) + 1;
    }

    const skipSummary = Object.entries(skipReasonGroups)
      .map(([reason, count]) => `${count} row(s): ${reason}`)
      .join(' | ');

    return NextResponse.json({
      success: !allSkipped,
      imported,
      updated,
      total: imported + updated,
      skipped_count: skipped.length,
      skipped: skipped.length > 0 ? skipped : undefined,
      message: allSkipped
        ? `All ${skipped.length} row(s) were skipped. Nothing was imported. Reasons: ${skipSummary}`
        : `Processed ${imported + updated} subject(s). ${imported} new, ${updated} updated${
            skipped.length > 0
              ? `. ${skipped.length} skipped — ${skipSummary}`
              : '.'
          }`,
      ...(allSkipped && {
        hint: 'Check the skipped rows below for details on what needs to be fixed before re-importing.'
      })
    });

  } catch (error: any) {
    console.error('Error importing subjects:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import subjects' },
      { status: 500 }
    );
  }
}