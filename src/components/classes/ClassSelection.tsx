//components/classes/classSelection.tsx
import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Users, Building, Calendar } from "lucide-react";
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
  onSelectionSaved?: () => void;
  searchTerm?: string;
  onClassesLoaded?: (classes: Class[]) => void;
}

export default function ClassSelection({ 
  userId, 
  onSelectionSaved, 
  searchTerm = '',
  onClassesLoaded 
}: ClassSelectionProps) {
  const [availableClasses, setAvailableClasses] = useState<Class[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [savedClassIds, setSavedClassIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filter classes based on search term
  const filteredClasses = useMemo(() => {
    if (!searchTerm.trim()) return availableClasses;
    
    const term = searchTerm.toLowerCase();
    return availableClasses.filter(classItem => 
      classItem.name.toLowerCase().includes(term) ||
      classItem.code.toLowerCase().includes(term) ||
      classItem.department.toLowerCase().includes(term)
    );
  }, [availableClasses, searchTerm]);

  // ✅ Fetch terms on mount
  useEffect(() => {
    fetchTerms();
  }, []);

  // ✅ Fetch classes and assignments when term changes
  useEffect(() => {
    if (selectedTerm) {
      fetchClassesAndAssignments();
    }
  }, [userId, selectedTerm]);

  // Send classes to parent when they're loaded
  useEffect(() => {
    if (availableClasses.length > 0) {
      onClassesLoaded?.(availableClasses);
    }
  }, [availableClasses, onClassesLoaded]);

  // ✅ NEW: Fetch available terms
  const fetchTerms = async () => {
    try {
      const response = await fetch('/api/terms');
      if (!response.ok) throw new Error('Failed to fetch terms');
      const data = await response.json();
      setTerms(data.data || []);

      // Try to get active term
      const activeResponse = await fetch('/api/terms/active');
      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        setSelectedTerm(activeData.data.id);
      } else if (data.data.length > 0) {
        // Default to first term if no active term
        setSelectedTerm(data.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching terms:', error);
      setError('Failed to load terms');
    }
  };

  const fetchClassesAndAssignments = async () => {
    if (!selectedTerm) return;

    try {
      setIsLoading(true);
      
      // Fetch all active classes
      const classesResponse = await fetch('/api/classes?active_only=true');
      if (!classesResponse.ok) throw new Error('Failed to fetch classes');
      const classes = await classesResponse.json();
      
      let assignedClassIds: number[] = [];
      
      // Try to fetch user's current assignments for this term
      try {
        const assignmentsResponse = await fetch(`/api/trainers/${userId}/assignments`);
        if (assignmentsResponse.ok) {
          const assignments = await assignmentsResponse.json();
          assignedClassIds = assignments.map((assignment: any) => assignment.class_id);
        } else {
          console.warn(`Failed to fetch assignments for user ${userId}: ${assignmentsResponse.status}`);
        }
      } catch (assignmentError) {
        console.warn('Error fetching assignments:', assignmentError);
      }
      
      setAvailableClasses(classes);
      setSelectedClassIds(assignedClassIds);
      setSavedClassIds(assignedClassIds);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClassToggle = (classId: number, checked: boolean) => {
    const newSelectedIds = checked 
      ? [...selectedClassIds, classId]
      : selectedClassIds.filter(id => id !== classId);
    
    setSelectedClassIds(newSelectedIds);
  };

const handleSaveSelections = async () => 
  {
  if (!selectedTerm) {
    setError('Please select a term first');
    return;
  }

  console.log('🔍 DEBUG 1 - Before sending:', {
    selectedTerm,
    type: typeof selectedTerm,
    isNumber: !isNaN(selectedTerm),
    userId
  });

  setIsSaving(true);
  setError('');
  setSuccessMessage('');

  try {
    // Combine currently selected with previously saved
    const combinedClassIds = [...new Set([...savedClassIds, ...selectedClassIds])];
    
    const payload = {
      class_ids: combinedClassIds,
      term_id: selectedTerm
    };
    
    console.log('🔍 DEBUG 2 - Payload:', JSON.stringify(payload, null, 2));
          
    const response = await fetch(`/api/trainers/${userId}/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('🔍 DEBUG 3 - API Response:', result);

    if (!response.ok) {
      console.error('API Error:', result);
      throw new Error(result.error || 'Failed to save selections');
    }

    // Update saved state
    setSavedClassIds(combinedClassIds);
    setSelectedClassIds(combinedClassIds);

    // ✅ Show success message with details
    const termName = terms.find(t => t.id === selectedTerm)?.name || 'selected term';
    setSuccessMessage(
      `Successfully updated class assignments for ${termName}! ` +
      `You are now assigned to ${combinedClassIds.length} ${combinedClassIds.length === 1 ? 'class' : 'classes'} ` +
      `with ${result.subject_assignments || 0} subjects.`
    );
    
    // Call parent callback if provided
    onSelectionSaved?.();
    
    // Clear success message after 5 seconds
    setTimeout(() => setSuccessMessage(''), 5000);
    
  } catch (error) {
    console.error('Save selections error:', error);
    setError(error instanceof Error ? error.message : 'Failed to save selections');
  } finally {
    setIsSaving(false);
  }
};

  if (isLoading && selectedTerm === null) {
    return (
      <div className="flex justify-center items-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ✅ NEW: Term Selection */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Label htmlFor="term" className="flex items-center gap-2 mb-2">
          <Calendar className="h-4 w-4" />
          <span className="font-semibold">Select Term</span>
        </Label>
        <Select
          value={selectedTerm?.toString()}
          onValueChange={(value) => setSelectedTerm(parseInt(value))}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Select a term" />
          </SelectTrigger>
          <SelectContent>
            {terms.map((term) => (
              <SelectItem key={term.id} value={term.id.toString()}>
                {term.name} {term.is_active && '(Active)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Class assignments are term-specific. Select the term you want to assign classes for.
        </p>
      </div>

      {/* Show content only if term is selected */}
      {selectedTerm ? (
        <>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Select Your Classes</h2>
              <p className="text-muted-foreground">
                Choose the classes you want to teach for{' '}
                <strong>{terms.find(t => t.id === selectedTerm)?.name}</strong>.
                You can check attendance only for selected classes.
              </p>
              {searchTerm && (
                <p className="text-sm text-blue-600 mt-1">
                  Showing {filteredClasses.length} of {availableClasses.length} classes for "{searchTerm}"
                </p>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedClassIds.length} of {availableClasses.length} classes selected
            </div>
          </div>

          {filteredClasses.length > 0 && (
            <div className="flex justify-end pt-4 border-t">
              <Button 
                onClick={handleSaveSelections}
                disabled={isSaving || !selectedTerm}
                className="min-w-[120px]"
              >
                {isSaving ? 'Saving...' : 'Save Selection'}
              </Button>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Classes Grid */}
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredClasses.map((classItem) => {
                const isSelected = selectedClassIds.includes(classItem.id);
                const isAlreadySaved = savedClassIds.includes(classItem.id);
                const isNewlySelected = isSelected && !isAlreadySaved;
                
                return (
                  <Card 
                    key={classItem.id} 
                    className={`cursor-pointer transition-all ${
                      isAlreadySaved
                        ? 'ring-2 ring-green-500 bg-green-50/50'
                        : isNewlySelected 
                          ? 'ring-2 ring-blue-500 bg-blue-50/50'
                          : 'hover:shadow-md'
                    }`}
                    onClick={() => handleClassToggle(classItem.id, !isSelected)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Checkbox 
                              checked={isSelected}
                              onChange={() => {}}
                            />
                            <Badge variant="outline" className="text-xs">
                              {classItem.code}
                            </Badge>
                            {isAlreadySaved && (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                Saved
                              </Badge>
                            )}
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
          )}

          {searchTerm && filteredClasses.length === 0 && availableClasses.length > 0 && (
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

          {filteredClasses.length > 0 && (
            <div className="flex justify-end pt-4 border-t">
              <Button 
                onClick={handleSaveSelections}
                disabled={isSaving || !selectedTerm}
                className="min-w-[120px]"
              >
                {isSaving ? 'Saving...' : 'Save Selection'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Please select a term to view and assign classes.</p>
        </div>
      )}
    </div>
  );
}