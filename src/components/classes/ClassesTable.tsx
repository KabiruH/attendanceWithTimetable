// components/classes/ClassesTable.tsx
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Trash2 } from "lucide-react";
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
  termId: number | null;
  isAdmin: boolean; // ✅ ADDED
  onEdit: (classItem: Class) => void;
  onDeactivate: (classItem: Class) => void;
  onDelete: (classItem: Class) => void; // ✅ ADDED
  startIndex?: number;
}

interface ClassSubjectCount {
  [classId: number]: number;
}

export default function ClassesTable({ classes, termId, isAdmin, onEdit, onDeactivate, onDelete, startIndex = 0 }: ClassesTableProps) {
  const router = useRouter();
  const [subjectCounts, setSubjectCounts] = useState<ClassSubjectCount>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  useEffect(() => {
    if (termId && classes.length > 0) {
      fetchSubjectCounts();
    } else {
      setSubjectCounts({});
    }
  }, [termId, classes]);

  const fetchSubjectCounts = async () => {
    if (!termId || classes.length === 0) return;

    setLoadingCounts(true);
    try {
      const classIds = classes.map(c => c.id).join(',');
      const response = await fetch(
        `/api/admin/classes/subject-counts?term_id=${termId}&class_ids=${classIds}`
      );
      if (!response.ok) return;

      const data = await response.json();
      setSubjectCounts(data.counts || {});
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
            <th className="h-12 px-4 text-left align-middle font-medium w-12">#</th>
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
          {classes.map((classItem, index) => (
            <tr key={classItem.id} className="border-b hover:bg-muted/50 transition-colors">
              <td className="p-4 align-middle text-sm text-muted-foreground w-12">
                {startIndex + index + 1}
              </td>
              <td className="p-4 align-middle max-w-[220px]">
                <div>
                  <div className="font-medium text-sm leading-snug">{classItem.name}</div>
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
                    <Badge variant="outline" className="text-sm">Loading...</Badge>
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
                  classItem.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
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

                  {/* ✅ Admin-only Delete button */}
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(classItem)}
                      className="text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200"
                      title="Permanently delete this class"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
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