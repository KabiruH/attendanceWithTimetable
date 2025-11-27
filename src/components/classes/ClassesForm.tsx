import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";

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

interface Department {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
}

interface ClassesFormProps {
  isOpen: boolean;
  onClose: () => void;
  editingClass: Class | null;
  onSave: (formData: any) => Promise<void>;
  isSubmitting: boolean;
  error: string;
}

export default function ClassesForm({ 
  isOpen, 
  onClose, 
  editingClass, 
  onSave, 
  isSubmitting, 
  error 
}: ClassesFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    department: '',
    duration_hours: 2,
    is_active: true
  });

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [departmentError, setDepartmentError] = useState('');

  // Fetch departments
  useEffect(() => {
    const fetchDepartments = async () => {
      setLoadingDepartments(true);
      setDepartmentError('');
      try {
        const response = await fetch('/api/departments');
        if (!response.ok) {
          throw new Error('Failed to fetch departments');
        }
        const data = await response.json();
        // Filter only active departments
        const activeDepartments = data.filter((dept: Department) => dept.is_active);
        setDepartments(activeDepartments);
      } catch (err) {
        console.error('Error fetching departments:', err);
        setDepartmentError('Failed to load departments');
      } finally {
        setLoadingDepartments(false);
      }
    };

    if (isOpen) {
      fetchDepartments();
    }
  }, [isOpen]);

  // Reset form when dialog opens/closes or editing class changes
  useEffect(() => {
    if (isOpen) {
      if (editingClass) {
        setFormData({
          name: editingClass.name,
          code: editingClass.code,
          description: editingClass.description || '',
          department: editingClass.department,
          duration_hours: editingClass.duration_hours,
          is_active: editingClass.is_active
        });
      } else {
        setFormData({
          name: '',
          code: '',
          description: '',
          department: '',
          duration_hours: 2,
          is_active: true
        });
      }
    }
  }, [isOpen, editingClass]);

  const handleSubmit = async () => {
    await onSave(formData);
  };

  const handleClose = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      department: '',
      duration_hours: 2,
      is_active: true
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingClass ? 'Edit Class' : 'Add New Class'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Class Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Digital Marketing Fundamentals"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Class Code</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g., DM101"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the class"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            {departmentError && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{departmentError}</AlertDescription>
              </Alert>
            )}
            <Select
              value={formData.department}
              onValueChange={(value) => setFormData({ ...formData, department: value })}
              disabled={loadingDepartments}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingDepartments ? "Loading departments..." : "Select department"} />
              </SelectTrigger>
              <SelectContent>
                {departments.length === 0 && !loadingDepartments ? (
                  <SelectItem value="no-departments" disabled>
                    No active departments available
                  </SelectItem>
                ) : (
                  departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.name}>
                      {dept.name} ({dept.code})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {editingClass && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.is_active ? 'active' : 'inactive'}
                onValueChange={(value) => setFormData({ ...formData, is_active: value === 'active' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? 'Saving...' : editingClass ? 'Update Class' : 'Create Class'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}