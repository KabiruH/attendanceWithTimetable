// components/dashboard/admin/AdminPersonalAttendance.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Timer, GraduationCap, User, MapPin, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import TimetableClassCheckInModal from '../employee/TimetableClassCheckInModal';
import ActiveClassSessionCard from '../employee/ActiveClassSessionCard';
import { checkLocationWithDistance } from '@/lib/geofence';

interface LocationResult {
  isWithinArea: boolean;
  distanceFromCenter: number;
  distanceFromEdge: number;
  userLocation: { latitude: number; longitude: number };
  formattedDistance: string;
}

interface AdminPersonalAttendanceProps {
  employee_id: string | null;
  userRole?: string | null;
  isAdminTrainer?: boolean;
}

interface UpcomingClass {
  id: string;
  timetable_slot_id: string;
  class: { name: string; code: string };
  subject: { name: string; code: string };
  room: { name: string };
  startTimeFormatted: string;
  endTimeFormatted: string;
  isHappeningNow: boolean;
  isToday: boolean;
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
  checkInStatus: {
    canCheckIn: boolean;
    status: string;
    message: string;
  };
  minutesUntilStart: number;
}

const AdminPersonalAttendance: React.FC<AdminPersonalAttendanceProps> = ({
  employee_id,
  userRole,
  isAdminTrainer = false
}) => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [todayHours, setTodayHours] = useState('-');
  const [showClassModal, setShowClassModal] = useState(false);
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string>('');
  
  // Timetable-based class attendance state
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [currentClass, setCurrentClass] = useState<UpcomingClass | null>(null);
  const [nextClass, setNextClass] = useState<UpcomingClass | null>(null);
  const [todayClassHours, setTodayClassHours] = useState('-');
  const [isClassLoading, setIsClassLoading] = useState(false);
  const [activeClassSessions, setActiveClassSessions] = useState<any[]>([]);
  
  const { toast } = useToast();

  // Check location function
  const checkUserLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    
    try {
      const result = await checkLocationWithDistance();
      setLocationResult(result);
    } catch (error: any) {
      console.error('Error checking location:', error);
      setLocationError(error.message || 'Could not verify location');
      setLocationResult(null);
    } finally {
      setLocationLoading(false);
    }
  };

  // Fetch upcoming classes from timetable
  const fetchUpcomingClasses = async () => {
    if (!employee_id) return;

    try {
      const response = await fetch('/api/attendance/upcoming-classes', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUpcomingClasses(data.upcoming || []);
        setCurrentClass(data.current || null);
        setNextClass(data.next || null);
      }
    } catch (error) {
      console.error('Error fetching upcoming classes:', error);
    }
  };

  // Fetch class attendance status
  const fetchClassAttendanceStatus = async () => {
    if (!employee_id) return;

    try {
      const response = await fetch('/api/attendance/class-status', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setActiveClassSessions(data.activeClassSessions || []);
        
        // Calculate today's class hours
        if (data.stats?.hoursThisMonth) {
          setTodayClassHours(data.stats.hoursThisMonth);
        }
      }
    } catch (error) {
      console.error('Error fetching class status:', error);
    }
  };

const fetchPersonalAttendanceStatus = async () => {
  if (!employee_id) return;

  try {
    let response = await fetch('/api/attendance/status', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      response = await fetch('/api/attendance', {
        method: 'GET',
        credentials: 'include',
      });
    }

    if (response.ok) {
      const data = await response.json();
      
      // MORE ROBUST CHECK FOR CHECKED IN STATUS
      let checkedInStatus = false;
      
      // Check multiple possible response structures
      if (data.isCheckedIn !== undefined) {
        checkedInStatus = data.isCheckedIn;
      } else if (data.personalAttendance && data.personalAttendance.length > 0) {
        // Check if there's an active session today
        const today = new Date().toISOString().split('T')[0];
        const todayRecord = data.personalAttendance.find((record: any) => 
          record.date.startsWith(today)
        );
        
        if (todayRecord) {
          // If has check_in_time but no check_out_time, user is checked in
          checkedInStatus = !!todayRecord.check_in_time && !todayRecord.check_out_time;
        }
      } else if (data.attendanceData && data.attendanceData.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const todayRecord = data.attendanceData.find((record: any) => 
          record.date.startsWith(today)
        );
        
        if (todayRecord) {
          checkedInStatus = !!todayRecord.check_in_time && !todayRecord.check_out_time;
        }
      }
      
      console.log('Check-in status determined:', checkedInStatus); // DEBUG LOG
      setIsCheckedIn(checkedInStatus);
      
      // Calculate today's hours
      const attendanceToCheck = data.personalAttendance || data.attendanceData;
      if (attendanceToCheck && attendanceToCheck.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const todayRecord = attendanceToCheck.find((record: any) => 
          record.date.startsWith(today)
        );
        
        if (todayRecord) {
          let hours = 0;
          if (todayRecord.sessions && Array.isArray(todayRecord.sessions)) {
            hours = calculateTotalHoursFromSessions(todayRecord.sessions);
          } else if (todayRecord.check_in_time) {
            const checkIn = new Date(todayRecord.check_in_time);
            const checkOut = todayRecord.check_out_time ? new Date(todayRecord.check_out_time) : new Date();
            hours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
          }
          
          const hoursInt = Math.floor(hours);
          const minutes = Math.floor((hours - hoursInt) * 60);
          setTodayHours(`${hoursInt}h ${minutes}m`);
        } else {
          setTodayHours('0h 0m');
        }
      } else {
        setTodayHours('0h 0m');
      }
    }
  } catch (error) {
    console.error('Error fetching personal attendance:', error);
  }
};

  const calculateTotalHoursFromSessions = (sessions: any[]): number => {
    if (!sessions || sessions.length === 0) return 0;
    
    let totalMinutes = 0;
    sessions.forEach(session => {
      if (session.check_in) {
        const checkIn = new Date(session.check_in);
        const checkOut = session.check_out ? new Date(session.check_out) : new Date();
        const diffInMs = checkOut.getTime() - checkIn.getTime();
        const diffInMinutes = Math.max(0, Math.floor(diffInMs / (1000 * 60)));
        totalMinutes += diffInMinutes;
      }
    });
    
    return totalMinutes / 60;
  };

const handleAttendance = async (action: 'check-in' | 'check-out') => {
  if (!locationResult?.isWithinArea) {
    toast({
      title: 'Location Required',
      description: `You must be on campus to mark attendance. Currently ${locationResult?.formattedDistance || 'location unknown'}.`,
      variant: 'destructive',
    });
    return;
  }

  setIsLoading(true);
  try {
    if (!employee_id) throw new Error('Employee ID is missing');

    const response = await fetch('/api/attendance', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        action, 
        employee_id,
        locationInfo: locationResult
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to process attendance');
    }

    const result = await response.json();
    console.log('Attendance response:', result); // DEBUG LOG

    // SET STATE IMMEDIATELY
    const newCheckedInState = action === 'check-in';
    setIsCheckedIn(newCheckedInState);

    // THEN FETCH TO UPDATE HOURS
    await fetchPersonalAttendanceStatus();

    toast({
      title: 'Success',
      description: `Successfully ${action === 'check-in' ? 'checked in' : 'checked out'}`,
    });

  } catch (error) {
    console.error('Error handling attendance:', error);
    toast({
      title: 'Error',
      description: error instanceof Error ? error.message : 'Failed to process attendance',
      variant: 'destructive',
    });
  } finally {
    setIsLoading(false);
  }
};

  const handleClassCheckInClick = () => {
    if (!locationResult?.isWithinArea) {
      toast({
        title: 'Location Required',
        description: `You must be on campus to check into classes. Currently ${locationResult?.formattedDistance || 'location unknown'}.`,
        variant: 'destructive',
      });
      return;
    }
    
    setShowClassModal(true);
  };

  const handleClassCheckIn = async (timetableSlotId: string) => {
    if (!locationResult?.isWithinArea) {
      toast({
        title: 'Location Required',
        description: 'You must be on campus to check into classes.',
        variant: 'destructive',
      });
      return;
    }

    setIsClassLoading(true);
    try {
      const response = await fetch('/api/attendance/class-checkin', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timetable_slot_id: timetableSlotId,
          action: 'check-in'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to check in to class');
      }

      const data = await response.json();
      
      toast({
        title: 'Success',
        description: data.message || 'Successfully checked in to class',
      });

      // Refresh data
      await fetchUpcomingClasses();
      await fetchClassAttendanceStatus();
      setShowClassModal(false);

    } catch (error) {
      console.error('Error checking into class:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check in to class',
        variant: 'destructive',
      });
    } finally {
      setIsClassLoading(false);
    }
  };

  const handleClassCheckOut = async (attendanceId: number) => {
    setIsClassLoading(true);
    try {
      const response = await fetch('/api/attendance/class-checkin', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attendance_id: attendanceId,
          action: 'check-out'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to check out of class');
      }

      const data = await response.json();
      
      toast({
        title: 'Success',
        description: data.message || 'Successfully checked out of class',
      });

      // Refresh data
      await fetchUpcomingClasses();
      await fetchClassAttendanceStatus();

    } catch (error) {
      console.error('Error checking out of class:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check out of class',
        variant: 'destructive',
      });
    } finally {
      setIsClassLoading(false);
    }
  };

  const getLocationStatusIcon = () => {
    if (locationLoading) return <RefreshCw className="w-4 h-4 animate-spin" />;
    if (locationError) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (!locationResult) return <MapPin className="w-4 h-4 text-gray-500" />;
    return locationResult.isWithinArea 
      ? <MapPin className="w-4 h-4 text-green-600" />
      : <AlertTriangle className="w-4 h-4 text-orange-600" />;
  };

  const getLocationStatusColor = () => {
    if (locationLoading) return 'bg-blue-50 border-blue-200';
    if (locationError) return 'bg-red-50 border-red-200';
    if (!locationResult) return 'bg-gray-50 border-gray-200';
    return locationResult.isWithinArea 
      ? 'bg-green-50 border-green-200' 
      : 'bg-orange-50 border-orange-200';
  };

  const getLocationStatusText = () => {
    if (locationLoading) return 'Checking location...';
    if (locationError) return 'Location unavailable';
    if (!locationResult) return 'Location unknown';
    return locationResult.formattedDistance;
  };

  const canMarkAttendance = locationResult?.isWithinArea && !locationLoading && !locationError;

  // Get classes available for check-in
  const availableClasses = upcomingClasses.filter(c => 
    c.checkInStatus.canCheckIn && !c.hasCheckedIn
  );

  useEffect(() => {
    fetchPersonalAttendanceStatus();
    checkUserLocation();
    
    if (isAdminTrainer) {
      fetchUpcomingClasses();
      fetchClassAttendanceStatus();
    }
    
    // Refresh every 2 minutes
    const interval = setInterval(() => {
      fetchPersonalAttendanceStatus();
      checkUserLocation();
      if (isAdminTrainer) {
        fetchUpcomingClasses();
        fetchClassAttendanceStatus();
      }
    }, 120000);
    
    return () => clearInterval(interval);
  }, [employee_id, isAdminTrainer]);

  return (
    <div className="space-y-4">
      {/* Location Status Alert */}
      <Alert className={`${getLocationStatusColor()}`}>
        <div className="flex items-center space-x-2">
          {getLocationStatusIcon()}
          <AlertDescription className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">Location Status: {getLocationStatusText()}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={checkUserLocation}
                disabled={locationLoading}
                className="h-6 px-2"
              >
                <RefreshCw className={`w-3 h-3 ${locationLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {!canMarkAttendance && (
              <p className="text-sm mt-1 text-gray-600">
                You must be on campus to mark attendance or check into classes.
              </p>
            )}
          </AlertDescription>
        </div>
      </Alert>

      {/* Work Attendance Card */}
      <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600">
          <CardTitle className="text-white flex items-center">
            <User className="w-5 h-5 mr-2" />
            Your Personal Attendance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Work Attendance Section */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Work Attendance</h3>
              <div className="flex space-x-3 mb-4">
                <Button
                  size="lg"
                  onClick={() => handleAttendance('check-in')}
                  disabled={isCheckedIn || isLoading || !canMarkAttendance}
                  className={`flex-1 transform hover:scale-105 transition-transform duration-200 ${
                    isCheckedIn || !canMarkAttendance ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {isLoading ? 'Processing...' : 'Check In'}
                </Button>
                <Button
                  size="lg"
                  onClick={() => handleAttendance('check-out')}
                  disabled={!isCheckedIn || isLoading || !canMarkAttendance}
                  className={`flex-1 transform hover:scale-105 transition-transform duration-200 ${
                    !isCheckedIn || !canMarkAttendance ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isLoading ? 'Processing...' : 'Check Out'}
                </Button>
              </div>
              
              {!canMarkAttendance && (
                <p className="text-xs text-gray-500 text-center mb-3">
                  {locationLoading ? 'Checking location...' : 'Must be on campus to mark attendance'}
                </p>
              )}
              
              {/* Today's Work Hours */}
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Work Hours Today</p>
                <div className="flex items-center justify-center space-x-2">
                  <Timer className="w-5 h-5 text-blue-600" />
                  <span className={`text-2xl font-bold ${
                    isCheckedIn ? 'text-blue-600' : 'text-gray-700'
                  }`}>
                    {todayHours}
                  </span>
                  {isCheckedIn && (
                    <span className="text-sm text-blue-500">(ongoing)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Class Attendance Section - Only for admin-trainers */}
            {isAdminTrainer && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Class Training</h3>
                <div className="flex justify-center mb-4">
                  <Button
                    size="lg"
                    onClick={handleClassCheckInClick}
                    disabled={!isCheckedIn || isClassLoading || !canMarkAttendance || availableClasses.length === 0}
                    className={`w-full transform hover:scale-105 transition-transform duration-200 ${
                      !isCheckedIn || !canMarkAttendance || availableClasses.length === 0
                        ? 'bg-gray-400' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    <GraduationCap className="w-4 h-4 mr-2" />
                    {isClassLoading ? 'Processing...' : 'Check into Class'}
                  </Button>
                </div>
                
                {!isCheckedIn && (
                  <p className="text-xs text-gray-500 text-center mb-3">
                    Check into work first to access classes
                  </p>
                )}

                {isCheckedIn && !canMarkAttendance && (
                  <p className="text-xs text-gray-500 text-center mb-3">
                    Must be on campus to check into classes
                  </p>
                )}

                {isCheckedIn && canMarkAttendance && availableClasses.length === 0 && (
                  <p className="text-xs text-gray-500 text-center mb-3">
                    No classes available for check-in right now
                  </p>
                )}

                {/* Next Class Info */}
                {nextClass && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                    <div className="flex items-center text-xs text-blue-700 mb-1">
                      <Clock className="w-3 h-3 mr-1" />
                      <span className="font-medium">Next Class:</span>
                    </div>
                    <p className="text-sm font-semibold text-blue-900">
                      {nextClass.subject.name}
                    </p>
                    <p className="text-xs text-blue-600">
                      {nextClass.startTimeFormatted} • {nextClass.room.name}
                    </p>
                    <p className="text-xs text-blue-500 mt-1">
                      {nextClass.checkInStatus.message}
                    </p>
                  </div>
                )}

                {/* Today's Class Hours */}
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Class Hours Today</p>
                  <div className="flex items-center justify-center space-x-2">
                    <GraduationCap className="w-5 h-5 text-green-600" />
                    <span className="text-2xl font-bold text-green-600">
                      {todayClassHours}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Class Sessions */}
      {isAdminTrainer && activeClassSessions.length > 0 && (
        <ActiveClassSessionCard
          activeClassSessions={activeClassSessions}
          onClassCheckOut={handleClassCheckOut}
          isLoading={isClassLoading}
        />
      )}

      {/* Class Check-in Modal */}
      {isAdminTrainer && (
        <TimetableClassCheckInModal
          isOpen={showClassModal}
          onClose={() => setShowClassModal(false)}
          onCheckIn={handleClassCheckIn}
          isLoading={isClassLoading}
          availableClasses={availableClasses}
          currentClass={currentClass}
        />
      )}
    </div>
  );
};

export default AdminPersonalAttendance;