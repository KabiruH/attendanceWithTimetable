'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Filter, Building2, GraduationCap, Layers, User, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PrintFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: Array<{ id: number; name: string; code: string; department: string }>;
  trainers: Array<{ id: number; name: string; department?: string | null }>;
  onPrint: (
    filterType: 'department' | 'class' | 'combined' | 'department_trainer',
    filterValue: string | number | { department: string; classIds: number[] } | { department: string; trainerIds: number[] }
  ) => void;
}

export default function PrintFilterDialog({
  open,
  onOpenChange,
  classes,
  trainers,
  onPrint,
}: PrintFilterDialogProps) {
  const [filterType, setFilterType] = useState<'department' | 'class' | 'combined' | 'department_trainer'>('department');
  const [selectedDepartment, setSelectedDepartment]   = useState('');
  const [selectedClass, setSelectedClass]             = useState('');
  const [combinedDepartment, setCombinedDepartment]   = useState('');
  const [selectedClassIds, setSelectedClassIds]       = useState<number[]>([]);
  const [trainerDepartment, setTrainerDepartment]     = useState('');
  const [selectedTrainerIds, setSelectedTrainerIds]   = useState<number[]>([]);
  const [trainerSearch, setTrainerSearch] = useState('');

  const departments = Array.from(
    new Set(classes.map(c => c.department).filter(Boolean))
  ).sort();

  const departmentClasses = combinedDepartment
    ? classes.filter(c => c.department === combinedDepartment)
    : [];

  const departmentTrainers = trainerDepartment
    ? trainers.filter(t =>
        t.department?.toLowerCase() === trainerDepartment.toLowerCase()
      )
    : [];

  const handleClassToggle   = (id: number) =>
    setSelectedClassIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleTrainerToggle = (id: number) =>
    setSelectedTrainerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleReset = () => {
    setSelectedDepartment('');
    setSelectedClass('');
    setCombinedDepartment('');
    setSelectedClassIds([]);
    setTrainerDepartment('');
    setSelectedTrainerIds([]);
    setTrainerSearch('');       
  };

  const handlePrint = () => {
    if (filterType === 'department' && selectedDepartment) {
      onPrint('department', selectedDepartment);
    } else if (filterType === 'class' && selectedClass) {
      onPrint('class', parseInt(selectedClass));
    } else if (filterType === 'combined' && combinedDepartment && selectedClassIds.length > 0) {
      onPrint('combined', { department: combinedDepartment, classIds: selectedClassIds });
    } else if (filterType === 'department_trainer' && trainerDepartment && selectedTrainerIds.length > 0) {
      onPrint('department_trainer', { department: trainerDepartment, trainerIds: selectedTrainerIds });
    }
    handleReset();
    onOpenChange(false);
  };

  const isValid =
    (filterType === 'department'         && !!selectedDepartment) ||
    (filterType === 'class'              && !!selectedClass) ||
    (filterType === 'combined'           && !!combinedDepartment && selectedClassIds.length > 0) ||
    (filterType === 'department_trainer' && !!trainerDepartment  && selectedTrainerIds.length > 0);

    const filteredTrainers = trainerSearch.trim()
  ? departmentTrainers.filter(t =>
      t.name.toLowerCase().includes(trainerSearch.toLowerCase())
    )
  : departmentTrainers;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleReset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Print Filtered Timetable
          </DialogTitle>
          <DialogDescription>
            Select a filter type and choose what to print. Only slots matching your selection will be included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">

          {/* ── Filter type ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Filter By</Label>
            <RadioGroup
              value={filterType}
              onValueChange={v => { setFilterType(v as typeof filterType); handleReset(); }}
            >
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="department" id="r-dept" />
                <Label htmlFor="r-dept" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="font-medium">Department</div>
                    <div className="text-xs text-gray-600">Print all classes and trainers within a department</div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="class" id="r-class" />
                <Label htmlFor="r-class" className="flex items-center gap-2 cursor-pointer flex-1">
                  <GraduationCap className="h-4 w-4 text-purple-600" />
                  <div>
                    <div className="font-medium">Class</div>
                    <div className="text-xs text-gray-600">Print schedule for a specific class</div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="combined" id="r-combined" />
                <Label htmlFor="r-combined" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Layers className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="font-medium">Department + Specific Classes</div>
                    <div className="text-xs text-gray-600">Select a department, then pick specific classes within it</div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="department_trainer" id="r-dept-trainer" />
                <Label htmlFor="r-dept-trainer" className="flex items-center gap-2 cursor-pointer flex-1">
                  <User className="h-4 w-4 text-orange-600" />
                  <div>
                    <div className="font-medium">Department + Specific Trainers</div>
                    <div className="text-xs text-gray-600">Select a department, then pick specific trainers within it</div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* ── Department only ──────────────────────────────────────────── */}
          {filterType === 'department' && (
            <div className="space-y-2">
              <Label>Select Department *</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a department…" />
                </SelectTrigger>
                <SelectContent>
                  {departments.length === 0
                    ? <SelectItem value="__none" disabled>No departments available</SelectItem>
                    : departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)
                  }
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">All classes and subjects from this department will be included</p>
            </div>
          )}

          {/* ── Class only ───────────────────────────────────────────────── */}
          {filterType === 'class' && (
            <div className="space-y-2">
              <Label>Select Class *</Label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class…" />
                </SelectTrigger>
                <SelectContent>
                  {classes.length === 0
                    ? <SelectItem value="__none" disabled>No classes available</SelectItem>
                    : classes.map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>
                          {c.code} — {c.name}
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">All subjects and trainers for this class will be included</p>
            </div>
          )}

          {/* ── Department + Classes ─────────────────────────────────────── */}
          {filterType === 'combined' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Step 1: Select Department *</Label>
                <Select
                  value={combinedDepartment}
                  onValueChange={v => { setCombinedDepartment(v); setSelectedClassIds([]); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a department…" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.length === 0
                      ? <SelectItem value="__none" disabled>No departments available</SelectItem>
                      : departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>

              {combinedDepartment && (
                <div className="space-y-2">
                  <Label>
                    Step 2: Select Classes from <span className="font-semibold">{combinedDepartment}</span> *
                  </Label>
                  {departmentClasses.length === 0 ? (
                    <div className="p-4 border rounded-lg bg-gray-50 text-center text-sm text-gray-500">
                      No classes found in this department
                    </div>
                  ) : (
                    <>
                      <div className="border rounded-lg divide-y max-h-[260px] overflow-y-auto">
                        {departmentClasses.map(cls => (
                          <label key={cls.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedClassIds.includes(cls.id)}
                              onChange={() => handleClassToggle(cls.id)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium">{cls.code}</span>
                            <span className="text-sm text-gray-600">— {cls.name}</span>
                          </label>
                        ))}
                      </div>
                      {selectedClassIds.length > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <span className="text-sm text-blue-900 font-medium">
                            {selectedClassIds.length} class{selectedClassIds.length !== 1 ? 'es' : ''} selected
                          </span>
                          <Badge variant="secondary" className="bg-blue-100">
                            {selectedClassIds.length} / {departmentClasses.length}
                          </Badge>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          type="button" variant="outline" size="sm"
                          disabled={selectedClassIds.length === departmentClasses.length}
                          onClick={() => setSelectedClassIds(departmentClasses.map(c => c.id))}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button" variant="outline" size="sm"
                          disabled={selectedClassIds.length === 0}
                          onClick={() => setSelectedClassIds([])}
                        >
                          Clear
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Department + Trainers ────────────────────────────────────── */}
          {filterType === 'department_trainer' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Step 1: Select Department *</Label>
                <Select
                  value={trainerDepartment}
                  onValueChange={v => { setTrainerDepartment(v); setSelectedTrainerIds([]); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a department…" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.length === 0
                      ? <SelectItem value="__none" disabled>No departments available</SelectItem>
                      : departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>

              {trainerDepartment && (
  <div className="space-y-2">
    <Label>
      Step 2: Select Trainers from <span className="font-semibold">{trainerDepartment}</span> *
    </Label>
    {departmentTrainers.length === 0 ? (
      <div className="p-4 border rounded-lg bg-amber-50 border-amber-200 text-center text-sm text-amber-700">
        No trainers found in this department. Ensure trainers have their department set in their profile.
      </div>
    ) : (
      <>
        {/* ── Search input ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search trainers…"
            value={trainerSearch}
            onChange={e => setTrainerSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          />
        </div>

        <div className="border rounded-lg divide-y max-h-[260px] overflow-y-auto">
          {filteredTrainers.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No trainers match &quot;{trainerSearch}&quot;
            </div>
          ) : (
            filteredTrainers.map(trainer => (    // ← was departmentTrainers
              <label key={trainer.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTrainerIds.includes(trainer.id)}
                  onChange={() => handleTrainerToggle(trainer.id)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <User className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <span className="text-sm font-medium">{trainer.name}</span>
              </label>
            ))
          )}
        </div>

        {selectedTrainerIds.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
            <span className="text-sm text-orange-900 font-medium">
              {selectedTrainerIds.length} trainer{selectedTrainerIds.length !== 1 ? 's' : ''} selected
            </span>
            <Badge variant="secondary" className="bg-orange-100">
              {selectedTrainerIds.length} / {departmentTrainers.length}
            </Badge>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button" variant="outline" size="sm"
            disabled={selectedClassIds.length === departmentTrainers.length}  
            onClick={() => setSelectedTrainerIds(departmentTrainers.map(t => t.id))}
          >
            Select All
          </Button>
          <Button
            type="button" variant="outline" size="sm"
            disabled={selectedTrainerIds.length === 0}
            onClick={() => setSelectedTrainerIds([])}
          >
            Clear
          </Button>
        </div>
      </>
    )}
  </div>
)}
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { handleReset(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={!isValid}>
            Print Timetable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}