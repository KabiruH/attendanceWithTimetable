// app/lesson-periods/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, Clock } from "lucide-react";
import LessonPeriodsTable from '@/components/lesson-periods/LessonPeriodsTable';
import CreateLessonPeriodDialog from '@/components/lesson-periods/CreateLessonPeriodDialog';
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

interface LessonPeriod {
  id: number;
  name: string;
  start_time: Date;
  end_time: Date;
  duration: number;
  is_active: boolean;
  created_at: Date;
  start_time_formatted?: string;
  end_time_formatted?: string;
  _count?: {
    timetableSlots: number;
  };
}

export default function LessonPeriodsPage() {
  const [lessonPeriods, setLessonPeriods] = useState<LessonPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<LessonPeriod | null>(null);

  // Delete confirmation
  const [deletingPeriod, setDeletingPeriod] = useState<LessonPeriod | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchLessonPeriods();
  }, []);

  const fetchLessonPeriods = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/lesson-periods?include_inactive=true');
      if (!response.ok) throw new Error('Failed to fetch lesson periods');
      const data = await response.json();
      setLessonPeriods(data.data);
    } catch (error) {
      console.error('Error fetching lesson periods:', error);
      setError('Failed to load lesson periods');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateDialog = () => {
    setEditingPeriod(null);
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (period: LessonPeriod) => {
    setEditingPeriod(period);
    setIsCreateDialogOpen(true);
  };

  const handleToggleActive = async (period: LessonPeriod) => {
    try {
      const response = await fetch(`/api/lesson-periods/${period.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_active: !period.is_active,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update lesson period status');
      }

      await fetchLessonPeriods();
    } catch (error) {
      console.error('Error updating lesson period status:', error);
      setError('Failed to update lesson period status');
    }
  };

  const handleDelete = (period: LessonPeriod) => {
    setDeletingPeriod(period);
  };

  const confirmDelete = async () => {
    if (!deletingPeriod) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/lesson-periods/${deletingPeriod.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete lesson period');
      }

      await fetchLessonPeriods();
    } catch (error) {
      console.error('Error deleting lesson period:', error);
      setError('Failed to delete lesson period');
    } finally {
      setIsDeleting(false);
      setDeletingPeriod(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Lesson Periods Management
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Define time slots for scheduling classes throughout the day
          </p>
        </div>
        <Button onClick={handleOpenCreateDialog}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Lesson Period
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="bg-blue-100 rounded-full p-2">
            <Clock className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-1">About Lesson Periods</h3>
            <p className="text-sm text-blue-800">
              Lesson periods define the time structure of your school day. They are used as building blocks 
              when generating timetables. Each period has a start time, end time, and duration that will be 
              applied consistently across all classes and terms.
            </p>
          </div>
        </div>
      </div>

      <LessonPeriodsTable
        lessonPeriods={lessonPeriods}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
      />

      <CreateLessonPeriodDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={fetchLessonPeriods}
        editingPeriod={editingPeriod}
      />

      <AlertDialog open={!!deletingPeriod} onOpenChange={() => setDeletingPeriod(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lesson Period</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingPeriod?.name}</strong>?
              {deletingPeriod?._count?.timetableSlots ? (
                <span className="block mt-2 text-amber-600">
                  This period is used in {deletingPeriod._count.timetableSlots} timetable slots. 
                  It will be deactivated instead of deleted.
                </span>
              ) : (
                <span className="block mt-2">
                  This action cannot be undone.
                </span>
              )}
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