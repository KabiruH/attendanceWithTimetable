// app/api/timetable/generate/departments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const term_id = parseInt(searchParams.get('term_id') ?? '');

  if (!term_id) {
    return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
  }

  const assignments = await db.trainersubjectassignments.findMany({
    where: { term_id, is_active: true },
    include: {
      classsubjects: {
        include: {
          subjects: { select: { department: true } }
        }
      }
    }
  });

  const departments = [
    ...new Set(
      assignments
        .map(ta => ta.classsubjects.subjects.department)
        .filter(Boolean)
    )
  ].sort() as string[];

  return NextResponse.json({ departments });
}