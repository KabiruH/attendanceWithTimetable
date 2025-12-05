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
import PrintTrainerDialog from '@/components/timetable/PrintTrainerDialog'; // Add this import
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
import { Printer, FileText, Building2, UserCheck, Filter } from "lucide-react"; // Add UserCheck icon
import { Button } from '@/components/ui/button';
import PrintFilterDialog from '@/components/timetable/PrintFilterDialog';

interface User {
  id: number;
  name: string;
  role: string;
  department: string;
  has_timetable_admin?: boolean; // Add this
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
  const [filterRoom, setFilterRoom] = useState<number | null>(null);
  const [availableRooms, setAvailableRooms] = useState<Array<{ id: number, name: string }>>([]);

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
  const [isPrintTrainerDialogOpen, setIsPrintTrainerDialogOpen] = useState(false); // Add this

  // Print mode state
const [printMode, setPrintMode] = useState<'none' | 'master' | 'grouped' | 'department' | 'trainer' | 'filtered'>('none');  const [printTrainerId, setPrintTrainerId] = useState<number | null>(null); // Add this
const [isPrintFilterDialogOpen, setIsPrintFilterDialogOpen] = useState(false);
const [printFilterType, setPrintFilterType] = useState<'department' | 'class' | 'combined' | null>(null);
const [printFilterValue, setPrintFilterValue] = useState<string | number | { department: string; classIds: number[] } | null>(null);

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

  // All trainers for print dialog
  const [allTrainers, setAllTrainers] = useState<Array<{ id: number, name: string }>>([]);

  // Computed values
  const isAdmin = user?.role === 'admin';
  const hasTimetableAdminAccess = user?.role === 'admin' || user?.has_timetable_admin === true;

  useEffect(() => {
    fetchUserData();
    fetchTerms();
    fetchDepartments();
    fetchAllTrainers(); // Add this
  }, []);

  useEffect(() => {
    if (selectedTerm) {
      fetchTimetableData();
    }
  }, [selectedTerm, currentWeek, filterTrainer, filterDepartment, filterClass, filterSubject, viewMode, filterRoom]);

