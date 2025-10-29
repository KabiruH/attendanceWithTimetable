// components/timetable/SlotDetailsDialog.tsx
'use client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, User, Calendar, Trash2 } from "lucide-react";

interface TimetableSlot {
  id: string;
  class_id: number;
  employee_id: number;
  room_id: number;
  lesson_period_id: number;
  day_of_week: number;
  status: string;
  class: {
    name: string;
    code: string;
    description: string;
    department: string;
    duration_hours: number;
  };
  room: {
    name: string;
    capacity: number;
    room_type: string;
  };
  lessonPeriod: {
    name: string;
    start_time: Date;
    end_time: Date;
    duration: number;
  };
  trainer: {
    name: string;
  };
}

interface SlotDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: TimetableSlot;
  onDelete: () => void;
  onUpdate: () => void;
  isAdmin: boolean;
}

export default function SlotDetailsDialog({
  open,
  onOpenChange,
  slot,
  onDelete,
  onUpdate,
  isAdmin
}: SlotDetailsDialogProps) {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const formatTime = (dateTime: Date) => {
    return new Date(dateTime).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      'scheduled': 'default',
      'cancelled': 'destructive',
      'completed': 'secondary',
    };
    return variants[status] || 'outline';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Class Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Class Information */}
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{slot.class.name}</h3>
                <p className="text-sm text-gray-600">{slot.class.code}</p>
              </div>
              <Badge variant={getStatusBadge(slot.status)}>
                {slot.status.charAt(0).toUpperCase() + slot.status.slice(1)}
              </Badge>
            </div>

            {slot.class.description && (
              <p className="text-sm text-gray-600">{slot.class.description}</p>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 gap-4 p-4 bg-gray-50 rounded-lg">
            {/* Department */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Department</p>
                <p className="text-sm font-medium">{slot.class.department}</p>
              </div>
            </div>

            {/* Day & Time */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100">
                <Clock className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Day & Time</p>
                <p className="text-sm font-medium">
                  {daysOfWeek[slot.day_of_week]}, {slot.lessonPeriod.name}
                </p>
                <p className="text-xs text-gray-600">
                  {formatTime(slot.lessonPeriod.start_time)} - {formatTime(slot.lessonPeriod.end_time)}
                  {' '}({slot.lessonPeriod.duration} minutes)
                </p>
              </div>
            </div>

            {/* Room */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100">
                <MapPin className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Room</p>
                <p className="text-sm font-medium">{slot.room.name}</p>
                <p className="text-xs text-gray-600">
                  {slot.room.room_type && `${slot.room.room_type}`}
                  {slot.room.capacity && ` • Capacity: ${slot.room.capacity}`}
                </p>
              </div>
            </div>

            {/* Trainer */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100">
                <User className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Trainer</p>
                <p className="text-sm font-medium">{slot.trainer.name}</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between gap-2 pt-4 border-t">
            <div>
              {isAdmin && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    onDelete();
                    onOpenChange(false);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Slot
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}