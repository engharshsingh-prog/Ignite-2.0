import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, Search, Square, CheckSquare, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import { authHeaders } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getErrorMessage, readJsonSafe } from '../../lib/http';
import { drawPassEventDetails, drawPassParticipantDetails } from '../../lib/passArtwork';

interface Participant {
  id: number;
  email: string;
  full_name: string;
  roll_number: string;
  branch: string;
  year: string;
  skills: string[];
  payment_id: string;
  whatsapp_number: string;
  payment_verified: boolean;
  check_in_status: boolean;
  check_in_time: string | null;
  registered_at: string;
}

function fileNameSafe(text: string) {
  return text.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-$/g, '').toLowerCase();
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load pass template image'));
    img.src = src;
  });
}



async function generatePassPng(template: HTMLImageElement, participant: Participant) {
  const qrPayload = JSON.stringify({
    id: participant.id,
    full_name: participant.full_name,
    roll_number: participant.roll_number,
    payment_id: participant.payment_id,
    email: participant.email,
    whatsapp_number: participant.whatsapp_number,
  });

  const canvas = document.createElement('canvas');
  canvas.width = template.naturalWidth || template.width;
  canvas.height = template.naturalHeight || template.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
  await drawPassEventDetails(ctx);

  const qrSize = 316;
  const qrX = 1617;
  const qrY = 480;

  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, qrPayload, {
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a1815', light: '#f0e9e1' },
  });

  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  drawPassParticipantDetails(ctx, participant);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to generate pass image');
  return blob;
}

export default function BulkPassDownload() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/participants', { headers: authHeaders() });
      const data = await readJsonSafe<Participant[] & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to load participants'));
      setParticipants(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load participants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParticipants();
  }, [fetchParticipants]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return participants;
    return participants.filter((p) =>
      [p.full_name, p.email, p.roll_number, p.branch].some((v) => String(v || '').toLowerCase().includes(needle))
    );
  }, [participants, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const p of filtered) next.delete(p.id);
      } else {
        for (const p of filtered) next.add(p.id);
      }
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadZip = async () => {
    if (selected.size === 0) return;

    setDownloading(true);
    setProgress('Loading template...');
    setError('');

    try {
      const template = await loadImage('/event-pass.svg');
      const zip = new JSZip();
      const picks = participants.filter((p) => selected.has(p.id));

      for (let i = 0; i < picks.length; i += 1) {
        const p = picks[i];
        setProgress(`Generating ${i + 1} / ${picks.length}: ${p.full_name}`);
        const blob = await generatePassPng(template, p);
        zip.file(`ignite26-pass-${fileNameSafe(p.full_name || p.roll_number)}.png`, blob);
      }

      setProgress('Preparing zip...');
      const out = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ignite26-passes-${picks.length}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download passes');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-900 pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="liquid-icon-bubble w-10 h-10 rounded-xl text-slate-700 hover:text-slate-900">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-slate-900 via-sky-700 to-blue-700 bg-clip-text text-transparent">
                Bulk Pass Download
              </h1>
              <p className="text-slate-600 text-sm">Select participants and download all passes in one ZIP.</p>
            </div>
          </div>
          <button
            onClick={downloadZip}
            disabled={downloading || selected.size === 0}
            className="liquid-btn-primary w-full sm:w-auto px-5 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Download size={16} /> {downloading ? 'Working...' : `Download ZIP (${selected.size})`}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll / enrolment no, email, branch..."
              className="liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={toggleAllFiltered}
            disabled={filtered.length === 0}
            className="liquid-btn-glass w-full sm:w-auto px-4 py-3 rounded-xl text-slate-800 font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            {allFilteredSelected ? 'Unselect Filtered' : 'Select Filtered'}
          </button>
        </div>

        {error && (
          <div className="liquid-glass mb-5 rounded-2xl border-red-400/40 bg-red-50/85 p-4 text-sm text-red-700 inline-flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {progress && (
          <p className="mb-5 text-sm text-sky-700 font-medium">{progress}</p>
        )}

        {loading ? (
          <LoadingSpinner text="Loading participants..." />
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-strong rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-900/[0.04] border-b border-slate-900/10">
                    <th className="w-12 px-4 py-3.5" />
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-sky-800 uppercase tracking-wider">Participant</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-sky-800 uppercase tracking-wider hidden sm:table-cell">Roll / Enrolment No</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-sky-800 uppercase tracking-wider hidden md:table-cell">Branch</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-sky-800 uppercase tracking-wider hidden md:table-cell">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/10">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-sky-500/[0.04] transition-colors">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleOne(p.id)}
                          className="liquid-icon-bubble w-9 h-9 rounded-lg text-sky-700"
                          title={selected.has(p.id) ? 'Selected' : 'Select'}
                        >
                          {selected.has(p.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{p.full_name}</p>
                          <p className="text-slate-500 text-xs">{p.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="font-mono text-sm text-sky-800">{p.roll_number}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="liquid-glass-pill px-2.5 py-1 rounded-full text-sky-800 text-xs font-medium">{p.branch}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {p.payment_verified ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-500/12 border border-emerald-500/35 text-emerald-700 text-xs font-semibold">Verified</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-500/12 border border-amber-500/35 text-amber-800 text-xs font-semibold">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filtered.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <p>No participants found</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
