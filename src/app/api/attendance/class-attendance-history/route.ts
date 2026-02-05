// app/api/attendance/class-attendance-history/route.ts
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
    const user = await db.users.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, role: true, is_active: true }
    });

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    return user;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

// Helper function to calculate duration
function calculateDuration(checkIn: Date, checkOut: Date): { hours: number; minutes: number; formatted: string } {
  const diffMs = checkOut.getTime() - checkIn.getTime();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return {
    hours,
    minutes,
    formatted: `${hours}h ${minutes}m`
  };
}

async function markMissedClassesAsAbsent(currentTime: Date) {
  try {
    const currentDate = new Date(currentTime.toISOString().split('T')[0]);
    const dayOfWeek = currentTime.getDay();
    
    const activeTerm = await db.terms.findFirst({
      where: { is_active: true }
    });

    if (!activeTerm) return;

    const settings = await db.timetablesettings.findFirst();
    const lateThreshold = settings?.attendance_late_threshold || 10;

    const todaySlots = await db.timetableslots.findMany({
      where: {
        term_id: activeTerm.id,
        day_of_week: dayOfWeek,
        status: 'scheduled'
      },
      include: {
        lessonperiods: {
          select: {
            start_time: true,
            end_time: true
          }
        }
      }
    });

    for (const slot of todaySlots) {
      if (!slot.lessonperiods) continue;

      const startTime = new Date(slot.lessonperiods.start_time);
      const lessonStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        startTime.getHours(),
        startTime.getMinutes(),
        0
      );

      const checkInWindowClosed = new Date(lessonStart.getTime() + (lateThreshold * 60 * 1000));

      if (currentTime < checkInWindowClosed) continue;

      const existingAttendance = await db.classattendance.findFirst({
        where: {
          trainer_id: slot.employee_id,
          class_id: slot.class_id,
          date: currentDate,
          timetable_slot_id: slot.id
        }
      });

      if (!existingAttendance) {
        await db.classattendance.create({
          data: {
            trainer_id: slot.employee_id,
            class_id: slot.class_id,
            date: currentDate,
            timetable_slot_id: slot.id,
            status: 'Absent',
            location_verified: false,
            is_online_attendance: slot.is_online_session || false,
            // Use undefined instead of null if the schema doesn't allow null
            work_attendance_id: null
          }
        });
      }
    }
  } catch (error) {
    console.error('❌ Error marking absences:', error);
  }
}

// GET - Get class attendance history with filters
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    
    // Get query parameters
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const classId = searchParams.get('class_id');
    const subjectId = searchParams.get('subject_id');
    const status = searchParams.get('status'); // Present, Late, Absent
    const termId = searchParams.get('term_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const trainerId = searchParams.get('trainer_id'); // For admin viewing other trainers
    
    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    
    // ✅ Mark absences before fetching
    await markMissedClassesAsAbsent(nowInKenya.toJSDate());
    
    // Default to current month if no dates provided
    const defaultStartDate = new Date(nowInKenya.year, nowInKenya.month - 1, 1);
    const defaultEndDate = new Date(nowInKenya.year, nowInKenya.month, 0, 23, 59, 59, 999);
    
    // Build filters
    const whereFilters: any = {
      trainer_id: user.role === 'admin' && trainerId ? parseInt(trainerId) : user.id,
      date: {
        gte: startDate ? new Date(startDate) : defaultStartDate,
        lte: endDate ? new Date(endDate) : defaultEndDate
      }
    };
    
    if (classId) {
      whereFilters.class_id = parseInt(classId);
    }
    
    if (status) {
      whereFilters.status = status;
    }
    
    // If subject or term filter, need to filter through timetable slots
    let timetableSlotIds: string[] | undefined;
    
    if (subjectId || termId) {
      const slotFilters: any = {
        employee_id: whereFilters.trainer_id
      };
      
      if (subjectId) {
        slotFilters.subject_id = parseInt(subjectId);
      }
      
      if (termId) {
        slotFilters.term_id = parseInt(termId);
      }
      
      const slots = await db.timetableslots.findMany({
        where: slotFilters,
        select: { id: true }
      });
      
      timetableSlotIds = slots.map(s => s.id);
      
      if (timetableSlotIds.length === 0) {
        // No matching slots, return empty
        return NextResponse.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
          },
          statistics: {
            totalRecords: 0,
            totalHours: '0',
            onTimeCount: 0,
            lateCount: 0,
            absentCount: 0,
            averageDuration: '0'
          }
        });
      }
      
      whereFilters.timetable_slot_id = {
        in: timetableSlotIds
      };
    }
    
    // Get total count for pagination
    const totalCount = await db.classattendance.count({
      where: whereFilters
    });
    
    // Get attendance records with pagination
    const attendanceRecords = await db.classattendance.findMany({
      where: whereFilters,
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
        users: {
          select: {
            id: true,
            name: true,
            department: true
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { check_in_time: 'desc' }
      ],
      skip: (page - 1) * limit,
      take: limit
    });
    
    // Enrich with timetable slot data (subject, room, lesson period)
    const enrichedRecords = await Promise.all(
      attendanceRecords.map(async (record) => {
        let slotData = null;
        
        if (record.timetable_slot_id) {
          const slot = await db.timetableslots.findUnique({
            where: { id: record.timetable_slot_id },
            include: {
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
              },
              terms: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          });
          
          slotData = slot ? {
            subject: slot.subjects,
            room: slot.rooms,
            lessonPeriod: slot.lessonperiods,
            term: slot.terms,
            dayOfWeek: slot.day_of_week
          } : null;
        }
        
        // Calculate duration if checked out
        let duration = null;
        if (record.check_in_time && record.check_out_time) {
          duration = calculateDuration(record.check_in_time, record.check_out_time);
        }
        
        return {
          ...record,
          timetableSlot: slotData,
          duration
        };
      })
    );
    
    // Calculate statistics
    const completedRecords = enrichedRecords.filter(r => r.check_out_time);
    const lateRecords = enrichedRecords.filter(r => r.status === 'Late');
    const onTimeRecords = enrichedRecords.filter(r => r.status === 'Present');
    const absentRecords = enrichedRecords.filter(r => r.status === 'Absent');
    
    let totalMinutes = 0;
    completedRecords.forEach(record => {
      if (record.duration) {
        totalMinutes += record.duration.hours * 60 + record.duration.minutes;
      }
    });
    
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    const totalHoursFormatted = `${totalHours}h ${remainingMinutes}m`;
    
    const averageMinutes = completedRecords.length > 0 ? Math.floor(totalMinutes / completedRecords.length) : 0;
    const avgHours = Math.floor(averageMinutes / 60);
    const avgMinutes = averageMinutes % 60;
    const averageDuration = `${avgHours}h ${avgMinutes}m`;
    
    return NextResponse.json({
      success: true,
      data: enrichedRecords,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      statistics: {
        totalRecords: enrichedRecords.length,
        totalHours: totalHoursFormatted,
        onTimeCount: onTimeRecords.length,
        lateCount: lateRecords.length,
        absentCount: absentRecords.length, // ✅ NEW
        completedCount: completedRecords.length,
        inProgressCount: enrichedRecords.length - completedRecords.length,
        averageDuration,
        onTimePercentage: enrichedRecords.length > 0 ? Math.round((onTimeRecords.length / enrichedRecords.length) * 100) : 0,
        absentPercentage: enrichedRecords.length > 0 ? Math.round((absentRecords.length / enrichedRecords.length) * 100) : 0 // ✅ NEW
      }
    });
    
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch attendance history' },
      { status: 500 }
    );
  }
}