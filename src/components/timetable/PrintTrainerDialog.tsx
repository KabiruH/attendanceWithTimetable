'use client';
import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { User, Search, X } from "lucide-react";

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
  const [query, setQuery]             = useState('');
  const [selected, setSelected]       = useState<Trainer | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim().length > 0
    ? trainers.filter(t =>
        t.name.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(null);
      setShowDropdown(false);
    }
  }, [open]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const handleSelect = (trainer: Trainer) => {
    setSelected(trainer);
    setQuery(trainer.name);
    setShowDropdown(false);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelected(null);        // clear selection if user edits
    setShowDropdown(true);
  };

  const handlePrint = () => {
    if (selected) {
      onPrint(selected.id);
      onOpenChange(false);
    }
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
            Start typing a trainer's name to search and select them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="trainer-search">Trainer Name</Label>

            {/* Search input + dropdown wrapper */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                ref={inputRef}
                id="trainer-search"
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                onFocus={() => query.trim().length > 0 && setShowDropdown(true)}
                placeholder="e.g. Doris, Gladys…"
                className="pl-9 pr-8"
                autoComplete="off"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Dropdown results */}
              {showDropdown && filtered.length > 0 && (
                <ul className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-md max-h-52 overflow-y-auto">
                  {filtered.map(trainer => (
                    <li key={trainer.id}>
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                        onMouseDown={e => e.preventDefault()} // keep input focused
                        onClick={() => handleSelect(trainer)}
                      >
                        <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        {trainer.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* No results */}
              {showDropdown && query.trim().length > 0 && filtered.length === 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-md px-3 py-3 text-sm text-gray-400 text-center">
                  No trainers found for "{query}"
                </div>
              )}
            </div>

            {/* Selected confirmation */}
            {selected && (
              <p className="text-xs text-green-600 font-medium flex items-center gap-1 pl-1">
                <User className="h-3 w-3" />
                {selected.name} selected
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handlePrint} disabled={!selected}>
              <User className="mr-2 h-4 w-4" />
              Print Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}