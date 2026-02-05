// app/api/attendance/class-attendance-report/route.ts
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
      select: { id: true, name: true, role: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) {
      throw new Error('User not found or inactive');
    }

    return user;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

// Helper to calculate duration
function calculateDuration(checkIn: Date, checkOut: Date): number {
  const diffMs = checkOut.getTime() - checkIn.getTime();
  return Math.max(0, diffMs / (1000 * 60)); // Return minutes
}

// Helper to format minutes to hours/minutes
function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  
  if (hours === 0 && minutes === 0) return '0m';
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// GET - Admin class attendance report
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    
    // Check if user is admin or has timetable admin privileges
    const hasAccess = user.role === 'admin' || user.has_timetable_admin === true;
    
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    
    // Get query parameters
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const trainerId = searchParams.get('trainer_id');
    const department = searchParams.get('department');
    const classId = searchParams.get('class_id');
    const subjectId = searchParams.get('subject_id');
    const termId = searchParams.get('term_id');
    const groupBy = searchParams.get('group_by') || 'trainer'; // trainer, department, class, subject
    const includeDetails = searchParams.get('include_details') === 'true';
    
    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    
    // Default to current month if no dates provided
    const defaultStartDate = new Date(nowInKenya.year, nowInKenya.month - 1, 1);
    const defaultEndDate = new Date(nowInKenya.year, nowInKenya.month, 0, 23, 59, 59, 999);
    
    // Build filters for attendance
    const attendanceFilters: any = {
      date: {
        gte: startDate ? new Date(startDate) : defaultStartDate,
        lte: endDate ? new Date(endDate) : defaultEndDate
      }
    };
    
    if (trainerId) {
      attendanceFilters.trainer_id = parseInt(trainerId);
    }
    
    if (classId) {
      attendanceFilters.class_id = parseInt(classId);
    }
    
    // If filtering by subject or term, need to get matching timetable slots first
    let timetableSlotIds: string[] | undefined;
    
    if (subjectId || termId) {
      const slotFilters: any = {};
      
      if (trainerId) {
        slotFilters.employee_id = parseInt(trainerId);
      }
      
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
        return NextResponse.json({
          success: true,
          summary: [],
          totals: {
            totalTrainers: 0,
            totalClasses: 0,
            totalHours: '0',
            averageHoursPerTrainer: '0'
          }
        });
      }
      
      attendanceFilters.timetable_slot_id = {
        in: timetableSlotIds
      };
    }
    
    // Get all attendance records
    const attendanceRecords = await db.classattendance.findMany({
      where: attendanceFilters,
      include: {
        users: {
          select: {
            id: true,
            name: true,
            department: true,
            role: true
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
      }
    });
    
    // Filter by department if specified
    let filteredRecords = attendanceRecords;
    if (department) {
      filteredRecords = attendanceRecords.filter(r => r.users.department === department);
    }
    
    // Enrich with timetable data (subject info)
    const enrichedRecords = await Promise.all(
      filteredRecords.map(async (record) => {
        let subject = null;
        let term = null;
        
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
              terms: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          });
          
          subject = slot?.subjects || null;
          term = slot?.terms || null;
        }
        
        return {
          ...record,
          subject,
          term
        };
      })
    );
    
    // Group data based on groupBy parameter
    const grouped = new Map<string, any>();

enrichedRecords.forEach(record => {
  let groupKey: string;
  let groupLabel: string;
  
  switch (groupBy) {
    case 'department':
      groupKey = record.users.department || 'No Department';
      groupLabel = groupKey;
      break;
    case 'class':
      groupKey = record.class_id.toString();
      groupLabel = `${record.classes.name} (${record.classes.code})`;
      break;
    case 'subject':
      groupKey = record.subject?.id?.toString() || 'no-subject';
      groupLabel = record.subject?.name || 'No Subject';
      break;
    case 'trainer':
    default:
      groupKey = record.trainer_id.toString();
      groupLabel = record.users.name;
      break;
  }
  
  if (!grouped.has(groupKey)) {
    grouped.set(groupKey, {
      key: groupKey,
      label: groupLabel,
      trainer: groupBy === 'trainer' ? record.users : null,
      department: groupBy === 'department' ? groupKey : null,
      class: groupBy === 'class' ? record.classes : null,
      subject: groupBy === 'subject' ? record.subject : null,
      records: [],
      statistics: {
        totalSessions: 0,
        completedSessions: 0,
        inProgressSessions: 0,
        onTimeSessions: 0,
        lateSessions: 0,
        absentSessions: 0, // ✅ NEW: Track absences
        totalMinutes: 0,
        averageMinutesPerSession: 0
      }
    });
  }
  
  const group = grouped.get(groupKey)!;
  group.records.push(record);
  
  // Update statistics
  group.statistics.totalSessions++;
  
  // ✅ FIXED: Check for null before calculating duration
  if (record.check_in_time && record.check_out_time) {
    group.statistics.completedSessions++;
    const minutes = calculateDuration(record.check_in_time, record.check_out_time);
    group.statistics.totalMinutes += minutes;
  } else if (record.check_in_time && !record.check_out_time) {
    // Has checked in but not checked out
    group.statistics.inProgressSessions++;
  }
  
  // ✅ NEW: Track status including absences
  if (record.status === 'Present') {
    group.statistics.onTimeSessions++;
  } else if (record.status === 'Late') {
    group.statistics.lateSessions++;
  } else if (record.status === 'Absent') {
    group.statistics.absentSessions++;
  }
});

