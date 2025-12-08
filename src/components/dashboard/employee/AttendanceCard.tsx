// components/dashboard/employee/AttendanceCard.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Timer, BookOpen, MapPin, AlertTriangle, RefreshCw, Clock, Calendar } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";
import TimetableClassCheckInModal from './TimetableClassCheckInModal';
import { checkLocationWithDistance } from '@/lib/geofence';

interface LocationResult {
  isWithinArea: boolean;
  distanceFromCenter: number;
  distanceFromEdge: number;
  userLocation: { latitude: number; longitude: number };
  formattedDistance: string;
}

interface UpcomingClass {
  id: string;
  timetable_slot_id: string;
  subject: {
    name: string;
    code: string;
  };
  class: {
    name: string;
  };
  room: {
    name: string;
  };
  startTimeFormatted: string;
  endTimeFormatted: string;
  isHappeningNow: boolean;
  hasCheckedIn: boolean;
  checkInStatus: {
    canCheckIn: boolean;
    status: string;
    message: string;
    isLate?: boolean;
  };
  minutesUntilStart: number;
}

interface AttendanceCardProps {
  isCheckedIn: boolean;
  isLoading: boolean;
  todayHours: string;
  onCheckIn: () => void;
  onCheckOut: () => void;
  userRole?: string;
  isClassLoading?: boolean;
  hasActiveSession?: boolean;
  activeSessionName?: string;
  employeeId?: string | null;
}

const AttendanceCard: React.FC<AttendanceCardProps> = ({
  isCheckedIn,
  isLoading,
  todayHours,
  onCheckIn,
  onCheckOut,
  userRole,
  isClassLoading = false,
  hasActiveSession = false,
  activeSessionName = '',
  employeeId
}) => {
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string>('');
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [currentClass, setCurrentClass] = useState<UpcomingClass | null>(null);
  const [nextClass, setNextClass] = useState<UpcomingClass | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const { toast } = useToast();

  // Check if user is a trainer
  const isTrainer = userRole === 'admin' || userRole === 'employee' || userRole === 'trainer';

  // Fetch upcoming schedule
  const fetchUpcomingSchedule = async () => {
    if (!employeeId || !isTrainer) return;
    
    setLoadingSchedule(true);
    try {
      const response = await fetch('/api/attendance/upcoming-classes?limit=5', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentClass(data.current || null);
        setNextClass(data.next || null);
        setUpcomingClasses(data.todayRemaining?.slice(0, 3) || []);
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
    } finally {
      setLoadingSchedule(false);
    }
  };

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

  // Enhanced check-in handler with location verification
  const handleCheckIn = () => {
    if (!locationResult?.isWithinArea) {
      toast({
        title: 'Location Required',
        description: `You must be on campus to check in. Currently ${locationResult?.formattedDistance || 'location unknown'}.`,
        variant: 'destructive',
      });
      return;
    }
    onCheckIn();
  };

  // Enhanced check-out handler with location verification
  const handleCheckOut = () => {
    if (!locationResult?.isWithinArea) {
      toast({
        title: 'Location Required',
        description: `You must be on campus to check out. Currently ${locationResult?.formattedDistance || 'location unknown'}.`,
        variant: 'destructive',
      });
      return;
    }
    onCheckOut();
  };

  const handleQuickCheckIn = async (timetableSlotId: string) => {
    if (!locationResult?.isWithinArea) {
      toast({
        title: 'Location Required',
        description: 'You must be on campus to check into subjects.',
        variant: 'destructive',
      });
      return;
    }

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
        throw new Error(errorData.error || 'Failed to check in');
      }

      const result = await response.json();
      
      toast({
        title: 'Success',
        description: result.message || 'Successfully checked in to subject',
      });

      // Refresh schedule
      await fetchUpcomingSchedule();
    } catch (error) {
      console.error('Error checking in:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check in',
        variant: 'destructive',
      });
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500';
      case 'late':
        return 'bg-orange-500';
      default:
        return 'bg-blue-500';
    }
  };

  const canMarkAttendance = locationResult?.isWithinArea && !locationLoading && !locationError;

  useEffect(() => {
    checkUserLocation();
    
    // Refresh location every 5 minutes
    const locationInterval = setInterval(checkUserLocation, 300000);
    return () => clearInterval(locationInterval);
  }, []);

  useEffect(() => {
    if (isTrainer && isCheckedIn) {
      fetchUpcomingSchedule();
      
      // Refresh schedule every 2 minutes
      const scheduleInterval = setInterval(fetchUpcomingSchedule, 120000);
      return () => clearInterval(scheduleInterval);
    }
  }, [isTrainer, isCheckedIn, employeeId]);

  return (
    <>
      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardTitle className="font-bold text-slate-900 flex items-center justify-between">
            <span>Attendance</span>
            {isCheckedIn && (
              <span className="text-sm font-normal text-green-600 flex items-center gap-1">
                <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                Checked In
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 bg-white">
          {/* Location Status */}
          <Alert className={`mb-4 ${getLocationStatusColor()}`}>
            <div className="flex items-center space-x-2">
              {getLocationStatusIcon()}
              <AlertDescription className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    Location: {getLocationStatusText()}
                  </span>
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
                  <p className="text-xs mt-1 text-gray-600">
                    You must be on campus to mark attendance.
                  </p>
                )}
              </AlertDescription>
            </div>
          </Alert>

          {/* Work Attendance Section */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Work Attendance</h3>
            <div className="flex justify-center space-x-4 mb-4">
              <Button
                size="lg"
                onClick={handleCheckIn}
                disabled={isCheckedIn || isLoading || !canMarkAttendance}
                className={`w-32 font-bold ${
                  isCheckedIn || !canMarkAttendance ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isLoading ? 'Processing...' : 'Check In'}
              </Button>
              <Button
                size="lg"
                onClick={handleCheckOut}
                disabled={!isCheckedIn || isLoading || !canMarkAttendance}
                className={`w-32 font-bold ${
                  !isCheckedIn || !canMarkAttendance ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isLoading ? 'Processing...' : 'Check Out'}
              </Button>
            </div>

            {!canMarkAttendance && (
              <p className="text-xs text-gray-500 text-center mb-3">
                {locationLoading ? 'Checking location...' : 'Must be on campus to mark work attendance'}
              </p>
            )}
           
            {/* Today's Hours Display */}
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Today's Hours</p>
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

          {/* Subject Schedule Section - Only show for trainers who are checked in */}
          {isTrainer && isCheckedIn && (
            <>
              <hr className="my-4 border-gray-200" />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    My Teaching Schedule
                  </h3>
                 
                </div>

                {/* Current Subject */}
                {currentClass && (
                  <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                          <span className="text-xs font-semibold text-purple-900">HAPPENING NOW</span>
                          <Badge className="bg-purple-600 text-xs">Live</Badge>
                        </div>
                        <p className="font-semibold text-sm">{currentClass.subject.name}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                          <span>{currentClass.startTimeFormatted} - {currentClass.endTimeFormatted}</span>
                          <span>•</span>
                          <span>{currentClass.room.name}</span>
                          <span>•</span>
                          <span>{currentClass.class.name}</span>
                        </div>
                      </div>
                      {!currentClass.hasCheckedIn && currentClass.checkInStatus.canCheckIn && (
                        <Button
                          size="sm"
                          onClick={() => handleQuickCheckIn(currentClass.timetable_slot_id)}
                          disabled={!canMarkAttendance}
                          className={`ml-2 ${
                            currentClass.checkInStatus.isLate 
                              ? 'bg-orange-600 hover:bg-orange-700' 
                              : 'bg-purple-600 hover:bg-purple-700'
                          }`}
                        >
                          {currentClass.checkInStatus.isLate ? 'Check In (Late)' : 'Check In Now'}
                        </Button>
                      )}
                      {currentClass.hasCheckedIn && (
                        <Badge className="bg-green-600">Checked In</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Next Subject */}
                {nextClass && !currentClass && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3 h-3 text-blue-600" />
                          <span className="text-xs font-semibold text-blue-900">NEXT UP</span>
                        </div>
                        <p className="font-semibold text-sm">{nextClass.subject.name}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                          <span>{nextClass.startTimeFormatted}</span>
                          <span>•</span>
                          <span>{nextClass.room.name}</span>
                          <span>•</span>
                          <span>{nextClass.class.name}</span>
                        </div>
                        <p className="text-xs text-blue-600 mt-1">
                          {nextClass.checkInStatus.message}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upcoming Subjects List */}
                {upcomingClasses.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600 mb-2">Upcoming Today</p>
                    {upcomingClasses.map((classItem) => (
                      <div
                        key={classItem.timetable_slot_id}
                        className={`flex items-center justify-between p-2 rounded border transition-colors ${
                          classItem.hasCheckedIn 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div 
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getStatusColor(classItem.checkInStatus.status)}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs truncate">{classItem.subject.name}</p>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span>{classItem.startTimeFormatted}</span>
                              <span>•</span>
                              <span className="truncate">{classItem.room.name}</span>
                            </div>
                          </div>
                        </div>
                        {classItem.hasCheckedIn ? (
                          <Badge className="bg-green-600 text-xs ml-2">Checked In</Badge>
                        ) : classItem.checkInStatus.canCheckIn && (
                          <Button
                            size="sm"
                            onClick={() => handleQuickCheckIn(classItem.timetable_slot_id)}
                            disabled={!canMarkAttendance}
                            className={`text-xs h-7 ml-2 ${
                              classItem.checkInStatus.isLate 
                                ? 'bg-orange-600 hover:bg-orange-700' 
                                : 'bg-green-600 hover:bg-green-700'
                            }`}
                          >
                            Check In
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* No Schedule */}
                {!loadingSchedule && !currentClass && !nextClass && upcomingClasses.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs">No subjects scheduled for today</p>
                  </div>
                )}

                {/* Loading */}
                {loadingSchedule && (
                  <div className="text-center py-4">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                  </div>
                )}

                {/* Requirements */}
                {!canMarkAttendance && (
                  <p className="text-xs text-gray-500 text-center mt-3">
                    Must be on campus to check into subjects
                  </p>
                )}
              </div>
            </>
          )}

          {/* Message when not checked in */}
          {isTrainer && !isCheckedIn && (
            <>
              <hr className="my-4 border-gray-200" />
              <div className="text-center py-4">
                <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-600 mb-1">Check in to work to view your teaching schedule</p>
                <p className="text-xs text-gray-500">Your subjects and timetable will appear here</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Full Schedule Modal */}
   {isTrainer && (
  <TimetableClassCheckInModal
          isOpen={showScheduleModal}
          onClose={() => {
            setShowScheduleModal(false);
            fetchUpcomingSchedule(); // Refresh schedule when modal closes
          } }
          onCheckIn={async (timetableSlotId: string) => {
            await handleQuickCheckIn(timetableSlotId);
            setShowScheduleModal(false);
          } }
          isLoading={isClassLoading} availableClasses={[]} currentClass={null}  />
)}
    </>
  );
};

export default AttendanceCard;