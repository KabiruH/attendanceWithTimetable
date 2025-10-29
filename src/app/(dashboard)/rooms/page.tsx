// app/rooms/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, Download, Upload } from "lucide-react";
import RoomsTable from '@/components/rooms/RoomsTable';
import CreateRoomDialog from '@/components/rooms/CreateRoomDialog';
import ImportRoomsDialog from '@/components/rooms/ImportRoomsDialog';
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

interface Room {
  id: number;
  name: string;
  capacity: number | null;
  room_type: string | null;
  equipment: string[] | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  _count?: {
    timetableSlots: number;
  };
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  // Delete confirmation
  const [deletingRoom, setDeletingRoom] = useState<Room | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/rooms');
      if (!response.ok) throw new Error('Failed to fetch rooms');
      const data = await response.json();
      setRooms(data.data || data);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setError('Failed to load rooms');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateDialog = () => {
    setEditingRoom(null);
    setIsCreateDialogOpen(true);
  };

  const handleOpenImportDialog = () => {
    setIsImportDialogOpen(true);
  };

  const handleDownloadSample = () => {
    // Create sample data
    const sampleData = [
      {
        name: 'A101',
        capacity: 30,
        room_type: 'classroom',
        equipment: 'Projector, Whiteboard, Air Conditioning',
        department: 'Mathematics',
        is_active: true
      },
      {
        name: 'Science Lab 1',
        capacity: 25,
        room_type: 'lab',
        equipment: 'Lab Equipment, Fume Hood, Safety Shower',
        department: 'Science',
        is_active: true
      },
      {
        name: 'Computer Lab A',
        capacity: 35,
        room_type: 'computer_lab',
        equipment: '35 Computers, Projector, Air Conditioning',
        department: 'Engineering',
        is_active: true
      },
      {
        name: 'Workshop B',
        capacity: 20,
        room_type: 'workshop',
        equipment: 'Tools, Workbenches, Safety Equipment',
        department: 'Engineering',
        is_active: true
      }
    ];

    // Convert to CSV
    const headers = ['name', 'capacity', 'room_type', 'equipment', 'department', 'is_active'];
    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => 
        headers.map(header => {
          const value = row[header as keyof typeof row];
          // Wrap in quotes if contains comma
          return typeof value === 'string' && value.includes(',') 
            ? `"${value}"` 
            : value;
        }).join(',')
      )
    ].join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'rooms_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    setIsCreateDialogOpen(true);
  };

  const handleToggleActive = async (room: Room) => {
    try {
      const response = await fetch(`/api/rooms/${room.id}/toggle-status`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to update room status');
      }

      await fetchRooms();
    } catch (error) {
      console.error('Error updating room status:', error);
      setError('Failed to update room status');
    }
  };

  const handleDelete = (room: Room) => {
    setDeletingRoom(room);
  };

  const confirmDelete = async () => {
    if (!deletingRoom) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/rooms/${deletingRoom.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete room');
      }

      await fetchRooms();
    } catch (error) {
      console.error('Error deleting room:', error);
      setError('Failed to delete room');
    } finally {
      setIsDeleting(false);
      setDeletingRoom(null);
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
          <h1 className="text-2xl font-bold">Rooms Management</h1>
          <p className="text-sm text-gray-600">
            Manage classrooms, labs, and other teaching spaces
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadSample}>
            <Download className="mr-2 h-4 w-4" />
            Download Sample
          </Button>
          <Button variant="outline" onClick={handleOpenImportDialog}>
            <Upload className="mr-2 h-4 w-4" />
            Import Excel
          </Button>
          <Button onClick={handleOpenCreateDialog}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Room
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <RoomsTable
        rooms={rooms}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
      />

      <CreateRoomDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={fetchRooms}
        editingRoom={editingRoom}
      />

      <ImportRoomsDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onSuccess={fetchRooms}
      />

      <AlertDialog open={!!deletingRoom} onOpenChange={() => setDeletingRoom(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Room</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingRoom?.name}</strong>?
              {deletingRoom?._count?.timetableSlots ? (
                <span className="block mt-2 text-amber-600">
                  This room has {deletingRoom._count.timetableSlots} scheduled classes. 
                  Deleting it will affect the timetable.
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