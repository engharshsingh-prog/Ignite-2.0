import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Camera, Search, CheckCircle2, XCircle, QrCode, X } from 'lucide-react';
import jsQR from 'jsqr';
import LoadingSpinner from '../components/LoadingSpinner';
import { getErrorMessage, readJsonSafe } from '../lib/http';

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

type CacheEnvelope = {
  v: 1;
  ts: number;
  iv: string;
  cipher: string;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function normalizePhone(value: unknown) {
  const digits = normalize(value).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function parsePayloadToLookupValue(payload: unknown) {
  const raw = normalize(payload);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    const fromJson =
      normalize((parsed as any)?.roll_number)
      || normalize((parsed as any)?.rollNumber)
      || normalize((parsed as any)?.payment_id)
      || normalize((parsed as any)?.paymentId)
      || normalize((parsed as any)?.email)
      || normalize((parsed as any)?.whatsapp_number)
      || normalize((parsed as any)?.whatsapp)
      || normalize((parsed as any)?.id);
    if (fromJson) return fromJson;
  } catch {
    // ignore non-JSON payloads
  }
  return raw;
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function bytesFromBase64(encoded: string) {
  const binary = atob(encoded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveCacheKey(password: string, token: string) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`ignite26:handler:${token}`),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptCache(password: string, token: string, payload: unknown) {
  const key = await deriveCacheKey(password, token);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    v: 1,
    ts: Date.now(),
    iv: base64FromBytes(iv),
    cipher: base64FromBytes(new Uint8Array(cipherBuf)),
  } satisfies CacheEnvelope;
}

async function decryptCache(password: string, token: string, envelope: CacheEnvelope) {
  const key = await deriveCacheKey(password, token);
  const iv = bytesFromBase64(envelope.iv);
  const cipher = bytesFromBase64(envelope.cipher);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  const json = new TextDecoder().decode(new Uint8Array(plainBuf));
  return JSON.parse(json) as unknown;
}

export default function ValidationHandler() {
  const { token = '' } = useParams();
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheError, setCacheError] = useState('');
  const [cacheRows, setCacheRows] = useState<Participant[] | null>(null);
  const cacheKey = useMemo(() => `ignite26.validation_handler.cache:${token}`, [token]);

  const [query, setQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [results, setResults] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [notFoundValue, setNotFoundValue] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{ kind: 'payment' | 'checkin'; nextValue: boolean } | null>(null);
  const [updating, setUpdating] = useState<'payment' | 'checkin' | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const scanLockRef = useRef(false);

  const canScan = useMemo(() => unlocked && !selected, [unlocked, selected]);

  const apiCall = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/validation-handler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, ...payload }),
    });
    return { res, data: await readJsonSafe<Record<string, unknown>>(res) };
  };

  const persistCacheRows = useCallback(
    async (rows: Participant[]) => {
      const envelope = await encryptCache(password, token, { rows });
      localStorage.setItem(cacheKey, JSON.stringify(envelope));
    },
    [cacheKey, password, token]
  );

  const buildLocalResults = useCallback(
    (rows: Participant[], value: string) => {
      const lookup = normalize(value);
      if (!lookup) return [] as Participant[];

      const byId = /^\d+$/.test(lookup) ? rows.find((r) => r.id === Number(lookup)) : undefined;
      if (byId) return [byId];

      const byRoll = rows.find((r) => normalize(r.roll_number).toLowerCase() === lookup.toLowerCase());
      if (byRoll) return [byRoll];

      if (/^\d+$/.test(lookup)) {
        const digits = normalizePhone(lookup);
        if (/^\d{10}$/.test(digits)) {
          const byPhone = rows.find((r) => normalizePhone(r.whatsapp_number) === digits);
          if (byPhone) return [byPhone];
        }
      }

      const email = lookup.toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const byEmail = rows.find((r) => normalize(r.email).toLowerCase() === email);
        if (byEmail) return [byEmail];
      }

      const byPayment = rows.find((r) => normalize(r.payment_id) === lookup);
      if (byPayment) return [byPayment];

      const needle = lookup.toLowerCase();
      const matches = rows.filter((r) =>
        [r.full_name, r.roll_number, r.email, r.payment_id, r.whatsapp_number]
          .some((v) => normalize(v).toLowerCase().includes(needle))
      );
      return matches.slice(0, 20);
    },
    []
  );

  const refreshCache = useCallback(
    async () => {
      if (!unlocked) return;
      setCacheLoading(true);
      setCacheError('');
      try {
        const { res, data } = await apiCall({ action: 'export' });
        if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to load handler cache'));
        const rows = Array.isArray((data as any)?.rows) ? ((data as any).rows as Participant[]) : [];
        setCacheRows(rows);
        await persistCacheRows(rows);
      } catch (err: unknown) {
        setCacheError(err instanceof Error ? err.message : 'Failed to load handler cache');
        setCacheRows(null);
      } finally {
        setCacheLoading(false);
      }
    },
    [apiCall, persistCacheRows, unlocked]
  );

  const verifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const { res, data } = await apiCall({ action: 'verify' });
      if (!res.ok) throw new Error(getErrorMessage(data, 'Access denied'));
      setUnlocked(true);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Access denied');
    } finally {
      setAuthLoading(false);
    }
  };

  const runLookup = async (payload: { query?: string; qr_text?: string }) => {
    setLookupLoading(true);
    setLookupError('');
    setNotFoundValue(null);
    try {
      const localRows = cacheRows;
      const raw = payload.qr_text ?? payload.query ?? '';
      const value = parsePayloadToLookupValue(raw);

      if (localRows && localRows.length > 0) {
        const rows = buildLocalResults(localRows, value);
        setResults(rows);
        if (rows.length === 1) setSelected(rows[0]);
        if (rows.length === 0) setNotFoundValue(value);
        return;
      }

      const { res, data } = await apiCall({ action: 'lookup', ...payload });
      if (!res.ok) throw new Error(getErrorMessage(data, 'Lookup failed'));
      const rows = Array.isArray((data as any)?.rows) ? ((data as any).rows as Participant[]) : [];
      setResults(rows);
      if (rows.length === 1) setSelected(rows[0]);
      if (rows.length === 0) setNotFoundValue(value);
    } catch (err: unknown) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  const stopCamera = () => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  const startCamera = async () => {
    if (!canScan) return;
    try {
      setCameraError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || scanLockRef.current || !canScan) return;
        if (videoRef.current.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;
        try {
          scanLockRef.current = true;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) return;

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
          const rawValue = String(code?.data || '').trim();
          if (rawValue) {
            await runLookup({ qr_text: rawValue });
          }
        } finally {
          scanLockRef.current = false;
        }
      }, 500);
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : 'Failed to start camera');
    }
  };

  useEffect(() => {
    if (!unlocked) return;
    setCacheError('');
    setCacheRows(null);

    const loadFromStorage = async () => {
      try {
        setCacheLoading(true);
        const raw = localStorage.getItem(cacheKey);
        if (!raw) {
          await refreshCache();
          return;
        }
        const envelope = JSON.parse(raw) as CacheEnvelope;
        if (!envelope?.ts || Date.now() - Number(envelope.ts) > CACHE_TTL_MS) {
          localStorage.removeItem(cacheKey);
          await refreshCache();
          return;
        }
        const decoded = await decryptCache(password, token, envelope);
        const rows = Array.isArray((decoded as any)?.rows) ? ((decoded as any).rows as Participant[]) : null;
        if (!rows) {
          localStorage.removeItem(cacheKey);
          await refreshCache();
          return;
        }
        setCacheRows(rows);
      } catch {
        localStorage.removeItem(cacheKey);
        await refreshCache();
      } finally {
        setCacheLoading(false);
      }
    };

    loadFromStorage();
    if (canScan) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, canScan]);

  const handleUpdate = async (kind: 'payment' | 'checkin', nextValue: boolean) => {
    if (!selected) return;
    setUpdating(kind);
    setLookupError('');
    try {
      const payload =
        kind === 'payment'
          ? { action: 'update', participant_id: selected.id, payment_verified: nextValue }
          : { action: 'update', participant_id: selected.id, check_in_status: nextValue };

      const { res, data } = await apiCall(payload);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update'));
      const updated = data?.participant as Participant | undefined;
      if (updated) {
        setSelected(updated);
        setResults((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setCacheRows((prev) => {
          if (!prev) return prev;
          const next = prev.map((x) => (x.id === updated.id ? updated : x));
          persistCacheRows(next).catch(() => {
            // ignore
          });
          return next;
        });
      }
    } catch (err: unknown) {
      setLookupError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setUpdating(null);
    }
  };

  const requestUpdate = (kind: 'payment' | 'checkin', nextValue: boolean) => {
    if (!selected) return;
    setPendingUpdate({ kind, nextValue });
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen text-white pt-24 pb-16 px-4">
        <div className="max-w-md mx-auto liquid-glass-strong rounded-3xl p-7">
          <h1 className="text-2xl font-black flex items-center gap-2.5 bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent">
            <span className="liquid-icon-bubble w-9 h-9 text-cyan-300 shrink-0"><Shield size={18} /></span>
            Validation Handler
          </h1>
          <p className="text-sm text-slate-300/80 mt-2">Enter password to access this hidden verification page.</p>
          <form onSubmit={verifyPassword} className="mt-5 space-y-3.5">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Access password"
              className="liquid-input w-full rounded-xl px-3.5 py-2.5 text-white placeholder-slate-400/60"
            />
            {authError && <p className="text-sm text-red-300">{authError}</p>}
            <button
              type="submit"
              disabled={authLoading || !password.trim()}
              className="liquid-btn-primary w-full rounded-xl text-white py-2.5 font-semibold disabled:opacity-50"
            >
              {authLoading ? 'Verifying...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white pt-24 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-black bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent">
            Payment / Check-in Handler
          </h1>
          <p className="text-sm text-slate-300/80 mt-1">QR scan auto-runs when camera is active. Camera pauses while popup is open.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span className="liquid-glass-pill px-3 py-1 rounded-full text-xs text-cyan-200">
              {cacheLoading
                ? 'Loading offline cache...'
                : cacheRows
                  ? `Offline cache ready (${cacheRows.length})`
                  : 'Offline cache not ready'}
            </span>
            <button
              type="button"
              onClick={refreshCache}
              disabled={cacheLoading}
              className="liquid-btn-glass px-3 py-1.5 rounded-lg text-slate-200 text-xs disabled:opacity-50"
            >
              Refresh cache
            </button>
            {cacheError && <span className="text-xs text-cyan-200">{cacheError}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="liquid-glass-card rounded-3xl p-5">
            <p className="text-sm font-medium text-cyan-100 mb-3 flex items-center gap-2"><Camera size={15} className="text-cyan-300" /> QR Scanner</p>
            <div className="aspect-video rounded-2xl bg-black/50 border border-white/15 overflow-hidden relative">
              {lookupLoading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm grid place-items-center z-10">
                  <LoadingSpinner text="Searching..." />
                </div>
              )}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 grid place-items-center">
                  <LoadingSpinner text="Starting camera..." />
                </div>
              )}
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            {cameraError && <p className="mt-2.5 text-sm text-amber-200">{cameraError}</p>}
          </div>

          <div className="liquid-glass-card rounded-3xl p-5">
            <p className="text-sm font-medium text-cyan-100 mb-3 flex items-center gap-2"><Search size={15} className="text-cyan-300" /> Quick Search</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runLookup({ query });
              }}
              className="flex gap-2"
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by roll, payment id, email, phone, name"
                className="liquid-input flex-1 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-400/60"
              />
              <button
                type="submit"
                disabled={lookupLoading || !query.trim()}
                className="liquid-btn-primary px-5 rounded-xl text-white font-semibold disabled:opacity-50"
              >
                {lookupLoading ? '...' : 'Find'}
              </button>
            </form>
            {lookupError && <p className="text-sm text-red-300 mt-2">{lookupError}</p>}

            <div className="mt-4 max-h-80 overflow-auto divide-y divide-white/10">
              {results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="w-full text-left px-2.5 py-2.5 hover:bg-white/[0.06] rounded-xl transition-colors"
                >
                  <p className="text-sm text-white font-medium">{p.full_name}</p>
                  <p className="text-xs text-slate-300/75">{p.roll_number} | {p.payment_id}</p>
                </button>
              ))}
              {!results.length && !lookupLoading && <p className="text-sm text-slate-400 py-3">No results yet.</p>}
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-[#020612]/75 backdrop-blur-md p-4 grid place-items-center">
          <div className="liquid-glass-strong w-full max-w-lg rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.full_name}</h2>
                <p className="text-xs text-cyan-200/75 font-mono">{selected.roll_number}</p>
              </div>
              <button onClick={() => setSelected(null)} className="liquid-icon-bubble w-8 h-8 rounded-lg text-slate-200 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <p><span className="text-slate-400">Branch:</span> {selected.branch}</p>
              <p><span className="text-slate-400">Year:</span> {selected.year}</p>
              <p><span className="text-slate-400">Email:</span> {selected.email}</p>
              <p><span className="text-slate-400">WhatsApp:</span> {selected.whatsapp_number}</p>
              <p><span className="text-slate-400">Payment ID:</span> <span className="font-mono text-cyan-200">{selected.payment_id}</span></p>
              <p><span className="text-slate-400">Skills:</span> {selected.skills.join(', ') || '-'}</p>

              <div className="pt-2 flex flex-wrap items-center gap-2">
                {selected.payment_verified ? (
                  <span className="liquid-glass-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-emerald-400/35 bg-emerald-500/15 text-emerald-200 text-xs font-medium"><CheckCircle2 size={14} /> Payment Verified</span>
                ) : (
                  <span className="liquid-glass-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-amber-400/35 bg-amber-500/15 text-amber-200 text-xs font-medium"><XCircle size={14} /> Payment Pending</span>
                )}
                {selected.check_in_status ? (
                  <span className="liquid-glass-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-emerald-400/35 bg-emerald-500/15 text-emerald-200 text-xs font-medium"><CheckCircle2 size={14} /> Checked In</span>
                ) : (
                  <span className="liquid-glass-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-slate-300 text-xs font-medium"><QrCode size={14} /> Not Checked In</span>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex flex-wrap gap-2.5">
              <button
                onClick={() => requestUpdate('payment', !selected.payment_verified)}
                disabled={updating !== null}
                className="liquid-btn-glass px-3.5 py-2 rounded-xl border-cyan-400/35 text-cyan-200 text-sm disabled:opacity-50"
              >
                {updating === 'payment' ? 'Updating...' : selected.payment_verified ? 'Mark Payment Pending' : 'Mark Payment Verified'}
              </button>
              <button
                onClick={() => requestUpdate('checkin', !selected.check_in_status)}
                disabled={updating !== null}
                className="liquid-btn-glass px-3.5 py-2 rounded-xl border-emerald-400/35 text-emerald-200 text-sm disabled:opacity-50"
              >
                {updating === 'checkin' ? 'Updating...' : selected.check_in_status ? 'Undo Check-in' : 'Mark Checked In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notFoundValue !== null && (
        <div className="fixed inset-0 z-50 bg-[#020612]/75 backdrop-blur-md p-4 grid place-items-center">
          <div className="liquid-glass-strong w-full max-w-md rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">No such data exists</h2>
              <button onClick={() => setNotFoundValue(null)} className="liquid-icon-bubble w-8 h-8 rounded-lg text-slate-200 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 text-sm text-slate-300">
              <p>No matching registration found for:</p>
              <p className="liquid-glass mt-2 font-mono text-xs text-cyan-200 break-all rounded-xl px-3 py-2">{notFoundValue || '-'}</p>
            </div>
            <div className="px-6 py-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setNotFoundValue(null)}
                className="liquid-btn-glass w-full px-4 py-2.5 rounded-xl text-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && pendingUpdate && (
        <div className="fixed inset-0 z-[60] bg-[#020612]/75 backdrop-blur-md p-4 grid place-items-center">
          <div className="liquid-glass-strong w-full max-w-md rounded-3xl border-cyan-400/30 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-cyan-200">Confirm action</h2>
              <button onClick={() => setPendingUpdate(null)} className="liquid-icon-bubble w-8 h-8 rounded-lg text-slate-200 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 text-sm text-slate-300 space-y-3">
              <p className="text-slate-200">You are about to change status for:</p>
              <div className="liquid-glass rounded-2xl px-4 py-3">
                <p className="font-semibold text-white">{selected.full_name}</p>
                <p className="text-xs text-cyan-200/75">{selected.roll_number} • {selected.payment_id}</p>
              </div>

              {pendingUpdate.kind === 'payment' ? (
                <div className="space-y-1">
                  <p><span className="text-slate-400">Current payment:</span> {selected.payment_verified ? 'Verified' : 'Pending'}</p>
                  <p><span className="text-slate-400">New payment:</span> {pendingUpdate.nextValue ? 'Verified' : 'Pending'}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p><span className="text-slate-400">Current check-in:</span> {selected.check_in_status ? 'Checked In' : 'Not Checked In'}</p>
                  <p><span className="text-slate-400">New check-in:</span> {pendingUpdate.nextValue ? 'Checked In' : 'Not Checked In'}</p>
                </div>
              )}

              <p className="text-xs text-cyan-200/80">This is a confirmation step. Nothing has been changed yet.</p>
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex gap-2.5">
              <button
                type="button"
                onClick={() => setPendingUpdate(null)}
                className="liquid-btn-glass flex-1 px-4 py-2.5 rounded-xl text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updating !== null}
                onClick={async () => {
                  const next = pendingUpdate;
                  setPendingUpdate(null);
                  await handleUpdate(next.kind, next.nextValue);
                }}
                className="liquid-btn-primary flex-1 px-4 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50"
              >
                {updating ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
