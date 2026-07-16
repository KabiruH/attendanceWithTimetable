// app/api/attendance/leave/route.ts

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

const createLeaveSchema = z.object({
  user_id: z.number().int().positive().optional(), // admins may grant for anyone
  type: z.enum(['official_duty', 'leave']),
  start_date: dateString,
  end_date: dateString,
  reason: z.string().max(500).optional(),
});

const patchLeaveSchema = z.object({
  leave_id: z.number().int().positive(),
  action: z.enum(['end', 'approve', 'reject', 'withdraw', 'update']),
  // update fields
  start_date: dateString.optional(),
  end_date: dateString.optional(),
  type: z.enum(['official_duty', 'leave']).optional(),
  reason: z.string().max(500).optional(),
  // reject note
  review_note: z.string().max(500).optional(),
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

// Every calendar date in [start, end], inclusive (midnight-UTC Date objects)
function datesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const DAY = 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    dates.push(new Date(t));
  }
  return dates;
}

function rangeDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

/** Validate a leave period; returns an error string or null. */
function validatePeriod(start: Date, end: Date): string | null {
  if (end < start) return 'End date cannot be before start date';
  const days = rangeDays(start, end);
  if (days > MAX_LEAVE_DAYS) {
    return `Leave cannot exceed ${MAX_LEAVE_DAYS} days (requested ${days})`;
  }
  return null;
}

