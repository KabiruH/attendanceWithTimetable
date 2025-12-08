// components/dashboard/employee/TimetableClassCheckInModal.tsx
'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Clock, MapPin, BookOpen, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Class {
  name: string;
  code: string;
}

interface Subject {
  name: string;
  code: string;
}

interface Room {
  name: string;
}

interface CheckInStatus {
  canCheckIn: boolean;
  status: string;
  message: string;
  isLate?: boolean;
}

interface AvailableClass {
  id: string;
  timetable_slot_id: string;
  class: Class;
  subject: Subject;
  room: Room;
  startTimeFormatted: string;
  endTimeFormatted: string;
  isHappeningNow: boolean;
  isToday: boolean;
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
  checkInStatus: CheckInStatus;
  minutesUntilStart: number;
}

interface TimetableClassCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckIn: (timetableSlotId: string) => void;
  isLoading: boolean;
  availableClasses: AvailableClass[];
  currentClass: AvailableClass | null;
}

const TimetableClassCheckInModal: React.FC<TimetableClassCheckInModalProps> = ({
  isOpen,
  onClose,
  onCheckIn,
  isLoading,
  availableClasses,
  currentClass
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'late':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'upcoming':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'late':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <BookOpen className="w-5 h-5 mr-2 text-blue-600" />
            Check Into Class
          </DialogTitle>
          <DialogDescription>
            Select a class from your timetable to check in
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Current Class Happening Now */}
          {currentClass && (
            <Alert className="bg-purple-50 border-purple-200">
              <AlertCircle className="h-4 w-4 text-purple-600" />
              <AlertDescription className="text-purple-900">
                <span className="font-semibold">Class in Progress:</span> {currentClass.subject.name} is happening now in {currentClass.room.name}
              </AlertDescription>
            </Alert>
          )}

          {/* No Available Classes */}
          {availableClasses.length === 0 && !currentClass && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No classes are available for check-in at this time. Classes become available 15 minutes before they start.
              </AlertDescription>
            </Alert>
          )}

          {/* Available Classes List */}
          {availableClasses.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 font-medium">
                Available Classes ({availableClasses.length})
              </p>
              
              {availableClasses.map((classItem) => (
                <Card
                  key={classItem.timetable_slot_id}
                  className="p-4 hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      {/* Subject and Class Name */}
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">
                          {classItem.subject.name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {classItem.class.name} ({classItem.class.code})
                        </p>
                      </div>

                      {/* Time and Location */}
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1.5 text-blue-600" />
                          <span>
                            {classItem.startTimeFormatted} - {classItem.endTimeFormatted}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-1.5 text-blue-600" />
                          <span>{classItem.room.name}</span>
                        </div>
                      </div>

                      {/* Check-in Status */}
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(classItem.checkInStatus.status)}`}>
                        {getStatusIcon(classItem.checkInStatus.status)}
                        <span>{classItem.checkInStatus.message}</span>
                      </div>

                      {/* Additional Info */}
                      {classItem.isHappeningNow && (
                        <div className="text-xs text-purple-600 font-medium">
                          • Class is in progress
                        </div>
                      )}
                      {!classItem.isHappeningNow && classItem.minutesUntilStart > 0 && (
                        <div className="text-xs text-gray-500">
                          • Starts in {classItem.minutesUntilStart} minutes
                        </div>
                      )}
                    </div>

                    {/* Check In Button */}
                    <Button
                      onClick={() => onCheckIn(classItem.timetable_slot_id)}
                      disabled={isLoading || !classItem.checkInStatus.canCheckIn || classItem.hasCheckedIn}
                      className={`ml-4 ${
                        classItem.checkInStatus.isLate 
                          ? 'bg-orange-600 hover:bg-orange-700' 
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {isLoading ? (
                        'Processing...'
                      ) : classItem.hasCheckedIn ? (
                        'Checked In'
                      ) : classItem.checkInStatus.isLate ? (
                        'Check In (Late)'
                      ) : (
                        'Check In'
                      )}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Info Footer */}
          <Alert className="bg-blue-50 border-blue-200">
            <Clock className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900 text-xs">
              <span className="font-semibold">Check-in Window:</span> You can check in 15 minutes before class starts. Late check-ins are allowed up to 10 minutes after class begins.
            </AlertDescription>
          </Alert>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TimetableClassCheckInModal;