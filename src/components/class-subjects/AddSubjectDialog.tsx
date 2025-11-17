// components/admin/class-subjects/AddSubjectDialog.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface Department {
  id: number;
  name: string;
  code: string;
  description: string | null;
}

interface AddSubjectDialogProps {
  defaultDepartment?: string;
  onClose: () => void;
  onSuccess: (newSubject: any) => void;
}

export default function AddSubjectDialog({
  defaultDepartment,
  onClose,
  onSuccess,
}: AddSubjectDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    department: defaultDepartment || "",
    credit_hours: "",
    description: "",
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [newDepartment, setNewDepartment] = useState({
    name: "",
    code: "",
  });

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await fetch("/api/departments");
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
      toast.error("Failed to load departments");
    } finally {
      setLoadingDepartments(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleAddDepartment = async () => {
    if (!newDepartment.name || !newDepartment.code) {
      toast.error("Department name and code are required");
      return;
    }

    try {
      const response = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDepartment),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create department");
      }

      const department = await response.json();
      setDepartments((prev) => [...prev, department]);
      setFormData({ ...formData, department: department.name });
      setShowAddDepartment(false);
      setNewDepartment({ name: "", code: "" });
      toast.success("Department created successfully");
    } catch (error: any) {
      console.error("Error creating department:", error);
      toast.error(error.message || "Failed to create department");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.code || !formData.department) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          code: formData.code,
          department: formData.department,
          credit_hours: formData.credit_hours ? parseInt(formData.credit_hours) : null,
          description: formData.description || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create subject");
      }

      const newSubject = await response.json();
      onSuccess(newSubject);
    } catch (error: any) {
      console.error("Error creating subject:", error);
      toast.error(error.message || "Failed to create subject");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Subject</DialogTitle>
          <DialogDescription>
            Create a new subject that can be assigned to classes
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Subject Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g., Programming Fundamentals"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">
                Subject Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="code"
                name="code"
                placeholder="e.g., PROG101"
                value={formData.code}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="credit_hours">Credit Hours</Label>
              <Input
                id="credit_hours"
                name="credit_hours"
                type="number"
                placeholder="e.g., 40"
                value={formData.credit_hours}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="department">
              Department <span className="text-destructive">*</span>
            </Label>
            {loadingDepartments ? (
              <Input placeholder="Loading departments..." disabled />
            ) : (
              <div className="flex gap-2">
                <Select
                  value={formData.department}
                  onValueChange={(value) =>
                    setFormData({ ...formData, department: value })
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.name}>
                        {dept.name} ({dept.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowAddDepartment(true)}
                  title="Add new department"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Brief description of the subject..."
              value={formData.description}
              onChange={handleChange}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Subject"}
            </Button>
          </DialogFooter>
        </form>

        {/* Add Department Mini Dialog */}
        {showAddDepartment && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-background border rounded-lg p-4 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold mb-4">Add New Department</h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="dept-name" className="text-xs">
                    Department Name *
                  </Label>
                  <Input
                    id="dept-name"
                    placeholder="e.g., Information Technology"
                    value={newDepartment.name}
                    onChange={(e) =>
                      setNewDepartment({ ...newDepartment, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="dept-code" className="text-xs">
                    Department Code *
                  </Label>
                  <Input
                    id="dept-code"
                    placeholder="e.g., IT"
                    value={newDepartment.code}
                    onChange={(e) =>
                      setNewDepartment({ ...newDepartment, code: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddDepartment(false);
                    setNewDepartment({ name: "", code: "" });
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddDepartment}
                  className="flex-1"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}