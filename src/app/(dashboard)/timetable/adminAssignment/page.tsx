// app/(dashboard))/timetable/settings/adminAssignmentSection.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
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
import { UserCog, AlertTriangle, CheckCircle2, Users, BookOpen, GraduationCap, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department?: string;
  has_timetable_admin?: boolean;
}

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  has_timetable_admin: boolean;
  is_blocked: boolean;
  blocked_reason: string | null;
  blocked_at: string | null;
}

interface Class {
  id: number;
  name: string;
  code: string;
  department: string;
  is_assigned?: boolean; 
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface Subject {
  id: number;
  name: string;
  code: string;
  class_subject_id: number;
  is_assigned?: boolean;
  is_assigned_elsewhere?: boolean; 
}

interface TrainerAssignment {
  id: number;
  class_id: number;
  assigned_at: string;
}

export default function TimetableAdminAssignmentSection() {
  const { toast } = useToast();

  // Form state
  const [trainers, setTrainers] = useState<User[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [trainerAssignments, setTrainerAssignments] = useState<TrainerAssignment[]>([]);
  const [classesWithSubjects, setClassesWithSubjects] = useState<Set<number>>(new Set());
  
  const [selectedTrainer, setSelectedTrainer] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [selectedClasses, setSelectedClasses] = useState<number[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>(''); // For subject selection
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);
  
  const [isLoadingTrainers, setIsLoadingTrainers] = useState(false);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingTerms, setIsLoadingTerms] = useState(false);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [isAssigningClasses, setIsAssigningClasses] = useState(false);
  const [isAssigningSubjects, setIsAssigningSubjects] = useState(false);
  const [unassigningClassId, setUnassigningClassId] = useState<number | null>(null);
  const [unassigningSubjectId, setUnassigningSubjectId] = useState<number | null>(null);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/check", {
          credentials: "include",
        });

        if (!res.ok) throw new Error("Not authenticated");

        const data = await res.json();
        setAuthUser(data.user);
      } catch {
        setAuthUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) return;
    if (authUser.is_blocked) return;

    const hasAccess = authUser.role === "admin" || authUser.has_timetable_admin === true;

    if (!hasAccess) return;

    fetchTrainers();
    fetchClasses();  
    fetchTerms(); 
  }, [authUser, authLoading]);

  const fetchTrainers = async () => {
    setIsLoadingTrainers(true);
    try {
      const response = await fetch('/api/trainers'); 
      if (!response.ok) throw new Error('Failed to fetch trainers');
      
      const result = await response.json();
      
      const trainerList = result.data.map((trainer: any) => ({
        id: trainer.id,
        name: trainer.name,
        department: trainer.department
      }));
      setTrainers(trainerList);
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

  useEffect(() => {
    if (selectedTrainer && selectedTerm) {
      fetchTrainerAssignments(parseInt(selectedTrainer));
      // Reset selections when trainer/term changes
      setSelectedClasses([]);
      setSelectedClass('');
      setSelectedSubjects([]);
    }
  }, [selectedTrainer, selectedTerm]);

  useEffect(() => {
    if (selectedClass && selectedTerm && selectedTrainer) {
      fetchSubjectsForClass(parseInt(selectedClass), parseInt(selectedTerm));
    } else {
      setAvailableSubjects([]);
      setSelectedSubjects([]);
    }
  }, [selectedClass, selectedTerm, selectedTrainer]);

  // ✅ NEW: Check all classes for assigned subjects
  useEffect(() => {
    if (trainerAssignments.length > 0 && selectedTrainer && selectedTerm) {
      checkAllClassesForSubjects();
    } else {
      setClassesWithSubjects(new Set());
    }
  }, [trainerAssignments, selectedTerm, selectedTrainer]);

  const fetchClasses = async () => {
    setIsLoadingClasses(true);
    try {
      const response = await fetch('/api/classes');
      if (!response.ok) throw new Error('Failed to fetch classes');
      const data = await response.json();
      setClasses(data.data || data || []);
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

  const fetchTerms = async () => {
    setIsLoadingTerms(true);
    try {
      const response = await fetch('/api/terms');
      if (!response.ok) throw new Error('Failed to fetch terms');
      const data = await response.json();
      setTerms(data.data || data || []);
    } catch (error) {
      console.error('Error fetching terms:', error);
      toast({
        title: "Error",
        description: "Failed to load terms",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTerms(false);
    }
  };

  const fetchTrainerAssignments = async (trainerId: number) => {
    setIsLoadingAssignments(true);
    try {
      const response = await fetch(`/api/trainers/${trainerId}/assignments`);
      if (!response.ok) throw new Error('Failed to fetch assignments');
      const data = await response.json();
      setTrainerAssignments(Array.isArray(data) ? data : []);
      
      // Mark classes as assigned
      const assignedClassIds = Array.isArray(data) ? data.map((a: TrainerAssignment) => a.class_id) : [];
      setClasses(prev => prev.map(cls => ({
        ...cls,
        is_assigned: assignedClassIds.includes(cls.id)
      })));
    } catch (error) {
      console.error('Error fetching trainer assignments:', error);
      setTrainerAssignments([]);
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  const fetchSubjectsForClass = async (classId: number, termId: number) => {
    setIsLoadingSubjects(true);
    setSelectedSubjects([]);
    try {
      const response = await fetch(`/api/class-subjects/${classId}?term_id=${termId}&trainer_id=${selectedTrainer}`);
      if (!response.ok) throw new Error('Failed to fetch subjects');
      const data = await response.json();
      
      // Transform the data to include class_subject_id
      const subjects = data.data.map((item: any) => ({
        id: item.id, // subject_id
        name: item.name,
        code: item.code,
        class_subject_id: item.class_subject_id,
        is_assigned: item.is_assigned || false,
        is_assigned_elsewhere: item.is_assigned_elsewhere || false
      }));
      
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

  // ✅ NEW: Check if a single class has assigned subjects
  const checkClassHasAssignedSubjects = async (classId: number): Promise<boolean> => {
    if (!selectedTrainer || !selectedTerm) return false;
    
    try {
      const response = await fetch(
        `/api/class-subjects/${classId}?term_id=${selectedTerm}&trainer_id=${selectedTrainer}`
      );
      
      if (!response.ok) return false;
      
      const data = await response.json();
      const assignedSubjects = data.data.filter((subject: any) => subject.is_assigned);
      
      return assignedSubjects.length > 0;
    } catch (error) {
      console.error('Error checking assigned subjects:', error);
      return false;
    }
  };

  // ✅ NEW: Check all assigned classes for subjects
  const checkAllClassesForSubjects = async () => {
    if (!selectedTrainer || !selectedTerm) return;
    
    const classesWithAssignedSubjects = new Set<number>();
    
    for (const assignment of trainerAssignments) {
      const hasSubjects = await checkClassHasAssignedSubjects(assignment.class_id);
      if (hasSubjects) {
        classesWithAssignedSubjects.add(assignment.class_id);
      }
    }
    
    setClassesWithSubjects(classesWithAssignedSubjects);
  };

  const handleClassToggle = (classId: number) => {
    setSelectedClasses(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  const handleSubjectToggle = (subjectId: number) => {
    setSelectedSubjects(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const handleUnassignClass = async (classId: number) => {
    if (!selectedTrainer || !selectedTerm) return;

    // ✅ NEW: Check if class has assigned subjects
    const hasAssignedSubjects = await checkClassHasAssignedSubjects(classId);
    
    if (hasAssignedSubjects) {
      const className = classes.find(c => c.id === classId)?.name || 'this class';
      
      toast({
        title: "Cannot Remove Class",
        description: `${className} has subjects currently assigned to this trainer. Please remove all assigned subjects from this class first before unassigning the class. 💡 Go to Step 3 below to unassign subjects for this class.`,
        variant: "destructive",
        duration: 7000,
      });
      return;
    }

    setUnassigningClassId(classId);
    try {
      // Unassign by sending empty array (deactivates all)
      const response = await fetch(`/api/trainers/${selectedTrainer}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_ids: trainerAssignments
            .map(a => a.class_id)
            .filter(id => id !== classId), // Remove this class
          term_id: parseInt(selectedTerm),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to unassign class');
      }

      toast({
        title: "Success",
        description: "Class unassigned successfully",
      });

      // Refresh assignments
      await fetchTrainerAssignments(parseInt(selectedTrainer));
    } catch (error) {
      console.error('Error unassigning class:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to unassign class",
        variant: "destructive",
      });
    } finally {
      setUnassigningClassId(null);
    }
  };

  const handleUnassignSubject = async (subjectId: number) => {
    if (!selectedTrainer || !selectedTerm || !selectedClass) return;

    const subject = availableSubjects.find(s => s.id === subjectId);
    if (!subject) return;

    setUnassigningSubjectId(subjectId);
    try {
      const response = await fetch(`/api/trainers/${selectedTrainer}/subject-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_id: parseInt(selectedTerm),
          class_subject_id: subject.class_subject_id,
          subject_id: subjectId,
          is_active: false, // Deactivate
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to unassign subject');
      }

      toast({
        title: "Success",
        description: "Subject unassigned successfully",
      });

      // Refresh subjects
      await fetchSubjectsForClass(parseInt(selectedClass), parseInt(selectedTerm));
      // Refresh class subject indicators
      await checkAllClassesForSubjects();
    } catch (error) {
      console.error('Error unassigning subject:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to unassign subject",
        variant: "destructive",
      });
    } finally {
      setUnassigningSubjectId(null);
    }
  };

  const handleAssignClasses = async () => {
    if (!selectedTrainer || !selectedTerm || selectedClasses.length === 0) {
      toast({
        title: "Error",
        description: "Please select trainer, term, and at least one class",
        variant: "destructive",
      });
      return;
    }

    setIsAssigningClasses(true);
    try {
      // Combine existing assignments with new selections
      const existingClassIds = trainerAssignments.map(a => a.class_id);
      const allClassIds = [...new Set([...existingClassIds, ...selectedClasses])];

      const response = await fetch(`/api/trainers/${selectedTrainer}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_ids: allClassIds,
          term_id: parseInt(selectedTerm),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to assign classes');
      }

      const result = await response.json();

      toast({
        title: "Success",
        description: result.message || "Classes assigned successfully",
      });

      // Reset class selection and refresh
      setSelectedClasses([]);
      await fetchTrainerAssignments(parseInt(selectedTrainer));
    } catch (error) {
      console.error('Error assigning classes:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to assign classes",
        variant: "destructive",
      });
    } finally {
      setIsAssigningClasses(false);
    }
  };

  const handleAssignSubjects = async () => {
    if (!selectedTrainer || !selectedClass || !selectedTerm || selectedSubjects.length === 0) {
      toast({
        title: "Error",
        description: "Please select trainer, class, term, and at least one subject",
        variant: "destructive",
      });
      return;
    }

    setIsAssigningSubjects(true);
    
    try {
      // Assign each subject individually
      const promises = selectedSubjects.map(async (subjectId) => {
        const subject = availableSubjects.find(s => s.id === subjectId);
        if (!subject) return;

        const response = await fetch(`/api/trainers/${selectedTrainer}/subject-assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            term_id: parseInt(selectedTerm),
            class_subject_id: subject.class_subject_id,
            subject_id: subjectId,
            is_active: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to assign subject ${subject.code}`);
        }

        return response.json();
      });

      await Promise.all(promises);

      toast({
        title: "Success",
        description: `${selectedSubjects.length} subject(s) assigned successfully`,
      });

      // Reset subject selection
      setSelectedSubjects([]);
      
      // Refresh subjects to show updated assignment status
      if (selectedClass && selectedTerm) {
        await fetchSubjectsForClass(parseInt(selectedClass), parseInt(selectedTerm));
      }
      
      // Refresh class subject indicators
      await checkAllClassesForSubjects();
    } catch (error) {
      console.error('Error assigning subjects:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to assign subjects",
        variant: "destructive",
      });
    } finally {
      setIsAssigningSubjects(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Please log in to access this page.
        </AlertDescription>
      </Alert>
    );
  }

  const hasAccess = authUser.role === "admin" || authUser.has_timetable_admin === true;

  if (!hasAccess) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          You do not have permission to access timetable administration.
          Only admins and timetable admins can assign classes and subjects.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 mt-11">
      <Alert>
        <UserCog className="h-4 w-4" />
        <AlertDescription>
          As a Timetable Admin, you can assign classes and subjects to trainers on their behalf. 
          This is useful when trainers are unavailable or when managing bulk assignments.
        </AlertDescription>
      </Alert>

      {/* Step 1: Select Trainer and Term */}
      <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Step 1: Select Trainer & Term</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Trainer Selection */}
          <div className="space-y-2">
            <Label htmlFor="trainer-select">Select Trainer *</Label>
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

          {/* Term Selection */}
          <div className="space-y-2">
            <Label htmlFor="term-select">Select Term *</Label>
            <Select value={selectedTerm} onValueChange={setSelectedTerm} disabled={!selectedTrainer}>
              <SelectTrigger id="term-select">
                <SelectValue placeholder="Choose a term..." />
              </SelectTrigger>
              <SelectContent>
                {isLoadingTerms ? (
                  <SelectItem value="loading" disabled>
                    Loading terms...
                  </SelectItem>
                ) : terms.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No terms found
                  </SelectItem>
                ) : (
                  terms.map((term) => (
                    <SelectItem key={term.id} value={term.id.toString()}>
                      {term.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {selectedTrainer && selectedTerm && (
        <>
          {/* Step 2: Assign Classes */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-purple-600" />
              <h3 className="text-lg font-semibold">Step 2: Assign Classes</h3>
            </div>

            <Alert variant="default">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Select the classes this trainer will teach during the selected term.
                <span className="block mt-1 text-xs">
                  🟢 Green = Already assigned | 🔴 Red "Has Subjects" badge = Remove subjects before unassigning class
                </span>
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {/* Class Selection */}
              {isLoadingClasses || isLoadingAssignments ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                </div>
              ) : classes.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No classes found. Please create classes first.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                  {classes.map((cls) => (
                    <div
                      key={cls.id}
                      className={`flex items-center justify-between p-3 transition-colors ${
                        cls.is_assigned
                          ? 'bg-green-50 hover:bg-green-100'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        {!cls.is_assigned && (
                          <Checkbox
                            id={`class-${cls.id}`}
                            checked={selectedClasses.includes(cls.id)}
                            onCheckedChange={() => handleClassToggle(cls.id)}
                          />
                        )}
                        <Label
                          htmlFor={`class-${cls.id}`}
                          className={`flex-1 ${cls.is_assigned ? 'ml-3' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-medium">{cls.code}</span>
                            <span className="text-sm text-gray-600">
                              {cls.name}
                            </span>
                            {cls.department && (
                              <Badge variant="outline">
                                {cls.department}
                              </Badge>
                            )}
                            {cls.is_assigned && (
                              <Badge variant="default" className="bg-green-600">
                                Assigned
                              </Badge>
                            )}
                            {/* ✅ NEW: Show warning if class has assigned subjects */}
                            {cls.is_assigned && classesWithSubjects.has(cls.id) && (
                              <Badge variant="destructive" className="animate-pulse">
                                ⚠ Has Subjects
                              </Badge>
                            )}
                          </div>
                        </Label>
                      </div>
                      
                      {cls.is_assigned && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnassignClass(cls.id)}
                          disabled={unassigningClassId === cls.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {unassigningClassId === cls.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Selected Classes Summary */}
              {selectedClasses.length > 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <span>
                        {selectedClasses.length} class{selectedClasses.length !== 1 ? 'es' : ''} selected
                      </span>
                      <Badge variant="secondary">
                        {selectedClasses.length}
                      </Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Assign Classes Button */}
              <Button
                onClick={handleAssignClasses}
                disabled={
                  isAssigningClasses ||
                  !selectedTrainer ||
                  !selectedTerm ||
                  selectedClasses.length === 0
                }
                className="w-full"
              >
                {isAssigningClasses ? 'Assigning Classes...' : 'Assign Selected Classes'}
              </Button>
            </div>
          </div>

          {/* Step 3: Assign Subjects */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold">Step 3: Assign Subjects</h3>
            </div>

            <Alert variant="default">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                After assigning classes, select which subjects within each class the trainer will teach.
                <span className="block mt-1 text-xs">
                  🟢 Green = Already assigned to this class | 🟡 Yellow = Assigned to another class
                </span>
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {/* Class Selection for Subjects */}
              <div className="space-y-2">
                <Label htmlFor="subject-class-select">Select Class to View Subjects *</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger id="subject-class-select">
                    <SelectValue placeholder="Choose a class..." />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No classes available
                      </SelectItem>
                    ) : (
                      classes
                        .filter(cls => cls.is_assigned) // Only show assigned classes
                        .map((cls) => (
                          <SelectItem key={cls.id} value={cls.id.toString()}>
                            {cls.code} - {cls.name}
                            {classesWithSubjects.has(cls.id) && ' ⚠'}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject Selection */}
              {selectedClass && (
                <>
                  {isLoadingSubjects ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                    </div>
                  ) : availableSubjects.length === 0 ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        No subjects found for this class in the selected term. Please assign subjects to the class first.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                      {availableSubjects.map((subject) => (
                        <div
                          key={subject.id}
                          className={`flex items-center justify-between p-3 transition-colors ${
                            subject.is_assigned
                              ? 'bg-green-50 hover:bg-green-100'
                              : subject.is_assigned_elsewhere
                              ? 'bg-yellow-50 hover:bg-yellow-100'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            {!subject.is_assigned && !subject.is_assigned_elsewhere && (
                              <Checkbox
                                id={`subject-${subject.id}`}
                                checked={selectedSubjects.includes(subject.id)}
                                onCheckedChange={() => handleSubjectToggle(subject.id)}
                              />
                            )}
                            <Label
                              htmlFor={`subject-${subject.id}`}
                              className={`flex-1 ${
                                subject.is_assigned || subject.is_assigned_elsewhere ? 'ml-3' : 'cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium">{subject.code}</span>
                                  <span className="text-sm text-gray-600 ml-2">
                                    {subject.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {subject.is_assigned && (
                                    <Badge variant="default" className="bg-green-600">
                                      Assigned
                                    </Badge>
                                  )}
                                  {subject.is_assigned_elsewhere && (
                                    <Badge variant="default" className="bg-yellow-600">
                                      Assigned to Another Class
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </Label>
                          </div>
                          
                          {subject.is_assigned && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnassignSubject(subject.id)}
                              disabled={unassigningSubjectId === subject.id}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {unassigningSubjectId === subject.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
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

              {/* Assign Subjects Button */}
              <Button
                onClick={handleAssignSubjects}
                disabled={
                  isAssigningSubjects ||
                  !selectedTrainer ||
                  !selectedClass ||
                  !selectedTerm ||
                  selectedSubjects.length === 0
                }
                className="w-full"
              >
                {isAssigningSubjects ? 'Assigning Subjects...' : 'Assign Selected Subjects'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}