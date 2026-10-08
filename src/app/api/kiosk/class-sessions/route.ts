// app/api/kiosk/class-sessions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db/db';
import { verifyDeviceToken } from '@/lib/auth/kiosk-auth';
import {
  KIOSK_METHODS,
  type KioskMethod,
  buildLessons,
  closeExpiredKioskSessions,
  eatToInstant,
  ensureDailyCheckIn,
  formatEAT,
  getCurrentTerm,
  getEATClock,
  getKioskSettings,
  lessonTimeOn,
  markMissedLessonsAsAbsent,
  scheduledEndInstant,
  toEAT,
} from '@/lib/attendance/kiosk-class-sessions';

const slotInclude = {
  classes: { select: { id: true, name: true, code: true, department: true } },
  subjects: { select: { id: true, name: true, code: true } },
  rooms: { select: { id: true, name: true } },
  lessonperiods: { select: { start_time: true, end_time: true } },
  users: { select: { id: true, name: true } },
} satisfies Prisma.timetableslotsInclude;

// ── GET: lessons open for check-in now ───────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const deviceResult = await verifyDeviceToken(request);
    if (!deviceResult.success) {
      return NextResponse.json({ success: false, error: deviceResult.error }, { status: 401 });
    }

    const clock = getEATClock();

    // Housekeeping first, so the list reflects closed and missed lessons
    await closeExpiredKioskSessions(clock).catch(e => console.error('Kiosk auto-close failed:', e));
    await markMissedLessonsAsAbsent(clock).catch(e => console.error('Kiosk mark-missed failed:', e));

    const term = await getCurrentTerm();
    if (!term) {
      return NextResponse.json({
        success: true,
        data: [],
        departments: [],
        current_time_display: formatEAT(clock.eatNow),
        message: 'No active term',
      });
    }

    const { windowBefore, cutoff } = await getKioskSettings();
    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department')?.trim() || null;
    const q = searchParams.get('q')?.trim().toLowerCase() || '';

    const slots = await db.timetableslots.findMany({
      where: {
        term_id: term.id,
        day_of_week: clock.dayOfWeek,
        status: 'scheduled',
        is_online_session: false,
      },
      include: slotInclude,
    });

    // Every department teaching today, so the filter stays stable through the day
    const departments = Array.from(
      new Set(slots.map(s => s.classes?.department).filter((d): d is string => !!d))
    ).sort();

    const attendance = await db.classattendance.findMany({
      where: { date: clock.currentDate, timetable_slot_id: { in: slots.map(s => s.id) } },
      select: { timetable_slot_id: true, check_in_time: true },
    });
    const checkedInAt = new Map(
      attendance
        .filter(a => a.timetable_slot_id && a.check_in_time)
        .map(a => [a.timetable_slot_id!, a.check_in_time!])
    );

    const now = clock.eatNow.getTime();
    const data = [];

    for (const lesson of buildLessons(slots)) {
      const start = lessonTimeOn(lesson.start, clock.currentDate).getTime();
      const end = lessonTimeOn(lesson.end, clock.currentDate).getTime();
      const opensAt = start - windowBefore * 60_000;
      const closesAt = Math.min(start + cutoff * 60_000, end);

      if (now < opensAt || now >= end) continue;

      const first = lesson.sessions[0].primary;
      const classes = lesson.sessions.map(s => s.primary.classes).filter(Boolean);

      // Checked in if any slot of any class session in the lesson has a check-in
      const checkIn = lesson.sessions
        .flatMap(s => s.siblings.map(x => checkedInAt.get(x.id)))
        .find(Boolean);

      // Only lessons that still need checking in, or are running (for students later)
      if (!checkIn && now > closesAt) continue;

      if (department && !classes.some(c => c!.department === department)) continue;

      if (q) {
        const haystack = [
          first.subjects?.name,
          first.subjects?.code,
          first.users?.name,
          first.rooms?.name,
          ...classes.flatMap(c => [c!.name, c!.code]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) continue;
      }

      data.push({
        timetable_slot_id: first.id,
        trainer: { id: first.employee_id, name: first.users?.name ?? 'Unknown trainer' },
        subject: { name: first.subjects?.name ?? '', code: first.subjects?.code ?? '' },
        classes: classes.map(c => ({ id: c!.id, name: c!.name, code: c!.code, department: c!.department })),
        room: first.rooms?.name ?? null,
        session_span: lesson.sessions[0].siblings.length,   // 1 single, 2 double, 3 triple
        starts_at: eatToInstant(new Date(start)).toISOString(),
        start_time_display: formatEAT(new Date(start)),
        end_time_display: formatEAT(new Date(end)),
        check_in_closes_display: formatEAT(new Date(closesAt)),
        status: checkIn ? 'checked_in' : 'open',
        checked_in_at_display: checkIn ? formatEAT(toEAT(checkIn)) : null,
      });
    }

    data.sort((a, b) =>
      a.status === b.status
        ? a.starts_at.localeCompare(b.starts_at) || a.trainer.name.localeCompare(b.trainer.name)
        : a.status === 'open' ? -1 : 1   // lessons still needing a check-in first
    );

    return NextResponse.json({
      success: true,
      data,
      departments,
      current_time_display: formatEAT(clock.eatNow),
    });
  } catch (error) {
    console.error('Kiosk class-sessions GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load lessons' }, { status: 500 });
  }
}

