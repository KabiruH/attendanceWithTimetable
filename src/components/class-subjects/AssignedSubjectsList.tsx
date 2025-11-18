// components/class-subjects/AssignedSubjectsList.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

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

interface AssignedSubjectsListProps {
  subjects: AssignedSubject[];
  onRemoveSubject: (classSubjectId: number) => void;
}

export default function AssignedSubjectsList({
  subjects,
  onRemoveSubject,
}: AssignedSubjectsListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // ✅ Filter out any subjects without proper data
  const validSubjects = subjects.filter(s => s.subject && s.subject.name);

  // Pagination calculations
  const totalPages = Math.ceil(validSubjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSubjects = validSubjects.slice(startIndex, endIndex);

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(parseInt(value));
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // ✅ Show warning if some subjects are invalid
  const invalidCount = subjects.length - validSubjects.length;

  return (
    <Card className="h-[calc(100vh-300px)] flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle>Assigned Subjects</CardTitle>
          <Badge variant="secondary" className="text-sm">
            {validSubjects.length} Total
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Subjects assigned to this class
        </p>
        {invalidCount > 0 && (
          <div className="text-xs text-amber-600 mt-1">
            ⚠️ {invalidCount} subject{invalidCount > 1 ? 's' : ''} could not be loaded
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        {validSubjects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No subjects assigned yet</p>
            <p className="text-sm mt-2">Add subjects from the available list</p>
          </div>
        ) : (
          <div className="space-y-1">
            {paginatedSubjects.map((assignedSubject) => (
              <div
                key={assignedSubject.id}
                className="flex items-center gap-2 p-2 rounded-md border border-border hover:shadow-sm hover:bg-accent/50 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {assignedSubject.subject.name}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {assignedSubject.subject.code}
                    </Badge>
                    {assignedSubject.is_active && (
                      <Badge variant="default" className="text-xs shrink-0 bg-green-500">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="truncate">{assignedSubject.subject.department}</span>
                    {assignedSubject.subject.credit_hours && (
                      <>
                        <span>•</span>
                        <span className="shrink-0">{assignedSubject.subject.credit_hours}h</span>
                      </>
                    )}
                    {assignedSubject.term?.name && (
                      <>
                        <span>•</span>
                        <span className="truncate">{assignedSubject.term.name}</span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onRemoveSubject(assignedSubject.id)}
                  title="Remove subject"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Pagination Footer */}
      {validSubjects.length > 0 && (
        <div className="flex-shrink-0 border-t px-6 py-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                {startIndex + 1}-{Math.min(endIndex, validSubjects.length)} of {validSubjects.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 px-2">
                <span className="text-sm font-medium">{currentPage}</span>
                <span className="text-sm text-muted-foreground">of {totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}