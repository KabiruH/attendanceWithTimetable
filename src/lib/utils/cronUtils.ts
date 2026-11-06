import { db } from "../db/db";
import { buildSessionIndex, eatWallClockToInstant, eatToday } from "./classSessions";

// Interface for attendance session
interface AttendanceSession {
  [key: string]: any;
  check_in_time?: string;
  check_out_time?: string;
  type: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  };
  ip_address?: string;
  user_agent?: string;
  auto_checkout?: boolean;
}

const ATTENDANCE_RULES = {
  AUTO_CHECKOUT: 15,       // 5 PM - automatic checkout time
  CLASS_DURATION_HOURS: 2, // fallback only: class rows with no timetable slot
};

export async function processAbsentRecords(date: Date = new Date()) {
  const currentDate = date.toISOString().split('T')[0];
  const currentTime = date.getHours();
 
  try {
    // Only process absences after work hours (5 PM)
    const isToday = currentDate === new Date().toISOString().split('T')[0];
    if (isToday && currentTime < 17) {
      return 0;
    }

    const activeEmployees = await db.employees.findMany({
      where: {
        users: { is_active: true }
      },
      select: { employee_id: true } 
    });

    const existingRecords = await db.attendance.findMany({
      where: {
        date: new Date(currentDate),
      },
      select: {
        employee_id: true,
        check_in_time: true,
        status: true
      }
    });
    const employeesWithRecords = new Set(existingRecords.map(record => record.employee_id));
    const potentialAbsentees = activeEmployees.filter(
      employee => !employeesWithRecords.has(employee.employee_id)
    );

    if (potentialAbsentees.length > 0) {
      const notAbsentYet = await db.attendance.findMany({
        where: {
          employee_id: { in: potentialAbsentees.map(e => e.employee_id) },
          date: new Date(currentDate),
          NOT: { status: 'Absent' }
        }
      });

      const notAbsentIds = new Set(notAbsentYet.map(r => r.employee_id));
      const confirmedAbsentees = potentialAbsentees.filter(e => !notAbsentIds.has(e.employee_id));

      if (confirmedAbsentees.length > 0) {
        await db.attendance.createMany({
          data: confirmedAbsentees.map(employee => ({
            employee_id: employee.employee_id,
            date: new Date(currentDate),
            status: 'Absent',
            check_in_time: null,
            check_out_time: null
          }))
        });
      }

      return confirmedAbsentees.length;
    }

    return 0;
  } catch (error) {
    console.error('Failed to process absent records:', error);
    return 0;
  }
}

export async function processMissedDays() {
  try {
      // Get the last 7 days
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1); // Exclude today
      endDate.setHours(17, 0, 0, 0);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(17, 0, 0, 0);

      // Get all dates between start and end
      const dates: Date[] = [];
      let currentDate = new Date(startDate);
      
      while (currentDate <= endDate) { // This will now exclude today
          // Skip weekends
          if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
              dates.push(new Date(currentDate));
          }
          currentDate.setDate(currentDate.getDate() + 1);
      }

      let totalProcessed = 0;

      // Process each missed day
      for (const date of dates) {
          const existingProcessing = await db.attendanceprocessinglog.findFirst({
              where: {
                  date: date,
                  status: 'completed'
              }
          });

          // Skip if already processed
          if (!existingProcessing) {
              const processedCount = await processAbsentRecords(date);
              
              // Log the processing
              await db.attendanceprocessinglog.create({
                  data: {
                      date: date,
                      records_processed: processedCount,
                      status: 'completed'
                  }
              });

              totalProcessed += processedCount;
          }
      }

      return totalProcessed;
  } catch (error) {
      console.error('Failed to process missed days:', error);
      return 0;
  }
}

// Class auto-checkout at the end of each SESSION (a double runs to the end of
// its last period). Rows not linked to a timetable slot keep the old rule.
export async function processClassAutoCheckouts(currentTime: Date) {
  try {
    // Nairobi calendar date — matches how class-checkin stores `date`
    const todayDate = eatToday(currentTime);

    const openRows = await db.classattendance.findMany({
      where: {
        date: todayDate,
        check_out_time: null,
        check_in_time: { not: null }
      },
      include: {
        timetableslots: {
          select: { term_id: true, day_of_week: true, employee_id: true }
        }
      }
    });

    if (openRows.length === 0) return 0;

    // Load each trainer's slots for the day once, then group into sessions
    const combos = new Map<string, { term_id: number; day_of_week: number; employee_id: number }>();
    openRows.forEach(r => {
      const t = r.timetableslots;
      if (t) combos.set(`${t.term_id}-${t.day_of_week}-${t.employee_id}`, t);
    });

    const [slots, periods] = combos.size > 0
      ? await Promise.all([
          db.timetableslots.findMany({
            where: { OR: Array.from(combos.values()) },
            select: {
              id: true,
              class_id: true,
              subject_id: true,
              employee_id: true,
              lessonperiods: { select: { start_time: true, end_time: true } }
            }
          }),
          db.lessonperiods.findMany({
            where: { is_active: true },
            select: { start_time: true }
          })
        ])
      : [[], []];

    // A double/triple checks out at the end of its LAST period, even across a break
    const sessionIndex = buildSessionIndex(slots, periods);

    let classCheckoutCount = 0;

    for (const row of openRows) {
      if (!row.check_in_time) continue;

      let checkoutAt: Date | null = null;
      const session = row.timetable_slot_id ? sessionIndex.get(row.timetable_slot_id) : undefined;

      if (session && session.endMin !== null) {
        // Close at the session's scheduled end, stamped with that end time
        // (not "now"), so hours taught stay accurate even if this runs late
        const sessionEnd = eatWallClockToInstant(row.date, session.endMin);
        if (currentTime >= sessionEnd) {
          checkoutAt = sessionEnd > row.check_in_time ? sessionEnd : row.check_in_time;
        }
      } else {
        // No timetable link: fall back to the fixed duration
        const hoursDiff = (currentTime.getTime() - row.check_in_time.getTime()) / (1000 * 60 * 60);
        if (hoursDiff >= ATTENDANCE_RULES.CLASS_DURATION_HOURS) {
          checkoutAt = currentTime;
        }
      }

      if (checkoutAt) {
        await db.classattendance.update({
          where: { id: row.id },
          data: {
            check_out_time: checkoutAt,
            auto_checkout: true
          }
        });
        classCheckoutCount++;
      }
    }

    return classCheckoutCount;
  } catch (error) {
    console.error('Failed to process class auto-checkouts:', error);
    return 0;
  }
}

// ENHANCED: Add session tracking for work checkouts
async function performWorkAutoCheckout(record: any, checkoutTime: Date) {
  let existingSessions: AttendanceSession[] = [];
  
  if (record.sessions) {
    try {
      const sessionData = record.sessions as unknown;
      
      if (Array.isArray(sessionData)) {
        existingSessions = sessionData as AttendanceSession[];
      } else if (typeof sessionData === 'string') {
        existingSessions = JSON.parse(sessionData) as AttendanceSession[];
      }
    } catch (parseError) {
      console.error('Error parsing existing sessions:', parseError);
      existingSessions = [];
    }
  }

  const autoCheckoutSession: AttendanceSession = {
    check_out_time: checkoutTime.toISOString(),
    type: 'work_auto_checkout',
    auto_checkout: true,
    ip_address: 'system',
    user_agent: 'Auto Checkout System'
  };

  const updatedSessions = [...existingSessions, autoCheckoutSession];
  const sessionsJson = JSON.parse(JSON.stringify(updatedSessions));

  await db.attendance.update({
    where: { id: record.id },
    data: { 
      check_out_time: checkoutTime,
      sessions: sessionsJson
    }
  });
}

