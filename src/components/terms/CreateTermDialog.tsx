// components/terms/CreateTermDialog.tsx
'use client';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  working_days: number[];
  holidays: string[];
}

interface CreateTermDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingTerm: Term | null;
}

export default function CreateTermDialog({
  open,
  onOpenChange,
  onSuccess,
  editingTerm,
}: CreateTermDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    working_days: [1, 2, 3, 4, 5], // Default: Mon-Fri
    holidays: [] as string[],
  });

  const [holidayDate, setHolidayDate] = useState<Date>();

  const weekDays = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  useEffect(() => {
    if (editingTerm) {
      setFormData({
        name: editingTerm.name,
        start_date: editingTerm.start_date.split('T')[0],
        end_date: editingTerm.end_date.split('T')[0],
        working_days: editingTerm.working_days,
        holidays: editingTerm.holidays || [],
      });
    } else {
      resetForm();
    }
  }, [editingTerm, open]);

  const resetForm = () => {
    setFormData({
      name: '',
      start_date: '',
      end_date: '',
      working_days: [1, 2, 3, 4, 5],
      holidays: [],
    });
    setError('');
    setHolidayDate(undefined);
  };

  const handleWorkingDayToggle = (day: number) => {
    setFormData((prev) => {
      const workingDays = prev.working_days.includes(day)
        ? prev.working_days.filter((d) => d !== day)
        : [...prev.working_days, day].sort();
      return { ...prev, working_days: workingDays };
    });
  };

  const handleAddHoliday = () => {
    if (holidayDate) {
      const dateStr = format(holidayDate, 'yyyy-MM-dd');
      if (!formData.holidays.includes(dateStr)) {
        setFormData((prev) => ({
          ...prev,
          holidays: [...prev.holidays, dateStr].sort(),
        }));
      }
      setHolidayDate(undefined);
    }
  };

  const handleRemoveHoliday = (date: string) => {
    setFormData((prev) => ({
      ...prev,
      holidays: prev.holidays.filter((h) => h !== date),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Validation
      if (formData.working_days.length === 0) {
        throw new Error('Please select at least one working day');
      }

      if (new Date(formData.start_date) >= new Date(formData.end_date)) {
        throw new Error('Start date must be before end date');
      }

      const url = editingTerm ? `/api/terms/${editingTerm.id}` : '/api/terms';
      const method = editingTerm ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save term');
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save term');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingTerm ? 'Edit Term' : 'Create New Term'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Term Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Term Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Term 1 2025"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) =>
                  setFormData({ ...formData, start_date: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">End Date *</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) =>
                  setFormData({ ...formData, end_date: e.target.value })
                }
                required
              />
            </div>
          </div>

          {/* Working Days */}
          <div className="space-y-3">
            <Label>Working Days *</Label>
            <div className="grid grid-cols-2 gap-3">
              {weekDays.map((day) => (
                <div key={day.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={formData.working_days.includes(day.value)}
                    onCheckedChange={() => handleWorkingDayToggle(day.value)}
                  />
                  <label
                    htmlFor={`day-${day.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {day.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Holidays */}
          <div className="space-y-3">
            <Label>Holidays (Optional)</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {holidayDate ? format(holidayDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={holidayDate}
                    onSelect={setHolidayDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                onClick={handleAddHoliday}
                disabled={!holidayDate}
              >
                Add
              </Button>
            </div>

            {/* Holiday List */}
            {formData.holidays.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  {formData.holidays.length} holiday(s) added:
                </p>
                <div className="flex flex-wrap gap-2">
                  {formData.holidays.map((holiday) => (
                    <div
                      key={holiday}
                      className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full text-sm"
                    >
                      <span>{format(new Date(holiday), 'MMM dd, yyyy')}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(holiday)}
                        className="text-gray-500 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : editingTerm
                ? 'Update Term'
                : 'Create Term'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}