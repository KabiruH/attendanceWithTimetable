// components/admin/class-subjects/SubjectCard.tsx
import { Plus, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface Subject {
  id: number;
  name: string;
  code: string;
  department: string;
  credit_hours: number | null;
  description: string | null;
}

interface SubjectCardProps {
  subject: Subject;
  action: "add" | "remove";
  onAction: () => void;
  isActive?: boolean;
  termName?: string;
}

export default function SubjectCard({
  subject,
  action,
  onAction,
  isActive,
  termName,
}: SubjectCardProps) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm truncate">{subject.name}</h3>
            {isActive && (
              <Badge variant="default" className="text-xs">
                Active
              </Badge>
            )}
            {!isActive && termName === undefined && action === "remove" && (
              <Badge variant="outline" className="text-xs">
                Not Activated
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {subject.code} • {subject.department}
          </p>
          {subject.credit_hours && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{subject.credit_hours} credit hours</span>
            </div>
          )}
          {termName && (
            <Badge variant="secondary" className="mt-2 text-xs">
              {termName}
            </Badge>
          )}
          {subject.description && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {subject.description}
            </p>
          )}
        </div>

        <Button
          size="sm"
          variant={action === "add" ? "default" : "destructive"}
          onClick={onAction}
        >
          {action === "add" ? (
            <>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </>
          ) : (
            <>
              <X className="h-4 w-4 mr-1" />
              Remove
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}