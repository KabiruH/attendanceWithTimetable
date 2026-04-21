"use client";

import { useState } from "react";
import { Upload, Download, X, AlertTriangle, CheckCircle2, SkipForward } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

interface SkippedRow {
  row: number;
  code: string;
  name: string;
  reason: string;
}

interface ImportResult {
  imported: number;
  updated: number;
  total: number;
  skipped_count: number;
  skipped?: SkippedRow[];
  message: string;
}

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
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

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
      setResult(null); // clear previous result when new file selected
    }
  };

  // ── Template download — fetches from API with departments pre-filled ────────
  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await fetch("/api/subjects/import/template");
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to download template");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "subjects_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Template downloaded — departments are pre-filled on the Departments sheet");
    } catch {
      toast.error("Network error. Failed to download template.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Please select a file to import");
      return;
    }

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/subjects/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Failed to import subjects");
        return;
      }

      setResult(data);

      if (data.total > 0) {
        onSuccess(); // refresh the subjects list
      }

      if (data.skipped_count === 0) {
        toast.success(data.message);
      } else if (data.total > 0) {
        toast.warning(`${data.total} imported, ${data.skipped_count} skipped — see details below`);
      } else {
        toast.error(`All rows were skipped — see details below`);
      }

    } catch {
      toast.error("Network error. Failed to import subjects.");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) onClose();
  };

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Subjects</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file to import subjects. Invalid departments
            and oversized codes will be skipped and reported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Template download */}
          <div className="border rounded-lg p-4 bg-muted/50">
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-sm mb-0.5">Download Template</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Gets the latest departments from the system pre-filled in the
                  template so you can't enter an invalid one.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  disabled={downloadingTemplate}
                >
                  <Download className="h-3 w-3 mr-2" />
                  {downloadingTemplate ? "Downloading..." : "Download Template"}
                </Button>
              </div>
            </div>
          </div>

          {/* File picker */}
          <div className="space-y-2">
            <label htmlFor="file-upload" className="block text-sm font-medium">
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
                disabled={uploading}
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
                  onClick={() => { setFile(null); setResult(null); }}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Requirements */}
          <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
            <p className="font-medium">File Requirements:</p>
             <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Format: .xlsx, .xls, or .csv</li>
              <li>Required columns: Subject Name, Subject Code, Department</li>
              <li>Optional columns: Credit Hours, Description, Classification, Lesson Type, Sessions Per Week</li>
              <li>Classification: <span className="font-medium">basic</span>, <span className="font-medium">common</span>, or <span className="font-medium">core</span> (default: core)</li>
              <li>Lesson Type: <span className="font-medium">single</span>, <span className="font-medium">double</span>, or <span className="font-medium">triple</span> (default: single)</li>
              <li>Sessions Per Week: a number between 1 and 4 (default: 1)</li>
              <li>Subject Code must be 20 characters or less</li>
              <li>Department must exactly match one from the system</li>
              <li>First row must be column headers</li>
            </ul>
          </div>

          {/* ── Results panel ─────────────────────────────────────────────────── */}
          {result && (
            <div className="border rounded-lg overflow-hidden">

              {/* Summary */}
              <div className="p-3 bg-muted/40 flex flex-wrap gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {result.imported} new
                </span>
                <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {result.updated} updated
                </span>
                {result.skipped_count > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                    <SkipForward className="w-4 h-4" />
                    {result.skipped_count} skipped
                  </span>
                )}
              </div>

              {/* Skipped rows detail */}
              {result.skipped && result.skipped.length > 0 && (
                <div className="border-t">
                  <div className="px-3 py-2 flex items-center gap-2 bg-amber-50 dark:bg-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      Skipped rows — fix and re-import if needed
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y">
                    {result.skipped.map((s, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge variant="outline" className="text-xs h-5 px-1.5">
                            Row {s.row}
                          </Badge>
                          <span className="font-medium truncate">{s.name}</span>
                          {s.code !== '—' && (
                            <span className="text-muted-foreground shrink-0">{s.code}</span>
                          )}
                        </div>
                        <p className="text-muted-foreground pl-1">{s.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || uploading}
          >
            {uploading ? "Importing..." : "Import Subjects"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}