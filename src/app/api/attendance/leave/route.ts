// app/api/attendance/leave/route.ts
// Admin-managed leave & official duty.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyMobileJWT } from '@/lib/auth/mobile-jwt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// EAT time helpers — same convention as the attendance routes
// ─────────────────────────────────────────────────────────────────────────────
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function todayEAT(): Date {
  const eatNow = new Date(Date.now() + EAT_OFFSET_MS);
  return new Date(eatNow.toISOString().split('T')[0]); // midnight UTC of EAT date
}

// Human-readable label written into attendance.status (must fit VarChar(10))
const STATUS_LABELS: Record<string, string> = {
  official_duty: 'On Duty',
  leave: 'Leave',
};
const LEAVE_STATUS_VALUES = Object.values(STATUS_LABELS); // ['On Duty', 'Leave']

const MAX_LEAVE_DAYS = 31;

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const grantLeaveSchema = z.object({
  user_id: z.number().int().positive(),
  type: z.enum(['official_duty', 'leave']),
  start_date: dateString,
  end_date: dateString,
  reason: z.string().max(500).optional(),
});

const endLeaveSchema = z.object({
  leave_id: z.number().int().positive(),
  action: z.literal('end'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth — same dual pattern as the class-checkin route
// ─────────────────────────────────────────────────────────────────────────────
async function getAuthenticatedUser(req: NextRequest): Promise<{
  id: number;
  name: string;
  role: string;
}> {
  const token = req.cookies.get('token')?.value;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
      const user = await db.users.findUnique({
        where: { id: decoded.userId },
        select: { id: true, name: true, role: true, is_active: true },
      });
      if (user && user.is_active) return user;
    } catch {
      // fall through to mobile JWT
    }
  }

  try {
    const mobileAuth = await verifyMobileJWT(req);
    if (mobileAuth.success && mobileAuth.payload) {
      const user = await db.users.findUnique({
        where: { id: mobileAuth.payload.userId },
        select: { id: true, name: true, role: true, is_active: true },
      });
      if (user && user.is_active) return user;
    }
  } catch {
    // no valid auth
  }

  throw new Error('No valid authentication method provided');
}

// Every calendar date in [start, end], inclusive (dates are midnight-UTC Date objects)
function datesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const DAY = 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    dates.push(new Date(t));
  }
  return dates;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — list leaves (+ users for the admin form)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    const isAdmin = user.role === 'admin';

    const leaves = await db.leaverecords.findMany({
      where: isAdmin ? {} : { user_id: user.id },
      include: {
        users: { select: { id: true, name: true, department: true } },
        granted_by: { select: { id: true, name: true } },
      },
      orderBy: [{ start_date: 'desc' }],
      take: 200,
    });

    // Active users for the grant form (admin only)
    const users = isAdmin
      ? await db.users.findMany({
          where: { is_active: true, role: { not: 'admin' } },
          select: { id: true, name: true, department: true, role: true },
          orderBy: { name: 'asc' },
        })
      : [];

    return NextResponse.json({
      success: true,
      today: todayEAT().toISOString().split('T')[0],
      leaves,
      users,
      isAdmin,
    });
  } catch (error) {
    console.error('Leave GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch leave records' },
      { status: 401 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — grant leave (admin only)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const admin = await getAuthenticatedUser(request);
    if (admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only administrators can grant leave' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = grantLeaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { user_id, type, start_date, end_date, reason } = parsed.data;

    const start = new Date(start_date); // midnight UTC — matches @db.Date convention
    const end = new Date(end_date);

    if (end < start) {
      return NextResponse.json(
        { success: false, error: 'End date cannot be before start date' },
        { status: 400 }
      );
    }

    const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > MAX_LEAVE_DAYS) {
      return NextResponse.json(
        { success: false, error: `Leave cannot exceed ${MAX_LEAVE_DAYS} days (requested ${days})` },
        { status: 400 }
      );
    }

    // Target user must exist and be active
    const targetUser = await db.users.findUnique({
      where: { id: user_id },
      select: { id: true, name: true, is_active: true },
    });
    if (!targetUser || !targetUser.is_active) {
      return NextResponse.json(
        { success: false, error: 'User not found or inactive' },
        { status: 404 }
      );
    }

    // No overlapping active leave for this user
    const overlap = await db.leaverecords.findFirst({
      where: {
        user_id,
        status: 'active',
        start_date: { lte: end },
        end_date: { gte: start },
      },
    });
    if (overlap) {
      return NextResponse.json(
        {
          success: false,
          error: `${targetUser.name} already has active leave overlapping this period (${overlap.start_date.toISOString().split('T')[0]} to ${overlap.end_date.toISOString().split('T')[0]})`,
        },
        { status: 409 }
      );
    }

    const label = STATUS_LABELS[type];

    const leave = await db.leaverecords.create({
      data: {
        user_id,
        type,
        start_date: start,
        end_date: end,
        reason: reason || null,
        created_by: admin.id,
      },
    });

    // Pre-create attendance rows for every date in the range.
    // The unique [employee_id, date] key + skipDuplicates in the auto-absent
    // processor guarantees these are never overwritten with 'Absent'.
    const dates = datesInRange(start, end);
    await db.attendance.createMany({
      data: dates.map(date => ({
        employee_id: user_id,
        date,
        status: label,
        check_in_time: null,
        check_out_time: null,
      })),
      skipDuplicates: true,
    });

    // If a record already existed for a date (e.g. today's auto-created row)
    // and the person has NOT checked in, stamp it with the leave status too.
    await db.attendance.updateMany({
      where: {
        employee_id: user_id,
        date: { gte: start, lte: end },
        check_in_time: null,
        status: { notIn: LEAVE_STATUS_VALUES },
      },
      data: { status: label },
    });

    return NextResponse.json({
      success: true,
      message: `${label === 'On Duty' ? 'Official duty' : 'Leave'} recorded for ${targetUser.name}: ${start_date} to ${end_date} (${days} day${days !== 1 ? 's' : ''})`,
      leave,
    });
  } catch (error) {
    console.error('Leave POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to grant leave' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — end a leave early (admin only)
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAuthenticatedUser(request);
    if (admin.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Only administrators can end leave' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = endLeaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const leave = await db.leaverecords.findUnique({
      where: { id: parsed.data.leave_id },
      include: { users: { select: { name: true } } },
    });

    if (!leave) {
      return NextResponse.json(
        { success: false, error: 'Leave record not found' },
        { status: 404 }
      );
    }
    if (leave.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'This leave has already been ended' },
        { status: 400 }
      );
    }

    const today = todayEAT();

    // Remove untouched leave rows from today forward so check-in reopens
    // immediately. Past leave days remain on record.
    await db.attendance.deleteMany({
      where: {
        employee_id: leave.user_id,
        date: { gte: today, lte: leave.end_date },
        check_in_time: null,
        status: { in: LEAVE_STATUS_VALUES },
      },
    });

    await db.leaverecords.update({
      where: { id: leave.id },
      data: {
        status: 'cancelled',
        cancelled_at: new Date(),
        cancelled_by: admin.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Leave ended for ${leave.users.name}. They can check in from today.`,
    });
  } catch (error) {
    console.error('Leave PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to end leave' },
      { status: 500 }
    );
  }
}