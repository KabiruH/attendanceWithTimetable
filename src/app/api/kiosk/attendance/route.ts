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
  CHECK_IN_START: 7,   // 7 AM Nairobi
  WORK_START: 9,       // 9 AM Nairobi (late threshold)
  WORK_END: 18,        // 6 PM Nairobi (auto checkout)
};

// ── Single attendance record ───────────────────────────────────────────────────

async function processAttendance(
  user_id: number,
  action: 'check-in' | 'check-out',
  method: 'fingerprint' | 'nfc',
  device: { id: number; device_name: string; device_uuid: string },
  recordedAt?: Date   // for offline queue: the actual time it happened on the tablet
): Promise<{ success: boolean; message?: string; data?: any; error?: string }> {
    
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
          error: `${user.name} has already checked in today`,
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
      return { success: false, error: `${user.name} has not checked in today` };
    }

    if (existingAttendance.check_out_time) {
      return {
        success: false,
        error: `${user.name} has already checked out today`,
        data: { check_out_time: existingAttendance.check_out_time },
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
            record.recorded_at ? new Date(record.recorded_at) : undefined
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
    // Tablet sends: { user_id, action, method }
    const { user_id, action, method } = body;

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
      deviceResult.device!
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

    const formatted = records.map(r => ({
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
      status: r.status,
    }));

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