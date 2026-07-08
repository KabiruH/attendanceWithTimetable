// app/api/kiosk/auth/route.ts
// Called every time an admin taps the icon and enters credentials to access 
// the admin dashboard. Device must already be registered.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import bcrypt from 'bcryptjs';
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
    const { admin_email, admin_password } = body;

    if (!admin_email || !admin_password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // ── Verify admin credentials ──────────────────────────────────────────────
    const employee = await db.employees.findUnique({
      where: { email: admin_email },
      include: { users: true },
    });

    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(admin_password, employee.password);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (employee.users.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'You do not have admin access' },
        { status: 403 }
      );
    }

    if (!employee.users.is_active || employee.users.is_blocked) {
      return NextResponse.json(
        { success: false, error: 'Your account is inactive or blocked' },
        { status: 403 }
      );
    }

    // ── Issue admin session token ─────────────────────────────────────────────
    const admin_session = await createAdminSession(
      employee.users.id,
      employee.name,
      employee.email
    );

    return NextResponse.json({
      success: true,
      data: {
        admin_session,   // Valid for 8 hours - store in memory, not on disk
        admin: {
          id: employee.users.id,
          name: employee.name,
          email: employee.email,
          role: employee.users.role,
        },
        device: {
          id: deviceResult.device!.id,
          name: deviceResult.device!.device_name,
        },
      },
    });
  } catch (error) {
    console.error('Kiosk auth error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500 }
    );
  }
}