// components/timetable/WeekNavigator.tsx
'use client';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeekInfo {
  start: Date;
  end: Date;
  weekNumber: number;
}

interface WeekNavigatorProps {
  currentWeek: WeekInfo;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

export default function WeekNavigator({ currentWeek, onPrevWeek, onNextWeek }: WeekNavigatorProps) {
  const formatDateRange = () => {
    const start = currentWeek.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = currentWeek.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} - ${end}`;
  };

  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
      <Button variant="outline" size="icon" onClick={onPrevWeek}>
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="text-center">
        <div className="text-lg font-semibold">Week {currentWeek.weekNumber}</div>
        <div className="text-sm text-gray-600">{formatDateRange()}</div>
      </div>

      <Button variant="outline" size="icon" onClick={onNextWeek}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}