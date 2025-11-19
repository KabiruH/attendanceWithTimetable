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
import { Clock, MapPin, User, Calendar, Trash2, BookOpen, GraduationCap } from "lucide-react";
import { TimetableSlot } from '@/lib/types/timetable';


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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Timetable Slot Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Subject Information - Primary */}
          <div className="space-y-3 pb-4 border-b">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                  <h3 className="text-xl font-bold text-gray-900">{slot.subjects.name}</h3>
                </div>
                <p className="text-sm text-gray-600 font-medium">{slot.subjects.code}</p>
                {slot.subjects.description && (
                  <p className="text-sm text-gray-600 mt-2">{slot.subjects.description}</p>
                )}
              </div>
              <Badge variant={getStatusBadge(slot.status)}>
                {slot.status.charAt(0).toUpperCase() + slot.status.slice(1)}
              </Badge>
            </div>

            {/* Subject Department & Credit Hours */}
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1 text-gray-600">
                <span className="font-medium">Department:</span>
                <span>{slot.subjects.department}</span>
              </div>
              {slot.subjects.credit_hours && (
                <div className="flex items-center gap-1 text-gray-600">
                  <span className="font-medium">Credit Hours:</span>
                  <span>{slot.subjects.credit_hours}h</span>
                </div>
              )}
            </div>
          </div>

          {/* Class Information - Secondary */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-medium text-blue-900">Class</p>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="font-semibold text-blue-900">{slot.classes.name}</p>
              <Badge variant="outline" className="text-xs">
                {slot.classes.code}
              </Badge>
            </div>
            {slot.classes.description && (
              <p className="text-xs text-blue-800 mt-1">{slot.classes.description}</p>
            )}
          </div>

          {/* Schedule Details Grid */}
          <div className="grid grid-cols-1 gap-4 p-4 bg-gray-50 rounded-lg">
            {/* Day & Time */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100">
                <Clock className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Schedule</p>
                <p className="text-sm font-medium">
                  {daysOfWeek[slot.day_of_week]}, {slot.lessonperiods.name}
                </p>
                <p className="text-xs text-gray-600">
                  {formatTime(slot.lessonperiods.start_time)} - {formatTime(slot.lessonperiods.end_time)}
                  {' '}({slot.lessonperiods.duration} minutes)
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
                <p className="text-sm font-medium">{slot.rooms.name}</p>
                <p className="text-xs text-gray-600">
                  {slot.rooms.room_type && `${slot.rooms.room_type}`}
                  {slot.rooms.capacity && ` • Capacity: ${slot.rooms.capacity}`}
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
                <p className="text-sm font-medium">{slot.users.name}</p>
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
            <div className="flex gap-2">
              {isAdmin && (
                <Button
                  variant="default"
                  onClick={() => {
                    onUpdate();
                    onOpenChange(false);
                  }}
                >
                  Edit Slot
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}