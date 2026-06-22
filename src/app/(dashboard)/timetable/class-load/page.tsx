'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronUp, ChevronDown, X, Filter, Clock, LayoutGrid, Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeptSummary { name: string; total: number; over: number }

interface ClassSummary {
  id: number;
  name: string;
  code: string;
  department: string;
  total_periods: number;
  total_hours: number;
  periods_max: number;
  hours_max: number;
  gap: number;
  subject_count: number;
  assigned_trainer_count: number;
  status: 'ok' | 'over';
}

interface CombinedClass {
  session_number: number;
  combined_class_id: number;
  combined_class_name: string;
  combined_class_code: string;
  combined_trainer: string;
}

interface ClassSubjectDetail {
  class_subject_id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  subject_department: string;
  classification: string;
  sessions_per_week: number;
  lesson_type: string;
  periods_consumed: number;
  hours_per_week: number;
  is_active: boolean;
  default_sessions_per_week: number;
  default_lesson_type: string;
  trainer: { id: number; name: string } | null;
  combined_with: CombinedClass[];
}

interface ClassDetail {
  term: { id: number; name: string };
  class: { id: number; name: string; code: string; department: string };
  subjects: ClassSubjectDetail[];
  total_periods: number;
  total_hours: number;
  periods_max: number;
  hours_max: number;
  gap: number;
  status: 'ok' | 'over';
}

interface Term { id: number; name: string; start_date: string; end_date: string }

interface PageSummary {
  total_classes: number;
  ok: number;
  over: number;
  departments: DeptSummary[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const LESSON_TYPES = ['single', 'double', 'triple'];
const SESSION_OPTIONS = Array.from({ length: 21 }, (_, i) => i);

const classificationColor: Record<string, string> = {
  basic:  'bg-blue-100 text-blue-700 border-blue-200',
  common: 'bg-purple-100 text-purple-700 border-purple-200',
  core:   'bg-orange-100 text-orange-700 border-orange-200',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusConfig(status: 'ok' | 'over', gap: number, totalHours: number) {
  if (status === 'over') return {
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200',
    badgeCls: 'bg-red-100 text-red-700 border-red-200',
    barColor: 'bg-red-400',
    label: `${Math.abs(gap) * 2} hrs over limit`,
    icon: <AlertTriangle className="h-4 w-4 text-red-500" />
  };
  return {
    color: 'text-emerald-600',
    bg: 'bg-white border-border',
    badgeCls: 'bg-muted text-muted-foreground border-border',
    barColor: 'bg-emerald-400',
    label: `${totalHours} hrs`,
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  };
}

function HoursBar({ hours, max }: { hours: number; max: number }) {
  const pct = Math.min((hours / max) * 100, 100);
  const over = hours > max;
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : 'bg-emerald-400'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Subject row (inline editable) ─────────────────────────────────────────────

function SubjectRow({
  subject, classId, onUpdated,
}: {
  subject: ClassSubjectDetail;
  classId: number;
  onUpdated: (updated: Partial<ClassSubjectDetail>) => void;
}) {
  const [sessions, setSessions] = useState(subject.sessions_per_week);
  const [lessonType, setLessonType] = useState(subject.lesson_type);
  const [saving, setSaving] = useState(false);

  const isDirty = sessions !== subject.sessions_per_week || lessonType !== subject.lesson_type;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/timetable/class-load/${classId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_subject_id: subject.class_subject_id,
          sessions_per_week: sessions,
          lesson_type: lessonType,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return; }
      toast.success(`${subject.subject_code} updated`);
      onUpdated({ sessions_per_week: sessions, lesson_type: lessonType, hours_per_week: sessions * 2 });
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-4 py-2.5 border-b last:border-b-0 text-sm
      ${!subject.is_active ? 'opacity-50' : ''}`}>

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{subject.subject_name}</span>
          <span className="font-mono text-xs text-muted-foreground">{subject.subject_code}</span>
          <Badge variant="outline" className={`text-xs capitalize h-4 px-1.5 ${classificationColor[subject.classification] || ''}`}>
            {subject.classification}
          </Badge>
          {!subject.is_active && (
            <Badge variant="outline" className="text-xs h-4 px-1.5 text-muted-foreground">inactive</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {subject.trainer
            ? subject.trainer.name
            : <span className="text-red-500">No trainer assigned</span>}
        </span>
        {subject.combined_with.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {/* Group by session_number */}
            {Array.from(
              subject.combined_with.reduce((map, c) => {
                const existing = map.get(c.session_number) ?? [];
                existing.push(c);
                map.set(c.session_number, existing);
                return map;
              }, new Map<number, typeof subject.combined_with>())
            ).map(([session, classes]) => (
              <span
                key={session}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs text-indigo-700"
                title={`Session ${session} combined with: ${classes.map(c => `${c.combined_class_code} (${c.combined_trainer})`).join(', ')}`}
              >
                <span className="font-semibold">S{session}:</span>
                {classes.map(c => (
                  <span key={c.combined_class_id} className="font-mono">{c.combined_class_code}</span>
                )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`plus-${i}`}>+</span>, el], [])}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span className="text-xs text-muted-foreground">Sessions</span>
        <Select value={sessions.toString()} onValueChange={v => setSessions(parseInt(v))} disabled={!subject.is_active}>
          <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SESSION_OPTIONS.map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lesson type */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span className="text-xs text-muted-foreground">Type</span>
        <Select value={lessonType} onValueChange={setLessonType} disabled={!subject.is_active}>
          <SelectTrigger className="h-7 w-24 text-xs capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LESSON_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Hours */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span className="text-xs text-muted-foreground">Hrs/wk</span>
        <span className="text-sm font-semibold tabular-nums">{sessions * 2}</span>
      </div>

      {/* Save */}
      <div className="w-12 flex justify-end">
        {isDirty && (
          <Button size="sm" className="h-7 text-xs px-2" onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Class Detail Modal ─────────────────────────────────────────────────────────

function ClassDetailModal({ classId, onClose, onClassUpdated }: {
  classId: number;
  onClose: () => void;
  onClassUpdated: () => void;
}) {
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/timetable/class-load/${classId}`);
      if (!res.ok) throw new Error('Failed to load');
      setDetail(await res.json());
    } catch {
      toast.error('Failed to load class detail');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleSubjectUpdated = (classSubjectId: number, updated: Partial<ClassSubjectDetail>) => {
    setDetail(prev => {
      if (!prev) return prev;
      const subjects = prev.subjects.map(s =>
        s.class_subject_id === classSubjectId ? { ...s, ...updated } : s
      );
      const activeSubjects = subjects.filter(s => s.is_active);
      const totalPeriods = activeSubjects.reduce((sum, s) => sum + s.sessions_per_week, 0);
      const totalHours = totalPeriods * 2;
      const gap = prev.periods_max - totalPeriods;
      const status: ClassDetail['status'] = totalPeriods > prev.periods_max ? 'over' : 'ok';
      return { ...prev, subjects, total_periods: totalPeriods, total_hours: totalHours, gap, status };
    });
    onClassUpdated();
  };

  const cfg = detail ? statusConfig(detail.status, detail.gap, detail.total_hours) : null;
  const activeSubjects = detail?.subjects.filter(s => s.is_active) ?? [];
  const inactiveSubjects = detail?.subjects.filter(s => !s.is_active) ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto p-0">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="flex-1">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <LayoutGrid className="h-5 w-5 text-indigo-600" />
                {detail ? detail.class.name : 'Loading...'}
                {detail && (
                  <span className="font-mono text-sm text-muted-foreground font-normal">{detail.class.code}</span>
                )}
              </DialogTitle>
              <DialogDescription>
                {detail?.class.department} · {detail?.term.name}
              </DialogDescription>
            </DialogHeader>
            <button
              onClick={onClose}
              className="mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Load bar */}
          {detail && cfg && (
            <div className={`mt-3 rounded-lg border p-3 flex items-center gap-4 ${detail.status === 'over' ? 'bg-red-50 border-red-200' : 'bg-muted/30'}`}>
              {cfg.icon}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-semibold ${cfg.color}`}>
                    {detail.total_hours} hrs/week
                    {detail.status === 'over' && (
                      <span className="font-normal text-xs ml-1">(max {detail.hours_max} hrs)</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {detail.total_periods} periods
                    {detail.status === 'over' && ` — ${Math.abs(detail.gap)} over limit`}
                  </span>
                </div>
                <HoursBar hours={detail.total_hours} max={detail.hours_max} />
              </div>
              {detail.status === 'over' && (
                <Badge variant="outline" className="text-xs shrink-0 bg-red-100 text-red-700 border-red-200">
                  Exceeds 40 hrs
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : !detail ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Failed to load class detail.</AlertDescription>
              </Alert>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 bg-muted/40 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <span>Subject / Trainer</span>
                <span className="w-16 text-center">Sessions</span>
                <span className="w-24 text-center">Type</span>
                <span className="w-12 text-center">Hrs</span>
                <span className="w-12" />
              </div>

              {activeSubjects.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No active subjects assigned to this class for the current term.
                </div>
              ) : (
                activeSubjects.map(subject => (
                  <SubjectRow
                    key={subject.class_subject_id}
                    subject={subject}
                    classId={classId}
                    onUpdated={updated => handleSubjectUpdated(subject.class_subject_id, updated)}
                  />
                ))
              )}

              {inactiveSubjects.length > 0 && (
                <details className="border-t">
                  <summary className="px-4 py-2 text-xs text-muted-foreground cursor-pointer hover:bg-muted/30 select-none">
                    {inactiveSubjects.length} inactive subject{inactiveSubjects.length !== 1 ? 's' : ''} (not counted)
                  </summary>
                  {inactiveSubjects.map(subject => (
                    <SubjectRow
                      key={subject.class_subject_id}
                      subject={subject}
                      classId={classId}
                      onUpdated={updated => handleSubjectUpdated(subject.class_subject_id, updated)}
                    />
                  ))}
                </details>
              )}

              {/* Footer */}
              <div className="border-t px-4 py-3 flex items-center justify-between bg-muted/20">
                <span className="text-xs text-muted-foreground">
                  {activeSubjects.length} active · {activeSubjects.filter(s => s.trainer).length} with trainer
                </span>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Periods used</div>
                    <div className="text-sm font-bold tabular-nums">
                      {detail.total_periods}
                      <span className="text-muted-foreground font-normal text-xs"> / {detail.periods_max} max</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Hours</div>
                    <div className={`text-sm font-bold tabular-nums ${cfg?.color}`}>
                      {detail.total_hours}
                      <span className="text-muted-foreground font-normal text-xs"> / {detail.hours_max} hrs max</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Class Card ─────────────────────────────────────────────────────────────────

function ClassCard({ cls, onClick }: { cls: ClassSummary; onClick: () => void }) {
  const cfg = statusConfig(cls.status, cls.gap, cls.total_hours);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 group
        ${cls.status === 'over' ? 'border-red-200 bg-red-50' : 'border-border bg-white hover:border-indigo-200'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{cls.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{cls.code}</span>
          </div>
          <span className="text-xs text-muted-foreground">{cls.department}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {cfg.icon}
        </div>
      </div>

      <HoursBar hours={cls.total_hours} max={cls.hours_max} />

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className={`font-medium ${cfg.color}`}>{cls.total_hours} hrs · {cls.total_periods} periods</span>
        <span className="flex items-center gap-1 group-hover:text-indigo-600 transition-colors">
          <Pencil className="h-3 w-3" />
          {cls.subject_count}
        </span>
      </div>
    </button>
  );
}

// ── Department Filter Chips ────────────────────────────────────────────────────

function DeptChips({
  departments,
  selected,
  onChange,
}: {
  departments: DeptSummary[];
  selected: string;
  onChange: (dept: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange('all')}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors
          ${selected === 'all'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white text-muted-foreground border-border hover:border-indigo-300 hover:text-indigo-600'
          }`}
      >
        All
        <span className={`rounded-full px-1.5 py-0 text-xs ${selected === 'all' ? 'bg-indigo-500' : 'bg-muted'}`}>
          {departments.reduce((s, d) => s + d.total, 0)}
        </span>
      </button>

      {departments.map(dept => (
        <button
          key={dept.name}
          onClick={() => onChange(dept.name)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors
            ${selected === dept.name
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-muted-foreground border-border hover:border-indigo-300 hover:text-indigo-600'
            }`}
        >
          {dept.name}
          <span className={`rounded-full px-1.5 py-0 text-xs ${selected === dept.name ? 'bg-indigo-500' : 'bg-muted'}`}>
            {dept.total}
          </span>
          {dept.over > 0 && (
            <span className="rounded-full bg-red-100 text-red-600 px-1.5 py-0 text-xs">
              {dept.over} over
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ClassLoadPage() {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [summary, setSummary] = useState<PageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'over'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'hours' | 'status'>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/timetable/class-load');
      if (res.status === 403) { setError('You do not have permission to access this page.'); return; }
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to load'); return; }
      const data = await res.json();
      setTerm(data.term);
      setSummary(data.summary);
      setClasses(data.classes);
    } catch {
      setError('Network error. Failed to load class load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = classes
    .filter(c => {
      const matchSearch = !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === 'all' || c.department === deptFilter;
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'hours') cmp = a.total_hours - b.total_hours;
      else {
        // status: over first
        const order = { over: 0, ok: 1 };
        cmp = order[a.status] - order[b.status];
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading class load data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-6 w-6 text-indigo-600" />
            Class Load
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Max 20 sessions (40 hrs) per class per week. Below is fine — only exceeding 40 hrs is flagged.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 shrink-0">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Term banner */}
      {term && summary && (
        <div className="flex items-center gap-3 rounded-lg border bg-indigo-50 px-4 py-3 flex-wrap">
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-sm font-medium text-indigo-800">{term.name}</span>
          <span className="text-xs text-indigo-600">
            {new Date(term.start_date).toLocaleDateString()} — {new Date(term.end_date).toLocaleDateString()}
          </span>
          <div className="ml-auto flex items-center gap-3 text-xs flex-wrap">
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {summary.ok} ok
            </span>
            {summary.over > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {summary.over} over limit
              </span>
            )}
          </div>
        </div>
      )}

      {/* Department filter chips */}
      {summary && summary.departments.length > 1 && (
        <DeptChips
          departments={summary.departments}
          selected={deptFilter}
          onChange={setDeptFilter}
        />
      )}

      {/* Search + status + sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="ok">Within limit</SelectItem>
            <SelectItem value="over">Over 40 hrs</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort buttons */}
        <div className="flex items-center gap-1 border rounded-md h-9 px-1 text-xs">
          {(['status', 'name', 'hours'] as const).map(col => (
            <button
              key={col}
              onClick={() => toggleSort(col)}
              className={`flex items-center gap-1 px-2 py-1 rounded capitalize transition-colors
                ${sortBy === col ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {col} <SortIcon col={col} />
            </button>
          ))}
        </div>

        {(search || deptFilter !== 'all' || statusFilter !== 'all') && (
          <Button variant="ghost" size="sm"
            onClick={() => { setSearch(''); setDeptFilter('all'); setStatusFilter('all'); }}
            className="text-muted-foreground h-9"
          >
            Clear
          </Button>
        )}
      </div>

      {filtered.length !== classes.length && (
        <p className="text-sm text-muted-foreground">Showing {filtered.length} of {classes.length} classes</p>
      )}

      {/* Grid */}
      {classes.length === 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>No active classes found for the current term.</AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No classes match your filters.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(cls => (
            <ClassCard key={cls.id} cls={cls} onClick={() => setSelectedClassId(cls.id)} />
          ))}
        </div>
      )}

      {selectedClassId !== null && (
        <ClassDetailModal
          classId={selectedClassId}
          onClose={() => setSelectedClassId(null)}
          onClassUpdated={fetchData}
        />
      )}
    </div>
  );
}