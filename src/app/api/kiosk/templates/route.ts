// app/api/kiosk/templates/route.ts
// Called by the tablet's background sync worker every N minutes.
// Returns all active fingerprint templates so the tablet can match locally.
// Device token only — no admin session needed (this runs silently in background).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyDeviceToken } from '@/lib/auth/kiosk-auth';

export async function GET(request: NextRequest) {
  try {
    // ── Verify registered device ──────────────────────────────────────────────
    const deviceResult = await verifyDeviceToken(request);
    if (!deviceResult.success) {
      return NextResponse.json(
        { success: false, error: deviceResult.error },
        { status: 401 }
      );
    }

    // ── Optional: only return templates updated since last sync ───────────────
    // The tablet can send ?since=<ISO timestamp> to get only new/changed records
    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');

    const whereClause: any = {
      is_active: true,
      ...(since && {
        updated_at: { gte: new Date(since) },
      }),
    };

    const enrollments = await db.biometricenrollments.findMany({
      where: whereClause,
      select: {
        id: true,
        user_id: true,
        biometric_hash: true,   // the fingerprint template string
        enrolled_at: true,
        updated_at: true,
        device_info: true,       // contains nfc_card_id if any
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
      orderBy: { enrolled_at: 'desc' },
    });

    // ── Shape the response for the tablet ─────────────────────────────────────
    const templates = enrollments.map(e => {
      const deviceInfo = e.device_info as any;
      return {
        enrollment_id: e.id,
        user_id: e.users.id,
        user_name: e.users.name,
        user_id_number: e.users.id_number,
        user_role: e.users.role,
        user_department: e.users.department,
        passport_photo: e.users.employees?.passport_photo || null,
        template_string: e.biometric_hash,          // ISO8859-1 fingerprint template
        nfc_card_id: deviceInfo?.nfc_card_id || null,
        enrolled_at: e.enrolled_at.toISOString(),
        updated_at: e.updated_at.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      synced_at: new Date().toISOString(),
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    console.error('Kiosk templates sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync templates' },
      { status: 500 }
    );
  }
}