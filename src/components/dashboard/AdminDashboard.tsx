// components/dashboard/AdminDashboard.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Clock, Users, GraduationCap, BarChart3 } from 'lucide-react';
import AdminPersonalAttendance from './admin/AdminPersonalAttendance';
import AdminSummaryCards from './admin/AdminSummaryCards';
import AdminAttendanceAnalytics from './admin/AdminAttendanceAnalytics';
import AdminEmployeeTable from './admin/AdminEmployeeTable';
import AdminClassOverview from './admin/AdminClassOverview';
import AdminClassAnalytics from './admin/AdminClassAnalytics';

interface AdminDashboardProps {
  // The dashboard page has already authenticated; reuse its user instead of
  // calling /api/auth/check a second time
  data: {
    id: number;
    name: string;
    role: string;
    has_timetable_admin?: boolean;
  };
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ data }) => {
  const [currentView, setCurrentView] = useState<'attendance' | 'classes' | 'analytics'>('attendance');
  const employeeName = data?.name ?? null;
  const employee_id = data?.id != null ? String(data.id) : null;
  const userRole = data?.role ?? null;
  const hasTimetableAdmin = !!data?.has_timetable_admin;
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // ── ONE /api/attendance/status request for the whole dashboard ──────────
  // (the four work-attendance widgets used to fetch it separately, each on
  // its own timer). Refreshes every 2 minutes while the tab is visible.
  const [statusData, setStatusData] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const lastStatusFetch = useRef(0);

  const fetchStatus = useCallback(async () => {
    lastStatusFetch.current = Date.now();
    try {
      const response = await fetch('/api/attendance/status', {
        method: 'GET',
        credentials: 'include',
      });
      // On failure keep the last good data rather than blanking the widgets
      if (response.ok) setStatusData(await response.json());
    } catch (error) {
      console.error('Error fetching attendance status:', error);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const isVisible = () => document.visibilityState === 'visible';
    const interval = setInterval(() => { if (isVisible()) fetchStatus(); }, 120000);
    const onVisible = () => {
      if (isVisible() && Date.now() - lastStatusFetch.current > 60000) fetchStatus();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchStatus]);

  const attendanceData: any[] = statusData?.attendanceData ?? [];

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-KE', {
        timeZone: 'Africa/Nairobi',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check if admin is also a trainer (has timetable admin privileges or is employee role)
  const isAdminTrainer = userRole === 'admin' || userRole === 'employee' || hasTimetableAdmin;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6 space-y-6">
      {/* Header with Welcome, Clock and View Switcher */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white rounded-lg p-4 shadow-lg gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Welcome, {employeeName || 'Admin'}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {userRole === 'admin' && 'System Administrator'}
            {hasTimetableAdmin && ' • Timetable Manager'}
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* View Switcher */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={currentView === 'attendance' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('attendance')}
              className="flex items-center space-x-2"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Work Attendance</span>
              <span className="sm:hidden">Work</span>
            </Button>
            <Button
              variant={currentView === 'classes' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('classes')}
              className="flex items-center space-x-2"
            >
              <GraduationCap className="w-4 h-4" />
              <span className="hidden sm:inline">Class Overview</span>
              <span className="sm:hidden">Classes</span>
            </Button>
            <Button
              variant={currentView === 'analytics' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('analytics')}
              className="flex items-center space-x-2"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Class Analytics</span>
              <span className="sm:hidden">Analytics</span>
            </Button>
          </div>
          
          {/* Clock */}
          <div className="flex items-center space-x-2 text-lg font-semibold text-gray-700">
            <Clock className="w-6 h-6 text-blue-600 animate-pulse" />
            <span className="hidden sm:inline">{currentTime}</span>
          </div>
        </div>
      </div>

      {/* Personal Attendance Card - Always visible for admin trainers */}
      {isAdminTrainer && (
        <AdminPersonalAttendance 
          employee_id={employee_id}
          userRole={userRole}
          isAdminTrainer={isAdminTrainer}
          statusData={statusData}
          onStatusRefresh={fetchStatus}
        />
      )}

      {/* Conditional Content based on view */}
      {currentView === 'attendance' && (
        <>
          {/* Work Attendance Overview */}
          <AdminSummaryCards attendanceData={attendanceData} isLoading={statusLoading} />
          <AdminAttendanceAnalytics attendanceData={attendanceData} isLoading={statusLoading} />
          <AdminEmployeeTable attendanceData={attendanceData} isLoading={statusLoading} onRefresh={fetchStatus} />
        </>
      )}

      {currentView === 'classes' && (
        <>
          {/* Class Management Overview */}
          <AdminClassOverview />
        </>
      )}

      {currentView === 'analytics' && (
        <>
          {/* Class Analytics Dashboard */}
          <AdminClassAnalytics />
        </>
      )}
    </div>
  );
};

export default AdminDashboard;