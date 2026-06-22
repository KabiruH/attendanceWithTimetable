// components/timetable/TimetableFilters.tsx
'use client';

import { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Filter, X, BookOpen, MapPin, AlertTriangle } from "lucide-react";
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

export type SlotTypeFilter = 'all' | 'nta' | 'rna' | 'nta_rna';

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
  filterSlotType: SlotTypeFilter;

  // Filter setters
  onTrainerChange: (trainerId: number | null) => void;
  onDepartmentChange: (department: string | null) => void;
  onClassChange: (classId: number | null) => void;
  onSubjectChange: (subjectId: number | null) => void;
  onRoomChange: (roomId: number | null) => void;
  onSlotTypeChange: (type: SlotTypeFilter) => void;
  onClearFilters: () => void;

  // Available options
  availableTrainers: Array<{ id: number; name: string }>;
  availableDepartments: string[];
  availableClasses: Array<{ id: number; name: string; code: string }>;
  availableSubjects: Array<{ id: number; name: string; code: string }>;
  availableRooms: Array<{ id: number; name: string }>;

  // Counts for NTA/RNA badges
  ntaCount?: number;
  rnaCount?: number;
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
  filterSlotType,
  onTrainerChange,
  onDepartmentChange,
  onClassChange,
  onSubjectChange,
  onRoomChange,
  onSlotTypeChange,
  onClearFilters,
  availableTrainers,
  availableDepartments,
  availableClasses,
  availableSubjects,
  availableRooms,
  ntaCount = 0,
  rnaCount = 0,
}: TimetableFiltersProps) {
  // slot type counts as an active filter only when not 'all'
  const activeFiltersCount = [
    filterTrainer,
    filterDepartment,
    filterClass,
    filterSubject,
    filterRoom,
    filterSlotType !== 'all' ? filterSlotType : null,
  ].filter(Boolean).length;

  if (!isAdmin) return null;

  const [trainerSearch, setTrainerSearch] = useState('');
  const filteredTrainers = availableTrainers.filter(t =>
  t.name.toLowerCase().includes(trainerSearch.toLowerCase())
);

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

      {/* Advanced Filters */}
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
                    onValueChange={v => onDepartmentChange(v === 'all' ? null : v)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {availableDepartments.map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

             {/* Trainer Filter */}
<div className="space-y-2">
  <Label className="text-xs">Filter by Trainer</Label>

  {/* Search input */}
  <Input
    placeholder="Search trainer..."
    value={trainerSearch}
    onChange={e => setTrainerSearch(e.target.value)}
    className="text-sm h-8"
  />

  {/* Scrollable results */}
  <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background">
    {/* Clear option */}
    <button
      type="button"
      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
        !filterTrainer ? 'bg-accent font-medium' : ''
      }`}
      onClick={() => { onTrainerChange(null); setTrainerSearch(''); }}
    >
      All Trainers
    </button>

    {filteredTrainers.length === 0 ? (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No trainers found
      </div>
    ) : (
      filteredTrainers.map(trainer => (
        <button
          key={trainer.id}
          type="button"
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
            filterTrainer === trainer.id ? 'bg-accent font-medium' : ''
          }`}
          onClick={() => { onTrainerChange(trainer.id); setTrainerSearch(''); }}
        >
          {trainer.name}
        </button>
      ))
    )}
  </div>

  {/* Show selected trainer name when one is active */}
  {filterTrainer && (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span className="truncate">
        Selected: <span className="font-medium text-foreground">
          {availableTrainers.find(t => t.id === filterTrainer)?.name}
        </span>
      </span>
      <button
        type="button"
        className="shrink-0 ml-2 hover:text-red-600"
        onClick={() => { onTrainerChange(null); setTrainerSearch(''); }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )}
</div>

                {/* Class Filter */}
                <div className="space-y-2">
                  <Label className="text-xs">Filter by Class</Label>
                  <Select
                    value={filterClass?.toString() || 'all'}
                    onValueChange={v => onClassChange(v === 'all' ? null : parseInt(v))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All classes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {availableClasses.map(cls => (
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
                    onValueChange={v => onSubjectChange(v === 'all' ? null : parseInt(v))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subjects</SelectItem>
                      {availableSubjects.map(subj => (
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
                    onValueChange={v => onRoomChange(v === 'all' ? null : parseInt(v))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="All rooms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Rooms</SelectItem>
                      {availableRooms.map(room => (
                        <SelectItem key={room.id} value={room.id.toString()}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* ── Slot Type Filter (NTA / RNA) ─────────────────────── */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Filter by Slot Type
                    {(ntaCount > 0 || rnaCount > 0) && (
                      <Badge
                        variant="outline"
                        className="ml-1 text-[9px] px-1 py-0 h-4 border-orange-300 text-orange-600"
                      >
                        {ntaCount + rnaCount} flagged
                      </Badge>
                    )}
                  </Label>
                  <Select
                    value={filterSlotType}
                    onValueChange={v => onSlotTypeChange(v as SlotTypeFilter)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Slots</SelectItem>
                      <SelectItem value="nta" disabled={ntaCount === 0}>
                        <span className="flex items-center gap-2">
                          NTA Only
                          {ntaCount > 0 && (
                            <span className="text-[10px] text-red-600 font-semibold">
                              ({ntaCount})
                            </span>
                          )}
                        </span>
                      </SelectItem>
                      <SelectItem value="rna" disabled={rnaCount === 0}>
                        <span className="flex items-center gap-2">
                          RNA Only
                          {rnaCount > 0 && (
                            <span className="text-[10px] text-orange-600 font-semibold">
                              ({rnaCount})
                            </span>
                          )}
                        </span>
                      </SelectItem>
                      <SelectItem value="nta_rna" disabled={ntaCount === 0 && rnaCount === 0}>
                        <span className="flex items-center gap-2">
                          NTA + RNA
                          {(ntaCount > 0 || rnaCount > 0) && (
                            <span className="text-[10px] text-purple-600 font-semibold">
                              ({ntaCount + rnaCount})
                            </span>
                          )}
                        </span>
                      </SelectItem>
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