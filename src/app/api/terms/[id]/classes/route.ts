// app/api/terms/[id]/classes/route.ts
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

    if (!userId || isNaN(userId)) {
      return { error: 'Invalid user ID in token', status: 401 };
    }

    // Verify user exists and is active
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, department: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) {
      return { error: 'User not found or inactive', status: 401 };
    }

    return { user };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
}

// Helper function to check if user has timetable admin access
function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

/**
 * GET /api/terms/[id]/classes
 * Get all classes assigned to a term
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const params = await context.params;
    const termId = parseInt(params.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    // Verify term exists
    const term = await db.terms.findUnique({
      where: { id: termId }
    });

    if (!term) {
      return NextResponse.json(
        { error: 'Term not found' },
        { status: 404 }
      );
    }

    // Get classes from TermClasses junction table
    const termClasses = await db.termclasses.findMany({
      where: {
        term_id: termId
      },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            department: true,
            duration_hours: true,
            is_active: true
          }
        }
      }
    });

    // Extract just the class data
    const classes = termClasses.map(tc => tc.classes);

    return NextResponse.json({
      success: true,
      data: classes,
      count: classes.length
    });

  } catch (error: any) {
    console.error('Error fetching term classes:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('jwt expired')) {
        return NextResponse.json(
          { error: 'Token expired' },
          { status: 401 }
        );
      }
      if (error.message.includes('invalid token')) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch term classes',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/terms/[id]/classes
 * Assign classes to a term - classes CAN be assigned to multiple terms
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;

    // Check if user is admin or timetable admin
    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const params = await context.params;
    const termId = parseInt(params.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { class_ids } = body;

    if (!Array.isArray(class_ids)) {
      return NextResponse.json(
        { error: 'class_ids must be an array' },
        { status: 400 }
      );
    }

    // Check for duplicate class IDs in the request
    const uniqueClassIds = [...new Set(class_ids)];
    if (uniqueClassIds.length !== class_ids.length) {
      const duplicates = class_ids.filter((id, index) => class_ids.indexOf(id) !== index);
      return NextResponse.json(
        { 
          error: 'Cannot assign the same class multiple times to a term',
          duplicate_class_ids: [...new Set(duplicates)]
        },
        { status: 400 }
      );
    }

    // Verify term exists
    const term = await db.terms.findUnique({
      where: { id: termId }
    });

    if (!term) {
      return NextResponse.json(
        { error: 'Term not found' },
        { status: 404 }
      );
    }

    // Verify all classes exist and are active
    if (class_ids.length > 0) {
      const validClasses = await db.classes.findMany({
        where: {
          id: { in: class_ids },
          is_active: true
        }
      });

      if (validClasses.length !== class_ids.length) {
        const foundIds = validClasses.map(c => c.id);
        const invalidIds = class_ids.filter((id: number) => !foundIds.includes(id));
        return NextResponse.json(
          { 
            error: `Some classes not found or inactive`,
            invalid_ids: invalidIds 
          },
          { status: 400 }
        );
      }
    }

    // Delete existing assignments for this term
    await db.termclasses.deleteMany({
      where: { term_id: termId }
    });

    // Create new assignments (classes can be in multiple terms)
    if (class_ids.length > 0) {
      await db.termclasses.createMany({
        data: class_ids.map((class_id: number) => ({
          term_id: termId,
          class_id: class_id,
          assigned_by: user.name
        }))
      });
    }

    return NextResponse.json({
      success: true,
      message: `Successfully assigned ${class_ids.length} classes to ${term.name}`,
      data: {
        term_id: termId,
        term_name: term.name,
        class_count: class_ids.length,
        class_ids: class_ids
      }
    });

  } catch (error: any) {
    console.error('Error assigning classes to term:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('jwt expired')) {
        return NextResponse.json(
          { error: 'Token expired' },
          { status: 401 }
        );
      }
      if (error.message.includes('invalid token')) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to assign classes',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/terms/[id]/classes
 * Remove specific classes from a term or all if no class_ids provided
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { user } = authResult;

    // Check if user is admin or timetable admin
    if (!hasTimetableAdminAccess(user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const params = await context.params;
    const termId = parseInt(params.id);

    if (isNaN(termId)) {
      return NextResponse.json(
        { error: 'Invalid term ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { class_ids } = body;

    // Build where clause
    const whereClause: any = { term_id: termId };
    
    if (class_ids && Array.isArray(class_ids) && class_ids.length > 0) {
      whereClause.class_id = { in: class_ids };
    }

    // Delete the assignments
    const result = await db.termclasses.deleteMany({
      where: whereClause
    });

    return NextResponse.json({
      success: true,
      message: `Removed ${result.count} class assignment(s)`,
      deleted_count: result.count
    });

  } catch (error: any) {
    console.error('Error removing classes from term:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('jwt expired')) {
        return NextResponse.json(
          { error: 'Token expired' },
          { status: 401 }
        );
      }
      if (error.message.includes('invalid token')) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to remove classes',
        details: error.message 
      },
      { status: 500 }
    );
  }
}