// app/api/kiosk/attendance/route.ts
// Marks attendance from the kiosk tablet.
// No geofence check — tablet is physically at the institution.
// No JWT session — uses device token for auth.
// Supports offline queue: accepts a batch of queued records when reconnecting.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyDeviceToken } from '@/lib/auth/kiosk-auth';
import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';

// Mirrors the time constraints in your existing attendance route
// Adjusted for Africa/Nairobi (server is UTC-3 offset from your comments)
const TIME_CONSTRAINTS = {
  CHECK_IN_START: 4,   // 7 AM Nairobi
  WORK_START: 5,       // 9 AM Nairobi (late threshold)
  WORK_END: 15,        // 6 PM Nairobi (auto checkout)
};

// Minimum minutes that must pass after check-in before a check-out is allowed.
// Prevents a double-scan from instantly checking someone out.
const MIN_CHECKOUT_GAP_MINUTES = 30;

// The hour (Nairobi) before which an early check-out needs confirmation.
// 17 = 5 PM. (Stored in server-offset terms via TIME_CONSTRAINTS if needed.)
const EARLY_CHECKOUT_HOUR = 14; // 5 PM Nairobi given the -3 server offset

// ── Single attendance record ───────────────────────────────────────────────────

async function processAttendance(
  user_id: number,
  action: 'check-in' | 'check-out',
  method: 'fingerprint' | 'nfc',
  device: { id: number; device_name: string; device_uuid: string },
  recordedAt?: Date,       // for offline queue: the actual time it happened on the tablet
  confirmEarly = false     // set true when the user has confirmed an early check-out
): Promise<{ success: boolean; message?: string; data?: any; error?: string; code?: string }> {

  const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
  const currentTime = recordedAt || nowInKenya.toJSDate();
  const currentDate = DateTime.fromJSDate(currentTime)
    .setZone('Africa/Nairobi')
    .toFormat('yyyy-MM-dd');

  // ── Verify user exists ──────────────────────────────────────────────────────
  const user = await db.users.findUnique({
    where: { id: user_id },
    select: { id: true, name: true, is_active: true, is_blocked: true },
  });

  if (!user || !user.is_active || user.is_blocked) {
    return { success: false, error: 'User not found or inactive' };
  }

  // ── Handle CHECK-IN ────────────────────────────────────────────────────────
  if (action === 'check-in') {
    if (currentTime.getHours() < TIME_CONSTRAINTS.CHECK_IN_START) {
      return { success: false, error: 'Check-in not allowed before 7 AM' };
    }

    if (currentTime.getHours() >= TIME_CONSTRAINTS.WORK_END) {
      return { success: false, error: 'Check-in not allowed after 6 PM' };
    }

    const existingAttendance = await db.attendance.findFirst({
      where: { employee_id: user_id, date: new Date(currentDate) },
    });

    const workStart = new Date(currentTime);
    workStart.setHours(TIME_CONSTRAINTS.WORK_START, 0, 0, 0);
    const status = currentTime > workStart ? 'Late' : 'Present';

    const sessionEntry = {
      check_in: currentTime,
      check_out: null,
      metadata: {
        type: 'kiosk',
        method,                        // 'fingerprint' or 'nfc'
        device_id: device.id,
        device_name: device.device_name,
      },
    };

    if (existingAttendance) {
      // Already has a record today
      if (existingAttendance.check_in_time) {
        return {
          success: false,
          code: 'ALREADY_CHECKED_IN',
          error: `${user.name}, you already checked in today`,
          data: {
            check_in_time: existingAttendance.check_in_time,
            status: existingAttendance.status,
          },
        };
      }

      // Record exists (from auto-create) but no check-in yet
      const existingSessions = (existingAttendance.sessions as any[]) || [];
      existingSessions.push(sessionEntry);

      const updated = await db.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          check_in_time: currentTime,
          status,
          sessions: existingSessions as unknown as Prisma.JsonArray,
        },
      });

      return {
        success: true,
        code: 'CHECKED_IN',
        message: status === 'Late'
          ? `Welcome ${user.name}. You are late.`
          : `Welcome ${user.name}!`,
        data: { ...updated, user_name: user.name, status },
      };
    }

    // No record today — create fresh
    const created = await db.attendance.create({
      data: {
        employee_id: user_id,
        date: new Date(currentDate),
        check_in_time: currentTime,
        status,
        sessions: [sessionEntry] as unknown as Prisma.JsonArray,
      },
    });

    // Log biometric action
    await db.biometriclogs.create({
      data: {
        user_id,
        action: 'check_in',
        status: 'success',
        ip_address: 'kiosk',
        user_agent: `TAMS-Kiosk/${device.device_name}`,
        details: { method, device_id: device.id, attendance_id: created.id },
      },
    }).catch(() => {}); // non-blocking

    return {
      success: true,
      code: 'CHECKED_IN',
      message: status === 'Late'
        ? `Welcome ${user.name}. You are late.`
        : `Welcome ${user.name}!`,
      data: { ...created, user_name: user.name, status },
    };
  }

  // ── Handle CHECK-OUT ───────────────────────────────────────────────────────
  if (action === 'check-out') {
    const existingAttendance = await db.attendance.findFirst({
      where: { employee_id: user_id, date: new Date(currentDate) },
    });

    if (!existingAttendance || !existingAttendance.check_in_time) {
      return {
        success: false,
        code: 'NOT_CHECKED_IN',
        error: `${user.name}, you have not checked in today`,
      };
    }

    if (existingAttendance.check_out_time) {
      return {
        success: false,
        code: 'ALREADY_CHECKED_OUT',
        error: `${user.name}, you already checked out today`,
        data: { check_out_time: existingAttendance.check_out_time },
      };
    }

    // ── 30-minute guard: block checkout too soon after check-in ───────────────
    const checkInTime = DateTime.fromJSDate(existingAttendance.check_in_time);
    const nowTime = DateTime.fromJSDate(currentTime);
    const minutesSinceCheckIn = nowTime.diff(checkInTime, 'minutes').minutes;

    if (minutesSinceCheckIn < MIN_CHECKOUT_GAP_MINUTES) {
      const checkInLabel = checkInTime
        .setZone('Africa/Nairobi')
        .toFormat('h:mm a');
      const waitMore = Math.ceil(MIN_CHECKOUT_GAP_MINUTES - minutesSinceCheckIn);
      return {
        success: false,
        code: 'TOO_SOON',
        error: `${user.name}, you checked in at ${checkInLabel}. You can check out in about ${waitMore} min.`,
        data: {
          check_in_time: existingAttendance.check_in_time,
          minutes_since_check_in: Math.floor(minutesSinceCheckIn),
        },
      };
    }

    // ── Early check-out confirmation (before configured hour) ─────────────────
    // If it's before the early-checkout hour and the user hasn't confirmed,
    // ask the tablet to confirm rather than checking out immediately.
    const isEarly = currentTime.getHours() < EARLY_CHECKOUT_HOUR;
    if (isEarly && !confirmEarly && !recordedAt) {
      // recordedAt present = offline-queued, already committed → don't re-prompt
      return {
        success: false,
        code: 'CONFIRM_EARLY_CHECKOUT',
        error: `${user.name}, it's before 5 PM. Confirm early check-out?`,
        data: { check_in_time: existingAttendance.check_in_time },
      };
    }

    const existingSessions = (existingAttendance.sessions as any[]) || [];
    const activeSession = existingSessions.find(s => s.check_in && !s.check_out);

    if (activeSession) {
      activeSession.check_out = currentTime;
      activeSession.checkout_metadata = {
        method,
        device_id: device.id,
        device_name: device.device_name,
      };
    }

    const updated = await db.attendance.update({
      where: { id: existingAttendance.id },
      data: {
        check_out_time: currentTime,
        sessions: existingSessions as unknown as Prisma.JsonArray,
      },
    });

    await db.biometriclogs.create({
      data: {
        user_id,
        action: 'check_out',
        status: 'success',
        ip_address: 'kiosk',
        user_agent: `TAMS-Kiosk/${device.device_name}`,
        details: { method, device_id: device.id, attendance_id: updated.id },
      },
    }).catch(() => {});

    return {
      success: true,
      code: 'CHECKED_OUT',
      message: `Goodbye ${user.name}. Checked out successfully.`,
      data: { ...updated, user_name: user.name },
    };
  }

  return { success: false, error: 'Invalid action' };
}

// ── POST: single or batched attendance ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const deviceResult = await verifyDeviceToken(request);
    if (!deviceResult.success) {
      return NextResponse.json(
        { success: false, error: deviceResult.error },
        { status: 401 }
      );
    }

    const body = await request.json();

    // ── Batch mode (offline queue sync) ────────────────────────────────────────
    // Tablet sends: { batch: [{ user_id, action, method, recorded_at }, ...] }
    if (body.batch && Array.isArray(body.batch)) {
      const results = await Promise.allSettled(
        body.batch.map((record: any) =>
          processAttendance(
            record.user_id,
            record.action,
            record.method,
            deviceResult.device!,
            record.recorded_at ? new Date(record.recorded_at) : undefined,
            true   // queued records are already user-confirmed; don't re-prompt
          )
        )
      );

      const processed = results.map((result, index) => ({
        record: body.batch[index],
        ...(result.status === 'fulfilled'
          ? result.value
          : { success: false, error: 'Processing failed' }),
      }));

      return NextResponse.json({
        success: true,
        processed_at: new Date().toISOString(),
        results: processed,
        summary: {
          total: processed.length,
          succeeded: processed.filter(r => r.success).length,
          failed: processed.filter(r => !r.success).length,
        },
      });
    }

    // ── Single mode (live check-in/out) ────────────────────────────────────────
    // Tablet sends: { user_id, action, method, confirm_early? }
    const { user_id, action, method, confirm_early } = body;

    if (!user_id || !action || !method) {
      return NextResponse.json(
        { success: false, error: 'user_id, action, and method are required' },
        { status: 400 }
      );
    }

    if (!['check-in', 'check-out'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be check-in or check-out' },
        { status: 400 }
      );
    }

    if (!['fingerprint', 'nfc'].includes(method)) {
      return NextResponse.json(
        { success: false, error: 'method must be fingerprint or nfc' },
        { status: 400 }
      );
    }

    const result = await processAttendance(
      user_id,
      action,
      method,
      deviceResult.device!,
      undefined,
      confirm_early === true
    );

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    console.error('Kiosk attendance error:', error);
    return NextResponse.json(
      { success: false, error: 'Attendance processing failed' },
      { status: 500 }
    );
  }
}

