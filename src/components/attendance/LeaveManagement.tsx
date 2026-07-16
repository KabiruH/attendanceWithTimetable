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

export interface LeaveRecord {
  id: number;
  user_id: number;
  type: 'official_duty' | 'leave';
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: 'pending' | 'active' | 'cancelled' | 'rejected';
  review_note?: string | null;
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
  if (leave.status === 'pending') return 'Pending';
  if (leave.status === 'rejected') return 'Rejected';
  if (leave.status === 'cancelled') return 'Ended';
  const start = leave.start_date.split('T')[0];
  const end = leave.end_date.split('T')[0];
  if (today < start) return 'Upcoming';
  if (today > end) return 'Completed';
  return 'Ongoing';
}

const STATE_STYLES: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Ongoing: 'bg-green-100 text-green-800',
  Upcoming: 'bg-blue-100 text-blue-800',
  Completed: 'bg-gray-100 text-gray-600',
  Ended: 'bg-red-100 text-red-700',
  Rejected: 'bg-red-100 text-red-700',
};

interface EditForm {
  start_date: string;
  end_date: string;
  type: 'official_duty' | 'leave';
  reason: string;
}

function LeaveManagement() {
  const [users, setUsers] = useState<LeaveUser[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [today, setToday] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Grant form state
  const [userId, setUserId] = useState<string>('');
  const [type, setType] = useState<'official_duty' | 'leave'>('official_duty');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Edit dialog state
  const [editingLeave, setEditingLeave] = useState<LeaveRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    start_date: '',
    end_date: '',
    type: 'official_duty',
    reason: '',
  });

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

  // ── Shared PATCH helper ────────────────────────────────────────────────────
  const patchLeave = async (payload: Record<string, unknown>, busy: number) => {
    setBusyId(busy);
    try {
      const res = await fetch('/api/attendance/leave', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Request failed');
      toast.success(data.message);
      await fetchLeaves();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Request failed');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
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

  const handleApprove = (leave: LeaveRecord) => {
    patchLeave({ leave_id: leave.id, action: 'approve' }, leave.id);
  };

  const handleReject = (leave: LeaveRecord) => {
    const note = window.prompt(
      `Reject ${leave.users.name}'s application?\nOptional: add a reason the applicant will see.`
    );
    if (note === null) return; // cancelled the prompt
    patchLeave(
      { leave_id: leave.id, action: 'reject', review_note: note.trim() || undefined },
      leave.id
    );
  };

  const handleEnd = (leave: LeaveRecord) => {
    const confirmed = window.confirm(
      `End ${TYPE_LABELS[leave.type].toLowerCase()} for ${leave.users.name}? They will be able to check in from today.`
    );
    if (!confirmed) return;
    patchLeave({ leave_id: leave.id, action: 'end' }, leave.id);
  };

  const openEdit = (leave: LeaveRecord) => {
    setEditingLeave(leave);
    setEditForm({
      start_date: leave.start_date.split('T')[0],
      end_date: leave.end_date.split('T')[0],
      type: leave.type,
      reason: leave.reason || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingLeave) return;
    if (!editForm.start_date || !editForm.end_date) {
      toast.error('Both dates are required');
      return;
    }
    if (editForm.end_date < editForm.start_date) {
      toast.error('End date cannot be before start date');
      return;
    }
    const days = dayCount(editForm.start_date, editForm.end_date);
    if (days > 31) {
      toast.error(`Leave cannot exceed 31 days (selected ${days})`);
      return;
    }

    const ok = await patchLeave(
      {
        leave_id: editingLeave.id,
        action: 'update',
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        type: editForm.type,
        reason: editForm.reason.trim() || undefined,
      },
      editingLeave.id
    );
    if (ok) setEditingLeave(null);
  };

  if (loading) return <p>Loading leave records...</p>;

  const pendingLeaves = leaves.filter(l => l.status === 'pending');
  const otherLeaves = leaves.filter(l => l.status !== 'pending');
  const editDays =
    editForm.start_date && editForm.end_date && editForm.end_date >= editForm.start_date
      ? dayCount(editForm.start_date, editForm.end_date)
      : null;

  return (
    <div className="space-y-8">
      {/* Pending applications */}
      {pendingLeaves.length > 0 && (
        <div className="border border-yellow-300 rounded-lg p-6 bg-yellow-50 shadow-sm">
          <h2 className="text-xl font-semibold mb-1">
            Pending applications
            <span className="ml-2 inline-block bg-yellow-200 text-yellow-900 text-sm px-2 py-0.5 rounded-full align-middle">
              {pendingLeaves.length}
            </span>
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Applications from employees awaiting your decision. Approving blocks their check-in and
            protects them from absent marking for the period.
          </p>

          <div className="space-y-3">
            {pendingLeaves.map(leave => (
              <div
                key={leave.id}
                className="flex flex-col md:flex-row md:items-center gap-3 bg-white border rounded-md p-4"
              >
                <div className="flex-1">
                  <div className="font-medium">
                    {leave.users.name}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      {TYPE_LABELS[leave.type]}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {leave.start_date.split('T')[0]} → {leave.end_date.split('T')[0]}{' '}
                    ({dayCount(leave.start_date, leave.end_date)} day
                    {dayCount(leave.start_date, leave.end_date) !== 1 ? 's' : ''})
                  </div>
                  {leave.reason && (
                    <div className="text-sm text-gray-500 mt-1 italic">"{leave.reason}"</div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(leave)}
                    disabled={busyId === leave.id}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    {busyId === leave.id ? 'Working...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(leave)}
                    disabled={busyId === leave.id}
                    className="border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => openEdit(leave)}
                    disabled={busyId === leave.id}
                    className="border text-gray-700 hover:bg-gray-50 disabled:opacity-50 px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
        {otherLeaves.length === 0 ? (
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
                {otherLeaves.map(leave => {
                  const state = derivedState(leave, today);
                  const canEnd = leave.status === 'active' && state !== 'Completed';
                  const canEdit = leave.status === 'active' && state !== 'Completed';
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
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(leave)}
                            disabled={busyId === leave.id}
                            className="text-blue-600 hover:text-blue-800 disabled:opacity-50 font-medium mr-4"
                          >
                            Edit
                          </button>
                        )}
                        {canEnd && (
                          <button
                            onClick={() => handleEnd(leave)}
                            disabled={busyId === leave.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50 font-medium"
                          >
                            {busyId === leave.id ? 'Working...' : 'End leave'}
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

      {/* Edit dialog */}
      {editingLeave && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setEditingLeave(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1">
              Edit leave — {editingLeave.users.name}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {editingLeave.status === 'active'
                ? 'Attendance records will be adjusted to match the new dates. Days removed from the range become normal working days again.'
                : 'This application has not been approved yet; only its details will change.'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="edit-type">Type</label>
                <select
                  id="edit-type"
                  className="w-full border rounded-md px-3 py-2"
                  value={editForm.type}
                  onChange={e => setEditForm({ ...editForm, type: e.target.value as 'official_duty' | 'leave' })}
                >
                  <option value="official_duty">Official duty</option>
                  <option value="leave">Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="edit-start">From</label>
                  <input
                    id="edit-start"
                    type="date"
                    className="w-full border rounded-md px-3 py-2"
                    value={editForm.start_date}
                    onChange={e => setEditForm({ ...editForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="edit-end">To</label>
                  <input
                    id="edit-end"
                    type="date"
                    className="w-full border rounded-md px-3 py-2"
                    value={editForm.end_date}
                    min={editForm.start_date || undefined}
                    onChange={e => setEditForm({ ...editForm, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="edit-reason">Reason</label>
                <textarea
                  id="edit-reason"
                  className="w-full border rounded-md px-3 py-2"
                  rows={2}
                  maxLength={500}
                  value={editForm.reason}
                  onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                />
              </div>

              {editDays !== null && (
                <p className={`text-sm ${editDays > 31 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                  {editDays} day{editDays !== 1 ? 's' : ''}
                  {editDays > 31 ? ' — exceeds the 31-day limit' : ''}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingLeave(null)}
                className="border px-4 py-2 rounded-md font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={busyId === editingLeave.id}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-md font-medium"
              >
                {busyId === editingLeave.id ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaveManagement;