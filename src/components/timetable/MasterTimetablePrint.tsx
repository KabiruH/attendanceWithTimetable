// components/timetable/MasterTimetablePrint.tsx
'use client';
import { TimetableSlot } from '@/lib/types/timetable';
import { Clock, MapPin } from "lucide-react";

interface MasterTimetablePrintProps {
  slots: TimetableSlot[];
  currentWeek: {
    start: Date;
    end: Date;
    weekNumber: number;
  };
  termName?: string;
}

export default function MasterTimetablePrint({
  slots,
  currentWeek,
  termName
}: MasterTimetablePrintProps) {
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

  // Group slots by day and period (multiple slots per cell)
  const slotsByDayAndPeriod = new Map<string, TimetableSlot[]>();
  slots.forEach(slot => {
    const key = `${slot.day_of_week}-${slot.lesson_period_id}`;
    const existing = slotsByDayAndPeriod.get(key) || [];
    slotsByDayAndPeriod.set(key, [...existing, slot]);
  });

  // Get slots for specific day and period
  const getSlotsForCell = (dayOfWeekValue: number, periodId: number): TimetableSlot[] => {
    const key = `${dayOfWeekValue}-${periodId}`;
    return slotsByDayAndPeriod.get(key) || [];
  };

  return (
    <div className="print-master-timetable">
      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-master-timetable,
          .print-master-timetable * {
            visibility: visible;
          }
          .print-master-timetable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0.5cm;
          }
          
          @page {
            size: A4 landscape;
            margin: 0.5cm;
          }
          
          /* Table styles for print */
          .master-print-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 10px;
            margin-top: 10px;
          }
          .master-print-table th,
          .master-print-table td {
            border: 2px solid #000 !important;
            padding: 6px !important;
            vertical-align: top;
          }
          .master-print-table th {
            background-color: #e5e7eb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-weight: bold;
            text-align: center;
            padding: 8px !important;
          }
          .master-print-table .time-cell {
            background-color: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-weight: bold;
            text-align: center;
          }
          .master-print-table .empty-cell {
            background-color: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .slot-item {
            margin-bottom: 8px;
            padding: 4px;
            border-left: 3px solid #3b82f6;
            background-color: #eff6ff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .slot-item:last-child {
            margin-bottom: 0;
          }
        }
        
        @media screen {
          .print-master-timetable {
            display: none;
          }
        }
      `}</style>

      <div>
        {/* Header */}
        <table style={{ width: '100%', marginBottom: '10px', border: 'none' }}>
          <tbody>
            <tr>
              <td style={{ border: 'none', padding: 0 }}>
                <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: 0 }}>
                  Master Timetable
                </h1>
                <p style={{ fontSize: '13px', margin: '4px 0 0 0', color: '#555' }}>
                  All Classes & Subjects
                </p>
              </td>
              <td style={{ border: 'none', padding: 0, textAlign: 'right' }}>
                <p style={{ fontWeight: 'bold', margin: 0, fontSize: '13px' }}>{termName || 'Current Term'}</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '11px' }}>
                  Week {currentWeek.weekNumber} - {currentWeek.start.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })} to {currentWeek.end.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </p>
                <p style={{ fontSize: '9px', color: '#666', margin: '2px 0 0 0' }}>
                  Generated: {new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Timetable Grid */}
        <table className="master-print-table">
          <thead>
            <tr>
              <th style={{ width: '10%' }}>Time</th>
              {daysOfWeek.map((day) => (
                <th key={day.value} style={{ width: '18%' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{day.name}</div>
                  <div style={{ fontSize: '9px', fontWeight: 'normal', marginTop: '3px', color: '#555' }}>
                    {new Date(currentWeek.start.getTime() + day.value * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lessonPeriods.map((period) => (
              <tr key={period.id}>
                {/* Time Column */}
                <td className="time-cell">
                  <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '3px' }}>
                    {period.name}
                  </div>
                  <div style={{ fontSize: '9px', color: '#555' }}>
                    {formatTime(period.start_time)} - {formatTime(period.end_time)}
                  </div>
                </td>

                {/* Day Columns */}
                {daysOfWeek.map((day) => {
                  const slotsInCell = getSlotsForCell(day.value, period.id);
                  
                  return (
                    <td
                      key={day.value}
                      className={slotsInCell.length === 0 ? 'empty-cell' : ''}
                      style={{ padding: '6px' }}
                    >
                      {slotsInCell.length > 0 ? (
                        <div>
                          {slotsInCell.map((slot) => (
                            <div key={slot.id} className="slot-item">
                              {/* Subject Code & Class Code */}
                              <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '3px' }}>
                                {slot.subjects.code} <span style={{ color: '#555' }}>({slot.classes.code})</span>
                              </div>
                              
                              {/* Room */}
                              <div style={{ fontSize: '9px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <MapPin style={{ width: '9px', height: '9px', display: 'inline-block' }} />
                                <span>{slot.rooms.name}</span>
                              </div>
                              
                              {/* Trainer */}
                              <div style={{ fontSize: '9px', color: '#555' }}>
                                {slot.users.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#ccc', padding: '10px', fontSize: '14px' }}>
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

        {/* Footer */}
        <div style={{ 
          marginTop: '10px', 
          fontSize: '9px', 
          color: '#666', 
          display: 'flex', 
          justifyContent: 'space-between',
          borderTop: '1px solid #ccc',
          paddingTop: '5px'
        }}>
          <div>Master Timetable - All Classes</div>
          <div>Total Slots: {slots.length}</div>
        </div>
      </div>
    </div>
  );
}