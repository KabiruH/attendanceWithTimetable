// components/timetable/CreateSlotDialog.tsx
'use client';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CreateSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  selectedTerm: number | null;
}

interface Class {
  id: number;
  name: string;
  code: string;
}

interface Trainer {
  id: number;
  name: string;
}

interface Room {
  id: number;
  name: string;
}

interface LessonPeriod {
  id: number;
  name: string;
  start_time_formatted: string;
  end_time_formatted: string;
}

export default function CreateSlotDialog({
  open,
  onOpenChange,
  onSuccess,
  selectedTerm
}: CreateSlotDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Form data
  const [formData, setFormData] = useState({
    class_id: '',
    employee_id: '',
    room_id: '',
    lesson_period_id: '',
    day_of_week: '',
  });

  // Options
  const [classes, setClasses] = useState<Class[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [lessonPeriods, setLessonPeriods] = useState<LessonPeriod[]>([]);

  const daysOfWeek = [
    { value: '0', label: 'Sunday' },
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
  ];

  useEffect(() => {
    if (open) {
      fetchOptions();
    }
  }, [open]);

  const fetchOptions = async () => {
    try {
      // Fetch classes
      const classesRes = await fetch('/api/classes');
      const classesData = await classesRes.json();
      setClasses(classesData.data || classesData);

      // Fetch trainers (employees)
      const trainersRes = await fetch('/api/users?role=employee');
      const trainersData = await trainersRes.json();
      setTrainers(trainersData);

      // Fetch rooms
      const roomsRes = await fetch('/api/rooms');
      const roomsData = await roomsRes.json();
      setRooms(roomsData.data);

      // Fetch lesson periods
      const periodsRes = await fetch('/api/lesson-periods');
      const periodsData = await periodsRes.json();
      setLessonPeriods(periodsData.data);
    } catch (error) {
      console.error('Error fetching options:', error);
      setError('Failed to load form options');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (!selectedTerm) {
        throw new Error('No term selected');
      }

      const response = await fetch('/api/timetable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          term_id: selectedTerm,
          class_id: parseInt(formData.class_id),
          employee_id: parseInt(formData.employee_id),
          room_id: parseInt(formData.room_id),
          lesson_period_id: parseInt(formData.lesson_period_id),
          day_of_week: parseInt(formData.day_of_week),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create slot');
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create slot');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      class_id: '',
      employee_id: '',
      room_id: '',
      lesson_period_id: '',
      day_of_week: '',
    });
    setError('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Timetable Slot</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Class Selection */}
          <div className="space-y-2">
            <Label htmlFor="class">Class *</Label>
            <Select
              value={formData.class_id}
              onValueChange={(value) => setFormData({ ...formData, class_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id.toString()}>
                    {cls.code} - {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Trainer Selection */}
          <div className="space-y-2">
            <Label htmlFor="trainer">Trainer *</Label>
            <Select
              value={formData.employee_id}
              onValueChange={(value) => setFormData({ ...formData, employee_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select trainer" />
              </SelectTrigger>
              <SelectContent>
                {trainers.map((trainer) => (
                  <SelectItem key={trainer.id} value={trainer.id.toString()}>
                    {trainer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day Selection */}
          <div className="space-y-2">
            <Label htmlFor="day">Day of Week *</Label>
            <Select
              value={formData.day_of_week}
              onValueChange={(value) => setFormData({ ...formData, day_of_week: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select day" />
              </SelectTrigger>
              <SelectContent>
                {daysOfWeek.map((day) => (
                  <SelectItem key={day.value} value={day.value}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lesson Period Selection */}
          <div className="space-y-2">
            <Label htmlFor="period">Lesson Period *</Label>
            <Select
              value={formData.lesson_period_id}
              onValueChange={(value) => setFormData({ ...formData, lesson_period_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {lessonPeriods.map((period) => (
                  <SelectItem key={period.id} value={period.id.toString()}>
                    {period.name} ({period.start_time_formatted} - {period.end_time_formatted})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Room Selection */}
          <div className="space-y-2">
            <Label htmlFor="room">Room *</Label>
            <Select
              value={formData.room_id}
              onValueChange={(value) => setFormData({ ...formData, room_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id.toString()}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Slot'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}