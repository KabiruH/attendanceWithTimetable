// components/reports/ClassAttendanceReport.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calendar, User, BookOpen, FileDown, Loader2 } from 'lucide-react';
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

const ALL_PERIODS = 'all';

/** Stable key for a lesson period, from its stored wall-clock times */
function periodKey(lp: any): string | null {
  if (!lp?.start_time || !lp?.end_time) return null;
  return `${lessonClock(lp.start_time, true)}-${lessonClock(lp.end_time, true)}`;
}

/**
 * Lesson period times are wall-clock digits stored in UTC fields (an 8 AM
 * class is 08:00Z), so they must be read in UTC — formatting them in the
 * browser's zone is what shifted them by 3 hours.
 */
function lessonClock(value: string | null | undefined, raw24 = false): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if (raw24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Check-in/out times are real instants — always show them in Nairobi time */
function instantClock(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatDay(date: string): string {
  return new Date(date).toLocaleDateString('en-KE', {
    timeZone: 'UTC', // `date` is a calendar day (stored as UTC midnight)
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function summarise(records: any[]) {
  const present = records.filter(r => r.status === 'Present').length;
  const late = records.filter(r => r.status === 'Late').length;
  const absent = records.filter(r => r.status === 'Absent').length;
  return { present, late, absent };
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
  // Period filter is applied on the client (no refetch needed)
  const [period, setPeriod] = useState<string>(ALL_PERIODS);
  const [exporting, setExporting] = useState(false);
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

  // ── Period filter ───────────────────────────────────────────────────────
  const periodOptions = useMemo(() => {
    const map = new Map<string, { key: string; name: string; label: string }>();
    (reportData?.data || []).forEach((day: any) =>
      day.records.forEach((r: any) => {
        const lp = r.slot?.lessonPeriod;
        const key = periodKey(lp);
        if (key && !map.has(key)) {
          map.set(key, {
            key,
            name: lp.name || key,
            label: `${lessonClock(lp.start_time)} – ${lessonClock(lp.end_time)}`
          });
        }
      })
    );
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [reportData]);

  // Drop a period that isn't in the newly loaded data
  useEffect(() => {
    if (period !== ALL_PERIODS && !periodOptions.some(p => p.key === period)) {
      setPeriod(ALL_PERIODS);
    }
  }, [periodOptions, period]);

  const selectedPeriod = periodOptions.find(p => p.key === period) ?? null;

  // Days with only the records for the chosen period (empty days dropped)
  const visibleDays = useMemo(() => {
    const days = reportData?.data || [];
    if (period === ALL_PERIODS) return days;
    return days
      .map((day: any) => {
        const records = day.records.filter((r: any) => periodKey(r.slot?.lessonPeriod) === period);
        return { ...day, records, summary: summarise(records) };
      })
      .filter((day: any) => day.records.length > 0);
  }, [reportData, period]);

  // Statistics: the server's figures, or recomputed when a period is picked
  const statistics = useMemo(() => {
    if (period === ALL_PERIODS) return reportData?.statistics ?? null;
    const records = visibleDays.flatMap((d: any) => d.records);
    const { present, late, absent } = summarise(records);
    const total = records.length;
    const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0');
    return {
      total,
      present, late, absent,
      presentPercentage: pct(present),
      latePercentage: pct(late),
      absentPercentage: pct(absent)
    };
  }, [period, reportData, visibleDays]);

  const lessonTime = (record: any) =>
    record.slot?.lessonPeriod
      ? `${lessonClock(record.slot.lessonPeriod.start_time)} - ${lessonClock(record.slot.lessonPeriod.end_time)}`
      : 'N/A';

  const exportToCSV = () => {
    if (visibleDays.length === 0) return;
    
    const headers = ['Date', 'Trainer', 'Class', 'Subject', 'Room', 'Time', 'Status', 'Check In', 'Check Out'];
    const rows: string[][] = [];
    
    visibleDays.forEach((day: any) => {
      day.records.forEach((record: any) => {
        rows.push([
          day.date,
          record.trainer?.name || 'N/A',
          record.class?.name || 'N/A',
          record.slot?.subject?.name || 'N/A',
          record.slot?.room?.name || 'N/A',
          lessonTime(record),
          record.status,
          instantClock(record.checkInTime),
          instantClock(record.checkOutTime)
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

  // ── PDF export of what is on screen ─────────────────────────────────────
  const exportToPDF = async () => {
    if (visibleDays.length === 0 || !statistics) return;
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const showTrainer = userRole === 'admin';

      doc.setFontSize(16);
      doc.setTextColor(30, 64, 175);
      doc.text('Class Attendance Report', pageWidth / 2, 16, { align: 'center' });

      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      const rangeText = filters.startDate && filters.endDate
        ? `${filters.startDate} to ${filters.endDate}`
        : filters.startDate ? `From ${filters.startDate}`
        : filters.endDate ? `Until ${filters.endDate}`
        : 'All dates';
      const filterText = [
        `Period: ${selectedPeriod ? `${selectedPeriod.name} (${selectedPeriod.label})` : 'All periods'}`,
        `Dates: ${rangeText}`,
        filters.status !== 'all' ? `Status: ${filters.status}` : null
      ].filter(Boolean).join('   ·   ');
      doc.text(filterText, pageWidth / 2, 22, { align: 'center' });

      // Summary
      autoTable(doc, {
        startY: 27,
        head: [['Total Classes', 'Present', 'Late', 'Absent']],
        body: [[
          String(statistics.total),
          `${statistics.present} (${statistics.presentPercentage}%)`,
          `${statistics.late} (${statistics.latePercentage}%)`,
          `${statistics.absent} (${statistics.absentPercentage}%)`
        ]],
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, halign: 'center', fontSize: 9 },
        styles: { fontSize: 9, halign: 'center' },
        margin: { left: 60, right: 60 }
      });

      let y = (doc as any).lastAutoTable.finalY + 8;

      const head = [[
        ...(showTrainer ? ['Trainer'] : []),
        'Class', 'Subject', 'Room', 'Time', 'Status', 'Check In', 'Check Out'
      ]];

      visibleDays.forEach((day: any) => {
        if (y > doc.internal.pageSize.getHeight() - 30) {
          doc.addPage();
          y = 16;
        }
        doc.setFontSize(11);
        doc.setTextColor(30, 64, 175);
        doc.text(formatDay(day.date), 14, y);
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text(
          `Present ${day.summary.present}   ·   Late ${day.summary.late}   ·   Absent ${day.summary.absent}`,
          pageWidth - 14, y, { align: 'right' }
        );

        autoTable(doc, {
          startY: y + 3,
          head,
          body: day.records.map((r: any) => [
            ...(showTrainer ? [r.trainer?.name || 'N/A'] : []),
            r.class?.name || 'N/A',
            `${r.slot?.subject?.name || 'N/A'}${r.isOnline ? ' (Online)' : ''}`,
            r.slot?.room?.name || 'N/A',
            lessonTime(r),
            r.status,
            instantClock(r.checkInTime),
            instantClock(r.checkOutTime)
          ]),
          theme: 'grid',
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8 },
          styles: { fontSize: 7.5, cellPadding: 1.8 },
          alternateRowStyles: { fillColor: [243, 244, 246] },
          didParseCell: (data) => {
            if (data.section !== 'body') return;
            const status = day.records[data.row.index]?.status;
            if (status === 'Absent') data.cell.styles.fillColor = [254, 226, 226];
            else if (status === 'Late') data.cell.styles.fillColor = [254, 243, 199];
          }
        });

        y = (doc as any).lastAutoTable.finalY + 8;
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `Generated ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}   ·   Page ${i} of ${pageCount}`,
          pageWidth / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' }
        );
      }

      const slug = selectedPeriod ? `_${selectedPeriod.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}` : '';
      doc.save(`class_attendance${slug}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({ title: 'Export failed', description: 'Could not generate the PDF.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
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
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

            <div>
              <label className="text-sm font-medium mb-2 block">Lesson Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value={ALL_PERIODS}>All Periods</option>
                {periodOptions.map(p => (
                  <option key={p.key} value={p.key}>
                    {p.name} ({p.label})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={exportToCSV} variant="outline" className="w-full" disabled={visibleDays.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>

            <div className="flex items-end">
              <Button onClick={exportToPDF} className="w-full" disabled={exporting || visibleDays.length === 0}>
                {exporting
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <FileDown className="mr-2 h-4 w-4" />}
                Export PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statistics.total}</div>
              <p className="text-sm text-gray-600">Total Classes</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {statistics.present} ({statistics.presentPercentage}%)
              </div>
              <p className="text-sm text-gray-600">Present</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">
                {statistics.late} ({statistics.latePercentage}%)
              </div>
              <p className="text-sm text-gray-600">Late</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {statistics.absent} ({statistics.absentPercentage}%)
              </div>
              <p className="text-sm text-gray-600">Absent</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Records by Day */}
      {visibleDays.length > 0 ? (
        visibleDays.map((day: any) => (
          <Card key={day.date}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {formatDay(day.date)}
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
                        <div className="text-sm">{lessonTime(record)}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell className="text-sm">{instantClock(record.checkInTime)}</TableCell>
                      <TableCell className="text-sm">{instantClock(record.checkOutTime)}</TableCell>
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
            <p className="text-gray-600">
              {selectedPeriod
                ? `No class attendance records for ${selectedPeriod.name} in the selected dates.`
                : 'No class attendance records found for the selected period.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}