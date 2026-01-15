// app/api/attendance/admin-class-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { db } from '@/lib/db/db';
import jwt from 'jsonwebtoken';

// Helper function to verify JWT and get user 
async function getAuthenticatedUser(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    const user = await db.users.findUnique({
      where: { id: decoded.userId || decoded.id },
      select: { id: true, name: true, role: true, is_active: true }
    });

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    // Verify user is admin
    if (user.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }

    return user;
  } catch (error) {
    console.error('Auth error details:', error);
    throw new Error('Invalid authentication token');
  }
}

// Helper function to get subject name for attendance record
async function getSubjectNameForAttendance(timetableSlotId: string | null) {
  if (!timetableSlotId) return null;
  
  try {
    const slot = await db.timetableslots.findUnique({
      where: { id: timetableSlotId },
      include: {
        subjects: {
          select: {
            name: true,
            code: true
          }
        }
      }
    });
    
    return slot?.subjects || null;
  } catch (error) {
    console.error('Error fetching subject:', error);
    return null;
  }
}

// GET - Get all class attendance status for admin dashboard
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    
    // Get current date info in Kenya timezone
    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    const currentDate = nowInKenya.toJSDate().toISOString().split('T')[0];
    

    // Get ALL today's class attendance (not filtered by trainer)
    const todayAttendance = await db.classattendance.findMany({
      where: {
        date: new Date(currentDate)
      },
      include: {
        users: {  // Include the users (trainer) relation
          select: {
            id: true,
            name: true,
            department: true,
            email: true
          }
        },
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            duration_hours: true
          }
        }
      },
      orderBy: {
        check_in_time: 'desc'
      }
    });

    // Enrich today's attendance with subject information
    const enrichedTodayAttendance = await Promise.all(
      todayAttendance.map(async (attendance) => {
        const subject = await getSubjectNameForAttendance(attendance.timetable_slot_id);
        return {
          ...attendance,
          subject
        };
      })
    );

    // Get active term
    const activeTerm = await db.terms.findFirst({
      where: { is_active: true }
    });

    // Get today's schedule from timetable for all trainers
    const todayDayOfWeek = nowInKenya.toJSDate().getDay();
    let todaySchedule: any[] = [];
    
    if (activeTerm) {
      todaySchedule = await db.timetableslots.findMany({
        where: {
          term_id: activeTerm.id,
          day_of_week: todayDayOfWeek,
          status: 'scheduled'
        },
        include: {
          users: {  // Include trainer info
            select: {
              id: true,
              name: true,
              department: true
            }
          },
          classes: {
            select: {
              id: true,
              name: true,
              code: true,
              department: true
            }
          },
          subjects: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          rooms: {
            select: {
              id: true,
              name: true
            }
          },
          lessonperiods: {
            select: {
              id: true,
              name: true,
              start_time: true,
              end_time: true,
              duration: true
            }
          }
        },
        orderBy: {
          lessonperiods: {
            start_time: 'asc'
          }
        }
      });
    }

    // Get currently active sessions (checked in but not checked out)
    const activeClassSessions = enrichedTodayAttendance.filter(attendance => {
      return !attendance.check_out_time;
    });

    return NextResponse.json({
      success: true,
      todayAttendance: enrichedTodayAttendance,
      todaySchedule,
      activeClassSessions,
      activeTerm: activeTerm ? {
        id: activeTerm.id,
        name: activeTerm.name
      } : null
    });

  } catch (error) {
    console.error('=== Error in admin class status API ===');
    console.error('Error:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}