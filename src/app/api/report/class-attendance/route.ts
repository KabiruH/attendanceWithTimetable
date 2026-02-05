// app/api/reports/class-attendance/route.ts
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

// Mark absences before fetching
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
            work_attendance_id: null
          }
        });
      }
    }
  } catch (error) {
    console.error('❌ Error marking absences:', error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const trainerId = searchParams.get('trainer_id');
    const statusFilter = searchParams.get('status'); // 'Absent', 'Late', 'Present'
    
    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    
    // Mark absences for today
    await markMissedClassesAsAbsent(nowInKenya.toJSDate());
    
    // Default to current week
    const defaultStartDate = nowInKenya.startOf('week').toJSDate();
    const defaultEndDate = nowInKenya.endOf('week').toJSDate();
    
    // Build filters
    const whereFilters: any = {
      date: {
        gte: startDate ? new Date(startDate) : defaultStartDate,
        lte: endDate ? new Date(endDate) : defaultEndDate
      }
    };
    
    // If not admin, only show own records
    if (user.role !== 'admin') {
      whereFilters.trainer_id = user.id;
    } else if (trainerId) {
      whereFilters.trainer_id = parseInt(trainerId);
    }
    
    // Filter by status if provided
    if (statusFilter) {
      whereFilters.status = statusFilter;
    }
    
    // Get class attendance records
    const classAttendance = await db.classattendance.findMany({
      where: whereFilters,
      include: {
        users: {
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
        }
      },
      orderBy: [
        { date: 'desc' },
        { status: 'asc' }
      ]
    });
    
    // Enrich with timetable slot data
    const enrichedData = await Promise.all(
      classAttendance.map(async (record) => {
        let slotData = null;
        
        if (record.timetable_slot_id) {
          const slot = await db.timetableslots.findUnique({
            where: { id: record.timetable_slot_id },
            include: {
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
                  end_time: true
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
            dayOfWeek: slot.day_of_week,
            isOnline: slot.is_online_session
          } : null;
        }
        
        return {
          id: record.id,
          trainer: record.users,
          class: record.classes,
          date: record.date,
          status: record.status,
          checkInTime: record.check_in_time,
          checkOutTime: record.check_out_time,
          isOnline: record.is_online_attendance,
          slot: slotData
        };
      })
    );
    
    // Group by date for easier display
    const groupedByDate = enrichedData.reduce((acc, record) => {
      const dateKey = record.date.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          records: [],
          summary: {
            total: 0,
            present: 0,
            late: 0,
            absent: 0
          }
        };
      }
      
      acc[dateKey].records.push(record);
      acc[dateKey].summary.total++;
      
      if (record.status === 'Present') acc[dateKey].summary.present++;
      else if (record.status === 'Late') acc[dateKey].summary.late++;
      else if (record.status === 'Absent') acc[dateKey].summary.absent++;
      
      return acc;
    }, {} as Record<string, any>);
    
    // Convert to array and sort by date
    const groupedArray = Object.values(groupedByDate).sort((a: any, b: any) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    // Calculate overall statistics
    const totalRecords = enrichedData.length;
    const presentCount = enrichedData.filter(r => r.status === 'Present').length;
    const lateCount = enrichedData.filter(r => r.status === 'Late').length;
    const absentCount = enrichedData.filter(r => r.status === 'Absent').length;
    
    return NextResponse.json({
      success: true,
      data: groupedArray,
      statistics: {
        total: totalRecords,
        present: presentCount,
        late: lateCount,
        absent: absentCount,
        presentPercentage: totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0,
        latePercentage: totalRecords > 0 ? Math.round((lateCount / totalRecords) * 100) : 0,
        absentPercentage: totalRecords > 0 ? Math.round((absentCount / totalRecords) * 100) : 0
      },
      filters: {
        startDate: whereFilters.date.gte.toISOString().split('T')[0],
        endDate: whereFilters.date.lte.toISOString().split('T')[0],
        trainerId,
        status: statusFilter
      }
    });
    
  } catch (error) {
    console.error('Error fetching class attendance report:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch class attendance report' },
      { status: 500 }
    );
  }
}