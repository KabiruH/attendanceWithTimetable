// components/terms/TermsTable.tsx
'use client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Book, Power, Eye } from "lucide-react"; // Added Eye icon
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

interface Term {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  working_days: number[];
  holidays: string[];
  created_at: string;
  updated_at: string;
  _count?: {
    timetableSlots: number;
  };
}

interface TermsTableProps {
  terms: Term[];
  onEdit: (term: Term) => void;
  onDelete: (term: Term) => void;
  onToggleActive: (term: Term) => void;
  onAssignClasses: (term: Term) => void;
  onViewClasses: (term: Term) => void; // New prop
}

export default function TermsTable({
  terms,
  onEdit,
  onDelete,
  onToggleActive,
  onAssignClasses,
  onViewClasses, // New prop
}: TermsTableProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysOfWeekLabel = (days: number[]) => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map(d => dayNames[d]).join(', ');
  };

  const getTermStatus = (term: Term) => {
    const now = new Date();
    const start = new Date(term.start_date);
    const end = new Date(term.end_date);

    if (!term.is_active) return 'inactive';
    if (now < start) return 'upcoming';
    if (now > end) return 'ended';
    return 'active';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">Active</Badge>;
      case 'upcoming':
        return <Badge className="bg-blue-500">Upcoming</Badge>;
      case 'ended':
        return <Badge variant="secondary">Ended</Badge>;
      case 'inactive':
        return <Badge variant="outline">Inactive</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (terms.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center">
        <p className="text-gray-500">No terms found. Create your first term to get started.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Term Name</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Working Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Timetable Slots</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {terms.map((term) => {
            const status = getTermStatus(term);
            return (
              <TableRow key={term.id}>
                <TableCell className="font-medium">{term.name}</TableCell>
                <TableCell>{formatDate(term.start_date)}</TableCell>
                <TableCell>{formatDate(term.end_date)}</TableCell>
                <TableCell className="text-sm text-gray-600">
                  {getDaysOfWeekLabel(term.working_days)}
                </TableCell>
                <TableCell>{getStatusBadge(status)}</TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">
                    {term._count?.timetableSlots || 0} slots
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => onViewClasses(term)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Classes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onAssignClasses(term)}>
                        <Book className="mr-2 h-4 w-4" />
                        Assign Classes
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onEdit(term)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onToggleActive(term)}>
                        <Power className="mr-2 h-4 w-4" />
                        {term.is_active ? 'Deactivate' : 'Activate'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(term)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}