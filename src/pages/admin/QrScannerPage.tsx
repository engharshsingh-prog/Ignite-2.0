import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, QrCode, UserCheck } from 'lucide-react';
import { authHeaders } from '../../lib/auth';
import { readJsonSafe } from '../../lib/http';
import QrCheckinScannerModal, { type Participant } from '../../components/QrCheckinScannerModal';

interface Stats {
  total: number;
  checkedIn: number;
  notCheckedIn: number;
  paymentsVerified?: number;
}

export default function QrScannerPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scannerOpen, setScannerOpen] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/stats', { headers: authHeaders() }),
        fetch('/api/participants', { headers: authHeaders() }),
      ]);
      const sData = await readJsonSafe<Stats>(sRes);
      const pData = await readJsonSafe<Participant[]>(pRes);
      if (sData) setStats(sData);
      if (Array.isArray(pData)) setParticipants(pData);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleCheckInSuccess = (updated: Participant) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
    fetchStats();
  };

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="w-10 h-10 rounded-xl bg-[#191e1b] border border-[#303a32] flex items-center justify-center text-gray-400 hover:text-white hover:border-emerald-500/50 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <QrCode size={24} className="text-emerald-400" />
                Pass QR Scanner & Check-in
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Scan attendee QR passes to verify payment and approve venue entry.
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold flex items-center gap-1.5">
                <UserCheck size={14} /> Checked In: {stats.checkedIn} / {stats.total}
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-[#191e1b] border border-[#303a32] text-gray-400 font-medium">
                {stats.notCheckedIn} Awaiting
              </span>
            </div>
          )}
        </div>

        {/* Scanner Container */}
        <div className="rounded-3xl border border-emerald-500/30 bg-[#141815]/95 shadow-2xl overflow-hidden p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-2">
            <QrCode size={32} />
          </div>
          <h2 className="text-lg font-bold text-white">Live Check-in Scanner Active</h2>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Point your camera at the QR code on the student&apos;s digital pass or printed badge. The system will prompt for check-in approval.
          </p>

          <button
            onClick={() => setScannerOpen(true)}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-black font-black text-sm inline-flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <QrCode size={18} />
            Open Scanner Window
          </button>
        </div>

        {/* Modal Scanner Instance */}
        <QrCheckinScannerModal
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onCheckInSuccess={handleCheckInSuccess}
          knownParticipants={participants}
        />
      </div>
    </div>
  );
}
