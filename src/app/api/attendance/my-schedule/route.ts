// app/api/attendance/my-schedule/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { db } from '@/lib/db/db';
import jwt from 'jsonwebtoken';

// Helper function to verify JWT and get user
async function getAuthenticatedUser(req: NextRequest) {
  // Try to get token from cookie (web) or Authorization header (mobile)
  let token = req.cookies.get('token')?.value;
  
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const userId = decoded.userId || decoded.id || decoded.employeeId;
   if (!userId) {
      console.error('JWT payload:', decoded);
      throw new Error('User ID not found in token');
    }
    
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true }
    });

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    console.log('✅ Authenticated user:', user.id, user.name);

    return user;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

// Helper to get week boundaries
function getWeekBoundaries(date: Date) {
  const dayOfWeek = date.getDay();
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  return { startOfWeek, endOfWeek };
}

// GET - Get trainer's schedule
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    
    // Get query parameters
    const view = searchParams.get('view') || 'week'; // week, month, day
    const dateParam = searchParams.get('date'); // ISO date string
    const termId = searchParams.get('term_id');
    const classId = searchParams.get('class_id');
    const subjectId = searchParams.get('subject_id');
    
    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    const targetDate = dateParam ? new Date(dateParam) : nowInKenya.toJSDate();
    
    // Get active term or use specified term
    let activeTerm;
    if (termId) {
      activeTerm = await db.terms.findUnique({
        where: { id: parseInt(termId) }
      });
    } else {
      activeTerm = await db.terms.findFirst({
        where: { is_active: true }
      });
    }
    
    if (!activeTerm) {
      return NextResponse.json({
        success: false,
        error: 'No active term found'
      }, { status: 404 });
    }
    
    // Build timetable query filters
    const timetableFilters: any = {
      employee_id: user.id,
      term_id: activeTerm.id,
      status: 'scheduled'
    };
    
    if (classId) {
      timetableFilters.class_id = parseInt(classId);
    }
    
    if (subjectId) {
      timetableFilters.subject_id = parseInt(subjectId);
    }
    
    // Add day filter based on view
    if (view === 'day') {
      timetableFilters.day_of_week = targetDate.getDay();
    }
    
    // Get timetable slots
    const timetableSlots = await db.timetableslots.findMany({
      where: timetableFilters,
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true,
            duration_hours: true
          }
        },
        subjects: {
          select: {
            id: true,
            name: true,
            code: true,
            department: true
          }
        },
        rooms: {
          select: {
            id: true,
            name: true,
            capacity: true,
            room_type: true
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
      orderBy: [
        { day_of_week: 'asc' },
        { lessonperiods: { start_time: 'asc' } }
      ]
    });
    
    // Get date range for attendance lookup
    let startDate: Date, endDate: Date;
    
    if (view === 'day') {
      startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (view === 'week') {
      const { startOfWeek, endOfWeek } = getWeekBoundaries(targetDate);
      startDate = startOfWeek;
      endDate = endOfWeek;
    } else { // month
      startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    
    // Get attendance records for the date range
    const attendanceRecords = await db.classattendance.findMany({
      where: {
        trainer_id: user.id,
        date: {
          gte: startDate,
          lte: endDate
        },
        timetable_slot_id: {
          in: timetableSlots.map(slot => slot.id)
        }
      },
      select: {
        id: true,
        timetable_slot_id: true,
        date: true,
        check_in_time: true,
        check_out_time: true,
        status: true,
        auto_checkout: true,
        location_verified: true
      }
    });
    
    // Create a map of attendance by slot and date
    const attendanceMap = new Map<string, any>();
    attendanceRecords.forEach(record => {
      const key = `${record.timetable_slot_id}_${record.date.toISOString().split('T')[0]}`;
      attendanceMap.set(key, record);
    });
    
    // Group slots by day for better organization
    const scheduleByDay = timetableSlots.reduce((acc, slot) => {
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][slot.day_of_week];
      
      if (!acc[slot.day_of_week]) {
        acc[slot.day_of_week] = {
          dayOfWeek: slot.day_of_week,
          dayName,
          slots: []
        };
      }
      
      // Calculate dates this slot occurs on within our range
      const slotDates: Date[] = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        if (current.getDay() === slot.day_of_week) {
          slotDates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }
      
      // For each date, add slot with attendance info
      slotDates.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        const attendanceKey = `${slot.id}_${dateStr}`;
        const attendance = attendanceMap.get(attendanceKey);
        
        acc[slot.day_of_week].slots.push({
          ...slot,
          scheduledDate: dateStr,
          attendance,
          hasCheckedIn: !!attendance?.check_in_time,
          hasCheckedOut: !!attendance?.check_out_time,
          isCompleted: !!attendance?.check_out_time,
          isPending: !attendance,
          isInProgress: !!attendance?.check_in_time && !attendance?.check_out_time
        });
      });
      
      return acc;
    }, {} as Record<number, any>);
    
    // Convert to array and sort
    const schedule = Object.values(scheduleByDay).sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek);
    
    // Calculate statistics
    const totalScheduled = timetableSlots.length * 
      (view === 'day' ? 1 : view === 'week' ? 1 : Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const totalCompleted = attendanceRecords.filter(r => r.check_out_time).length;
    const totalPending = totalScheduled - attendanceRecords.length;
    const totalInProgress = attendanceRecords.filter(r => r.check_in_time && !r.check_out_time).length;
    
    return NextResponse.json({
      success: true,
      schedule,
      term: {
        id: activeTerm.id,
        name: activeTerm.name,
        start_date: activeTerm.start_date,
        end_date: activeTerm.end_date
      },
      view,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      statistics: {
        totalScheduled,
        totalCompleted,
        totalPending,
        totalInProgress,
        completionRate: totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}