'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Download } from 'lucide-react';
import Filters from '@/components/reports/Filters';
import ReportsTable from '@/components/reports/ReportsTable';
import PDFReportGenerator from '@/components/reports/PDFReportGenerator';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ClassAttendanceReport from '@/components/reports/ClassAttendanceReport';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils/utils';
import type { AttendanceRecord, FilterState, AttendanceSession } from '@/components/reports/reportType';
import { useToast } from "@/components/ui/use-toast";

const ITEMS_PER_PAGE = 50;
const WORK_END_HOUR = 18; // 6 PM

export default function ReportsPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [activeTab, setActiveTab] = useState('work-attendance');
  const [filters, setFilters] = useState<FilterState>({
    employeeName: '',
    status: 'all',
    startDate: '',
    endDate: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showNotCheckedIn, setShowNotCheckedIn] = useState(false);
  const { toast } = useToast();

  // Utility: Get employee name from record
  const getEmployeeName = (record: AttendanceRecord): string => {
    return record.employee_name || record.users?.name || record.Employees?.name || 'Unknown';
  };

  // Utility: Get 6PM cutoff for a date
  const getSixPMCutoff = (date: Date): Date => {
    const cutoff = new Date(date);
    cutoff.setHours(WORK_END_HOUR, 0, 0, 0);
    return cutoff;
  };

  // Utility: Calculate hours worked with 6PM cap
  const calculateHours = (
    checkIn: Date,
    checkOut: Date | null,
    isToday: boolean
  ): { hours: number; minutes: number; isOngoing: boolean } => {
    const currentTime = new Date();
    const sixPM = getSixPMCutoff(checkIn);
    
    let effectiveCheckOut: Date;
    let isOngoing = false;

    if (checkOut) {
      effectiveCheckOut = checkOut > sixPM ? sixPM : checkOut;
    } else if (isToday) {
      if (currentTime >= sixPM) {
        effectiveCheckOut = sixPM;
      } else {
        effectiveCheckOut = currentTime;
        isOngoing = true;
      }
    } else {
      return { hours: 0, minutes: 0, isOngoing: false };
    }

    const diffInMs = Math.max(0, effectiveCheckOut.getTime() - checkIn.getTime());
    const totalMinutes = Math.floor(diffInMs / (1000 * 60));
    
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      isOngoing
    };
  };

  // Calculate hours from sessions or fallback to check_in/check_out
  const calculateTotalHours = (record: AttendanceRecord): string => {
    const sessions = Array.isArray(record.sessions) ? record.sessions : [];
    const recordDate = new Date(record.date).toDateString();
    const today = new Date().toDateString();
    const isToday = recordDate === today;

    // Use sessions if available
    if (sessions.length > 0) {
      let totalMinutes = 0;
      let hasOngoing = false;

      sessions.forEach((session: AttendanceSession) => {
        if (session.check_in) {
          const checkIn = new Date(session.check_in);
          const checkOut = session.check_out ? new Date(session.check_out) : null;
          const result = calculateHours(checkIn, checkOut, isToday);
          
          totalMinutes += (result.hours * 60) + result.minutes;
          if (result.isOngoing) hasOngoing = true;
        }
      });

      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hasOngoing ? `${hours}h ${minutes}m (ongoing)` : `${hours}h ${minutes}m`;
    }

    // Fallback to check_in_time/check_out_time
    if (!record.check_in_time) return '-';

    const checkIn = new Date(record.check_in_time);
    const checkOut = record.check_out_time ? new Date(record.check_out_time) : null;
    const result = calculateHours(checkIn, checkOut, isToday);

    if (result.hours === 0 && result.minutes === 0 && !result.isOngoing) return '-';
    
    return result.isOngoing 
      ? `${result.hours}h ${result.minutes}m (ongoing)` 
      : `${result.hours}h ${result.minutes}m`;
  };

  // Format time for display
  const formatTime = (timeStr: string | Date | null | undefined): string => {
    if (!timeStr) return '-';
    try {
      return new Date(timeStr).toLocaleTimeString('en-KE', {
        timeZone: 'Africa/Nairobi',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '-';
    }
  };

  // Fetch attendance data
  const fetchAttendanceData = async () => {
    try {
      const authResponse = await fetch("/api/auth/check", { 
        method: "GET",
        credentials: 'include'
      });
      
      if (!authResponse.ok) throw new Error("Authentication failed");

      const authData = await authResponse.json();
      const { user } = authData;
      setUserRole(user.role);

      const attendanceResponse = await fetch("/api/attendance/status", {
        method: "GET",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
      });

      if (!attendanceResponse.ok) throw new Error("Failed to fetch attendance data");

      const data = await attendanceResponse.json();

      const processRecord = (record: any, userName?: string) => ({
        id: record.id,
        employee_id: record.employee_id,
        employee_name: record.employee_name || record.users?.name || userName || 'Unknown',
        date: new Date(record.date).toISOString().split('T')[0],
        check_in_time: record.check_in_time,
        check_out_time: record.check_out_time,
        status: record.status.toLowerCase(),
        sessions: record.sessions || [],
        Employees: {
          name: record.employee_name || record.users?.name || userName || 'Unknown'
        },
        users: record.users || { name: record.employee_name || userName || 'Unknown' }
      });

      if (user.role === "admin") {
        const processedData = data.attendanceData.map((record: any) => processRecord(record));
        setAttendanceData(processedData);
      } else {
        const processedData = data.attendanceData.map((record: any) => processRecord(record, user.name));
        setAttendanceData(processedData);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch attendance data",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
  }, []);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let filtered = attendanceData.filter((record) => {
      const employeeName = getEmployeeName(record);
      const nameMatch = employeeName.toLowerCase().includes(filters.employeeName.toLowerCase());
      const statusMatch = filters.status === 'all' || record.status.toLowerCase() === filters.status.toLowerCase();
      const dateMatch = (!filters.startDate || record.date >= filters.startDate) &&
                       (!filters.endDate || record.date <= filters.endDate);
      const notCheckedInMatch = !showNotCheckedIn || record.status.toLowerCase() !== 'present';

      return nameMatch && statusMatch && dateMatch && notCheckedInMatch;
    });

    if (showNotCheckedIn) {
      const statusPriority: Record<string, number> = {
        'late': 1,
        'not checked in': 2,
        'absent': 3,
        'present': 4
      };

      filtered.sort((a, b) => {
        const priorityA = statusPriority[a.status.toLowerCase()] || 5;
        const priorityB = statusPriority[b.status.toLowerCase()] || 5;

        if (priorityA !== priorityB) return priorityA - priorityB;
        return getEmployeeName(a).localeCompare(getEmployeeName(b));
      });
    }

    return filtered;
  }, [filters, attendanceData, showNotCheckedIn]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getVisiblePages = (): number[] => {
    const maxVisible = 10;
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  // Handlers
  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const toggleNotCheckedInFilter = () => {
    setShowNotCheckedIn(!showNotCheckedIn);
    setCurrentPage(1);
  };

  const exportToCSV = () => {
    const headers = ['Employee ID', 'Employee Name', 'Date', 'Time In', 'Time Out', 'Status', 'Hours Worked'];
    const csvData = filteredData.map(record => [
      record.employee_id,
      getEmployeeName(record),
      record.date,
      formatTime(record.check_in_time),
      formatTime(record.check_out_time),
      record.status,
      calculateTotalHours(record)
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

return (
  <div className="p-6 space-y-6">
    <h1 className="text-2xl font-bold">Attendance Reports</h1>
    
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="work-attendance">Work Attendance</TabsTrigger>
        <TabsTrigger value="class-attendance">Class Attendance</TabsTrigger>
      </TabsList>
      
      <TabsContent value="work-attendance" className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button 
              onClick={toggleNotCheckedInFilter} 
              variant={showNotCheckedIn ? "default" : "outline"}
              size="sm"
            >
              {showNotCheckedIn ? "Showing Late/Not Checked In" : "Show Late/Not Checked In"}
            </Button>
            <Button onClick={exportToCSV} variant="outline" size="sm" disabled={filteredData.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export to CSV
            </Button>
            <PDFReportGenerator />
          </div>
        </div>

        <Filters
          filters={filters}
          onFilterChange={handleFilterChange}
          resultCount={filteredData.length}
        />

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading attendance data...</p>
          </div>
        ) : attendanceData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No attendance records found.</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No records match your filters.</p>
          </div>
        ) : (
          <ReportsTable data={paginatedData} />
        )}

        {totalPages > 1 && (
          <Pagination className="mt-4">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  className={cn(currentPage === 1 && "pointer-events-none opacity-50 cursor-not-allowed")}
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) setCurrentPage(prev => prev - 1);
                  }}
                  href="#"
                />
              </PaginationItem>

              {getVisiblePages()[0] > 1 && (
                <>
                  <PaginationItem>
                    <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(1); }}>
                      1
                    </PaginationLink>
                  </PaginationItem>
                  {getVisiblePages()[0] > 2 && (
                    <PaginationItem><span className="px-4 py-2">...</span></PaginationItem>
                  )}
                </>
              )}

              {getVisiblePages().map((pageNum) => (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => { e.preventDefault(); setCurrentPage(pageNum); }}
                    isActive={currentPage === pageNum}
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              ))}

              {getVisiblePages()[getVisiblePages().length - 1] < totalPages && (
                <>
                  {getVisiblePages()[getVisiblePages().length - 1] < totalPages - 1 && (
                    <PaginationItem><span className="px-4 py-2">...</span></PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(totalPages); }}>
                      {totalPages}
                    </PaginationLink>
                  </PaginationItem>
                </>
              )}

              <PaginationItem>
                <PaginationNext
                  className={cn(currentPage === totalPages && "pointer-events-none opacity-50 cursor-not-allowed")}
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
                  }}
                  href="#"
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </TabsContent>
      
      <TabsContent value="class-attendance">
        {userRole && <ClassAttendanceReport userRole={userRole} />}
      </TabsContent>
    </Tabs>
  </div>
);
}