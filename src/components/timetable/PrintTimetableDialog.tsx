// components/timetable/PrintTimetableDialog.tsx
'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Download, FileText } from "lucide-react";
import PrintableTimetable from './PrintableTimetable';
import { TimetableSlot } from '@/lib/types/timetable';

interface PrintTimetableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: TimetableSlot[];
  currentWeek: {
    start: Date;
    end: Date;
    weekNumber: number;
  };
  termName?: string;
}

export default function PrintTimetableDialog({
  open,
  onOpenChange,
  slots,
  currentWeek,
  termName
}: PrintTimetableDialogProps) {
  const [groupBy, setGroupBy] = useState<'class' | 'trainer'>('class');
  const [showPreview, setShowPreview] = useState(false);

  const handlePrint = () => {
    setShowPreview(true);
    // Small delay to ensure the component renders before printing
    setTimeout(() => {
      window.print();
      setTimeout(() => setShowPreview(false), 500);
    }, 100);
  };

  const handleDownloadPDF = async () => {
    setShowPreview(true);
    
    // Small delay to ensure the component renders
    setTimeout(async () => {
      try {
        // Use browser's print to PDF functionality
        window.print();
        setTimeout(() => setShowPreview(false), 500);
      } catch (error) {
        console.error('Error generating PDF:', error);
        setShowPreview(false);
      }
    }, 100);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Print/Download Timetable</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Group By Selection */}
            <div className="space-y-2">
              <Label>Group Timetables By</Label>
              <Select value={groupBy} onValueChange={(value: 'class' | 'trainer') => setGroupBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">By Class</span>
                      <span className="text-xs text-gray-500">One page per class</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="trainer">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">By Trainer</span>
                      <span className="text-xs text-gray-500">One page per trainer</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Each {groupBy} will be printed on a separate page
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-xs text-blue-900">
                  <p className="font-medium mb-1">Print Information:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                    <li>Optimized for A4 landscape orientation</li>
                    <li>Each {groupBy} on a separate page</li>
                    <li>Includes week information and timestamps</li>
                    <li>Best printed in color for department coding</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {groupBy === 'class' 
                    ? new Set(slots.map(s => s.class_id)).size
                    : new Set(slots.map(s => s.employee_id)).size
                  }
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Pages to print
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {slots.length}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Total slots
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={handlePrint}
                className="flex-1"
                variant="default"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              <Button
                onClick={handleDownloadPDF}
                className="flex-1"
                variant="outline"
              >
                <Download className="mr-2 h-4 w-4" />
                Save as PDF
              </Button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Tip: Use "Save as PDF" in the print dialog to create a PDF file
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden Printable Component */}
      {showPreview && (
        <div className="fixed inset-0 z-[9999]">
          <PrintableTimetable
            slots={slots}
            currentWeek={currentWeek}
            termName={termName}
            groupBy={groupBy}
          />
        </div>
      )}
    </>
  );
}