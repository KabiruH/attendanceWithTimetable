// components/rooms/CreateRoomDialog.tsx
'use client';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface Room {
  id: number;
  name: string;
  capacity: number | null;
  room_type: string | null;
  equipment: string[] | null;
  department: string | null;
  is_active: boolean;
}

interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingRoom: Room | null;
}

export default function CreateRoomDialog({
  open,
  onOpenChange,
  onSuccess,
  editingRoom,
}: CreateRoomDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    capacity: '',
    room_type: '',
    department: '',
    equipment: [] as string[],
    is_active: true,
  });

  const [equipmentInput, setEquipmentInput] = useState('');

  const roomTypes = [
    { value: 'classroom', label: 'Classroom' },
    { value: 'lab', label: 'Laboratory' },
    { value: 'computer_lab', label: 'Computer Lab' },
    { value: 'workshop', label: 'Workshop' },
    { value: 'lecture_hall', label: 'Lecture Hall' },
    { value: 'studio', label: 'Studio' },
    { value: 'auditorium', label: 'Auditorium' },
  ];

  const departments = [
    'Finance',
    'Human Resources',
    'Engineering',
    'Procurement',
    'Administration',
    'Executive',
    'Building and Civil Engineering',
    'Electrical and Electronics Engineering',
    'Cosmetology',
    'Fashion Design and Clothing Textile',
    'Business and Liberal Studies',
    'Agriculture and Environment Studies',
    'Automotive and Mechanical Engineering',
    'Hospitality and Institutional Management',
  ];

  const commonEquipment = [
    'Projector',
    'Whiteboard',
    'Smart Board',
    'Computer',
    'Air Conditioning',
    'Sound System',
    'Tables',
    'Chairs',
    'Lab Equipment',
    'Tools',
    'WiFi',
  ];

  useEffect(() => {
    if (editingRoom) {
      setFormData({
        name: editingRoom.name,
        capacity: editingRoom.capacity?.toString() || '',
        room_type: editingRoom.room_type || '',
        department: editingRoom.department || '',
        equipment: editingRoom.equipment || [],
        is_active: editingRoom.is_active,
      });
    } else {
      resetForm();
    }
  }, [editingRoom, open]);

  const resetForm = () => {
    setFormData({
      name: '',
      capacity: '',
      room_type: '',
      department: '',
      equipment: [],
      is_active: true,
    });
    setEquipmentInput('');
    setError('');
  };

  const handleAddEquipment = (item: string) => {
    const trimmedItem = item.trim();
    if (trimmedItem && !formData.equipment.includes(trimmedItem)) {
      setFormData((prev) => ({
        ...prev,
        equipment: [...prev.equipment, trimmedItem],
      }));
      setEquipmentInput('');
    }
  };

  const handleRemoveEquipment = (item: string) => {
    setFormData((prev) => ({
      ...prev,
      equipment: prev.equipment.filter((e) => e !== item),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const url = editingRoom ? `/api/rooms/${editingRoom.id}` : '/api/rooms';
      const method = editingRoom ? 'PUT' : 'POST';

      const payload = {
        name: formData.name,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        room_type: formData.room_type || null,
        department: formData.department || null,
        equipment: formData.equipment.length > 0 ? formData.equipment : null,
        is_active: formData.is_active,
      };

      if (editingRoom) {
        (payload as any).id = editingRoom.id;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save room');
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save room');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingRoom ? 'Edit Room' : 'Add New Room'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Room Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Room Name *</Label>
            <Input
              id="name"
              placeholder="e.g., A101, Lab 1, Workshop B"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
          </div>

          {/* Room Type */}
          <div className="space-y-2">
            <Label htmlFor="room_type">Room Type</Label>
            <Select
              value={formData.room_type}
              onValueChange={(value) =>
                setFormData({ ...formData, room_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select room type" />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Capacity */}
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity (Students)</Label>
            <Input
              id="capacity"
              type="number"
              min="1"
              placeholder="e.g., 30"
              value={formData.capacity}
              onChange={(e) =>
                setFormData({ ...formData, capacity: e.target.value })
              }
            />
          </div>

          {/* Department */}
          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Select
              value={formData.department}
              onValueChange={(value) =>
                setFormData({ ...formData, department: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Equipment */}
          <div className="space-y-3">
            <Label>Equipment & Facilities</Label>
            
            {/* Quick Add Common Equipment */}
            <div className="flex flex-wrap gap-2">
              {commonEquipment.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={formData.equipment.includes(item) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (formData.equipment.includes(item)) {
                      handleRemoveEquipment(item);
                    } else {
                      handleAddEquipment(item);
                    }
                  }}
                  className="text-xs"
                >
                  {item}
                </Button>
              ))}
            </div>

            {/* Custom Equipment Input */}
            <div className="flex gap-2">
              <Input
                placeholder="Add custom equipment..."
                value={equipmentInput}
                onChange={(e) => setEquipmentInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEquipment(equipmentInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAddEquipment(equipmentInput)}
                disabled={!equipmentInput.trim()}
              >
                Add
              </Button>
            </div>

            {/* Selected Equipment */}
            {formData.equipment.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Selected ({formData.equipment.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {formData.equipment.map((item) => (
                    <Badge key={item} variant="secondary" className="gap-1">
                      {item}
                      <button
                        type="button"
                        onClick={() => handleRemoveEquipment(item)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Status (only for edit) */}
          {editingRoom && (
            <div className="space-y-2">
              <Label htmlFor="is_active">Status</Label>
              <Select
                value={formData.is_active ? 'active' : 'inactive'}
                onValueChange={(value) =>
                  setFormData({ ...formData, is_active: value === 'active' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : editingRoom
                ? 'Update Room'
                : 'Create Room'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}