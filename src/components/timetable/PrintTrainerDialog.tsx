// components/timetable/PrintTrainerDialog.tsx
'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { User } from "lucide-react";

interface Trainer {
  id: number;
  name: string;
}

interface PrintTrainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainers: Trainer[];
  onPrint: (trainerId: number) => void;
}

export default function PrintTrainerDialog({
  open,
  onOpenChange,
  trainers,
  onPrint,
}: PrintTrainerDialogProps) {
  const [selectedTrainer, setSelectedTrainer] = useState<string>('');

  const handlePrint = () => {
    if (selectedTrainer) {
      onPrint(parseInt(selectedTrainer));
      setSelectedTrainer('');
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setSelectedTrainer('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Print Trainer Schedule
          </DialogTitle>
          <DialogDescription>
            Select a trainer to print their individual timetable schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="trainer-select">Select Trainer</Label>
            <Select
              value={selectedTrainer}
              onValueChange={setSelectedTrainer}
            >
              <SelectTrigger id="trainer-select">
                <SelectValue placeholder="Choose a trainer..." />
              </SelectTrigger>
              <SelectContent>
                {trainers.length === 0 ? (
                  <SelectItem value="no-trainers" disabled>
                    No trainers available
                  </SelectItem>
                ) : (
                  trainers.map((trainer) => (
                    <SelectItem key={trainer.id} value={trainer.id.toString()}>
                      {trainer.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handlePrint}
              disabled={!selectedTrainer}
            >
              <User className="mr-2 h-4 w-4" />
              Print Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}