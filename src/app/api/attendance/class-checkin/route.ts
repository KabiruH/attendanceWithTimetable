// app/api/attendance/class-checkin/route.ts - Online class support
import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { db } from '@/lib/db/db';
import { verifyMobileJWT } from '@/lib/auth/mobile-jwt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// Type definitions
type TimetableSlotWithRelations = any & {
  classes?: { name: string; code?: string; duration_hours?: number } | null;
  subjects?: { name: string; code?: string; can_be_online?: boolean } | null;
  rooms?: { name: string } | null;
  lessonperiods?: { start_time: Date; end_time: Date; name: string } | null;
  is_online_session?: boolean; // ✅ NEW
};

// Mobile request validation schema
const mobileClassAttendanceSchema = z.object({
  type: z.enum(['class_checkin', 'class_checkout']),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number(),
    timestamp: z.number(),
  }).optional(), // ✅ CHANGED: Optional for online classes
  biometric_verified: z.boolean(),
  timetable_slot_id: z.string(),
});

// Geofence configuration
const GEOFENCE = {
  latitude: -1.2249434,
  longitude: 36.7095401,
  radius: 600_000, // meters
};

// Simplified authentication
async function getAuthenticatedUser(req: NextRequest): Promise<{ 
  id: number; 
  name: string; 
  role: string; 
  is_active: boolean;
  authMethod: 'jwt' | 'mobile_jwt';
}> {
  const token = req.cookies.get('token')?.value;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
      const user = await db.users.findUnique({
        where: { id: decoded.userId },
        select: { id: true, name: true, role: true, is_active: true }
      });

      if (user && user.is_active) {
        return { ...user, authMethod: 'jwt' };
      }
    } catch (error) {
      // JWT failed, continue to mobile JWT
    }
  }

  try {
    const mobileAuth = await verifyMobileJWT(req);
    if (mobileAuth.success && mobileAuth.payload) {
      const user = await db.users.findUnique({
        where: { id: mobileAuth.payload.employeeId || mobileAuth.payload.userId },
        select: { id: true, name: true, role: true, is_active: true }
      });

      if (user && user.is_active) {
        return { ...user, authMethod: 'mobile_jwt' };
      }
    }
  } catch (error) {
    // Mobile JWT failed
  }

  throw new Error('No valid authentication method provided');
}

// Geofence helpers
function verifyGeofence(lat: number, lng: number): boolean {
  const distance = calculateDistance(lat, lng, GEOFENCE.latitude, GEOFENCE.longitude);
  return distance <= GEOFENCE.radius;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// NEW: Function to mark absences for closed check-in windows
async function markMissedClassesAsAbsent(currentTime: Date) {
  try {
    const currentDate = new Date(currentTime.toISOString().split('T')[0]);
    const dayOfWeek = currentTime.getDay();
    
    // Get active term
    const activeTerm = await db.terms.findFirst({
      where: { is_active: true }
    });

    if (!activeTerm) return;

    // Get timetable settings
    const settings = await db.timetablesettings.findFirst();
    const lateThreshold = settings?.attendance_late_threshold || 10;

    // Get all timetable slots for today
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

    // Check each slot
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

      // Calculate when check-in window closes (start time + late threshold)
      const checkInWindowClosed = new Date(lessonStart.getTime() + (lateThreshold * 60 * 1000));

      // Only process if check-in window has closed
      if (currentTime < checkInWindowClosed) continue;

      // Check if trainer has attendance record for this slot
      const existingAttendance = await db.classattendance.findFirst({
        where: {
          trainer_id: slot.employee_id,
          class_id: slot.class_id,
          date: currentDate,
          timetable_slot_id: slot.id
        }
      });

      // If no attendance record exists, mark as absent
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
            // No check-in/check-out times for absences
            check_in_time: null,
            check_out_time: null,
            work_attendance_id: null
          }
        });
        
        console.log(`✅ Marked absence for trainer ${slot.employee_id}, slot ${slot.id}`);
      }
    }
  } catch (error) {
    console.error('❌ Error marking absences:', error);
  }
}


// Get trainer's schedule for today from timetable
async function getTodaySchedule(trainerId: number, currentDate: Date) {
  const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Get active term
  const activeTerm = await db.terms.findFirst({
    where: { is_active: true }
  });

  if (!activeTerm) {
    return [];
  }

  // Get all timetable slots for this trainer for today
  const slots = await db.timetableslots.findMany({
    where: {
      employee_id: trainerId,
      term_id: activeTerm.id,
      day_of_week: dayOfWeek,
      status: 'scheduled'
    },
    include: {
      classes: {
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          department: true,
          duration_hours: true
        }
      },
      subjects: {
        select: {
          id: true,
          name: true,
          code: true,
          department: true,
          can_be_online: true // ✅ NEW: Include can_be_online flag
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
      }
    },
    orderBy: {
      lessonperiods: {
        start_time: 'asc'
      }
    }
  });

  return slots;
}

// Check if trainer can check in to this slot
function canCheckIn(slot: TimetableSlotWithRelations, currentTime: Date, settings: any) {
  if (!slot.lessonperiods) return { canCheckIn: false, reason: 'No lesson period found' };

  const startTime = new Date(slot.lessonperiods.start_time);
  const today = new Date(currentTime);
  
  // Combine today's date with lesson start time
  const lessonStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    startTime.getHours(),
    startTime.getMinutes(),
    0
  );

  // Calculate check-in window (default 15 minutes before)
  const checkInWindow = settings?.attendance_check_in_window || 15;
  const earliestCheckIn = new Date(lessonStart.getTime() - (checkInWindow * 60 * 1000));
  
  // Calculate late threshold (default 10 minutes after)
  const lateThreshold = settings?.attendance_late_threshold || 10;
  const latestCheckIn = new Date(lessonStart.getTime() + (lateThreshold * 60 * 1000));

  const now = currentTime.getTime();

  if (now < earliestCheckIn.getTime()) {
    const minutesUntil = Math.ceil((earliestCheckIn.getTime() - now) / (60 * 1000));
    return { 
      canCheckIn: false, 
      reason: `Too early. Check-in opens ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''} before class`,
      earliestCheckIn 
    };
  }

  if (now > latestCheckIn.getTime()) {
    return { 
      canCheckIn: false, 
      reason: 'Check-in window closed. Class has started',
      isLate: true 
    };
  }

  const isLate = now > lessonStart.getTime();
  
  return { canCheckIn: true, isLate };
}

// GET /api/attendance/class-checkin - Get today's schedule
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    const currentTime = nowInKenya.toJSDate();
    const currentDate = new Date(currentTime.toISOString().split('T')[0]);

    // ✅ NEW: Mark absences for all trainers before returning schedule
    await markMissedClassesAsAbsent(currentTime);

    const url = new URL(request.url);
    const queryEmployeeId = url.searchParams.get('employee_id');
    
    const userIdToUse = user.role === 'admin' && queryEmployeeId ? 
      Number(queryEmployeeId) : user.id;

    // Get timetable settings
    const settings = await db.timetablesettings.findFirst();

    // Get today's schedule from timetable
    const todaySchedule = await getTodaySchedule(userIdToUse, currentTime);

    // Get today's attendance records (INCLUDING ABSENCES NOW)
    const todayAttendance = await db.classattendance.findMany({
      where: {
        trainer_id: userIdToUse,
        date: currentDate
      },
      select: {
        id: true,
        class_id: true,
        timetable_slot_id: true,
        check_in_time: true,
        check_out_time: true,
        status: true, // Will now include 'Absent'
        auto_checkout: true,
        location_verified: true,
        is_online_attendance: true
      }
    });

    // Enrich schedule with attendance status and check-in eligibility
    const enrichedSchedule = todaySchedule.map(slot => {
      const attendance = todayAttendance.find(att => att.timetable_slot_id === slot.id);
      const checkInStatus = canCheckIn(slot, currentTime, settings);
      
      return {
        ...slot,
        attendance,
        canCheckIn: attendance?.status === 'Absent' ? false : checkInStatus.canCheckIn, // ✅ Can't check in if marked absent
        checkInReason: attendance?.status === 'Absent' ? 'Marked as absent' : checkInStatus.reason,
        isLate: checkInStatus.isLate || false,
        hasCheckedIn: !!attendance?.check_in_time,
        hasCheckedOut: !!attendance?.check_out_time,
        isAbsent: attendance?.status === 'Absent', // ✅ NEW: Flag for UI
        isOnlineSession: slot.is_online_session || false
      };
    });

    return NextResponse.json({
      success: true,
      schedule: enrichedSchedule,
      todayAttendance,
      currentTime: currentTime.toISOString(),
      settings: {
        check_in_window: settings?.attendance_check_in_window || 15,
        late_threshold: settings?.attendance_late_threshold || 10,
        location_required: settings?.attendance_location_required || false
      },
      userRole: user.role
    });

  } catch (error) {
    console.error('❌ Error in class check-in GET:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}

// POST /api/attendance/class-checkin - Check in/out for a specific timetable slot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isMobileRequest = body?.type?.startsWith('class_') || !!body?.location;
    const user = await getAuthenticatedUser(request);

    const { timetable_slot_id, action, type } = body;
    
    // Normalize action
    const normalizedAction = type === 'class_checkin' ? 'check-in' : 
                            type === 'class_checkout' ? 'check-out' : 
                            action;

    if (!timetable_slot_id) {
      return NextResponse.json(
        { success: false, error: 'timetable_slot_id is required' },
        { status: 400 }
      );
    }

    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    const currentTime = nowInKenya.toJSDate();
    const currentDate = new Date(currentTime.toISOString().split('T')[0]);

    // Get timetable slot with all details INCLUDING is_online_session
    const slot = await db.timetableslots.findUnique({
      where: { id: timetable_slot_id },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true,
            duration_hours: true
          }
        },
        subjects: {
          select: {
            id: true,
            name: true,
            code: true,
            can_be_online: true // ✅ NEW
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
        },
        terms: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!slot) {
      return NextResponse.json(
        { success: false, error: 'Timetable slot not found' },
        { status: 404 }
      );
    }

    // ✅ NEW: Check if this is an online session
    const isOnlineSession = slot.is_online_session === true;

    // Verify this slot belongs to the trainer
    if (slot.employee_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'This class is not assigned to you' },
        { status: 403 }
      );
    }

    // Verify slot is for today
    const todayDayOfWeek = currentTime.getDay();
    if (slot.day_of_week !== todayDayOfWeek) {
      return NextResponse.json(
        { success: false, error: 'This class is not scheduled for today' },
        { status: 400 }
      );
    }

    // ✅ NEW: Validate based on session type
    if (isMobileRequest) {
      if (isOnlineSession) {
        // Online session: Only biometric required, location optional
        if (!body.biometric_verified) {
          return NextResponse.json({
            success: false,
            error: 'Biometric verification is required for attendance'
          }, { status: 400 });
        }
      } else {
        // Physical session: Both location and biometric required
        try {
          mobileClassAttendanceSchema.parse(body);
        } catch (error) {
          if (error instanceof z.ZodError) {
            return NextResponse.json(
              { success: false, error: error.issues[0].message },
              { status: 400 }
            );
          }
        }

        // Verify location for physical classes
        if (body.location) {
          const isWithinGeofence = verifyGeofence(
            body.location.latitude,
            body.location.longitude
          );
          
          if (!isWithinGeofence) {
            const distance = calculateDistance(
              body.location.latitude,
              body.location.longitude,
              GEOFENCE.latitude,
              GEOFENCE.longitude
            );
            
            return NextResponse.json({
              success: false,
              error: 'You must be within the school premises to record attendance',
              distance: Math.round(distance)
            }, { status: 400 });
          }
        }

        // Verify biometric
        if (!body.biometric_verified) {
          return NextResponse.json({
            success: false,
            error: 'Biometric verification is required for attendance'
          }, { status: 400 });
        }
      }
    }

    // Get settings
    const settings = await db.timetablesettings.findFirst();

    // ✅ NEW: Work attendance check ONLY for physical classes
    let workAttendance = null;
    if (!isOnlineSession) {
      const employee = await db.employees.findFirst({
        where: { employee_id: user.id }
      });

      if (!employee) {
        return NextResponse.json(
          { success: false, error: 'Employee record not found' },
          { status: 404 }
        );
      }

      workAttendance = await db.attendance.findFirst({
        where: {
          employee_id: employee.id,
          date: currentDate
        }
      });

      if (!workAttendance?.check_in_time || workAttendance.check_out_time) {
        return NextResponse.json(
          { success: false, error: 'You must be checked into work to mark class attendance' },
          { status: 400 }
        );
      }
    }

    // Check existing attendance
    const existingAttendance = await db.classattendance.findFirst({
      where: {
        trainer_id: user.id,
        class_id: slot.class_id,
        date: currentDate,
        timetable_slot_id: timetable_slot_id
      }
    });

    if (normalizedAction === 'check-in') {
      // Verify check-in window
      const checkInStatus = canCheckIn(slot, currentTime, settings);
      
      if (!checkInStatus.canCheckIn) {
        return NextResponse.json(
          { success: false, error: checkInStatus.reason },
          { status: 400 }
        );
      }

      if (existingAttendance?.check_in_time && !existingAttendance.check_out_time) {
        return NextResponse.json(
          { success: false, error: 'You have already checked in to this class' },
          { status: 400 }
        );
      }

      // Check for active sessions in other classes
      const activeSession = await db.classattendance.findFirst({
        where: {
          trainer_id: user.id,
          date: currentDate,
          check_out_time: null,
          timetable_slot_id: { not: timetable_slot_id }
        },
        include: {
          classes: { 
            select: { 
              name: true 
            } 
          }
        }
      });

      if (activeSession) {
        // Get subject name from the active session's timetable slot
        let activeSubjectName = activeSession.classes.name;
        if (activeSession.timetable_slot_id) {
          const activeSlot = await db.timetableslots.findUnique({
            where: { id: activeSession.timetable_slot_id },
            include: {
              subjects: {
                select: { name: true }
              }
            }
          });
          activeSubjectName = activeSlot?.subjects?.name || activeSession.classes.name;
        }

        return NextResponse.json(
          { 
            success: false, 
            error: `You are already checked into ${activeSubjectName}. Please check out first.` 
          },
          { status: 400 }
        );
      }

      // ✅ NEW: Create attendance record with online flag
      const attendance = await db.classattendance.create({
        data: {
          trainer_id: user.id,
          class_id: slot.class_id,
          date: currentDate,
          check_in_time: currentTime,
          timetable_slot_id: timetable_slot_id,
          status: checkInStatus.isLate ? 'Late' : 'Present',
          location_verified: isOnlineSession ? false : (isMobileRequest ? true : false), // ✅ NEW
          is_online_attendance: isOnlineSession, // ✅ NEW: Mark as online attendance
          check_in_latitude: isOnlineSession ? null : body.location?.latitude, // ✅ NEW: No GPS for online
          check_in_longitude: isOnlineSession ? null : body.location?.longitude, // ✅ NEW: No GPS for online
          work_attendance_id: workAttendance?.id || null // ✅ NEW: Can be null for online
        }
      });

      const subjectName = slot.subjects?.name || slot.classes?.name;
      const sessionType = isOnlineSession ? ' (Online)' : '';
      const responseMessage = checkInStatus.isLate 
        ? `Checked in late to ${subjectName}${sessionType}`
        : `Checked in to ${subjectName}${sessionType}`;

      if (isMobileRequest) {
        return NextResponse.json({
          success: true,
          message: responseMessage,
          data: {
            timestamp: currentTime,
            type: body.type,
            timetable_slot_id,
            class_name: slot.classes?.name,
            subject_name: slot.subjects?.name,
            room_name: slot.rooms?.name,
            location_verified: !isOnlineSession && isMobileRequest, // ✅ NEW
            is_online_session: isOnlineSession, // ✅ NEW
            is_late: checkInStatus.isLate,
            check_in_time: currentTime
          }
        });
      } else {
        return NextResponse.json({
          success: true,
          message: responseMessage,
          attendance: {
            id: attendance.id,
            class: slot.classes,
            subject: slot.subjects,
            room: slot.rooms,
            check_in_time: currentTime.toISOString(),
            is_late: checkInStatus.isLate,
            is_online_session: isOnlineSession // ✅ NEW
          }
        });
      }

    } else if (normalizedAction === 'check-out') {
      if (!existingAttendance?.check_in_time) {
        return NextResponse.json(
          { success: false, error: 'You must check in before checking out' },
          { status: 400 }
        );
      }

      if (existingAttendance.check_out_time) {
        return NextResponse.json(
          { success: false, error: 'You have already checked out of this class' },
          { status: 400 }
        );
      }

      // Calculate duration
      const timeDiff = currentTime.getTime() - existingAttendance.check_in_time.getTime();
      const minutesDiff = Math.floor(timeDiff / (1000 * 60));
      const hoursDiff = Math.floor(minutesDiff / 60);
      const remainingMinutes = minutesDiff % 60;

      // ✅ NEW: Update with online-aware GPS data
      await db.classattendance.update({
        where: { id: existingAttendance.id },
        data: {
          check_out_time: currentTime,
          auto_checkout: false,
          check_out_latitude: isOnlineSession ? null : body.location?.latitude, // ✅ NEW
          check_out_longitude: isOnlineSession ? null : body.location?.longitude // ✅ NEW
        }
      });

      const duration = `${hoursDiff}h ${remainingMinutes}m`;
      const subjectName = slot.subjects?.name || slot.classes?.name;
      const sessionType = isOnlineSession ? ' (Online)' : '';

      if (isMobileRequest) {
        return NextResponse.json({
          success: true,
          message: `Checked out from ${subjectName}${sessionType}`,
          data: {
            timestamp: currentTime,
            type: body.type,
            timetable_slot_id,
            class_name: slot.classes?.name,
            subject_name: slot.subjects?.name,
            location_verified: !isOnlineSession && isMobileRequest, // ✅ NEW
            is_online_session: isOnlineSession, // ✅ NEW
            check_out_time: currentTime,
            duration
          }
        });
      } else {
        return NextResponse.json({
          success: true,
          message: `Successfully checked out from ${subjectName}${sessionType}`,
          duration,
          is_online_session: isOnlineSession // ✅ NEW
        });
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Class attendance error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0].message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to record class attendance' },
      { status: 500 }
    );
  }
}

// PATCH /api/attendance/class-checkin - Manual checkout (web only)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const user = await getAuthenticatedUser(request);
    const { attendance_id, action } = body;

    if (action !== 'check-out') {
      return NextResponse.json(
        { success: false, error: 'Invalid action for PATCH request' },
        { status: 400 }
      );
    }

    if (!attendance_id) {
      return NextResponse.json(
        { success: false, error: 'attendance_id is required' },
        { status: 400 }
      );
    }

    const attendance = await db.classattendance.findFirst({
      where: {
        id: attendance_id,
        trainer_id: user.id
      },
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    });

    if (!attendance) {
      return NextResponse.json(
        { success: false, error: 'Attendance record not found' },
        { status: 404 }
      );
    }

    // If there's a timetable_slot_id, fetch the subject name and online status
    let subjectName = null;
    let isOnlineSession = false;
    if (attendance.timetable_slot_id) {
      const slot = await db.timetableslots.findUnique({
        where: { id: attendance.timetable_slot_id },
        include: {
          subjects: {
            select: {
              name: true
            }
          }
        }
      });
      subjectName = slot?.subjects?.name;
      isOnlineSession = slot?.is_online_session || false; // ✅ NEW
    }

    const nowInKenya = DateTime.now().setZone('Africa/Nairobi');
    const currentTime = nowInKenya.toJSDate();

    await db.classattendance.update({
      where: { id: attendance_id },
      data: {
        check_out_time: currentTime,
        auto_checkout: false
      }
    });

    const displayName = subjectName || attendance.classes.name;
    const sessionType = isOnlineSession ? ' (Online)' : ''; // ✅ NEW

    return NextResponse.json({
      success: true,
      message: `Successfully checked out of ${displayName}${sessionType}`
    });

  } catch (error) {
    console.error('Class check-out error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to check out of class' },
      { status: 500 }
    );
  }
}