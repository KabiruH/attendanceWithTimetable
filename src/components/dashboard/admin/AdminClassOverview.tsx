// components/dashboard/admin/AdminClassOverview.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  MapPin,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const PAGE_SIZE = 15;

interface ActiveClassSession {
  id: number;
  trainer_id: number;
  class_id: number;
  timetable_slot_id: string;
  check_in_time: string;
  check_out_time?: string | null;
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
  lessonPeriod?: {
    name: string;
    start_time: string;
    end_time: string;
    duration: number;
  } | null;
}

interface ClassMetrics {
  inSessionNow: number;
  checkedInNow: number;
  activeTrainersNow: number;
  scheduledToday: number;
  scheduledSoFar: number;
  completedToday: number;
  absentToday: number;
  attendanceRate: number | null;
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

const emptyMetrics: ClassMetrics = {
  inSessionNow: 0,
  checkedInNow: 0,
  activeTrainersNow: 0,
  scheduledToday: 0,
  scheduledSoFar: 0,
  completedToday: 0,
  absentToday: 0,
  attendanceRate: null
};

const AdminClassOverview: React.FC = () => {
  const [activeClassSessions, setActiveClassSessions] = useState<ActiveClassSession[]>([]);
  const [classMetrics, setClassMetrics] = useState<ClassMetrics>(emptyMetrics);
  const [trainerSummary, setTrainerSummary] = useState<TrainerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');

  // Active sessions table controls
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchClassOverviewData = async () => {
    setIsLoading(true);
    try {
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

      const reportResponse = await fetch(
        `/api/attendance/class-attendance-report?` +
        `start_date=${startDate.toISOString().split('T')[0]}&` +
        `end_date=${endDate.toISOString().split('T')[0]}&` +
        `group_by=trainer`,
        { method: 'GET', credentials: 'include' }
      );

      const statusResponse = await fetch('/api/attendance/admin-class-status', {
        method: 'GET',
        credentials: 'include',
      });

      if (reportResponse.ok && statusResponse.ok) {
        const reportData = await reportResponse.json();
        const statusData = await statusResponse.json();

        // Metrics now come computed from the API
        setClassMetrics(statusData.metrics ?? emptyMetrics);

        // Subject and room arrive with the payload — no per-row fetching
        setActiveClassSessions(statusData.activeClassSessions || []);

        const trainerData = (reportData.summary || []).map((item: any) => ({
          trainer_id: item.trainer?.id || 0,
          trainer_name: item.trainer?.name || item.label,
          department: item.trainer?.department || 'N/A',
          total_sessions: item.statistics.totalSessions,
          completed_sessions: item.statistics.completedSessions,
          total_hours: item.statistics.totalHours,
          on_time_rate: item.statistics.onTimeRate,
          has_active_session: item.statistics.inProgressSessions > 0
        }));

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

  // ── Filtering + pagination for the active sessions table ──
  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeClassSessions;

    return activeClassSessions.filter(s =>
      (s.subject?.name ?? '').toLowerCase().includes(q) ||
      (s.subject?.code ?? '').toLowerCase().includes(q) ||
      (s.users?.name ?? '').toLowerCase().includes(q) ||
      (s.classes?.name ?? '').toLowerCase().includes(q) ||
      (s.classes?.code ?? '').toLowerCase().includes(q) ||
      (s.room?.name ?? '').toLowerCase().includes(q)
    );
  }, [activeClassSessions, search]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const pagedSessions = useMemo(
    () => filteredSessions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredSessions, currentPage]
  );

  // Reset to page 1 whenever the filter changes
  useEffect(() => { setPage(1); }, [search]);

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  /**
   * Elapsed time since check-in, capped at the session's scheduled end so a
   * row left open (missed check-out) can't display an ever-growing duration.
   */
  const calculateDuration = (session: ActiveClassSession) => {
    const checkIn = new Date(session.check_in_time);
    if (isNaN(checkIn.getTime())) return '—';

    let end = new Date();

    if (session.lessonPeriod?.end_time) {
      // Lesson times are wall-clock digits stored in UTC fields
      const stored = new Date(session.lessonPeriod.end_time);
      const scheduledEnd = new Date(checkIn);
      scheduledEnd.setHours(stored.getUTCHours(), stored.getUTCMinutes(), 0, 0);
      if (end > scheduledEnd) end = scheduledEnd;
    }

    const diffMinutes = Math.max(0, Math.floor((end.getTime() - checkIn.getTime()) / 60000));
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  const isOverrunning = (session: ActiveClassSession) => {
    if (!session.lessonPeriod?.end_time) return false;
    const stored = new Date(session.lessonPeriod.end_time);
    const checkIn = new Date(session.check_in_time);
    const scheduledEnd = new Date(checkIn);
    scheduledEnd.setHours(stored.getUTCHours(), stored.getUTCMinutes(), 0, 0);
    return new Date() > scheduledEnd;
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
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">In Session Now</p>
                <p className="text-3xl font-bold">{classMetrics.inSessionNow}</p>
                <p className="text-xs opacity-75">On the timetable</p>
              </div>
              <Calendar className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-500 to-green-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Checked In Now</p>
                <p className="text-3xl font-bold">{classMetrics.checkedInNow}</p>
                <p className="text-xs opacity-75">
                  {classMetrics.activeTrainersNow} trainer{classMetrics.activeTrainersNow !== 1 ? 's' : ''} teaching
                </p>
              </div>
              <UserCheck className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Scheduled Today</p>
                <p className="text-3xl font-bold">{classMetrics.scheduledToday}</p>
                <p className="text-xs opacity-75">{classMetrics.scheduledSoFar} started so far</p>
              </div>
              <BookOpen className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-500 to-pink-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Completed</p>
                <p className="text-3xl font-bold">{classMetrics.completedToday}</p>
                <p className="text-xs opacity-75">Checked out</p>
              </div>
              <TrendingUp className="w-12 h-12 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg text-white">
              <div>
                <p className="text-sm font-medium opacity-90">Attendance Rate</p>
                <p className="text-3xl font-bold">
                  {classMetrics.attendanceRate !== null ? `${classMetrics.attendanceRate}%` : '—'}
                </p>
                <p className="text-xs opacity-75">
                  {classMetrics.absentToday} marked absent
                </p>
              </div>
              <Clock className="w-12 h-12 opacity-80" />
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
              {filteredSessions.length > 0 && (
                <span className="ml-2 text-sm font-normal opacity-90">
                  ({filteredSessions.length})
                </span>
              )}
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
          {/* Search */}
          {activeClassSessions.length > 0 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by subject, trainer, class or room..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {activeClassSessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="font-medium">No classes in progress</p>
              <p className="text-sm">Trainers appear here once they check into a class</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Search className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="font-medium">No sessions match "{search}"</p>
            </div>
          ) : (
            <>
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
                    {pagedSessions.map((session) => (
                      <TableRow key={session.id} className="hover:bg-gray-50 transition-colors duration-200">
                        <TableCell>
                          <div>
                            <div className="font-medium">{session.users?.name}</div>
                            <div className="text-xs text-gray-500">{session.users?.department}</div>
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
                            <div className="font-medium">{session.classes?.name}</div>
                            <div className="text-xs text-gray-500">{session.classes?.code}</div>
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
                          <div className={`font-medium ${isOverrunning(session) ? 'text-orange-600' : 'text-blue-600'}`}>
                            {calculateDuration(session)}
                            {isOverrunning(session) && (
                              <div className="text-xs font-normal text-orange-500">no check-out</div>
                            )}
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, filteredSessions.length)} of {filteredSessions.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600 px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Trainer Performance Summary — unchanged */}
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