// components/attendance/LeaveApplication.tsx

'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface LeaveRecord {
  id: number;
  user_id: number;
  type: 'official_duty' | 'leave';
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: 'pending' | 'active' | 'cancelled' | 'rejected';
  review_note?: string | null;
  created_at: string;
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
  if (leave.status === 'pending') return 'Pending approval';
  if (leave.status === 'rejected') return 'Rejected';
  if (leave.status === 'cancelled') return 'Cancelled';
  const start = leave.start_date.split('T')[0];
  const end = leave.end_date.split('T')[0];
  if (today < start) return 'Approved — upcoming';
  if (today > end) return 'Completed';
  return 'Approved — ongoing';
}

const STATE_STYLES: Record<string, string> = {
  'Pending approval': 'bg-yellow-100 text-yellow-800',
  'Approved — ongoing': 'bg-green-100 text-green-800',
  'Approved — upcoming': 'bg-blue-100 text-blue-800',
  Completed: 'bg-gray-100 text-gray-600',
  Cancelled: 'bg-gray-100 text-gray-600',
  Rejected: 'bg-red-100 text-red-700',
};

function LeaveApplication() {
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [today, setToday] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Application form
  const [type, setType] = useState<'official_duty' | 'leave'>('leave');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const fetchLeaves = async () => {
    try {
      const res = await fetch('/api/attendance/leave', { method: 'GET' });
      if (!res.ok) throw new Error('Failed to load your applications');
      const data = await res.json();
      setLeaves(data.leaves || []);
      setToday(data.today || new Date().toISOString().split('T')[0]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load your applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const requestedDays =
    startDate && endDate && endDate >= startDate ? dayCount(startDate, endDate) : null;


    console.log({ startDate, endDate, today, reason: reason.trim(), requestedDays });
  const handleApply = async () => {
    if (!startDate || !endDate) {
      toast.error('Select both dates');
      return;
    }
    if (endDate < startDate) {
      toast.error('End date cannot be before start date');
      return;
    }
    if (startDate < today) {
      toast.error('Applications cannot start in the past');
      return;
    }
    if (requestedDays && requestedDays > 31) {
      toast.error(`Leave cannot exceed 31 days (selected ${requestedDays})`);
      return;
    }
    if (!reason.trim()) {
      toast.error('Please give a reason — it helps the admin decide');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/attendance/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to submit application');

      toast.success(data.message);
      setType('leave');
      setStartDate('');
      setEndDate('');
      setReason('');
      await fetchLeaves();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (leave: LeaveRecord) => {
    const confirmed = window.confirm('Withdraw this application?');
    if (!confirmed) return;

    setBusyId(leave.id);
    try {
      const res = await fetch('/api/attendance/leave', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_id: leave.id, action: 'withdraw' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to withdraw application');

      toast.success(data.message);
      await fetchLeaves();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to withdraw application');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p>Loading your applications...</p>;

  return (
    <div className="space-y-8">
      {/* Application form */}
      <div className="border rounded-lg p-6 bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-1">Apply for leave or official duty</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your application goes to the administrator for approval. Once approved, you will not be
          marked absent for the period, and check-in will be disabled. Maximum 31 days.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="apply-type">Type</label>
            <select
              id="apply-type"
              className="w-full border rounded-md px-3 py-2"
              value={type}
              onChange={e => setType(e.target.value as 'official_duty' | 'leave')}
            >
              <option value="leave">Leave</option>
              <option value="official_duty">Official duty</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="apply-start">From</label>
            <input
              id="apply-start"
              type="date"
              className="w-full border rounded-md px-3 py-2"
              value={startDate}
              min={today || undefined}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="apply-end">To</label>
            <input
              id="apply-end"
              type="date"
              className="w-full border rounded-md px-3 py-2"
              value={endDate}
              min={startDate || today || undefined}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-1" htmlFor="apply-reason">Reason</label>
          <textarea
            id="apply-reason"
            className="w-full border rounded-md px-3 py-2"
            rows={2}
            maxLength={500}
            placeholder="e.g. Attending a KATTI workshop in Nyeri"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleApply}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-md font-medium"
          >
            {submitting ? 'Submitting...' : 'Submit application'}
          </button>
          {requestedDays !== null && (
            <span className={`text-sm ${requestedDays > 31 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
              {requestedDays} day{requestedDays !== 1 ? 's' : ''}
              {requestedDays > 31 ? ' — exceeds the 31-day limit' : ''}
            </span>
          )}
        </div>
      </div>

      {/* My applications */}
      <div>
        <h2 className="text-xl font-semibold mb-3">My applications</h2>
        {leaves.length === 0 ? (
          <p className="text-gray-600">No applications yet. Submit one above.</p>
        ) : (
          <div className="space-y-3">
            {leaves.map(leave => {
              const state = derivedState(leave, today);
              return (
                <div key={leave.id} className="border rounded-lg bg-white shadow-sm p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{TYPE_LABELS[leave.type]}</span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[state] || ''}`}>
                          {state}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {leave.start_date.split('T')[0]} → {leave.end_date.split('T')[0]}{' '}
                        ({dayCount(leave.start_date, leave.end_date)} day
                        {dayCount(leave.start_date, leave.end_date) !== 1 ? 's' : ''})
                      </div>
                      {leave.reason && (
                        <div className="text-sm text-gray-500 mt-1">{leave.reason}</div>
                      )}
                      {leave.status === 'rejected' && leave.review_note && (
                        <div className="text-sm text-red-600 mt-1">
                          Admin note: {leave.review_note}
                        </div>
                      )}
                    </div>
                    {leave.status === 'pending' && (
                      <button
                        onClick={() => handleWithdraw(leave)}
                        disabled={busyId === leave.id}
                        className="border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 px-4 py-2 rounded-md text-sm font-medium shrink-0"
                      >
                        {busyId === leave.id ? 'Working...' : 'Withdraw'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaveApplication;