// components/rooms/ImportRoomsDialog.tsx
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import * as XLSX from 'xlsx';

interface ImportRoomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export default function ImportRoomsDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportRoomsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv'
      ];
      
      if (!validTypes.includes(selectedFile.type) && 
          !selectedFile.name.endsWith('.csv') && 
          !selectedFile.name.endsWith('.xlsx') && 
          !selectedFile.name.endsWith('.xls')) {
        setError('Please select a valid Excel (.xlsx, .xls) or CSV file');
        return;
      }

      setFile(selectedFile);
      setError('');
      setResult(null);
    }
  };

  const parseExcelFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          // Get first sheet
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            raw: false,
            defval: null 
          });

          resolve(jsonData);
        } catch (error) {
          reject(new Error('Failed to parse Excel file'));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setError('');
    setResult(null);
    setUploadProgress(0);

    try {
      // Parse the file
      setUploadProgress(20);
      const rooms = await parseExcelFile(file);

      if (!rooms || rooms.length === 0) {
        throw new Error('No data found in file');
      }

      setUploadProgress(40);

      // Send to API
      const response = await fetch('/api/rooms/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rooms }),
      });

      setUploadProgress(80);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import rooms');
      }

      setUploadProgress(100);
      setResult({
        imported: data.imported,
        skipped: data.skipped,
        errors: data.errors || []
      });

      // If successful, wait a bit then close and refresh
      if (data.imported > 0) {
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : 'Failed to import rooms');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setError('');
    setResult(null);
    setUploadProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Import Rooms from Excel</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with room data. Download the sample file to see the required format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <div className="flex gap-2">
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                disabled={isUploading}
                className="flex-1"
              />
              {file && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setError('');
                    setResult(null);
                  }}
                  disabled={isUploading}
                >
                  Clear
                </Button>
              )}
            </div>
            {file && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileSpreadsheet className="h-4 w-4" />
                <span>{file.name}</span>
                <span className="text-xs">({(file.size / 1024).toFixed(2)} KB)</span>
              </div>
            )}
          </div>

          {/* Expected Format Info */}
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            <p className="font-medium text-blue-900 mb-1">Expected Columns:</p>
            <ul className="text-blue-800 space-y-1 text-xs">
              <li>• <strong>name</strong> (required) - Room name/number</li>
              <li>• <strong>capacity</strong> (optional) - Number of students</li>
              <li>• <strong>room_type</strong> (optional) - classroom, lab, computer_lab, workshop, lecture_hall, studio, auditorium</li>
              <li>• <strong>equipment</strong> (optional) - Comma-separated list</li>
              <li>• <strong>department</strong> (optional) - Department name</li>
              <li>• <strong>is_active</strong> (optional) - true/false (default: true)</li>
            </ul>
          </div>

          {/* Progress Bar */}
          {isUploading && (
            <div className="space-y-2">
              <Label>Upload Progress</Label>
              <Progress value={uploadProgress} className="w-full" />
              <p className="text-sm text-gray-600 text-center">{uploadProgress}%</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Result */}
          {result && (
            <div className="space-y-3">
              {result.imported > 0 && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Successfully imported {result.imported} room{result.imported !== 1 ? 's' : ''}!
                  </AlertDescription>
                </Alert>
              )}

              {result.skipped > 0 && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    Skipped {result.skipped} room{result.skipped !== 1 ? 's' : ''} due to errors.
                  </AlertDescription>
                </Alert>
              )}

              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="font-medium text-red-900 text-sm mb-2">Errors:</p>
                  <ul className="text-xs text-red-800 space-y-1">
                    {result.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
            >
              {result?.imported ? 'Close' : 'Cancel'}
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || isUploading}
            >
              {isUploading ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-pulse" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Rooms
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}