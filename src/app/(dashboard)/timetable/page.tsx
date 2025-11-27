// app/timetable/page.tsx
'use client';
import { useState, useEffect } from 'react';
import TimetableGrid from '@/components/timetable/TimetableGrid';
import WeekNavigator from '@/components/timetable/WeekNavigator';
import GenerateTimetableDialog from '@/components/timetable/GenerateTimetableDialog';
import CreateSlotDialog from '@/components/timetable/CreateSlotDialog';
import SlotDetailsDialog from '@/components/timetable/SlotDetailsDialog';
import TimetableHeader from '@/components/timetable/TimetableHeader';
import TermSelector from '@/components/timetable/TermSelector';
import TimetableFilters from '@/components/timetable/TimetableFilters';
import ActiveFiltersDisplay from '@/components/timetable/ActiveFiltersDisplay';
import PrintableTimetable from '@/components/timetable/PrintableTimetable';
import MasterTimetablePrint from '@/components/timetable/MasterTimetablePrint';
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TimetableSlot } from '@/lib/types/timetable';
import { Printer, FileText } from "lucide-react";
import { Button } from '@/components/ui/button';

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

  // Print mode state
  const [printMode, setPrintMode] = useState<'none' | 'master' | 'grouped'>('none');

  // Delete confirmation
  const [deletingSlot, setDeletingSlot] = useState<TimetableSlot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Error handling
  const [error, setError] = useState('');

  // Filter states
  const [filterTrainer, setFilterTrainer] = useState<number | null>(null);
  const [filterDepartment, setFilterDepartment] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<number | null>(null);
  const [filterSubject, setFilterSubject] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');

  // Available filter options
  const [availableTrainers, setAvailableTrainers] = useState<Array<{ id: number, name: string }>>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Array<{ id: number, name: string, code: string }>>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: number, name: string, code: string }>>([]);

  // Computed values
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchUserData();
    fetchTerms();
  }, []);

  useEffect(() => {
    if (selectedTerm) {
      fetchTimetableData();
    }
  }, [selectedTerm, currentWeek, filterTrainer, filterDepartment, filterClass, filterSubject, viewMode]);

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
        if (filterClass) params.append('class_id', filterClass.toString());
        if (filterSubject) params.append('subject_id', filterSubject.toString());
      }

      const response = await fetch(`/api/timetable?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch timetable');

      const data = await response.json();
      setTimetableSlots(data.data);

      // Extract unique trainers, departments, classes, and subjects for filters
      if (viewMode === 'all' && user?.role === 'admin') {
        extractFilterOptions(data.data);
      }
    } catch (error) {
      console.error('Error fetching timetable:', error);
      setError('Failed to load timetable data');
    } finally {
      setIsLoading(false);
    }
  };

  // Extract filter options from timetable data
  const extractFilterOptions = (slots: TimetableSlot[]) => {
    const trainers = new Map<number, string>();
    const departments = new Set<string>();
    const classes = new Map<number, { name: string, code: string }>();
    const subjects = new Map<number, { name: string, code: string }>();

    slots.forEach((slot: TimetableSlot) => {
      if (slot.users) {
        trainers.set(slot.users.id, slot.users.name);
      }
      if (slot.subjects?.department) {
        departments.add(slot.subjects.department);
      }
      if (slot.classes) {
        classes.set(slot.classes.id, {
          name: slot.classes.name,
          code: slot.classes.code
        });
      }
      if (slot.subjects) {
        subjects.set(slot.subjects.id, {
          name: slot.subjects.name,
          code: slot.subjects.code
        });
      }
    });

    setAvailableTrainers(
      Array.from(trainers.entries()).map(([id, name]) => ({ id, name }))
    );
    setAvailableDepartments(Array.from(departments));
    setAvailableClasses(
      Array.from(classes.entries()).map(([id, data]) => ({ id, ...data }))
    );
    setAvailableSubjects(
      Array.from(subjects.entries()).map(([id, data]) => ({ id, ...data }))
    );
  };

  // Handle view mode change
  const handleViewModeChange = (mode: 'all' | 'mine') => {
    setViewMode(mode);
    if (mode === 'mine' && user) {
      setFilterTrainer(user.id);
      clearFilters();
    } else {
      setFilterTrainer(null);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setFilterTrainer(null);
    setFilterDepartment(null);
    setFilterClass(null);
    setFilterSubject(null);
  };

  // Handle printing
  const handlePrint = (mode: 'master' | 'grouped') => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintMode('none'), 500);
    }, 100);
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
      setError('');
    } catch (error) {
      console.error('Error moving slot:', error);
      setError(error instanceof Error ? error.message : 'Failed to move slot');
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <TimetableHeader
        isAdmin={isAdmin}
        onGenerateTimetable={() => setIsGenerateDialogOpen(true)}
        onCreateSlot={() => setIsCreateSlotDialogOpen(true)}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Print Buttons */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => handlePrint('master')}
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Master Timetable
        </Button>
        <Button
          variant="outline"
          onClick={() => handlePrint('grouped')}
        >
          <FileText className="mr-2 h-4 w-4" />
          Print by Class
        </Button>
      </div>

      <div className="flex items-center gap-4 p-4 bg-white rounded-lg border">
        <TermSelector
          terms={terms}
          selectedTerm={selectedTerm}
          onTermChange={setSelectedTerm}
        />

        <TimetableFilters
          isAdmin={isAdmin}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          filterTrainer={filterTrainer}
          filterDepartment={filterDepartment}
          filterClass={filterClass}
          filterSubject={filterSubject}
          onTrainerChange={setFilterTrainer}
          onDepartmentChange={setFilterDepartment}
          onClassChange={setFilterClass}
          onSubjectChange={setFilterSubject}
          onClearFilters={clearFilters}
          availableTrainers={availableTrainers}
          availableDepartments={availableDepartments}
          availableClasses={availableClasses}
          availableSubjects={availableSubjects}
        />
      </div>

      <ActiveFiltersDisplay
        isAdmin={isAdmin}
        viewMode={viewMode}
        filterTrainer={filterTrainer}
        filterClass={filterClass}
        filterSubject={filterSubject}
        filterDepartment={filterDepartment}
        availableTrainers={availableTrainers}
        availableClasses={availableClasses}
        availableSubjects={availableSubjects}
        onRemoveTrainer={() => setFilterTrainer(null)}
        onRemoveClass={() => setFilterClass(null)}
        onRemoveSubject={() => setFilterSubject(null)}
        onRemoveDepartment={() => setFilterDepartment(null)}
      />

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

      {/* Print Views - Conditionally Rendered */}
      {printMode === 'master' && (
        <MasterTimetablePrint
          slots={timetableSlots}
          currentWeek={currentWeek}
          termName={terms.find(t => t.id === selectedTerm)?.name}
        />
      )}

      {printMode === 'grouped' && (
        <PrintableTimetable
          slots={timetableSlots}
          currentWeek={currentWeek}
          termName={terms.find(t => t.id === selectedTerm)?.name}
          groupBy={viewMode === 'mine' || filterTrainer ? 'trainer' : 'class'}
        />
      )}

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
              <strong>{deletingSlot?.subjects?.name}</strong> ({deletingSlot?.classes?.name})?
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