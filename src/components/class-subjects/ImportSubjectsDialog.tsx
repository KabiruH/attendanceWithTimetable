// components/admin/class-subjects/ImportSubjectsDialog.tsx
"use client";

import { useState } from "react";
import { Upload, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface ImportSubjectsDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportSubjectsDialog({
  onClose,
  onSuccess,
}: ImportSubjectsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      if (
        !selectedFile.name.endsWith(".xlsx") &&
        !selectedFile.name.endsWith(".xls") &&
        !selectedFile.name.endsWith(".csv")
      ) {
        toast.error("Please select a valid Excel or CSV file");
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "Subject Name,Subject Code,Department,Credit Hours,Description\n" +
      "Programming Fundamentals,PROG101,IT,40,Introduction to programming concepts\n" +
      "Database Design,DB101,IT,30,Database fundamentals and SQL\n" +
      "Business Communication,BUS101,Business,20,Professional communication skills\n";
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subjects_import_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    toast.success("Template downloaded successfully");
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Please select a file to import");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/subjects/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to import subjects");
      }

      const result = await response.json();
      toast.success(
        `Successfully imported ${result.imported} subject(s), ${result.updated} updated`
      );
      onSuccess();
    } catch (error: any) {
      console.error("Error importing subjects:", error);
      toast.error(error.message || "Failed to import subjects");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import Subjects</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file to import subjects into the system. You can then assign them to classes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="border rounded-lg p-4 bg-muted/50">
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-sm mb-1">
                  Need a template?
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Download our template with the correct format
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="h-3 w-3 mr-2" />
                  Download Template
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="file-upload"
              className="block text-sm font-medium"
            >
              Select File
            </label>
            <div className="flex items-center gap-2">
              <input
                id="file-upload"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("file-upload")?.click()}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {file ? "Change File" : "Choose File"}
              </Button>
            </div>
            {file && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <span className="text-sm truncate">{file.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
            <p className="font-medium">File Requirements:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>File must be .xlsx, .xls, or .csv format</li>
              <li>Required columns: Subject Name, Subject Code, Department</li>
              <li>Optional columns: Credit Hours, Description</li>
              <li>First row should contain column headers</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!file || uploading}>
            {uploading ? "Importing..." : "Import Subjects"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}