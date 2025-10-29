// components/rooms/RoomsTable.tsx
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
import { Edit, Trash2, Power, Users, Wrench } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

interface Room {
  id: number;
  name: string;
  capacity: number | null;
  room_type: string | null;
  equipment: string[] | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  _count?: {
    timetableSlots: number;
  };
}

interface RoomsTableProps {
  rooms: Room[];
  onEdit: (room: Room) => void;
  onDelete: (room: Room) => void;
  onToggleActive: (room: Room) => void;
}

export default function RoomsTable({
  rooms,
  onEdit,
  onDelete,
  onToggleActive,
}: RoomsTableProps) {
  const getRoomTypeIcon = (type: string | null) => {
    switch (type) {
      case 'lab':
        return '🔬';
      case 'classroom':
        return '📚';
      case 'workshop':
        return '🔧';
      case 'lecture_hall':
        return '🎓';
      case 'computer_lab':
        return '💻';
      default:
        return '🏫';
    }
  };

  const getRoomTypeBadge = (type: string | null) => {
    if (!type) return <Badge variant="outline">N/A</Badge>;
    
    const colors: Record<string, string> = {
      'classroom': 'bg-blue-100 text-blue-800',
      'lab': 'bg-purple-100 text-purple-800',
      'workshop': 'bg-orange-100 text-orange-800',
      'lecture_hall': 'bg-green-100 text-green-800',
      'computer_lab': 'bg-cyan-100 text-cyan-800',
    };

    return (
      <Badge className={colors[type] || 'bg-gray-100 text-gray-800'}>
        {getRoomTypeIcon(type)} {type.replace('_', ' ')}
      </Badge>
    );
  };

  if (rooms.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center">
        <p className="text-gray-500">No rooms found. Add your first room to get started.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Room Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Capacity</TableHead>
            <TableHead>Equipment</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rooms.map((room) => (
            <TableRow key={room.id}>
              <TableCell className="font-medium">{room.name}</TableCell>
              <TableCell>{getRoomTypeBadge(room.room_type)}</TableCell>
              <TableCell>
                {room.capacity ? (
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-gray-500" />
                    <span>{room.capacity}</span>
                  </div>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell>
                {room.equipment && room.equipment.length > 0 ? (
                  <div className="flex items-center gap-1">
                    <Wrench className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">{room.equipment.length} items</span>
                  </div>
                ) : (
                  <span className="text-gray-400">None</span>
                )}
              </TableCell>
              <TableCell>
                {room.department ? (
                  <Badge variant="outline">{room.department}</Badge>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell>
                {room.is_active ? (
                  <Badge className="bg-green-500">Active</Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm text-gray-600">
                  {room._count?.timetableSlots || 0} classes
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
                    <DropdownMenuItem onClick={() => onEdit(room)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleActive(room)}>
                      <Power className="mr-2 h-4 w-4" />
                      {room.is_active ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(room)}
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