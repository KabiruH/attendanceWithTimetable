// app/terms/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import TermsTable from '@/components/terms/TermTable';
import CreateTermDialog from '@/components/terms/CreateTermDialog';
import AssignClassesDialog from '@/components/terms/AssignClassesDialog';
import ViewTermClassesDialog from '@/components/terms/ViewTermClassesDialog'; // New import
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

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  working_days: number[];
  holidays: string[];
  created_at: string;
  updated_at: string;
  _count?: {
    timetableSlots: number;
  };
}

export default function TermsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAssignClassesDialogOpen, setIsAssignClassesDialogOpen] = useState(false);
  const [isViewClassesDialogOpen, setIsViewClassesDialogOpen] = useState(false); // New state
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [selectedTermForClasses, setSelectedTermForClasses] = useState<Term | null>(null);
  const [selectedTermForViewing, setSelectedTermForViewing] = useState<Term | null>(null); // New state

  // Delete confirmation
  const [deletingTerm, setDeletingTerm] = useState<Term | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/terms?include_inactive=true');
      if (!response.ok) throw new Error('Failed to fetch terms');
      const data = await response.json();
      setTerms(data.data);
    } catch (error) {
      console.error('Error fetching terms:', error);
      setError('Failed to load terms');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateDialog = () => {
    setEditingTerm(null);
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (term: Term) => {
    setEditingTerm(term);
    setIsCreateDialogOpen(true);
  };

  const handleAssignClasses = (term: Term) => {
    setSelectedTermForClasses(term);
    setIsAssignClassesDialogOpen(true);
  };

  const handleViewClasses = (term: Term) => { // New handler
    setSelectedTermForViewing(term);
    setIsViewClassesDialogOpen(true);
  };

  const handleToggleActive = async (term: Term) => {
    try {
      const response = await fetch(`/api/terms/${term.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_active: !term.is_active,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update term status');
      }

      await fetchTerms();
    } catch (error) {
      console.error('Error updating term status:', error);
      setError('Failed to update term status');
    }
  };

  const handleDelete = (term: Term) => {
    setDeletingTerm(term);
  };

  const confirmDelete = async () => {
    if (!deletingTerm) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/terms/${deletingTerm.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete term');
      }

      await fetchTerms();
    } catch (error) {
      console.error('Error deleting term:', error);
      setError('Failed to delete term');
    } finally {
      setIsDeleting(false);
      setDeletingTerm(null);
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
          <h1 className="text-2xl font-bold">Terms Management</h1>
          <p className="text-sm text-gray-600">
            Manage academic terms and assign classes for each term
          </p>
        </div>
        <Button onClick={handleOpenCreateDialog}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Term
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <TermsTable
        terms={terms}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
        onAssignClasses={handleAssignClasses}
        onViewClasses={handleViewClasses} // New prop
      />

      <CreateTermDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={fetchTerms}
        editingTerm={editingTerm}
      />

      {selectedTermForClasses && (
        <AssignClassesDialog
          open={isAssignClassesDialogOpen}
          onOpenChange={setIsAssignClassesDialogOpen}
          term={selectedTermForClasses}
          onSuccess={fetchTerms}
        />
      )}

      {/* New View Classes Dialog */}
      {selectedTermForViewing && (
        <ViewTermClassesDialog
          open={isViewClassesDialogOpen}
          onOpenChange={setIsViewClassesDialogOpen}
          term={selectedTermForViewing}
          onSuccess={fetchTerms}
        />
      )}

      <AlertDialog open={!!deletingTerm} onOpenChange={() => setDeletingTerm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Term</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingTerm?.name}</strong>?
              {deletingTerm?._count?.timetableSlots ? (
                <span className="block mt-2 text-amber-600">
                  This term has {deletingTerm._count.timetableSlots} timetable slots. 
                  They will be preserved but the term will be deactivated.
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