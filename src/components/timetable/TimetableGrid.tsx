// components/timetable/TimetableGrid.tsx
'use client';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, MapPin, User } from "lucide-react";

interface TimetableSlot {
  id: string;
  class_id: number;
  employee_id: number;
  room_id: number;
  lesson_period_id: number;
  day_of_week: number;
  status: string;
  class: {
    id: number;
    name: string;
    code: string;
    department: string;
  };
  room: {
    id: number;
    name: string;
  };
  lessonPeriod: {
    id: number;
    name: string;
    start_time: Date;
    end_time: Date;
  };
  trainer: {
    id: number;
    name: string;
    department: string;
  };
}

interface TimetableGridProps {
  slots: TimetableSlot[];
  currentWeek: {
    start: Date;
    end: Date;
    weekNumber: number;
  };
  onSlotMove?: (slotId: string, newDayOfWeek: number, newPeriodId: number) => void;
  onSlotClick: (slot: TimetableSlot) => void;
  isAdmin: boolean;
  userId: number;
}

export default function TimetableGrid({
  slots,
  currentWeek,
  onSlotMove,
  onSlotClick,
  isAdmin,
  userId
}: TimetableGridProps) {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Get unique lesson periods from slots
  const lessonPeriods = Array.from(
    new Map(
      slots.map(slot => [
        slot.lesson_period_id,
        slot.lessonPeriod
      ])
    ).values()
  ).sort((a, b) => {
    const timeA = new Date(a.start_time).getTime();
    const timeB = new Date(b.start_time).getTime();
    return timeA - timeB;
  });

  // Group slots by day and period
  const slotsByDayAndPeriod = new Map<string, TimetableSlot>();
  slots.forEach(slot => {
    const key = `${slot.day_of_week}-${slot.lesson_period_id}`;
    slotsByDayAndPeriod.set(key, slot);
  });

  // Format time
  const formatTime = (time: Date) => {
    return new Date(time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Get slot for specific day and period
  const getSlot = (day: number, periodId: number): TimetableSlot | undefined => {
    const key = `${day}-${periodId}`;
    return slotsByDayAndPeriod.get(key);
  };

  // Check if slot belongs to current user (admin's own class)
  const isOwnSlot = (slot: TimetableSlot): boolean => {
    return slot.employee_id === userId;
  };

  // Get card styling based on ownership
  const getCardStyle = (slot: TimetableSlot) => {
    const isOwn = isOwnSlot(slot);
    
    if (isOwn && isAdmin) {
      // Admin's own classes - distinctive blue/purple gradient
      return {
        className: "bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-400 hover:shadow-lg transition-all cursor-pointer",
        badgeClassName: "bg-blue-500"
      };
    } else if (isOwn) {
      // Regular user's classes - green
      return {
        className: "bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400 hover:shadow-lg transition-all cursor-pointer",
        badgeClassName: "bg-green-500"
      };
    } else {
      // Other classes - neutral gray
      return {
        className: "bg-white hover:bg-gray-50 border hover:shadow-md transition-all cursor-pointer",
        badgeClassName: "bg-gray-500"
      };
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (lessonPeriods.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-gray-500">No timetable slots found for this week.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      {isAdmin && (
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border text-sm">
          <span className="font-semibold text-gray-700">Legend:</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-400"></div>
            <span className="text-gray-600">Your Classes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-white border"></div>
            <span className="text-gray-600">Other Classes</span>
          </div>
        </div>
      )}

      {/* Timetable Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <div className="grid grid-cols-[150px_repeat(7,minmax(180px,1fr))] gap-2">
            {/* Header Row - Days */}
            <div className="bg-gray-100 p-3 rounded-lg font-semibold text-center sticky left-0 z-10">
              Time / Day
            </div>
            {daysOfWeek.map((day, index) => (
              <div
                key={day}
                className="bg-gray-100 p-3 rounded-lg font-semibold text-center"
              >
                <div>{day}</div>
                <div className="text-xs text-gray-500 font-normal mt-1">
                  {new Date(currentWeek.start.getTime() + index * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              </div>
            ))}

            {/* Time Rows */}
            {lessonPeriods.map((period) => (
              <div key={period.id} className="contents">
                {/* Period Time Label */}
                <div className="bg-gray-50 p-3 rounded-lg border flex flex-col justify-center sticky left-0 z-10">
                  <div className="font-semibold text-sm">{period.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(period.start_time)} - {formatTime(period.end_time)}
                  </div>
                </div>

                {/* Slots for each day */}
                {daysOfWeek.map((_, dayIndex) => {
                  const slot = getSlot(dayIndex, period.id);
                  const cardStyle = slot ? getCardStyle(slot) : null;

                  return (
                    <div key={`${dayIndex}-${period.id}`} className="min-h-[120px]">
                      {slot ? (
                        <Card
                          className={cardStyle?.className}
                          onClick={() => onSlotClick(slot)}
                        >
                          <CardContent className="p-3 space-y-2">
                            {/* Class Info */}
                            <div>
                              <div className="font-semibold text-sm line-clamp-1">
                                {slot.class.name}
                              </div>
                              <div className="text-xs text-gray-500 font-mono">
                                {slot.class.code}
                              </div>
                            </div>

                            {/* Trainer */}
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <User className="h-3 w-3" />
                              <span className="line-clamp-1">{slot.trainer.name}</span>
                              {isOwnSlot(slot) && isAdmin && (
                                <Badge className="ml-1 text-[10px] px-1 py-0 h-4 bg-blue-500">
                                  You
                                </Badge>
                              )}
                            </div>

                            {/* Room */}
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <MapPin className="h-3 w-3" />
                              <span>{slot.room.name}</span>
                            </div>

                            {/* Department & Status */}
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {slot.class.department}
                              </Badge>
                              <Badge className={`text-[10px] px-1 py-0 ${getStatusColor(slot.status)}`}>
                                {slot.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="border-2 border-dashed border-gray-200 rounded-lg h-full min-h-[120px] flex items-center justify-center text-gray-400 text-xs">
                          Free
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}