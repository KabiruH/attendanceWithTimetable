// app/api/kiosk/auth-fingerprint/route.ts
// Fingerprint-based admin login for the kiosk.
// The tablet identifies the user LOCALLY (1:N match against cached templates),
// then sends us the matched user_id. We verify server-side that this user is
// actually an admin before issuing an admin session.
//
// Security model: the tablet proves WHO scanned (via its trusted local match),
// the server proves WHETHER they're allowed admin access. Both must agree.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyDeviceToken, createAdminSession } from '@/lib/auth/kiosk-auth';

export async function POST(request: NextRequest) {
  try {
    // ── Verify this is a registered device ───────────────────────────────────
    const deviceResult = await verifyDeviceToken(request);
    if (!deviceResult.success) {
      return NextResponse.json(
        { success: false, error: deviceResult.error },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { user_id } = body;

    if (!user_id || typeof user_id !== 'number') {
      return NextResponse.json(
        { success: false, error: 'user_id is required' },
        { status: 400 }
      );
    }

    // ── Load the user + their employee record ─────────────────────────────────
    const user = await db.users.findUnique({
      where: { id: user_id },
      select: {
        id: true,
        name: true,
        role: true,
        is_active: true,
        is_blocked: true,
        employees: {
          select: { email: true },
        },
        // Confirm this user actually has an ACTIVE biometric enrollment.
        // Prevents a stale/deleted enrollment from granting access.
        biometricenrollments: {
          where: { is_active: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // ── Authorization checks ──────────────────────────────────────────────────
    if (user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'You do not have admin access' },
        { status: 403 }
      );
    }

    if (!user.is_active || user.is_blocked) {
      return NextResponse.json(
        { success: false, error: 'Your account is inactive or blocked' },
        { status: 403 }
      );
    }

    // The user must have an active enrollment — otherwise the tablet couldn't
    // have matched them anyway, but we double-check server-side.
    if (user.biometricenrollments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No active fingerprint enrollment found' },
        { status: 403 }
      );
    }

    // ── Issue admin session (same token type as password login) ───────────────
    const admin_session = await createAdminSession(
      user.id,
      user.name,
      user.employees?.email || ''
    );

    // ── Log the fingerprint admin login ───────────────────────────────────────
    await db.biometriclogs.create({
      data: {
        user_id: user.id,
        action: 'admin_login_fingerprint',
        status: 'success',
        ip_address: request.headers.get('x-forwarded-for') || 'kiosk',
        user_agent: `TAMS-Kiosk/${deviceResult.device!.device_name}`,
        details: {
          device_id: deviceResult.device!.id,
          method: 'fingerprint',
        },
      },
    }).catch(() => {}); // non-blocking

    return NextResponse.json({
      success: true,
      data: {
        admin_session,
        admin: {
          id: user.id,
          name: user.name,
          email: user.employees?.email || '',
          role: user.role,
        },
        device: {
          id: deviceResult.device!.id,
          name: deviceResult.device!.device_name,
        },
      },
    });
  } catch (error) {
    console.error('Kiosk fingerprint auth error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500 }
    );
  }
}