// Calculate averages and format
const summary = Array.from(grouped.values()).map(group => {
  const stats = group.statistics;
  stats.averageMinutesPerSession = stats.completedSessions > 0 
    ? stats.totalMinutes / stats.completedSessions 
    : 0;
  
  return {
    ...group,
    statistics: {
      ...stats,
      totalHours: formatMinutes(stats.totalMinutes),
      averageDuration: formatMinutes(stats.averageMinutesPerSession),
      completionRate: stats.totalSessions > 0 
        ? Math.round((stats.completedSessions / stats.totalSessions) * 100) 
        : 0,
      onTimeRate: stats.totalSessions > 0 
        ? Math.round((stats.onTimeSessions / stats.totalSessions) * 100) 
        : 0,
      lateRate: stats.totalSessions > 0 // ✅ NEW
        ? Math.round((stats.lateSessions / stats.totalSessions) * 100) 
        : 0,
      absentRate: stats.totalSessions > 0 // ✅ NEW
        ? Math.round((stats.absentSessions / stats.totalSessions) * 100) 
        : 0
    },
    records: includeDetails ? group.records : undefined
  };
});

// Sort by total hours descending
summary.sort((a, b) => b.statistics.totalMinutes - a.statistics.totalMinutes);

// Calculate overall totals
const totalMinutes = summary.reduce((sum, s) => sum + s.statistics.totalMinutes, 0);
const totalSessions = summary.reduce((sum, s) => sum + s.statistics.totalSessions, 0);
const totalCompleted = summary.reduce((sum, s) => sum + s.statistics.completedSessions, 0);
const totalOnTime = summary.reduce((sum, s) => sum + s.statistics.onTimeSessions, 0);
const totalLate = summary.reduce((sum, s) => sum + s.statistics.lateSessions, 0);
const totalAbsent = summary.reduce((sum, s) => sum + s.statistics.absentSessions, 0); // ✅ NEW

const uniqueTrainers = new Set(enrichedRecords.map(r => r.trainer_id)).size;
const uniqueClasses = new Set(enrichedRecords.map(r => r.class_id)).size;
const uniqueSubjects = new Set(enrichedRecords.map(r => r.subject?.id).filter(Boolean)).size;

return NextResponse.json({
  success: true,
  summary,
  totals: {
    totalGroups: summary.length,
    totalTrainers: uniqueTrainers,
    totalClasses: uniqueClasses,
    totalSubjects: uniqueSubjects,
    totalSessions,
    completedSessions: totalCompleted,
    inProgressSessions: totalSessions - totalCompleted - totalAbsent, // ✅ FIXED: Subtract absences
    absentSessions: totalAbsent, // ✅ NEW
    totalHours: formatMinutes(totalMinutes),
    averageHoursPerGroup: formatMinutes(summary.length > 0 ? totalMinutes / summary.length : 0),
    averageSessionDuration: formatMinutes(totalCompleted > 0 ? totalMinutes / totalCompleted : 0),
    completionRate: totalSessions > 0 ? Math.round((totalCompleted / totalSessions) * 100) : 0,
    onTimeRate: totalSessions > 0 ? Math.round((totalOnTime / totalSessions) * 100) : 0,
    lateRate: totalSessions > 0 ? Math.round((totalLate / totalSessions) * 100) : 0,
    absentRate: totalSessions > 0 ? Math.round((totalAbsent / totalSessions) * 100) : 0 // ✅ NEW
  },
  filters: {
    groupBy,
    startDate: attendanceFilters.date.gte.toISOString().split('T')[0],
    endDate: attendanceFilters.date.lte.toISOString().split('T')[0],
    trainerId,
    department,
    classId,
    subjectId,
    termId
  }
});
    
  } catch (error) {
    console.error('Error fetching class attendance report:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch attendance report' },
      { status: 500 }
    );
  }
}