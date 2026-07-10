// app/api/kiosk/settings/route.ts
// Global kiosk settings (currently: NFC check-in enabled/disabled).
//
// GET  — any registered device pulls current settings (called during sync).
//        Device token only, no admin session needed.
// POST — an admin toggles a setting. Requires device token + admin session.
//        Records who changed it and logs the change history.
//
// The settings table is single-row by design (id = 1 always).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyDeviceToken, verifyKioskAdmin } from '@/lib/auth/kiosk-auth';

// Ensures the single settings row exists, returns it.
async function getOrCreateSettings() {
  let settings = await db.kiosk_settings.findFirst({
    orderBy: { id: 'asc' },
  });

  if (!settings) {
    settings = await db.kiosk_settings.create({
      data: { nfc_enabled: true },
    });
  }

  return settings;
}

// ── GET: current settings + recent change log ─────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const deviceResult = await verifyDeviceToken(request);
    if (!deviceResult.success) {
      return NextResponse.json(
        { success: false, error: deviceResult.error },
        { status: 401 }
      );
    }

    const settings = await getOrCreateSettings();

    // Last 5 changes for the admin UI
    const recentLogs = await db.kiosk_settings_log.findMany({
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        id: true,
        setting: true,
        new_value: true,
        changed_by_name: true,
        created_at: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        nfc_enabled: settings.nfc_enabled,
        updated_at: settings.updated_at.toISOString(),
        updated_by_name: settings.updated_by_name,
        recent_changes: recentLogs.map((log) => ({
          setting: log.setting,
          new_value: log.new_value,
          changed_by_name: log.changed_by_name,
          created_at: log.created_at.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('Kiosk settings GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// ── POST: admin toggles a setting ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyKioskAdmin(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { nfc_enabled } = body;

    if (typeof nfc_enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'nfc_enabled (boolean) is required' },
        { status: 400 }
      );
    }

    // Resolve the admin's name for the audit trail
    const admin = await db.users.findUnique({
      where: { id: auth.adminId! },
      select: { id: true, name: true },
    });

    const adminName = admin?.name || auth.adminName || 'Unknown admin';

    const settings = await getOrCreateSettings();

    // Only write + log if the value actually changed
    if (settings.nfc_enabled !== nfc_enabled) {
      await db.kiosk_settings.update({
        where: { id: settings.id },
        data: {
          nfc_enabled,
          updated_by: auth.adminId!,
          updated_by_name: adminName,
        },
      });

      await db.kiosk_settings_log.create({
        data: {
          setting: 'nfc_enabled',
          new_value: nfc_enabled ? 'true' : 'false',
          changed_by: auth.adminId!,
          changed_by_name: adminName,
        },
      });
    }

    // Return the fresh state + recent log
    const recentLogs = await db.kiosk_settings_log.findMany({
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        setting: true,
        new_value: true,
        changed_by_name: true,
        created_at: true,
      },
    });

    const updated = await getOrCreateSettings();

    return NextResponse.json({
      success: true,
      message: nfc_enabled
        ? 'Card check-in enabled'
        : 'Card check-in disabled',
      data: {
        nfc_enabled: updated.nfc_enabled,
        updated_at: updated.updated_at.toISOString(),
        updated_by_name: updated.updated_by_name,
        recent_changes: recentLogs.map((log) => ({
          setting: log.setting,
          new_value: log.new_value,
          changed_by_name: log.changed_by_name,
          created_at: log.created_at.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('Kiosk settings POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}