export async function processAutomaticAttendance() {
  const currentTime = new Date();
  const currentDate = new Date().toISOString().split('T')[0];
 
  try {
      // First, check and process any missed days
      const missedRecordsCount = await processMissedDays();

      // Process class auto-checkouts (can happen anytime after 2 hours)
      const classCheckoutCount = await processClassAutoCheckouts(currentTime);

      // Only proceed with work processing if it's 5 PM or later
      if (currentTime.getHours() >= 17) {
          // 1. Process work auto-checkouts
          const pendingCheckouts = await db.attendance.findMany({
              where: {
                  date: new Date(currentDate),
                  check_out_time: null,
                  check_in_time: {
                      not: null,
                  },
              },
          });

          const checkoutTime = new Date(currentDate + 'T15:00:00');

          // Process each work checkout with session tracking
          for (const record of pendingCheckouts) {
            await performWorkAutoCheckout(record, checkoutTime);
          }

          // 2. Process absent records after checkout time
          const absentCount = await processAbsentRecords(currentTime);

          return {
              workCheckouts: pendingCheckouts.length,
              classCheckouts: classCheckoutCount,
              absentRecords: absentCount,
              missedDaysProcessed: missedRecordsCount
          };
      }
   
      return {
          workCheckouts: 0,
          classCheckouts: classCheckoutCount,
          absentRecords: 0,
          missedDaysProcessed: missedRecordsCount
      };
  } catch (error) {
      console.error('Auto-attendance error:', error);
      return {
          workCheckouts: 0,
          classCheckouts: 0,
          absentRecords: 0,
          missedDaysProcessed: 0
      };
  }
}

// ensureCheckouts is triggered by /api/attendance/status, which several
// dashboard widgets call at once. Run it at most once a minute per server
// instance, and let concurrent callers share the run already in progress.
const CHECKOUT_MIN_INTERVAL_MS = 60_000;
let lastCheckoutRun = 0;
let checkoutRunInFlight: Promise<void> | null = null;

export function ensureCheckouts(): Promise<void> {
  if (checkoutRunInFlight) return checkoutRunInFlight;
  if (Date.now() - lastCheckoutRun < CHECKOUT_MIN_INTERVAL_MS) return Promise.resolve();

  lastCheckoutRun = Date.now();
  checkoutRunInFlight = runEnsureCheckouts().finally(() => {
    checkoutRunInFlight = null;
  });
  return checkoutRunInFlight;
}

async function runEnsureCheckouts() {
  try {
    const currentDate = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();
    const currentTime = new Date();

    // Process class checkouts (any time)
    await processClassAutoCheckouts(currentTime);

    // Find all work records from today that haven't been checked out
    // and where it's past 5 PM
    if (currentHour >= 15) {
      const pendingCheckouts = await db.attendance.findMany({
        where: {
          date: new Date(currentDate),
          check_out_time: null,
          check_in_time: {
            not: null,
          },
        },
      });

      if (pendingCheckouts.length > 0) {
        const checkoutTime = new Date(currentDate + 'T15:00:00');
        
        // Process each checkout with session tracking
        for (const record of pendingCheckouts) {
          await performWorkAutoCheckout(record, checkoutTime);
        }
      }
    }

    // Also check previous day if it's before noon
    if (currentHour < 12) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split('T')[0];

      const pendingYesterdayCheckouts = await db.attendance.findMany({
        where: {
          date: new Date(yesterdayDate),
          check_out_time: null,
          check_in_time: {
            not: null,
          },
        },
      });

      const yesterdayCheckoutTime = new Date(yesterdayDate + 'T17:00:00');
      if (pendingYesterdayCheckouts.length > 0) {
        
        // Process each checkout with session tracking
        for (const record of pendingYesterdayCheckouts) {
          await performWorkAutoCheckout(record, yesterdayCheckoutTime);
        }
      }

      // Also check yesterday's class sessions
      const yesterdayClassSessions = await db.classattendance.findMany({
        where: {
          date: new Date(yesterdayDate),
          check_out_time: null
        }
      });

      for (const session of yesterdayClassSessions) {
        if (session.check_in_time) {
          // Force checkout for any unclosed sessions from yesterday
          await db.classattendance.update({
            where: { id: session.id },
            data: {
              check_out_time: yesterdayCheckoutTime,
              auto_checkout: true
            }
          });
        }
      }
    }

  } catch (error) {
    console.error('Failed to process checkouts:', error);
  }
}