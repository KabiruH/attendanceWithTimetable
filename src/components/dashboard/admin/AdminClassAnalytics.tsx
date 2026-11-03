// components/dashboard/admin/AdminClassAnalytics.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  BookOpen,
  Users,
  Clock,
  Target,
  Activity,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';

type GroupBy = 'subject' | 'class' | 'trainer' | 'department';
type TimeRange = 'week' | 'month' | 'term';

/** One row of the report summary, whatever the grouping */
interface GroupRow {
  key: string;
  name: string;
  code: string;        // short label for the chart axis
  department: string;
  totalSessions: number;
  completedSessions: number;
  totalHours: string;
  hours: number;       // parsed, for sums
  completionRate: number;
  onTimeRate: number;
}

interface TrainerPerformanceData {
  trainerId: number;
  trainerName: string;
  department: string;
  totalSessions: number;
  completedSessions: number;
  totalHours: string;
  avgDuration: string;
  completionRate: number;
  onTimeRate: number;
  hasActiveSession: boolean;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const TRAINERS_PER_PAGE = 10;
const ALL = 'all';
const UNASSIGNED = 'Unassigned';

/** Accepts "12.5", "12.5h", "12h 30m" or a number */
function parseHours(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const hm = value.match(/(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m)?/i);
  if (hm) return parseFloat(hm[1]) + (hm[2] ? parseInt(hm[2], 10) / 60 : 0);
  return parseFloat(value.replace(/[^\d.]/g, '')) || 0;
}

/** Normalise a summary item into a GroupRow for the current grouping */
function toGroupRow(item: any, groupBy: GroupBy, index: number): GroupRow {
  const stats = item.statistics ?? {};
  let name: string, code: string, department: string;

  switch (groupBy) {
    case 'subject':
      name = item.subject?.name || item.label;
      code = item.subject?.code || item.label;
      department = item.subject?.department;
      break;
    case 'class':
      name = item.class?.name || item.classes?.name || item.label;
      code = item.class?.code || item.classes?.code || item.label;
      department = item.class?.department || item.classes?.department;
      break;
    case 'trainer':
      name = item.trainer?.name || item.label;
      code = item.trainer?.name || item.label;
      department = item.trainer?.department;
      break;
    case 'department':
      name = item.department || item.label;
      code = item.department || item.label;
      department = item.department || item.label;
      break;
  }

  return {
    key: `${groupBy}-${code || index}-${index}`,
    name: name || 'Unknown',
    code: code || name || 'Unknown',
    department: department || UNASSIGNED,
    totalSessions: stats.totalSessions || 0,
    completedSessions: stats.completedSessions || 0,
    totalHours: stats.totalHours || '0',
    hours: parseHours(stats.totalHours),
    completionRate: stats.completionRate || 0,
    onTimeRate: stats.onTimeRate || 0,
  };
}

const AdminClassAnalytics: React.FC = () => {
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [trainerPerformance, setTrainerPerformance] = useState<TrainerPerformanceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [groupBy, setGroupBy] = useState<GroupBy>('subject');
  const [department, setDepartment] = useState<string>(ALL);
  const [trainerPage, setTrainerPage] = useState(1);

  const fetchClassAnalytics = useCallback(async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      switch (timeRange) {
        case 'week': startDate.setDate(endDate.getDate() - 7); break;
        case 'month': startDate.setMonth(endDate.getMonth() - 1); break;
        case 'term': startDate.setMonth(endDate.getMonth() - 3); break; // approximate term length
      }

      const range =
        `start_date=${startDate.toISOString().split('T')[0]}&` +
        `end_date=${endDate.toISOString().split('T')[0]}&include_details=false`;

      // Both reports in parallel (trainer table always uses trainer grouping)
      const [groupRes, trainerRes] = await Promise.all([
        fetch(`/api/attendance/class-attendance-report?${range}&group_by=${groupBy}`, { credentials: 'include' }),
        groupBy === 'trainer'
          ? Promise.resolve(null)
          : fetch(`/api/attendance/class-attendance-report?${range}&group_by=trainer`, { credentials: 'include' }),
      ]);

      if (!groupRes.ok || (trainerRes && !trainerRes.ok)) {
        // Keep whatever is already on screen rather than blanking to zeros
        throw new Error('Could not load class analytics');
      }

      const groupData = await groupRes.json();
      const trainerData = trainerRes ? await trainerRes.json() : groupData;

      setGroupRows((groupData.summary || []).map((item: any, i: number) => toGroupRow(item, groupBy, i)));

      const trainerPerf: TrainerPerformanceData[] = (trainerData.summary || []).map((item: any) => ({
        trainerId: item.trainer?.id || 0,
        trainerName: item.trainer?.name || item.label || 'Unknown',
        department: item.trainer?.department || UNASSIGNED,
        totalSessions: item.statistics?.totalSessions || 0,
        completedSessions: item.statistics?.completedSessions || 0,
        totalHours: item.statistics?.totalHours || '0',
        avgDuration: item.statistics?.averageDuration || '-',
        completionRate: item.statistics?.completionRate || 0,
        onTimeRate: item.statistics?.onTimeRate || 0,
        hasActiveSession: (item.statistics?.inProgressSessions || 0) > 0,
      }));
      trainerPerf.sort((a, b) => b.totalSessions - a.totalSessions);
      setTrainerPerformance(trainerPerf);

      setLoadError(null);
    } catch (error) {
      console.error('Error fetching class analytics:', error);
      setLoadError(error instanceof Error ? error.message : 'Could not load class analytics');
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, groupBy]);

  // One effect: fetch on mount and whenever the range/grouping changes, and
  // auto-refresh every 10 minutes with the CURRENT selections
  useEffect(() => {
    fetchClassAnalytics();
    const interval = setInterval(fetchClassAnalytics, 600000);
    return () => clearInterval(interval);
  }, [fetchClassAnalytics]);

  // ── Department filter ──────────────────────────────────────────────────────
  const departments = useMemo(() => {
    const set = new Set<string>();
    groupRows.forEach(r => set.add(r.department));
    trainerPerformance.forEach(t => set.add(t.department));
    return Array.from(set).sort((a, b) => {
      if (a === UNASSIGNED) return 1;
      if (b === UNASSIGNED) return -1;
      return a.localeCompare(b);
    });
  }, [groupRows, trainerPerformance]);

  // Drop a selection that no longer exists in the data
  useEffect(() => {
    if (department !== ALL && departments.length > 0 && !departments.includes(department)) {
      setDepartment(ALL);
    }
  }, [departments, department]);

  const filteredRows = useMemo(
    () => (department === ALL ? groupRows : groupRows.filter(r => r.department === department)),
    [groupRows, department]
  );

  const filteredTrainers = useMemo(
    () => (department === ALL ? trainerPerformance : trainerPerformance.filter(t => t.department === department)),
    [trainerPerformance, department]
  );

  // Back to page 1 when the trainer list changes shape
  useEffect(() => { setTrainerPage(1); }, [department, timeRange]);

  // Hours by department — always all departments, so the selected one can be
  // seen in context (it is highlighted, the rest are faded)
  const departmentHours = useMemo(() => {
    const map = new Map<string, number>();
    groupRows.forEach(r => map.set(r.department, (map.get(r.department) || 0) + r.hours));
    return Array.from(map.entries())
      .map(([name, hours]) => ({ name, hours: Number(hours.toFixed(1)) }))
      .filter(d => d.hours > 0)
      .sort((a, b) => b.hours - a.hours);
  }, [groupRows]);

  const chartRows = useMemo(
    () => [...filteredRows].sort((a, b) => b.totalSessions - a.totalSessions).slice(0, 8),
    [filteredRows]
  );

  const topRows = useMemo(
    () =>
      [...filteredRows]
        .filter(r => r.totalSessions > 0)
        .sort((a, b) => b.completionRate - a.completionRate || b.totalSessions - a.totalSessions)
        .slice(0, 6),
    [filteredRows]
  );

  // ── Trainer table: pagination + summary for the filtered set ──────────────
  const totalTrainerPages = Math.max(1, Math.ceil(filteredTrainers.length / TRAINERS_PER_PAGE));
  const currentTrainerPage = Math.min(trainerPage, totalTrainerPages);
  const pagedTrainers = filteredTrainers.slice(
    (currentTrainerPage - 1) * TRAINERS_PER_PAGE,
    currentTrainerPage * TRAINERS_PER_PAGE
  );

  const trainerSummary = useMemo(() => {
    const sessions = filteredTrainers.reduce((s, t) => s + t.totalSessions, 0);
    const weightedOnTime = filteredTrainers.reduce((s, t) => s + t.onTimeRate * t.totalSessions, 0);
    return {
      total: filteredTrainers.length,
      activeNow: filteredTrainers.filter(t => t.hasActiveSession).length,
      avgSessions: filteredTrainers.length > 0 ? sessions / filteredTrainers.length : 0,
      // weighted by sessions so a trainer with 1 session doesn't skew the average
      avgOnTime: sessions > 0 ? Math.round(weightedOnTime / sessions) : 0,
    };
  }, [filteredTrainers]);

  const groupLabel = groupBy.charAt(0).toUpperCase() + groupBy.slice(1);
  const topLabel = groupBy === 'class' ? 'Classes' : `${groupLabel}s`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-20 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardHeader className="bg-gray-200">
                <div className="h-6 bg-gray-300 rounded w-3/4"></div>
              </CardHeader>
              <CardContent className="h-[300px] pt-6">
                <div className="h-full bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Controls */}
      <div className="flex flex-col lg:flex-row justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Time Range Selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['week', 'month', 'term'] as const).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "ghost"}
                size="sm"
                onClick={() => setTimeRange(range)}
                className="text-sm"
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </Button>
            ))}
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-[220px] bg-white">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Departments</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Group By Selector */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['subject', 'class', 'trainer', 'department'] as const).map((group) => (
            <Button
              key={group}
              variant={groupBy === group ? "default" : "ghost"}
              size="sm"
              onClick={() => setGroupBy(group)}
              className="text-sm capitalize"
            >
              {group}
            </Button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {loadError}. {groupRows.length > 0 ? 'Showing the last loaded figures.' : ''}
          </span>
          <Button variant="outline" size="sm" onClick={fetchClassAnalytics}>Retry</Button>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions by current grouping */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600">
            <CardTitle className="text-white flex items-center">
              <BookOpen className="w-5 h-5 mr-2" />
              Sessions by {groupLabel}
              {department !== ALL && <span className="ml-2 text-sm font-normal opacity-90">· {department}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] pt-6">
            {chartRows.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                No sessions for this selection
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="code"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                    tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(label) => {
                      const item = chartRows.find(r => r.code === label);
                      return item ? item.name : label;
                    }}
                  />
                  <Bar dataKey="totalSessions" fill="#3B82F6" name="Total Sessions" />
                  <Bar dataKey="completedSessions" fill="#10B981" name="Completed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Department Distribution */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600">
            <CardTitle className="text-white flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Hours by Department
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] pt-6">
            {departmentHours.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                No hours recorded for this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={departmentHours}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="hours"
                    label={({ name, hours }) => `${name}: ${Number(hours).toFixed(1)}h`}
                    labelLine={false}
                    fontSize={11}
                    onClick={(d: any) => d?.name && setDepartment(d.name === department ? ALL : d.name)}
                    className="cursor-pointer"
                  >
                    {departmentHours.map((d, index) => (
                      <Cell
                        key={`cell-${d.name}`}
                        fill={COLORS[index % COLORS.length]}
                        fillOpacity={department === ALL || department === d.name ? 1 : 0.25}
                        stroke={department === d.name ? '#111827' : undefined}
                        strokeWidth={department === d.name ? 2 : 1}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}h`, 'Hours']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trainer Performance Overview */}
      <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600">
          <CardTitle className="text-white flex items-center justify-between">
            <span className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Trainer Performance Overview
              {department !== ALL && <span className="ml-2 text-sm font-normal opacity-90">· {department}</span>}
            </span>
            <span className="text-sm font-normal opacity-90">
              {filteredTrainers.length} trainer{filteredTrainers.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {filteredTrainers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No trainer activity for this selection
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Trainer</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Sessions</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Completed</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Total Hours</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Avg Duration</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">On-Time Rate</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTrainers.map((trainer, index) => (
                      <tr
                        key={`${trainer.trainerId}-${trainer.trainerName}`}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                              {trainer.trainerName.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{trainer.trainerName}</p>
                              <p className="text-xs text-gray-500">{trainer.department}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-3 px-4">
                          <span className="font-semibold text-gray-900">{trainer.totalSessions}</span>
                        </td>
                        <td className="text-center py-3 px-4">
                          <div className="flex flex-col items-center">
                            <span className="font-semibold text-green-600">{trainer.completedSessions}</span>
                            <span className="text-xs text-gray-500">({trainer.completionRate}%)</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-4">
                          <span className="font-semibold text-purple-600">{trainer.totalHours}</span>
                        </td>
                        <td className="text-center py-3 px-4">
                          <span className="text-gray-700">{trainer.avgDuration}</span>
                        </td>
                        <td className="text-center py-3 px-4">
                          <Badge className={`${
                            trainer.onTimeRate >= 90 ? 'bg-green-500' :
                            trainer.onTimeRate >= 75 ? 'bg-yellow-500' :
                            trainer.onTimeRate >= 60 ? 'bg-orange-500' : 'bg-red-500'
                          }`}>
                            {trainer.onTimeRate}%
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            {trainer.hasActiveSession ? (
                              <>
                                <Activity className="w-4 h-4 text-green-600 animate-pulse" />
                                <span className="text-xs text-green-600 font-medium">Active</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-4 h-4 text-gray-400" />
                                <span className="text-xs text-gray-500">Idle</span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalTrainerPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">
                    Showing {(currentTrainerPage - 1) * TRAINERS_PER_PAGE + 1}–
                    {Math.min(currentTrainerPage * TRAINERS_PER_PAGE, filteredTrainers.length)} of {filteredTrainers.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTrainerPage(p => Math.max(1, p - 1))}
                      disabled={currentTrainerPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600 px-2">
                      Page {currentTrainerPage} of {totalTrainerPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTrainerPage(p => Math.min(totalTrainerPages, p + 1))}
                      disabled={currentTrainerPage === totalTrainerPages}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Summary Stats (for the filtered set) */}
          <div className="mt-6 pt-4 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Total Trainers</p>
              <p className="text-2xl font-bold text-gray-900">{trainerSummary.total}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Active Now</p>
              <p className="text-2xl font-bold text-green-600">{trainerSummary.activeNow}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Avg Sessions/Trainer</p>
              <p className="text-2xl font-bold text-blue-600">{trainerSummary.avgSessions.toFixed(1)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Avg On-Time Rate</p>
              <p className="text-2xl font-bold text-purple-600">{trainerSummary.avgOnTime}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Performing */}
      <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-r from-amber-600 to-orange-600">
          <CardTitle className="text-white flex items-center">
            <Target className="w-5 h-5 mr-2" />
            Top Performing {topLabel}
            {department !== ALL && <span className="ml-2 text-sm font-normal opacity-90">· {department}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {topRows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No data for this selection</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topRows.map((item) => (
                <div key={item.key} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <h4 className="font-medium text-gray-900 truncate">{item.name}</h4>
                    {item.code !== item.name && <Badge variant="secondary">{item.code}</Badge>}
                  </div>
                  <div className="space-y-2 text-sm">
                    {groupBy !== 'department' && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Department:</span>
                        <span className="font-medium">{item.department}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sessions:</span>
                      <span className="font-medium">{item.totalSessions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Completed:</span>
                      <span className="font-medium text-green-600">{item.completedSessions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Hours:</span>
                      <span className="font-medium">{item.totalHours}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Completion:</span>
                      <Badge className={`${
                        item.completionRate >= 80 ? 'bg-green-500' :
                        item.completionRate >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}>
                        {item.completionRate}%
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">On-time:</span>
                      <div className="flex items-center gap-1">
                        {item.onTimeRate >= 80 ? (
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-orange-600" />
                        )}
                        <span className="font-medium">{item.onTimeRate}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminClassAnalytics;