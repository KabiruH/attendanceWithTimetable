// app/api/timetable-settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

// Helper function to verify authentication
async function verifyAuth() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');

    if (!token) {
      return { error: 'No token found', status: 401 };
    }

    const { payload } = await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );

    const userId = Number(payload.id);
    const role = payload.role as string;

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user: { ...user, id: userId, role } };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// Helper function to check if user has timetable admin access
function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

// GET - Fetch timetable settings
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    // You'll need a settings table in your database
    // For now, return default values or fetch from a settings table
    const settings = await db.timetablesettings.findFirst();

    return NextResponse.json({
      success: true,
      data: settings || {
        allow_admin_assignment: false,
        block_all_subject_selection: false,
      }
    });
  } catch (error) {
    console.error('Error fetching timetable settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PUT - Update timetable settings

export async function PUT(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { 
      allow_admin_assignment, 
      block_all_subject_selection,
      generation_deadline_enabled,          // ADD THIS
      timetable_generation_deadline         // ADD THIS
    } = body;

    const existingSettings = await db.timetablesettings.findFirst();

    let settings;
    if (existingSettings) {
      settings = await db.timetablesettings.update({
        where: { id: existingSettings.id },
        data: {
          allow_admin_assignment: allow_admin_assignment !== undefined 
            ? allow_admin_assignment 
            : existingSettings.allow_admin_assignment,
          block_all_subject_selection: block_all_subject_selection !== undefined 
            ? block_all_subject_selection 
            : existingSettings.block_all_subject_selection,
          generation_deadline_enabled: generation_deadline_enabled !== undefined    // ADD THIS
            ? generation_deadline_enabled 
            : existingSettings.generation_deadline_enabled,
          timetable_generation_deadline: timetable_generation_deadline !== undefined // ADD THIS
            ? timetable_generation_deadline 
            : existingSettings.timetable_generation_deadline,
          updated_at: new Date(),
        }
      });
    } else {
      settings = await db.timetablesettings.create({
        data: {
          allow_admin_assignment: allow_admin_assignment || false,
          block_all_subject_selection: block_all_subject_selection || false,
          generation_deadline_enabled: generation_deadline_enabled || false,     // ADD THIS
          timetable_generation_deadline: timetable_generation_deadline || null,  // ADD THIS
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating timetable settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}