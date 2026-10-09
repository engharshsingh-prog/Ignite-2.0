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

      if (/^\d+$/.test(lookup)) {
        if (/^\d{13}$/.test(lookup)) {
          const byRoll = rows.find((r) => normalize(r.roll_number) === lookup);
          if (byRoll) return [byRoll];
        }
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
      <div className="min-h-screen bg-[#111411] grid-bg text-white pt-24 pb-16 px-4">
        <div className="max-w-md mx-auto rounded-2xl border border-white/10 bg-[#191e1b]/95 p-6">
          <h1 className="text-2xl font-black flex items-center gap-2"><Shield size={20} /> Validation Handler</h1>
          <p className="text-sm text-gray-400 mt-2">Enter password to access this hidden verification page.</p>
          <form onSubmit={verifyPassword} className="mt-5 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Access password"
              className="w-full bg-[#15152a] border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-400/50"
            />
            {authError && <p className="text-sm text-red-300">{authError}</p>}
            <button
              type="submit"
              disabled={authLoading || !password.trim()}
              className="w-full rounded-xl bg-blue-500/20 border border-blue-400/40 text-blue-200 py-2.5 font-semibold hover:bg-blue-500/30 disabled:opacity-50"
            >
              {authLoading ? 'Verifying...' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-5">
          <h1 className="text-3xl font-black">Payment / Check-in Handler</h1>
          <p className="text-sm text-gray-400 mt-1">QR scan auto-runs when camera is active. Camera pauses while popup is open.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">
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
              className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-gray-200 text-xs hover:bg-white/10 disabled:opacity-50"
            >
              Refresh cache
            </button>
            {cacheError && <span className="text-xs text-olive-300">{cacheError}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#191e1b]/95 p-4">
            <p className="text-sm text-gray-300 mb-2 flex items-center gap-2"><Camera size={15} /> QR Scanner</p>
            <div className="aspect-video rounded-xl bg-black/40 border border-white/10 overflow-hidden relative">
              {lookupLoading && (
                <div className="absolute inset-0 bg-black/60 grid place-items-center z-10">
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
            {cameraError && <p className="mt-2 text-sm text-olive-300">{cameraError}</p>}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#191e1b]/95 p-4">
            <p className="text-sm text-gray-300 mb-2 flex items-center gap-2"><Search size={15} /> Quick Search</p>
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
                className="flex-1 bg-[#15152a] border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-blue-400/50"
              />
              <button
                type="submit"
                disabled={lookupLoading || !query.trim()}
                className="px-4 rounded-xl bg-blue-500/20 border border-blue-400/40 text-blue-200 hover:bg-blue-500/30 disabled:opacity-50"
              >
                {lookupLoading ? '...' : 'Find'}
              </button>
            </form>
            {lookupError && <p className="text-sm text-red-300 mt-2">{lookupError}</p>}

            <div className="mt-4 max-h-80 overflow-auto divide-y divide-white/5">
              {results.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="w-full text-left px-1 py-2 hover:bg-white/[0.03] rounded-lg"
                >
                  <p className="text-sm text-white font-medium">{p.full_name}</p>
                  <p className="text-xs text-gray-400">{p.roll_number} | {p.payment_id}</p>
                </button>
              ))}
              {!results.length && !lookupLoading && <p className="text-sm text-gray-500 py-3">No results yet.</p>}
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 grid place-items-center">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0c0c1d]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold">{selected.full_name}</h2>
                <p className="text-xs text-gray-400">{selected.roll_number}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p><span className="text-gray-400">Branch:</span> {selected.branch}</p>
              <p><span className="text-gray-400">Year:</span> {selected.year}</p>
              <p><span className="text-gray-400">Email:</span> {selected.email}</p>
              <p><span className="text-gray-400">WhatsApp:</span> {selected.whatsapp_number}</p>
              <p><span className="text-gray-400">Payment ID:</span> {selected.payment_id}</p>
              <p><span className="text-gray-400">Skills:</span> {selected.skills.join(', ') || '-'}</p>

              <div className="pt-2 flex items-center gap-2">
                {selected.payment_verified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={14} /> Payment Verified</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-olive-500/15 text-olive-300"><XCircle size={14} /> Payment Pending</span>
                )}
                {selected.check_in_status ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={14} /> Checked In</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-500/15 text-gray-300"><QrCode size={14} /> Not Checked In</span>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex flex-wrap gap-2">
              <button
                onClick={() => requestUpdate('payment', !selected.payment_verified)}
                disabled={updating !== null}
                className="px-3 py-2 rounded-lg border border-blue-400/30 bg-blue-500/10 text-blue-200 text-sm hover:bg-blue-500/20 disabled:opacity-50"
              >
                {updating === 'payment' ? 'Updating...' : selected.payment_verified ? 'Mark Payment Pending' : 'Mark Payment Verified'}
              </button>
              <button
                onClick={() => requestUpdate('checkin', !selected.check_in_status)}
                disabled={updating !== null}
                className="px-3 py-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 text-sm hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {updating === 'checkin' ? 'Updating...' : selected.check_in_status ? 'Undo Check-in' : 'Mark Checked In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notFoundValue !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 grid place-items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0c0c1d]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="text-lg font-bold">No such data exists</h2>
              <button onClick={() => setNotFoundValue(null)} className="p-2 rounded-lg hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 text-sm text-gray-300">
              <p>No matching registration found for:</p>
              <p className="mt-2 font-mono text-xs text-gray-200 break-all rounded-lg bg-white/5 border border-white/10 px-3 py-2">{notFoundValue || '-'}</p>
            </div>
            <div className="px-5 py-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setNotFoundValue(null)}
                className="w-full px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && pendingUpdate && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm p-4 grid place-items-center">
          <div className="w-full max-w-md rounded-2xl border border-olive-400/25 bg-[#0c0c1d]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-olive-200">Confirm action</h2>
              <button onClick={() => setPendingUpdate(null)} className="p-2 rounded-lg hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 text-sm text-gray-300 space-y-3">
              <p className="text-gray-200">You are about to change status for:</p>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="font-semibold text-white">{selected.full_name}</p>
                <p className="text-xs text-gray-400">{selected.roll_number} • {selected.payment_id}</p>
              </div>

              {pendingUpdate.kind === 'payment' ? (
                <div className="space-y-1">
                  <p><span className="text-gray-400">Current payment:</span> {selected.payment_verified ? 'Verified' : 'Pending'}</p>
                  <p><span className="text-gray-400">New payment:</span> {pendingUpdate.nextValue ? 'Verified' : 'Pending'}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p><span className="text-gray-400">Current check-in:</span> {selected.check_in_status ? 'Checked In' : 'Not Checked In'}</p>
                  <p><span className="text-gray-400">New check-in:</span> {pendingUpdate.nextValue ? 'Checked In' : 'Not Checked In'}</p>
                </div>
              )}

              <p className="text-xs text-olive-200/90">This is a confirmation step. Nothing has been changed yet.</p>
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingUpdate(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
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
                className="flex-1 px-4 py-2.5 rounded-xl bg-olive-500/15 border border-olive-400/30 text-olive-100 hover:bg-olive-500/25 disabled:opacity-50"
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