// ── POST: check a trainer in to a lesson ─────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const deviceResult = await verifyDeviceToken(request);
    if (!deviceResult.success) {
      return NextResponse.json({ success: false, error: deviceResult.error }, { status: 401 });
    }

    const body = await request.json();
    const timetable_slot_id: unknown = body?.timetable_slot_id;
    const trainer_id = Number(body?.trainer_id);
    const method: unknown = body?.method;

    if (typeof timetable_slot_id !== 'string' || !trainer_id || !KIOSK_METHODS.includes(method as KioskMethod)) {
      return NextResponse.json(
        { success: false, error: 'timetable_slot_id, trainer_id and method (fingerprint or card) are required' },
        { status: 400 }
      );
    }

    const clock = getEATClock();
    await closeExpiredKioskSessions(clock).catch(e => console.error('Kiosk auto-close failed:', e));

    const term = await getCurrentTerm();
    if (!term) {
      return NextResponse.json({ success: false, error: 'No active term' }, { status: 400 });
    }

    const slot = await db.timetableslots.findUnique({ where: { id: timetable_slot_id } });
    if (!slot) {
      return NextResponse.json({ success: false, error: 'Lesson not found' }, { status: 404 });
    }
    if (slot.term_id !== term.id || slot.day_of_week !== clock.dayOfWeek || slot.status !== 'scheduled') {
      return NextResponse.json({ success: false, error: 'This lesson is not scheduled for today' }, { status: 400 });
    }
    if (slot.is_online_session) {
      return NextResponse.json({ success: false, error: 'Online lessons are checked in from the mobile app' }, { status: 400 });
    }
    if (slot.employee_id !== trainer_id) {
      return NextResponse.json({ success: false, error: 'This lesson is not assigned to this trainer' }, { status: 403 });
    }

    // Rebuild the whole lesson: doubles/triples and combined classes check in together
    const trainerSlots = await db.timetableslots.findMany({
      where: {
        employee_id: trainer_id,
        term_id: term.id,
        day_of_week: clock.dayOfWeek,
        status: 'scheduled',
        is_online_session: false,
      },
      include: slotInclude,
    });
    const lesson = buildLessons(trainerSlots).find(l =>
      l.sessions.some(s => s.siblings.some(x => x.id === slot.id))
    );
    if (!lesson) {
      return NextResponse.json({ success: false, error: 'Lesson period not found' }, { status: 400 });
    }

    // ── Window ────────────────────────────────────────────────────────────────
    const { windowBefore, cutoff } = await getKioskSettings();
    const start = lessonTimeOn(lesson.start, clock.currentDate).getTime();
    const end = lessonTimeOn(lesson.end, clock.currentDate).getTime();
    const opensAt = start - windowBefore * 60_000;
    const closesAt = Math.min(start + cutoff * 60_000, end);
    const now = clock.eatNow.getTime();

    if (now < opensAt) {
      return NextResponse.json(
        { success: false, error: `Check-in for this lesson opens at ${formatEAT(new Date(opensAt))}` },
        { status: 400 }
      );
    }
    if (now > closesAt) {
      return NextResponse.json(
        { success: false, error: `Check-in for this lesson closed at ${formatEAT(new Date(closesAt))}` },
        { status: 400 }
      );
    }

    const first = lesson.sessions[0].primary;
    const subjectName = first.subjects?.name ?? 'this lesson';
    const trainerName = first.users?.name ?? 'Trainer';
    const lessonSlotIds = lesson.sessions.flatMap(s => s.siblings.map(x => x.id));

    const existing = await db.classattendance.findMany({
      where: { trainer_id, date: clock.currentDate, timetable_slot_id: { in: lessonSlotIds } },
    });
    const rowFor = (siblingIds: string[]) =>
      existing.find(r => r.timetable_slot_id !== null && siblingIds.includes(r.timetable_slot_id));

    if (lesson.sessions.every(s => rowFor(s.siblings.map(x => x.id))?.check_in_time)) {
      return NextResponse.json({
        success: true,
        already_checked_in: true,
        message: `${trainerName} is already checked in to ${subjectName}`,
      });
    }

    // ── Another lesson still open for this trainer ────────────────────────────
    const otherOpen = await db.classattendance.findFirst({
      where: {
        trainer_id,
        date: clock.currentDate,
        check_in_time: { not: null },
        check_out_time: null,
        timetable_slot_id: { notIn: lessonSlotIds },
      },
    });
    if (otherOpen) {
      const otherEnd = await scheduledEndInstant(otherOpen);
      if (otherEnd && clock.utcNow.getTime() >= otherEnd.getTime()) {
        // Its time is up (e.g. a mobile check-in never checked out): close it at its end
        await db.classattendance.update({
          where: { id: otherOpen.id },
          data: { check_out_time: otherEnd, auto_checkout: true },
        });
      } else {
        return NextResponse.json(
          {
            success: false,
            error: `${trainerName} is still checked in to another lesson until ${
              otherEnd ? formatEAT(toEAT(otherEnd)) : 'it ends'
            }`,
          },
          { status: 409 }
        );
      }
    }

    // ── Daily check-in must not be closed already ─────────────────────────────
    const daily = await db.attendance.findFirst({
      where: { employee_id: trainer_id, date: clock.currentDate },
      select: { check_out_time: true },
    });
    if (daily?.check_out_time) {
      return NextResponse.json(
        { success: false, error: `${trainerName} has already checked out of work today` },
        { status: 400 }
      );
    }

    // ── Record ────────────────────────────────────────────────────────────────
    const result = await db.$transaction(async tx => {
      const work = await ensureDailyCheckIn(tx, trainer_id, clock);

      for (const session of lesson.sessions) {
        const row = rowFor(session.siblings.map(x => x.id));
        if (row?.check_in_time) continue;

        const data = {
          check_in_time: clock.utcNow,
          check_out_time: null,
          auto_checkout: false,
          status: 'Present',
          location_verified: true,              // verified in person on the tablet
          is_online_attendance: false,
          check_in_method: method as KioskMethod,
          work_attendance_id: work.attendance.id,
        };

        if (row) {
          // Usually an auto-generated Absent row from the mobile side: upgrade it
          await tx.classattendance.update({ where: { id: row.id }, data });
        } else {
          await tx.classattendance.create({
            data: {
              trainer_id,
              class_id: session.primary.class_id,
              date: clock.currentDate,
              timetable_slot_id: session.primary.id,
              ...data,
            },
          });
        }
      }

      await tx.biometriclogs.create({
        data: {
          user_id: trainer_id,
          action: 'class_checkin',
          status: 'success',
          ip_address: request.headers.get('x-forwarded-for') || 'kiosk',
          user_agent: 'TAMS-Kiosk',
          details: {
            timetable_slot_ids: lessonSlotIds,
            method: method as string,
            daily_check_in_created: work.created,
          },
        },
      });

      return { dailyCreated: work.created };
    });

    return NextResponse.json({
      success: true,
      message: `${trainerName} checked in to ${subjectName}`,
      data: {
        timetable_slot_id: first.id,
        trainer_name: trainerName,
        subject_name: subjectName,
        classes: lesson.sessions.map(s => s.primary.classes?.name).filter(Boolean),
        room: first.rooms?.name ?? null,
        check_in_time_display: formatEAT(clock.eatNow),
        ends_at_display: formatEAT(new Date(end)),
        daily_check_in_created: result.dailyCreated,
      },
    });
  } catch (error) {
    // Two tablets checking in the same lesson at once
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: true, already_checked_in: true, message: 'Already checked in' });
    }
    console.error('Kiosk class-sessions POST error:', error);
    return NextResponse.json({ success: false, error: 'Class check-in failed' }, { status: 500 });
  }
}