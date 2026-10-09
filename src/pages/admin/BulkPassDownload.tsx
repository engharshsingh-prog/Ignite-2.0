import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, Search, Square, CheckSquare, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import { authHeaders } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getErrorMessage, readJsonSafe } from '../../lib/http';
import { drawPassEventDetails } from '../../lib/passArtwork';

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

function ellipsizeToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  const ellipsis = '...';
  let low = 0;
  let high = raw.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${raw.slice(0, mid)}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${raw.slice(0, Math.max(0, low))}${ellipsis}`;
}

function wrapTwoLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [] as string[];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(ellipsizeToWidth(ctx, word, maxWidth));
      current = '';
    }

    if (lines.length === 2) break;
  }

  if (lines.length < 2 && current) lines.push(current);
  if (lines.length > 2) return lines.slice(0, 2);

  if (lines.length === 2) {
    lines[1] = ellipsizeToWidth(ctx, lines[1], maxWidth);
  }
  return lines;
}

function drawFittedName(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  const maxFont = 56;
  const minFont = 22;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#bdca91';
  ctx.textBaseline = 'top';

  let fontSize = maxFont;
  let lines: string[] = [];
  for (; fontSize >= minFont; fontSize -= 2) {
    ctx.font = `700 ${fontSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    lines = wrapTwoLines(ctx, text, maxWidth);
    if (lines.length === 1) {
      if (ctx.measureText(lines[0]).width <= maxWidth) break;
    } else if (lines.length === 2) {
      const w1 = ctx.measureText(lines[0]).width;
      const w2 = ctx.measureText(lines[1]).width;
      if (w1 <= maxWidth && w2 <= maxWidth) break;
    }
  }

  ctx.font = `700 ${Math.max(minFont, fontSize)}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  lines = wrapTwoLines(ctx, text, maxWidth);
  if (lines.length === 0) {
    ctx.restore();
    return;
  }

  const lineHeight = Math.round((Math.max(minFont, fontSize) || minFont) * 1.08);
  ctx.fillText(lines[0], x, y);
  if (lines.length > 1) ctx.fillText(lines[1], x, y + lineHeight);
  ctx.restore();
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

  const qrY = 195;
  const qrSize = 208;
  const qrRightOffset = 143;
  const qrX = canvas.width - qrRightOffset - qrSize;

  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, qrPayload, {
    width: qrSize,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#111411', light: '#f4f6ed' },
  });

  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#3b82f6';
  ctx.strokeRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6);
  ctx.restore();

  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  const rollTextY = qrY + qrSize + 28;
  const rollToNameGap = 18;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#bdca91';
  ctx.font = '700 20px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textBaseline = 'top';
  ctx.fillText(String(participant.roll_number || '').trim(), qrX + qrSize / 2, rollTextY);
  ctx.restore();

  drawFittedName(
    ctx,
    String(participant.full_name || '').trim(),
    qrX + qrSize / 2,
    rollTextY + 20 + rollToNameGap,
    394
  );

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
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gray-400 hover:text-white">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black">Bulk Pass Download</h1>
              <p className="text-gray-400 text-sm">Select participants and download all passes in one ZIP.</p>
            </div>
          </div>
          <button
            onClick={downloadZip}
            disabled={downloading || selected.size === 0}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Download size={16} /> {downloading ? 'Working...' : `Download ZIP (${selected.size})`}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll no, email, branch..."
              className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]"
            />
          </div>
          <button
            type="button"
            onClick={toggleAllFiltered}
            disabled={filtered.length === 0}
            className="w-full sm:w-auto px-4 py-3 rounded-xl border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            {allFilteredSelected ? 'Unselect Filtered' : 'Select Filtered'}
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 inline-flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {progress && (
          <p className="mb-5 text-sm text-gray-300">{progress}</p>
        )}

        {loading ? (
          <LoadingSpinner text="Loading participants..." />
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="w-12 px-4 py-3" />
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Participant</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Roll No</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Branch</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleOne(p.id)}
                          className="w-9 h-9 rounded-lg border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10 inline-flex items-center justify-center"
                          title={selected.has(p.id) ? 'Selected' : 'Select'}
                        >
                          {selected.has(p.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-white text-sm">{p.full_name}</p>
                          <p className="text-gray-500 text-xs">{p.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="font-mono text-sm text-gray-300">{p.roll_number}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-300 text-xs font-medium">{p.branch}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {p.payment_verified ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">Verified</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-olive-500/10 border border-olive-500/30 text-olive-300 text-xs font-semibold">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-500">
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
