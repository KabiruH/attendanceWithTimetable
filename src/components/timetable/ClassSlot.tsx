// components/timetable/ClassSlot.tsx
'use client';
import { Clock, MapPin, User } from "lucide-react";

interface TimetableSlot {
  id: string;
  class_id: number;
  employee_id: number;
  status: string;
  class: {
    name: string;
    code: string;
    department: string;
  };
  room: {
    name: string;
  };
  trainer: {
    name: string;
  };
}

interface ClassSlotProps {
  slot: TimetableSlot;
  onClick: () => void;
  isAdmin: boolean;
  isOwnSlot: boolean;
}

export default function ClassSlot({ slot, onClick, isAdmin, isOwnSlot }: ClassSlotProps) {
  // Color based on department
  const getDepartmentColor = (department: string) => {
    const colors: Record<string, string> = {
      'Mathematics': 'bg-blue-100 border-blue-300',
      'Science': 'bg-green-100 border-green-300',
      'Engineering': 'bg-purple-100 border-purple-300',
      'Business': 'bg-yellow-100 border-yellow-300',
      'Arts': 'bg-pink-100 border-pink-300',
    };
    return colors[department] || 'bg-gray-100 border-gray-300';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'scheduled': 'border-l-4 border-l-blue-500',
      'cancelled': 'border-l-4 border-l-red-500 opacity-60',
      'completed': 'border-l-4 border-l-green-500',
    };
    return colors[status] || 'border-l-4 border-l-gray-500';
  };

  return (
    <div
      onClick={onClick}
      className={`
        p-3 rounded-md cursor-pointer transition-all hover:shadow-md
        ${getDepartmentColor(slot.class.department)}
        ${getStatusColor(slot.status)}
        ${isOwnSlot ? 'ring-2 ring-blue-400' : ''}
      `}
    >
      {/* Class Code */}
      <div className="font-semibold text-sm text-gray-900 mb-1">
        {slot.class.code}
      </div>

      {/* Class Name */}
      <div className="text-xs text-gray-700 mb-2 line-clamp-1">
        {slot.class.name}
      </div>

      {/* Room */}
      <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
        <MapPin className="h-3 w-3" />
        <span>{slot.room.name}</span>
      </div>

      {/* Trainer */}
      <div className="flex items-center gap-1 text-xs text-gray-600">
        <User className="h-3 w-3" />
        <span className="truncate">{slot.trainer.name}</span>
      </div>

      {/* Status Badge */}
      {slot.status !== 'scheduled' && (
        <div className="mt-2">
          <span className={`
            text-xs px-2 py-0.5 rounded-full
            ${slot.status === 'cancelled' ? 'bg-red-100 text-red-700' : ''}
            ${slot.status === 'completed' ? 'bg-green-100 text-green-700' : ''}
          `}>
            {slot.status.charAt(0).toUpperCase() + slot.status.slice(1)}
          </span>
        </div>
      )}
    </div>
  );
}