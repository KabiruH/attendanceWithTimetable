// components/lesson-periods/LessonPeriodsTable.tsx
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
import { Edit, Trash2, Power, Clock, Calendar } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

interface LessonPeriod {
  id: number;
  name: string;
  start_time: Date;
  end_time: Date;
  duration: number;
  is_active: boolean;
  created_at: Date;
  start_time_formatted?: string;
  end_time_formatted?: string;
  _count?: {
    timetableSlots: number;
  };
}

interface LessonPeriodsTableProps {
  lessonPeriods: LessonPeriod[];
  onEdit: (period: LessonPeriod) => void;
  onDelete: (period: LessonPeriod) => void;
  onToggleActive: (period: LessonPeriod) => void;
}

export default function LessonPeriodsTable({
  lessonPeriods,
  onEdit,
  onDelete,
  onToggleActive,
}: LessonPeriodsTableProps) {
  const formatTime = (time: Date | string) => {
    if (typeof time === 'string') return time;
    return new Date(time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) {
      return `${hours}h ${mins}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${mins}m`;
    }
  };

  if (lessonPeriods.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center">
        <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-500 mb-2">No lesson periods found.</p>
        <p className="text-sm text-gray-400">
          Create your first lesson period to define the time structure of your school day.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period Name</TableHead>
            <TableHead>Start Time</TableHead>
            <TableHead>End Time</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lessonPeriods.map((period) => (
            <TableRow key={period.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  {period.name}
                </div>
              </TableCell>
              <TableCell>
                <span className="font-mono text-sm">
                  {period.start_time_formatted || formatTime(period.start_time)}
                </span>
              </TableCell>
              <TableCell>
                <span className="font-mono text-sm">
                  {period.end_time_formatted || formatTime(period.end_time)}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono">
                  {formatDuration(period.duration)}
                </Badge>
              </TableCell>
              <TableCell>
                {period.is_active ? (
                  <Badge className="bg-green-500">Active</Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Calendar className="h-3 w-3" />
                  <span>{period._count?.timetableSlots || 0} slots</span>
                </div>
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
                    <DropdownMenuItem onClick={() => onEdit(period)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleActive(period)}>
                      <Power className="mr-2 h-4 w-4" />
                      {period.is_active ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(period)}
                      className="text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}