// ── GET: today's attendance for admin dashboard ────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const deviceResult = await verifyDeviceToken(request);
    if (!deviceResult.success) {
      return NextResponse.json(
        { success: false, error: deviceResult.error },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam || DateTime.now().setZone('Africa/Nairobi').toFormat('yyyy-MM-dd');

    const records = await db.attendance.findMany({
      where: {
        date: new Date(targetDate),
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            id_number: true,
            role: true,
            department: true,
            employees: {
              select: { passport_photo: true },
            },
          },
        },
      },
      orderBy: { check_in_time: 'asc' },
    });

    const formatted = records.map(r => {
      // Pull the check-in/out method from the sessions JSON so the admin
      // view can show HOW each person checked in (fingerprint vs nfc).
      const sessions = (r.sessions as any[]) || [];
      const firstSession = sessions[0] || {};
      const checkInMethod = firstSession?.metadata?.method || null;
      const checkOutMethod = firstSession?.checkout_metadata?.method || null;

      return {
        id: r.id,
        user_id: r.users.id,
        user_name: r.users.name,
        user_id_number: r.users.id_number,
        user_role: r.users.role,
        user_department: r.users.department,
        passport_photo: r.users.employees?.passport_photo || null,
        date: r.date.toISOString().split('T')[0],
        check_in_time: r.check_in_time?.toISOString() || null,
        check_out_time: r.check_out_time?.toISOString() || null,
        check_in_method: checkInMethod,      // 'fingerprint' | 'nfc' | null
        check_out_method: checkOutMethod,    // 'fingerprint' | 'nfc' | null
        status: r.status,
      };
    });

    const summary = {
      total: formatted.length,
      present: formatted.filter(r => r.status === 'Present').length,
      late: formatted.filter(r => r.status === 'Late').length,
      checked_out: formatted.filter(r => r.check_out_time).length,
      still_in: formatted.filter(r => r.check_in_time && !r.check_out_time).length,
    };

    return NextResponse.json({
      success: true,
      date: targetDate,
      summary,
      data: formatted,
    });
  } catch (error) {
    console.error('Kiosk attendance GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attendance' },
      { status: 500 }
    );
  }
}