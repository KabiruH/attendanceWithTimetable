// components/timetable/TimetableFilters.tsx
'use client';
import { Button } from "@/components/ui/button";
import { Filter, X, BookOpen, MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface TimetableFiltersProps {
  isAdmin: boolean;
  viewMode: 'all' | 'mine';
  onViewModeChange: (mode: 'all' | 'mine') => void;
  
  // Filter values
  filterTrainer: number | null;
  filterDepartment: string | null;
  filterClass: number | null;
  filterSubject: number | null;
  filterRoom: number | null;
  
  // Filter setters
  onTrainerChange: (trainerId: number | null) => void;
  onDepartmentChange: (department: string | null) => void;
  onClassChange: (classId: number | null) => void;
  onSubjectChange: (subjectId: number | null) => void;
  onRoomChange: (roomId: number | null) => void;
  onClearFilters: () => void;
  
  // Available options
  availableTrainers: Array<{id: number, name: string}>;
  availableDepartments: string[];
  availableClasses: Array<{id: number, name: string, code: string}>;
  availableSubjects: Array<{id: number, name: string, code: string}>;
  availableRooms: Array<{id: number, name: string}>;
}

export default function TimetableFilters({
  isAdmin,
  viewMode,
  onViewModeChange,
  filterTrainer,
  filterDepartment,
  filterClass,
  filterSubject,
  filterRoom,
  onTrainerChange,
  onDepartmentChange,
  onClassChange,
  onSubjectChange,
  onRoomChange,
  onClearFilters,
  availableTrainers,
  availableDepartments,
  availableClasses,
  availableSubjects,
  availableRooms,
}: TimetableFiltersProps) {
  // Count active filters
  const activeFiltersCount = [filterTrainer, filterDepartment, filterClass, filterSubject, filterRoom].filter(Boolean).length;

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      {/* View Mode Toggle */}
      <div className="flex-1">
        <Label>View Mode</Label>
        <Select
          value={viewMode}
          onValueChange={(value: 'all' | 'mine') => onViewModeChange(value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            <SelectItem value="mine">My Subjects Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Advanced Filters (only show when viewing all) */}
      {viewMode === 'all' && (
        <div className="flex items-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="relative">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Filter Timetable</h4>
                  {activeFiltersCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onClearFilters}
                      className="h-7 text-xs"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Clear All
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Department Filter */}
                <div className="space-y-2">
                  <Label className="text-xs">Filter by Department</Label>
                  <Select
                    value={filterDepartment || 'all'}
                    onValueChange={(value) => 
                      onDepartmentChange(value === 'all' ? null : value)
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {availableDepartments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Trainer Filter */}
                <div className="space-y-2">
                  <Label className="text-xs">Filter by Trainer</Label>
                  <Select
                    value={filterTrainer?.toString() || 'all'}
                    onValueChange={(value) => 
                      onTrainerChange(value === 'all' ? null : parseInt(value))
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All trainers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Trainers</SelectItem>
                      {availableTrainers.map((trainer) => (
                        <SelectItem key={trainer.id} value={trainer.id.toString()}>
                          {trainer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Class Filter */}
                <div className="space-y-2">
                  <Label className="text-xs">Filter by Class</Label>
                  <Select
                    value={filterClass?.toString() || 'all'}
                    onValueChange={(value) => 
                      onClassChange(value === 'all' ? null : parseInt(value))
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All classes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {availableClasses.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id.toString()}>
                          {cls.code} - {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subject Filter */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    Filter by Subject
                  </Label>
                  <Select
                    value={filterSubject?.toString() || 'all'}
                    onValueChange={(value) => 
                      onSubjectChange(value === 'all' ? null : parseInt(value))
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subjects</SelectItem>
                      {availableSubjects.map((subj) => (
                        <SelectItem key={subj.id} value={subj.id.toString()}>
                          {subj.code} - {subj.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Room Filter */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Filter by Room
                  </Label>
                  <Select
                    value={filterRoom?.toString() || 'all'}
                    onValueChange={(value) => 
                      onRoomChange(value === 'all' ? null : parseInt(value))
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All rooms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Rooms</SelectItem>
                      {availableRooms.map((room) => (
                        <SelectItem key={room.id} value={room.id.toString()}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </>
  );
}