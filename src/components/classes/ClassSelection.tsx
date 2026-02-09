//components/classes/classSelection.tsx
'use client';
import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Users, Building, Calendar, Ban, AlertTriangle, CheckCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Class {
  id: number;
  name: string;
  code: string;
  description?: string;
  department: string;
  duration_hours: number;
  is_active: boolean;
  created_at: string;
  created_by: string;
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface ClassSelectionProps {
  userId: number;
  termId: number;
  onSelectionSaved?: () => void;
  searchTerm?: string;
  onClassesLoaded?: (classes: Class[]) => void;
}

export default function ClassSelection({ 
  userId,
  termId,
  onSelectionSaved, 
  searchTerm = '',
  onClassesLoaded 
}: ClassSelectionProps) {
  const [availableClasses, setAvailableClasses] = useState<Class[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [assignedClassIds, setAssignedClassIds] = useState<number[]>([]); // ✅ Track which classes are already assigned
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [isGloballyBlocked, setIsGloballyBlocked] = useState(false);
  const [checkingBlock, setCheckingBlock] = useState(true);

  const canSelect = !isBlocked && !isGloballyBlocked;

  // ✅ Filter classes and separate assigned/unassigned
  const { assignedClasses, unassignedClasses } = useMemo(() => {
    let filtered = availableClasses;
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = availableClasses.filter(classItem => 
        classItem.name.toLowerCase().includes(term) ||
        classItem.code.toLowerCase().includes(term) ||
        classItem.department.toLowerCase().includes(term)
      );
    }
    
    const assigned = filtered.filter(c => assignedClassIds.includes(c.id));
    const unassigned = filtered.filter(c => !assignedClassIds.includes(c.id));
    
    return { assignedClasses: assigned, unassignedClasses: unassigned };
  }, [availableClasses, searchTerm, assignedClassIds]);

  useEffect(() => {
    checkBlockStatus();
  }, []);

  useEffect(() => {
    if (userId && termId) {
      fetchClassesAndAssignments();
    }
  }, [userId, termId]);

  useEffect(() => {
    if (availableClasses.length > 0) {
      onClassesLoaded?.(availableClasses);
    }
  }, [availableClasses, onClassesLoaded]);

  const checkBlockStatus = async () => {
    setCheckingBlock(true);
    try {
      const userResponse = await fetch('/api/auth/check');
      const userData = await userResponse.json();
      
      if (userData.user.is_blocked) {
        setIsBlocked(true);
        setBlockMessage(
          userData.user.blocked_reason 
            ? `Your account is blocked: ${userData.user.blocked_reason}` 
            : 'Your account is blocked from selecting classes and subjects. Please contact an administrator.'
        );
        setCheckingBlock(false);
        return;
      }

      const settingsResponse = await fetch('/api/timetable-settings');
      const settingsData = await settingsResponse.json();
      
      if (settingsData.data?.block_all_subject_selection) {
        setIsGloballyBlocked(true);
        setBlockMessage('Class and subject selection is currently disabled by the administrator. Please try again later.');
      }
    } catch (error) {
      console.error('Error checking block status:', error);
    } finally {
      setCheckingBlock(false);
    }
  };

  const fetchClassesAndAssignments = async () => {
    if (!termId) return;

    try {
      setIsLoading(true);
      
      // Fetch all active classes
      const classesResponse = await fetch('/api/classes?active_only=true');
      if (!classesResponse.ok) throw new Error('Failed to fetch classes');
      const classes = await classesResponse.json();
      
      let assignedIds: number[] = [];
      
      // ✅ Fetch term-specific assignments
      try {
        const assignmentsResponse = await fetch(
          `/api/trainers/${userId}/assignments?term_id=${termId}`
        );
        if (assignmentsResponse.ok) {
          const assignments = await assignmentsResponse.json();
          assignedIds = assignments.map((assignment: any) => assignment.class_id);
        }
      } catch (assignmentError) {
        console.warn('Error fetching assignments:', assignmentError);
      }
      
      setAvailableClasses(classes);
      setAssignedClassIds(assignedIds); // ✅ Store assigned class IDs
      setSelectedClassIds([]); // ✅ Reset selections (only show newly selected)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClassToggle = (classId: number, checked: boolean) => {
    if (!canSelect) return;
    
    // ✅ Don't allow toggling already assigned classes
    if (assignedClassIds.includes(classId)) return;

    const newSelectedIds = checked 
      ? [...selectedClassIds, classId]
      : selectedClassIds.filter(id => id !== classId);
    
    setSelectedClassIds(newSelectedIds);
  };

  const handleSaveSelections = async () => {
    if (!canSelect) {
      setError(blockMessage);
      return;
    }

    if (!termId) {
      setError('Please select a term first');
      return;
    }

    if (selectedClassIds.length === 0) {
      setError('Please select at least one class to add');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      // ✅ Combine assigned + newly selected
      const combinedClassIds = [...assignedClassIds, ...selectedClassIds];
      
      const payload = {
        class_ids: combinedClassIds,
        term_id: termId
      };
            
      const response = await fetch(`/api/trainers/${userId}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setError(result.error || 'You are blocked from making selections');
          await checkBlockStatus();
          return;
        }
        
        throw new Error(result.error || 'Failed to save selections');
      }

      // ✅ Update state to reflect new assignments
      setAssignedClassIds(combinedClassIds);
      setSelectedClassIds([]);

      setSuccessMessage(
        `Successfully added ${selectedClassIds.length} class${selectedClassIds.length !== 1 ? 'es' : ''}!`
      );
      
      onSelectionSaved?.();
      
      setTimeout(() => setSuccessMessage(''), 5000);
      
    } catch (error) {
      console.error('Save selections error:', error);
      setError(error instanceof Error ? error.message : 'Failed to save selections');
    } finally {
      setIsSaving(false);
    }
  };

  if (checkingBlock || isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Block Alerts */}
      {isBlocked && (
        <Alert variant="destructive">
          <Ban className="h-4 w-4" />
          <AlertTitle>Account Blocked</AlertTitle>
          <AlertDescription>
            {blockMessage}
            <br />
            <span className="text-xs mt-2 block">
              Contact your administrator for assistance.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {!isBlocked && isGloballyBlocked && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Selection Temporarily Disabled</AlertTitle>
          <AlertDescription>
            {blockMessage}
            <br />
            <span className="text-xs mt-2 block">
              Please try again later or contact your administrator.
            </span>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Select Your Classes</h2>
          <p className="text-muted-foreground">
            Choose the classes you want to teach for this term.
            Classes you're already teaching are highlighted in green.
          </p>
          {searchTerm && (
            <p className="text-sm text-blue-600 mt-1">
              Showing {assignedClasses.length + unassignedClasses.length} classes for "{searchTerm}"
            </p>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {assignedClassIds.length} assigned • {selectedClassIds.length} newly selected
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* ✅ Classes Grid - Assigned first, then unassigned */}
      <div className="space-y-6">
        {/* ✅ Already Assigned Classes */}
        {assignedClasses.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Already Assigned ({assignedClasses.length})
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {assignedClasses.map((classItem) => (
                <Card 
                  key={classItem.id} 
                  className="ring-2 ring-green-500 bg-green-50/50 border-green-200"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                          <Badge variant="outline" className="text-xs border-green-600 text-green-700">
                            {classItem.code}
                          </Badge>
                          <Badge className="text-xs bg-green-600">
                            Assigned
                          </Badge>
                        </div>
                        <CardTitle className="text-base">{classItem.name}</CardTitle>
                      </div>
                    </div>
                    {classItem.description && (
                      <CardDescription className="text-sm">
                        {classItem.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Building className="h-4 w-4" />
                        {classItem.department}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {classItem.duration_hours}h
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ✅ Available to Assign Classes */}
        {unassignedClasses.length > 0 && (
          <div>
            {assignedClasses.length > 0 && (
              <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase">
                Available to Assign ({unassignedClasses.length})
              </h3>
            )}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {unassignedClasses.map((classItem) => {
                const isNewlySelected = selectedClassIds.includes(classItem.id);
                
                return (
                  <Card 
                    key={classItem.id} 
                    className={`transition-all ${
                      !canSelect 
                        ? 'opacity-60 cursor-not-allowed'
                        : 'cursor-pointer hover:shadow-md'
                    } ${
                      isNewlySelected 
                        ? 'ring-2 ring-blue-500 bg-blue-50/50'
                        : ''
                    }`}
                    onClick={() => canSelect && handleClassToggle(classItem.id, !isNewlySelected)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Checkbox 
                              checked={isNewlySelected}
                              disabled={!canSelect}
                              onChange={() => {}}
                            />
                            <Badge variant="outline" className="text-xs">
                              {classItem.code}
                            </Badge>
                            {isNewlySelected && (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                                New
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-base">{classItem.name}</CardTitle>
                        </div>
                      </div>
                      {classItem.description && (
                        <CardDescription className="text-sm">
                          {classItem.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Building className="h-4 w-4" />
                          {classItem.department}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {classItem.duration_hours}h
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {searchTerm && assignedClasses.length === 0 && unassignedClasses.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No classes match your search for "{searchTerm}"</p>
          <p className="text-sm">Try adjusting your search terms</p>
        </div>
      )}

      {availableClasses.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No classes available yet.</p>
          <p className="text-sm">Contact your administrator to add classes.</p>
        </div>
      )}

      {unassignedClasses.length > 0 && (
        <div className="flex justify-end pt-4 border-t">
          <Button 
            onClick={handleSaveSelections}
            disabled={isSaving || selectedClassIds.length === 0 || !canSelect}
            className="min-w-[120px]"
          >
            {isSaving ? 'Saving...' : canSelect ? `Add ${selectedClassIds.length} Class${selectedClassIds.length !== 1 ? 'es' : ''}` : 'Selection Disabled'}
          </Button>
        </div>
      )}
    </div>
  );
}