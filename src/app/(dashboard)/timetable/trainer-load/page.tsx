'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, BookOpen, ChevronDown, ChevronRight,
  Trash2, RefreshCw, Search, X, AlertTriangle,
  GraduationCap, Layers, BadgeCheck, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubjectAssignment {
  id: number;
  name: string;
  code: string;
  credit_hours: number;
  class_subject_id: number;
  is_assigned: boolean;
}

interface ClassAssignment {
  id: number; // trainerclassassignment id
  class_id: number;
  class: {
    id: number;
    name: string;
    code: string;
    department: string;
  };
  subjects: SubjectAssignment[];
}

interface Trainer {
  id: number;
  name: string;
  department: string | null;
  role: string;
  assignments: ClassAssignment[];
  totalClasses: number;
  totalSubjects: number;
}

interface Term {
  id: number;
  name: string;
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-1">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Subject Row ───────────────────────────────────────────────────────────────

function SubjectRow({
  subject,
  trainerId,
  termId,
  onRemoved,
}: {
  subject: SubjectAssignment;
  trainerId: number;
  termId: number;
  onRemoved: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/trainers/${trainerId}/subject-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_id: termId,
          class_subject_id: subject.class_subject_id,
          subject_id: subject.id,
          is_active: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove subject');
        return;
      }
      toast.success(`${subject.name} removed`);
      setConfirm(false);
      onRemoved();
    } catch {
      toast.error('Failed to remove subject assignment');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/30 group transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{subject.name}</span>
          <span className="font-mono text-xs text-muted-foreground shrink-0">{subject.code}</span>
          {subject.credit_hours > 0 && (
            <Badge variant="outline" className="text-xs h-4 px-1 shrink-0">
              {subject.credit_hours} cr
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirm(true)}
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 hover:bg-red-50"
          title="Remove subject assignment"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Remove Subject Assignment"
        description={`Remove "${subject.name}" from this trainer's assignments? The trainer will no longer be scheduled for this subject.`}
        onConfirm={handleRemove}
        onCancel={() => setConfirm(false)}
        loading={removing}
      />
    </>
  );
}

// ── Class Card ────────────────────────────────────────────────────────────────

function ClassCard({
  assignment,
  trainerId,
  termId,
  onClassRemoved,
  onSubjectRemoved,
}: {
  assignment: ClassAssignment;
  trainerId: number;
  termId: number;
  onClassRemoved: () => void;
  onSubjectRemoved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmClass, setConfirmClass] = useState(false);
  const [removing, setRemoving] = useState(false);

  const assignedSubjects = assignment.subjects.filter(s => s.is_assigned);

  const handleRemoveClass = async () => {
    setRemoving(true);
    try {
      // Step 1: deactivate all subject assignments for this class first
      if (assignedSubjects.length > 0) {
        const subjectResults = await Promise.all(
          assignedSubjects.map(subject =>
            fetch(`/api/trainers/${trainerId}/subject-assignments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                term_id: termId,
                class_subject_id: subject.class_subject_id,
                subject_id: subject.id,
                is_active: false,
              }),
            }).then(r => r.json().then(d => ({ ok: r.ok, data: d })))
          )
        );

        const failed = subjectResults.filter(r => !r.ok);
        if (failed.length > 0) {
          toast.error(`Failed to remove ${failed.length} subject assignment(s). Class not removed.`);
          return;
        }
      }

      // Step 2: remove the class assignment
      const res = await fetch(
        `/api/trainers/${trainerId}/assignments/${assignment.class_id}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove class assignment');
        return;
      }

      toast.success(`Removed from ${assignment.class.name}`);
      setConfirmClass(false);
      onClassRemoved();
    } catch {
      toast.error('Failed to remove class assignment');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-white overflow-hidden">
        {/* Class header */}
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            }
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-medium text-sm">{assignment.class.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{assignment.class.code}</span>
              {assignment.class.department && (
                <Badge variant="outline" className="text-xs h-5">
                  {assignment.class.department}
                </Badge>
              )}
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {assignedSubjects.length} subject{assignedSubjects.length !== 1 ? 's' : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClass(true)}
              className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
              title="Remove class assignment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Subjects */}
        {expanded && (
          <div className="border-t bg-muted/5 px-4 py-2 space-y-0.5">
            {assignedSubjects.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No subjects assigned in this class.
              </p>
            ) : (
              assignedSubjects.map(subject => (
                <SubjectRow
                  key={subject.class_subject_id}
                  subject={subject}
                  trainerId={trainerId}
                  termId={termId}
                  onRemoved={onSubjectRemoved}
                />
              ))
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClass}
        title="Remove Class Assignment"
        description={`Remove this trainer from "${assignment.class.name}"? ${assignedSubjects.length > 0 ? `Their ${assignedSubjects.length} subject assignment${assignedSubjects.length !== 1 ? 's' : ''} in this class will be removed first, then the class assignment.` : 'This class has no subject assignments.'}`}
        onConfirm={handleRemoveClass}
        onCancel={() => setConfirmClass(false)}
        loading={removing}
      />
    </>
  );
}

// ── Trainer Card ──────────────────────────────────────────────────────────────

function TrainerCard({
  trainer,
  termId,
  onRefresh,
}: {
  trainer: Trainer;
  termId: number;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const initials = trainer.name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Deterministic color from name
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-violet-100 text-violet-700',
    'bg-cyan-100 text-cyan-700',
    'bg-orange-100 text-orange-700',
    'bg-teal-100 text-teal-700',
  ];
  const colorClass = colors[trainer.name.charCodeAt(0) % colors.length];

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {/* Trainer header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/10 transition-colors text-left"
      >
        {/* Avatar */}
        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${colorClass}`}>
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{trainer.name}</span>
            {trainer.department && (
              <Badge variant="outline" className="text-xs h-5">
                {trainer.department}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {trainer.totalClasses} class{trainer.totalClasses !== 1 ? 'es' : ''}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              {trainer.totalSubjects} subject{trainer.totalSubjects !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Load indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {trainer.totalSubjects === 0 ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">No load</Badge>
          ) : trainer.totalSubjects <= 3 ? (
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50">Light</Badge>
          ) : trainer.totalSubjects <= 6 ? (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">Moderate</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">Heavy</Badge>
          )}
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Expanded class list */}
      {expanded && (
        <div className="border-t bg-muted/5 px-4 py-3 space-y-2">
          {trainer.assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No active class assignments this term.
            </p>
          ) : (
            trainer.assignments.map(assignment => (
              <ClassCard
                key={assignment.class_id}
                assignment={assignment}
                trainerId={trainer.id}
                termId={termId}
                onClassRemoved={onRefresh}
                onSubjectRemoved={onRefresh}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TrainerLoadPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [loadFilter, setLoadFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/trainers/trainer-load');
      if (res.status === 403) {
        setError('You do not have permission to access this page.');
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load trainer load data');
        return;
      }
      const data = await res.json();
      setTerm(data.term);

      // Map API response to component shape
      const mapped: Trainer[] = data.trainers.map((t: any) => ({
        id: t.id,
        name: t.name,
        department: t.department,
        role: t.role,
        totalClasses: t.total_classes,
        totalSubjects: t.total_subjects,
        assignments: t.classes.map((c: any) => ({
          id: 0, // not needed for display
          class_id: c.class_id,
          class: {
            id: c.class_id,
            name: c.class_name,
            code: c.class_code,
            department: c.class_department ?? '',
          },
          subjects: c.subjects.map((s: any) => ({
            id: s.subject_id,
            name: s.subject_name,
            code: s.subject_code,
            credit_hours: s.credit_hours,
            class_subject_id: s.class_subject_id,
            is_assigned: true,
          })),
        })),
      }));

      setTrainers(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trainer load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived data ────────────────────────────────────────────────────────────
  // Departments come from the classes trainers are assigned to, not the trainer's own department
  const departments = Array.from(
    new Set(
      trainers
        .flatMap(t => t.assignments.map(a => a.class.department))
        .filter(Boolean)
    )
  ).sort() as string[];

  const filtered = trainers.filter(t => {
    const matchesSearch =
      !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchesDept =
      departmentFilter === 'all' ||
      t.assignments.some(a => a.class.department === departmentFilter);
    const matchesLoad =
      loadFilter === 'all' ||
      (loadFilter === 'none' && t.totalSubjects === 0) ||
      (loadFilter === 'light' && t.totalSubjects > 0 && t.totalSubjects <= 3) ||
      (loadFilter === 'moderate' && t.totalSubjects > 3 && t.totalSubjects <= 6) ||
      (loadFilter === 'heavy' && t.totalSubjects > 6);
    return matchesSearch && matchesDept && matchesLoad;
  });

  // Reset to page 1 whenever filters or page size change
  useEffect(() => { setPage(1); }, [search, departmentFilter, loadFilter, pageSize]);

  // When a search term is active, show ALL matching results across every page
  // so the user isn't misled into thinking someone doesn't exist
  const isSearching = search.trim().length > 0;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = isSearching ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalClasses = trainers.reduce((s, t) => s + t.totalClasses, 0);
  const totalSubjects = trainers.reduce((s, t) => s + t.totalSubjects, 0);
  const heavyTrainers = trainers.filter(t => t.totalSubjects > 6).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-700 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading trainer assignments...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-8 p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-slate-700" />
            Trainer Load
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage class and subject assignments per trainer.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 shrink-0">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* ── Term banner ── */}
      {term && (
        <div className="flex items-center gap-3 rounded-lg border bg-slate-50 px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-slate-500 animate-pulse" />
          <span className="text-sm font-medium text-slate-700">
            Current Term: {term.name}
          </span>
          <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <GraduationCap className="h-3.5 w-3.5" />
              {trainers.length} trainers
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {totalClasses} class assignments
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              {totalSubjects} subject assignments
            </span>
            {heavyTrainers > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {heavyTrainers} heavy load
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search trainer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={loadFilter} onValueChange={setLoadFilter}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="All loads" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Loads</SelectItem>
            <SelectItem value="none">No load</SelectItem>
            <SelectItem value="light">Light (1–3)</SelectItem>
            <SelectItem value="moderate">Moderate (4–6)</SelectItem>
            <SelectItem value="heavy">Heavy (7+)</SelectItem>
          </SelectContent>
        </Select>

        {(search || departmentFilter !== 'all' || loadFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setDepartmentFilter('all'); setLoadFilter('all'); }}
            className="text-muted-foreground h-9"
          >
            Clear
          </Button>
        )}
      </div>

      {/* ── Results bar: count + page size ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {isSearching ? (
            // Search bypasses pagination — always show the full match count
            <>
              <span className="font-medium text-foreground">{filtered.length}</span>
              {` result${filtered.length !== 1 ? 's' : ''} for "${search}"`}
              {filtered.length !== trainers.length && ` (of ${trainers.length} trainers)`}
            </>
          ) : (
            <>
              {filtered.length === trainers.length
                ? `${trainers.length} trainer${trainers.length !== 1 ? 's' : ''}`
                : `${filtered.length} of ${trainers.length} trainers`}
              {filtered.length > 0 && !isSearching &&
                ` — showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)}`}
            </>
          )}
        </p>
        {/* Page size selector — hidden when search is active since all results show */}
        {!isSearching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">Show</span>
            <Select value={pageSize.toString()} onValueChange={v => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="shrink-0">per page</span>
          </div>
        )}
      </div>

      {/* ── Trainer list ── */}
      {trainers.length === 0 ? (
        <Alert>
          <BadgeCheck className="h-4 w-4" />
          <AlertDescription>
            No trainers have active assignments in the current term.
          </AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No trainers match your filters.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map(trainer => (
              <TrainerCard
                key={trainer.id}
                trainer={trainer}
                termId={term!.id}
                onRefresh={fetchData}
              />
            ))}
          </div>

          {/* ── Pagination controls — hidden when searching ── */}
          {!isSearching && totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 text-xs"
              >
                ← Previous
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`h-8 w-8 rounded-md text-xs font-medium transition-colors
                          ${page === p
                            ? 'bg-slate-800 text-white'
                            : 'hover:bg-muted text-muted-foreground'
                          }`}
                      >
                        {p}
                      </button>
                    )
                  )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 px-3 text-xs"
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}