// components/timetable/PrintableTimetable.tsx
'use client';
import { TimetableSlot } from '@/lib/types/timetable';
import { Clock, MapPin } from "lucide-react";

interface PrintableTimetableProps {
  slots: TimetableSlot[];
  currentWeek: {
    start: Date;
    end: Date;
    weekNumber: number;
  };
  termName?: string;
  groupBy: 'class' | 'trainer' | 'department';
}

export default function PrintableTimetable({
  slots,
  currentWeek,
  termName,
  groupBy = 'class'
}: PrintableTimetableProps) {
  // Only weekdays - but we need to map to correct day_of_week values
  // Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5
  const daysOfWeek = [
    { name: 'Monday', value: 1 },
    { name: 'Tuesday', value: 2 },
    { name: 'Wednesday', value: 3 },
    { name: 'Thursday', value: 4 },
    { name: 'Friday', value: 5 }
  ];

  // Get unique lesson periods
  const lessonPeriods = slots.length > 0
    ? Array.from(
        new Map(
          slots
            .filter(slot => slot.lessonperiods)
            .map(slot => [slot.lesson_period_id, slot.lessonperiods])
        ).values()
      ).sort((a, b) => {
        const timeA = new Date(a.start_time).getTime();
        const timeB = new Date(b.start_time).getTime();
        return timeA - timeB;
      })
    : [];

  // Format time
  const formatTime = (time: Date) => {
    return new Date(time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Group slots by class, trainer, or department
  const groupedSlots = new Map<string, { name: string; code: string; slots: TimetableSlot[] }>();
  
  slots.forEach(slot => {
    let key: string;
    let name: string;
    let code: string;

    if (groupBy === 'class') {
      key = slot.class_id.toString();
      name = slot.classes.name;
      code = slot.classes.code;
    } else if (groupBy === 'trainer') {
      key = slot.employee_id.toString();
      name = slot.users.name;
      code = `T-${slot.employee_id}`;
    } else { // department
      key = slot.subjects?.department || 'Unknown';
      name = slot.subjects?.department || 'Unknown Department';
      code = slot.subjects?.department || 'UNKNOWN';
    }

    if (!groupedSlots.has(key)) {
      groupedSlots.set(key, { name, code, slots: [] });
    }
    groupedSlots.get(key)!.slots.push(slot);
  });

  // Get ALL slots for specific day and period within a group (returns array)
  const getSlotsForCell = (groupSlots: TimetableSlot[], dayOfWeekValue: number, periodId: number): TimetableSlot[] => {
    return groupSlots.filter(
      slot => slot.day_of_week === dayOfWeekValue && slot.lesson_period_id === periodId
    );
  };

  // Get title based on groupBy
  const getTitle = () => {
    switch (groupBy) {
      case 'class':
        return 'Class Timetable';
      case 'trainer':
        return 'Trainer Schedule';
      case 'department':
        return 'Department Timetable';
      default:
        return 'Timetable';
    }
  };

  return (
    <div className="print-container">
      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-container,
          .print-container * {
            visibility: visible;
          }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 landscape;
            margin: 0.5cm;
          }
          .timetable-page {
            width: 100%;
            page-break-inside: avoid;
          }
          
          /* Enhanced table borders for print */
          .print-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 11px;
          }
          .print-table th,
          .print-table td {
            border: 1.5px solid #000 !important;
            padding: 4px !important;
          }
          .print-table th {
            background-color: #e5e7eb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-size: 12px;
          }
          .print-table .time-cell {
            background-color: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-size: 10px;
          }
          .print-table .empty-cell {
            background-color: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .slot-separator {
            border-top: 1px dashed #999 !important;
            margin: 4px 0 !important;
            padding-top: 4px !important;
          }
        }
        
        @media screen {
          .print-container {
            max-width: 100%;
            overflow-x: auto;
          }
        }
      `}</style>

      {/* Print each group on separate page */}
      {Array.from(groupedSlots.entries()).map(([key, group], index) => (
        <div key={key} className={`timetable-page ${index < groupedSlots.size - 1 ? 'page-break' : ''} mb-8`}>
          {/* Header - Compressed */}
          <div className="mb-2 border-b-2 border-gray-800 pb-2">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {getTitle()}
                </h1>
                <p className="text-base font-semibold text-gray-700">
                  {groupBy === 'department' ? group.name : `${group.code} - ${group.name}`}
                </p>
              </div>
              <div className="text-right text-xs">
                {termName && <p className="font-semibold">{termName}</p>}
                <p className="text-gray-600">
                  Week {currentWeek.weekNumber} ({currentWeek.start.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric'
                  })} - {currentWeek.end.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })})
                </p>
              </div>
            </div>
          </div>

          {/* Timetable Grid */}
          <table className="print-table w-full border-collapse border-2 border-black">
            <thead>
              <tr>
                <th className="border-2 border-black bg-gray-200 p-2 font-bold text-center" style={{ width: '10%' }}>
                  Time
                </th>
                {daysOfWeek.map((day) => {
                  const dayOffset = day.value;
                  return (
                    <th key={day.value} className="border-2 border-black bg-gray-200 p-2 font-bold text-center" style={{ width: '18%' }}>
                      <div className="text-sm">{day.name}</div>
                      <div className="text-xs font-normal text-gray-600">
                        {new Date(currentWeek.start.getTime() + dayOffset * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lessonPeriods.map((period) => (
                <tr key={period.id}>
                  {/* Time Column - Compressed */}
                  <td className="time-cell border-2 border-black bg-gray-50 p-2 text-center align-top">
                    <div className="font-bold text-xs">{period.name}</div>
                    <div className="text-xs text-gray-600 flex items-center justify-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatTime(period.start_time)}</span>
                    </div>
                    <div className="text-xs text-gray-600">
                      {formatTime(period.end_time)}
                    </div>
                  </td>

                  {/* Day Columns */}
                  {daysOfWeek.map((day) => {
                    const cellSlots = getSlotsForCell(group.slots, day.value, period.id);
                    
                    return (
                      <td
                        key={day.value}
                        className={`border-2 border-black p-2 align-top ${
                          cellSlots.length > 0 ? 'bg-white' : 'empty-cell bg-gray-50'
                        }`}
                      >
                        {cellSlots.length > 0 ? (
                          <div className="space-y-1">
                            {cellSlots.map((slot, slotIndex) => (
                              <div 
                                key={slot.id}
                                className={slotIndex > 0 ? 'slot-separator' : ''}
                              >
                                {groupBy === 'department' ? (
                                  // SIMPLIFIED VIEW FOR DEPARTMENT - Only Subject Code and Venue
                                  <>
                                    {/* Subject Code (Bold) */}
                                    <div className="font-bold text-xs text-gray-900">
                                      {slot.subjects.code}
                                    </div>

                                    {/* Room/Venue */}
                                    <div className="flex items-center gap-1 text-xs text-gray-700 mt-1">
                                      <MapPin className="h-3 w-3 flex-shrink-0" />
                                      <span>{slot.rooms.name}</span>
                                    </div>
                                  </>
                                ) : (
                                  // DETAILED VIEW FOR CLASS AND TRAINER
                                  <>
                                    {/* Subject Code (Bold) */}
                                    <div className="font-bold text-xs text-gray-900">
                                      {slot.subjects.code}
                                    </div>

                                    {/* Trainer info - show for class grouping */}
                                    {groupBy === 'class' && (
                                      <div className="text-xs text-gray-600">
                                        {slot.users.name}
                                      </div>
                                    )}

                                    {/* Class info - show for trainer grouping */}
                                    {groupBy === 'trainer' && (
                                      <div className="text-xs text-gray-600">
                                        {slot.classes.code}
                                      </div>
                                    )}

                                    {/* Room */}
                                    <div className="flex items-center gap-1 text-xs text-gray-700 mt-1">
                                      <MapPin className="h-3 w-3 flex-shrink-0" />
                                      <span>{slot.rooms.name}</span>
                                    </div>

                                    {/* Status Badge - if not scheduled */}
                                    {slot.status !== 'scheduled' && (
                                      <div className={`text-xs font-bold px-1 py-0.5 rounded inline-block mt-1 ${
                                        slot.status === 'cancelled' ? 'bg-red-200 text-red-900' :
                                        slot.status === 'completed' ? 'bg-green-200 text-green-900' :
                                        'bg-gray-200 text-gray-900'
                                      }`} style={{
                                        WebkitPrintColorAdjust: 'exact',
                                        printColorAdjust: 'exact'
                                      }}>
                                        {slot.status.toUpperCase()}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            ))}
                            
                            {/* Multiple subjects indicator */}
                            {cellSlots.length > 1 && (
                              <div className="text-xs font-semibold text-blue-700 mt-1">
                                ({cellSlots.length} subjects)
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 text-center py-2">
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer - Compressed */}
          <div className="mt-2 text-xs text-gray-600 flex justify-between items-center border-t border-gray-400 pt-1">
            <div>
              Page {index + 1} of {groupedSlots.size}
            </div>
            <div>
              Generated: {new Date().toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}