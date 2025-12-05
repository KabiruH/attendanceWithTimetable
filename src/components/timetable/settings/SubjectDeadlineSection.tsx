// components/timetable/settings/TimetableGenerationDeadlineSection.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, AlertTriangle, CheckCircle2, Clock, Sparkles, Badge } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";

interface TimetableSettings {
  id: number;
  timetable_generation_deadline: string | null;
  generation_deadline_enabled: boolean;
}

export default function TimetableGenerationDeadlineSection() {
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
        setDeadlineEnabled(data.data.generation_deadline_enabled || false);
        if (data.data.timetable_generation_deadline) {
          setSelectedDate(new Date(data.data.timetable_generation_deadline));
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
          generation_deadline_enabled: deadlineEnabled,
          timetable_generation_deadline: selectedDate?.toISOString() || null,
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
        description: "Timetable generation deadline saved successfully",
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
        description: 'Timetable can now be generated',
        icon: <CheckCircle2 className="h-4 w-4" />,
        color: 'default',
        canGenerate: true
      };
    } else if (diffDays === 0) {
      return {
        type: 'today',
        message: 'Deadline is today',
        description: 'Timetable can be generated after midnight',
        icon: <Clock className="h-4 w-4" />,
        color: 'warning',
        canGenerate: false
      };
    } else if (diffDays <= 3) {
      return {
        type: 'soon',
        message: `${diffDays} day${diffDays !== 1 ? 's' : ''} until generation`,
        description: 'Timetable generation will be available after this date',
        icon: <Clock className="h-4 w-4" />,
        color: 'default',
        canGenerate: false
      };
    } else {
      return {
        type: 'active',
        message: `${diffDays} days until generation`,
        description: 'Timetable generation will be available after this date',
        icon: <CalendarIcon className="h-4 w-4" />,
        color: 'default',
        canGenerate: false
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
        <Sparkles className="h-4 w-4" />
        <AlertDescription>
          Set a deadline for when the timetable can be generated. This ensures all trainers 
          have completed their class and subject selections before the timetable is created.
          The "Generate Timetable" button will be disabled until this deadline passes.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="deadline-enabled" className="text-base font-medium">
              Enable Generation Deadline
            </Label>
            <p className="text-sm text-gray-600">
              Prevent timetable generation until after the deadline
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
              <Label>Timetable Generation Deadline</Label>
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
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-gray-600">
                Timetable generation will be blocked until this date passes
              </p>
            </div>

            {deadlineStatus && (
              <Alert 
                variant={deadlineStatus.color as any}
                className={deadlineStatus.canGenerate ? 'border-green-500 bg-green-50' : ''}
              >
                {deadlineStatus.icon}
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span>
                        <strong>Status:</strong> {deadlineStatus.message}
                      </span>
                      {deadlineStatus.canGenerate && (
                        <Badge className="bg-green-600">
                          Ready to Generate
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-700">
                      {deadlineStatus.description}
                    </p>
                  </div>
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

      {/* Info boxes based on status */}
      {deadlineStatus?.canGenerate && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-900">
            <strong>Timetable Generation Available:</strong> The deadline has passed. 
            You can now generate the timetable from the Timetable page.
          </AlertDescription>
        </Alert>
      )}

      {deadlineStatus && !deadlineStatus.canGenerate && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Generation Blocked:</strong> The "Generate Timetable" button will remain 
            disabled until {selectedDate ? format(selectedDate, 'PPP') : 'the deadline passes'}. 
            This gives trainers time to complete their selections.
          </AlertDescription>
        </Alert>
      )}

      {deadlineEnabled && !selectedDate && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>No Deadline Set:</strong> Please select a date to enable deadline enforcement.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}