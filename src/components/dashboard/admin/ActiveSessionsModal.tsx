// components/dashboard/admin/ActiveSessionsModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, RefreshCw, Wifi, CalendarX, FileDown, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export type CheckInState = 'checked_in' | 'checked_out' | 'upcoming' | 'awaiting' | 'missed' | 'absent';

export interface ScheduledSession {
  id: string;
  sessionSpan: number;
  startTime: string | null; // "08:00"
  endTime: string | null;   // "10:00"
  inSessionNow?: boolean;
  is_online_session?: boolean;
  users: { id: number; name: string; department: string | null };
  classes: { id: number; name: string; code: string; department: string };
  subjects: { id: number; name: string; code: string };
  rooms: { id: number; name: string } | null;
  checkIn: {
    state: CheckInState;
    time: string | null;
    status: string | null; // Present / Late
    attendanceId: number | null;
  };
}

export interface LessonPeriodOption {
  id: number;
  name: string;
  startTime: string; // "08:00"
  endTime: string;   // "09:00"
}

interface ActiveSessionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sessions running right now */
  sessions: ScheduledSession[];
  /** Every session on today's timetable (used when a period is picked) */
  todaySessions?: ScheduledSession[];
  lessonPeriods?: LessonPeriodOption[];
  onRefresh: () => void;
  isRefreshing?: boolean;
  checkInWindow?: { opensBefore: number; closesAfter: number } | null;
}

type StatusFilter = 'all' | 'checked_in' | 'not_checked_in';
const NOW = 'now';
const ALL = 'all';

const SPAN_LABEL: Record<number, string> = { 2: 'Double', 3: 'Triple' };

// Not-checked-in sessions first, so the ones needing attention are on top
const STATE_ORDER: Record<CheckInState, number> = {
  missed: 0,
  absent: 1,
  awaiting: 2,
  checked_in: 3,
  checked_out: 4,
  upcoming: 5,
};

const STATE_TEXT: Record<CheckInState, string> = {
  checked_in: 'Checked in',
  checked_out: 'Checked in (session ended)',
  upcoming: 'Not started',
  awaiting: 'Not yet (window open)',
  missed: 'Not checked in',
  absent: 'Marked absent',
};

const isCheckedIn = (s: ScheduledSession) =>
  s.checkIn.state === 'checked_in' || s.checkIn.state === 'checked_out';

/** "13:30" → "1:30 PM" */
function formatClock(hhmm: string | null): string {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Current Nairobi time as "HH:mm" */
function nairobiNowHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** A session covers a period if their time ranges overlap ("HH:mm" compares as text) */
function coversPeriod(s: ScheduledSession, p: LessonPeriodOption): boolean {
  if (!s.startTime || !s.endTime) return false;
  return s.startTime < p.endTime && s.endTime > p.startTime;
}

function checkInLabel(s: ScheduledSession): string {
  const { state, status, time } = s.checkIn;
  if (isCheckedIn(s)) {
    const base = status === 'Late' ? 'Checked in (late)' : 'Checked in';
    return time ? `${base} at ${formatTime(time)}` : base;
  }
  return STATE_TEXT[state];
}

function CheckInBadge({ session }: { session: ScheduledSession }) {
  const { state, time, status } = session.checkIn;

  switch (state) {
    case 'checked_in':
    case 'checked_out': {
      const late = status === 'Late';
      return (
        <div>
          <Badge className={late ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'}>
            {late ? 'Checked in (late)' : 'Checked in'}
          </Badge>
          {time && <div className="text-xs text-gray-500 mt-1">at {formatTime(time)}</div>}
        </div>
      );
    }
    case 'upcoming':
      return <Badge variant="secondary">Not started</Badge>;
    case 'awaiting':
      return (
        <div>
          <Badge className="bg-yellow-500 hover:bg-yellow-600">Not yet</Badge>
          <div className="text-xs text-gray-500 mt-1">Check-in window open</div>
        </div>
      );
    case 'missed':
      return (
        <div>
          <Badge className="bg-red-500 hover:bg-red-600">Not checked in</Badge>
          <div className="text-xs text-gray-500 mt-1">Window closed</div>
        </div>
      );
    case 'absent':
      return <Badge className="bg-red-600 hover:bg-red-700">Marked absent</Badge>;
  }
}

const ActiveSessionsModal: React.FC<ActiveSessionsModalProps> = ({
  open,
  onOpenChange,
  sessions,
  todaySessions = [],
  lessonPeriods = [],
  onRefresh,
  isRefreshing = false,
  checkInWindow,
}) => {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [period, setPeriod] = useState<string>(NOW);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  // Each time the modal opens, start from "Now"
  useEffect(() => {
    if (open) setPeriod(NOW);
  }, [open]);

  const nowHHMM = open ? nairobiNowHHMM() : '';
  const currentPeriodId = lessonPeriods.find(p => p.startTime <= nowHHMM && nowHHMM < p.endTime)?.id;
  const selectedPeriod = period === NOW ? null : lessonPeriods.find(p => String(p.id) === period) ?? null;

  // Sessions for the chosen period (or running now)
  const periodSessions = useMemo(
    () => (selectedPeriod ? todaySessions.filter(s => coversPeriod(s, selectedPeriod)) : sessions),
    [selectedPeriod, todaySessions, sessions]
  );

  const departments = useMemo(
    () => Array.from(new Set(periodSessions.map(s => s.classes?.department).filter(Boolean))).sort(),
    [periodSessions]
  );

  // Department dropdown resets if the chosen department isn't in this period
  useEffect(() => {
    if (department !== ALL && !departments.includes(department)) setDepartment(ALL);
  }, [departments, department]);

  const counts = useMemo(() => {
    const checkedIn = periodSessions.filter(isCheckedIn).length;
    const upcoming = periodSessions.filter(s => s.checkIn.state === 'upcoming').length;
    return {
      total: periodSessions.length,
      checkedIn,
      notCheckedIn: periodSessions.length - checkedIn - upcoming,
    };
  }, [periodSessions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return periodSessions
      .filter(s => {
        if (department !== ALL && s.classes?.department !== department) return false;
        if (statusFilter === 'checked_in' && !isCheckedIn(s)) return false;
        if (statusFilter === 'not_checked_in' && (isCheckedIn(s) || s.checkIn.state === 'upcoming')) return false;
        if (!q) return true;
        return [
          s.users?.name,
          s.classes?.name,
          s.classes?.code,
          s.subjects?.name,
          s.subjects?.code,
          s.rooms?.name,
        ].some(v => (v ?? '').toLowerCase().includes(q));
      })
      .sort(
        (a, b) =>
          STATE_ORDER[a.checkIn.state] - STATE_ORDER[b.checkIn.state] ||
          (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
          (a.users?.name ?? '').localeCompare(b.users?.name ?? '')
      );
  }, [periodSessions, search, department, statusFilter]);

  const periodLabel = selectedPeriod
    ? `${selectedPeriod.name} (${formatClock(selectedPeriod.startTime)} – ${formatClock(selectedPeriod.endTime)})`
    : 'Now';

  // ── PDF export of exactly what is on screen ───────────────────────────────
  const exportPDF = async () => {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString('en-KE', {
        timeZone: 'Africa/Nairobi',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      doc.setFontSize(16);
      doc.setTextColor(30, 64, 175);
      doc.text(selectedPeriod ? `Classes in ${selectedPeriod.name}` : 'Classes in Session', pageWidth / 2, 16, { align: 'center' });

      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      const filtersText = [
        `Period: ${periodLabel}`,
        `Department: ${department === ALL ? 'All' : department}`,
        statusFilter === 'all' ? null : `Status: ${statusFilter === 'checked_in' ? 'Checked in' : 'Not checked in'}`,
        search.trim() ? `Search: "${search.trim()}"` : null,
      ].filter(Boolean).join('   ·   ');
      doc.text(today, pageWidth / 2, 22, { align: 'center' });
      doc.text(filtersText, pageWidth / 2, 27, { align: 'center' });

      const checkedIn = filtered.filter(isCheckedIn).length;
      const upcoming = filtered.filter(s => s.checkIn.state === 'upcoming').length;
      doc.text(
        `${filtered.length} session${filtered.length !== 1 ? 's' : ''}   ·   ${checkedIn} checked in   ·   ${filtered.length - checkedIn - upcoming} not checked in` +
          (upcoming ? `   ·   ${upcoming} not started` : ''),
        pageWidth / 2, 32, { align: 'center' }
      );

      autoTable(doc, {
        startY: 37,
        head: [['Time', 'Class', 'Subject', 'Trainer', 'Department', 'Room', 'Check-in']],
        body: filtered.map(s => [
          `${formatClock(s.startTime)} – ${formatClock(s.endTime)}${SPAN_LABEL[s.sessionSpan] ? `\n${SPAN_LABEL[s.sessionSpan]}` : ''}`,
          `${s.classes?.name ?? ''}\n${s.classes?.code ?? ''}`,
          `${s.subjects?.name ?? ''}\n${s.subjects?.code ?? ''}`,
          s.users?.name ?? '',
          s.classes?.department ?? '',
          s.is_online_session ? 'Online' : s.rooms?.name || 'N/A',
          checkInLabel(s),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
        alternateRowStyles: { fillColor: [243, 244, 246] },
        columnStyles: {
          0: { cellWidth: 34 },
          6: { cellWidth: 46 },
        },
        // Shade rows that need attention, as on screen
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const s = filtered[data.row.index];
          if (s && (s.checkIn.state === 'missed' || s.checkIn.state === 'absent')) {
            data.cell.styles.fillColor = [254, 226, 226];
          }
        },
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

      const slug = selectedPeriod ? selectedPeriod.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'now';
      doc.save(`classes_${slug}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({ title: 'Export failed', description: 'Could not generate the PDF.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>{selectedPeriod ? `Classes in ${selectedPeriod.name}` : 'Classes in Session Now'}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting || filtered.length === 0}>
                {exporting
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <FileDown className="w-4 h-4 mr-2" />}
                Export PDF
              </Button>
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            {selectedPeriod
              ? `Every lesson on today's timetable during ${periodLabel}, who should be teaching it, and whether they checked in.`
              : 'Every lesson on the timetable right now, who should be teaching it, and whether they have checked in.'}
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg border p-3 text-left transition-colors ${statusFilter === 'all' ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-gray-50'}`}
          >
            <p className="text-xs text-gray-600">{selectedPeriod ? 'In this period' : 'In session'}</p>
            <p className="text-2xl font-bold text-indigo-700">{counts.total}</p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('checked_in')}
            className={`rounded-lg border p-3 text-left transition-colors ${statusFilter === 'checked_in' ? 'border-green-500 bg-green-50' : 'hover:bg-gray-50'}`}
          >
            <p className="text-xs text-gray-600">Checked in</p>
            <p className="text-2xl font-bold text-green-700">{counts.checkedIn}</p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('not_checked_in')}
            className={`rounded-lg border p-3 text-left transition-colors ${statusFilter === 'not_checked_in' ? 'border-red-500 bg-red-50' : 'hover:bg-gray-50'}`}
          >
            <p className="text-xs text-gray-600">Not checked in</p>
            <p className="text-2xl font-bold text-red-600">{counts.notCheckedIn}</p>
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by trainer, class, subject or room..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger>
              <SelectValue placeholder="Now" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOW}>Now</SelectItem>
              {lessonPeriods.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name} · {formatClock(p.startTime)} – {formatClock(p.endTime)}
                  {p.id === currentPeriodId ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger>
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

        {/* Table */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200">
          {periodSessions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CalendarX className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="font-medium">
                {selectedPeriod ? `No classes on the timetable in ${selectedPeriod.name}` : 'No classes on the timetable right now'}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Search className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="font-medium">No sessions match these filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-gray-50 z-10">
                <TableRow>
                  <TableHead className="font-semibold">Time</TableHead>
                  <TableHead className="font-semibold">Class</TableHead>
                  <TableHead className="font-semibold">Subject</TableHead>
                  <TableHead className="font-semibold">Trainer</TableHead>
                  <TableHead className="font-semibold">Room</TableHead>
                  <TableHead className="font-semibold">Check-in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow
                    key={s.id}
                    className={
                      s.checkIn.state === 'missed' || s.checkIn.state === 'absent'
                        ? 'bg-red-50/60 hover:bg-red-50'
                        : 'hover:bg-gray-50'
                    }
                  >
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm font-medium">
                        {formatClock(s.startTime)} – {formatClock(s.endTime)}
                      </div>
                      {SPAN_LABEL[s.sessionSpan] && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {SPAN_LABEL[s.sessionSpan]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{s.classes?.name}</div>
                      <div className="text-xs text-gray-500">{s.classes?.code} · {s.classes?.department}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{s.subjects?.name}</div>
                      <div className="text-xs text-gray-500">{s.subjects?.code}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{s.users?.name}</div>
                      {s.users?.department && (
                        <div className="text-xs text-gray-500">{s.users.department}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.is_online_session ? (
                        <Badge variant="outline" className="gap-1">
                          <Wifi className="w-3 h-3" /> Online
                        </Badge>
                      ) : (
                        <span className="text-sm">{s.rooms?.name || 'N/A'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <CheckInBadge session={s} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Showing {filtered.length} of {periodSessions.length}.
          {checkInWindow &&
            ` Check-in opens ${checkInWindow.opensBefore} minutes before a lesson and closes ${checkInWindow.closesAfter} minutes after it starts.`}
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default ActiveSessionsModal;