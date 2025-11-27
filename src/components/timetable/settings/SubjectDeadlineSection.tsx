// components/timetable/settings/SubjectDeadlineSection.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";

interface TimetableSettings {
  id: number;
  subject_selection_deadline: string | null;
  deadline_enabled: boolean;
}

export default function SubjectDeadlineSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<TimetableSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/timetable-settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      
      if (data.data) {
        setSettings(data.data);
        setDeadlineEnabled(data.data.deadline_enabled);
        if (data.data.subject_selection_deadline) {
          setSelectedDate(new Date(data.data.subject_selection_deadline));
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: "Error",
        description: "Failed to load deadline settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/timetable-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deadline_enabled: deadlineEnabled,
          subject_selection_deadline: selectedDate?.toISOString() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      const result = await response.json();
      setSettings(result.data);

      toast({
        title: "Success",
        description: "Deadline settings saved successfully",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const clearDeadline = () => {
    setSelectedDate(undefined);
    setDeadlineEnabled(false);
  };

  const getDeadlineStatus = () => {
    if (!deadlineEnabled || !selectedDate) return null;

    const now = new Date();
    const deadline = new Date(selectedDate);
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        type: 'expired',
        message: `Deadline passed ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`,
        icon: <AlertTriangle className="h-4 w-4" />,
        color: 'destructive'
      };
    } else if (diffDays === 0) {
      return {
        type: 'today',
        message: 'Deadline is today',
        icon: <Clock className="h-4 w-4" />,
        color: 'warning'
      };
    } else if (diffDays <= 3) {
      return {
        type: 'soon',
        message: `${diffDays} day${diffDays !== 1 ? 's' : ''} remaining`,
        icon: <Clock className="h-4 w-4" />,
        color: 'warning'
      };
    } else {
      return {
        type: 'active',
        message: `${diffDays} days remaining`,
        icon: <CheckCircle2 className="h-4 w-4" />,
        color: 'default'
      };
    }
  };

  const deadlineStatus = getDeadlineStatus();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <CalendarIcon className="h-4 w-4" />
        <AlertDescription>
          Set a deadline for trainers to select their subjects. After the deadline, 
          trainers will not be able to modify their subject selections unless an admin 
          assigns on their behalf.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="deadline-enabled" className="text-base font-medium">
              Enable Deadline Enforcement
            </Label>
            <p className="text-sm text-gray-600">
              Automatically block subject selection after the deadline
            </p>
          </div>
          <Switch
            id="deadline-enabled"
            checked={deadlineEnabled}
            onCheckedChange={setDeadlineEnabled}
          />
        </div>

        {deadlineEnabled && (
          <>
            <div className="space-y-2">
              <Label>Subject Selection Deadline</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full justify-start text-left font-normal ${
                      !selectedDate && 'text-gray-500'
                    }`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {deadlineStatus && (
              <Alert variant={deadlineStatus.color as any}>
                {deadlineStatus.icon}
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    <strong>Status:</strong> {deadlineStatus.message}
                  </span>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={clearDeadline}
                className="flex-1"
              >
                Clear Deadline
              </Button>
              <Button
                onClick={saveSettings}
                disabled={isSaving || !selectedDate}
                className="flex-1"
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </>
        )}

        {!deadlineEnabled && (
          <Button
            onClick={saveSettings}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        )}
      </div>

      {deadlineStatus?.type === 'expired' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Deadline Passed:</strong> Trainers can no longer select subjects. 
            You can extend the deadline or use Admin Assignment to assign subjects on their behalf.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}