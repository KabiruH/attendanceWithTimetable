// components/dashboard/employee/ClassStatusCard.tsx
'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, Clock, LogOut, MapPin, BookOpen } from 'lucide-react';

interface ActiveClassSession {
  id: number;
  class_id: number;
  timetable_slot_id: string | null;
  check_in_time: Date;
  check_out_time?: Date | null;
  status: string;
  auto_checkout: boolean;
  location_verified: boolean;
  classes: {
    id: number;
    name: string;
    code: string;
    department: string;
  };
  subject?: {
    name: string;
    code: string;
  } | null;
  room?: {
    name: string;
  } | null;
}

interface ClassStatusCardProps {
  activeClassSessions: ActiveClassSession[];
  todayClassHours: string;
  onClassCheckOut: (attendanceId: number) => void;
  isLoading?: boolean;
}

const ClassStatusCard: React.FC<ClassStatusCardProps> = ({
  activeClassSessions,
  todayClassHours,
  onClassCheckOut,
  isLoading = false
}) => {
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const calculateDuration = (checkInTime: Date) => {
    const checkIn = new Date(checkInTime);
    const now = new Date();
    const diffMs = now.getTime() - checkIn.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present':
        return 'bg-green-600';
      case 'Late':
        return 'bg-orange-500';
      default:
        return 'bg-gray-600';
    }
  };

  if (activeClassSessions.length === 0) {
    return null; // Don't show the card if no active sessions
  }

  return (
    <Card className="shadow-lg border-l-4 border-l-green-500">
      <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
        <CardTitle className="text-green-800 flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <GraduationCap className="w-5 h-5" />
            <span>Active Classes</span>
          </span>
          <Badge className="bg-green-600">
            {activeClassSessions.length} Active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 bg-white">
        <div className="space-y-4">
          {activeClassSessions.map((session) => (
            <div
              key={session.id}
              className="border rounded-lg p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 hover:shadow-md transition-shadow"
            >
              {/* Subject and Class Info */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-green-600" />
                    <h3 className="font-semibold text-gray-900">
                      {session.subject?.name || session.classes.name}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 ml-6">
                    {session.classes.name} ({session.classes.code})
                  </p>
                  <p className="text-xs text-gray-500 ml-6">
                    {session.classes.department}
                  </p>
                </div>
                <Badge className={getStatusColor(session.status)}>
                  {session.status}
                </Badge>
              </div>

              {/* Time and Location Info */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-4 text-gray-600">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Started {formatTime(session.check_in_time)}</span>
                    </span>
                    <span className="text-green-700 font-semibold">
                      {calculateDuration(session.check_in_time)}
                    </span>
                  </div>
                </div>

                {/* Room and Location */}
                {session.room && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>{session.room.name}</span>
                    {session.location_verified && (
                      <Badge variant="outline" className="text-xs border-green-500 text-green-700">
                        ✓ Verified
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Check Out Button */}
              <div className="flex justify-end pt-2 border-t border-green-200">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onClassCheckOut(session.id)}
                  disabled={isLoading}
                  className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1.5" />
                  Check Out
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Today's Class Hours Summary */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4">
            <div className="text-center">
              <p className="text-sm text-gray-700 font-medium mb-2">Today's Total Class Hours</p>
              <div className="flex items-center justify-center space-x-2">
                <GraduationCap className="w-6 h-6 text-green-600" />
                <span className="text-3xl font-bold text-green-700">
                  {todayClassHours}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {activeClassSessions.length} {activeClassSessions.length === 1 ? 'session' : 'sessions'} in progress
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClassStatusCard;