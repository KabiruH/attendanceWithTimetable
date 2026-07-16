// components/attendance/LeaveManagement.tsx
'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface LeaveUser {
  id: number;
  name: string;
  department?: string | null;
  role?: string;
}

interface LeaveRecord {
  id: number;
  user_id: number;
  type: 'official_duty' | 'leave';
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: 'active' | 'cancelled';
  created_at: string;
  users: { id: number; name: string; department?: string | null };
  granted_by: { id: number; name: string };
}

const TYPE_LABELS: Record<string, string> = {
  official_duty: 'Official duty',
  leave: 'Leave',
};

function dayCount(start: string, end: string): number {
  const s = new Date(start.split('T')[0]);
  const e = new Date(end.split('T')[0]);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function derivedState(leave: LeaveRecord, today: string): string {
  if (leave.status === 'cancelled') return 'Ended';
  const start = leave.start_date.split('T')[0];
  const end = leave.end_date.split('T')[0];
  if (today < start) return 'Upcoming';
  if (today > end) return 'Completed';
  return 'Ongoing';
}

const STATE_STYLES: Record<string, string> = {
  Ongoing: 'bg-green-100 text-green-800',
  Upcoming: 'bg-blue-100 text-blue-800',
  Completed: 'bg-gray-100 text-gray-600',
  Ended: 'bg-red-100 text-red-700',
};

function LeaveManagement() {
  const [users, setUsers] = useState<LeaveUser[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [today, setToday] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [endingId, setEndingId] = useState<number | null>(null);

  // Form state
  const [userId, setUserId] = useState<string>('');
  const [type, setType] = useState<'official_duty' | 'leave'>('official_duty');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const fetchLeaves = async () => {
    try {
      const res = await fetch('/api/attendance/leave', { method: 'GET' });
      if (!res.ok) throw new Error('Failed to load leave records');
      const data = await res.json();
      setUsers(data.users || []);
      setLeaves(data.leaves || []);
      setToday(data.today || new Date().toISOString().split('T')[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load leave records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const requestedDays =
    startDate && endDate && endDate >= startDate ? dayCount(startDate, endDate) : null;

  const handleGrant = async () => {
    if (!userId || !startDate || !endDate) {
      toast.error('Select an employee and both dates');
      return;
    }
    if (endDate < startDate) {
      toast.error('End date cannot be before start date');
      return;
    }
    if (requestedDays && requestedDays > 31) {
      toast.error(`Leave cannot exceed 31 days (selected ${requestedDays})`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/attendance/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: Number(userId),
          type,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to grant leave');

      toast.success(data.message);
      // Reset form and refresh list
      setUserId('');
      setType('official_duty');
      setStartDate('');
      setEndDate('');
      setReason('');
      await fetchLeaves();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to grant leave');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnd = async (leave: LeaveRecord) => {
    const confirmed = window.confirm(
      `End ${TYPE_LABELS[leave.type].toLowerCase()} for ${leave.users.name}? They will be able to check in from today.`
    );
    if (!confirmed) return;

    setEndingId(leave.id);
    try {
      const res = await fetch('/api/attendance/leave', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_id: leave.id, action: 'end' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to end leave');

      toast.success(data.message);
      await fetchLeaves();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to end leave');
    } finally {
      setEndingId(null);
    }
  };

  if (loading) return <p>Loading leave records...</p>;

  return (
    <div className="space-y-8">
      {/* Grant form */}
      <div className="border rounded-lg p-6 bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-1">Grant leave or official duty</h2>
        <p className="text-sm text-gray-600 mb-4">
          The employee will not be marked absent and cannot check in during this period. Maximum 31 days.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="leave-user">Employee</label>
            <select
              id="leave-user"
              className="w-full border rounded-md px-3 py-2"
              value={userId}
              onChange={e => setUserId(e.target.value)}
            >
              <option value="">Select employee</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.department ? ` — ${u.department}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="leave-type">Type</label>
            <select
              id="leave-type"
              className="w-full border rounded-md px-3 py-2"
              value={type}
              onChange={e => setType(e.target.value as 'official_duty' | 'leave')}
            >
              <option value="official_duty">Official duty</option>
              <option value="leave">Leave</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="leave-start">From</label>
            <input
              id="leave-start"
              type="date"
              className="w-full border rounded-md px-3 py-2"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="leave-end">To</label>
            <input
              id="leave-end"
              type="date"
              className="w-full border rounded-md px-3 py-2"
              value={endDate}
              min={startDate || undefined}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-1" htmlFor="leave-reason">
            Reason <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="leave-reason"
            className="w-full border rounded-md px-3 py-2"
            rows={2}
            maxLength={500}
            placeholder="e.g. KNEC invigilation at Meru National Polytechnic"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleGrant}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-md font-medium"
          >
            {submitting ? 'Saving...' : 'Grant leave'}
          </button>
          {requestedDays !== null && (
            <span className={`text-sm ${requestedDays > 31 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
              {requestedDays} day{requestedDays !== 1 ? 's' : ''}
              {requestedDays > 31 ? ' — exceeds the 31-day limit' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Records table */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Leave records</h2>
        {leaves.length === 0 ? (
          <p className="text-gray-600">No leave records yet. Grant one above to get started.</p>
        ) : (
          <div className="overflow-x-auto border rounded-lg bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Days</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Granted by</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leaves.map(leave => {
                  const state = derivedState(leave, today);
                  const canEnd = leave.status === 'active' && state !== 'Completed';
                  return (
                    <tr key={leave.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{leave.users.name}</div>
                        {leave.users.department && (
                          <div className="text-gray-500 text-xs">{leave.users.department}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">{TYPE_LABELS[leave.type] || leave.type}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {leave.start_date.split('T')[0]} → {leave.end_date.split('T')[0]}
                      </td>
                      <td className="px-4 py-3">{dayCount(leave.start_date, leave.end_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[state] || ''}`}>
                          {state}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate" title={leave.reason || ''}>
                        {leave.reason || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">{leave.granted_by?.name}</td>
                      <td className="px-4 py-3 text-right">
                        {canEnd && (
                          <button
                            onClick={() => handleEnd(leave)}
                            disabled={endingId === leave.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50 font-medium"
                          >
                            {endingId === leave.id ? 'Ending...' : 'End leave'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaveManagement;