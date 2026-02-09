// app/subjects/[id]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AvailableSubjectsList from "@/components/class-subjects/AvailableSubjectsList";
import AssignedSubjectsList from "@/components/class-subjects/AssignedSubjectsList";
import AddSubjectDialog from "@/components/class-subjects/AddSubjectDialog";

interface ClassData {
  id: number;
  name: string;
  code: string;
  department: string;
}

interface Subject {
  id: number;
  name: string;
  code: string;
  department: string;
  credit_hours: number | null;
  description: string | null;
}

interface AssignedSubject {
  id: number;
  subject: Subject;
  term_id: number | null;
  is_active: boolean;
  assigned_at: string;
  term?: {
    id: number;
    name: string;
  } | null;
}

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export default function ManageClassSubjectsPage() {
  const params = useParams();
  const router = useRouter();
  const classId = parseInt(params.id as string);

  const [classData, setClassData] = useState<ClassData | null>(null);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<AssignedSubject[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);

  // ✅ Fetch terms on mount
  useEffect(() => {
    fetchTerms();
  }, []);

  useEffect(() => {
    if (classId && !isNaN(classId)) {
      fetchClassData();
      fetchAvailableSubjects();
    }
  }, [classId]);

  // ✅ Fetch assigned subjects when term changes
  useEffect(() => {
    if (classId && !isNaN(classId) && selectedTerm) {
      fetchAssignedSubjects();
    } else if (!selectedTerm) {
      // ✅ Clear assigned subjects if no term selected
      setAssignedSubjects([]);
    }
  }, [classId, selectedTerm]);

  // ✅ NEW: Fetch available terms
  const fetchTerms = async () => {
    try {
      const response = await fetch('/api/terms');
      if (!response.ok) throw new Error('Failed to fetch terms');
      const data = await response.json();
      setTerms(data.data || []);

      // Try to get active term
      const activeResponse = await fetch('/api/terms/active');
      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        setSelectedTerm(activeData.data.id);
      } else if (data.data.length > 0) {
        // Default to first term if no active term
        setSelectedTerm(data.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching terms:', error);
      toast.error('Failed to load terms');
    }
  };

  const fetchClassData = async () => {
    try {
      const response = await fetch(`/api/admin/classes/${classId}`);
      if (!response.ok) throw new Error("Failed to fetch class data");
      const data = await response.json();
      setClassData(data);
    } catch (error) {
      console.error("Error fetching class data:", error);
      toast.error("Failed to load class information");
    }
  };

  const fetchAvailableSubjects = async () => {
    try {
      const response = await fetch(`/api/admin/classes/${classId}/available-subjects`);
      if (!response.ok) throw new Error("Failed to fetch subjects");
      const data = await response.json();
      setAvailableSubjects(data);
    } catch (error) {
      console.error("Error fetching available subjects:", error);
      toast.error("Failed to load available subjects");
    } finally {
      setLoading(false);
    }
  };

  // ✅ UPDATED: Filter assigned subjects by selected term
  const fetchAssignedSubjects = async () => {
    if (!selectedTerm) {
      setAssignedSubjects([]);
      return;
    }

    try {
      const response = await fetch(`/api/admin/classes/${classId}/subjects?term_id=${selectedTerm}`);
      if (!response.ok) throw new Error("Failed to fetch assigned subjects");
      const data = await response.json();
      
      // ✅ Filter by term_id on the client side as well (defensive programming)
      const filteredData = data.filter((subject: AssignedSubject) => 
        subject.term_id === selectedTerm
      );
      
      setAssignedSubjects(filteredData);
    } catch (error) {
      console.error("Error fetching assigned subjects:", error);
      toast.error("Failed to load assigned subjects");
    }
  };

  const handleAssignSubject = async (subjectId: number) => {
    // ✅ Validate term is selected
    if (!selectedTerm) {
      toast.error('Please select a term first');
      return;
    }

    try {
      const response = await fetch(`/api/admin/classes/${classId}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          subjectId,
          term_id: selectedTerm
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to assign subject");
      }

      const newAssignment = await response.json();
      setAvailableSubjects((prev) => prev.filter((s) => s.id !== subjectId));
      setAssignedSubjects((prev) => [...prev, newAssignment]);
      setSelectedSubjects((prev) => prev.filter(id => id !== subjectId));
      
      toast.success("Subject assigned successfully");
    } catch (error: any) {
      console.error("Error assigning subject:", error);
      toast.error(error.message || "Failed to assign subject");
    }
  };

  const handleBatchAssign = async () => {
    // ✅ Validate term is selected
    if (!selectedTerm) {
      toast.error('Please select a term first');
      return;
    }

    if (selectedSubjects.length === 0) {
      toast.error("No subjects selected");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    try {
      for (const subjectId of selectedSubjects) {
        try {
          const response = await fetch(`/api/admin/classes/${classId}/subjects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              subjectId,
              term_id: selectedTerm
            }),
          });

          if (response.ok) {
            const newAssignment = await response.json();
            setAssignedSubjects((prev) => [...prev, newAssignment]);
            setAvailableSubjects((prev) => prev.filter((s) => s.id !== subjectId));
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      setSelectedSubjects([]);

      if (successCount > 0) {
        toast.success(`${successCount} subject(s) assigned successfully`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} subject(s) failed to assign`);
      }
    } catch (error) {
      console.error("Batch assign error:", error);
    }
  };

  const handleToggleSubject = (subjectId: number) => {
    setSelectedSubjects((prev) =>
      prev.includes(subjectId)
        ? prev.filter((id) => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const handleRemoveSubject = async (classSubjectId: number) => {
    try {
      const response = await fetch(`/api/class-subjects/${classSubjectId}`, {
        method: "DELETE" 
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove subject");
      }
      
      const removedSubject = assignedSubjects.find((as) => as.id === classSubjectId);
      if (removedSubject) {
        setAssignedSubjects((prev) => prev.filter((as) => as.id !== classSubjectId));
        setAvailableSubjects((prev) => [...prev, removedSubject.subject]);
      }
      
      toast.success("Subject removed successfully");
    } catch (error: any) {
      console.error("Error removing subject:", error);
      toast.error(error.message || "Failed to remove subject");
    }
  };

  const handleAddSubjectSuccess = (newSubject: Subject) => {
    setAvailableSubjects((prev) => [newSubject, ...prev]);
    setShowAddDialog(false);
    toast.success("Subject created successfully");
  };

  const filteredAvailableSubjects = availableSubjects.filter((subject) => {
    const matchesSearch =
      subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment =
      departmentFilter === "all" || subject.department === departmentFilter;
    return matchesSearch && matchesDepartment;
  });

  const departments = Array.from(new Set(availableSubjects.map((s) => s.department)));

  if (loading || !classId || isNaN(classId)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/classes")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Classes
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Subject
            </Button>
          </div>
        </div>

        {classData && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{classData.name}</h1>
              <Badge variant="secondary">{classData.code}</Badge>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground">
              <span>{classData.department}</span>
              <span>•</span>
              <span>{assignedSubjects.length} subjects assigned {selectedTerm && `for selected term`}</span>
            </div>
          </div>
        )}
      </div>

      {/* ✅ Term Selection */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Label htmlFor="term" className="flex items-center gap-2 mb-2">
          <Calendar className="h-4 w-4" />
          <span className="font-semibold">Select Term</span>
        </Label>
        <Select
          value={selectedTerm?.toString()}
          onValueChange={(value) => setSelectedTerm(parseInt(value))}
        >
          <SelectTrigger className="bg-white max-w-md">
            <SelectValue placeholder="Select a term" />
          </SelectTrigger>
          <SelectContent>
            {terms.map((term) => (
              <SelectItem key={term.id} value={term.id.toString()}>
                {term.name} {term.is_active && '(Active)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Subject assignments are term-specific. Changing the term will show subjects assigned to that specific term only.
        </p>
      </div>

      {/* Show warning if no term selected */}
      {!selectedTerm && (
        <Alert className="mb-6">
          <AlertDescription>
            Please select a term above to view and assign subjects for this class.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content Grid - Only show if term is selected */}
      {selectedTerm && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AvailableSubjectsList
            subjects={filteredAvailableSubjects}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            departmentFilter={departmentFilter}
            onDepartmentChange={setDepartmentFilter}
            departments={departments}
            onAssignSubject={handleAssignSubject}
            selectedSubjects={selectedSubjects}
            onToggleSubject={handleToggleSubject}
            onBatchAssign={handleBatchAssign}
          />
          <AssignedSubjectsList 
            subjects={assignedSubjects} 
            onRemoveSubject={handleRemoveSubject} 
          />
        </div>
      )}

      {showAddDialog && (
        <AddSubjectDialog
          defaultDepartment={classData?.department}
          onClose={() => setShowAddDialog(false)}
          onSuccess={handleAddSubjectSuccess}
        />
      )}
    </div>
  );
}