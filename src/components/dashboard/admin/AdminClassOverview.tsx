// components/dashboard/admin/AdminClassOverview.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GraduationCap,
  Users,
  Clock,
  TrendingUp,
  AlertCircle,
  BookOpen,
  UserCheck,
  Calendar,
  Loader2,
  RefreshCw,
  MapPin
} from 'lucide-react';

interface ActiveClassSession {
  id: number;
  trainer_id: number;
  class_id: number;
  timetable_slot_id: string;
  check_in_time: Date;
  check_out_time?: Date;
  status: string;
  location_verified: boolean;
  users: {
    name: string;
    department: string;
  };
  classes: {
    name: string;
    code: string;
  };
  subject?: {
    name: string;
    code: string;
  } | null;
  room?: {
    name: string;
  } | null;
}

interface ClassMetrics {
  totalActiveClasses: number;
  totalTrainersInClass: number;
  totalClassHoursToday: string;
  scheduledToday: number;
  completedToday: number;
}

interface TrainerSummary {
  trainer_id: number;
  trainer_name: string;
  department: string;
  total_sessions: number;
  completed_sessions: number;
  total_hours: string;
  on_time_rate: number;
  has_active_session: boolean;
}

const AdminClassOverview: React.FC = () => {
  const [activeClassSessions, setActiveClassSessions] = useState<ActiveClassSession[]>([]);
  const [classMetrics, setClassMetrics] = useState<ClassMetrics>({
    totalActiveClasses: 0,
    totalTrainersInClass: 0,
    totalClassHoursToday: '0',
    scheduledToday: 0,
    completedToday: 0
  });
  const [trainerSummary, setTrainerSummary] = useState<TrainerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');

  const fetchClassOverviewData = async () => {
    setIsLoading(true);
    try {
      // Calculate date range
      const endDate = new Date();
      let startDate = new Date();

      switch (timeRange) {
        case 'today':
          startDate = new Date(endDate.toISOString().split('T')[0]);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
      }

      // Fetch attendance report for metrics
      const reportResponse = await fetch(
        `/api/attendance/class-attendance-report?` +
        `start_date=${startDate.toISOString().split('T')[0]}&` +
        `end_date=${endDate.toISOString().split('T')[0]}&` +
        `group_by=trainer`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      // Fetch today's class status for active sessions
      const statusResponse = await fetch('/api/attendance/admin-class-status', {
        method: 'GET',
        credentials: 'include',
      });

      if (reportResponse.ok && statusResponse.ok) {
        const reportData = await reportResponse.json();
        const statusData = await statusResponse.json();

  console.log('Status Data:', statusData);
  console.log('Today Attendance:', statusData.todayAttendance);
  console.log('Active Class Sessions:', statusData.activeClassSessions);

        // Set metrics
        setClassMetrics({
          totalActiveClasses: statusData.activeClassSessions?.length || 0,
          totalTrainersInClass: new Set(statusData.activeClassSessions?.map((s: any) => s.trainer_id)).size || 0,
          totalClassHoursToday: reportData.totals.totalHours || '0',
          scheduledToday: statusData.todaySchedule?.length || 0,
          completedToday: statusData.todayAttendance?.filter((a: any) => a.check_out_time).length || 0
        });

        // Process active sessions with enriched data
        const enrichedSessions = await Promise.all(
          (statusData.activeClassSessions || []).map(async (session: any) => {
            let subject = null;
            let room = null;

            if (session.timetable_slot_id) {
              try {
                // Fetch timetable slot details
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
              subject,
              room
            };
          })
        );

        setActiveClassSessions(enrichedSessions);

        // Process trainer summary
        const trainerData = reportData.summary.map((item: any) => ({
          trainer_id: item.trainer?.id || 0,
          trainer_name: item.trainer?.name || item.label,
          department: item.trainer?.department || 'N/A',
          total_sessions: item.statistics.totalSessions,
          completed_sessions: item.statistics.completedSessions,
          total_hours: item.statistics.totalHours,
          on_time_rate: item.statistics.onTimeRate,
          has_active_session: item.statistics.inProgressSessions > 0
        }));

        // Sort by total sessions
        trainerData.sort((a: any, b: any) => b.total_sessions - a.total_sessions);
        setTrainerSummary(trainerData);
      }
    } catch (error) {
      console.error('Error fetching class overview:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClassOverviewData();
    const interval = setInterval(fetchClassOverviewData, 120000); // 2 minutes
    return () => clearInterval(interval);
  }, [timeRange]);

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const calculateDuration = (checkInTime: Date) => {
    const checkIn = new Date(checkInTime);
    const now = new Date();
    const diffMs = now.getTime() - checkIn.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present':
        return 'bg-green-500 hover:bg-green-600';
      case 'Late':
        return 'bg-orange-500 hover:bg-orange-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Loading class overview...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Class Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-500 to-green-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Active Sessions</p>
                <p className="text-3xl font-bold">{classMetrics.totalActiveClasses}</p>
                <p className="text-xs opacity-75">In progress now</p>
              </div>
              <BookOpen className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Active Trainers</p>
                <p className="text-3xl font-bold">{classMetrics.totalTrainersInClass}</p>
                <p className="text-xs opacity-75">Currently teaching</p>
              </div>
              <UserCheck className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Hours Today</p>
                <p className="text-3xl font-bold">{classMetrics.totalClassHoursToday}</p>
                <p className="text-xs opacity-75">Total class time</p>
              </div>
              <Clock className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Scheduled Today</p>
                <p className="text-3xl font-bold">{classMetrics.scheduledToday}</p>
                <p className="text-xs opacity-75">Classes planned</p>
              </div>
              <Calendar className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-500 to-pink-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Completed</p>
                <p className="text-3xl font-bold">{classMetrics.completedToday}</p>
                <p className="text-xs opacity-75">
                  {classMetrics.scheduledToday > 0
                    ? `${Math.round((classMetrics.completedToday / classMetrics.scheduledToday) * 100)}% done`
                    : 'No data'}
                </p>
              </div>
              <TrendingUp className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Class Sessions */}
      <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600">
          <CardTitle className="text-white flex items-center justify-between">
            <span className="flex items-center">
              <GraduationCap className="w-5 h-5 mr-2" />
              Active Class Sessions
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchClassOverviewData}
              className="text-white hover:bg-white/20"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {activeClassSessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="font-medium">No active class sessions at the moment</p>
              <p className="text-sm">Trainers will appear here when they check into classes</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Trainer</TableHead>
                    <TableHead className="font-semibold">Subject</TableHead>
                    <TableHead className="font-semibold">Class</TableHead>
                    <TableHead className="font-semibold">Room</TableHead>
                    <TableHead className="font-semibold">Started</TableHead>
                    <TableHead className="font-semibold">Duration</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeClassSessions.map((session) => (
                    <TableRow key={session.id} className="hover:bg-gray-50 transition-colors duration-200">
                      <TableCell>
                        <div>
                          <div className="font-medium">{session.users.name}</div>
                          <div className="text-xs text-gray-500">{session.users.department}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{session.subject?.name || 'N/A'}</div>
                          {session.subject?.code && (
                            <div className="text-xs text-gray-500">{session.subject.code}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{session.classes.name}</div>
                          <div className="text-xs text-gray-500">{session.classes.code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {session.location_verified && (
                            <MapPin className="w-3 h-3 text-green-600" />
                          )}
                          <span className="text-sm">{session.room?.name || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{formatTime(session.check_in_time)}</TableCell>
                      <TableCell>
                        <div className="font-medium text-blue-600">
                          {calculateDuration(session.check_in_time)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(session.status)}>
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                            <span>{session.status}</span>
                          </div>
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trainer Performance Summary */}
      <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600">
          <CardTitle className="text-white flex items-center justify-between">
            <span className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Trainer Performance
            </span>
            <div className="flex gap-1">
              {(['today', 'week', 'month'] as const).map((range) => (
                <Button
                  key={range}
                  variant={timeRange === range ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange(range)}
                  className="text-xs px-2 py-1 h-6 text-white hover:bg-white/20"
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {trainerSummary.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No trainer performance data available for this period</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-gray-50 z-10">
                  <TableRow>
                    <TableHead className="font-semibold">Trainer</TableHead>
                    <TableHead className="font-semibold text-center">Sessions</TableHead>
                    <TableHead className="font-semibold text-center">Completed</TableHead>
                    <TableHead className="font-semibold text-center">Total Hours</TableHead>
                    <TableHead className="font-semibold text-center">On-Time Rate</TableHead>
                    <TableHead className="font-semibold text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trainerSummary.map((trainer) => (
                    <TableRow key={trainer.trainer_id} className="hover:bg-gray-50 transition-colors duration-200">
                      <TableCell>
                        <div>
                          <div className="font-medium">{trainer.trainer_name}</div>
                          <div className="text-xs text-gray-500">{trainer.department}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{trainer.total_sessions}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          <span className="font-semibold text-green-600">{trainer.completed_sessions}</span>
                          <span className="text-xs text-gray-500">
                            {trainer.total_sessions > 0
                              ? `(${Math.round((trainer.completed_sessions / trainer.total_sessions) * 100)}%)`
                              : '(0%)'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold text-purple-600">
                        {trainer.total_hours}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={
                          trainer.on_time_rate >= 90 ? 'bg-green-500' :
                            trainer.on_time_rate >= 75 ? 'bg-yellow-500' :
                              trainer.on_time_rate >= 60 ? 'bg-orange-500' : 'bg-red-500'
                        }>
                          {trainer.on_time_rate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {trainer.has_active_session ? (
                          <Badge className="bg-green-500 hover:bg-green-600">
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                              <span>Active</span>
                            </div>
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Idle</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminClassOverview;