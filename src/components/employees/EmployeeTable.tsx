'use client';
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Add sessions support interface
interface AttendanceSession {
  check_in: string;
  check_out?: string | null;
}

// ✅ UPDATED: Interface to match API response
interface Employee {
  id?: number;                      // Keep for backward compatibility
  employee_id: number;              // NEW: Actual field from API
  employee_name?: string;           // NEW: From API
  name?: string;                    // Keep for backward compatibility
  users?: {                         // NEW: Nested user data
    name: string;
    id_number?: string;
    department?: string;
  };
  date: string;
  check_in_time: string | null;     // NEW: Changed from timeIn
  check_out_time: string | null;    // NEW: Changed from timeOut
  timeIn?: string | null;           // Keep for backward compatibility
  timeOut?: string | null;          // Keep for backward compatibility
  status: 'present' | 'absent' | 'late' | 'Present' | 'Absent' | 'Late'; // Allow both cases
  sessions?: AttendanceSession[];   // Sessions support
}

interface EmployeeTableProps {
  employees: Employee[];
}

const EmployeeTable: React.FC<EmployeeTableProps> = ({ employees }) => {
  if (!employees || employees.length === 0) {
    return <div>No records to display</div>;
  }

  // Helper function to get 6PM cutoff time for a given date
  const getSixPMCutoff = (date: Date): Date => {
    const cutoff = new Date(date);
    cutoff.setHours(18, 0, 0, 0); // Set to 6:00 PM
    return cutoff;
  };

  // ✅ UPDATED: Helper to get check-in time from either format
  const getCheckInTime = (employee: Employee): string | null => {
    return employee.check_in_time || employee.timeIn || null;
  };

  // ✅ UPDATED: Helper to get check-out time from either format
  const getCheckOutTime = (employee: Employee): string | null => {
    return employee.check_out_time || employee.timeOut || null;
  };

  // Helper function to safely parse sessions from data
  const parseSessionsFromData = (employee: Employee): AttendanceSession[] => {
    // If sessions data exists, use it
    if (employee.sessions && Array.isArray(employee.sessions)) {
      return employee.sessions.map((session: any) => {
        // Handle mobile format (check_in_time/check_out_time as strings)
        if (session.check_in_time || session.check_out_time) {
          return {
            check_in: session.check_in_time,
            check_out: session.check_out_time
          };
        }
        // Handle web format (check_in/check_out as Date objects or strings)
        return {
          check_in: session.check_in,
          check_out: session.check_out
        };
      });
    }
    
    // Fallback: Convert old format to sessions format
    const timeIn = getCheckInTime(employee);
    if (timeIn) {
      return [{
        check_in: timeIn,
        check_out: getCheckOutTime(employee)
      }];
    }
    
    return [];
  };

  // Helper function to check if a session should be considered ongoing
  const isSessionOngoing = (session: AttendanceSession, currentTime: Date): boolean => {
    if (!session.check_in || session.check_out) return false;
    
    const checkInTime = new Date(session.check_in);
    const sixPM = getSixPMCutoff(checkInTime);
    
    // If current time is past 6PM on the same day, session should not be ongoing
    return currentTime < sixPM;
  };

  // Helper function to check if employee has active session
  const hasActiveSession = (employee: Employee): boolean => {
    const currentTime = new Date();
    const sessions = parseSessionsFromData(employee);
    
    // Check for active session in sessions data
    if (sessions.length > 0) {
      return sessions.some((session: AttendanceSession) => 
        isSessionOngoing(session, currentTime)
      );
    }
    
    // Fallback to old format
    const recordDate = new Date(employee.date).toDateString();
    const today = new Date().toDateString();
    const isToday = recordDate === today;
    
    const timeIn = getCheckInTime(employee);
    const timeOut = getCheckOutTime(employee);
    
    if (!timeIn || timeOut || !isToday) return false;
    
    const checkInTime = new Date(timeIn);
    const sixPM = getSixPMCutoff(checkInTime);
    
    return currentTime < sixPM;
  };

  // Function to calculate hours worked with 6PM auto-stop
  const calculateHoursWorked = (employee: Employee): string => {
    const currentTime = new Date();
    const sessions = parseSessionsFromData(employee);
    
    // If sessions data exists, use that (new format)
    if (sessions.length > 0) {
      let totalMinutes = 0;
      let hasOngoingSession = false;
      
      sessions.forEach((session: AttendanceSession) => {
        if (session.check_in) {
          const checkIn = new Date(session.check_in);
          const sixPM = getSixPMCutoff(checkIn);
          
          let effectiveCheckOut: Date;
          
          if (session.check_out) {
            // Use the actual check-out time, but cap it at 6PM
            const actualCheckOut = new Date(session.check_out);
            effectiveCheckOut = actualCheckOut > sixPM ? sixPM : actualCheckOut;
          } else {
            // No check-out time
            if (currentTime >= sixPM) {
              // Past 6PM, use 6PM as effective check-out
              effectiveCheckOut = sixPM;
            } else {
              // Before 6PM, session is ongoing
              effectiveCheckOut = currentTime;
              hasOngoingSession = true;
            }
          }
          
          // Calculate minutes worked for this session
          const diffInMs = effectiveCheckOut.getTime() - checkIn.getTime();
          const diffInMinutes = Math.max(0, Math.floor(diffInMs / (1000 * 60)));
          totalMinutes += diffInMinutes;
        }
      });
      
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      
      return hasOngoingSession ? `${hours}h ${minutes}m *` : `${hours}h ${minutes}m`;
    }
    
    // Fallback to old format for backward compatibility
    const timeIn = getCheckInTime(employee);
    if (!timeIn) return '-';
    
    // Check if it's today's date
    const recordDate = new Date(employee.date).toDateString();
    const today = new Date().toDateString();
    const isToday = recordDate === today;
    
    const checkIn = new Date(timeIn);
    const sixPM = getSixPMCutoff(checkIn);
    
    let effectiveCheckOut: Date;
    let isOngoing = false;
    
    const timeOut = getCheckOutTime(employee);
    
    if (timeOut) {
      // Use the actual check-out time, but cap it at 6PM
      const actualCheckOut = new Date(timeOut);
      effectiveCheckOut = actualCheckOut > sixPM ? sixPM : actualCheckOut;
    } else if (isToday) {
      // If not checked out yet and it's today
      if (currentTime >= sixPM) {
        // Past 6PM, use 6PM as effective check-out
        effectiveCheckOut = sixPM;
      } else {
        // Before 6PM, session is ongoing
        effectiveCheckOut = currentTime;
        isOngoing = true;
      }
    } else {
      return '-';
    }
    
    // Only calculate if check-out is after check-in
    if (effectiveCheckOut <= checkIn) return '-';
    
    const diffInMs = effectiveCheckOut.getTime() - checkIn.getTime();
    const diffInMinutes = Math.max(0, Math.floor(diffInMs / (1000 * 60)));
    
    const hours = Math.floor(diffInMinutes / 60);
    const minutes = diffInMinutes % 60;
    
    return isOngoing ? `${hours}h ${minutes}m *` : `${hours}h ${minutes}m`;
  };

  // Function to get hours worked styling using sessions
  const getHoursStyle = (employee: Employee): string => {
    // Check if has active session using sessions-aware logic
    if (hasActiveSession(employee)) {
      return 'text-blue-600 font-semibold'; // Ongoing work
    }
    return 'text-gray-700'; // Completed or no work
  };

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'present':
        return 'bg-green-500 text-white hover:bg-green-600';
      case 'absent':
        return 'bg-red-500 text-white hover:bg-red-600';
      case 'late':
        return 'bg-yellow-500 text-white hover:bg-yellow-600';
      default:
        return 'bg-gray-500 text-white hover:bg-gray-600';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-KE', {
        timeZone: 'Africa/Nairobi'
      });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '-';
    try {
      return new Date(timeStr).toLocaleTimeString('en-KE', {
        timeZone: 'Africa/Nairobi',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return timeStr || '-';
    }
  };

  return (
    <div className="overflow-auto rounded-md border">
      <Table className="min-w-[700px] md:w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Employee ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-[120px]">Date</TableHead>
            <TableHead className="text-center">Time In</TableHead>
            <TableHead className="text-center">Time Out</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-center">Hours Worked</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={`${employee.employee_id || employee.id}-${employee.date}`}>
              <TableCell className="font-medium">
                {employee.employee_id || employee.id}
              </TableCell>
              <TableCell>
                {employee.employee_name || employee.users?.name || employee.name}
              </TableCell>
              <TableCell>{formatDate(employee.date)}</TableCell>
              <TableCell className="text-center">
                {formatTime(getCheckInTime(employee))}
              </TableCell>
              <TableCell className="text-center">
                {formatTime(getCheckOutTime(employee))}
              </TableCell>
              <TableCell className="text-center">
                <Badge className={`${getStatusColor(employee.status)} px-3 py-1`}>
                  {employee.status.charAt(0).toUpperCase() + employee.status.slice(1).toLowerCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-center font-mono">
                <span className={getHoursStyle(employee)}>
                  {calculateHoursWorked(employee)}
                </span>
                {hasActiveSession(employee) && (
                  <span className="text-xs text-blue-500 ml-1">(ongoing)</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default EmployeeTable;