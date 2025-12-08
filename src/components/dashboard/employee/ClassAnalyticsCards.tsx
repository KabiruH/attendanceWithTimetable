// components/dashboard/employee/ClassAnalyticsCards.tsx
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { 
  GraduationCap, 
  Clock, 
  TrendingUp, 
  BookOpen,
  Target,
  Award,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface ClassAnalyticsCardsProps {
  userId?: string | null;
  showFullAnalytics?: boolean;
  onViewFullAnalytics?: () => void;
}

interface ClassAttendanceRecord {
  id: number;
  trainer_id: number;
  class_id: number;
  timetable_slot_id: string | null;
  date: Date;
  check_in_time: Date;
  check_out_time?: Date | null;
  status: string;
  location_verified: boolean;
  subject?: {
    id: number;
    name: string;
    code: string;
    department: string;
  } | null;
  classes: {
    id: number;
    name: string;
    code: string;
    department: string;
  };
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const ClassAnalyticsCards: React.FC<ClassAnalyticsCardsProps> = ({ 
  userId, 
  showFullAnalytics = false,
  onViewFullAnalytics 
}) => {
  const [attendanceHistory, setAttendanceHistory] = React.useState<ClassAttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('month');

  React.useEffect(() => {
    if (userId) {
      fetchClassAnalytics();
    }
  }, [userId, timeRange]);

  const fetchClassAnalytics = async () => {
    setIsLoading(true);
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
        case 'quarter':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
      }

      // Fetch attendance history
      const response = await fetch(
        `/api/attendance/class-attendance-history?` +
        `start_date=${startDate.toISOString().split('T')[0]}&` +
        `end_date=${endDate.toISOString().split('T')[0]}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAttendanceHistory(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching class analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateSessionHours = (record: ClassAttendanceRecord): number => {
    if (!record.check_out_time) return 0;
    
    const checkIn = new Date(record.check_in_time);
    const checkOut = new Date(record.check_out_time);
    const diffMs = checkOut.getTime() - checkIn.getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60));
  };

  const processSubjectData = () => {
    const subjectMap = new Map();

    attendanceHistory.forEach(record => {
      if (!record.check_out_time) return; // Skip incomplete sessions
      
      const subjectId = record.subject?.id || `class-${record.class_id}`;
      const subjectName = record.subject?.name || record.classes.name;
      const subjectCode = record.subject?.code || record.classes.code;
      const department = record.subject?.department || record.classes.department;
      const sessionHours = calculateSessionHours(record);

      if (subjectMap.has(subjectId)) {
        const existing = subjectMap.get(subjectId);
        existing.hours += sessionHours;
        existing.sessions += 1;
        existing.onTime += record.status === 'Present' ? 1 : 0;
        existing.late += record.status === 'Late' ? 1 : 0;
      } else {
        subjectMap.set(subjectId, {
          id: subjectId,
          name: subjectName,
          code: subjectCode,
          department,
          hours: sessionHours,
          sessions: 1,
          onTime: record.status === 'Present' ? 1 : 0,
          late: record.status === 'Late' ? 1 : 0,
          color: COLORS[subjectMap.size % COLORS.length]
        });
      }
    });

    return Array.from(subjectMap.values()).sort((a, b) => b.hours - a.hours);
  };

  const subjectData = processSubjectData();
  const completedSessions = attendanceHistory.filter(r => r.check_out_time);
  
  const totalHours = subjectData.reduce((sum, item) => sum + item.hours, 0);
  const totalSessions = completedSessions.length;
  const totalScheduled = attendanceHistory.length;
  const completionRate = totalScheduled > 0 ? Math.round((totalSessions / totalScheduled) * 100) : 0;
  const averageSessionLength = totalSessions > 0 ? totalHours / totalSessions : 0;
  const topSubject = subjectData.length > 0 ? subjectData[0] : null;
  
  // On-time statistics
  const onTimeCount = completedSessions.filter(r => r.status === 'Present').length;
  const lateCount = completedSessions.filter(r => r.status === 'Late').length;
  const onTimeRate = totalSessions > 0 ? Math.round((onTimeCount / totalSessions) * 100) : 0;

  // Department data for pie chart
const departmentData = subjectData.reduce((acc, curr) => {
  const existing = acc.find((item: {name: string, value: number, sessions: number}) => item.name === curr.department);
  if (existing) {
    existing.value += curr.hours;
    existing.sessions += curr.sessions;
  } else {
    acc.push({ 
      name: curr.department, 
      value: curr.hours,
      sessions: curr.sessions
    });
  }
  return acc;
}, [] as {name: string, value: number, sessions: number}[]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading class analytics...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (completedSessions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <BookOpen className="w-5 h-5 mr-2" />
              Class Training Summary
            </span>
            <div className="flex gap-1">
              {(['week', 'month', 'quarter'] as const).map((range) => (
                <Button
                  key={range}
                  variant={timeRange === range ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange(range)}
                  className="text-xs px-2 py-1 h-6"
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <GraduationCap className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No class training sessions found</p>
            <p className="text-sm">for the selected {timeRange}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-xs text-gray-600">Training Hours</p>
                <p className="text-lg font-bold">{totalHours.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-xs text-gray-600">Completed</p>
                <p className="text-lg font-bold">{totalSessions}</p>
                <p className="text-xs text-gray-500">{completionRate}% rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-purple-600" />
              <div>
                <p className="text-xs text-gray-600">On-Time</p>
                <p className="text-lg font-bold">{onTimeRate}%</p>
                <p className="text-xs text-gray-500">{onTimeCount}/{totalSessions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              <div>
                <p className="text-xs text-gray-600">Avg Session</p>
                <p className="text-lg font-bold">{averageSessionLength.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <BookOpen className="w-5 h-5 mr-2" />
              Class Training Analytics ({timeRange})
            </span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {(['week', 'month', 'quarter'] as const).map((range) => (
                  <Button
                    key={range}
                    variant={timeRange === range ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTimeRange(range)}
                    className="text-xs px-2 py-1 h-6"
                  >
                    {range.charAt(0).toUpperCase() + range.slice(1)}
                  </Button>
                ))}
              </div>
              {onViewFullAnalytics && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onViewFullAnalytics}
                  className="text-xs px-2 py-1 h-6"
                >
                  View Full Analytics
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Subjects */}
            <div>
              <h4 className="text-sm font-medium mb-3">Top Subjects by Hours</h4>
              <div className="space-y-2">
                {subjectData.slice(0, 5).map((subject) => {
                  const subjectOnTimeRate = subject.sessions > 0 
                    ? Math.round((subject.onTime / subject.sessions) * 100) 
                    : 0;
                  
                  return (
                    <div key={subject.id} className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                      <div className="flex items-center space-x-2 flex-1">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: subject.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{subject.name}</span>
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              {subject.code}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{subject.department}</span>
                            {subjectOnTimeRate >= 80 ? (
                              <Badge className="text-xs bg-green-500">
                                {subjectOnTimeRate}% on-time
                              </Badge>
                            ) : (
                              <Badge className="text-xs bg-orange-500">
                                {subjectOnTimeRate}% on-time
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm font-bold text-blue-700">{subject.hours.toFixed(1)}h</div>
                        <div className="text-xs text-gray-500">{subject.sessions} sessions</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Department Distribution */}
            <div>
              <h4 className="text-sm font-medium mb-3">Hours by Department</h4>
              {departmentData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={departmentData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value.toFixed(1)}h`}
                      labelLine={false}
                      fontSize={11}
                    >
                      {departmentData.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name, props) => [
                        `${Number(value).toFixed(1)}h (${props.payload.sessions} sessions)`, 
                        'Hours'
                      ]} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-500">
                  No data available
                </div>
              )}
            </div>
          </div>

          {/* Performance Summary */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Performer Badge */}
            {topSubject && (
              <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2">
                    <Award className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Most Active Subject</span>
                      <div className="font-bold text-blue-700 mt-1">{topSubject.name}</div>
                      <div className="text-sm text-gray-600">
                        {topSubject.hours.toFixed(1)}h • {topSubject.sessions} sessions
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Punctuality Summary */}
            <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border">
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700">Punctuality Rate</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-green-700">{onTimeRate}%</span>
                    <span className="text-sm text-gray-600">on-time</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 mt-2">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      {onTimeCount} on-time
                    </span>
                    {lateCount > 0 && (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-orange-600" />
                        {lateCount} late
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClassAnalyticsCards;