// components/terms/AssignClassesDialog.tsx
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Book, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface Class {
  id: number;
  name: string;
  code: string;
  description: string;
  department: string;
  duration_hours: number;
  assignedToTerm?: string; // Name of term this class is assigned to (if any)
}

interface AssignClassesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: Term;
  onSuccess: () => void;
}

export default function AssignClassesDialog({
  open,
  onOpenChange,
  term,
  onSuccess,
}: AssignClassesDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [initialClassIds, setInitialClassIds] = useState<number[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, term.id]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Fetch all classes
      const classesResponse = await fetch('/api/classes');
      if (!classesResponse.ok) throw new Error('Failed to fetch classes');
      const classesData = await classesResponse.json();
      
      // Fetch all term-class assignments to check which classes are assigned where
      let classAssignments: Record<number, string> = {};
      
      try {
        const allTermClassesResponse = await fetch('/api/terms/all-assignments');
        if (allTermClassesResponse.ok) {
          const assignmentsData = await allTermClassesResponse.json();
          // Create a map of class_id -> term_name (excluding current term)
          if (assignmentsData.data && Array.isArray(assignmentsData.data)) {
            assignmentsData.data.forEach((assignment: any) => {
              if (assignment.term_id !== term.id && assignment.term?.is_active) {
                classAssignments[assignment.class_id] = assignment.term.name;
              }
            });
          }
        }
      } catch (error) {
        console.log('Could not fetch term assignments - continuing without conflict detection');
      }

      // Enhance classes with assignment info
      const enhancedClasses = (classesData.data || classesData).map((cls: Class) => ({
        ...cls,
        assignedToTerm: classAssignments[cls.id]
      }));
      
      setAllClasses(enhancedClasses);

      // Fetch classes already assigned to this term
      const assignedResponse = await fetch(`/api/terms/${term.id}/classes`);
      if (assignedResponse.ok) {
        const assignedData = await assignedResponse.json();
        const assignedIds = assignedData.data.map((c: any) => c.id);
        setSelectedClassIds(assignedIds);
        setInitialClassIds(assignedIds);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load classes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleClass = (classId: number, cls: Class) => {
    // Prevent selection if class is assigned to another term
    if (cls.assignedToTerm && !selectedClassIds.includes(classId)) {
      setError(`Cannot select "${cls.code}" - already assigned to ${cls.assignedToTerm}`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  };

  const handleSelectAll = () => {
    const filtered = getFilteredClasses();
    // Only select classes that are not assigned to other terms
    const availableIds = filtered
      .filter(c => !c.assignedToTerm)
      .map(c => c.id);
    
    setSelectedClassIds((prev) => {
      const newSet = new Set([...prev, ...availableIds]);
      return Array.from(newSet);
    });
  };

  const handleDeselectAll = () => {
    const filteredIds = getFilteredClasses().map((c) => c.id);
    setSelectedClassIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/terms/${term.id}/classes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          class_ids: selectedClassIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle conflict error with better formatting
        if (response.status === 409 && data.conflicts) {
          const conflictMessage = data.conflicts.map((conflict: any) => 
            `${conflict.term_name}: ${conflict.classes.map((c: any) => c.code).join(', ')}`
          ).join('\n');
          throw new Error(`Classes already assigned:\n${conflictMessage}`);
        }
        throw new Error(data.error || 'Failed to assign classes');
      }

      setSuccess(`Successfully assigned ${selectedClassIds.length} classes to ${term.name}`);
      setInitialClassIds(selectedClassIds);
      
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
        resetState();
      }, 1500);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to assign classes');
    } finally {
      setIsSaving(false);
    }
  };

  const resetState = () => {
    setSearchQuery('');
    setDepartmentFilter('all');
    setShowOnlyAvailable(false);
    setSuccess('');
    setError('');
  };

  const getFilteredClasses = () => {
    return allClasses.filter((cls) => {
      const matchesSearch =
        cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDepartment =
        departmentFilter === 'all' || cls.department === departmentFilter;
      const matchesAvailability = 
        !showOnlyAvailable || !cls.assignedToTerm;
      
      return matchesSearch && matchesDepartment && matchesAvailability;
    });
  };

  const getDepartments = () => {
    const departments = new Set(allClasses.map((c) => c.department));
    return Array.from(departments).sort();
  };

  const getChangesCount = () => {
    const added = selectedClassIds.filter((id) => !initialClassIds.includes(id)).length;
    const removed = initialClassIds.filter((id) => !selectedClassIds.includes(id)).length;
    return { added, removed, total: added + removed };
  };

  const getAvailableCount = () => {
    return allClasses.filter(c => !c.assignedToTerm).length;
  };

  const filteredClasses = getFilteredClasses();
  const changes = getChangesCount();
  const availableCount = getAvailableCount();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign Classes to {term.name}</DialogTitle>
          <DialogDescription>
            Select which classes will be taught during this term.
            Classes can only be assigned to one active term at a time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {/* Filters */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {getDepartments().map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Show only available toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-available"
                checked={showOnlyAvailable}
                onCheckedChange={(checked) => setShowOnlyAvailable(checked as boolean)}
              />
              <label
                htmlFor="show-available"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Show only available classes ({availableCount} available)
              </label>
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {selectedClassIds.length} of {allClasses.length} classes selected
                {changes.total > 0 && (
                  <span className="ml-2 text-blue-600">
                    ({changes.added > 0 && `+${changes.added}`}
                    {changes.removed > 0 && ` -${changes.removed}`})
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={isLoading}
                >
                  Select All Available
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  disabled={isLoading}
                >
                  Deselect All
                </Button>
              </div>
            </div>
          </div>

          {/* Classes List */}
          <div className="flex-1 overflow-y-auto border rounded-lg">
            {isLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                <Book className="h-12 w-12 mb-2 text-gray-400" />
                <p>No classes found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredClasses.map((cls) => {
                  const isSelected = selectedClassIds.includes(cls.id);
                  const wasInitiallySelected = initialClassIds.includes(cls.id);
                  const isNew = isSelected && !wasInitiallySelected;
                  const isRemoved = !isSelected && wasInitiallySelected;
                  const isAssignedElsewhere = !!cls.assignedToTerm;
                  const isDisabled = isAssignedElsewhere && !isSelected;

                  return (
                    <div
                      key={cls.id}
                      className={`p-4 transition-colors ${
                        isDisabled ? 'bg-gray-50 opacity-60' :
                        isNew ? 'bg-green-50 hover:bg-green-100' : 
                        isRemoved ? 'bg-red-50 hover:bg-red-100' : 
                        'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`class-${cls.id}`}
                          checked={isSelected}
                          onCheckedChange={() => handleToggleClass(cls.id, cls)}
                          disabled={isDisabled}
                          className="mt-1"
                        />
                        <label
                          htmlFor={`class-${cls.id}`}
                          className={`flex-1 ${isDisabled ? '' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium">{cls.code}</span>
                            <Badge variant="outline" className="text-xs">
                              {cls.department}
                            </Badge>
                            {isNew && (
                              <Badge className="bg-green-500 text-xs">New</Badge>
                            )}
                            {isRemoved && (
                              <Badge variant="destructive" className="text-xs">
                                Removed
                              </Badge>
                            )}
                            {isAssignedElsewhere && (
                              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Assigned to {cls.assignedToTerm}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-900 mb-1">
                            {cls.name}
                          </div>
                          {cls.description && (
                            <div className="text-xs text-gray-500 line-clamp-1">
                              {cls.description}
                            </div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">
                            Duration: {cls.duration_hours} hours
                          </div>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoading || changes.total === 0}
            >
              {isSaving ? 'Saving...' : `Save Changes (${changes.total})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}