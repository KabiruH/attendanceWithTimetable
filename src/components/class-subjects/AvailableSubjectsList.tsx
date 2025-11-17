// components/class-subjects/AvailableSubjectsList.tsx
import { useState } from "react";
import { Search, CheckSquare, Square, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface Subject {
  id: number;
  name: string;
  code: string;
  department: string;
  credit_hours: number | null;
  description: string | null;
}

interface AvailableSubjectsListProps {
  subjects: Subject[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  departmentFilter: string;
  onDepartmentChange: (value: string) => void;
  departments: string[];
  onAssignSubject: (subjectId: number) => void;
  selectedSubjects: number[];
  onToggleSubject: (subjectId: number) => void;
  onBatchAssign: () => void;
}

export default function AvailableSubjectsList({
  subjects,
  searchQuery,
  onSearchChange,
  departmentFilter,
  onDepartmentChange,
  departments,
  onAssignSubject,
  selectedSubjects,
  onToggleSubject,
  onBatchAssign,
}: AvailableSubjectsListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Pagination calculations
  const totalPages = Math.ceil(subjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSubjects = subjects.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setCurrentPage(1);
    onSearchChange(value);
  };

  const handleDepartmentChange = (value: string) => {
    setCurrentPage(1);
    onDepartmentChange(value);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(parseInt(value));
    setCurrentPage(1);
  };

  const allSelected = paginatedSubjects.length > 0 && paginatedSubjects.every(s => selectedSubjects.includes(s.id));

  const handleSelectAll = () => {
    if (allSelected) {
      paginatedSubjects.forEach(s => {
        if (selectedSubjects.includes(s.id)) {
          onToggleSubject(s.id);
        }
      });
    } else {
      paginatedSubjects.forEach(s => {
        if (!selectedSubjects.includes(s.id)) {
          onToggleSubject(s.id);
        }
      });
    }
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <Card className="h-[calc(100vh-300px)] flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle>Available Subjects</CardTitle>
          {selectedSubjects.length > 0 && (
            <Button onClick={onBatchAssign} size="sm">
              Assign Selected ({selectedSubjects.length})
            </Button>
          )}
        </div>
        <div className="space-y-2 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={departmentFilter} onValueChange={handleDepartmentChange}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Filter by department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {paginatedSubjects.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="whitespace-nowrap"
              >
                {allSelected ? (
                  <>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Select All
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        {subjects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No available subjects found</p>
            <p className="text-sm mt-2">Try adjusting your filters or add new subjects</p>
          </div>
        ) : (
          <div className="space-y-1">
            {paginatedSubjects.map((subject) => (
              <div
                key={subject.id}
                className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all hover:shadow-sm hover:bg-accent/50 ${
                  selectedSubjects.includes(subject.id) ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                onClick={() => onToggleSubject(subject.id)}
              >
                <Checkbox
                  checked={selectedSubjects.includes(subject.id)}
                  onCheckedChange={() => onToggleSubject(subject.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{subject.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {subject.code}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="truncate">{subject.department}</span>
                    {subject.credit_hours && (
                      <>
                        <span>•</span>
                        <span className="shrink-0">{subject.credit_hours}h</span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  className="shrink-0 h-7 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignSubject(subject.id);
                  }}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Pagination Footer */}
      {subjects.length > 0 && (
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
                {startIndex + 1}-{Math.min(endIndex, subjects.length)} of {subjects.length}
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