// app/api/kiosk/users/route.ts
// Search users from TAMS DB for enrollment.
// Admin-only endpoint — requires device token + admin session.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyKioskAdmin } from '@/lib/auth/kiosk-auth';

export async function GET(request: NextRequest) {
  try {
    // ── Verify device + admin session ─────────────────────────────────────────
    const auth = await verifyKioskAdmin(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const role = searchParams.get('role') || undefined; // filter by role if needed

    // ── Build search query ────────────────────────────────────────────────────
    const whereClause: any = {
      is_active: true,
      ...(role && { role }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { id_number: { contains: search } },
          { phone_number: { contains: search } },
        ],
      }),
    };

    const users = await db.users.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        id_number: true,
        role: true,
        department: true,
        gender: true,
        phone_number: true,
        employees: {
          select: {
            passport_photo: true,
            email: true,
          },
        },
        // Check if they already have an active biometric enrollment
        biometricenrollments: {
          where: { is_active: true },
          select: { id: true, enrolled_at: true },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
      take: 50, // cap results to keep response fast
    });

    const transformed = users.map(user => ({
      id: user.id,
      name: user.name,
      id_number: user.id_number,
      role: user.role,
      department: user.department,
      gender: user.gender,
      phone_number: user.phone_number,
      email: user.employees?.email || null,
      passport_photo: user.employees?.passport_photo || null,
      is_enrolled: user.biometricenrollments.length > 0,
      enrolled_at: user.biometricenrollments[0]?.enrolled_at || null,
    }));

    return NextResponse.json({
      success: true,
      data: transformed,
      count: transformed.length,
    });
  } catch (error) {
    console.error('Kiosk users fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}