/** Overlapping active or pending leave for this user, excluding one record. */
async function findOverlap(userId: number, start: Date, end: Date, excludeId?: number) {
  return db.leaverecords.findFirst({
    where: {
      user_id: userId,
      status: { in: ['active', 'pending'] },
      start_date: { lte: end },
      end_date: { gte: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

/**
 * Create/stamp attendance rows for an active leave range.
 * The unique [employee_id, date] key + skipDuplicates in the auto-absent
 * processor guarantees these are never overwritten with 'Absent'.
 */
async function writeLeaveRows(userId: number, start: Date, end: Date, label: string) {
  await db.attendance.createMany({
    data: datesInRange(start, end).map(date => ({
      employee_id: userId,
      date,
      status: label,
      check_in_time: null,
      check_out_time: null,
    })),
    skipDuplicates: true,
  });

  // Stamp pre-existing rows (e.g. today's auto-created one) that have no check-in
  await db.attendance.updateMany({
    where: {
      employee_id: userId,
      date: { gte: start, lte: end },
      check_in_time: null,
      status: { notIn: LEAVE_STATUS_VALUES },
    },
    data: { status: label },
  });
}

/** Remove untouched leave rows in a range (never touches rows with a check-in). */
async function removeLeaveRows(userId: number, start: Date, end: Date) {
  await db.attendance.deleteMany({
    where: {
      employee_id: userId,
      date: { gte: start, lte: end },
      check_in_time: null,
      status: { in: LEAVE_STATUS_VALUES },
    },
  });
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
      currentUserId: user.id,
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
// POST — admin grants (active) OR employee applies (pending)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const requester = await getAuthenticatedUser(request);
    const isAdmin = requester.role === 'admin';

    const body = await request.json();
    const parsed = createLeaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { type, start_date, end_date, reason } = parsed.data;

    // Employees can only apply for themselves; admins can grant for anyone
    const targetUserId = isAdmin ? (parsed.data.user_id ?? requester.id) : requester.id;

    const start = new Date(start_date); // midnight UTC — matches @db.Date convention
    const end = new Date(end_date);

    const periodError = validatePeriod(start, end);
    if (periodError) {
      return NextResponse.json({ success: false, error: periodError }, { status: 400 });
    }

    // Applications must be for today or later; admins may backdate corrections
    if (!isAdmin && start < todayEAT()) {
      return NextResponse.json(
        { success: false, error: 'Leave applications cannot start in the past' },
        { status: 400 }
      );
    }

    const targetUser = await db.users.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, is_active: true },
    });
    if (!targetUser || !targetUser.is_active) {
      return NextResponse.json(
        { success: false, error: 'User not found or inactive' },
        { status: 404 }
      );
    }

    const overlap = await findOverlap(targetUserId, start, end);
    if (overlap) {
      const which = overlap.status === 'pending' ? 'a pending application' : 'active leave';
      return NextResponse.json(
        {
          success: false,
          error: `${targetUser.name} already has ${which} overlapping this period (${overlap.start_date.toISOString().split('T')[0]} to ${overlap.end_date.toISOString().split('T')[0]})`,
        },
        { status: 409 }
      );
    }

    const status = isAdmin ? 'active' : 'pending';
    const label = STATUS_LABELS[type];

    const leave = await db.leaverecords.create({
      data: {
        user_id: targetUserId,
        type,
        start_date: start,
        end_date: end,
        reason: reason || null,
        status,
        created_by: requester.id,
        ...(isAdmin ? { reviewed_by: requester.id, reviewed_at: new Date() } : {}),
      },
    });

    if (status === 'active') {
      await writeLeaveRows(targetUserId, start, end, label);
    }

    const days = rangeDays(start, end);
    const message = isAdmin
      ? `${label === 'On Duty' ? 'Official duty' : 'Leave'} recorded for ${targetUser.name}: ${start_date} to ${end_date} (${days} day${days !== 1 ? 's' : ''})`
      : `Application submitted: ${start_date} to ${end_date} (${days} day${days !== 1 ? 's' : ''}). Awaiting admin approval.`;

    return NextResponse.json({ success: true, message, leave });
  } catch (error) {
    console.error('Leave POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to submit leave' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — approve / reject / withdraw / update / end
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const requester = await getAuthenticatedUser(request);
    const isAdmin = requester.role === 'admin';

    const body = await request.json();
    const parsed = patchLeaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { leave_id, action } = parsed.data;

    const leave = await db.leaverecords.findUnique({
      where: { id: leave_id },
      include: { users: { select: { id: true, name: true } } },
    });

    if (!leave) {
      return NextResponse.json(
        { success: false, error: 'Leave record not found' },
        { status: 404 }
      );
    }

    // ── APPROVE (admin, pending → active) ───────────────────────────────────
    if (action === 'approve') {
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: 'Only administrators can approve applications' }, { status: 403 });
      }
      if (leave.status !== 'pending') {
        return NextResponse.json({ success: false, error: 'Only pending applications can be approved' }, { status: 400 });
      }

      // Re-check overlap: another leave may have been granted since this was filed
      const overlap = await findOverlap(leave.user_id, leave.start_date, leave.end_date, leave.id);
      if (overlap && overlap.status === 'active') {
        return NextResponse.json(
          { success: false, error: `${leave.users.name} now has active leave overlapping this period. Edit the dates before approving.` },
          { status: 409 }
        );
      }

      await db.leaverecords.update({
        where: { id: leave.id },
        data: { status: 'active', reviewed_by: requester.id, reviewed_at: new Date() },
      });
      await writeLeaveRows(leave.user_id, leave.start_date, leave.end_date, STATUS_LABELS[leave.type]);

      return NextResponse.json({
        success: true,
        message: `Application approved for ${leave.users.name}.`,
      });
    }

    // ── REJECT (admin, pending → rejected) ──────────────────────────────────
    if (action === 'reject') {
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: 'Only administrators can reject applications' }, { status: 403 });
      }
      if (leave.status !== 'pending') {
        return NextResponse.json({ success: false, error: 'Only pending applications can be rejected' }, { status: 400 });
      }

      await db.leaverecords.update({
        where: { id: leave.id },
        data: {
          status: 'rejected',
          reviewed_by: requester.id,
          reviewed_at: new Date(),
          review_note: parsed.data.review_note || null,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Application rejected for ${leave.users.name}.`,
      });
    }

    // ── WITHDRAW (applicant, pending → cancelled) ───────────────────────────
    if (action === 'withdraw') {
      if (leave.user_id !== requester.id) {
        return NextResponse.json({ success: false, error: 'You can only withdraw your own applications' }, { status: 403 });
      }
      if (leave.status !== 'pending') {
        return NextResponse.json({ success: false, error: 'Only pending applications can be withdrawn' }, { status: 400 });
      }

      await db.leaverecords.update({
        where: { id: leave.id },
        data: { status: 'cancelled', cancelled_at: new Date(), cancelled_by: requester.id },
      });

      return NextResponse.json({ success: true, message: 'Application withdrawn.' });
    }

    // ── UPDATE (admin edits dates/type/reason on pending or active) ─────────
    if (action === 'update') {
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: 'Only administrators can edit leave records' }, { status: 403 });
      }
      if (leave.status !== 'pending' && leave.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Only pending or active leave can be edited' }, { status: 400 });
      }

      const newStart = parsed.data.start_date ? new Date(parsed.data.start_date) : leave.start_date;
      const newEnd = parsed.data.end_date ? new Date(parsed.data.end_date) : leave.end_date;
      const newType = parsed.data.type ?? (leave.type as 'official_duty' | 'leave');
      const newReason = parsed.data.reason !== undefined ? parsed.data.reason : leave.reason;

      const periodError = validatePeriod(newStart, newEnd);
      if (periodError) {
        return NextResponse.json({ success: false, error: periodError }, { status: 400 });
      }

      const overlap = await findOverlap(leave.user_id, newStart, newEnd, leave.id);
      if (overlap) {
        return NextResponse.json(
          { success: false, error: `The new dates overlap another ${overlap.status} leave (${overlap.start_date.toISOString().split('T')[0]} to ${overlap.end_date.toISOString().split('T')[0]})` },
          { status: 409 }
        );
      }

      // Reconcile attendance rows only for ACTIVE leave (pending has none):
      // clear untouched leave rows across the old range, rewrite the new range.
      if (leave.status === 'active') {
        await removeLeaveRows(leave.user_id, leave.start_date, leave.end_date);
        await writeLeaveRows(leave.user_id, newStart, newEnd, STATUS_LABELS[newType]);
      }

      await db.leaverecords.update({
        where: { id: leave.id },
        data: {
          start_date: newStart,
          end_date: newEnd,
          type: newType,
          reason: newReason,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Leave updated for ${leave.users.name}: ${newStart.toISOString().split('T')[0]} to ${newEnd.toISOString().split('T')[0]}.`,
      });
    }

    // ── END (admin, active → cancelled from today) ──────────────────────────
    if (action === 'end') {
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: 'Only administrators can end leave' }, { status: 403 });
      }
      if (leave.status !== 'active') {
        return NextResponse.json({ success: false, error: 'Only active leave can be ended' }, { status: 400 });
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
        data: { status: 'cancelled', cancelled_at: new Date(), cancelled_by: requester.id },
      });

      return NextResponse.json({
        success: true,
        message: `Leave ended for ${leave.users.name}. They can check in from today.`,
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Leave PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update leave' },
      { status: 500 }
    );
  }
}