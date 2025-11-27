// components/timetable/settings/AdminAssignmentSection.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { UserCog, AlertTriangle, CheckCircle2, History } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
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
}

interface ClassSubject {
  subject_id: number;
  subjects: Subject;
}

export default function AdminAssignmentSection() {
  const { toast } = useToast();
  const [allowAdminAssignment, setAllowAdminAssignment] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Assignment form state
  const [trainers, setTrainers] = useState<User[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  
  const [selectedTrainer, setSelectedTrainer] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);
  
  const [isLoadingTrainers, setIsLoadingTrainers] = useState(false);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchTrainers();
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchSubjectsForClass(parseInt(selectedClass));
    } else {
      setAvailableSubjects([]);
      setSelectedSubjects([]);
    }
  }, [selectedClass]);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/timetable-settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      
      if (data.data) {
        setAllowAdminAssignment(data.data.allow_admin_assignment || false);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const fetchTrainers = async () => {
    setIsLoadingTrainers(true);
    try {
      const response = await fetch('/api/users?role=employee');
      if (!response.ok) throw new Error('Failed to fetch trainers');
      const data = await response.json();
      setTrainers(data.data);
    } catch (error) {
      console.error('Error fetching trainers:', error);
      toast({
        title: "Error",
        description: "Failed to load trainers",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTrainers(false);
    }
  };

  const fetchClasses = async () => {
    setIsLoadingClasses(true);
    try {
      const response = await fetch('/api/classes');
      if (!response.ok) throw new Error('Failed to fetch classes');
      const data = await response.json();
      setClasses(data.data);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast({
        title: "Error",
        description: "Failed to load classes",
        variant: "destructive",
      });
    } finally {
      setIsLoadingClasses(false);
    }
  };

  const fetchSubjectsForClass = async (classId: number) => {
    setIsLoadingSubjects(true);
    setSelectedSubjects([]);
    try {
      const response = await fetch(`/api/classes/${classId}/subjects`);
      if (!response.ok) throw new Error('Failed to fetch subjects');
      const data = await response.json();
      
      const subjects = data.data.map((cs: ClassSubject) => cs.subjects);
      setAvailableSubjects(subjects);
    } catch (error) {
      console.error('Error fetching subjects:', error);
      toast({
        title: "Error",
        description: "Failed to load subjects for this class",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSubjects(false);
    }
  };

  const saveAllowAdminAssignment = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/timetable-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allow_admin_assignment: allowAdminAssignment,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      toast({
        title: "Success",
        description: "Admin assignment settings saved successfully",
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

  const handleSubjectToggle = (subjectId: number) => {
    setSelectedSubjects(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const handleAssignSubjects = async () => {
    if (!selectedTrainer || !selectedClass || selectedSubjects.length === 0) {
      toast({
        title: "Error",
        description: "Please select trainer, class, and at least one subject",
        variant: "destructive",
      });
      return;
    }

    setIsAssigning(true);
    try {
      const response = await fetch('/api/admin/assign-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainer_id: parseInt(selectedTrainer),
          class_id: parseInt(selectedClass),
          subject_ids: selectedSubjects,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to assign subjects');
      }

      const result = await response.json();

      toast({
        title: "Success",
        description: result.message,
      });

      // Reset form
      setSelectedTrainer('');
      setSelectedClass('');
      setSelectedSubjects([]);
      setAvailableSubjects([]);
    } catch (error) {
      console.error('Error assigning subjects:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to assign subjects",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <UserCog className="h-4 w-4" />
        <AlertDescription>
          Allow administrators to assign classes and subjects on behalf of trainers. 
          This is useful when trainers are unavailable or when deadlines have passed.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <Label htmlFor="allow-assignment" className="text-base font-medium">
              Enable Admin Assignment
            </Label>
            <p className="text-sm text-gray-600">
              Allow admins to assign subjects to trainers
            </p>
          </div>
          <Switch
            id="allow-assignment"
            checked={allowAdminAssignment}
            onCheckedChange={setAllowAdminAssignment}
          />
        </div>

        <Button
          onClick={saveAllowAdminAssignment}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {allowAdminAssignment && (
        <>
          <hr className="my-6" />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Assign Subjects to Trainer</h3>
            </div>

            <Alert variant="default">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Use this form to assign subjects to trainers on their behalf. The assignment 
                will be logged for audit purposes.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {/* Trainer Selection */}
              <div className="space-y-2">
                <Label htmlFor="trainer-select">Select Trainer</Label>
                <Select value={selectedTrainer} onValueChange={setSelectedTrainer}>
                  <SelectTrigger id="trainer-select">
                    <SelectValue placeholder="Choose a trainer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingTrainers ? (
                      <SelectItem value="loading" disabled>
                        Loading trainers...
                      </SelectItem>
                    ) : trainers.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No trainers found
                      </SelectItem>
                    ) : (
                      trainers.map((trainer) => (
                        <SelectItem key={trainer.id} value={trainer.id.toString()}>
                          {trainer.name} ({trainer.department})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Class Selection */}
              <div className="space-y-2">
                <Label htmlFor="class-select">Select Class</Label>
                <Select 
                  value={selectedClass} 
                  onValueChange={setSelectedClass}
                  disabled={!selectedTrainer}
                >
                  <SelectTrigger id="class-select">
                    <SelectValue placeholder="Choose a class..." />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingClasses ? (
                      <SelectItem value="loading" disabled>
                        Loading classes...
                      </SelectItem>
                    ) : classes.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No classes found
                      </SelectItem>
                    ) : (
                      classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id.toString()}>
                          {cls.code} - {cls.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject Selection */}
              {selectedClass && (
                <div className="space-y-2">
                  <Label>Available Subjects</Label>
                  {isLoadingSubjects ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                    </div>
                  ) : availableSubjects.length === 0 ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        No subjects found for this class. Please add subjects to the class first.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                      {availableSubjects.map((subject) => (
                        <div
                          key={subject.id}
                          className="flex items-center space-x-3 p-3 hover:bg-gray-50"
                        >
                          <Checkbox
                            id={`subject-${subject.id}`}
                            checked={selectedSubjects.includes(subject.id)}
                            onCheckedChange={() => handleSubjectToggle(subject.id)}
                          />
                          <Label
                            htmlFor={`subject-${subject.id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <span className="font-medium">{subject.code}</span>
                            <span className="text-sm text-gray-600 ml-2">
                              {subject.name}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Selected Subjects Summary */}
              {selectedSubjects.length > 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <span>
                        {selectedSubjects.length} subject{selectedSubjects.length !== 1 ? 's' : ''} selected
                      </span>
                      <Badge variant="secondary">
                        {selectedSubjects.length}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Assign Button */}
              <Button
                onClick={handleAssignSubjects}
                disabled={
                  isAssigning ||
                  !selectedTrainer ||
                  !selectedClass ||
                  selectedSubjects.length === 0
                }
                className="w-full"
              >
                {isAssigning ? 'Assigning...' : 'Assign Selected Subjects'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}