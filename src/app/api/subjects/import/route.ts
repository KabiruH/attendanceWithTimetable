// app/api/subjects/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';
import * as XLSX from 'xlsx';

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
      select: { id: true, name: true, role: true, department: true, is_active: true, email: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role, name } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// POST /api/subjects/import - Import subjects from Excel
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

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Read Excel file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'No data found in Excel file' },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      const rowNumber = i + 2; // +2 because Excel rows start at 1 and we have a header row

      const subjectData = {
        name: row['name'] || row['Subject Name'] || row['subject_name'],
        code: row['code'] || row['Subject Code'] || row['subject_code'],
        department: row['department'] || row['Department'],
        credit_hours: row['credit_hours'] || row['Credit Hours'] || row['credit hours'] || null,
        description: row['description'] || row['Description'] || null,
      };

      // Validate required fields
      if (!subjectData.name || !subjectData.code || !subjectData.department) {
        errors.push(
          `Row ${rowNumber}: Missing required fields - ` +
          `Name: ${subjectData.name || 'missing'}, ` +
          `Code: ${subjectData.code || 'missing'}, ` +
          `Department: ${subjectData.department || 'missing'}`
        );
        continue;
      }

      try {
        // Check if subject already exists
        const existingSubject = await db.subjects.findUnique({
          where: { code: subjectData.code.toString().toUpperCase().trim() },
        });

        if (existingSubject) {
          // Update existing subject
          await db.subjects.update({
            where: { code: subjectData.code.toString().toUpperCase().trim() },
            data: {
              name: subjectData.name,
              department: subjectData.department,
              credit_hours: subjectData.credit_hours ? parseInt(subjectData.credit_hours.toString()) : null,
              description: subjectData.description,
              updated_at: new Date(),
            },
          });
          updated++;
        } else {
          // Create new subject

          const now = new Date();
          await db.subjects.create({
            data: {
              name: subjectData.name,
              code: subjectData.code.toString().toUpperCase().trim(),
              department: subjectData.department,
              credit_hours: subjectData.credit_hours ? parseInt(subjectData.credit_hours.toString()) : null,
              description: subjectData.description,
              is_active: true,
              created_by: user.email || user.name,
              updated_at: now
            },
          });
          imported++;
        }

      } catch (error: any) {
        console.error(`Error processing row ${rowNumber}:`, error);
        errors.push(`Row ${rowNumber}: ${error.message || 'Failed to process'}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      total: imported + updated,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully processed ${imported + updated} subjects. ${imported} new, ${updated} updated.`
    });
  } catch (error: any) {
    console.error('Error importing subjects:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import subjects' },
      { status: 500 }
    );
  }
}