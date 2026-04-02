// app/timetable/subject-rooms/page.tsx
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, X, AlertTriangle, CheckCircle2, Loader2,
  RefreshCw, Info, Search, ChevronDown, ChevronUp,
  Filter, Plus, Check
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subject {
  id: number;
  name: string;
  code: string;
  department: string;
}

interface Room {
  id: number;
  name: string;
  capacity: number | null;
  room_type: string | null;
  department: string | null;
}

interface Mapping {
  id: number;
  subject_id: number;
  room_id: number;
  assigned_at: string;
  assigned_by: string;
}

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-sm text-white
            animate-in slide-in-from-bottom-2 duration-200
            ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
        >
          {toast.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Room Picker Popover ──────────────────────────────────────────────────────
// ─── Room Picker Popover ──────────────────────────────────────────────────────

function RoomPicker({
  subject,
  rooms,
  assignedRooms,
  savingKey,
  onAdd,
  onRemove,
}: {
  subject: Subject;
  rooms: Room[];
  assignedRooms: Room[];
  savingKey: string | null;
  onAdd: (subjectId: number, roomId: number) => Promise<void>;
  onRemove: (subjectId: number, roomId: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setRoomSearch('');
    }
  }, [open]);

  const assignedIds = new Set(assignedRooms.map(r => r.id));

  const filteredRooms = useMemo(() => {
    const term = roomSearch.trim().toLowerCase();
    if (!term) return rooms;
    return rooms.filter(r =>
      r.name.toLowerCase().includes(term) ||
      (r.room_type ?? '').toLowerCase().includes(term)
    );
  }, [rooms, roomSearch]);

  // Assigned at top, unassigned below — both respect the search filter
  const assignedFiltered = filteredRooms.filter(r => assignedIds.has(r.id));
  const unassignedFiltered = filteredRooms.filter(r => !assignedIds.has(r.id));

  const isWorking = (roomId: number) =>
    savingKey === `add-${subject.id}-${roomId}` ||
    savingKey === `del-${subject.id}-${roomId}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs gap-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add room
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-72 p-0 flex flex-col"
        style={{ maxHeight: 'min(380px, calc(100vh - 120px))' }}
        align="start"
        side="bottom"
        sideOffset={6}
        avoidCollisions={true}
        collisionPadding={16}
      >
        {/* Fixed header — never scrolls */}
        <div className="px-3 pt-3 pb-2 border-b shrink-0">
          <p className="text-sm font-medium truncate">{subject.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {assignedRooms.length} room{assignedRooms.length !== 1 ? 's' : ''} assigned
          </p>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={roomSearch}
              onChange={e => setRoomSearch(e.target.value)}
              placeholder="Search rooms..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border bg-background
                focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {roomSearch && (
              <button
                onClick={() => setRoomSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2
                  text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable room list — constrained, never overflows screen */}
        <div className="overflow-y-auto overscroll-contain flex-1 py-1 min-h-0">
          {filteredRooms.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No rooms match your search.
            </p>
          )}

          {/* ── Assigned rooms — checked + greyed out ── */}
          {assignedFiltered.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Assigned
              </p>
              {assignedFiltered.map(room => (
                <button
                  key={room.id}
                  onClick={() => onRemove(subject.id, room.id)}
                  disabled={isWorking(room.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left
                    bg-muted/60 hover:bg-destructive/10 hover:text-destructive
                    transition-colors group disabled:cursor-not-allowed"
                >
                  {/* Checkbox state */}
                  <div className="shrink-0">
                    {isWorking(room.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="w-4 h-4 rounded-sm bg-muted-foreground/30
                        border border-muted-foreground/20 flex items-center justify-center
                        group-hover:bg-destructive/20 group-hover:border-destructive/40
                        transition-colors">
                        <Check className="w-2.5 h-2.5 text-muted-foreground
                          group-hover:text-destructive transition-colors" />
                      </div>
                    )}
                  </div>

                  {/* Room info — greyed out to signal "already selected" */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block
                      text-muted-foreground group-hover:text-destructive transition-colors">
                      {room.name}
                    </span>
                    {room.room_type && (
                      <span className="text-xs text-muted-foreground/60">
                        {room.room_type}
                        {room.capacity ? ` · Cap: ${room.capacity}` : ''}
                      </span>
                    )}
                  </div>

                  {/* Remove hint on hover */}
                  <span className="text-xs text-muted-foreground/0 group-hover:text-destructive/70
                    transition-colors shrink-0 font-medium">
                    Remove
                  </span>
                </button>
              ))}
            </>
          )}

          {/* Divider */}
          {assignedFiltered.length > 0 && unassignedFiltered.length > 0 && (
            <div className="border-t my-1 mx-3" />
          )}

          {/* ── Unassigned rooms ── */}
          {unassignedFiltered.length > 0 && (
            <>
              {assignedFiltered.length > 0 && (
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Available
                </p>
              )}
              {unassignedFiltered.map(room => (
                <button
                  key={room.id}
                  onClick={() => onAdd(subject.id, room.id)}
                  disabled={isWorking(room.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left
                    hover:bg-muted transition-colors
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="shrink-0">
                    {isWorking(room.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="w-4 h-4 rounded-sm border-2
                        border-muted-foreground/30 shrink-0" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block">{room.name}</span>
                    {room.room_type && (
                      <span className="text-xs text-muted-foreground">
                        {room.room_type}
                        {room.capacity ? ` · Cap: ${room.capacity}` : ''}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Fixed footer — never scrolls */}
        <div className="border-t px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            {assignedRooms.length} of {rooms.length} assigned
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Subject Card ─────────────────────────────────────────────────────────────

function SubjectCard({
  subject,
  rooms,
  assignedRooms,
  savingKey,
  collapsed,
  onAdd,
  onRemove,
  onToggleCollapse,
}: {
  subject: Subject;
  rooms: Room[];
  assignedRooms: Room[];
  savingKey: string | null;
  collapsed: boolean;
  onAdd: (subjectId: number, roomId: number) => Promise<void>;
  onRemove: (subjectId: number, roomId: number) => Promise<void>;
  onToggleCollapse: (id: number) => void;
}) {
  const isMapped = assignedRooms.length > 0;

  return (
    <Card
      className={`transition-all duration-150
        ${isMapped
          ? 'border-l-4 border-l-green-500'
          : 'border-l-4 border-l-amber-400'
        }`}
    >
      <CardContent className="p-4">
        {/* Card header row */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{subject.name}</span>
              <Badge variant="secondary" className="text-xs shrink-0">{subject.code}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Room count pill */}
            <span className={`text-xs rounded-full px-2 py-0.5 font-medium
              ${isMapped
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
              }`}
            >
              {assignedRooms.length} room{assignedRooms.length !== 1 ? 's' : ''}
            </span>

            {/* Room picker */}
            <RoomPicker
              subject={subject}
              rooms={rooms}
              assignedRooms={assignedRooms}
              savingKey={savingKey}
              onAdd={onAdd}
              onRemove={onRemove}
            />

            {/* Collapse toggle — only if mapped */}
            {isMapped && (
              <button
                onClick={() => onToggleCollapse(subject.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronUp className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Assigned room pills — collapsible */}
        {!collapsed && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {assignedRooms.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                No rooms assigned — click "Add room" to assign.
              </span>
            ) : (
              assignedRooms.map(room => {
                const delKey = `del-${subject.id}-${room.id}`;
                const isDeleting = savingKey === delKey;
                return (
                  <span
                    key={room.id}
                    className="inline-flex items-center gap-1 bg-primary/10 text-primary
                      text-xs rounded-full px-2.5 py-0.5 font-medium"
                  >
                    {room.name}
                    {room.room_type && (
                      <span className="text-primary/60">· {room.room_type}</span>
                    )}
                    {isDeleting ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-0.5" />
                    ) : (
                      <button
                        onClick={() => onRemove(subject.id, room.id)}
                        className="hover:text-destructive transition-colors ml-0.5"
                        title={`Remove ${room.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SubjectRoomsPage() {
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ─── Toasts ──────────────────────────────────────────────────────────────

  const pushToast = (type: 'success' | 'error', message: string) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, type, message }]);
    const timer = setTimeout(() => dismissToast(id), 4000);
    toastTimers.current.set(id, timer);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) { clearTimeout(timer); toastTimers.current.delete(id); }
  };

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await fetch('/api/timetable/subject-rooms');
      if (res.status === 401) { router.push('/login'); return; }
      if (res.status === 403) { router.push('/dashboard'); return; }
      if (!res.ok) {
        const data = await res.json();
        setPageError(data.error || 'Failed to load data. Please try again.');
        return;
      }
      const data = await res.json();
      setSubjects(data.subjects);
      setRooms(data.rooms);
      setMappings(data.mappings);
    } catch {
      setPageError('Network error. Check your connection and try refreshing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const departments = useMemo(() =>
    [...new Set(subjects.map(s => s.department))].sort(),
    [subjects]
  );

  const unmappedCountByDept = useMemo(() => {
    const map = new Map<string, number>();
    subjects.forEach(s => {
      const hasMappings = mappings.some(m => m.subject_id === s.id);
      if (!hasMappings) map.set(s.department, (map.get(s.department) ?? 0) + 1);
    });
    return map;
  }, [subjects, mappings]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter(s => {
      const matchesDept = selectedDept === 'all' || s.department === selectedDept;
      const term = search.trim().toLowerCase();
      const matchesSearch = !term ||
        s.name.toLowerCase().includes(term) ||
        s.code.toLowerCase().includes(term);
      return matchesDept && matchesSearch;
    });
  }, [subjects, selectedDept, search]);

  const getRoomsForSubject = (subjectId: number): Room[] => {
    const roomIds = mappings.filter(m => m.subject_id === subjectId).map(m => m.room_id);
    return rooms.filter(r => roomIds.includes(r.id));
  };

  const unmappedSubjects = subjects.filter(s => !mappings.some(m => m.subject_id === s.id));
  const mappedCount = subjects.length - unmappedSubjects.length;

  // ─── Collapse ─────────────────────────────────────────────────────────────

  const toggleCollapse = (id: number) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const collapseAll = () =>
    setCollapsedIds(new Set(
      subjects
        .filter(s => mappings.some(m => m.subject_id === s.id))
        .map(s => s.id)
    ));

  const expandAll = () => setCollapsedIds(new Set());

  // ─── Add mapping ──────────────────────────────────────────────────────────

  const addMapping = async (subjectId: number, roomId: number) => {
    if (mappings.some(m => m.subject_id === subjectId && m.room_id === roomId)) return;
    const key = `add-${subjectId}-${roomId}`;
    setSavingKey(key);
    try {
      const res = await fetch('/api/timetable/subject-rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, room_id: roomId })
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Failed to assign room.');
        return;
      }
      setMappings(prev => [...prev, data.mapping]);
      // Auto-expand so user sees the new pill
      setCollapsedIds(prev => { const n = new Set(prev); n.delete(subjectId); return n; });
      const subject = subjects.find(s => s.id === subjectId);
      const room = rooms.find(r => r.id === roomId);
      pushToast('success', `${room?.name} assigned to ${subject?.name}.`);
    } catch {
      pushToast('error', 'Network error. The mapping was not saved.');
    } finally {
      setSavingKey(null);
    }
  };

  // ─── Remove mapping ───────────────────────────────────────────────────────

  const removeMapping = async (subjectId: number, roomId: number) => {
    const key = `del-${subjectId}-${roomId}`;
    setSavingKey(key);
    try {
      const res = await fetch('/api/timetable/subject-rooms', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, room_id: roomId })
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.error || 'Failed to remove room.');
        return;
      }
      setMappings(prev =>
        prev.filter(m => !(m.subject_id === subjectId && m.room_id === roomId))
      );
      const subject = subjects.find(s => s.id === subjectId);
      const room = rooms.find(r => r.id === roomId);
      pushToast('success', `${room?.name} removed from ${subject?.name}.`);
    } catch {
      pushToast('error', 'Network error. The mapping was not removed.');
    } finally {
      setSavingKey(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subject — Room Assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign rooms to each subject. The timetable generator will only schedule
            a subject in its assigned rooms.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="shrink-0">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Persistent error banner */}
      {pageError && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{pageError}</span>
            <Button variant="ghost" size="sm" onClick={fetchData} className="shrink-0 h-7 px-2">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Unmapped warning banner */}
      {!pageError && unmappedSubjects.length > 0 && (
        <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription>
            <span className="font-medium">
              {unmappedSubjects.length} subject{unmappedSubjects.length > 1 ? 's have' : ' has'} no room assigned
            </span>
            {' '}— timetable generation will be blocked until all subjects have at least one room.
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {unmappedSubjects.slice(0, 12).map(s => (
                <Badge
                  key={s.id}
                  variant="outline"
                  className="border-amber-500 text-amber-800 dark:text-amber-300 text-xs"
                >
                  {s.code}
                </Badge>
              ))}
              {unmappedSubjects.length > 12 && (
                <Badge
                  variant="outline"
                  className="border-amber-500 text-amber-800 dark:text-amber-300 text-xs"
                >
                  +{unmappedSubjects.length - 12} more
                </Badge>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* All mapped banner */}
      {!pageError && unmappedSubjects.length === 0 && subjects.length > 0 && (
        <Alert className="border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
          <AlertDescription>
            All {subjects.length} subjects have at least one room assigned.
            Timetable generation is unblocked.
          </AlertDescription>
        </Alert>
      )}

      {/* Hint */}
      {!pageError && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Click <strong>Add room</strong> on any subject card to assign rooms.
            A subject can have multiple rooms — the generator will pick the best available one.
            Rooms can also be shared across multiple subjects.
          </span>
        </div>
      )}

      {!pageError && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by subject name or code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="sm:w-64">
              <Select value={selectedDept} onValueChange={setSelectedDept}>
                <SelectTrigger>
                  <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    All departments
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({subjects.length})
                    </span>
                  </SelectItem>
                  {departments.map(dept => {
                    const total = subjects.filter(s => s.department === dept).length;
                    const unmapped = unmappedCountByDept.get(dept) ?? 0;
                    return (
                      <SelectItem key={dept} value={dept}>
                        <span className="flex items-center gap-2">
                          {dept}
                          <span className="text-xs text-muted-foreground">({total})</span>
                          {unmapped > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-700
                              dark:bg-amber-900 dark:text-amber-300
                              rounded-full px-1.5 py-0.5 font-medium">
                              {unmapped} unmapped
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={collapseAll}>
                <ChevronUp className="w-4 h-4 mr-1" /> Collapse all
              </Button>
              <Button variant="outline" size="sm" onClick={expandAll}>
                <ChevronDown className="w-4 h-4 mr-1" /> Expand all
              </Button>
            </div>
          </div>

          {/* Summary row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Showing{' '}
              <span className="font-medium text-foreground">{filteredSubjects.length}</span>
              {' '}of{' '}
              <span className="font-medium text-foreground">{subjects.length}</span>
              {' '}subjects
            </span>
            <span>·</span>
            <span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {mappedCount}
              </span> mapped,{' '}
              <span className={`font-medium ${
                unmappedSubjects.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground'
              }`}>
                {unmappedSubjects.length}
              </span> unmapped
            </span>
            {(search || selectedDept !== 'all') && (
              <>
                <span>·</span>
                <button
                  onClick={() => { setSearch(''); setSelectedDept('all'); }}
                  className="text-primary hover:underline"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>

          {/* Subject list */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
              <BookOpen className="w-4 h-4" />
              Subjects
            </div>

            {filteredSubjects.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {search || selectedDept !== 'all'
                  ? 'No subjects match your filters.'
                  : 'No active subjects found.'}
              </div>
            )}

            {filteredSubjects.map(subject => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                rooms={rooms}
                assignedRooms={getRoomsForSubject(subject.id)}
                savingKey={savingKey}
                collapsed={collapsedIds.has(subject.id)}
                onAdd={addMapping}
                onRemove={removeMapping}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </div>
        </>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}