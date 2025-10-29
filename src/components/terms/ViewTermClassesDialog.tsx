// components/terms/ViewTermClassesDialog.tsx
'use client';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookOpen, Clock, Trash2 } from "lucide-react";
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

interface Class {
  id: number;
  name: string;
  code: string;
  department: string;
  duration_hours: number;
  is_active: boolean;
}

interface Term {
  id: number;
  name: string;
}

interface ViewTermClassesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: Term | null;
  onSuccess?: () => void;
}

export default function ViewTermClassesDialog({
  open,
  onOpenChange,
  term,
  onSuccess,
}: ViewTermClassesDialogProps) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [classToRemove, setClassToRemove] = useState<Class | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    if (open && term) {
      fetchTermClasses();
    }
  }, [open, term]);

  const fetchTermClasses = async () => {
    if (!term) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/terms/${term.id}/classes`);
      if (!response.ok) {
        throw new Error('Failed to fetch classes');
      }
      const data = await response.json();
      setClasses(data.data || []);
    } catch (error) {
      console.error('Error fetching term classes:', error);
      setError('Failed to load classes for this term');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveClass = async () => {
    if (!term || !classToRemove) return;

    setIsRemoving(true);
    try {
      const response = await fetch(`/api/terms/${term.id}/classes`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ class_ids: [classToRemove.id] }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove class');
      }

      // Refresh the class list
      await fetchTermClasses();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error removing class:', error);
      setError('Failed to remove class from term');
    } finally {
      setIsRemoving(false);
      setClassToRemove(null);
    }
  };

  const getDepartmentColor = (department: string) => {
    const colors: Record<string, string> = {
      'Engineering': 'bg-blue-100 text-blue-800',
      'Science': 'bg-green-100 text-green-800',
      'Mathematics': 'bg-purple-100 text-purple-800',
      'Business': 'bg-orange-100 text-orange-800',
      'Arts': 'bg-pink-100 text-pink-800',
      'Technology': 'bg-indigo-100 text-indigo-800',
    };
    return colors[department] || 'bg-gray-100 text-gray-800';
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Classes in {term?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : classes.length === 0 ? (
              <div className="border rounded-lg p-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">
                  No classes assigned to this term yet.
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Use the "Assign Classes" button to add classes to this term.
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class Code</TableHead>
                        <TableHead>Class Name</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classes.map((classItem) => (
                        <TableRow key={classItem.id}>
                          <TableCell className="font-mono font-medium">
                            {classItem.code}
                          </TableCell>
                          <TableCell>{classItem.name}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={getDepartmentColor(classItem.department)}
                            >
                              {classItem.department}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Clock className="h-3 w-3" />
                              {classItem.duration_hours}h
                            </div>
                          </TableCell>
                          <TableCell>
                            {classItem.is_active ? (
                              <Badge className="bg-green-500">Active</Badge>
                            ) : (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setClassToRemove(classItem)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Summary Footer */}
            {classes.length > 0 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <p className="text-sm text-gray-600">
                  Total: <strong>{classes.length}</strong> class{classes.length !== 1 ? 'es' : ''} assigned
                </p>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            )}

            {classes.length === 0 && !isLoading && (
              <div className="flex justify-end pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Class Confirmation Dialog */}
      <AlertDialog open={!!classToRemove} onOpenChange={() => setClassToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Class from Term</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{classToRemove?.name}</strong> ({classToRemove?.code}) from {term?.name}?
              <span className="block mt-2 text-amber-600">
                This will not delete the class, only remove it from this term.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveClass}
              className="bg-red-600 hover:bg-red-700"
              disabled={isRemoving}
            >
              {isRemoving ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}