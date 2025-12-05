// components/timetable/PrintFilterDialog.tsx
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
import { Filter, Building2, GraduationCap, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PrintFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: string[];
  classes: Array<{ id: number; name: string; code: string; department?: string }>;
  onPrint: (filterType: 'department' | 'class' | 'combined', filterValue: string | number | { department: string; classIds: number[] }) => void;
}

export default function PrintFilterDialog({
  open,
  onOpenChange,
  departments,
  classes,
  onPrint
}: PrintFilterDialogProps) {
  const [filterType, setFilterType] = useState<'department' | 'class' | 'combined'>('department');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  
  // For combined filter
  const [combinedDepartment, setCombinedDepartment] = useState<string>('');
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);

  // Get classes filtered by selected department
  const departmentClasses = combinedDepartment
    ? classes.filter(cls => cls.department === combinedDepartment)
    : [];

  const handleClassToggle = (classId: number) => {
    setSelectedClassIds(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  const handlePrint = () => {
    if (filterType === 'department' && selectedDepartment) {
      onPrint('department', selectedDepartment);
      onOpenChange(false);
      handleReset();
    } else if (filterType === 'class' && selectedClass) {
      onPrint('class', parseInt(selectedClass));
      onOpenChange(false);
      handleReset();
    } else if (filterType === 'combined' && combinedDepartment && selectedClassIds.length > 0) {
      onPrint('combined', {
        department: combinedDepartment,
        classIds: selectedClassIds
      });
      onOpenChange(false);
      handleReset();
    }
  };

  const handleReset = () => {
    setSelectedDepartment('');
    setSelectedClass('');
    setCombinedDepartment('');
    setSelectedClassIds([]);
  };

  const isValid = 
    (filterType === 'department' && selectedDepartment) ||
    (filterType === 'class' && selectedClass) ||
    (filterType === 'combined' && combinedDepartment && selectedClassIds.length > 0);

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleReset();
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Print Filtered Timetable
          </DialogTitle>
          <DialogDescription>
            Select a filter type and choose what to print. Only slots matching your selection will be included.
            Multiple subjects in the same time slot will be shown together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Filter Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Filter By</Label>
            <RadioGroup
              value={filterType}
              onValueChange={(value) => {
                setFilterType(value as 'department' | 'class' | 'combined');
                handleReset();
              }}
            >
              {/* Department Only */}
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="department" id="department" />
                <Label 
                  htmlFor="department" 
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="font-medium">Department</div>
                    <div className="text-xs text-gray-600">
                      Print all classes and trainers within a department
                    </div>
                  </div>
                </Label>
              </div>

              {/* Class Only */}
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="class" id="class" />
                <Label 
                  htmlFor="class" 
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <GraduationCap className="h-4 w-4 text-purple-600" />
                  <div>
                    <div className="font-medium">Class</div>
                    <div className="text-xs text-gray-600">
                      Print schedule for a specific class
                    </div>
                  </div>
                </Label>
              </div>

              {/* Combined Filter */}
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="combined" id="combined" />
                <Label 
                  htmlFor="combined" 
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <Layers className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="font-medium">Department + Specific Classes</div>
                    <div className="text-xs text-gray-600">
                      Select a department, then choose specific classes within it
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Department Only Selection */}
          {filterType === 'department' && (
            <div className="space-y-2">
              <Label htmlFor="department-select">Select Department *</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger id="department-select">
                  <SelectValue placeholder="Choose a department..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No departments available
                    </SelectItem>
                  ) : (
                    departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-600">
                All classes and subjects from this department will be included
              </p>
            </div>
          )}

          {/* Class Only Selection */}
          {filterType === 'class' && (
            <div className="space-y-2">
              <Label htmlFor="class-select">Select Class *</Label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger id="class-select">
                  <SelectValue placeholder="Choose a class..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No classes available
                    </SelectItem>
                  ) : (
                    classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id.toString()}>
                        {cls.code} - {cls.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-600">
                All subjects and trainers for this class will be included
              </p>
            </div>
          )}

          {/* Combined Filter Selection */}
          {filterType === 'combined' && (
            <div className="space-y-4">
              {/* Step 1: Select Department */}
              <div className="space-y-2">
                <Label htmlFor="combined-department-select">
                  Step 1: Select Department *
                </Label>
                <Select value={combinedDepartment} onValueChange={(value) => {
                  setCombinedDepartment(value);
                  setSelectedClassIds([]); // Reset class selection when department changes
                }}>
                  <SelectTrigger id="combined-department-select">
                    <SelectValue placeholder="Choose a department..." />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No departments available
                      </SelectItem>
                    ) : (
                      departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2: Select Classes */}
              {combinedDepartment && (
                <div className="space-y-2">
                  <Label>
                    Step 2: Select Classes from {combinedDepartment} *
                  </Label>
                  
                  {departmentClasses.length === 0 ? (
                    <div className="p-4 border rounded-lg bg-gray-50 text-center text-sm text-gray-600">
                      No classes found in this department
                    </div>
                  ) : (
                    <>
                      <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                        {departmentClasses.map((cls) => (
                          <label
                            key={cls.id}
                            className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedClassIds.includes(cls.id)}
                              onChange={() => handleClassToggle(cls.id)}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                {cls.code} - {cls.name}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>

                      {/* Selection Summary */}
                      {selectedClassIds.length > 0 && (
                        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <span className="text-sm text-blue-900 font-medium">
                            {selectedClassIds.length} class{selectedClassIds.length !== 1 ? 'es' : ''} selected
                          </span>
                          <Badge variant="secondary" className="bg-blue-100">
                            {selectedClassIds.length} / {departmentClasses.length}
                          </Badge>
                        </div>
                      )}

                      {/* Quick Actions */}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedClassIds(departmentClasses.map(c => c.id))}
                          disabled={selectedClassIds.length === departmentClasses.length}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedClassIds([])}
                          disabled={selectedClassIds.length === 0}
                        >
                          Clear Selection
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
          <Button
            variant="outline"
            onClick={() => {
              handleReset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!isValid}
          >
            Print Timetable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}