  // Fetch current user
const fetchUserData = async () => {
  try {
    const response = await fetch('/api/auth/check');
    if (!response.ok) throw new Error('Failed to fetch user data');
    const data = await response.json();
    setUser(data.user);

    // Only set view to 'mine' if user is NOT admin and NOT timetable admin
    const hasTimetableAccess = data.user.role === 'admin' || data.user.has_timetable_admin === true;
    if (!hasTimetableAccess) {
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

  // Fetch departments from API
  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments');
      if (!response.ok) throw new Error('Failed to fetch departments');
      const data = await response.json();
      
      // Filter only active departments and map to names
      const activeDeptNames = data
        .filter((dept: any) => dept.is_active)
        .map((dept: any) => dept.name);
      
      setAvailableDepartments(activeDeptNames);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  // Fetch all trainers for print dialog
  const fetchAllTrainers = async () => {
    try {
      const response = await fetch('/api/users?role=employee');
      if (!response.ok) throw new Error('Failed to fetch trainers');
      const data = await response.json();
      
      // Map to simple array of id and name
      const trainerList = data.data.map((trainer: any) => ({
        id: trainer.id,
        name: trainer.name
      }));
      
      setAllTrainers(trainerList);
    } catch (error) {
      console.error('Error fetching trainers:', error);
      // Fallback to availableTrainers if API call fails
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
        if (filterRoom) params.append('room_id', filterRoom.toString());
      }

      const response = await fetch(`/api/timetable?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch timetable');

      const data = await response.json();
      setTimetableSlots(data.data);

      // Extract unique trainers, classes, subjects, and rooms for filters
     if (viewMode === 'all' && hasTimetableAdminAccess) {
  extractFilterOptions(data.data);
}
    } catch (error) {
      console.error('Error fetching timetable:', error);
      setError('Failed to load timetable data');
    } finally {
      setIsLoading(false);
    }
  };

// Handle filtered print
// Update the handleFilteredPrint function
const handleFilteredPrint = (
  filterType: 'department' | 'class' | 'combined', 
  filterValue: string | number | { department: string; classIds: number[] }
) => {
  setPrintFilterType(filterType);
  setPrintFilterValue(filterValue);
  setPrintMode('filtered');
  
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      setPrintMode('none');
      setPrintFilterType(null);
      setPrintFilterValue(null);
    }, 500);
  }, 100);
};

// Update getFilteredPrintSlots function
const getFilteredPrintSlots = () => {
  if (!printFilterType || !printFilterValue) return [];
  
  if (printFilterType === 'department') {
    return timetableSlots.filter(slot => slot.subjects?.department === printFilterValue);
  } else if (printFilterType === 'class') {
    return timetableSlots.filter(slot => slot.class_id === printFilterValue);
  } else if (printFilterType === 'combined' && typeof printFilterValue === 'object') {
    const { department, classIds } = printFilterValue as { department: string; classIds: number[] };
    return timetableSlots.filter(
      slot => 
        slot.subjects?.department === department && 
        classIds.includes(slot.class_id)
    );
  }
  
  return [];
};

  // Extract filter options from timetable data
  const extractFilterOptions = (slots: TimetableSlot[]) => {
    const trainers = new Map<number, string>();
  const classes = new Map<number, { name: string, code: string, department: string }>();
  const subjects = new Map<number, { name: string, code: string }>();
    const rooms = new Map<number, string>();

    slots.forEach((slot: TimetableSlot) => {
      if (slot.users) {
        trainers.set(slot.users.id, slot.users.name);
      }
      if (slot.classes) {
        classes.set(slot.classes.id, {
          name: slot.classes.name,
          code: slot.classes.code,
          department: slot.classes.department 
        });
      }
      if (slot.subjects) {
        subjects.set(slot.subjects.id, {
          name: slot.subjects.name,
          code: slot.subjects.code
        });
      }
      if (slot.rooms) { 
        rooms.set(slot.rooms.id, slot.rooms.name);
      }
    });

    setAvailableTrainers(
      Array.from(trainers.entries()).map(([id, name]) => ({ id, name }))
    );
    setAvailableClasses(
      Array.from(classes.entries()).map(([id, data]) => ({ id, ...data }))
    );
    setAvailableSubjects(
      Array.from(subjects.entries()).map(([id, data]) => ({ id, ...data }))
    );
    setAvailableRooms( 
      Array.from(rooms.entries()).map(([id, name]) => ({ id, name }))
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
    setFilterRoom(null);
  };

  // Handle printing
  const handlePrint = (mode: 'master' | 'grouped' | 'department') => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintMode('none'), 500);
    }, 100);
  };

  // Handle trainer print
  const handlePrintTrainer = async (trainerId: number) => {
    setPrintTrainerId(trainerId);
    setPrintMode('trainer');
    
    // Small delay to ensure state is set before printing
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setPrintMode('none');
        setPrintTrainerId(null);
      }, 500);
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

  // Get filtered slots for trainer print
  const getTrainerPrintSlots = () => {
    if (!printTrainerId) return [];
    return timetableSlots.filter(slot => slot.employee_id === printTrainerId);
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
  isAdmin={hasTimetableAdminAccess} // Changed from isAdmin
  onGenerateTimetable={() => setIsGenerateDialogOpen(true)}
  onCreateSlot={() => setIsCreateSlotDialogOpen(true)}
/>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Print Buttons - Updated */}
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
        <Button
          variant="outline"
          onClick={() => handlePrint('department')}
        >
          <Building2 className="mr-2 h-4 w-4" />
          Print by Department
        </Button>
        <Button
          variant="outline"
          onClick={() => setIsPrintTrainerDialogOpen(true)}
        >
          <UserCheck className="mr-2 h-4 w-4" />
          Print Trainer Schedule
        </Button>

          <Button
    variant="outline"
    onClick={() => setIsPrintFilterDialogOpen(true)}
  >
    <Filter className="mr-2 h-4 w-4" />
    Print Filtered
  </Button>
      </div>

      <div className="flex items-center gap-4 p-4 bg-white rounded-lg border">
        <TermSelector
          terms={terms}
          selectedTerm={selectedTerm}
          onTermChange={setSelectedTerm}
        />

        <TimetableFilters
  isAdmin={hasTimetableAdminAccess}         
  viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          filterTrainer={filterTrainer}
          filterDepartment={filterDepartment}
          filterClass={filterClass}
          filterSubject={filterSubject}
          filterRoom={filterRoom}
          onTrainerChange={setFilterTrainer}
          onDepartmentChange={setFilterDepartment}
          onClassChange={setFilterClass}
          onSubjectChange={setFilterSubject}
          onRoomChange={setFilterRoom} 
          onClearFilters={clearFilters}
          availableTrainers={availableTrainers}
          availableDepartments={availableDepartments}
          availableClasses={availableClasses}
          availableSubjects={availableSubjects}
          availableRooms={availableRooms}
        />
      </div>

      <ActiveFiltersDisplay
isAdmin={hasTimetableAdminAccess}        
viewMode={viewMode}
        filterTrainer={filterTrainer}
        filterClass={filterClass}
        filterSubject={filterSubject}
        filterDepartment={filterDepartment}
        filterRoom={filterRoom} 
        availableTrainers={availableTrainers}
        availableClasses={availableClasses}
        availableSubjects={availableSubjects}
        availableRooms={availableRooms} 
        onRemoveTrainer={() => setFilterTrainer(null)}
        onRemoveClass={() => setFilterClass(null)}
        onRemoveSubject={() => setFilterSubject(null)}
        onRemoveDepartment={() => setFilterDepartment(null)}
        onRemoveRoom={() => setFilterRoom(null)} 
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

      {printMode === 'department' && (
        <PrintableTimetable
          slots={timetableSlots}
          currentWeek={currentWeek}
          termName={terms.find(t => t.id === selectedTerm)?.name}
          groupBy="department"
        />
      )}

      {printMode === 'trainer' && printTrainerId && (
        <PrintableTimetable
          slots={getTrainerPrintSlots()}
          currentWeek={currentWeek}
          termName={terms.find(t => t.id === selectedTerm)?.name}
          groupBy="trainer"
        />
      )}

      {/* Add after printMode === 'trainer' section */}
{printMode === 'filtered' && printFilterType && printFilterValue && (
  <PrintableTimetable
    slots={getFilteredPrintSlots()}
    currentWeek={currentWeek}
    termName={terms.find(t => t.id === selectedTerm)?.name}
    groupBy={printFilterType === 'class' ? 'class' : 'department'}
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
  isAdmin={hasTimetableAdminAccess}
        />
      )}

      {/* Print Trainer Dialog */}
      <PrintTrainerDialog
        open={isPrintTrainerDialogOpen}
        onOpenChange={setIsPrintTrainerDialogOpen}
        trainers={allTrainers.length > 0 ? allTrainers : availableTrainers}
        onPrint={handlePrintTrainer}
      />

      {/* Add after PrintTrainerDialog */}
<PrintFilterDialog
  open={isPrintFilterDialogOpen}
  onOpenChange={setIsPrintFilterDialogOpen}
  departments={availableDepartments}
  classes={availableClasses}
  onPrint={handleFilteredPrint}
/>

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