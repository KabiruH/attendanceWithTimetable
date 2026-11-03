// components/dashboard/admin/AdminSummaryCards.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Clock, UserCheck, AlertTriangle, UserPlus, TrendingUp } from 'lucide-react';

interface AttendanceMetrics {
  totalEmployees: number;
  presentToday: number;
  lateToday: number;
  attendanceRate: number;
  totalHoursToday: string;
}

interface AdminSummaryCardsProps {
  attendanceData: any[];  // from the dashboard's shared /api/attendance/status fetch
  isLoading: boolean;
}

const AdminSummaryCards: React.FC<AdminSummaryCardsProps> = ({ attendanceData, isLoading }) => {
  const metrics: AttendanceMetrics = useMemo(() => {
    const today = new Date().toDateString();
    const todayRecords = attendanceData.filter((record: any) =>
      new Date(record.date).toDateString() === today
    );

    const totalEmployees = new Set(attendanceData.map((a: any) => a.employee_id)).size;
    const onTimeToday = todayRecords.filter((a: any) => a.status.toLowerCase() === 'present').length;
    const lateToday = todayRecords.filter((a: any) => a.status.toLowerCase() === 'late').length;
    // Attendance counts everyone who came in, on time or late
    const attendanceRate = totalEmployees > 0
      ? Math.round(((onTimeToday + lateToday) / totalEmployees) * 100)
      : 0;

    const totalHoursToday = todayRecords.reduce((total: number, record: any) => {
      if (record.sessions && record.sessions.length > 0) {
        let sessionHours = 0;
        record.sessions.forEach((session: any) => {
          if (session.check_in) {
            const checkIn = new Date(session.check_in);
            const checkOut = session.check_out ? new Date(session.check_out) : new Date();
            const hours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
            sessionHours += Math.max(0, hours);
          }
        });
        return total + sessionHours;
      } else if (record.check_in_time) {
        const checkIn = new Date(record.check_in_time);
        const checkOut = record.check_out_time ? new Date(record.check_out_time) : new Date();
        const hours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        return total + Math.max(0, hours);
      }
      return total;
    }, 0);

    return {
      totalEmployees,
      presentToday: onTimeToday,
      lateToday,
      attendanceRate,
      totalHoursToday: totalHoursToday.toFixed(1)
    };
  }, [attendanceData]);

  if (isLoading && attendanceData.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between p-4 bg-gray-200 rounded-lg">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-300 rounded w-20"></div>
                  <div className="h-8 bg-gray-300 rounded w-12"></div>
                </div>
                <div className="w-12 h-12 bg-gray-300 rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
      <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg text-white">
            <div>
              <p className="text-sm font-medium opacity-90">Total Employees</p>
              <p className="text-3xl font-bold">{metrics.totalEmployees}</p>
            </div>
            <UserPlus className="w-12 h-12 opacity-80" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-500 to-green-600 rounded-lg text-white">
            <div>
              <p className="text-sm font-medium opacity-90">On Time Today</p>
              <p className="text-3xl font-bold">{metrics.presentToday}</p>
            </div>
            <UserCheck className="w-12 h-12 opacity-80" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg text-white">
            <div>
              <p className="text-sm font-medium opacity-90">Late Today</p>
              <p className="text-3xl font-bold">{metrics.lateToday}</p>
            </div>
            <AlertTriangle className="w-12 h-12 opacity-80" />
          </div>
        </CardContent>
      </Card>

      <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg text-white">
            <div>
              <p className="text-sm font-medium opacity-90">Attendance Rate</p>
              <p className="text-3xl font-bold">{metrics.attendanceRate}%</p>
            </div>
            <TrendingUp className="w-12 h-12 opacity-80" />
          </div>
        </CardContent>
      </Card>

      <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-lg text-white">
            <div>
              <p className="text-sm font-medium opacity-90">Hours Today</p>
              <p className="text-3xl font-bold">{metrics.totalHoursToday}h</p>
            </div>
            <Clock className="w-12 h-12 opacity-80" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSummaryCards;