// components/reports/ClassAttendanceReport.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calendar, User, BookOpen } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface ClassAttendanceReportProps {
  userRole: string;
}

export default function ClassAttendanceReport({ userRole }: ClassAttendanceReportProps) {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    trainerId: '',
    status: 'all'
  });
  const { toast } = useToast();

  const fetchClassAttendance = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (filters.startDate) params.append('start_date', filters.startDate);
      if (filters.endDate) params.append('end_date', filters.endDate);
      if (filters.trainerId) params.append('trainer_id', filters.trainerId);
      if (filters.status !== 'all') params.append('status', filters.status);
      
      const response = await fetch(`/api/report/class-attendance?${params.toString()}`, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch class attendance');
      
      const data = await response.json();
      setReportData(data);
    } catch (error) {
      console.error('Error fetching class attendance:', error);
      toast({
        title: 'Error',
        description: 'Failed to load class attendance report',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClassAttendance();
  }, [filters]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary'> = {
      'Present': 'default',
      'Late': 'secondary',
      'Absent': 'destructive'
    };
    
    return (
      <Badge variant={variants[status] || 'default'}>
        {status}
      </Badge>
    );
  };

  const formatTime = (time: string | null) => {
    if (!time) return '-';
    return new Date(time).toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const exportToCSV = () => {
    if (!reportData || !reportData.data) return;
    
    const headers = ['Date', 'Trainer', 'Class', 'Subject', 'Room', 'Time', 'Status', 'Check In', 'Check Out'];
    const rows: string[][] = [];
    
    reportData.data.forEach((day: any) => {
      day.records.forEach((record: any) => {
        rows.push([
          day.date,
          record.trainer?.name || 'N/A',
          record.class?.name || 'N/A',
          record.slot?.subject?.name || 'N/A',
          record.slot?.room?.name || 'N/A',
          record.slot?.lessonPeriod ? 
            `${formatTime(record.slot.lessonPeriod.start_time)} - ${formatTime(record.slot.lessonPeriod.end_time)}` : 
            'N/A',
          record.status,
          formatTime(record.checkInTime),
          formatTime(record.checkOutTime)
        ]);
      });
    });
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `class_attendance_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-gray-600">Loading class attendance data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Class Attendance Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="all">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Absent">Absent</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={exportToCSV} variant="outline" className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      {reportData?.statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{reportData.statistics.total}</div>
              <p className="text-sm text-gray-600">Total Classes</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {reportData.statistics.present} ({reportData.statistics.presentPercentage}%)
              </div>
              <p className="text-sm text-gray-600">Present</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">
                {reportData.statistics.late} ({reportData.statistics.latePercentage}%)
              </div>
              <p className="text-sm text-gray-600">Late</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {reportData.statistics.absent} ({reportData.statistics.absentPercentage}%)
              </div>
              <p className="text-sm text-gray-600">Absent</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Records by Day */}
      {reportData?.data && reportData.data.length > 0 ? (
        reportData.data.map((day: any) => (
          <Card key={day.date}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {new Date(day.date).toLocaleDateString('en-KE', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </CardTitle>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">✓ {day.summary.present}</span>
                  <span className="text-yellow-600">⚠ {day.summary.late}</span>
                  <span className="text-red-600">✗ {day.summary.absent}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {userRole === 'admin' && <TableHead>Trainer</TableHead>}
                    <TableHead>Class</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {day.records.map((record: any) => (
                    <TableRow key={record.id}>
                      {userRole === 'admin' && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            {record.trainer?.name || 'N/A'}
                          </div>
                        </TableCell>
                      )}
                      <TableCell>{record.class?.name || 'N/A'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-gray-400" />
                          {record.slot?.subject?.name || 'N/A'}
                          {record.isOnline && (
                            <Badge variant="outline" className="text-xs">Online</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{record.slot?.room?.name || 'N/A'}</TableCell>
                      <TableCell>
                        {record.slot?.lessonPeriod ? (
                          <div className="text-sm">
                            {formatTime(record.slot.lessonPeriod.start_time)} - {formatTime(record.slot.lessonPeriod.end_time)}
                          </div>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell className="text-sm">{formatTime(record.checkInTime)}</TableCell>
                      <TableCell className="text-sm">{formatTime(record.checkOutTime)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600">No class attendance records found for the selected period.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}