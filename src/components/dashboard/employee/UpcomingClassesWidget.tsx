// components/dashboard/employee/UpcomingClassesWidget.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, BookOpen, MapPin, ChevronRight, Calendar } from 'lucide-react';
import TimetableClassCheckInModal from './TimetableClassCheckInModal';
import { useToast } from "@/components/ui/use-toast";

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
  startTimeFormatted: string;
  endTimeFormatted: string;
  isToday: boolean;
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
}

interface UpcomingClassesWidgetProps {
  employeeId: string | null;
  onClassCheckIn: () => void;
}

const UpcomingClassesWidget: React.FC<UpcomingClassesWidgetProps> = ({
  employeeId,
  onClassCheckIn
}) => {
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [currentClass, setCurrentClass] = useState<UpcomingClass | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (employeeId) {
      fetchUpcomingClasses();
      
      // Refresh every 2 minutes
      const interval = setInterval(fetchUpcomingClasses, 120000);
      return () => clearInterval(interval);
    }
  }, [employeeId]);

  const fetchUpcomingClasses = async () => {
    try {
      const response = await fetch('/api/attendance/upcoming-classes?limit=10', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentClass(data.current || null);
        setUpcomingClasses(data.todayRemaining || []);
      }
    } catch (error) {
      console.error('Error fetching upcoming classes:', error);
    }
  };

  const handleCheckIn = async (timetableSlotId: string) => {
    setIsLoading(true);
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

      const result = await response.json();
      
      toast({
        title: 'Success',
        description: result.message || 'Successfully checked in to class',
      });

      // Refresh data
      await fetchUpcomingClasses();
      await onClassCheckIn();
      setShowModal(false);
    } catch (error) {
      console.error('Error checking into class:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check in to class',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500';
      case 'late':
        return 'bg-orange-500';
      case 'upcoming':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Filter to show only classes that haven't been checked out
  const displayClasses = upcomingClasses.filter(c => !c.hasCheckedOut);

  if (displayClasses.length === 0 && !currentClass) return null;

  return (
    <>
      <Card className="border-l-4 border-l-blue-500 shadow-md">
        <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-blue-600" />
              Your Schedule Today
            </span>
            {displayClasses.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowModal(true)}
                className="text-blue-600 hover:text-blue-700"
              >
                View All ({displayClasses.length})
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Current Class Happening Now */}
          {currentClass && !currentClass.hasCheckedIn && (
            <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2 flex-1">
                  <div className="w-2 h-2 mt-1.5 bg-purple-600 rounded-full animate-pulse"></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-purple-900">Happening Now</span>
                      <Badge className="bg-purple-600">Live</Badge>
                    </div>
                    <p className="font-medium text-sm">{currentClass.subject.name}</p>
                    <p className="text-xs text-gray-600">
                      {currentClass.startTimeFormatted} - {currentClass.endTimeFormatted} • {currentClass.room.name}
                    </p>
                  </div>
                </div>
                {currentClass.checkInStatus.canCheckIn && (
                  <Button
                    size="sm"
                    onClick={() => handleCheckIn(currentClass.timetable_slot_id)}
                    disabled={isLoading}
                    className="bg-purple-600 hover:bg-purple-700 ml-2"
                  >
                    {isLoading ? 'Checking In...' : 'Check In Now'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Upcoming Classes */}
          <div className="space-y-2">
            {displayClasses.slice(0, 3).map((classItem) => (
              <div
                key={classItem.timetable_slot_id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  classItem.hasCheckedIn 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className="flex items-center gap-2 mt-1">
                    <div 
                      className={`w-2 h-2 rounded-full ${getStatusColor(classItem.checkInStatus.status)}`}
                    />
                    <BookOpen className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-sm truncate">{classItem.subject.name}</p>
                      {classItem.hasCheckedIn && (
                        <Badge className="bg-green-600 text-xs">Checked In</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {classItem.startTimeFormatted}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {classItem.room.name}
                      </span>
                    </div>
                    {!classItem.hasCheckedIn && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {classItem.checkInStatus.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Check In Button */}
                {!classItem.hasCheckedIn && classItem.checkInStatus.canCheckIn && (
                  <Button
                    size="sm"
                    onClick={() => handleCheckIn(classItem.timetable_slot_id)}
                    disabled={isLoading}
                    className={`ml-2 ${
                      classItem.checkInStatus.isLate 
                        ? 'bg-orange-600 hover:bg-orange-700' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {isLoading ? 'Processing...' : classItem.checkInStatus.isLate ? 'Check In (Late)' : 'Check In'}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Show More Indicator */}
          {displayClasses.length > 3 && (
            <div className="mt-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowModal(true)}
                className="text-blue-600 hover:text-blue-700 text-xs"
              >
                + {displayClasses.length - 3} more class{displayClasses.length - 3 !== 1 ? 'es' : ''} today
              </Button>
            </div>
          )}

          {/* No Classes Message */}
          {displayClasses.length === 0 && !currentClass && (
            <div className="text-center py-4 text-gray-500">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No more classes scheduled for today</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Schedule Modal */}
      <TimetableClassCheckInModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCheckIn={handleCheckIn}
        isLoading={isLoading}
        availableClasses={displayClasses}
        currentClass={currentClass}
      />
    </>
  );
};

export default UpcomingClassesWidget;