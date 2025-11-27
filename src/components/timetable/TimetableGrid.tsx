// components/timetable/TimetableGrid.tsx
'use client';
import { useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, MapPin, User, ChevronDown, ChevronUp, GripVertical, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TimetableSlot } from '@/lib/types/timetable';

interface TimetableGridProps {
  slots: TimetableSlot[];
  currentWeek: {
    start: Date;
    end: Date;
    weekNumber: number;
  };
  onSlotMove?: (slotId: string, newDayOfWeek: number, newPeriodId: number) => void;
  onSlotClick: (slot: TimetableSlot) => void;
  isAdmin: boolean;
  userId: number;
}

export default function TimetableGrid({
  slots,
  currentWeek,
  onSlotMove,
  onSlotClick,
  isAdmin,
  userId
}: TimetableGridProps) {
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [draggedSlot, setDraggedSlot] = useState<TimetableSlot | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

const daysOfWeek: Array<{ name: string; value: number }> = [
  { name: 'Monday', value: 1 },
  { name: 'Tuesday', value: 2 },
  { name: 'Wednesday', value: 3 },
  { name: 'Thursday', value: 4 },
  { name: 'Friday', value: 5 }
];
  // Get unique lesson periods from slots
  const lessonPeriods = slots.length > 0
    ? Array.from(
      new Map(
        slots
          .filter(slot => slot.lessonperiods)
          .map(slot => [
            slot.lesson_period_id,
            slot.lessonperiods
          ])
      ).values()
    ).sort((a, b) => {
      const timeA = new Date(a.start_time).getTime();
      const timeB = new Date(b.start_time).getTime();
      return timeA - timeB;
    })
    : [];

  // Group slots by day and period
  const slotsByDayAndPeriod = new Map<string, TimetableSlot[]>();
  slots.forEach(slot => {
    const key = `${slot.day_of_week}-${slot.lesson_period_id}`;
    const existing = slotsByDayAndPeriod.get(key) || [];
    slotsByDayAndPeriod.set(key, [...existing, slot]);
  });

  // Format time
  const formatTime = (time: Date) => {
    return new Date(time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Get slots for specific day and period
const getSlots = (dayOfWeekValue: number, periodId: number): TimetableSlot[] => {
  const key = `${dayOfWeekValue}-${periodId}`;
  return slotsByDayAndPeriod.get(key) || [];
};

  // Check if cell is expanded
const isCellExpanded = (dayOfWeekValue: number, periodId: number): boolean => {
  const key = `${dayOfWeekValue}-${periodId}`;
  return expandedCells.has(key);
};

  // Toggle cell expansion
  const toggleCellExpansion = (dayOfWeekValue: number, periodId: number) => {
  const key = `${dayOfWeekValue}-${periodId}`;
  const newExpanded = new Set(expandedCells);
  if (newExpanded.has(key)) {
    newExpanded.delete(key);
  } else {
    newExpanded.add(key);
  }
  setExpandedCells(newExpanded);
};

  // Check if individual slot is expanded
  const isSlotExpanded = (slotId: string): boolean => {
    return expandedSlots.has(slotId);
  };

  // Toggle individual slot expansion
  const toggleSlotExpansion = (slotId: string) => {
    const newExpanded = new Set(expandedSlots);
    if (newExpanded.has(slotId)) {
      newExpanded.delete(slotId);
    } else {
      newExpanded.add(slotId);
    }
    setExpandedSlots(newExpanded);
  };

  // Check if slot belongs to current user
  const isOwnSlot = (slot: TimetableSlot): boolean => {
    return slot.employee_id === userId;
  };

  // Get card styling based on ownership
  const getCardStyle = (slot: TimetableSlot, isStacked: boolean = false) => {
    const isOwn = isOwnSlot(slot);
    const baseTransition = "transition-all duration-200";

    if (isOwn && isAdmin) {
      return {
        className: `bg-gradient-to-br from-purple-100 via-violet-100 to-indigo-100 border-2 border-purple-500 hover:shadow-lg ${baseTransition}`,
        badgeClassName: "bg-purple-600"
      };
    } else if (isOwn) {
      return {
        className: `bg-gradient-to-br from-green-100 to-emerald-100 border-2 border-green-500 hover:shadow-lg ${baseTransition}`,
        badgeClassName: "bg-green-600"
      };
    } else {
      return {
        className: `bg-white border hover:bg-gray-50 hover:shadow-md ${baseTransition}`,
        badgeClassName: "bg-gray-500"
      };
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, slot: TimetableSlot) => {
    if (!isAdmin) return;
    setDraggedSlot(slot);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('opacity-50');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-50');
    setDraggedSlot(null);
    setDragOverCell(null);
  };

  const handleDragOver = (e: React.DragEvent, day: number, periodId: number) => {
    if (!isAdmin || !draggedSlot) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell(`${day}-${periodId}`);
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = (e: React.DragEvent, day: number, periodId: number) => {
    e.preventDefault();
    if (!isAdmin || !draggedSlot || !onSlotMove) return;

    if (draggedSlot.day_of_week === day && draggedSlot.lesson_period_id === periodId) {
      setDragOverCell(null);
      return;
    }

    onSlotMove(draggedSlot.id, day, periodId);
    setDragOverCell(null);
  };

  // Render a single slot card with compressed/expanded view
  const renderSlotCard = (slot: TimetableSlot, isStacked: boolean = false, isInCollapsible: boolean = false) => {
    const cardStyle = getCardStyle(slot, isStacked);
    const isExpanded = isSlotExpanded(slot.id);

    return (
      <Card
        key={slot.id}
        className={`${cardStyle.className} ${draggedSlot?.id === slot.id ? 'opacity-50' : ''} ${isAdmin ? 'cursor-move' : ''
          }`}
        draggable={isAdmin}
        onDragStart={(e) => handleDragStart(e, slot)}
        onDragEnd={handleDragEnd}
      >
        <CardContent className="p-2 space-y-2">
          {/* Drag Handle & Own Badge - Always visible */}
          {isAdmin && (
            <div className="flex items-center justify-between">
              <GripVertical className="h-4 w-4 text-gray-400" />
              {isOwnSlot(slot) && (
                <Badge className="text-[10px] px-1 py-0 h-4 bg-purple-500">
                  You
                </Badge>
              )}
            </div>
          )}

          {/* COMPRESSED VIEW - Always visible */}
          <div className="space-y-1">
            {/* Subject Code - Bold and prominent */}
            <div className="font-bold text-sm text-gray-900">
              {slot.subjects.code}
            </div>

            {/* Room */}
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span>{slot.rooms.name}</span>
            </div>

            {/* Status Badge - if not scheduled */}
            {slot.status !== 'scheduled' && (
              <Badge className={`text-[10px] px-1 py-0 flex-shrink-0 ${getStatusColor(slot.status)}`}>
                {slot.status}
              </Badge>
            )}
          </div>

          {/* EXPANDED VIEW - Shows when toggled */}
          {isExpanded && (
            <div className="pt-2 border-t border-gray-300 space-y-2">
              {/* Subject Name */}
              <div className="text-xs font-medium text-gray-700 line-clamp-2 leading-tight">
                {slot.subjects.name}
              </div>

              {/* Class Info */}
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                  {slot.classes.code}
                </Badge>
                <span className="text-[10px] text-gray-600 line-clamp-1">
                  {slot.classes.name}
                </span>
              </div>

              {/* Trainer */}
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="line-clamp-1">{slot.users.name}</span>
              </div>

              {/* Department */}
              <div className="flex items-center justify-between gap-1">
                <Badge variant="outline" className="text-[10px] px-1 py-0 line-clamp-1">
                  {slot.subjects.department}
                </Badge>
              </div>

              {/* Credit Hours */}
              {slot.subjects.credit_hours && (
                <div className="text-[10px] text-gray-500">
                  {slot.subjects.credit_hours}h
                </div>
              )}
            </div>
          )}

          {/* More/Less Button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-xs hover:bg-white/50"
            onClick={(e) => {
              e.stopPropagation();
              toggleSlotExpansion(slot.id);
            }}
          >
            {isExpanded ? (
              <>
                Less <ChevronUp className="h-3 w-3 ml-1" />
              </>
            ) : (
              <>
                More <ChevronDown className="h-3 w-3 ml-1" />
              </>
            )}
          </Button>

          {/* View Full Details Button - Always available */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-6 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onSlotClick(slot);
            }}
          >
            <BookOpen className="h-3 w-3 mr-1" />
            Full Details
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (lessonPeriods.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-gray-500">No timetable slots found for this week.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border text-sm flex-wrap no-print">
        <span className="font-semibold text-gray-700">Legend:</span>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-100 to-indigo-100 border-2 border-purple-500"></div>
            <span className="text-gray-600">Your Subjects</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-white border"></div>
          <span className="text-gray-600">Other Subjects</span>
        </div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-600" />
          <span className="text-gray-600">Subject-based Schedule</span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 ml-auto">
            <GripVertical className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600 text-xs italic">Drag cards to reschedule</span>
          </div>
        )}
      </div>

      {/* Timetable Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <div className="grid grid-cols-[150px_repeat(5,minmax(200px,1fr))] gap-2">
            {/* Header Row - Days */}
            <div className="bg-gray-100 p-3 rounded-lg font-semibold text-center sticky left-0 z-10">
              Time / Day
            </div>

     {daysOfWeek.map((day) => (
  <div
    key={day.value}
    className="bg-gray-100 p-3 rounded-lg font-semibold text-center"
  >
    <div>{day.name}</div>
    <div className="text-xs text-gray-500 font-normal mt-1">
      {new Date(currentWeek.start.getTime() + day.value * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })}
    </div>
  </div>
))}

            {/* Time Rows */}
            {lessonPeriods.map((period) => (
              <div key={period.id} className="contents">
                {/* Period Time Label */}
                <div className="bg-gray-50 p-3 rounded-lg border flex flex-col justify-center sticky left-0 z-10">
                  <div className="font-semibold text-sm">{period.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(period.start_time)} - {formatTime(period.end_time)}
                  </div>
                </div>

                {/* Slots for each day */}
            {daysOfWeek.map((day) => {
  const slotsInCell = getSlots(day.value, period.id);
  const isExpanded = isCellExpanded(day.value, period.id);
  const hasMultipleSlots = slotsInCell.length > 1;
  const cellKey = `${day.value}-${period.id}`;
  const isDraggedOver = dragOverCell === cellKey;

  return (
    <div 
      key={cellKey} 
      className={`min-h-[120px] rounded-lg transition-all ${
        isDraggedOver ? 'bg-blue-100 border-2 border-blue-400 border-dashed' : ''
      }`}
      onDragOver={(e) => handleDragOver(e, day.value, period.id)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, day.value, period.id)}
    >
      {slotsInCell.length > 0 ? (
        hasMultipleSlots ? (
                          // Multiple slots - Show collapsible
                          <Collapsible
                            open={isExpanded}
                            onOpenChange={() => toggleCellExpansion(day.value, period.id)}
                          >
                            <div className="space-y-2">
                              {/* First slot - always visible */}
                              {renderSlotCard(slotsInCell[0], true)}

                              {/* Expand/Collapse Button */}
                              <CollapsibleTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-xs h-7"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="h-3 w-3 mr-1" />
                                      Hide {slotsInCell.length - 1} more
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="h-3 w-3 mr-1" />
                                      Show {slotsInCell.length - 1} more
                                    </>
                                  )}
                                </Button>
                              </CollapsibleTrigger>

                              {/* Additional slots - collapsible */}
                              <CollapsibleContent className="space-y-2">
                                {slotsInCell.slice(1).map(slot => renderSlotCard(slot, true, true))}
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        ) : (
                          // Single slot
                          renderSlotCard(slotsInCell[0])
                        )
                      ) : (
                        <div
                          className={`border-2 border-dashed rounded-lg h-full min-h-[120px] flex items-center justify-center text-gray-400 text-xs transition-all ${isDraggedOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                            }`}
                        >
                          {isDraggedOver ? 'Drop here' : 'Free'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}