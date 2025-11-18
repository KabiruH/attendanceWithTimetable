// components/timetable/ClassSlot.tsx
'use client';
import { Clock, MapPin, User, BookOpen } from "lucide-react";

interface TimetableSlot {
  id: string;
  class_id: number;
  subject_id: number;
  employee_id: number;
  status: string;
  class: {
    name: string;
    code: string;
    department: string;
  };
  subject: {
    name: string;
    code: string;
    department: string;
    credit_hours?: number | null;
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
      'Information Technology': 'bg-indigo-100 border-indigo-300',
      'IT': 'bg-indigo-100 border-indigo-300',
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
        ${getDepartmentColor(slot.subject.department)}
        ${getStatusColor(slot.status)}
        ${isOwnSlot ? 'ring-2 ring-blue-400' : ''}
      `}
    >
      {/* Subject Code - Primary */}
      <div className="font-bold text-sm text-gray-900 mb-1 flex items-center gap-1">
        <BookOpen className="h-3 w-3" />
        {slot.subject.code}
      </div>

      {/* Subject Name */}
      <div className="text-xs font-medium text-gray-800 mb-1 line-clamp-2">
        {slot.subject.name}
      </div>

      {/* Class Info - Secondary */}
      <div className="text-xs text-gray-600 mb-2 flex items-center gap-1">
        <span className="bg-white/50 px-1.5 py-0.5 rounded">
          {slot.class.code}
        </span>
        <span className="truncate">• {slot.class.name}</span>
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

      {/* Credit Hours (optional) */}
      {slot.subject.credit_hours && (
        <div className="text-xs text-gray-500 mt-1">
          {slot.subject.credit_hours}h
        </div>
      )}

      {/* Status Badge */}
      {slot.status !== 'scheduled' && (
        <div className="mt-2">
          <span className={`
            text-xs px-2 py-0.5 rounded-full font-medium
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