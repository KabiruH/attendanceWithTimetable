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

    // When include_slots requested, return lookup data so the UI can render
    // subject names, room names, session group info etc. without extra round-trips.
    if (includeSlots) {
      const allSlots: any[] = drafts.flatMap(d =>
        Array.isArray(d.slots_json) ? d.slots_json as any[] : []
      );

      const subjectIds = [...new Set(allSlots.map(s => s.subject_id))];
      const classIds   = [...new Set(allSlots.map(s => s.class_id))];
      const roomIds    = [...new Set(allSlots.map(s => s.room_id))];
      const trainerIds = [...new Set(allSlots.map(s => s.employee_id))];
      const periodIds  = [...new Set(allSlots.map(s => s.lesson_period_id))];

      // ── Fetch subjects with lesson_type so UI knows double/triple ───────────
      // lesson_type comes from classsubjects (our source of truth) but for
      // display purposes we fetch it from subjects as the default. The actual
      // block type per slot can be inferred from session_group_id group size.
      const [subjects, classes, rooms, trainers, periods] = await Promise.all([
        db.subjects.findMany({
          where: { id: { in: subjectIds } },
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            lesson_type: true,       // ← needed for double/triple display
            sessions_per_week: true, // ← needed for coverage calculation
          }
        }),
        db.classes.findMany({
          where: { id: { in: classIds } },
          select: { id: true, name: true, code: true }
        }),
        db.rooms.findMany({
          where: { id: { in: roomIds } },
          select: { id: true, name: true }
        }),
        db.users.findMany({
          where: { id: { in: trainerIds } },
          select: { id: true, name: true }
        }),
        db.lessonperiods.findMany({
          where: { id: { in: periodIds } },
          select: {
            id: true,
            name: true,
            start_time: true,
            end_time: true,
            duration: true, // ← needed for span height calculation
          }
        }),
      ]);

      // ── Build session group metadata ────────────────────────────────────────
      // For each session_group_id, record how many slots it spans and which
      // period IDs are involved. This lets the UI know a group is double (2)
      // or triple (3) without having to count slots client-side.
      const sessionGroupMeta = new Map<string, {
        span: number;
        period_ids: number[];
        day: number;
        class_id: number;
        subject_id: number;
      }>();

      allSlots.forEach(slot => {
        if (!slot.session_group_id) return;
        // Key by group+day+class so multi-class combos are tracked separately
        const key = `${slot.session_group_id}-${slot.day_of_week}-${slot.class_id}`;
        const existing = sessionGroupMeta.get(key);
        if (existing) {
          if (!existing.period_ids.includes(slot.lesson_period_id)) {
            existing.period_ids.push(slot.lesson_period_id);
            existing.span = existing.period_ids.length;
          }
        } else {
          sessionGroupMeta.set(key, {
            span: 1,
            period_ids: [slot.lesson_period_id],
            day: slot.day_of_week,
            class_id: slot.class_id,
            subject_id: slot.subject_id,
          });
        }
      });

      response.subjects = subjects;
      response.classes  = classes;
      response.rooms    = rooms;
      response.trainers = trainers;
      response.periods  = periods;
      // Send as array for easy lookup on the frontend
      response.session_groups = Array.from(sessionGroupMeta.entries()).map(([key, meta]) => ({
        key,
        group_id: key.split('-')[0],
        ...meta,
      }));
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching drafts:', error);
    return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 });
  }
}

// ─── POST /api/timetable/drafts ───────────────────────────────────────────────
// Confirms one draft: writes its slots to timetableslots, deletes all drafts
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

    const draft = await db.timetabledrafts.findUnique({
      where: { id: draft_id },
      include: { terms: true }
    });

    if (!draft) {
      return NextResponse.json({
        error: 'Draft not found. It may have already been selected or discarded.'
      }, { status: 404 });
    }

    const term_id = draft.term_id;
    const rawSlots = draft.slots_json as any[];

    if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
      return NextResponse.json({ error: 'Draft contains no slots.' }, { status: 400 });
    }

    // Safety check: don't overwrite a confirmed timetable
  const draftSubjectIds = [...new Set(rawSlots.map((s: any) => s.subject_id as number))];
const existingSlots = await db.timetableslots.count({
  where: {
    term_id,
    subject_id: { in: draftSubjectIds }
  }
});
if (existingSlots > 0) {
  return NextResponse.json(
    {
      error: 'Slots for these subjects already exist in the confirmed timetable. ' +
             'Use regenerate to replace them.'
    },
    { status: 409 }
  );
}

    // ── Normalise slots before writing ────────────────────────────────────────
    // The slots_json was produced by the generator which uses classsubjects as
    // the source of truth for sessions_per_week and lesson_type. Ensure that
    // combined_class_ids (a JSON array field) is correctly serialized, and that
    // any undefined optional fields are stripped so createMany doesn't fail.
    const slots = rawSlots.map(slot => ({
      id:                slot.id,
      term_id:           slot.term_id,
      class_id:          slot.class_id,
      subject_id:        slot.subject_id,
      employee_id:       slot.employee_id,
      room_id:           slot.room_id,
      lesson_period_id:  slot.lesson_period_id,
      day_of_week:       slot.day_of_week,
      status:            slot.status ?? 'scheduled',
      is_online_session: slot.is_online_session ?? false,
      is_room_fallback:  slot.is_room_fallback ?? false, 
      created_at:        slot.created_at ? new Date(slot.created_at) : new Date(),
      updated_at:        new Date(),
      // Optional fields — only include if present
      ...(slot.session_group_id   ? { session_group_id: slot.session_group_id }     : {}),
      ...(slot.combined_class_ids ? { combined_class_ids: slot.combined_class_ids } : {}),
    }));

    const draftDepartments = [...new Set(
  rawSlots
    .map((s: any) => s.subject_department)
    .filter(Boolean)
)] as string[];

await db.$transaction([
  db.timetableslots.createMany({ data: slots }),
  db.timetabledrafts.deleteMany({ where: { term_id } })
]);

// ← replaces the existing return at the bottom
return NextResponse.json({
  success: true,
  message: draftDepartments.length === 1
    ? `${draftDepartments[0]} timetable confirmed for ${draft.terms.name}. ${slots.length} slots created.`
    : `Timetable confirmed for ${draft.terms.name}. ${slots.length} slots created.`,
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