// components/classes/ClassesTable.tsx
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

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
  _count?: {
    subjects: number;
  };
}

interface ClassesTableProps {
  classes: Class[];
  termId: number | null; // ✅ ADDED
  onEdit: (classItem: Class) => void;
  onDeactivate: (classItem: Class) => void;
}

interface ClassSubjectCount {
  [classId: number]: number;
}

export default function ClassesTable({ classes, termId, onEdit, onDeactivate }: ClassesTableProps) {
  const router = useRouter();
  const [subjectCounts, setSubjectCounts] = useState<ClassSubjectCount>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  // ✅ Fetch subject counts for each class based on selected term
  useEffect(() => {
    if (termId && classes.length > 0) {
      fetchSubjectCounts();
    } else {
      setSubjectCounts({});
    }
  }, [termId, classes]);

  const fetchSubjectCounts = async () => {
    if (!termId) return;
    
    setLoadingCounts(true);
    try {
      // Fetch subject counts for all classes in parallel
      const countPromises = classes.map(async (classItem) => {
        try {
          const response = await fetch(`/api/admin/classes/${classItem.id}/subjects?term_id=${termId}`);
          if (!response.ok) return { classId: classItem.id, count: 0 };
          
          const data = await response.json();
          return { 
            classId: classItem.id, 
            count: Array.isArray(data) ? data.length : 0 
          };
        } catch (error) {
          console.error(`Error fetching subjects for class ${classItem.id}:`, error);
          return { classId: classItem.id, count: 0 };
        }
      });

      const results = await Promise.all(countPromises);
      
      // Convert array to object for easy lookup
      const countsObj = results.reduce((acc, { classId, count }) => {
        acc[classId] = count;
        return acc;
      }, {} as ClassSubjectCount);
      
      setSubjectCounts(countsObj);
    } catch (error) {
      console.error('Error fetching subject counts:', error);
    } finally {
      setLoadingCounts(false);
    }
  };

  const handleManageSubjects = (classId: number) => {
    router.push(`/subjects/${classId}`);
  };

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="h-12 px-4 text-left align-middle font-medium">Class Name</th>
            <th className="h-12 px-4 text-left align-middle font-medium">Code</th>
            <th className="h-12 px-4 text-left align-middle font-medium">Department</th>
            <th className="h-12 px-4 text-left align-middle font-medium">
              Subjects {termId && '(This Term)'}
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium">Status</th>
            <th className="h-12 px-4 text-left align-middle font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((classItem) => (
            <tr key={classItem.id} className="border-b hover:bg-muted/50 transition-colors">
              <td className="p-4 align-middle">
                <div>
                  <div className="font-medium">{classItem.name}</div>
                  {classItem.description && (
                    <div className="text-sm text-muted-foreground">{classItem.description}</div>
                  )}
                </div>
              </td>
              <td className="p-4 align-middle">
                <code className="bg-muted px-2 py-1 rounded text-sm">{classItem.code}</code>
              </td>
              <td className="p-4 align-middle">{classItem.department}</td>
              <td className="p-4 align-middle">
                {termId ? (
                  loadingCounts ? (
                    <Badge variant="outline" className="text-sm">
                      Loading...
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-sm">
                      {subjectCounts[classItem.id] || 0} Subject{subjectCounts[classItem.id] !== 1 ? 's' : ''}
                    </Badge>
                  )
                ) : (
                  <Badge variant="secondary" className="text-sm">
                    {classItem._count?.subjects || 0} Total
                  </Badge>
                )}
              </td>
              <td className="p-4 align-middle">
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                  classItem.is_active 
                    ? 'bg-green-50 text-green-700' 
                    : 'bg-red-50 text-red-700'
                }`}>
                  {classItem.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="p-4 align-middle">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleManageSubjects(classItem.id)}
                    className="text-blue-600 hover:text-blue-700"
                    title="Manage subjects for this class"
                  >
                    <BookOpen className="h-4 w-4 mr-1" />
                    Subjects
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => onEdit(classItem)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => onDeactivate(classItem)}
                    className="text-red-600 hover:text-red-700"
                  >
                    {classItem.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {classes.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          No classes found. Add your first class to get started.
        </div>
      )}
    </div>
  );
}