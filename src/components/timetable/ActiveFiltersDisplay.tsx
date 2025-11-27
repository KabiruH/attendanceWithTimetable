// components/timetable/ActiveFiltersDisplay.tsx

'use client';
import { X, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActiveFiltersDisplayProps {
  isAdmin: boolean;
  viewMode: 'all' | 'mine';
  filterTrainer: number | null;
  filterClass: number | null;
  filterSubject: number | null;
  filterDepartment: string | null;
  availableTrainers: Array<{id: number, name: string}>;
  availableClasses: Array<{id: number, name: string, code: string}>;
  availableSubjects: Array<{id: number, name: string, code: string}>;
  onRemoveTrainer: () => void;
  onRemoveClass: () => void;
  onRemoveSubject: () => void;
  onRemoveDepartment: () => void;
}

export default function ActiveFiltersDisplay({
  isAdmin,
  viewMode,
  filterTrainer,
  filterClass,
  filterSubject,
  filterDepartment,
  availableTrainers,
  availableClasses,
  availableSubjects,
  onRemoveTrainer,
  onRemoveClass,
  onRemoveSubject,
  onRemoveDepartment,
}: ActiveFiltersDisplayProps) {
  const activeFiltersCount = [filterTrainer, filterDepartment, filterClass, filterSubject].filter(Boolean).length;

  if (!isAdmin || viewMode !== 'all' || activeFiltersCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex-wrap">
      <span className="text-sm text-blue-900 font-medium">Active Filters:</span>
      
      {filterTrainer && (
        <Badge variant="secondary" className="gap-1">
          Trainer: {availableTrainers.find(t => t.id === filterTrainer)?.name}
          <X 
            className="h-3 w-3 cursor-pointer hover:text-red-600" 
            onClick={onRemoveTrainer}
          />
        </Badge>
      )}
      
      {filterClass && (
        <Badge variant="secondary" className="gap-1">
          Class: {availableClasses.find(c => c.id === filterClass)?.code}
          <X 
            className="h-3 w-3 cursor-pointer hover:text-red-600" 
            onClick={onRemoveClass}
          />
        </Badge>
      )}
      
      {filterSubject && (
        <Badge variant="secondary" className="gap-1">
          <BookOpen className="h-3 w-3" />
          Subject: {availableSubjects.find(s => s.id === filterSubject)?.code}
          <X 
            className="h-3 w-3 cursor-pointer hover:text-red-600" 
            onClick={onRemoveSubject}
          />
        </Badge>
      )}
      
      {filterDepartment && (
        <Badge variant="secondary" className="gap-1">
          Department: {filterDepartment}
          <X 
            className="h-3 w-3 cursor-pointer hover:text-red-600" 
            onClick={onRemoveDepartment}
          />
        </Badge>
      )}
    </div>
  );
}