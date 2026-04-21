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
      select: { id: true, is_active: true, role: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) return { error: 'User not found or inactive', status: 401 };
    return { user };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    // Fetch all active departments
    const departments = await db.departments.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      select: { name: true, code: true }
    });

    if (departments.length === 0) {
      return NextResponse.json(
        { error: 'No departments found. Create departments before downloading the template.' },
        { status: 400 }
      );
    }

    const workbook = XLSX.utils.book_new();

    // ── Sheet 1: Import template ──────────────────────────────────────────────
const templateData = [
  {
    'Subject Name': 'Programming Fundamentals',
    'Subject Code': 'PROG101',
    'Department': departments[0].name,
    'Credit Hours': 40,
    'Description': 'Introduction to programming concepts',
    'Classification': 'core',
    'Lesson Type': 'single',
    'Sessions Per Week': 1,
  }
];

const templateSheet = XLSX.utils.json_to_sheet(templateData);

templateSheet['!cols'] = [
  { wch: 35 }, // Subject Name
  { wch: 15 }, // Subject Code
  { wch: 30 }, // Department
  { wch: 14 }, // Credit Hours
  { wch: 45 }, // Description
  { wch: 18 }, // Classification
  { wch: 15 }, // Lesson Type
  { wch: 20 }, // Sessions Per Week
];

templateSheet['!dataValidation'] = [
  {
    sqref: 'C2:C1000',
    type: 'list',
    formula1: `Departments!$A$2:$A$${departments.length + 1}`,
    showDropDown: false,
    showErrorMessage: true,
    errorTitle: 'Invalid Department',
    error: 'Please select a department from the dropdown list.',
    errorStyle: 'stop'
  },
  {
    sqref: 'F2:F1000',
    type: 'list',
    formula1: '"basic,common,core"',
    showDropDown: false,
    showErrorMessage: true,
    errorTitle: 'Invalid Classification',
    error: 'Must be: basic, common, or core.',
    errorStyle: 'stop'
  },
  {
    sqref: 'G2:G1000',
    type: 'list',
    formula1: '"single,double,triple"',
    showDropDown: false,
    showErrorMessage: true,
    errorTitle: 'Invalid Lesson Type',
    error: 'Must be: single, double, or triple.',
    errorStyle: 'stop'
  },
  {
    sqref: 'H2:H1000',
    type: 'whole',
    operator: 'between',
    formula1: '1',
    formula2: '4',
    showErrorMessage: true,
    errorTitle: 'Invalid Sessions Per Week',
    error: 'Must be a whole number between 1 and 4.',
    errorStyle: 'stop'
  }
];

XLSX.utils.book_append_sheet(workbook, templateSheet, 'Subjects Import');

// ── Sheet 2: Departments reference list ──────────────────────────────────
const deptSheet = XLSX.utils.aoa_to_sheet([
  ['Department Name', 'Code'],
  ...departments.map(d => [d.name, d.code])
]);

deptSheet['!cols'] = [{ wch: 35 }, { wch: 12 }];

XLSX.utils.book_append_sheet(workbook, deptSheet, 'Departments');

    // ── Write workbook to buffer ──────────────────────────────────────────────
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="subjects_import_template.xlsx"',
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error) {
    console.error('Error generating template:', error);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}