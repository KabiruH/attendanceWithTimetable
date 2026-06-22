'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DoorOpen, Search, Building } from "lucide-react";

interface Room {
  id: number;
  name: string;
  room_type?: string;
}

interface PrintRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Room[];
  /** Called with null = print all rooms, number = print specific room_id */
  onPrint: (roomId: number | null) => void;
}

export default function PrintRoomDialog({
  open,
  onOpenChange,
  rooms,
  onPrint,
}: PrintRoomDialogProps) {
  const [mode, setMode]           = useState<'all' | 'specific'>('all');
  const [search, setSearch]       = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const filtered = rooms.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.room_type?.toLowerCase().includes(search.toLowerCase())
  );

  const handleReset = () => {
    setMode('all');
    setSearch('');
    setSelectedRoom(null);
  };

  const handlePrint = () => {
    onPrint(mode === 'specific' && selectedRoom ? selectedRoom.id : null);
    handleReset();
    onOpenChange(false);
  };

  const isValid = mode === 'all' || (mode === 'specific' && !!selectedRoom);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleReset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DoorOpen className="h-5 w-5" />
            Print Room Occupancy
          </DialogTitle>
          <DialogDescription>
            Print a room occupancy timetable showing how each room is used throughout the week.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">

          {/* ── Mode selection ─────────────────────────────────────────── */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Print Scope</Label>
            <RadioGroup
              value={mode}
              onValueChange={v => {
                setMode(v as 'all' | 'specific');
                setSelectedRoom(null);
                setSearch('');
              }}
            >
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="all" id="r-all" />
                <Label htmlFor="r-all" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Building className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="font-medium">All Rooms</div>
                    <div className="text-xs text-gray-600">
                      One page per room — {rooms.length} room{rooms.length !== 1 ? 's' : ''} total
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <RadioGroupItem value="specific" id="r-specific" />
                <Label htmlFor="r-specific" className="flex items-center gap-2 cursor-pointer flex-1">
                  <DoorOpen className="h-4 w-4 text-purple-600" />
                  <div>
                    <div className="font-medium">Specific Room</div>
                    <div className="text-xs text-gray-600">Search and select one room to print</div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* ── Room search — only when specific mode ─────────────────── */}
          {mode === 'specific' && (
            <div className="space-y-2">
              <Label>Select Room *</Label>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name or type…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>

              {/* Room list */}
              <div className="border rounded-lg divide-y max-h-[260px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    No rooms found matching &quot;{search}&quot;
                  </div>
                ) : (
                  filtered.map(room => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setSelectedRoom(room)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50
                        ${selectedRoom?.id === room.id ? 'bg-purple-50 border-l-2 border-purple-500' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <DoorOpen className={`h-4 w-4 shrink-0 ${selectedRoom?.id === room.id ? 'text-purple-600' : 'text-gray-400'}`} />
                        <span className={`font-medium ${selectedRoom?.id === room.id ? 'text-purple-900' : 'text-gray-800'}`}>
                          {room.name}
                        </span>
                      </div>
                      {room.room_type && (
                        <span className="text-xs text-gray-400 capitalize">{room.room_type}</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Selected confirmation */}
              {selectedRoom && (
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm">
                  <DoorOpen className="h-4 w-4 text-purple-600 shrink-0" />
                  <span className="text-purple-900 font-medium">Selected: {selectedRoom.name}</span>
                  {selectedRoom.room_type && (
                    <span className="text-purple-600 text-xs ml-1">({selectedRoom.room_type})</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { handleReset(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button onClick={handlePrint} disabled={!isValid}>
            <DoorOpen className="mr-2 h-4 w-4" />
            {mode === 'all'
              ? `Print All ${rooms.length} Room${rooms.length !== 1 ? 's' : ''}`
              : `Print — ${selectedRoom?.name ?? 'Select a room'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}