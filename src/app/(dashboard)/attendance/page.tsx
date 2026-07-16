'use client';
import { useEffect, useState } from "react";
import EmployeeTable from "@/components/employees/EmployeeTable";
import LeaveManagement from "@/components/attendance/LeaveManagement";
import LeaveApplication from "@/components/attendance/LeaveApplication";
import { toast } from "sonner";

// UPDATED: Add sessions support to Employee interface
interface AttendanceSession {
  check_in: string;
  check_out?: string | null;
}

// ✅ UPDATED: Match the API response structure
// status widened to string — now also carries 'On Duty' / 'Leave' from the
// leave & official duty feature (lowercased below like the other statuses)
interface Employee {
  id?: number;
  employee_id: number;
  employee_name?: string;
  name?: string;
  users?: {
    name: string;
    id_number?: string;
    department?: string;
  };
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  timeIn?: string | null;  // Keep for backward compatibility
  timeOut?: string | null; // Keep for backward compatibility
  status: string; // 'present' | 'late' | 'absent' | 'on duty' | 'leave'
  sessions?: AttendanceSession[];
}

interface AttendanceResponse {
  role: string;
  attendanceData: any[];
  autoProcessed?: {
    autoCheckouts: number;
    absentRecords: number;
  };
  isCheckedIn?: boolean;
}

type AttendanceTab = 'records' | 'leave';

function Attendance() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isCheckedIn, setIsCheckedIn] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<AttendanceTab>('records');

  const authenticateAndFetchAttendance = async () => {
    try {
      const authResponse = await fetch("/api/auth/check", { method: "GET" });
      if (!authResponse.ok) {
        throw new Error("Authentication failed");
      }

      const authData = await authResponse.json();
      const { user } = authData;
      setUserRole(user.role);

      const attendanceResponse = await fetch("/api/attendance", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authData.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!attendanceResponse.ok) {
        throw new Error("Failed to fetch attendance data");
      }

      const response: AttendanceResponse = await attendanceResponse.json();


      if (user.role === "admin") {
        // ✅ FIXED: Use correct field names from API
        const adminEmployees = response.attendanceData.map((record: any) => {

          return {
            id: record.id,
            employee_id: record.employee_id,
            employee_name: record.employee_name || record.users?.name || 'Unknown',
            name: record.employee_name || record.users?.name || 'Unknown',
            users: record.users,
            date: record.date,
            check_in_time: record.check_in_time,
            check_out_time: record.check_out_time,
            timeIn: record.check_in_time, // For backward compatibility
            timeOut: record.check_out_time, // For backward compatibility
            status: record.status.toLowerCase(),
            sessions: record.sessions || []
          };
        });

        setEmployees(adminEmployees);

        if (response.autoProcessed && (response.autoProcessed.autoCheckouts > 0 || response.autoProcessed.absentRecords > 0)) {
          toast.info(`Auto-processed: ${response.autoProcessed.autoCheckouts} checkouts, ${response.autoProcessed.absentRecords} absences`);
        }
      } else if (user.role === "employee") {
        // ✅ FIXED: Use correct field names for employee
        const employeeRecords = response.attendanceData.map((record: any) => ({
          id: record.id,
          employee_id: record.employee_id,
          employee_name: user.name,
          name: user.name,
          date: record.date,
          check_in_time: record.check_in_time,
          check_out_time: record.check_out_time,
          timeIn: record.check_in_time, // For backward compatibility
          timeOut: record.check_out_time, // For backward compatibility
          status: record.status.toLowerCase(),
          sessions: record.sessions || []
        }));

        setEmployees(employeeRecords);
        setIsCheckedIn(response.isCheckedIn || false);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load attendance data");
      setLoading(false);
    }
  };

  useEffect(() => {
    authenticateAndFetchAttendance();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mt-11 mb-6">Employee Attendance</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div>
          {/* Tabs: attendance records | leave (admins manage, employees apply) */}
          <div className="mb-6 border-b flex gap-6">
            <button
              onClick={() => setActiveTab('records')}
              className={`pb-2 -mb-px font-medium ${
                activeTab === 'records'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Attendance records
            </button>
            <button
              onClick={() => setActiveTab('leave')}
              className={`pb-2 -mb-px font-medium ${
                activeTab === 'leave'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {userRole === "admin" ? "Leave & official duty" : "Apply for leave"}
            </button>
          </div>

          {activeTab === 'leave' ? (
            userRole === "admin" ? <LeaveManagement /> : <LeaveApplication />
          ) : (
            <div>
              {userRole === "admin" && <p className="text-xl mb-4">Viewing all employees</p>}
              {userRole === "employee" && (
                <div className="mb-4">
                  <p className="text-xl">Viewing your attendance</p>
                  <p className="text-sm text-gray-600">
                    Status: {isCheckedIn ? "Checked In" : "Not Checked In"}
                  </p>
                </div>
              )}
              <EmployeeTable employees={employees} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Attendance;