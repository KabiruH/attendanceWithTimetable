// components/timetable/GenerateTimetableDialog.tsx
'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Term {
  id: number;
  name: string;
  is_active: boolean;
}

interface GenerateTimetableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  terms: Term[];
}

export default function GenerateTimetableDialog({
  open,
  onOpenChange,
  onSuccess,
  terms
}: GenerateTimetableDialogProps) {
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [method, setMethod] = useState<'manual' | 'excel'>('manual');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        setError('Please select an Excel file (.xlsx or .xls)');
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedTerm) {
      setError('Please select a term');
      return;
    }

    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('term_id', selectedTerm);

      const response = await fetch('/api/timetable/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload timetable');
      }

      setSuccess(`Successfully created ${data.created} timetable slots!`);
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
        resetForm();
      }, 2000);
    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload timetable');
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualRedirect = () => {
    // Close dialog and user can use the "Add Slot" button to add manually
    onOpenChange(false);
  };

  const resetForm = () => {
    setSelectedTerm('');
    setMethod('manual');
    setFile(null);
    setError('');
    setSuccess('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generate Timetable</DialogTitle>
          <DialogDescription>
            Create timetable slots for a term using Excel import or manual entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Term Selection */}
          <div className="space-y-2">
            <Label htmlFor="term">Select Term *</Label>
            <Select value={selectedTerm} onValueChange={setSelectedTerm}>
              <SelectTrigger>
                <SelectValue placeholder="Select a term" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id.toString()}>
                    {term.name} {term.is_active && '(Active)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Method Selection */}
          <div className="space-y-2">
            <Label>Generation Method</Label>
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                variant={method === 'excel' ? 'default' : 'outline'}
                onClick={() => setMethod('excel')}
                className="h-20 flex-col gap-2"
              >
                <FileSpreadsheet className="h-6 w-6" />
                <span>Excel Import</span>
              </Button>
              <Button
                type="button"
                variant={method === 'manual' ? 'default' : 'outline'}
                onClick={() => setMethod('manual')}
                className="h-20 flex-col gap-2"
              >
                <Upload className="h-6 w-6" />
                <span>Manual Entry</span>
              </Button>
            </div>
          </div>

          {/* Excel Upload Section */}
          {method === 'excel' && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <Label htmlFor="file">Upload Excel File</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              {file && (
                <div className="text-sm text-gray-600">
                  Selected: <span className="font-medium">{file.name}</span>
                </div>
              )}
              <div className="text-xs text-gray-500">
                <p className="font-medium mb-1">Excel Format:</p>
                <p>Columns: Trainer Name, Class Code, Day (Mon-Sun), Period, Room</p>
              </div>
            </div>
          )}

          {/* Manual Entry Section */}
          {method === 'manual' && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-3">
                Click &quot;Continue&quot; to close this dialog and add slots manually using the &quot;Add Slot&quot; button.
              </p>
              <Button
                onClick={handleManualRedirect}
                variant="outline"
                className="w-full"
              >
                Continue to Manual Entry
              </Button>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          {method === 'excel' && (
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading || !file || !selectedTerm}
              >
                {isUploading ? 'Uploading...' : 'Upload & Generate'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}