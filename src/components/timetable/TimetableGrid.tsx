// components/timetable/TimetableGrid.tsx
'use client';
import { useState, useEffect } from 'react';
import ClassSlot from './ClassSlot';

interface WeekInfo {
  start: Date;
  end: Date;
  weekNumber: number;
}

interface TimetableSlot {
  id: string;
  class_id: number;
  employee_id: number;
  room_id: number;
  lesson_period_id: number;
  day_of_week: number;
  status: string;
  class: any;
  room: any;
  lessonPeriod: any;
  trainer: any;
}

interface TimetableGridProps {
  slots: TimetableSlot[];
  currentWeek: WeekInfo;
  onSlotMove: (slotId: string, newDay: number, newPeriod: number) => void;
  onSlotClick: (slot: TimetableSlot) => void;
  isAdmin: boolean;
  userId: number;
}

interface LessonPeriod {
  id: number;
  name: string;
  start_time: Date;
  end_time: Date;
  duration: number;
}

export default function TimetableGrid({
  slots,
  currentWeek,
  onSlotMove,
  onSlotClick,
  isAdmin,
  userId
}: TimetableGridProps) {
  const [lessonPeriods, setLessonPeriods] = useState<LessonPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const daysOfWeek = [
    { name: 'Sunday', value: 0 },
    { name: 'Monday', value: 1 },
    { name: 'Tuesday', value: 2 },
    { name: 'Wednesday', value: 3 },
    { name: 'Thursday', value: 4 },
    { name: 'Friday', value: 5 },
    { name: 'Saturday', value: 6 }
  ];

  useEffect(() => {
    fetchLessonPeriods();
  }, []);

  const fetchLessonPeriods = async () => {
    try {
      const response = await fetch('/api/lesson-periods');
      if (!response.ok) throw new Error('Failed to fetch lesson periods');
      const data = await response.json();
      setLessonPeriods(data.data);
    } catch (error) {
      console.error('Error fetching lesson periods:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (dateTime: Date) => {
    return new Date(dateTime).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  // Get slot for specific day and period
  const getSlotForCell = (dayOfWeek: number, periodId: number): TimetableSlot | undefined => {
    return slots.find(
      slot => slot.day_of_week === dayOfWeek && slot.lesson_period_id === periodId
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="p-4 text-left font-semibold text-sm w-32">Time</th>
            {daysOfWeek.map((day) => (
              <th key={day.value} className="p-4 text-left font-semibold text-sm">
                <div>{day.name}</div>
                <div className="text-xs text-gray-500 font-normal">
                  {getDayDate(currentWeek.start, day.value)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lessonPeriods.map((period) => (
            <tr key={period.id} className="border-b hover:bg-gray-50">
              <td className="p-4 align-top border-r">
                <div className="text-sm font-medium">{period.name}</div>
                <div className="text-xs text-gray-500">
                  {formatTime(period.start_time)} - {formatTime(period.end_time)}
                </div>
                <div className="text-xs text-gray-400">{period.duration} min</div>
              </td>
              {daysOfWeek.map((day) => {
                const slot = getSlotForCell(day.value, period.id);
                return (
                  <td key={day.value} className="p-2 align-top border-r min-w-[180px]">
                    {slot ? (
                      <ClassSlot
                        slot={slot}
                        onClick={() => onSlotClick(slot)}
                        isAdmin={isAdmin}
                        isOwnSlot={slot.employee_id === userId}
                      />
                    ) : (
                      <div className="h-20"></div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {slots.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No timetable slots found for this week.
        </div>
      )}
    </div>
  );
}

function getDayDate(weekStart: Date, dayOfWeek: number): string {
  const date = new Date(weekStart);
  date.setDate(weekStart.getDate() + dayOfWeek);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}