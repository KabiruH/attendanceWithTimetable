// reportType.ts

// Session interface for attendance sessions
export interface AttendanceSession {
  check_in: string | Date;
  check_out?: string | Date | null;
  metadata?: {
    type?: string;
    location?: any;
    ip_address?: string;
    user_agent?: string;
  };
  checkout_metadata?: {
    location?: any;
    ip_address?: string;
    user_agent?: string;
  };
}

// Main attendance record interface
export interface AttendanceRecord {
  id: number;
  employee_id: number;
  employee_name?: string;                    // ✅ Add from API
  employee_id_number?: string;               // ✅ Add from API
  employee_department?: string;              // ✅ Add from API
  date: string | Date;
  check_in_time?: string | Date | null;
  check_out_time?: string | Date | null;
  status: string;
  sessions?: AttendanceSession[] | boolean;  // ✅ Can be array or boolean
  
  // ✅ Nested user relation (from API)
  users?: {
    name: string;
    id_number?: string;
    department?: string;
    role?: string;
  };
  
  // ✅ Legacy Employees relation (backward compatibility)
  Employees?: {
    id?: number;
    name: string | null;
  };
}

// Add types for the processed data
export interface ChartDataPoint {
  date: string | Date;
  present: number;
  late: number;
  absent: number;
}

export interface WeeklyHoursDataPoint {
  day: string;
  hours: number;
}

export interface FilterState {
  employeeName: string;
  status: string;
  startDate: string;
  endDate: string;
}

export type AttendanceStatus = 'all' | 'present' | 'late' | 'absent';

// ✅ Helper type for API responses
export interface AttendanceAPIResponse {
  role: string;
  isCheckedIn?: boolean;
  attendanceData: AttendanceRecord[];
  personalAttendance?: AttendanceRecord[];
  stats?: {
    totalDays: number;
    presentDays: number;
    lateDays: number;
    absentDays: number;
    attendanceRate: number;
  };
  autoProcessed?: {
    autoCheckouts: number;
    absentRecords: number;
  };
}

// ✅ Type guard to check if sessions is an array
export function isSessionArray(sessions: AttendanceSession[] | boolean | undefined): sessions is AttendanceSession[] {
  return Array.isArray(sessions);
}

// ✅ Helper function to get employee name from various sources
export function getEmployeeName(record: AttendanceRecord): string {
  return record.employee_name || 
         record.users?.name || 
         record.Employees?.name || 
         'Unknown';
}

// ✅ Helper function to safely get sessions array
export function getSessions(record: AttendanceRecord): AttendanceSession[] {
  if (isSessionArray(record.sessions)) {
    return record.sessions;
  }
  return [];
}