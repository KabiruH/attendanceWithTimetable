// components/dashboard/EmployeeDashboard.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import WelcomeHeader from './employee/WelcomeHeader';
import AttendanceCard from './employee/AttendanceCard';
import StatisticsCards from './employee/StatisticsCards';
import AttendanceCharts from './employee/AttendanceCharts';
import ClassStatusCard from './employee/ClassStatusCard';
import ClassAnalyticsCards from './employee/ClassAnalyticsCards';
import UpcomingClassesWidget from './employee/UpcomingClassesWidget';
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface EmployeeDashboardProps {
  data?: {
    id: number;
    email: string;
    name: string;
    role: string;
  }
}

interface ActiveClassSession {
  id: number;
  trainer_id: number;
  class_id: number;
  timetable_slot_id: string | null;
  check_in_time: Date;
  check_out_time?: Date | null;
  status: string;
  auto_checkout: boolean; // ADD THIS
  location_verified: boolean;
  classes: {
    id: number;
    name: string;
    code: string;
    department: string;
  };
  subject?: {
    name: string;
    code: string;
  } | null;
  room?: {
    name: string;
  } | null;
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ data }) => {
  const [showFullAnalytics, setShowFullAnalytics] = useState(false);
  const [activeClassSessions, setActiveClassSessions] = useState<ActiveClassSession[]>([]);
  const [todayClassHours, setTodayClassHours] = useState('0');
  const [isClassLoading, setIsClassLoading] = useState(false);
  const { toast } = useToast();
  
  const {
    isCheckedIn,
    isLoading,
    employeeName,
    employee_id,
    attendanceData,
    weeklyHours,
    currentTime,
    todayHours,
    stats,
    handleAttendance
  } = useDashboardData();

  // Check if user is a trainer
  const isTrainer = data?.role === 'employee' || data?.role === 'trainer';

  // Fetch class attendance status
  const fetchClassStatus = async () => {
    if (!employee_id || !isTrainer) return;

    try {
      const response = await fetch('/api/attendance/class-status', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const statusData = await response.json();
        
        // Enrich active sessions with timetable data
        const enrichedSessions = await Promise.all(
          (statusData.activeClassSessions || []).map(async (session: any) => {
            let subject = null;
            let room = null;

            if (session.timetable_slot_id) {
              try {
                const slotResponse = await fetch(`/api/timetable/${session.timetable_slot_id}`);
                if (slotResponse.ok) {
                  const slotData = await slotResponse.json();
                  subject = slotData.data?.subjects || null;
                  room = slotData.data?.rooms || null;
                }
              } catch (error) {
                console.error('Error fetching slot details:', error);
              }
            }

            return {
              ...session,
              auto_checkout: session.auto_checkout || false, // ENSURE THIS IS INCLUDED
              subject,
              room
            };
          })
        );

        setActiveClassSessions(enrichedSessions);
        setTodayClassHours(statusData.stats?.hoursThisMonth || '0');
      }
    } catch (error) {
      console.error('Error fetching class status:', error);
    }
  };

  // Handle class check-out
  const handleClassCheckOut = async (attendanceId: number) => {
    setIsClassLoading(true);
    try {
      const response = await fetch('/api/attendance/class-checkin', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attendance_id: attendanceId,
          action: 'check-out'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to check out of class');
      }

      const result = await response.json();
      
      toast({
        title: 'Success',
        description: result.message || 'Successfully checked out of class',
      });

      // Refresh class status
      await fetchClassStatus();
    } catch (error) {
      console.error('Error checking out of class:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check out of class',
        variant: 'destructive',
      });
    } finally {
      setIsClassLoading(false);
    }
  };

  // Fetch class status on mount and periodically
  useEffect(() => {
    if (isTrainer) {
      fetchClassStatus();
      
      // Refresh every 2 minutes
      const interval = setInterval(fetchClassStatus, 120000);
      return () => clearInterval(interval);
    }
  }, [employee_id, isTrainer]);

  const handleCheckIn = () => handleAttendance('check-in');
  const handleCheckOut = () => handleAttendance('check-out');

  // Toggle between compact and full analytics view
  if (showFullAnalytics) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Class Training Analytics</h1>
          <Button
            variant="outline"
            onClick={() => setShowFullAnalytics(false)}
          >
            Back to Dashboard
          </Button>
        </div>
        <ClassAnalyticsCards
          userId={employee_id}
          showFullAnalytics={true}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 space-y-6">
      {/* Welcome Section */}
      <WelcomeHeader
        employeeName={employeeName}
        currentTime={currentTime}
      />
      
      {/* Check In/Out Card - REMOVE todayClassHours prop */}
      <AttendanceCard
        isCheckedIn={isCheckedIn}
        isLoading={isLoading}
        todayHours={todayHours}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        userRole={data?.role}
        isClassLoading={isClassLoading}
        hasActiveSession={activeClassSessions.length > 0}
        activeSessionName={activeClassSessions[0]?.subject?.name || activeClassSessions[0]?.classes.name}
        employeeId={employee_id}
      />

      {/* Upcoming Classes Widget - Only for trainers */}
      {isTrainer && isCheckedIn && (
        <UpcomingClassesWidget
          employeeId={employee_id}
          onClassCheckIn={fetchClassStatus}
        />
      )}
      
      {/* Active Class Sessions Card - Only show if there are active sessions */}
      {activeClassSessions.length > 0 && (
        <ClassStatusCard
          activeClassSessions={activeClassSessions}
          todayClassHours={todayClassHours}
          onClassCheckOut={handleClassCheckOut}
          isLoading={isClassLoading}
        />
      )}
      
      {/* Statistics Cards */}
      <StatisticsCards stats={stats} />
      
      {/* Class Analytics - Only show for trainers */}
      {isTrainer && (
        <ClassAnalyticsCards
          userId={employee_id}
          onViewFullAnalytics={() => setShowFullAnalytics(true)}
        />
      )}
      
      {/* Charts section */}
      <AttendanceCharts
        attendanceData={attendanceData}
        weeklyHours={weeklyHours}
      />
    </div>
  );
};

export default EmployeeDashboard;