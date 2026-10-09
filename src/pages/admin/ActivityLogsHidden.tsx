import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { readJsonSafe } from '../../lib/http';
import { authHeaders } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';

interface ActivityLog {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  actor_email: string;
  details: unknown;
  created_at: string;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    registration_created: 'Registration Created',
    registration_updated: 'Registration Updated',
    registration_deleted: 'Registration Deleted',
    checkin_marked: 'Check-in Marked',
    checkin_reverted: 'Check-in Reverted',
    management_member_created: 'Team Member Added',
    management_member_updated: 'Team Member Updated',
    management_member_deleted: 'Team Member Removed',
    payment_verified: 'Payment Verified',
    payment_unverified: 'Payment Unverified',
    media_added_by_admin: 'Media Added By Admin',
    media_submitted_public: 'Media Submitted By Public',
    media_approved: 'Media Approved',
    media_rejected: 'Media Rejected',
    media_marked_pending: 'Media Marked Pending',
    media_deleted: 'Media Deleted',
  };
  return labels[action] || action;
}

export default function ActivityLogsHidden() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/activities?limit=200', { headers: authHeaders() });
        const data = await readJsonSafe<ActivityLog[]>(res);
        setLogs(Array.isArray(data) ? data : []);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
        <div className="max-w-5xl mx-auto px-4">
          <LoadingSpinner text="Loading logs..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-2xl font-black">Activity Logs</h1>
          <p className="text-sm text-gray-500">Hidden admin route</p>
        </motion.div>

        <div className="rounded-2xl border border-white/10 overflow-hidden">
          {logs.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-500">No activity logged yet.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <div>
                    <p className="text-sm text-gray-200">{actionLabel(log.action)}</p>
                    <p className="text-xs text-gray-500">
                      {log.actor_email} | {log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

