// components/lesson-periods/CreateLessonPeriodDialog.tsx
'use client';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Info } from "lucide-react";

interface LessonPeriod {
  id: number;
  name: string;
  start_time: Date;
  end_time: Date;
  duration: number;
  is_active: boolean;
  start_time_formatted?: string;
  end_time_formatted?: string;
}

interface CreateLessonPeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingPeriod: LessonPeriod | null;
}

export default function CreateLessonPeriodDialog({
  open,
  onOpenChange,
  onSuccess,
  editingPeriod,
}: CreateLessonPeriodDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    start_time: '',
    end_time: '',
  });

  const [calculatedDuration, setCalculatedDuration] = useState('');

  useEffect(() => {
    if (editingPeriod) {
      const formatTimeForInput = (time: Date | string) => {
        if (typeof time === 'string') return time.slice(0, 5);
        return new Date(time).toTimeString().slice(0, 5);
      };

      setFormData({
        name: editingPeriod.name,
        start_time: editingPeriod.start_time_formatted || formatTimeForInput(editingPeriod.start_time),
        end_time: editingPeriod.end_time_formatted || formatTimeForInput(editingPeriod.end_time),
      });
    } else {
      resetForm();
    }
  }, [editingPeriod, open]);

  useEffect(() => {
    // Calculate duration when times change
    if (formData.start_time && formData.end_time) {
      const start = new Date(`1970-01-01T${formData.start_time}:00`);
      const end = new Date(`1970-01-01T${formData.end_time}:00`);
      
      if (start < end) {
        const diffMs = end.getTime() - start.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        
        if (hours > 0 && mins > 0) {
          setCalculatedDuration(`${hours}h ${mins}m`);
        } else if (hours > 0) {
          setCalculatedDuration(`${hours}h`);
        } else {
          setCalculatedDuration(`${mins}m`);
        }
      } else {
        setCalculatedDuration('');
      }
    } else {
      setCalculatedDuration('');
    }
  }, [formData.start_time, formData.end_time]);

  const resetForm = () => {
    setFormData({
      name: '',
      start_time: '',
      end_time: '',
    });
    setError('');
    setCalculatedDuration('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Validation
      if (!formData.name.trim()) {
        throw new Error('Period name is required');
      }

      if (!formData.start_time || !formData.end_time) {
        throw new Error('Start time and end time are required');
      }

      const start = new Date(`1970-01-01T${formData.start_time}:00`);
      const end = new Date(`1970-01-01T${formData.end_time}:00`);

      if (start >= end) {
        throw new Error('Start time must be before end time');
      }

      const url = editingPeriod 
        ? `/api/lesson-periods/${editingPeriod.id}` 
        : '/api/lesson-periods';
      const method = editingPeriod ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          start_time: formData.start_time,
          end_time: formData.end_time,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save lesson period');
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save lesson period');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  // Quick fill buttons for common periods
  const quickFillOptions = [
    { label: 'Period 1', start: '08:00', end: '09:30' },
    { label: 'Period 2', start: '09:45', end: '11:15' },
    { label: 'Period 3', start: '11:30', end: '13:00' },
    { label: 'Period 4', start: '14:00', end: '15:30' },
    { label: 'Period 5', start: '15:45', end: '17:15' },
  ];

  const handleQuickFill = (option: { label: string; start: string; end: string }) => {
    setFormData({
      name: option.label,
      start_time: option.start,
      end_time: option.end,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {editingPeriod ? 'Edit Lesson Period' : 'Create New Lesson Period'}
          </DialogTitle>
          <DialogDescription>
            Define a time slot for scheduling classes during the day
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Quick Fill Buttons */}
          {!editingPeriod && (
            <div className="space-y-2">
              <Label className="text-sm text-gray-600">Quick Fill (Optional)</Label>
              <div className="flex flex-wrap gap-2">
                {quickFillOptions.map((option) => (
                  <Button
                    key={option.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickFill(option)}
                    className="text-xs"
                  >
                    {option.label} ({option.start}-{option.end})
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Period Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Period Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Period 1, Morning Session, etc."
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Start Time *</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) =>
                  setFormData({ ...formData, start_time: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">End Time *</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) =>
                  setFormData({ ...formData, end_time: e.target.value })
                }
                required
              />
            </div>
          </div>

          {/* Duration Display */}
          {calculatedDuration && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4 text-blue-600" />
                <span className="text-blue-900">
                  Duration: <strong>{calculatedDuration}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-gray-50 border rounded-lg p-3 text-xs text-gray-600">
            <p className="font-semibold mb-1">💡 Tips:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Period times should not overlap with existing periods</li>
              <li>Consider break times between consecutive periods</li>
              <li>Standard periods are typically 60-90 minutes long</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : editingPeriod
                ? 'Update Period'
                : 'Create Period'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}