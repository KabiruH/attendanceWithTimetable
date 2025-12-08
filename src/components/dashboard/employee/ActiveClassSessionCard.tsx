// components/dashboard/employee/ActiveClassSessionCard.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, BookOpen, CheckCircle2, AlertCircle } from 'lucide-react';

interface ClassSession {
  id: number;
  class_id: number;
  timetable_slot_id: string | null;
  check_in_time: Date;
  check_out_time: Date | null;
  status: string;
  auto_checkout: boolean;
  location_verified: boolean;
  classes: {
    name: string;
    code: string;
  };
  subject?: {
    name: string;
    code: string;
  } | null;
}

interface ActiveClassSessionCardProps {
  activeClassSessions: ClassSession[];
  onClassCheckOut: (attendanceId: number) => void;
  isLoading: boolean;
}

const ActiveClassSessionCard: React.FC<ActiveClassSessionCardProps> = ({
  activeClassSessions,
  onClassCheckOut,
  isLoading
}) => {
  // Calculate duration for active session
  const calculateDuration = (checkInTime: Date): string => {
    const now = new Date();
    const checkIn = new Date(checkInTime);
    const diffMs = now.getTime() - checkIn.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours === 0) {
      return `${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
  };

  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'Late':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (activeClassSessions.length === 0) {
    return null;
  }

  return (
    <Card className="shadow-lg border-l-4 border-l-green-500">
      <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
        <CardTitle className="text-green-800 flex items-center">
          <CheckCircle2 className="w-5 h-5 mr-2" />
          Active Class Sessions ({activeClassSessions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {activeClassSessions.map((session) => (
            <div
              key={session.id}
              className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  {/* Class Info */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold text-lg text-gray-900">
                        {session.subject?.name || session.classes.name}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 ml-7">
                      {session.classes.name} ({session.classes.code})
                    </p>
                  </div>

                  {/* Status and Time Info */}
                  <div className="flex flex-wrap items-center gap-3 ml-7">
                    {/* Status Badge */}
                    <Badge className={`${getStatusColor(session.status)} border`}>
                      {session.status}
                    </Badge>

                    {/* Check-in Time */}
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-1.5" />
                      <span>Checked in: {formatTime(session.check_in_time)}</span>
                    </div>

                    {/* Duration */}
                    <div className="flex items-center text-sm font-medium text-green-700">
                      <Clock className="w-4 h-4 mr-1.5" />
                      <span>{calculateDuration(session.check_in_time)}</span>
                    </div>

                    {/* Location Verified */}
                    {session.location_verified && (
                      <div className="flex items-center text-xs text-green-600">
                        <MapPin className="w-3 h-3 mr-1" />
                        <span>Location verified</span>
                      </div>
                    )}
                  </div>

                  {/* Auto-checkout Warning */}
                  {session.auto_checkout && (
                    <div className="flex items-center text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-1.5 ml-7">
                      <AlertCircle className="w-3 h-3 mr-1.5" />
                      <span>Auto-checkout scheduled</span>
                    </div>
                  )}
                </div>

                {/* Check Out Button */}
                <Button
                  onClick={() => onClassCheckOut(session.id)}
                  disabled={isLoading}
                  className="ml-4 bg-red-600 hover:bg-red-700"
                  size="lg"
                >
                  {isLoading ? 'Processing...' : 'Check Out'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Info */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span className="font-medium">Active Sessions:</span>
            <span className="font-bold text-green-700">
              {activeClassSessions.length} {activeClassSessions.length === 1 ? 'class' : 'classes'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ActiveClassSessionCard;