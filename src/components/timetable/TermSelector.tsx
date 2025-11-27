// components/timetable/TermSelector.tsx
'use client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface TermSelectorProps {
  terms: Term[];
  selectedTerm: number | null;
  onTermChange: (termId: number) => void;
}

export default function TermSelector({
  terms,
  selectedTerm,
  onTermChange,
}: TermSelectorProps) {
  return (
    <div className="flex-1">
      <Label>Term</Label>
      <Select
        value={selectedTerm?.toString()}
        onValueChange={(value) => onTermChange(parseInt(value))}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select term" />
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
  );
}