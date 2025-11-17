// components/admin/class-subjects/SubjectsHeader.tsx
import { ArrowLeft, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SubjectsHeaderProps {
  classData: {
    id: number;
    name: string;
    code: string;
    department: string;
  } | null;
  assignedCount: number;
  onBack: () => void;
  onImport: () => void;
  onAddSubject: () => void;
}

export default function SubjectsHeader({
  classData,
  assignedCount,
  onBack,
  onImport,
  onAddSubject,
}: SubjectsHeaderProps) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Classes
      </Button>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{classData?.name || "Loading..."}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="font-medium">{classData?.code}</span>
                <span>•</span>
                <span>{classData?.department}</span>
                <span>•</span>
                <span className="font-semibold text-primary">
                  {assignedCount} {assignedCount === 1 ? "Subject" : "Subjects"} Assigned
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onImport}>
                <Upload className="mr-2 h-4 w-4" />
                Import Excel
              </Button>
              <Button onClick={onAddSubject}>
                <Plus className="mr-2 h-4 w-4" />
                Add Subject
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}