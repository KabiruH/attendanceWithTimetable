// app/api/report/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';
import { cookies } from 'next/headers';
import jsPDF from 'jspdf';
import autoTable, { type Styles } from 'jspdf-autotable';

interface JwtPayload {
  id: number;
  email: string;
  role: string;
  name: string;
}

interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: Date;
  check_in_time: Date | null;
  check_out_time: Date | null;
  status: string;
  sessions: any;
  users?: {
    id: number;
    name: string;
    department: string | null;
  };
}

interface DepartmentStats {
  staff: Set<number>;
  records: number;
  present: number;
  late: number;
  absent: number;
  onDuty: number;
  leave: number;
}

interface LateDayStats {
  // Mon–Fri: late count and total records for that weekday
  byWeekday: { day: string; late: number; records: number }[];
  // Specific dates with the most late arrivals
  topDates: { date: string; weekday: string; late: number; records: number }[];
}

const UNASSIGNED = 'Unassigned';
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Normalise a raw status into one of: present, late, absent, on duty, leave
function normalizeStatus(raw: string): string {
  const status = raw.toLowerCase().trim();
  if (status === 'present' || status === 'late' || status === 'on duty' || status === 'leave') {
    return status;
  }
  return 'absent'; // 'absent', 'not checked in' and anything unexpected
}

// Attendance rate excludes excused days (on duty, leave) from the denominator
function attendanceRate(s: { records: number; present: number; late: number; onDuty: number; leave: number }): string {
  const expected = s.records - s.onDuty - s.leave;
  if (expected <= 0) return '-';
  return `${(((s.present + s.late) / expected) * 100).toFixed(1)}%`;
}

interface AnalyticsData {
  totalRecords: number;
  statusCounts: Record<string, number>;
  statusPercentages: Record<string, string>;
  checkInTimes: Record<string, number>;
  peakCheckInTime: string;
  lateCount: number;
  latePercentage: string;
  avgWorkHours: string;
  employeeStats: Record<string, {
    totalDays: number;
    present: number;
    late: number;
    absent: number;
    onDuty: number;
    leave: number;
    totalHours: number;
  }>;
}

// Leave & official duty statuses (lowercased) — never counted as absent
const LEAVE_STATUSES = ['on duty', 'leave'];

// Title-case a status for display: 'on duty' → 'On Duty'
function displayStatus(status: string): string {
  return status
    .split(' ')
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Authenticate user using JWT
async function authenticateUser(request: NextRequest): Promise<JwtPayload | null> {
  try {
    const token = (await cookies()).get('token');
    if (!token) {
      return null;
    }

    const { payload } = await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );

    return payload as unknown as JwtPayload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

// Helper to get employee name
function getEmployeeName(record: AttendanceRecord): string {
  return record.users?.name || 'Unknown';
}

// Calculate hours worked with 6PM cutoff
function calculateHours(record: AttendanceRecord): number {
  const currentTime = new Date();

  // Use sessions data if available
  if (record.sessions && Array.isArray(record.sessions) && record.sessions.length > 0) {
    let totalMinutes = 0;

    record.sessions.forEach((session: any) => {
      if (session.check_in) {
        const checkIn = new Date(session.check_in);
        const sixPM = new Date(checkIn);
        sixPM.setHours(18, 0, 0, 0);

        let effectiveCheckOut: Date;

        if (session.check_out) {
          const actualCheckOut = new Date(session.check_out);
          effectiveCheckOut = actualCheckOut > sixPM ? sixPM : actualCheckOut;
        } else {
          effectiveCheckOut = currentTime >= sixPM ? sixPM : currentTime;
        }

        const diffInMs = effectiveCheckOut.getTime() - checkIn.getTime();
        const diffInMinutes = Math.max(0, Math.floor(diffInMs / (1000 * 60)));
        totalMinutes += diffInMinutes;
      }
    });

    return totalMinutes / 60;
  }

  // Fallback to old format
  if (!record.check_in_time) return 0;

  const checkIn = new Date(record.check_in_time);
  const sixPM = new Date(checkIn);
  sixPM.setHours(18, 0, 0, 0);

  let effectiveCheckOut: Date;

  if (record.check_out_time) {
    const actualCheckOut = new Date(record.check_out_time);
    effectiveCheckOut = actualCheckOut > sixPM ? sixPM : actualCheckOut;
  } else {
    const recordDate = new Date(record.date).toDateString();
    const today = new Date().toDateString();
    if (recordDate === today) {
      effectiveCheckOut = currentTime >= sixPM ? sixPM : currentTime;
    } else {
      return 0;
    }
  }

  const diffInMs = effectiveCheckOut.getTime() - checkIn.getTime();
  const diffInMinutes = Math.max(0, Math.floor(diffInMs / (1000 * 60)));

  return diffInMinutes / 60;
}

// Calculate comprehensive analytics
function calculateAnalytics(data: AttendanceRecord[]): AnalyticsData {
  const totalRecords = data.length;

  // Status distribution - treat "not checked in" as "absent"
  // 'on duty' and 'leave' are their own statuses, NEVER folded into absent
  const statusCounts: Record<string, number> = {};
  data.forEach(record => {
    let status = record.status.toLowerCase().trim();

    // Treat "not checked in" as "absent" for reporting
    if (status.includes('not check') || status === 'not checked in') {
      status = 'absent';
    }

    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  // Check-in time distribution (group by hour)
const checkInTimes: Record<string, number> = {};
data.forEach(record => {
  if (record.check_in_time || (record.sessions && record.sessions[0]?.check_in)) {
    const checkInTime = record.sessions?.[0]?.check_in || record.check_in_time;
    const date = new Date(checkInTime);

    // Convert UTC to Nairobi time properly
    const nairobiHour = new Date(date.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })).getHours();
    const timeSlot = `${nairobiHour.toString().padStart(2, '0')}:00`;
    checkInTimes[timeSlot] = (checkInTimes[timeSlot] || 0) + 1;
  }
});

  // Late arrivals
  const lateCount = data.filter(record => {
    const status = record.status.toLowerCase().trim();
    return status === 'late';
  }).length;

  // Average work hours
  const workHours = data
    .map(record => calculateHours(record))
    .filter(hours => hours > 0);
  const avgWorkHours = workHours.length > 0
    ? workHours.reduce((sum, h) => sum + h, 0) / workHours.length
    : 0;

  // Employee-specific stats
  const employeeStats: Record<string, any> = {};
  data.forEach(record => {
    const empName = getEmployeeName(record);

    if (!employeeStats[empName]) {
      employeeStats[empName] = {
        totalDays: 0,
        present: 0,
        late: 0,
        absent: 0,
        onDuty: 0,
        leave: 0,
        totalHours: 0,
      };
    }

    employeeStats[empName].totalDays++;

    let status = record.status.toLowerCase().trim();

    // Flexible matching for status — leave/official duty are counted in their
    // own columns and are NOT absences
    if (status === 'on duty') {
      employeeStats[empName].onDuty++;
    } else if (status === 'leave') {
      employeeStats[empName].leave++;
    } else if (status.includes('not check') || status === 'not checked in' || status === 'absent') {
      employeeStats[empName].absent++;
    } else if (status === 'present') {
      employeeStats[empName].present++;
    } else if (status === 'late') {
      employeeStats[empName].late++;
    } else {
      employeeStats[empName].absent++;
    }

    employeeStats[empName].totalHours += calculateHours(record);
  });

  // Calculate percentages
  const statusPercentages: Record<string, string> = {};
  Object.entries(statusCounts).forEach(([status, count]) => {
    statusPercentages[status] = ((count / totalRecords) * 100).toFixed(1);
  });

  // Find peak check-in time
  const peakCheckInTime = Object.entries(checkInTimes)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  return {
    totalRecords,
    statusCounts,
    statusPercentages,
    checkInTimes,
    peakCheckInTime,
    lateCount,
    latePercentage: totalRecords > 0 ? ((lateCount / totalRecords) * 100).toFixed(1) : '0.0',
    avgWorkHours: avgWorkHours.toFixed(2),
    employeeStats,
  };
}

// Attendance per department, sorted by department name
function calculateDepartmentStats(
  data: AttendanceRecord[],
  resolveDept: (raw: string | null | undefined) => string
): [string, DepartmentStats][] {
  const stats: Record<string, DepartmentStats> = {};

  data.forEach(record => {
    const dept = resolveDept(record.users?.department);
    if (!stats[dept]) {
      stats[dept] = { staff: new Set(), records: 0, present: 0, late: 0, absent: 0, onDuty: 0, leave: 0 };
    }
    const s = stats[dept];
    s.staff.add(record.employee_id);
    s.records++;

    switch (normalizeStatus(record.status)) {
      case 'present': s.present++; break;
      case 'late': s.late++; break;
      case 'on duty': s.onDuty++; break;
      case 'leave': s.leave++; break;
      default: s.absent++;
    }
  });

  return Object.entries(stats).sort((a, b) => {
    // Keep 'Unassigned' at the bottom
    if (a[0] === UNASSIGNED) return 1;
    if (b[0] === UNASSIGNED) return -1;
    return a[0].localeCompare(b[0]);
  });
}

// Which weekdays, and which specific dates, have the most late arrivals
function calculateLateDays(data: AttendanceRecord[]): LateDayStats {
  // attendance.date is @db.Date (stored as UTC midnight), so use UTC getters
  const weekday: Record<number, { late: number; records: number }> = {};
  const byDate: Record<string, { late: number; records: number; weekday: string }> = {};

  data.forEach(record => {
    const d = new Date(record.date);
    const dayIdx = d.getUTCDay();
    const dateKey = d.toISOString().split('T')[0];
    const isLate = normalizeStatus(record.status) === 'late';

    weekday[dayIdx] = weekday[dayIdx] || { late: 0, records: 0 };
    weekday[dayIdx].records++;
    if (isLate) weekday[dayIdx].late++;

    byDate[dateKey] = byDate[dateKey] || { late: 0, records: 0, weekday: WEEKDAY_NAMES[dayIdx] };
    byDate[dateKey].records++;
    if (isLate) byDate[dateKey].late++;
  });

  const byWeekday = [1, 2, 3, 4, 5].map(idx => ({
    day: WEEKDAY_NAMES[idx],
    late: weekday[idx]?.late || 0,
    records: weekday[idx]?.records || 0,
  }));

  const topDates = Object.entries(byDate)
    .filter(([, v]) => v.late > 0)
    .sort((a, b) => b[1].late - a[1].late || b[0].localeCompare(a[0]))
    .slice(0, 5)
    .map(([date, v]) => ({ date, weekday: v.weekday, late: v.late, records: v.records }));

  return { byWeekday, topDates };
}

// Format time for display
function formatTime(timeStr: Date | string | null | undefined): string {
  if (!timeStr) return '-';
  try {
    return new Date(timeStr).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return '-';
  }
}

// Format date for display
function formatDate(date: Date | string): string {
  try {
    return new Date(date).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return '-';
  }
}

// Generate PDF using jsPDF
function generatePDF(
  data: AttendanceRecord[],
  analytics: AnalyticsData,
  options: { startDate?: string; endDate?: string },
  userName: string,
  extras: {
    departmentStats: [string, DepartmentStats][];
    lateDays: LateDayStats;
    showDepartments: boolean; // true for an admin "All Departments" report
    resolveDept: (raw: string | null | undefined) => string;
  }
): Buffer {
  const doc = new jsPDF();
  let yPosition = 20;

  // Helper function to add page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > 280) {
      doc.addPage();
      yPosition = 20;
      return true;
    }
    return false;
  };

  // Title
  doc.setFontSize(20);
  doc.setTextColor(30, 64, 175);
  doc.text('Attendance Report', 105, yPosition, { align: 'center' });
  yPosition += 10;

  // Date range
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  let dateRangeText = 'Report Period: ';
  if (options.startDate && options.endDate) {
    dateRangeText += `${options.startDate} to ${options.endDate}`;
  } else if (options.startDate) {
    dateRangeText += `From ${options.startDate}`;
  } else if (options.endDate) {
    dateRangeText += `Until ${options.endDate}`;
  } else {
    dateRangeText += 'All Records';
  }
  doc.text(dateRangeText, 105, yPosition, { align: 'center' });
  yPosition += 5;

  doc.text(`Generated: ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`, 105, yPosition, { align: 'center' });
  doc.text(`Report for: ${userName}`, 105, yPosition + 5, { align: 'center' });
  yPosition += 15;

  const headStyles = { fillColor: [30, 64, 175] as [number, number, number], textColor: 255 };
  const sectionTitle = (title: string, space = 50) => {
    checkPageBreak(space);
    doc.setFontSize(14);
    doc.setTextColor(30, 64, 175);
    doc.text(title, 14, yPosition);
    yPosition += 8;
  };
  const afterTable = () => {
    yPosition = (doc as any).lastAutoTable.finalY + 10;
  };

  // Overview (one compact table replaces the old executive summary,
  // status breakdown and check-in distribution sections)
  sectionTitle('Overview');

  const sc = analytics.statusCounts;
  const pct = (s: string) => analytics.statusPercentages[s] ? ` (${analytics.statusPercentages[s]}%)` : '';
  const overallRate = attendanceRate({
    records: analytics.totalRecords,
    present: sc['present'] || 0,
    late: sc['late'] || 0,
    onDuty: sc['on duty'] || 0,
    leave: sc['leave'] || 0,
  });

  autoTable(doc, {
    startY: yPosition,
    head: [['Records', 'Present', 'Late', 'Absent', 'On Duty', 'Leave', 'Attendance', 'Avg Hours']],
    body: [[
      analytics.totalRecords.toString(),
      `${sc['present'] || 0}${pct('present')}`,
      `${sc['late'] || 0}${pct('late')}`,
      `${sc['absent'] || 0}${pct('absent')}`,
      (sc['on duty'] || 0).toString(),
      (sc['leave'] || 0).toString(),
      overallRate,
      `${analytics.avgWorkHours}h`,
    ]],
    theme: 'grid',
    headStyles: { ...headStyles, halign: 'center', fontSize: 8 },
    styles: { fontSize: 8, halign: 'center' },
  });
  afterTable();

  // Attendance by department (only on all-department admin reports)
  if (extras.showDepartments && extras.departmentStats.length > 0) {
    sectionTitle('Attendance by Department');

    autoTable(doc, {
      startY: yPosition,
      head: [['Department', 'Staff', 'Present', 'Late', 'Absent', 'On Duty', 'Leave', 'Attendance']],
      body: extras.departmentStats.map(([dept, s]) => [
        dept,
        s.staff.size.toString(),
        s.present.toString(),
        s.late.toString(),
        s.absent.toString(),
        s.onDuty.toString(),
        s.leave.toString(),
        attendanceRate(s),
      ]),
      theme: 'grid',
      headStyles: { ...headStyles, fontSize: 8 },
      alternateRowStyles: { fillColor: [243, 244, 246] },
      styles: { fontSize: 8, halign: 'center' },
      columnStyles: { 0: { halign: 'left', cellWidth: 50 } },
    });
    afterTable();
  }

  // Late arrivals by day
  sectionTitle('Late Arrivals by Day', 60);

  const maxWeekdayLate = Math.max(...extras.lateDays.byWeekday.map(d => d.late));
  autoTable(doc, {
    startY: yPosition,
    head: [['Weekday', 'Late Arrivals', 'Records', 'Late %']],
    body: extras.lateDays.byWeekday.map(d => [
      d.late > 0 && d.late === maxWeekdayLate ? `${d.day} (most late)` : d.day,
      d.late.toString(),
      d.records.toString(),
      d.records > 0 ? `${((d.late / d.records) * 100).toFixed(1)}%` : '-',
    ]),
    theme: 'grid',
    headStyles: { ...headStyles, halign: 'center', fontSize: 8 },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    styles: { fontSize: 8, halign: 'center' },
    columnStyles: { 0: { halign: 'left' } },
  });
  afterTable();

  if (extras.lateDays.topDates.length > 0) {
    checkPageBreak(45);
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text('Dates with the most late arrivals', 14, yPosition);
    yPosition += 4;

    autoTable(doc, {
      startY: yPosition,
      head: [['Date', 'Weekday', 'Late Arrivals', 'Late %']],
      body: extras.lateDays.topDates.map(d => [
        formatDate(d.date),
        d.weekday,
        d.late.toString(),
        `${((d.late / d.records) * 100).toFixed(1)}%`,
      ]),
      theme: 'grid',
      headStyles: { ...headStyles, halign: 'center', fontSize: 8 },
      styles: { fontSize: 8, halign: 'center' },
    });
    afterTable();
  }

  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  checkPageBreak(8);
  doc.text('Attendance = (Present + Late) / (Records - On Duty - Leave). Weekends are excluded.', 14, yPosition);

  // Employee Statistics
  doc.addPage();
  yPosition = 20;
  doc.setFontSize(14);
  doc.setTextColor(30, 64, 175);
  doc.text('Employee Statistics', 14, yPosition);
  yPosition += 8;

  // Department per employee (for the column and for grouping)
  const empDept: Record<string, string> = {};
  data.forEach(record => {
    empDept[getEmployeeName(record)] = extras.resolveDept(record.users?.department);
  });

  const empEntries = Object.entries(analytics.employeeStats).sort((a, b) => {
    if (extras.showDepartments) {
      const da = empDept[a[0]] || UNASSIGNED;
      const dbb = empDept[b[0]] || UNASSIGNED;
      if (da !== dbb) {
        if (da === UNASSIGNED) return 1;
        if (dbb === UNASSIGNED) return -1;
        return da.localeCompare(dbb);
      }
    }
    return a[0].localeCompare(b[0]);
  });

  const empData = empEntries.map(([name, stats]) => {
    const avgHours = stats.totalDays > 0 ? stats.totalHours / stats.totalDays : 0;
    const row = [
      name.substring(0, 25),
      stats.totalDays.toString(),
      stats.present.toString(),
      stats.late.toString(),
      stats.absent.toString(),
      stats.onDuty.toString(),
      stats.leave.toString(),
      `${avgHours.toFixed(1)}h`,
    ];
    if (extras.showDepartments) {
      row.splice(1, 0, (empDept[name] || UNASSIGNED).substring(0, 22));
    }
    return row;
  });

  const empHead = extras.showDepartments
    ? [['Employee', 'Department', 'Days', 'Present', 'Late', 'Absent', 'On Duty', 'Leave', 'Avg Hours']]
    : [['Employee', 'Days', 'Present', 'Late', 'Absent', 'On Duty', 'Leave', 'Avg Hours']];

  const empColumns: Record<string, Partial<Styles>> = extras.showDepartments
    ? {
        0: { cellWidth: 36, halign: 'left' },
        1: { cellWidth: 30, halign: 'left' },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 13, halign: 'center' },
        5: { cellWidth: 15, halign: 'center' },
        6: { cellWidth: 16, halign: 'center' },
        7: { cellWidth: 14, halign: 'center' },
        8: { cellWidth: 18, halign: 'center' },
      }
    : {
        0: { cellWidth: 36, halign: 'left' },
        1: { cellWidth: 17, halign: 'center' },
        2: { cellWidth: 19, halign: 'center' },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 19, halign: 'center' },
        6: { cellWidth: 16, halign: 'center' },
        7: { cellWidth: 21, halign: 'center' },
      };

  autoTable(doc, {
    startY: yPosition,
    head: empHead,
    body: empData,
    theme: 'grid',
    headStyles: { ...headStyles, fontSize: 8 },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: empColumns,
  });

  // Add page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

// POST endpoint
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { startDate, endDate } = body;
    // Raw users.department value, or 'Unassigned'. Only admins can filter by department.
    const department: string | undefined =
      user.role === 'admin' && typeof body.department === 'string' && body.department.trim()
        ? body.department.trim()
        : undefined;

    // users.department is free text that may hold a department name or code;
    // resolve it to the display name from the departments table where possible
    const deptRows = await db.departments.findMany({ select: { name: true, code: true } });
    const deptLookup = new Map<string, string>();
    deptRows.forEach(d => {
      deptLookup.set(d.name.toLowerCase(), d.name);
      deptLookup.set(d.code.toLowerCase(), d.name);
    });
    const resolveDept = (raw: string | null | undefined): string => {
      const value = raw?.trim();
      if (!value) return UNASSIGNED;
      return deptLookup.get(value.toLowerCase()) || value;
    };

    const departmentFilter = department
      ? department === UNASSIGNED
        ? { users: { OR: [{ department: null }, { department: '' }] } }
        : { users: { department } }
      : {};

    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    const isWeekday = (date: Date) => {
      const day = new Date(date).getDay();
      return day !== 0 && day !== 6;
    };

    let attendanceData: AttendanceRecord[];

    if (user.role === 'admin') {
      attendanceData = await db.attendance.findMany({
        where: {
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
          ...departmentFilter,
        },
        include: {
          users: {
            select: { id: true, name: true, department: true },
          },
        },
        orderBy: [
          { date: 'desc' },
          { users: { name: 'asc' } },
        ],
      });
    } else {
      attendanceData = await db.attendance.findMany({
        where: {
          employee_id: user.id,
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        },
        include: {
          users: {
            select: { id: true, name: true, department: true },
          },
        },
        orderBy: { date: 'desc' },
      });
    }

    // ✅ Filter out weekends before any processing
    attendanceData = attendanceData.filter(r => isWeekday(r.date));

    if (attendanceData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No attendance records found for the selected period' },
        { status: 404 }
      );
    }

    const analytics = calculateAnalytics(attendanceData);
    const showDepartments = user.role === 'admin' && !department;

    const reportFor = user.role !== 'admin'
      ? user.name
      : department
        ? `${department === UNASSIGNED ? UNASSIGNED : resolveDept(department)} Department`
        : 'All Departments';

    const pdfBuffer = generatePDF(
      attendanceData,
      analytics,
      { startDate, endDate },
      reportFor,
      {
        departmentStats: showDepartments ? calculateDepartmentStats(attendanceData, resolveDept) : [],
        lateDays: calculateLateDays(attendanceData),
        showDepartments,
        resolveDept,
      }
    );

    const deptSlug = department
      ? department.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      : user.role === 'admin' ? 'all_departments' : 'personal';
    const filename = `attendance_report_${deptSlug}_${new Date().toISOString().split('T')[0]}.pdf`;

    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate PDF report' },
      { status: 500 }
    );
  }
}