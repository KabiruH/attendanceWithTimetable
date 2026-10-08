// app/api/kiosk/enroll/route.ts
// Saves a fingerprint template (and optionally NFC card ID) for a user.
// Fingerprints go in biometricenrollments; the card lives on users.nfc_card_id (unique).
// Admin-only — requires device token + admin session.

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db/db';
import { verifyKioskAdmin } from '@/lib/auth/kiosk-auth';

export async function POST(request: NextRequest) {
  try {
    // ── Verify device + admin session ─────────────────────────────────────────
    const auth = await verifyKioskAdmin(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { user_id, template_string } = body;
    // Normalise so "04a2b9" and "04A2B9" can never count as different cards
    const nfc_card_id: string | null =
      typeof body.nfc_card_id === 'string' && body.nfc_card_id.trim()
        ? body.nfc_card_id.trim().toUpperCase()
        : null;

    if (!user_id || !template_string) {
      return NextResponse.json(
        { success: false, error: 'user_id and template_string are required' },
        { status: 400 }
      );
    }

    // ── Verify user exists ────────────────────────────────────────────────────
    const user = await db.users.findUnique({
      where: { id: user_id },
      select: { id: true, name: true, is_active: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.is_active) {
      return NextResponse.json(
        { success: false, error: 'Cannot enroll an inactive user' },
        { status: 400 }
      );
    }

    // ── Refuse a card that already belongs to someone else ────────────────────
    if (nfc_card_id) {
      const owner = await db.users.findFirst({
        where: { nfc_card_id, id: { not: user_id } },
        select: { name: true },
      });
      if (owner) {
        return NextResponse.json(
          {
            success: false,
            error: `This card is already registered to ${owner.name}. Use a different card.`,
          },
          { status: 409 }
        );
      }
    }

    // ── Replace enrollment and set the card together ──────────────────────────
    const enrollment = await db.$transaction(async (tx) => {
      // We replace rather than stack — one active fingerprint per user
      await tx.biometricenrollments.updateMany({
        where: { user_id, is_active: true },
        data: { is_active: false },
      });

      const created = await tx.biometricenrollments.create({
        data: {
          user_id,
          biometric_hash: template_string,   // the raw ISO8859-1 fingerprint template
          is_active: true,
          device_info: {
            device_id: auth.device!.id,
            device_name: auth.device!.device_name,
            device_uuid: auth.device!.device_uuid,
            enrolled_by_admin_id: auth.adminId,
            nfc_card_id,                      // kept for audit history only
          },
          ip_address: request.headers.get('x-forwarded-for') || 'kiosk',
          user_agent: `TAMS-Kiosk/${auth.device!.device_name}`,
        },
      });

      // Skipping the card step clears any old card, as it did before
      await tx.users.update({
        where: { id: user_id },
        data: { nfc_card_id },
      });

      return created;
    });

    // ── Log the enrollment action ─────────────────────────────────────────────
    await db.biometriclogs.create({
      data: {
        user_id,
        action: 'enroll',
        status: 'success',
        ip_address: request.headers.get('x-forwarded-for') || 'kiosk',
        user_agent: `TAMS-Kiosk/${auth.device!.device_name}`,
        details: {
          enrollment_id: enrollment.id,
          device_id: auth.device!.id,
          enrolled_by: auth.adminId,
          has_nfc: !!nfc_card_id,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `${user.name} enrolled successfully`,
      data: {
        enrollment_id: enrollment.id,
        user_id,
        user_name: user.name,
        enrolled_at: enrollment.enrolled_at,
        has_nfc: !!nfc_card_id,
      },
    });
  } catch (error) {
    // Two enrollments racing for the same card: the unique index catches it
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'This card is already registered to another user.' },
        { status: 409 }
      );
    }
    console.error('Kiosk enroll error:', error);
    return NextResponse.json(
      { success: false, error: 'Enrollment failed' },
      { status: 500 }
    );
  }
}

// ── DELETE: Remove a user's enrollment ────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyKioskAdmin(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const user_id = Number(searchParams.get('user_id'));

    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'user_id is required' },
        { status: 400 }
      );
    }

    await db.$transaction([
      db.biometricenrollments.updateMany({
        where: { user_id, is_active: true },
        data: { is_active: false },
      }),
      // Free the card so it can be issued to someone else
      db.users.update({
        where: { id: user_id },
        data: { nfc_card_id: null },
      }),
    ]);

    await db.biometriclogs.create({
      data: {
        user_id,
        action: 'delete_enrollment',
        status: 'success',
        ip_address: 'kiosk',
        user_agent: `TAMS-Kiosk/${auth.device!.device_name}`,
        details: { deleted_by: auth.adminId, device_id: auth.device!.id },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Enrollment removed successfully',
    });
  } catch (error) {
    console.error('Kiosk delete enrollment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove enrollment' },
      { status: 500 }
    );
  }
}