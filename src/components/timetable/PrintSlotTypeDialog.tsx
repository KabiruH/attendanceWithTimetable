// components/timetable/PrintSlotTypeDialog.tsx
'use client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, AlertTriangle, Home, Layers, Printer } from "lucide-react";
import { useState } from "react";

export type SlotTypeFilter = 'all' | 'nta' | 'rna' | 'nta_rna';

interface PrintSlotTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printLabel: string;          // e.g. "Master Timetable" or "Class Timetable"
  ntaCount: number;
  rnaCount: number;
  onConfirm: (filter: SlotTypeFilter) => void;
}

export default function PrintSlotTypeDialog({
  open,
  onOpenChange,
  printLabel,
  ntaCount,
  rnaCount,
  onConfirm,
}: PrintSlotTypeDialogProps) {
  const [selected, setSelected] = useState<SlotTypeFilter>('all');
  const hasFlags = ntaCount > 0 || rnaCount > 0;

  const handleConfirm = () => {
    onConfirm(selected);
    setSelected('all');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) setSelected('all'); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print {printLabel}
          </DialogTitle>
          <DialogDescription>
            Choose which slot types to include in this print.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selected} onValueChange={v => setSelected(v as SlotTypeFilter)} className="space-y-2 py-2">

          {/* All */}
          <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
            <RadioGroupItem value="all" id="pst-all" />
            <LayoutGrid className="h-4 w-4 text-gray-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">All Slots</div>
              <div className="text-xs text-gray-500">Print everything — scheduled, NTA and RNA</div>
            </div>
          </label>

          {/* NTA */}
          <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
            ntaCount === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-50'
          }`}>
            <RadioGroupItem value="nta" id="pst-nta" disabled={ntaCount === 0} />
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm flex items-center gap-2">
                NTA Only
                {ntaCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">
                    {ntaCount}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-gray-500">Sessions with no trainer assigned</div>
            </div>
          </label>

          {/* RNA */}
          <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
            rnaCount === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-orange-50'
          }`}>
            <RadioGroupItem value="rna" id="pst-rna" disabled={rnaCount === 0} />
            <Home className="h-4 w-4 text-orange-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm flex items-center gap-2">
                RNA Only
                {rnaCount > 0 && (
                  <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-1.5 py-0">
                    {rnaCount}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-gray-500">Sessions placed in the catch-all RNA room</div>
            </div>
          </label>

          {/* NTA + RNA */}
          <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
            !hasFlags ? 'opacity-40 cursor-not-allowed' : 'hover:bg-purple-50'
          }`}>
            <RadioGroupItem value="nta_rna" id="pst-both" disabled={!hasFlags} />
            <Layers className="h-4 w-4 text-purple-600 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm flex items-center gap-2">
                NTA + RNA
                {hasFlags && (
                  <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0">
                    {ntaCount + rnaCount}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-gray-500">All flagged slots — useful as a resolution report</div>
            </div>
          </label>

        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setSelected('all'); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}