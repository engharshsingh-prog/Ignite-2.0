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
    <div className="min-h-screen text-white pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="liquid-icon-bubble w-10 h-10 rounded-xl text-slate-300 hover:text-white"
              title="Back to Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <QrCode size={24} className="text-emerald-300" />
                Pass QR Scanner & Check-in
              </h1>
              <p className="text-xs text-slate-300/80 mt-0.5">
                Scan attendee QR passes to verify payment and approve venue entry.
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-2 text-xs">
              <span className="liquid-glass-pill px-3.5 py-1.5 rounded-full border-emerald-400/35 bg-emerald-500/15 text-emerald-200 font-bold flex items-center gap-1.5">
                <UserCheck size={14} /> Checked In: {stats.checkedIn} / {stats.total}
              </span>
              <span className="liquid-glass-pill px-3.5 py-1.5 rounded-full text-slate-300 font-medium">
                {stats.notCheckedIn} Awaiting
              </span>
            </div>
          )}
        </div>

        {/* Scanner Container */}
        <div className="liquid-glass-strong rounded-3xl border-emerald-400/30 overflow-hidden p-8 text-center space-y-4">
          <div className="liquid-icon-bubble w-16 h-16 rounded-2xl border-emerald-400/40 bg-emerald-500/15 text-emerald-300 mx-auto mb-2 shadow-[0_0_24px_rgba(52,211,153,0.22)]">
            <QrCode size={32} />
          </div>
          <h2 className="text-xl font-bold text-white">Live Check-in Scanner Active</h2>
          <p className="text-xs text-slate-300/85 max-w-md mx-auto leading-relaxed">
            Point your camera at the QR code on the student&apos;s digital pass or printed badge. The system will prompt for check-in approval.
          </p>

          <button
            onClick={() => setScannerOpen(true)}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-black text-sm inline-flex items-center gap-2 shadow-[0_8px_28px_rgba(52,211,153,0.28)] transition-all cursor-pointer"
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
