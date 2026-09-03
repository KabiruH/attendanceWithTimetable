// app/api/attendance/upcoming-classes/route.ts
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: number; id?: number };
    const userId = decoded.id || decoded.userId; // ✅ web uses 'id', mobile uses 'userId'
    const user = await db.users.findUnique({
      where: { id: userId },
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

// Helper to check if can check in
function getCheckInStatus(lessonStartTime: Date, currentTime: Date, settings: any) {
  const checkInWindow = settings?.attendance_check_in_window || 13;
  const lateThreshold = settings?.attendance_late_threshold || 10;

  const earliestCheckIn = new Date(lessonStartTime.getTime() - (checkInWindow * 60 * 1000));
  const latestCheckIn = new Date(lessonStartTime.getTime() + (lateThreshold * 60 * 1000));

  const now = currentTime.getTime();

  if (now < earliestCheckIn.getTime()) {
    const minutesUntil = Math.ceil((earliestCheckIn.getTime() - now) / (60 * 1000));

    const days = Math.floor(minutesUntil / (60 * 24));
    const hours = Math.floor((minutesUntil % (60 * 24)) / 60);
    const mins = minutesUntil % 60;

    let timeStr = '';
    if (days > 0) timeStr += `${days}d `;
    if (hours > 0) timeStr += `${hours}h `;
    if (mins > 0 && days === 0) timeStr += `${mins}m`;

    return {
      canCheckIn: false,
      status: 'upcoming',
      message: `Opens in ${timeStr.trim()}`,
      minutesUntil
    };
  }

  if (now > latestCheckIn.getTime()) {
    return {
      canCheckIn: false,
      status: 'closed',
      message: 'Check-in window closed'
    };
  }

  const isLate = now > lessonStartTime.getTime();

  return {
    canCheckIn: true,
    status: isLate ? 'late' : 'open',
    message: isLate ? 'Check in now (late)' : 'Check in now',
    isLate
  };
}

// Helper to format time
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// GET - Get upcoming classes (today + next day or next N classes)
export async function GET(req: NextRequest) {
  try {
const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);

    // Get query parameters
    const limit = parseInt(searchParams.get('limit') || '10'); // Number of upcoming classes
    const daysAhead = parseInt(searchParams.get('days') || '2'); // Look ahead N days (default 2)

    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    const currentTime = nowInKenya.toJSDate();
    const currentDate = new Date(currentTime.toISOString().split('T')[0]);

 // Get the current term (active flag + today within its dates)
const now = new Date();
const activeTerm = await db.terms.findFirst({
  where: {
    is_active: true,
    start_date: { lte: now },
    end_date: { gte: now }
  },
  orderBy: { start_date: 'desc' }
});

    if (!activeTerm) {
      return NextResponse.json({
        success: true,
        upcoming: [],
        current: null,
        message: 'No active term found'
      });
    }

    // Get settings for check-in windows
    const settings = await db.timetablesettings.findFirst();

    // Calculate which days to look at
    const daysToCheck = [];
    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(currentTime);
      date.setDate(currentTime.getDate() + i);
      daysToCheck.push({
        date: date,
        dateStr: date.toISOString().split('T')[0],
        dayOfWeek: date.getDay()
      });
    }

    // Get all timetable slots for these days
    const dayOfWeekValues = daysToCheck.map(d => d.dayOfWeek);

    // Classes this user is assigned to (class-trainer relationship)
    // Classes this user is assigned to (class-trainer relationship, current term only)
const classAssignments = await db.trainerclassassignments.findMany({
  where: {
    trainer_id: user.id,
    term_id: activeTerm.id,
    is_active: true
  },
  select: { class_id: true }
});
    const assignedClassIds = classAssignments.map(a => a.class_id);

    // Slots the user teaches, plus the full timetable of their assigned classes
    const allSlots = await db.timetableslots.findMany({
      where: {
        term_id: activeTerm.id,
        day_of_week: {
          in: dayOfWeekValues
        },
        status: 'scheduled',
        employee_id: user.id
      },
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
            capacity: true
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
        users: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Nothing scheduled for this user or their classes — skip the attendance work
    if (allSlots.length === 0) {
      return NextResponse.json({
        success: true,
        current: null,
        next: null,
        upcoming: [],
        todayRemaining: [],
        tomorrowClasses: [],
        statistics: {
          totalUpcoming: 0,
          todayRemaining: 0,
          tomorrowScheduled: 0,
          canCheckInNow: 0
        },
        currentTime: currentTime.toISOString(),
        settings: {
          check_in_window: settings?.attendance_check_in_window || 15,
          late_threshold: settings?.attendance_late_threshold || 10
        }
      });
    }


    // Get attendance records for these dates
    const startDate = daysToCheck[0].date;
    const endDate = daysToCheck[daysToCheck.length - 1].date;
    endDate.setHours(23, 59, 59, 999);

    const attendanceRecords = await db.classattendance.findMany({
      where: {
        trainer_id: user.id,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        id: true,
        timetable_slot_id: true,
        date: true,
        check_in_time: true,
        check_out_time: true,
        status: true
      }
    });


    // Map attendance by slot and date
    const attendanceMap = new Map<string, any>();
    attendanceRecords.forEach(record => {
      const key = `${record.timetable_slot_id}_${record.date.toISOString().split('T')[0]}`;
      attendanceMap.set(key, record);
    });

    // Build upcoming classes with full context
    const upcomingClasses: any[] = [];
    let currentClass: any = null;

 daysToCheck.forEach(day => {
  const slotsForDay = allSlots.filter(
    slot => slot.day_of_week === day.dayOfWeek && slot.lessonperiods
  );

  // ── Collapse multi-period sessions (doubles/triples) into one entry ──
  const sessions = new Map<string, typeof slotsForDay>();
  slotsForDay.forEach(slot => {
    const key = slot.session_group_id
      ? `${slot.session_group_id}-${slot.class_id}`
      : `single-${slot.id}`;
    sessions.set(key, [...(sessions.get(key) ?? []), slot]);
  });

  sessions.forEach(group => {
    // Chronological within the session: first period = start, last = end
    const sorted = [...group].sort(
      (a, b) =>
        new Date(a.lessonperiods!.start_time).getTime() -
        new Date(b.lessonperiods!.start_time).getTime()
    );
    const primary = sorted[0];
    const last = sorted[sorted.length - 1];
    const spanCount = sorted.length;

    const startRaw = new Date(primary.lessonperiods!.start_time);
    const endRaw = new Date(last.lessonperiods!.end_time);

    // ── Times are wall-clock values stored in UTC fields: read with UTC
    // getters, then pin the datetime to Africa/Nairobi explicitly so this
    // works no matter what timezone the server runs in ──
    const lessonStart = DateTime.fromObject(
      {
        year: day.date.getFullYear(),
        month: day.date.getMonth() + 1,
        day: day.date.getDate(),
        hour: startRaw.getUTCHours(),
        minute: startRaw.getUTCMinutes(),
      },
      { zone: 'Africa/Nairobi' }
    ).toJSDate();

    const lessonEnd = DateTime.fromObject(
      {
        year: day.date.getFullYear(),
        month: day.date.getMonth() + 1,
        day: day.date.getDate(),
        hour: endRaw.getUTCHours(),
        minute: endRaw.getUTCMinutes(),
      },
      { zone: 'Africa/Nairobi' }
    ).toJSDate();

    // Attendance may be recorded against any slot in the session — check all
    const attendance = sorted
      .map(s => attendanceMap.get(`${s.id}_${day.dateStr}`))
      .find(Boolean);

    const isHappeningNow = currentTime >= lessonStart && currentTime <= lessonEnd;

    const isOwnLesson = primary.employee_id === user.id;
    const checkInStatus = isOwnLesson
      ? getCheckInStatus(lessonStart, currentTime, settings)
      : { canCheckIn: false, status: 'view_only', message: 'Not your lesson' };

    if (lessonEnd < currentTime && attendance?.check_out_time) return;

    const totalDuration = sorted.reduce(
      (sum, s) => sum + (s.lessonperiods!.duration ?? 0), 0
    );

    const classInfo = {
      id: primary.id,
      timetable_slot_id: primary.id,
      class: primary.classes,
      subject: primary.subjects,
      room: primary.rooms,
      lessonPeriod: {
        ...primary.lessonperiods,
        end_time: last.lessonperiods!.end_time, // session's true end
        duration: totalDuration,                 // e.g. 120 for a double
      },
      sessionSpan: spanCount,                    // 1 = single, 2 = double, 3 = triple
      trainer: primary.users,
      isOwnLesson,
      scheduledDate: day.dateStr,
      scheduledDateTime: lessonStart.toISOString(),
      startTime: lessonStart,
      endTime: lessonEnd,
      startTimeFormatted: formatTime(lessonStart),
      endTimeFormatted: formatTime(lessonEnd),
      dayOfWeek: day.dayOfWeek,
      dayName: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day.dayOfWeek],
      isToday: day.dateStr === currentDate.toISOString().split('T')[0],
      isTomorrow: day.dateStr === new Date(currentTime.getTime() + 24*60*60*1000).toISOString().split('T')[0],
      isHappeningNow,
      attendance,
      hasCheckedIn: !!attendance?.check_in_time,
      hasCheckedOut: !!attendance?.check_out_time,
      checkInStatus,
      minutesUntilStart: Math.ceil((lessonStart.getTime() - currentTime.getTime()) / 60000),
      hoursUntilStart: Math.floor((lessonStart.getTime() - currentTime.getTime()) / 3600000),
    };

    if (isHappeningNow && isOwnLesson) currentClass = classInfo;
    if (lessonEnd >= currentTime) upcomingClasses.push(classInfo);
  });
});

    // Sort by scheduled time
    upcomingClasses.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Limit results
    const limitedUpcoming = upcomingClasses.slice(0, limit);

    // Find next class (first one after current) — own lessons only
    const nextClass = upcomingClasses.find(c => c.isOwnLesson && !c.isHappeningNow && c.startTime > currentTime);

    // Separate today's remaining classes
    const todayRemaining = limitedUpcoming.filter(c => c.isToday && !c.hasCheckedOut);

    // Separate tomorrow's classes
    const tomorrowClasses = limitedUpcoming.filter(c => c.isTomorrow);

    return NextResponse.json({
      success: true,
      current: currentClass,
      next: nextClass,
      upcoming: limitedUpcoming,
      todayRemaining,
      tomorrowClasses,
      statistics: {
        totalUpcoming: upcomingClasses.length,
        todayRemaining: todayRemaining.length,
        tomorrowScheduled: tomorrowClasses.length,
        canCheckInNow: limitedUpcoming.filter(c => c.checkInStatus.canCheckIn).length
      },
      currentTime: currentTime.toISOString(),
      settings: {
        check_in_window: settings?.attendance_check_in_window || 15,
        late_threshold: settings?.attendance_late_threshold || 10
      }
    });

  } catch (error) {
    console.error('Error fetching upcoming classes:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch upcoming classes' },
      { status: 500 }
    );
  }
}