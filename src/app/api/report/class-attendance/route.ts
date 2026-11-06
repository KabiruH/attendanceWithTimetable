// app/api/reports/class-attendance/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { db } from '@/lib/db/db';
import jwt from 'jsonwebtoken';
import { markMissedClassesAsAbsent } from '@/lib/utils/classAbsences';
import { groupIntoSessions } from '@/lib/utils/classSessions';

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
    await markMissedClassesAsAbsent(); // shared, session-aware, throttled
    
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
    
    // Enrich with timetable slot data — batched (this used to be one query per
    // record), and session-aware: a double/triple reports its full span, not
    // just its first period
    const slotIds = Array.from(new Set(
      classAttendance.map(r => r.timetable_slot_id).filter((id): id is string => !!id)
    ));

    const slots = slotIds.length > 0
      ? await db.timetableslots.findMany({
          where: { id: { in: slotIds } },
          include: {
            subjects: { select: { id: true, name: true, code: true } },
            rooms: { select: { id: true, name: true } },
            lessonperiods: { select: { id: true, name: true, start_time: true, end_time: true } },
            terms: { select: { id: true, name: true } }
          }
        })
      : [];

    // The other periods of each record's session (same term, day, trainer,
    // class and subject), so the session's real end can be found
    const combos = new Map<string, { term_id: number; day_of_week: number; employee_id: number; class_id: number; subject_id: number }>();
    slots.forEach(sl => {
      const c = { term_id: sl.term_id, day_of_week: sl.day_of_week, employee_id: sl.employee_id, class_id: sl.class_id, subject_id: sl.subject_id };
      combos.set(Object.values(c).join('-'), c);
    });

    const [siblingSlots, periods] = combos.size > 0
      ? await Promise.all([
          db.timetableslots.findMany({
            where: { OR: Array.from(combos.values()), status: 'scheduled' },
            select: {
              id: true, term_id: true, day_of_week: true, employee_id: true, class_id: true, subject_id: true,
              lessonperiods: { select: { start_time: true, end_time: true } }
            }
          }),
          db.lessonperiods.findMany({ where: { is_active: true }, select: { start_time: true } })
        ])
      : [[], []];

    // Group per term + day, then map every slot to its session's end and span
    const byTermDay = new Map<string, typeof siblingSlots>();
    siblingSlots.forEach(sl => {
      const k = `${sl.term_id}-${sl.day_of_week}`;
      byTermDay.set(k, [...(byTermDay.get(k) ?? []), sl]);
    });
    const sessionOf = new Map<string, { end_time: Date | null; span: number }>();
    byTermDay.forEach(daySlots => {
      groupIntoSessions(daySlots, periods).forEach(({ siblings }) => {
        const last = siblings[siblings.length - 1];
        const info = { end_time: last.lessonperiods?.end_time ?? null, span: siblings.length };
        siblings.forEach(sib => sessionOf.set(sib.id, info));
      });
    });

    const slotById = new Map<string, (typeof slots)[number]>(slots.map(sl => [sl.id, sl]));

    const enrichedData = classAttendance.map(record => {
      const slot = record.timetable_slot_id ? slotById.get(record.timetable_slot_id) : undefined;
      const session = slot ? sessionOf.get(slot.id) : undefined;

      const slotData = slot ? {
        subject: slot.subjects,
        room: slot.rooms,
        lessonPeriod: slot.lessonperiods
          ? { ...slot.lessonperiods, end_time: session?.end_time ?? slot.lessonperiods.end_time }
          : null,
        sessionSpan: session?.span ?? 1,   // 1 = single, 2 = double, 3 = triple
        term: slot.terms,
        dayOfWeek: slot.day_of_week,
        isOnline: slot.is_online_session
      } : null;

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
    });
    
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