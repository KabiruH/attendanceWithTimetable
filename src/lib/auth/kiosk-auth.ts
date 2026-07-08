// lib/auth/kiosk-auth.ts
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/db';
import { jwtVerify, SignJWT } from 'jose';
import crypto from 'crypto';

const ADMIN_SESSION_SECRET = new TextEncoder().encode(
  process.env.KIOSK_SESSION_SECRET || process.env.JWT_SECRET
);

// How long admin stays logged into kiosk dashboard before auto-logout
const ADMIN_SESSION_DURATION = '8h';

// ─── Device Token ────────────────────────────────────────────────────────────

export function generateDeviceToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export async function verifyDeviceToken(request: NextRequest): Promise<{
  success: boolean;
  device?: { id: number; device_uuid: string; device_name: string; registered_by: number };
  error?: string;
}> {
  const deviceToken = request.headers.get('x-device-token');

  if (!deviceToken) {
    return { success: false, error: 'Missing device token' };
  }

  const device = await db.kiosk_devices.findUnique({
    where: { device_token: deviceToken },
    select: {
      id: true,
      device_uuid: true,
      device_name: true,
      registered_by: true,
      is_active: true,
    },
  });

  if (!device) {
    return { success: false, error: 'Invalid device token' };
  }

  if (!device.is_active) {
    return { success: false, error: 'Device is deactivated' };
  }

  // Update last_seen_at silently - don't await, non-blocking
  db.kiosk_devices.update({
    where: { device_token: deviceToken },
    data: { last_seen_at: new Date() },
  }).catch(() => {});

  return { success: true, device };
}

// ─── Admin Session (short-lived JWT for admin dashboard access) ───────────────

export async function createAdminSession(adminId: number, adminName: string, adminEmail: string): Promise<string> {
  return new SignJWT({ adminId, adminName, adminEmail, type: 'kiosk_admin_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(ADMIN_SESSION_DURATION)
    .setIssuedAt()
    .sign(ADMIN_SESSION_SECRET);
}

export async function verifyAdminSession(request: NextRequest): Promise<{
  success: boolean;
  adminId?: number;
  adminName?: string;
  error?: string;
}> {
  const sessionToken = request.headers.get('x-admin-session');

  if (!sessionToken) {
    return { success: false, error: 'Missing admin session' };
  }

  try {
    const { payload } = await jwtVerify(sessionToken, ADMIN_SESSION_SECRET);
    const { adminId, adminName, type } = payload as any;

    if (type !== 'kiosk_admin_session') {
      return { success: false, error: 'Invalid session type' };
    }

    return { success: true, adminId, adminName };
  } catch {
    return { success: false, error: 'Admin session expired or invalid' };
  }
}

// ─── Combined: device + admin (for admin-only endpoints) ─────────────────────

export async function verifyKioskAdmin(request: NextRequest): Promise<{
  success: boolean;
  device?: { id: number; device_uuid: string; device_name: string; registered_by: number };
  adminId?: number;
  adminName?: string;
  error?: string;
}> {
  const deviceResult = await verifyDeviceToken(request);
  if (!deviceResult.success) return deviceResult;

  const adminResult = await verifyAdminSession(request);
  if (!adminResult.success) return { ...deviceResult, ...adminResult };

  return {
    success: true,
    device: deviceResult.device,
    adminId: adminResult.adminId,
    adminName: adminResult.adminName,
  };
}