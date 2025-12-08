// components/dashboard/employee/ClassCheckInModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, GraduationCap, Calendar, MapPin, BookOpen, AlertCircle } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UpcomingClass {
  id: string;
  timetable_slot_id: string;
  class: {
    id: number;
    name: string;
    code: string;
    department: string;
  };
  subject: {
    id: number;
    name: string;
    code: string;
  };
  room: {
    id: number;
    name: string;
  };
  lessonPeriod: {
    name: string;
    start_time: Date;
    end_time: Date;
  };
  scheduledDate: string;
  startTimeFormatted: string;
  endTimeFormatted: string;
  dayName: string;
  isToday: boolean;
  isTomorrow: boolean;
  isHappeningNow: boolean;
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
  checkInStatus: {
    canCheckIn: boolean;
    status: string;
    message: string;
    isLate?: boolean;
  };
  minutesUntilStart: number;
  attendance?: any;
}

interface ClassCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckIn: (timetableSlotId: string) => void;
  isLoading: boolean;
  hasActiveSession?: boolean;
  activeSessionName?: string;
  employeeId?: string | null;
}

const ClassCheckInModal: React.FC<ClassCheckInModalProps> = ({
  isOpen,
  onClose,
  onCheckIn,
  isLoading,
  hasActiveSession = false,
  activeSessionName = '',
  employeeId,
}) => {
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [currentClass, setCurrentClass] = useState<UpcomingClass | null>(null);
  const [fetchingClasses, setFetchingClasses] = useState(false);
  const { toast } = useToast();

  const fetchUpcomingClasses = async () => {
    setFetchingClasses(true);
    try {
      const url = employeeId 
        ? `/api/attendance/upcoming-classes?employee_id=${employeeId}`
        : '/api/attendance/upcoming-classes';
      
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch upcoming classes');
      }

      const data = await response.json();
      
      setCurrentClass(data.current || null);
      setUpcomingClasses(data.upcoming || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your schedule',
        variant: 'destructive',
      });
    } finally {
      setFetchingClasses(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUpcomingClasses();
    }
  }, [isOpen]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'late':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'upcoming':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'closed':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return '✓';
      case 'late':
        return '⚠';
      case 'upcoming':
        return '⏱';
      default:
        return '○';
    }
  };

  // Filter to show only available classes (today + tomorrow, not checked out)
  const availableClasses = upcomingClasses.filter(c => 
    (c.isToday || c.isTomorrow) && !c.hasCheckedOut
  );

  // Separate classes that can be checked into now
  const checkInNow = availableClasses.filter(c => c.checkInStatus.canCheckIn && !c.hasCheckedIn);
  const alreadyCheckedIn = availableClasses.filter(c => c.hasCheckedIn && !c.hasCheckedOut);
  const notYetAvailable = availableClasses.filter(c => !c.checkInStatus.canCheckIn && !c.hasCheckedIn);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <GraduationCap className="w-5 h-5 text-blue-600" />
            <span>Check into Class</span>
          </DialogTitle>
          <DialogDescription>
            Select a class from your schedule to check in
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Current Class Happening Now */}
          {currentClass && (
            <Alert className="mb-4 bg-purple-50 border-purple-200">
              <AlertCircle className="h-4 w-4 text-purple-600" />
              <AlertDescription className="text-purple-900">
                <span className="font-semibold">Class in Progress:</span> {currentClass.subject.name} is happening now in {currentClass.room.name}
                {!currentClass.hasCheckedIn && currentClass.checkInStatus.canCheckIn && (
                  <span className="block text-sm mt-1">You can still check in!</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Active Session Warning */}
          {hasActiveSession && (
            <Alert className="mb-4 bg-orange-50 border-orange-200">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <span className="font-semibold">Active Session:</span> You are currently checked into {activeSessionName}. 
                You must check out first before joining another class.
              </AlertDescription>
            </Alert>
          )}

          {fetchingClasses ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading your schedule...</span>
            </div>
          ) : availableClasses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="font-medium">No classes scheduled</p>
              <p className="text-sm">You have no upcoming classes for today or tomorrow</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Classes Available for Check-In Now */}
              {checkInNow.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Available Now ({checkInNow.length})
                  </h3>
                  <div className="space-y-2">
                    {checkInNow.map((classItem) => (
                      <div
                        key={classItem.timetable_slot_id}
                        className="border rounded-lg p-4 hover:bg-gray-50 transition-colors border-l-4 border-l-green-500"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <BookOpen className="w-4 h-4 text-blue-600" />
                              <h3 className="font-semibold text-gray-900">
                                {classItem.subject.name}
                              </h3>
                            </div>
                            <p className="text-sm text-gray-600 ml-6">
                              {classItem.class.name} ({classItem.class.code})
                            </p>
                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 ml-6">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {classItem.startTimeFormatted} - {classItem.endTimeFormatted}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {classItem.room.name}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                          <div className={`text-xs px-2 py-1 rounded border ${getStatusColor(classItem.checkInStatus.status)}`}>
                            {getStatusIcon(classItem.checkInStatus.status)} {classItem.checkInStatus.message}
                          </div>

                          <Button
                            size="sm"
                            onClick={() => onCheckIn(classItem.timetable_slot_id)}
                            disabled={isLoading || hasActiveSession || !classItem.checkInStatus.canCheckIn}
                            className={`${
                              classItem.checkInStatus.isLate 
                                ? 'bg-orange-600 hover:bg-orange-700' 
                                : 'bg-green-600 hover:bg-green-700'
                            } ${hasActiveSession ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : classItem.checkInStatus.isLate ? (
                              'Check In (Late)'
                            ) : (
                              'Check In'
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Already Checked In */}
              {alreadyCheckedIn.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    Checked In ({alreadyCheckedIn.length})
                  </h3>
                  <div className="space-y-2">
                    {alreadyCheckedIn.map((classItem) => (
                      <div
                        key={classItem.timetable_slot_id}
                        className="border rounded-lg p-4 bg-blue-50 border-l-4 border-l-blue-500"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <BookOpen className="w-4 h-4 text-blue-600" />
                              <h3 className="font-semibold text-gray-900">
                                {classItem.subject.name}
                              </h3>
                              <Badge className="bg-blue-600">Active</Badge>
                            </div>
                            <p className="text-sm text-gray-600 ml-6">
                              {classItem.class.name} • {classItem.room.name}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Not Yet Available */}
              {notYetAvailable.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    Upcoming ({notYetAvailable.length})
                  </h3>
                  <div className="space-y-2">
                    {notYetAvailable.map((classItem) => (
                      <div
                        key={classItem.timetable_slot_id}
                        className="border rounded-lg p-4 bg-gray-50 opacity-75"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <BookOpen className="w-4 h-4 text-gray-500" />
                              <h3 className="font-medium text-gray-700">
                                {classItem.subject.name}
                              </h3>
                            </div>
                            <p className="text-sm text-gray-500 ml-6">
                              {classItem.class.name} • {classItem.room.name}
                            </p>
                            <p className="text-xs text-gray-400 ml-6 mt-1">
                              {classItem.startTimeFormatted} - {classItem.endTimeFormatted}
                            </p>
                          </div>
                          <div className="text-xs text-gray-500">
                            {classItem.checkInStatus.message}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info Footer */}
          {availableClasses.length > 0 && (
            <Alert className="mt-4 bg-blue-50 border-blue-200">
              <Clock className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900 text-xs">
                <strong>Check-in Window:</strong> You can check in 15 minutes before class starts. 
                Late check-ins are allowed up to 10 minutes after class begins.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClassCheckInModal;