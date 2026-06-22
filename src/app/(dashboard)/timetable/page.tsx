'use client';
import { useState, useEffect, useCallback } from 'react';
import TimetableGrid from '@/components/timetable/TimetableGrid';
import WeekNavigator from '@/components/timetable/WeekNavigator';
import GenerateTimetableDialog from '@/components/timetable/GenerateTimetableDialog';
import CreateSlotDialog from '@/components/timetable/CreateSlotDialog';
import SlotDetailsDialog from '@/components/timetable/SlotDetailsDialog';
import TimetableHeader from '@/components/timetable/TimetableHeader';
import TermSelector from '@/components/timetable/TermSelector';
import TimetableFilters, { SlotTypeFilter } from '@/components/timetable/TimetableFilters';
import ActiveFiltersDisplay from '@/components/timetable/ActiveFiltersDisplay';
import PrintableTimetable from '@/components/timetable/PrintableTimetable';
import MasterTimetablePrint from '@/components/timetable/MasterTimetablePrint';
import PrintTrainerDialog from '@/components/timetable/PrintTrainerDialog';
import DraftSelectionDialog from '@/components/timetable/DraftSelectionDialogue';
import PrintSlotTypeDialog from '@/components/timetable/PrintSlotTypeDialog';
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
import PrintRoomDialog from '@/components/timetable/PrintRoomDialog';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TimetableSlot } from '@/lib/types/timetable';
import { Printer, FileText, DoorOpen, Building2, UserCheck, Filter, ClipboardList, ScrollText } from "lucide-react";
import { Button } from '@/components/ui/button';
import PrintFilterDialog from '@/components/timetable/PrintFilterDialog';


interface User {
  id: number;
  name: string;
  role: string;
  department: string;
  has_timetable_admin?: boolean;
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface Draft {
  draft_id: number;
  draft_number: number;
  stats: {
    slots_created: number;
    trainer_assignments_processed: number;
    assignments_fully_scheduled: number;
    trainers_assigned: number;
    rooms_used: number;
    subjects_scheduled: number;
    assignments_partially_scheduled: number;
  };
  skipped_count: number;
  skipped_assignments?: any[];
}

export default function TimetablePage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterRoom, setFilterRoom] = useState<number | null>(null);
  const [availableRooms, setAvailableRooms] = useState<Array<{ id: number, name: string }>>([]);

  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);

  const [currentWeek, setCurrentWeek] = useState(() => getCurrentWeekInfo());

  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isCreateSlotDialogOpen, setIsCreateSlotDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [isSlotDetailsOpen, setIsSlotDetailsOpen] = useState(false);
  const [isPrintTrainerDialogOpen, setIsPrintTrainerDialogOpen] = useState(false);

  // Draft selection state (for "resume pending drafts" flow)
  const [isDraftDialogOpen, setIsDraftDialogOpen] = useState(false);
  const [pendingDrafts, setPendingDrafts] = useState<Draft[]>([]);
  const [pendingDraftTermName, setPendingDraftTermName] = useState('');
  const [pendingDraftGeneratedBy, setPendingDraftGeneratedBy] = useState('');
  const [pendingDraftGeneratedAt, setPendingDraftGeneratedAt] = useState('');
  const [pendingDraftTermId, setPendingDraftTermId] = useState<number | null>(null);
  const [hasPendingDrafts, setHasPendingDrafts] = useState(false);

const [printMode, setPrintMode] = useState<'none' | 'master' | 'grouped' | 'department' | 'trainer' | 'filtered' | 'room'>('none');  
const [printTrainerId, setPrintTrainerId] = useState<number | null>(null);
  const [isPrintFilterDialogOpen, setIsPrintFilterDialogOpen] = useState(false);
const [printFilterType, setPrintFilterType] = useState<'department' | 'class' | 'combined' | 'department_trainer' | null>(null);
const [printFilterValue, setPrintFilterValue] = useState<string | number | { department: string; classIds: number[] } | { department: string; trainerIds: number[] } | null>(null);

  const [deletingSlot, setDeletingSlot] = useState<TimetableSlot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const [filterTrainer, setFilterTrainer] = useState<number | null>(null);
  const [filterDepartment, setFilterDepartment] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<number | null>(null);
  const [filterSubject, setFilterSubject] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');

  const [availableTrainers, setAvailableTrainers] = useState<Array<{ id: number, name: string }>>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Array<{ id: number, name: string, code: string, department: string }>>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: number, name: string, code: string }>>([]);
  const [allTrainers, setAllTrainers] = useState<Array<{ id: number, name: string }>>([]);

const [filterSlotType, setFilterSlotType] = useState<SlotTypeFilter>('all');
const [isPrintSlotTypeDialogOpen, setIsPrintSlotTypeDialogOpen] = useState(false);
const [pendingPrintMode, setPendingPrintMode] = useState<'master' | 'grouped' | 'department' | 'room' | null>(null);
const [printSlotType, setPrintSlotType] = useState<SlotTypeFilter>('all');

const [isPrintRoomDialogOpen, setIsPrintRoomDialogOpen] = useState(false);
const [printRoomId, setPrintRoomId] = useState<number | null>(null);

  const isAdmin = user?.role === 'admin';
  const hasTimetableAdminAccess = user?.role === 'admin' || user?.has_timetable_admin === true;

  useEffect(() => {
    fetchUserData();
    fetchTerms();
    fetchDepartments();
    fetchAllTrainers();
  }, []);

  useEffect(() => {
    if (selectedTerm) {
      fetchTimetableData();
      // Check for pending drafts whenever the selected term changes
      if (hasTimetableAdminAccess) {
        checkPendingDrafts(selectedTerm);
      }
    }
  }, [selectedTerm, currentWeek, filterTrainer, filterDepartment, filterClass, filterSubject, viewMode, filterRoom]);

  // Check for pending drafts for selected term
  const checkPendingDrafts = async (termId: number) => {
    try {
      const response = await fetch(`/api/timetable/drafts?term_id=${termId}`);
      if (!response.ok) return;
      const data = await response.json();

      if (data.has_drafts) {
        const termName = terms.find(t => t.id === termId)?.name ?? '';
        setPendingDrafts(data.drafts);
        setPendingDraftTermName(termName);
        setPendingDraftGeneratedBy(data.generated_by ?? '');
        setPendingDraftGeneratedAt(data.generated_at ?? '');
        setPendingDraftTermId(termId);
        setHasPendingDrafts(true);
      } else {
        setHasPendingDrafts(false);
        setPendingDrafts([]);
      }
    } catch {
      // Silently fail — drafts check is non-critical
    }
  };

const fetchUserData = async () => {
  try {
    const response = await fetch('/api/auth/check');
    if (!response.ok) throw new Error('Failed to fetch user data');
    const data = await response.json();
    setUser(data.user);
    const hasTimetableAccess = data.user.role === 'admin' || !!data.user.has_timetable_admin;
    if (!hasTimetableAccess) {
      setViewMode('mine');
      setFilterTrainer(data.user.id);
    }
 
  } catch (err){
    setError('Failed to load user data');
  } finally {
    setIsLoading(false);
  }
};


  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments');
      if (!response.ok) return;
      const data = await response.json();
      setAvailableDepartments(data.filter((d: any) => d.is_active).map((d: any) => d.name));
    } catch { /* ignore */ }
  };

  const fetchAllTrainers = async () => {
    try {
      const response = await fetch('/api/users?role=employee');
      if (!response.ok) return;
      const data = await response.json();
      setAllTrainers(data.data.map((t: any) => ({ id: t.id, name: t.name })));
    } catch { /* ignore */ }
  };

  const fetchTerms = async () => {
    try {
      const response = await fetch('/api/terms');
      if (!response.ok) return;
      const data = await response.json();
      setTerms(data.data);

      const activeResponse = await fetch('/api/terms/active');
      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        setSelectedTerm(activeData.data.id);
      } else if (data.data.length > 0) {
        setSelectedTerm(data.data[0].id);
      }
    } catch { /* ignore */ }
  };

  const fetchTimetableData = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedTerm) params.append('term_id', selectedTerm.toString());

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

      if (viewMode === 'all' && hasTimetableAdminAccess) {
        extractFilterOptions(data.data);
      }
    } catch {
      setError('Failed to load timetable data');
    } finally {
      setIsLoading(false);
    }
  };

const handleFilteredPrint = (
  filterType: 'department' | 'class' | 'combined' | 'department_trainer',
  filterValue: string | number | { department: string; classIds: number[] } | { department: string; trainerIds: number[] }
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

const getFilteredPrintSlots = () => {
  if (!printFilterType || !printFilterValue) return [];
  if (printFilterType === 'department')
    return timetableSlots.filter(s => s.subjects?.department === printFilterValue);
  if (printFilterType === 'class')
    return timetableSlots.filter(s => s.class_id === printFilterValue);
  if (printFilterType === 'combined' && typeof printFilterValue === 'object') {
    const { department, classIds } = printFilterValue as { department: string; classIds: number[] };
    return timetableSlots.filter(s =>
      s.subjects?.department === department && classIds.includes(s.class_id)
    );
  }
  if (printFilterType === 'department_trainer' && typeof printFilterValue === 'object') {
    const { department, trainerIds } = printFilterValue as { department: string; trainerIds: number[] };
    return timetableSlots.filter(s =>
      s.subjects?.department === department && trainerIds.includes(s.employee_id)
    );
  }
  return [];
};

  const extractFilterOptions = (slots: TimetableSlot[]) => {
    const trainers = new Map<number, string>();
    const classes = new Map<number, { name: string, code: string, department: string }>();
    const subjects = new Map<number, { name: string, code: string }>();
    const rooms = new Map<number, string>();

    slots.forEach((slot: TimetableSlot) => {
      if (slot.users) trainers.set(slot.users.id, slot.users.name);
      if (slot.classes) classes.set(slot.classes.id, { name: slot.classes.name, code: slot.classes.code, department: slot.classes.department });
      if (slot.subjects) subjects.set(slot.subjects.id, { name: slot.subjects.name, code: slot.subjects.code });
      if (slot.rooms) rooms.set(slot.rooms.id, slot.rooms.name);
    });

    setAvailableTrainers(Array.from(trainers.entries()).map(([id, name]) => ({ id, name })));
    setAvailableClasses(Array.from(classes.entries()).map(([id, data]) => ({ id, ...data })));
    setAvailableSubjects(Array.from(subjects.entries()).map(([id, data]) => ({ id, ...data })));
    setAvailableRooms(Array.from(rooms.entries()).map(([id, name]) => ({ id, name })));
  };

  const handleViewModeChange = (mode: 'all' | 'mine') => {
    setViewMode(mode);
    if (mode === 'mine' && user) { setFilterTrainer(user.id); clearFilters(); }
    else setFilterTrainer(null);
  };

  const clearFilters = () => {
    setFilterTrainer(null);
    setFilterDepartment(null);
    setFilterClass(null);
    setFilterSubject(null);
    setFilterRoom(null);
    setFilterSlotType('all'); 
  };

const handlePrint = (mode: 'master' | 'grouped' | 'department' | 'room') => {
  setPendingPrintMode(mode);
  setIsPrintSlotTypeDialogOpen(true);
};

const handlePrintConfirmed = (filter: SlotTypeFilter) => {
  if (!pendingPrintMode) return;
  setPrintSlotType(filter);
  setPrintMode(pendingPrintMode);
  setTimeout(() => { window.print(); setTimeout(() => setPrintMode('none'), 500); }, 100);
  setPendingPrintMode(null);
};

  const handlePrintTrainer = async (trainerId: number) => {
    setPrintTrainerId(trainerId);
    setPrintMode('trainer');
    setTimeout(() => {
      window.print();
      setTimeout(() => { setPrintMode('none'); setPrintTrainerId(null); }, 500);
    }, 100);
  };

  const handleSlotMove = async (slotId: string, newDayOfWeek: number, newPeriodId: number) => {
    try {
      const response = await fetch(`/api/timetable/${slotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_of_week: newDayOfWeek, lesson_period_id: newPeriodId })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.details || err.error || 'Failed to move slot');
      }
      await fetchTimetableData();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to move slot');
      await fetchTimetableData();
    }
  };

  const handleSlotClick = (slot: TimetableSlot) => { setSelectedSlot(slot); setIsSlotDetailsOpen(true); };
  const handleDeleteSlot = (slot: TimetableSlot) => setDeletingSlot(slot);

  const confirmDelete = async () => {
    if (!deletingSlot) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/timetable/${deletingSlot.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete slot');
      await fetchTimetableData();
    } catch {
      setError('Failed to delete slot');
    } finally {
      setIsDeleting(false);
      setDeletingSlot(null);
    }
  };

  const handleWeekChange = (direction: 'prev' | 'next') => {
    const newWeek = { ...currentWeek };
    const offset = direction === 'next' ? 7 : -7;
    newWeek.start.setDate(newWeek.start.getDate() + offset);
    newWeek.end.setDate(newWeek.end.getDate() + offset);
    newWeek.weekNumber = getWeekNumber(newWeek.start);
    setCurrentWeek(newWeek);
  };

  const getTrainerPrintSlots = () => {
    if (!printTrainerId) return [];
    return timetableSlots.filter(slot => slot.employee_id === printTrainerId);
  };

  // Draft flow handlers (for the "resume" path from the banner)
  const handleConfirmDraft = async (draftId: number) => {
    const response = await fetch('/api/timetable/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: draftId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to confirm timetable');

    setIsDraftDialogOpen(false);
    setHasPendingDrafts(false);
    setPendingDrafts([]);
    fetchTimetableData();
  };

  const handleDiscardDrafts = async () => {
    if (!pendingDraftTermId) return;
    const response = await fetch(`/api/timetable/drafts?term_id=${pendingDraftTermId}`, { method: 'DELETE' });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to discard drafts');
    }
    setIsDraftDialogOpen(false);
    setHasPendingDrafts(false);
    setPendingDrafts([]);
    setIsGenerateDialogOpen(true); // Open generate dialog to start fresh
  };

  if (isLoading && !timetableSlots.length) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

const filteredSlots = timetableSlots.filter(s => {
  if (filterSlotType === 'all')     return true;
  if (filterSlotType === 'nta')     return (s as any).status === 'NTA';
  if (filterSlotType === 'rna')     return !!(s as any).is_room_fallback;
  if (filterSlotType === 'nta_rna') return (s as any).status === 'NTA' || !!(s as any).is_room_fallback;
  return true;
});

  return (
    <div className="container mx-auto py-6 space-y-6">
      <TimetableHeader
        isAdmin={user?.role === 'admin'}
        isTimetableAdmin={user?.role !== 'admin' && user?.has_timetable_admin === true}
        onGenerateTimetable={() => setIsGenerateDialogOpen(true)}
        onCreateSlot={() => setIsCreateSlotDialogOpen(true)}
      />

      {/* Pending Drafts Button — shown when drafts exist, as a persistent entry point */}
      {hasTimetableAdminAccess && hasPendingDrafts && (
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-300 rounded-lg">
          <div className="flex items-center gap-2 text-amber-800 text-sm">
            <ScrollText className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>3 draft timetables</strong> are pending review for{' '}
              <strong>{pendingDraftTermName}</strong>
              {pendingDraftGeneratedBy && (
                <span className="text-amber-700"> · Generated by {pendingDraftGeneratedBy}</span>
              )}
              {pendingDraftGeneratedAt && (
                <span className="text-amber-600 text-xs ml-1">
                  · {new Date(pendingDraftGeneratedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </span>
          </div>
          <Button
            size="sm"
            className="ml-4 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            onClick={() => setIsDraftDialogOpen(true)}
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            Review & Select
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Print Buttons */}
      <div className="flex justify-end gap-2 flex-wrap">
 
        <Button variant="outline" onClick={() => handlePrint('master')}>
          <Printer className="mr-2 h-4 w-4" />Print Master Timetable
        </Button>
        <Button variant="outline" onClick={() => handlePrint('grouped')}>
          <FileText className="mr-2 h-4 w-4" />Print by Class
        </Button>
   <Button variant="outline" onClick={() => setIsPrintRoomDialogOpen(true)}>
  <DoorOpen className="mr-2 h-4 w-4" />Print Room Occupancy
</Button>
        <Button variant="outline" onClick={() => handlePrint('department')}>
          <Building2 className="mr-2 h-4 w-4" />Print by Department
        </Button>
        <Button variant="outline" onClick={() => setIsPrintTrainerDialogOpen(true)}>
          <UserCheck className="mr-2 h-4 w-4" />Print Trainer Schedule
        </Button>
        <Button variant="outline" onClick={() => setIsPrintFilterDialogOpen(true)}>
          <Filter className="mr-2 h-4 w-4" />Print Filtered
        </Button>
      </div>

      <div className="flex items-center gap-4 p-4 bg-white rounded-lg border">
        <TermSelector terms={terms} selectedTerm={selectedTerm} onTermChange={setSelectedTerm} />
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
          filterSlotType={filterSlotType}                       
  onSlotTypeChange={setFilterSlotType}                  
  ntaCount={timetableSlots.filter(s => (s as any).status === 'NTA').length}        
  rnaCount={timetableSlots.filter(s => !!(s as any).is_room_fallback).length} 
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

      <PrintSlotTypeDialog
  open={isPrintSlotTypeDialogOpen}
  onOpenChange={setIsPrintSlotTypeDialogOpen}
  printLabel={pendingPrintMode === 'master' ? 'Master Timetable' : pendingPrintMode === 'grouped' ? 'Class Timetable' : 'Department Timetable'}
  ntaCount={timetableSlots.filter(s => (s as any).status === 'NTA').length}
  rnaCount={timetableSlots.filter(s => !!(s as any).is_room_fallback).length}
  onConfirm={handlePrintConfirmed}
/>

<PrintRoomDialog
  open={isPrintRoomDialogOpen}
  onOpenChange={setIsPrintRoomDialogOpen}
  rooms={availableRooms.map(r => ({
    id: r.id,
    name: r.name,
    room_type: (timetableSlots.find(s => s.room_id === r.id)?.rooms as any)?.room_type
  }))}
onPrint={(roomId) => {
  setPrintRoomId(roomId);
  setPrintMode('room');
  setTimeout(() => { window.print(); setTimeout(() => { setPrintMode('none'); setPrintRoomId(null); }, 500); }, 100);
}}
/>

      <TimetableGrid
        slots={filteredSlots} 
        currentWeek={currentWeek}
        onSlotMove={handleSlotMove}
        onSlotClick={handleSlotClick}
isAdmin={hasTimetableAdminAccess}
        userId={user?.id || 0}
      />

   {/* Print Views */}
{printMode === 'master' && (
  <MasterTimetablePrint slots={timetableSlots} currentWeek={currentWeek} termName={terms.find(t => t.id === selectedTerm)?.name} filterSlotType={printSlotType} />
)}
{printMode === 'grouped' && (
  <PrintableTimetable slots={timetableSlots} currentWeek={currentWeek} termName={terms.find(t => t.id === selectedTerm)?.name} groupBy={viewMode === 'mine' || filterTrainer ? 'trainer' : 'class'} />
)}
{printMode === 'department' && (
  <PrintableTimetable slots={timetableSlots} currentWeek={currentWeek} termName={terms.find(t => t.id === selectedTerm)?.name} groupBy="department" />
)}
{printMode === 'trainer' && printTrainerId && (
  <PrintableTimetable slots={getTrainerPrintSlots()} currentWeek={currentWeek} termName={terms.find(t => t.id === selectedTerm)?.name} groupBy="trainer" />
)}

{printMode === 'filtered' && printFilterType && printFilterValue && (
  <PrintableTimetable
    slots={getFilteredPrintSlots()}
    currentWeek={currentWeek}
    termName={terms.find(t => t.id === selectedTerm)?.name}
    groupBy={
      printFilterType === 'class'             ? 'class'
      : printFilterType === 'combined'        ? 'class'    // ← each class gets its own page
      : printFilterType === 'department_trainer' ? 'trainer'
      : 'department'
    }
    filterDepartment={
      printFilterType === 'department'
        ? printFilterValue as string
      : printFilterType === 'combined'
        ? (printFilterValue as { department: string; classIds: number[] }).department  // ← pass dept for summary
      : printFilterType === 'department_trainer'
        ? (printFilterValue as { department: string; trainerIds: number[] }).department
      : undefined
    }
    filterSlotType={printSlotType}
    printedClasses={
      printFilterType === 'combined'
        ? (printFilterValue as { department: string; classIds: number[] }).classIds
            .map(id => availableClasses.find(c => c.id === id)!)
            .filter(Boolean)
        : undefined
    }
  />
)}

{printMode === 'room' && (
  <PrintableTimetable
    slots={printRoomId !== null
      ? timetableSlots.filter(s => s.room_id === printRoomId)
      : timetableSlots
    }
    currentWeek={currentWeek}
    termName={terms.find(t => t.id === selectedTerm)?.name}
    groupBy="room"
    filterSlotType={printSlotType}
  />
)}

      {user?.role === 'admin' && (
        <GenerateTimetableDialog
          open={isGenerateDialogOpen}
          onOpenChange={setIsGenerateDialogOpen}
          onSuccess={fetchTimetableData}
          terms={terms}
        />
      )}

 <CreateSlotDialog
  open={isCreateSlotDialogOpen}
  onOpenChange={setIsCreateSlotDialogOpen}
  onSuccess={fetchTimetableData}
  selectedTerm={selectedTerm}
  allSlots={timetableSlots}
  currentUser={{
    id: user?.id ?? 0,
    role: user?.role ?? '',
    has_timetable_admin: hasTimetableAdminAccess, 
  }}
/>

{selectedSlot && (
  <SlotDetailsDialog
    open={isSlotDetailsOpen}
    onOpenChange={setIsSlotDetailsOpen}
    slot={selectedSlot}
    onDelete={() => handleDeleteSlot(selectedSlot)}
    onUpdate={fetchTimetableData}
    isAdmin={hasTimetableAdminAccess}
    selectedTerm={selectedTerm}
     allSlots={timetableSlots}
    sessionGroupSize={
      selectedSlot.session_group_id
        ? timetableSlots.filter(s =>
            s.session_group_id === selectedSlot.session_group_id &&
            s.class_id === selectedSlot.class_id   
          ).length
        : 1
    }
  />
)}

      <PrintTrainerDialog
        open={isPrintTrainerDialogOpen}
        onOpenChange={setIsPrintTrainerDialogOpen}
        trainers={allTrainers.length > 0 ? allTrainers : availableTrainers}
        onPrint={handlePrintTrainer}
      />

<PrintFilterDialog
  open={isPrintFilterDialogOpen}
  onOpenChange={setIsPrintFilterDialogOpen}
  classes={availableClasses}
  trainers={timetableSlots  // ← was `slots` (doesn't exist)
    .filter(s => s.users)
    .map(s => ({
      id: s.employee_id,
      name: s.users!.name,
      department: (s.users as any)?.department ?? null
    }))
    .filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i)
    .sort((a, b) => a.name.localeCompare(b.name))
  }
  onPrint={handleFilteredPrint}
/>

      {/* Draft Selection Dialog (resume pending drafts) */}
      <DraftSelectionDialog
        open={isDraftDialogOpen}
        onOpenChange={setIsDraftDialogOpen}
        drafts={pendingDrafts}
        termName={pendingDraftTermName}
        termId={pendingDraftTermId ?? undefined}
        generatedBy={pendingDraftGeneratedBy}
        generatedAt={pendingDraftGeneratedAt}
        onConfirm={handleConfirmDraft}
        onDiscard={handleDiscardDrafts}
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
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" disabled={isDeleting}>
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
  return { start, end, weekNumber: getWeekNumber(start) };
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}