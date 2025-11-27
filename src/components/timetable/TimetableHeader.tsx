// components/timetable/TimetableHeader.tsx
'use client';
import { Button } from "@/components/ui/button";
import { PlusCircle, Calendar, BookOpen } from "lucide-react";

interface TimetableHeaderProps {
  isAdmin: boolean;
  onGenerateTimetable: () => void;
  onCreateSlot: () => void;
}

export default function TimetableHeader({
  isAdmin,
  onGenerateTimetable,
  onCreateSlot,
}: TimetableHeaderProps) {
  return (
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-blue-600" />
          Timetable Management
        </h1>
        <p className="text-sm text-gray-600">
          {isAdmin ? 'Manage all subject schedules' : 'View and reschedule your subjects'}
        </p>
      </div>
      
      {isAdmin && (
        <div className="flex gap-2">
          <Button onClick={onGenerateTimetable}>
            <Calendar className="mr-2 h-4 w-4" />
            Generate Timetable
          </Button>
          <Button onClick={onCreateSlot}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Slot
          </Button>
        </div>
      )}
    </div>
  );
}