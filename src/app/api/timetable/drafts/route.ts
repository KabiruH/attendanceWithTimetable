// app/api/timetable/drafts/route.ts
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

// ─── GET /api/timetable/drafts?term_id=X&include_slots=true ──────────────────
// Returns all pending drafts for a term.
// When include_slots=true also returns the full slots_json and lookup metadata
// (subjects, classes, rooms, trainers, periods) so the UI can render the grid.
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const term_id = Number(searchParams.get('term_id'));
    const includeSlots = searchParams.get('include_slots') === 'true';

    if (!term_id) {
      return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
    }

    const drafts = await db.timetabledrafts.findMany({
      where: { term_id },
      orderBy: { draft_number: 'asc' },
      include: { users: { select: { id: true, name: true } } }
    });

    if (drafts.length === 0) {
      return NextResponse.json({ has_drafts: false, message: 'No pending drafts for this term.' });
    }

    // Base response — always included
    const draftSummaries = drafts.map(d => ({
      draft_id: d.id,
      draft_number: d.draft_number,
      stats: d.stats_json,
      skipped_assignments: d.skipped_json ?? undefined,
      skipped_count: Array.isArray(d.skipped_json) ? (d.skipped_json as any[]).length : 0,
      ...(includeSlots ? { slots: d.slots_json } : {}),
    }));

    const response: any = {
      has_drafts: true,
      term_id,
      generated_at: drafts[0].created_at,
      generated_by: drafts[0].users.name,
      drafts: draftSummaries,
    };

    // When include_slots requested, also return lookup data so the UI can
    // render subject names, room names etc. without extra round-trips.
    if (includeSlots) {
      // Collect all unique IDs across all drafts
      const allSlots: any[] = drafts.flatMap(d => Array.isArray(d.slots_json) ? d.slots_json as any[] : []);

      const subjectIds = [...new Set(allSlots.map(s => s.subject_id))];
      const classIds   = [...new Set(allSlots.map(s => s.class_id))];
      const roomIds    = [...new Set(allSlots.map(s => s.room_id))];
      const trainerIds = [...new Set(allSlots.map(s => s.employee_id))];
      const periodIds  = [...new Set(allSlots.map(s => s.lesson_period_id))];

      const [subjects, classes, rooms, trainers, periods] = await Promise.all([
        db.subjects.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true, code: true, department: true } }),
        db.classes.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true, code: true } }),
        db.rooms.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } }),
        db.users.findMany({ where: { id: { in: trainerIds } }, select: { id: true, name: true } }),
        db.lessonperiods.findMany({ where: { id: { in: periodIds } }, select: { id: true, name: true, start_time: true, end_time: true } }),
      ]);

      response.subjects = subjects;
      response.classes  = classes;
      response.rooms    = rooms;
      response.trainers = trainers;
      response.periods  = periods;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching drafts:', error);
    return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 });
  }
}

// ─── POST /api/timetable/drafts/select ───────────────────────────────────────
// Confirms one draft: writes its slots to timetableslots, deletes all 3 drafts
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const body = await request.json();
    const { draft_id } = body;

    if (!draft_id || typeof draft_id !== 'number') {
      return NextResponse.json({ error: 'draft_id (number) is required' }, { status: 400 });
    }

    // Fetch the chosen draft
    const draft = await db.timetabledrafts.findUnique({
      where: { id: draft_id },
      include: { terms: true }
    });

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found. It may have already been selected or discarded.' }, { status: 404 });
    }

    const term_id = draft.term_id;
    const slots = draft.slots_json as any[];

    if (!Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'Draft contains no slots.' }, { status: 400 });
    }

    // Safety check: don't overwrite a confirmed timetable
    const existingSlots = await db.timetableslots.count({ where: { term_id } });
    if (existingSlots > 0) {
      return NextResponse.json(
        { error: 'A confirmed timetable already exists for this term. Delete it first before selecting a draft.' },
        { status: 409 }
      );
    }

    // Write the chosen draft's slots into timetableslots + delete all drafts for this term
    await db.$transaction([
      db.timetableslots.createMany({ data: slots }),
      db.timetabledrafts.deleteMany({ where: { term_id } })
    ]);

    console.log(`✅ Draft ${draft_id} (option ${draft.draft_number}) confirmed for term ${term_id}. ${slots.length} slots written.`);

    return NextResponse.json({
      success: true,
      message: `Timetable confirmed for ${draft.terms.name}. ${slots.length} slots created.`,
      term_id,
      slots_created: slots.length
    });
  } catch (error) {
    console.error('Error selecting draft:', error);
    return NextResponse.json(
      { error: 'Failed to confirm draft', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/timetable/drafts?term_id=X ──────────────────────────────────
// Discards all drafts for a term so the user can regenerate from scratch
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const term_id = Number(searchParams.get('term_id'));

    if (!term_id) {
      return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
    }

    const { count } = await db.timetabledrafts.deleteMany({ where: { term_id } });

    return NextResponse.json({
      success: true,
      message: count > 0
        ? `Discarded ${count} draft(s) for term ${term_id}. You can now generate new options.`
        : 'No drafts found for this term.'
    });
  } catch (error) {
    console.error('Error discarding drafts:', error);
    return NextResponse.json({ error: 'Failed to discard drafts' }, { status: 500 });
  }
}