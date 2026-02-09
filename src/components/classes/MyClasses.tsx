// components/classes/MyClasses.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Building, Calendar, CheckCircle, XCircle, Trash2, BookOpen, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Subject {
  id: number;
  name: string;
  code: string;
  credit_hours?: number | null;
  is_assigned: boolean;
  is_assigned_elsewhere?: boolean;
  class_subject_id: number;
}

interface ClassAssignment {
  id: number;
  class_id: number;
  assigned_at: string;
  class: {
    id: number;
    name: string;
    code: string;
    description?: string;
    department: string;
    duration_hours: number;
  };
  subjects: Subject[];
  lastAttendance?: {
    date: string;
    check_in_time: string;
    status: string;
  };
  totalSessions?: number;
}

interface MyClassesProps {
  userId: number;
  termId: number;
  showRemoveOption?: boolean;
  onClassRemoved?: () => void;
}

export default function MyClasses({ userId, termId, showRemoveOption = true, onClassRemoved }: MyClassesProps) {
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingClassId, setRemovingClassId] = useState<number | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set());
  const [updatingSubjects, setUpdatingSubjects] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (userId && termId) {
      fetchMyClasses();
    }
  }, [userId, termId]);

  const fetchMyClasses = async () => {
    if (!termId) return;

    try {
      setIsLoading(true);
      setError('');

      // Fetch assigned classes
      const response = await fetch(`/api/trainers/${userId}/my-classes?term_id=${termId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch assigned classes');
      }

      const data: ClassAssignment[] = await response.json();

      // For each class, fetch its subjects WITH trainer assignment status
      const classesWithSubjects = await Promise.all(
        data.map(async (assignment) => {
          try {
            const subjectsRes = await fetch(
              `/api/class-subjects/${assignment.class_id}?term_id=${termId}&trainer_id=${userId}`
            );

            if (!subjectsRes.ok) {
              console.warn("Failed to fetch subjects for class:", assignment.class_id);
              return { ...assignment, subjects: [] };
            }

            const subjectsData = await subjectsRes.json();

            return {
              ...assignment,
              subjects: subjectsData.data || [],
            };
          } catch (err) {
            console.error("Error fetching subjects:", err);
            return { ...assignment, subjects: [] };
          }
        })
      );

      setAssignments(classesWithSubjects);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load classes');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ NEW: Check if class has assigned subjects before allowing removal
  const handleRemoveClass = (classId: number) => {
    const assignment = assignments.find(a => a.class_id === classId);
    if (!assignment) return;

    const assignedSubjectsCount = assignment.subjects.filter(s => s.is_assigned).length;

    if (assignedSubjectsCount > 0) {
      setError(
        `Cannot remove ${assignment.class.code} - ${assignment.class.name}. ` +
        `You have ${assignedSubjectsCount} subject${assignedSubjectsCount !== 1 ? 's' : ''} assigned for this class. ` +
        `Please uncheck all subjects first before removing the class.`
      );
      
      // Scroll to error
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Auto-expand the class to show subjects
      setExpandedClasses(prev => new Set(prev).add(classId));
      
      return;
    }

    setRemovingClassId(classId);
  };

  const confirmRemoveClass = async () => {
    if (!removingClassId) return;

    setIsRemoving(true);
    try {
      const response = await fetch(`/api/trainers/${userId}/assignments/${removingClassId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove class assignment');
      }

      await fetchMyClasses();
      onClassRemoved?.();

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to remove class');
    } finally {
      setIsRemoving(false);
      setRemovingClassId(null);
    }
  };

  const toggleClassExpansion = (classId: number) => {
    const newExpanded = new Set(expandedClasses);
    if (newExpanded.has(classId)) {
      newExpanded.delete(classId);
    } else {
      newExpanded.add(classId);
    }
    setExpandedClasses(newExpanded);
  };

  const handleSubjectToggle = async (
    classId: number, 
    subjectId: number, 
    classSubjectId: number, 
    currentState: boolean,
    isAssignedElsewhere?: boolean
  ) => {
    if (!termId) return;

    if (!currentState && isAssignedElsewhere) {
      setError(`This subject is already assigned to you in another class for this term. You can only teach a subject once per term.`);
      return;
    }

    setUpdatingSubjects(prev => new Set(prev).add(classId));
    setError('');

    // Optimistic update
    const newState = !currentState;
    setAssignments(prev => prev.map(assignment => {
      if (assignment.class_id === classId) {
        return {
          ...assignment,
          subjects: assignment.subjects.map(subject => 
            subject.id === subjectId 
              ? { ...subject, is_assigned: newState }
              : subject
          )
        };
      }
      if (newState) {
        return {
          ...assignment,
          subjects: assignment.subjects.map(subject =>
            subject.id === subjectId
              ? { ...subject, is_assigned_elsewhere: true }
              : subject
          )
        };
      } else {
        return {
          ...assignment,
          subjects: assignment.subjects.map(subject =>
            subject.id === subjectId
              ? { ...subject, is_assigned_elsewhere: false }
              : subject
          )
        };
      }
    }));

    try {
      const response = await fetch(`/api/trainers/${userId}/subject-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_id: termId,
          class_subject_id: classSubjectId,
          subject_id: subjectId,
          is_active: newState
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // Revert optimistic update
        setAssignments(prev => prev.map(assignment => {
          if (assignment.class_id === classId) {
            return {
              ...assignment,
              subjects: assignment.subjects.map(subject => 
                subject.id === subjectId 
                  ? { ...subject, is_assigned: currentState }
                  : subject
              )
            };
          }
          return {
            ...assignment,
            subjects: assignment.subjects.map(subject =>
              subject.id === subjectId
                ? { ...subject, is_assigned_elsewhere: currentState }
                : subject
            )
          };
        }));
        
        throw new Error(result.error || 'Failed to update subject assignment');
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update subject');
    } finally {
      setUpdatingSubjects(prev => {
        const newSet = new Set(prev);
        newSet.delete(classId);
        return newSet;
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">My Classes</h2>
          <p className="text-muted-foreground">
            Classes and subjects you're currently assigned to teach
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {assignments.length} {assignments.length === 1 ? 'Class' : 'Classes'}
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setError('')}
              className="mt-2 h-7 text-xs"
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">No Classes Assigned</h3>
            <p className="text-muted-foreground mb-4">
              You haven't selected any classes to teach yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Use the "Select Your Classes" section above to choose classes you want to teach.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {assignments.map((assignment) => {
            const isExpanded = expandedClasses.has(assignment.class_id);
            const assignedSubjectsCount = assignment.subjects.filter(s => s.is_assigned).length;
            const totalSubjectsCount = assignment.subjects.length;
            const hasAssignedSubjects = assignedSubjectsCount > 0;

            return (
              <Card key={assignment.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {assignment.class.code}
                        </Badge>
                        {assignment.lastAttendance && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {assignedSubjectsCount}/{totalSubjectsCount} subjects
                        </Badge>
                        {/* ✅ Warning badge if has assigned subjects */}
                        {hasAssignedSubjects && (
                          <Badge variant="destructive" className="text-xs animate-pulse">
                            ⚠ {assignedSubjectsCount} Active
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-base">{assignment.class.name}</CardTitle>
                    </div>
                    {showRemoveOption && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveClass(assignment.class_id)}
                        className="text-red-500 hover:text-red-700 h-8 w-8 p-0"
                        title={hasAssignedSubjects ? 'Remove assigned subjects first' : 'Remove class'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {assignment.class.description && (
                    <CardDescription className="text-sm">
                      {assignment.class.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Building className="h-4 w-4" />
                      {assignment.class.department}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {assignment.class.duration_hours}h
                    </div>
                  </div>

                  {/* Subjects Section */}
                  {assignment.subjects.length > 0 && (
                    <Collapsible
                      open={isExpanded}
                      onOpenChange={() => toggleClassExpansion(assignment.class_id)}
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4" />
                            <span>Subjects ({assignedSubjectsCount}/{totalSubjectsCount})</span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="mt-3 space-y-2 p-3 bg-gray-50 rounded-md">
                        {updatingSubjects.has(assignment.class_id) && (
                          <div className="text-xs text-blue-600 mb-2">Updating subjects...</div>
                        )}
                        {assignment.subjects.map((subject) => (
                          <div
                            key={subject.id}
                            className={`flex items-start space-x-3 p-2 hover:bg-white rounded transition-colors ${
                              subject.is_assigned_elsewhere ? 'opacity-60' : ''
                            }`}
                          >
                            <Checkbox
                              id={`subject-${assignment.class_id}-${subject.id}`}
                              checked={subject.is_assigned}
                              onCheckedChange={() =>
                                handleSubjectToggle(
                                  assignment.class_id,
                                  subject.id,
                                  subject.class_subject_id,
                                  subject.is_assigned,
                                  subject.is_assigned_elsewhere
                                )
                              }
                              disabled={updatingSubjects.has(assignment.class_id) || subject.is_assigned_elsewhere}
                            />
                            <label
                              htmlFor={`subject-${assignment.class_id}-${subject.id}`}
                              className="flex-1 cursor-pointer"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-sm">{subject.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {subject.code}
                                    {subject.credit_hours && ` • ${subject.credit_hours}h`}
                                  </div>
                                </div>
                                {subject.is_assigned_elsewhere ? (
                                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">
                                    Assigned in another class
                                  </Badge>
                                ) : !subject.is_assigned ? (
                                  <Badge variant="outline" className="text-xs">
                                    Not teaching
                                  </Badge>
                                ) : null}
                              </div>
                            </label>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-xs text-muted-foreground mb-2">
                      Assigned: {formatDate(assignment.assigned_at)}
                    </div>

                    {assignment.lastAttendance ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          Last attended
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(assignment.lastAttendance.date)} at {formatTime(assignment.lastAttendance.check_in_time)}
                        </div>
                        {assignment.totalSessions && (
                          <div className="text-xs text-muted-foreground">
                            Total sessions: {assignment.totalSessions}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-sm text-amber-600">
                        <XCircle className="h-3 w-3" />
                        No attendance yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Remove Confirmation Dialog */}
      <AlertDialog
        open={!!removingClassId}
        onOpenChange={() => setRemovingClassId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Class Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove yourself from this class? You will no longer be able to check attendance for this class unless you reassign yourself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveClass}
              className="bg-red-600 hover:bg-red-700"
              disabled={isRemoving}
            >
              {isRemoving ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}