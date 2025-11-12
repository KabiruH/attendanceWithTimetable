// app/timetable/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, Calendar, Filter, X } from "lucide-react";
import TimetableGrid from '@/components/timetable/TimetableGrid';
import WeekNavigator from '@/components/timetable/WeekNavigator';
import GenerateTimetableDialog from '@/components/timetable/GenerateTimetableDialog';
import CreateSlotDialog from '@/components/timetable/CreateSlotDialog';
import SlotDetailsDialog from '@/components/timetable/SlotDetailsDialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface User {
  id: number;
  name: string;
  role: string;
  department: string;
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface TimetableSlot {
  id: string;
  class_id: number;
  employee_id: number;
  room_id: number;
  lesson_period_id: number;
  day_of_week: number;
  status: string;
  class: any;
  room: any;
  lessonPeriod: any;
  trainer: any;
}

export default function TimetablePage() {
  // User and auth state
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Timetable data
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);

  // Week navigation
  const [currentWeek, setCurrentWeek] = useState(() => getCurrentWeekInfo());

  // Dialog states
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isCreateSlotDialogOpen, setIsCreateSlotDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [isSlotDetailsOpen, setIsSlotDetailsOpen] = useState(false);

  // Delete confirmation
  const [deletingSlot, setDeletingSlot] = useState<TimetableSlot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Error handling
  const [error, setError] = useState('');

  // Filter states
  const [filterTrainer, setFilterTrainer] = useState<number | null>(null);
  const [filterDepartment, setFilterDepartment] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all'); // For admin toggle
  const [availableTrainers, setAvailableTrainers] = useState<Array<{id: number, name: string}>>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);

  useEffect(() => {
    fetchUserData();
    fetchTerms();
  }, []);

  useEffect(() => {
    if (selectedTerm) {
      fetchTimetableData();
    }
  }, [selectedTerm, currentWeek, filterTrainer, filterDepartment, viewMode]);

  // Fetch current user
  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/auth/check');
      if (!response.ok) throw new Error('Failed to fetch user data');
      const data = await response.json();
      setUser(data.user);
      
      // If not admin, automatically set view to their schedule
      if (data.user.role !== 'admin') {
        setViewMode('mine');
        setFilterTrainer(data.user.id);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      setError('Failed to load user data');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch all terms
  const fetchTerms = async () => {
    try {
      const response = await fetch('/api/terms');
      if (!response.ok) throw new Error('Failed to fetch terms');
      const data = await response.json();
      setTerms(data.data);

      // Try to get active term
      const activeResponse = await fetch('/api/terms/active');
      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        setSelectedTerm(activeData.data.id);
      } else if (data.data.length > 0) {
        setSelectedTerm(data.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching terms:', error);
    }
  };

  // Fetch timetable data
  const fetchTimetableData = async () => {
    try {
      setIsLoading(true);
      
      const params = new URLSearchParams();
      if (selectedTerm) params.append('term_id', selectedTerm.toString());
      
      // Apply filters based on view mode
      if (viewMode === 'mine' && user) {
        params.append('trainer_id', user.id.toString());
      } else if (viewMode === 'all') {
        if (filterTrainer) params.append('trainer_id', filterTrainer.toString());
        if (filterDepartment) params.append('department', filterDepartment);
      }
      
      const response = await fetch(`/api/timetable?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch timetable');
      
      const data = await response.json();
      setTimetableSlots(data.data);

      // Extract unique trainers and departments for filters
      if (viewMode === 'all' && user?.role === 'admin') {
        const trainers = new Map<number, string>();
        const departments = new Set<string>();

        data.data.forEach((slot: TimetableSlot) => {
          if (slot.trainer) {
            trainers.set(slot.trainer.id, slot.trainer.name);
          }
          if (slot.class?.department) {
            departments.add(slot.class.department);
          }
        });

        setAvailableTrainers(
          Array.from(trainers.entries()).map(([id, name]) => ({ id, name }))
        );
        setAvailableDepartments(Array.from(departments));
      }
    } catch (error) {
      console.error('Error fetching timetable:', error);
      setError('Failed to load timetable data');
    } finally {
      setIsLoading(false);
    }
  };

// Handle slot drag and drop
const handleSlotMove = async (slotId: string, newDayOfWeek: number, newPeriodId: number) => {
  try {
    const response = await fetch(`/api/timetable/${slotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        day_of_week: newDayOfWeek,
        lesson_period_id: newPeriodId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Failed to move slot');
    }

    await fetchTimetableData();
    
    // Show success message
    setError(''); // Clear any previous errors
  } catch (error) {
    console.error('Error moving slot:', error);
    setError(error instanceof Error ? error.message : 'Failed to move slot');
    
    // Refresh to show original state
    await fetchTimetableData();
  }
};

  // Handle slot click for details
  const handleSlotClick = (slot: TimetableSlot) => {
    setSelectedSlot(slot);
    setIsSlotDetailsOpen(true);
  };

  // Handle delete slot
  const handleDeleteSlot = async (slot: TimetableSlot) => {
    setDeletingSlot(slot);
  };

  const confirmDelete = async () => {
    if (!deletingSlot) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/timetable/${deletingSlot.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete slot');
      await fetchTimetableData();
    } catch (error) {
      console.error('Error deleting slot:', error);
      setError('Failed to delete slot');
    } finally {
      setIsDeleting(false);
      setDeletingSlot(null);
    }
  };

  // Week navigation
  const handleWeekChange = (direction: 'prev' | 'next') => {
    const newWeek = { ...currentWeek };
    const offset = direction === 'next' ? 7 : -7;
    newWeek.start.setDate(newWeek.start.getDate() + offset);
    newWeek.end.setDate(newWeek.end.getDate() + offset);
    newWeek.weekNumber = getWeekNumber(newWeek.start);
    setCurrentWeek(newWeek);
  };

  // Clear all filters
  const clearFilters = () => {
    setFilterTrainer(null);
    setFilterDepartment(null);
  };

  // Count active filters
  const activeFiltersCount = [filterTrainer, filterDepartment].filter(Boolean).length;

  const isAdmin = user?.role === 'admin';

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Timetable Management</h1>
          <p className="text-sm text-gray-600">
            {isAdmin ? 'Manage all timetable slots' : 'View and reschedule your classes'}
          </p>
        </div>
        
        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={() => setIsGenerateDialogOpen(true)}>
              <Calendar className="mr-2 h-4 w-4" />
              Generate Timetable
            </Button>
            <Button onClick={() => setIsCreateSlotDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Slot
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-4 p-4 bg-white rounded-lg border">
        <div className="flex-1">
          <Label>Term</Label>
          <Select
            value={selectedTerm?.toString()}
            onValueChange={(value) => setSelectedTerm(parseInt(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id.toString()}>
                  {term.name} {term.is_active && '(Active)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isAdmin && (
          <>
            {/* View Mode Toggle */}
            <div className="flex-1">
              <Label>View Mode</Label>
              <Select
                value={viewMode}
                onValueChange={(value: 'all' | 'mine') => {
                  setViewMode(value);
                  if (value === 'mine') {
                    setFilterTrainer(user?.id || null);
                    setFilterDepartment(null);
                  } else {
                    setFilterTrainer(null);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  <SelectItem value="mine">My Classes Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Advanced Filters (only show when viewing all) */}
            {viewMode === 'all' && (
              <div className="flex items-end">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="relative">
                      <Filter className="mr-2 h-4 w-4" />
                      Filters
                      {activeFiltersCount > 0 && (
                        <Badge 
                          variant="destructive" 
                          className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                        >
                          {activeFiltersCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm">Filter Timetable</h4>
                        {activeFiltersCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearFilters}
                            className="h-7 text-xs"
                          >
                            <X className="mr-1 h-3 w-3" />
                            Clear
                          </Button>
                        )}
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="text-xs">Filter by Trainer</Label>
                        <Select
                          value={filterTrainer?.toString() || 'all'}
                          onValueChange={(value) => 
                            setFilterTrainer(value === 'all' ? null : parseInt(value))
                          }
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="All trainers" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Trainers</SelectItem>
                            {availableTrainers.map((trainer) => (
                              <SelectItem key={trainer.id} value={trainer.id.toString()}>
                                {trainer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Filter by Department</Label>
                        <Select
                          value={filterDepartment || 'all'}
                          onValueChange={(value) => 
                            setFilterDepartment(value === 'all' ? null : value)
                          }
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="All departments" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Departments</SelectItem>
                            {availableDepartments.map((dept) => (
                              <SelectItem key={dept} value={dept}>
                                {dept}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </>
        )}
      </div>

      {/* Active Filters Display */}
      {isAdmin && viewMode === 'all' && activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-900 font-medium">Active Filters:</span>
          {filterTrainer && (
            <Badge variant="secondary" className="gap-1">
              Trainer: {availableTrainers.find(t => t.id === filterTrainer)?.name}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-red-600" 
                onClick={() => setFilterTrainer(null)}
              />
            </Badge>
          )}
          {filterDepartment && (
            <Badge variant="secondary" className="gap-1">
              Department: {filterDepartment}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-red-600" 
                onClick={() => setFilterDepartment(null)}
              />
            </Badge>
          )}
        </div>
      )}

      <WeekNavigator
        currentWeek={currentWeek}
        onPrevWeek={() => handleWeekChange('prev')}
        onNextWeek={() => handleWeekChange('next')}
      />

      <TimetableGrid
        slots={timetableSlots}
        currentWeek={currentWeek}
        onSlotMove={handleSlotMove}
        onSlotClick={handleSlotClick}
        isAdmin={isAdmin}
        userId={user?.id || 0}
      />

      <GenerateTimetableDialog
        open={isGenerateDialogOpen}
        onOpenChange={setIsGenerateDialogOpen}
        onSuccess={fetchTimetableData}
        terms={terms}
      />

      <CreateSlotDialog
        open={isCreateSlotDialogOpen}
        onOpenChange={setIsCreateSlotDialogOpen}
        onSuccess={fetchTimetableData}
        selectedTerm={selectedTerm}
      />

      {selectedSlot && (
        <SlotDetailsDialog
          open={isSlotDetailsOpen}
          onOpenChange={setIsSlotDetailsOpen}
          slot={selectedSlot}
          onDelete={() => handleDeleteSlot(selectedSlot)}
          onUpdate={fetchTimetableData}
          isAdmin={isAdmin}
        />
      )}

      <AlertDialog open={!!deletingSlot} onOpenChange={() => setDeletingSlot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Timetable Slot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this timetable slot for{' '}
              <strong>{deletingSlot?.class?.name}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getCurrentWeekInfo() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const start = new Date(today);
  start.setDate(today.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return {
    start,
    end,
    weekNumber: getWeekNumber(start)
  };
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}