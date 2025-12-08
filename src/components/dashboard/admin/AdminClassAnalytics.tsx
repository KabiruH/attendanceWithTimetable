// components/dashboard/admin/AdminClassAnalytics.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { 
  BookOpen, 
  TrendingUp, 
  Users, 
  Clock,
  Target,
  Activity,
  Calendar,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface SubjectUtilizationData {
  subjectName: string;
  subjectCode: string;
  department: string;
  totalSessions: number;
  completedSessions: number;
  totalHours: string;
  activeTrainers: number;
  completionRate: number;
  onTimeRate: number;
}

interface DepartmentData {
  name: string;
  sessions: number;
  hours: number;
  trainers: number;
  completionRate: number;
}

interface TrendData {
  date: string;
  sessions: number;
  completed: number;
  hours: number;
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

interface ClassMetrics {
  totalScheduledClasses: number;
  totalSessions: number;
  completedSessions: number;
  inProgressSessions: number;
  totalTrainers: number;
  activeTrainers: number;
  totalHours: string;
  averageSessionDuration: string;
  completionRate: number;
  onTimeRate: number;
  lateRate: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const AdminClassAnalytics: React.FC = () => {
  const [subjectUtilization, setSubjectUtilization] = useState<SubjectUtilizationData[]>([]);
  const [departmentData, setDepartmentData] = useState<DepartmentData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [metrics, setMetrics] = useState<ClassMetrics>({
    totalScheduledClasses: 0,
    totalSessions: 0,
    completedSessions: 0,
    inProgressSessions: 0,
    totalTrainers: 0,
    activeTrainers: 0,
    totalHours: '0',
    averageSessionDuration: '0',
    completionRate: 0,
    onTimeRate: 0,
    lateRate: 0
  });
  const [trainerPerformance, setTrainerPerformance] = useState<TrainerPerformanceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'term'>('week');
  const [groupBy, setGroupBy] = useState<'subject' | 'class' | 'trainer' | 'department'>('subject');

  const fetchClassAnalytics = async () => {
    if (subjectUtilization.length === 0) {
      setIsLoading(true);
    }
    
    try {
      // Calculate date range
      const endDate = new Date();
      let startDate = new Date();
      
      switch (timeRange) {
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'term':
          startDate.setMonth(endDate.getMonth() - 3); // Approximate term length
          break;
      }

      // Fetch attendance report
      const reportResponse = await fetch(
        `/api/attendance/class-attendance-report?` +
        `start_date=${startDate.toISOString().split('T')[0]}&` +
        `end_date=${endDate.toISOString().split('T')[0]}&` +
        `group_by=${groupBy}&` +
        `include_details=false`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (reportResponse.ok) {
        const reportData = await reportResponse.json();
        
        // Set metrics from totals
        setMetrics({
          totalScheduledClasses: reportData.totals.totalClasses || 0,
          totalSessions: reportData.totals.totalSessions || 0,
          completedSessions: reportData.totals.completedSessions || 0,
          inProgressSessions: reportData.totals.inProgressSessions || 0,
          totalTrainers: reportData.totals.totalTrainers || 0,
          activeTrainers: reportData.totals.totalTrainers || 0, // Active trainers with sessions
          totalHours: reportData.totals.totalHours || '0',
          averageSessionDuration: reportData.totals.averageSessionDuration || '0',
          completionRate: reportData.totals.completionRate || 0,
          onTimeRate: reportData.totals.onTimeRate || 0,
          lateRate: reportData.totals.lateRate || 0
        });

        // Process summary data based on grouping
        if (groupBy === 'subject') {
          const subjectData = reportData.summary.map((item: any) => ({
            subjectName: item.subject?.name || item.label,
            subjectCode: item.subject?.code || '',
            department: item.subject?.department || 'N/A',
            totalSessions: item.statistics.totalSessions,
            completedSessions: item.statistics.completedSessions,
            totalHours: item.statistics.totalHours,
            activeTrainers: item.statistics.totalSessions > 0 ? 1 : 0, // Simplified
            completionRate: item.statistics.completionRate,
            onTimeRate: item.statistics.onTimeRate
          }));
          setSubjectUtilization(subjectData);
        }

        // Process department data
        if (groupBy === 'department') {
          const deptData = reportData.summary.map((item: any) => ({
            name: item.department || item.label,
            sessions: item.statistics.totalSessions,
            hours: parseFloat(item.statistics.totalHours.replace(/[^\d.]/g, '')) || 0,
            trainers: item.statistics.totalSessions > 0 ? 1 : 0,
            completionRate: item.statistics.completionRate
          }));
          setDepartmentData(deptData);
        } else {
          // Aggregate department data from subject grouping
          const deptMap = new Map<string, any>();
          reportData.summary.forEach((item: any) => {
            const dept = item.subject?.department || 'Other';
            if (!deptMap.has(dept)) {
              deptMap.set(dept, {
                name: dept,
                sessions: 0,
                hours: 0,
                trainers: new Set(),
                completionRate: 0
              });
            }
            const deptItem = deptMap.get(dept);
            deptItem.sessions += item.statistics.totalSessions;
            const hours = parseFloat(item.statistics.totalHours.replace(/[^\d.]/g, '')) || 0;
            deptItem.hours += hours;
            deptItem.completionRate += item.statistics.completionRate;
          });
          
          const deptArray = Array.from(deptMap.values()).map(item => ({
            ...item,
            trainers: item.trainers.size || 1,
            completionRate: Math.round(item.completionRate / reportData.summary.length)
          }));
          setDepartmentData(deptArray);
        }

const trainerReportResponse = await fetch(
  `/api/attendance/class-attendance-report?` +
  `start_date=${startDate.toISOString().split('T')[0]}&` +
  `end_date=${endDate.toISOString().split('T')[0]}&` +
  `group_by=trainer&` +
  `include_details=false`,
  {
    method: 'GET',
    credentials: 'include',
  }
);

if (trainerReportResponse.ok) {
  const trainerData = await trainerReportResponse.json();
  
  const trainerPerf = trainerData.summary.map((item: any) => ({
    trainerId: item.trainer?.id || 0,
    trainerName: item.trainer?.name || item.label,
    department: item.trainer?.department || 'N/A',
    totalSessions: item.statistics.totalSessions,
    completedSessions: item.statistics.completedSessions,
    totalHours: item.statistics.totalHours,
    avgDuration: item.statistics.averageDuration,
    completionRate: item.statistics.completionRate,
    onTimeRate: item.statistics.onTimeRate,
    hasActiveSession: item.statistics.inProgressSessions > 0
  }));
  
  // Sort by total sessions descending
  trainerPerf.sort((a: any, b: any) => b.totalSessions - a.totalSessions);
  
  setTrainerPerformance(trainerPerf);
}

        // Generate trend data (simplified - you might want to fetch this separately)
        const days = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 90;
        const trend: TrendData[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          trend.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            sessions: Math.floor(Math.random() * 20) + 5, // Placeholder
            completed: Math.floor(Math.random() * 15) + 3,
            hours: Math.floor(Math.random() * 30) + 10
          });
        }
        setTrendData(trend);
      }
    } catch (error) {
      console.error('Error fetching class analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClassAnalytics();
    
    const interval = setInterval(fetchClassAnalytics, 600000); // 10 minutes
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timeRange || groupBy) {
      const timeoutId = setTimeout(() => {
        fetchClassAnalytics();
      }, 300);
      
      return () => clearTimeout(timeoutId);
    }
  }, [timeRange, groupBy]);

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
      <div className="flex flex-col sm:flex-row justify-between gap-4">
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

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subject/Class Utilization Chart */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600">
            <CardTitle className="text-white flex items-center">
              <BookOpen className="w-5 h-5 mr-2" />
              Sessions by {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={subjectUtilization.slice(0, 8)} 
                margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="subjectCode" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={12}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'totalSessions') return [value, 'Total Sessions'];
                    if (name === 'completedSessions') return [value, 'Completed'];
                    return [value, name];
                  }}
                  labelFormatter={(label) => {
                    const item = subjectUtilization.find(s => s.subjectCode === label);
                    return item ? item.subjectName : label;
                  }}
                />
                <Bar dataKey="totalSessions" fill="#3B82F6" name="Total Sessions" />
                <Bar dataKey="completedSessions" fill="#10B981" name="Completed" />
              </BarChart>
            </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={departmentData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="hours"
                  label={({ name, hours }) => `${name}: ${hours.toFixed(1)}h`}
                  labelLine={false}
                  fontSize={11}
                >
                  {departmentData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}h`, 'Hours']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

{/* Trainer Performance Overview - REPLACES Trend Chart */}
<Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
  <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600">
    <CardTitle className="text-white flex items-center">
      <Users className="w-5 h-5 mr-2" />
      Trainer Performance Overview
    </CardTitle>
  </CardHeader>
  <CardContent className="pt-6">
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
          {trainerPerformance.slice(0, 10).map((trainer, index) => (
            <tr 
              key={trainer.trainerId} 
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
                <span className="font-semibold text-gray-900">
                  {trainer.totalSessions}
                </span>
              </td>
              <td className="text-center py-3 px-4">
                <div className="flex flex-col items-center">
                  <span className="font-semibold text-green-600">
                    {trainer.completedSessions}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({trainer.completionRate}%)
                  </span>
                </div>
              </td>
              <td className="text-center py-3 px-4">
                <span className="font-semibold text-purple-600">
                  {trainer.totalHours}
                </span>
              </td>
              <td className="text-center py-3 px-4">
                <span className="text-gray-700">
                  {trainer.avgDuration}
                </span>
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
    
    {/* Summary Stats */}
    <div className="mt-6 pt-4 border-t border-gray-200 grid grid-cols-4 gap-4">
      <div className="text-center">
        <p className="text-sm text-gray-600">Total Trainers</p>
        <p className="text-2xl font-bold text-gray-900">{metrics.totalTrainers}</p>
      </div>
      <div className="text-center">
        <p className="text-sm text-gray-600">Active Now</p>
        <p className="text-2xl font-bold text-green-600">
          {trainerPerformance.filter(t => t.hasActiveSession).length}
        </p>
      </div>
      <div className="text-center">
        <p className="text-sm text-gray-600">Avg Sessions/Trainer</p>
        <p className="text-2xl font-bold text-blue-600">
          {(metrics.totalSessions / metrics.totalTrainers || 0).toFixed(1)}
        </p>
      </div>
      <div className="text-center">
        <p className="text-sm text-gray-600">Avg On-Time Rate</p>
        <p className="text-2xl font-bold text-purple-600">
          {metrics.onTimeRate}%
        </p>
      </div>
    </div>
  </CardContent>
</Card>

      {/* Performance Summary */}
      <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="bg-gradient-to-r from-amber-600 to-orange-600">
          <CardTitle className="text-white flex items-center">
            <Target className="w-5 h-5 mr-2" />
            Top Performing {groupBy === 'subject' ? 'Subjects' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1) + 's'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjectUtilization.slice(0, 6).map((item) => (
              <div key={item.subjectCode} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900 truncate">{item.subjectName}</h4>
                  <Badge variant="secondary">{item.subjectCode}</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Department:</span>
                    <span className="font-medium">{item.department}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Sessions:</span>
                    <span className="font-medium">{item.totalSessions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Completed:</span>
                    <span className="font-medium text-green-600">
                      {item.completedSessions}
                    </span>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminClassAnalytics;