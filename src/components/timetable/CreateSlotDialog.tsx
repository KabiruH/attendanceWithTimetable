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
import { BookOpen } from "lucide-react";

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
  department: string;
}

interface Subject {
  id: number;
  name: string;
  code: string;
  department: string;
  credit_hours: number | null;
}

interface ClassSubject {
  id: number;
  class_id: number;
  subject_id: number;
  subject: Subject;
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
  const [loadingClasses, setLoadingClasses] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    class_id: '',
    subject_id: '',
    employee_id: '',
    room_id: '',
    lesson_period_id: '',
    day_of_week: '',
  });

  // Options
  const [classes, setClasses] = useState<Class[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [lessonPeriods, setLessonPeriods] = useState<LessonPeriod[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

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
    if (open && selectedTerm) {
      fetchOptions();
      resetForm();
    }
  }, [open, selectedTerm]);

  // Fetch subjects when class is selected
  useEffect(() => {
    if (formData.class_id && selectedTerm) {
      fetchSubjectsForClass(parseInt(formData.class_id));
    } else {
      setAvailableSubjects([]);
      setFormData(prev => ({ ...prev, subject_id: '' }));
    }
  }, [formData.class_id, selectedTerm]);

  const fetchOptions = async () => {
    if (!selectedTerm) {
      setError('No term selected');
      return;
    }

    try {
      setLoadingClasses(true);

      // ✅ Fetch classes that have subjects assigned for this term
      const classesRes = await fetch(`/api/terms/${selectedTerm}/classes`);
      
      if (!classesRes.ok) {
        throw new Error('Failed to fetch classes for this term');
      }
      
      const classesData = await classesRes.json();
      console.log('📚 Classes for term:', classesData);
      
      setClasses(classesData.data || classesData || []);

      // Fetch trainers (employees)
      const trainersRes = await fetch('/api/users?role=employee&is_active=true');
      const trainersData = await trainersRes.json();
      setTrainers(trainersData || []);

      // Fetch rooms
      const roomsRes = await fetch('/api/rooms?is_active=true');
      const roomsData = await roomsRes.json();
      setRooms(roomsData.data || roomsData || []);

      // Fetch lesson periods
      const periodsRes = await fetch('/api/lesson-periods?is_active=true');
      const periodsData = await periodsRes.json();
      setLessonPeriods(periodsData.data || periodsData || []);
    } catch (error) {
      console.error('Error fetching options:', error);
      setError('Failed to load form options');
    } finally {
      setLoadingClasses(false);
    }
  };

  const fetchSubjectsForClass = async (classId: number) => {
    if (!selectedTerm) {
      setError('No term selected');
      return;
    }

    setLoadingSubjects(true);
    setError('');
    
    try {
      const response = await fetch(`/api/admin/classes/${classId}/subjects?term_id=${selectedTerm}`);
      const data = await response.json();
      
      console.log('📚 Subjects response:', data);
      
      if (response.ok) {
        // Extract subjects from response - handle both formats
        const subjects = data.map((item: any) => {
          // Handle format: { subject: {...} }
          if (item.subject) return item.subject;
          // Handle format: { subjects: {...} }
          if (item.subjects) return item.subjects;
          // Handle direct subject object
          return item;
        }).filter(Boolean);
        
        setAvailableSubjects(subjects);
      } else {
        setAvailableSubjects([]);
        console.warn('Failed to load subjects:', data);
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
      setAvailableSubjects([]);
      setError('Failed to load subjects');
    } finally {
      setLoadingSubjects(false);
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

      // Validate all required fields
      if (!formData.class_id || !formData.subject_id || !formData.employee_id || 
          !formData.room_id || !formData.lesson_period_id || formData.day_of_week === '') {
        throw new Error('Please fill in all required fields');
      }

      const response = await fetch('/api/timetable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          term_id: selectedTerm,
          class_id: parseInt(formData.class_id),
          subject_id: parseInt(formData.subject_id),
          employee_id: parseInt(formData.employee_id),
          room_id: parseInt(formData.room_id),
          lesson_period_id: parseInt(formData.lesson_period_id),
          day_of_week: parseInt(formData.day_of_week),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create slot');
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
      subject_id: '',
      employee_id: '',
      room_id: '',
      lesson_period_id: '',
      day_of_week: '',
    });
    setAvailableSubjects([]);
    setError('');
  };

  const selectedClass = classes.find(c => c.id.toString() === formData.class_id);
  const selectedSubject = availableSubjects.find(s => s.id.toString() === formData.subject_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Timetable Slot</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Term info banner */}
          {selectedTerm && (
            <Alert>
              <AlertDescription>
                Creating slot for <strong>selected term</strong>. Only classes and subjects assigned to this term are shown.
              </AlertDescription>
            </Alert>
          )}

          {/* Class Selection */}
          <div className="space-y-2">
            <Label htmlFor="class">Class *</Label>
            <Select
              value={formData.class_id}
              onValueChange={(value) => setFormData({ ...formData, class_id: value, subject_id: '' })}
              disabled={loadingClasses}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingClasses ? "Loading classes..." : "Select class first"} />
              </SelectTrigger>
              <SelectContent>
                {classes.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    {loadingClasses ? "Loading..." : "No classes with subjects assigned to this term"}
                  </div>
                ) : (
                  classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id.toString()}>
                      {cls.code} - {cls.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedClass && (
              <p className="text-xs text-muted-foreground">
                Department: {selectedClass.department}
              </p>
            )}
          </div>

          {/* Subject Selection */}
          <div className="space-y-2">
            <Label htmlFor="subject" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Subject *
            </Label>
            <Select
              value={formData.subject_id}
              onValueChange={(value) => setFormData({ ...formData, subject_id: value })}
              disabled={!formData.class_id || loadingSubjects}
            >
              <SelectTrigger>
                <SelectValue 
                  placeholder={
                    !formData.class_id 
                      ? "Select class first" 
                      : loadingSubjects 
                        ? "Loading subjects..." 
                        : "Select subject"
                  } 
                />
              </SelectTrigger>
              <SelectContent>
                {availableSubjects.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    {formData.class_id 
                      ? "No subjects assigned to this class for this term" 
                      : "Select a class first"}
                  </div>
                ) : (
                  availableSubjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id.toString()}>
                      <div className="flex flex-col">
                        <span className="font-medium">{subject.code} - {subject.name}</span>
                        {subject.credit_hours && (
                          <span className="text-xs text-muted-foreground">
                            {subject.credit_hours}h
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedSubject && (
              <div className="p-2 bg-blue-50 rounded text-xs space-y-1">
                <p><span className="font-medium">Subject:</span> {selectedSubject.name}</p>
                <p><span className="font-medium">Department:</span> {selectedSubject.department}</p>
                {selectedSubject.credit_hours && (
                  <p><span className="font-medium">Credit Hours:</span> {selectedSubject.credit_hours}h</p>
                )}
              </div>
            )}
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
                {trainers.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No trainers available
                  </div>
                ) : (
                  trainers.map((trainer) => (
                    <SelectItem key={trainer.id} value={trainer.id.toString()}>
                      {trainer.name}
                    </SelectItem>
                  ))
                )}
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
                {lessonPeriods.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No lesson periods configured
                  </div>
                ) : (
                  lessonPeriods.map((period) => (
                    <SelectItem key={period.id} value={period.id.toString()}>
                      {period.name} ({period.start_time_formatted} - {period.end_time_formatted})
                    </SelectItem>
                  ))
                )}
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
                {rooms.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No rooms available
                  </div>
                ) : (
                  rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id.toString()}>
                      {room.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
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
              disabled={isSubmitting || loadingClasses}
            >
              {isSubmitting ? 'Creating...' : 'Create Slot'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}