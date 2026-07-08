// app/api/kiosk/register/route.ts
// Called ONCE on first launch of the kiosk app.
// Admin logs in, device gets a permanent token stored on the tablet.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import bcrypt from 'bcryptjs';
import { generateDeviceToken, createAdminSession } from '@/lib/auth/kiosk-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { device_uuid, device_name, admin_email, admin_password } = body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!device_uuid || !device_name || !admin_email || !admin_password) {
      return NextResponse.json(
        { success: false, error: 'device_uuid, device_name, admin_email and admin_password are required' },
        { status: 400 }
      );
    }

    // ── Check if device is already registered ─────────────────────────────────
    const existingDevice = await db.kiosk_devices.findUnique({
      where: { device_uuid },
    });

    if (existingDevice) {
      return NextResponse.json(
        { success: false, error: 'Device is already registered. Use the admin login to access settings.' },
        { status: 409 }
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
        { success: false, error: 'Only admins can register kiosk devices' },
        { status: 403 }
      );
    }

    if (!employee.users.is_active) {
      return NextResponse.json(
        { success: false, error: 'Your account is inactive' },
        { status: 403 }
      );
    }

    // ── Register the device ───────────────────────────────────────────────────
    const device_token = generateDeviceToken();

    const device = await db.kiosk_devices.create({
      data: {
        device_uuid,
        device_name,
        device_token,
        registered_by: employee.users.id,
        last_seen_at: new Date(),
      },
    });

    // ── Create short-lived admin session for immediate dashboard access ────────
    const admin_session = await createAdminSession(
      employee.users.id,
      employee.name,
      employee.email
    );

    return NextResponse.json({
      success: true,
      message: 'Device registered successfully',
      data: {
        device_id: device.id,
        device_name: device.device_name,
        device_token,        // Store this permanently on the tablet - never changes
        admin_session,       // Short-lived - expires in 8h, only for this dashboard session
        admin: {
          id: employee.users.id,
          name: employee.name,
          email: employee.email,
        },
      },
    });
  } catch (error) {
    console.error('Kiosk register error:', error);
    return NextResponse.json(
      { success: false, error: 'Registration failed' },
      { status: 500 }
    );
  }
}