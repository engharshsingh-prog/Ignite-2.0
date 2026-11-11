import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  Flashlight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  QrCode,
  GraduationCap,
  Crown,
  Phone,
  ArrowRight,
  Upload,
  Search,
  ShieldCheck,
  RotateCw,
} from 'lucide-react';
import jsQR from 'jsqr';
import { authHeaders } from '../lib/auth';
import { getErrorMessage, readJsonSafe } from '../lib/http';
import LoadingSpinner from './LoadingSpinner';

export interface Participant {
  id: number;
  registration_id?: string;
  full_name: string;
  roll_number: string;
  branch: string;
  email: string;
  year: string;
  payment_amount?: number | null;
  whatsapp_number: string;
  skills?: string[];
  payment_id: string | null;
  payment_verified: boolean;
  payment_status?: 'pending_verification' | 'approved' | 'rejected';
  account_holder_name?: string | null;
  check_in_status: boolean;
  check_in_time: string | null;
  registered_at: string;
}

interface QrCheckinScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckInSuccess?: (participant: Participant) => void;
  knownParticipants?: Participant[];
}

function playBeep(success = true) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(success ? 880 : 300, ctx.currentTime);
    if (success) {
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);
    }

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // AudioContext might be restricted until user interaction
  }
}

export default function QrCheckinScannerModal({
  isOpen,
  onClose,
  onCheckInSuccess,
  knownParticipants,
}: QrCheckinScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Use refs to prevent render-reset loops
  const scanningPausedRef = useRef(false);
  const isMountedRef = useRef(true);
  const knownParticipantsRef = useRef<Participant[]>(knownParticipants || []);
  knownParticipantsRef.current = knownParticipants || [];

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Manual search
  const [manualQuery, setManualQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Scanned candidate and lookup
  const [scannedParticipant, setScannedParticipant] = useState<Participant | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [rawScannedData, setRawScannedData] = useState<string | null>(null);

  // Action status
  const [approving, setApproving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState('');

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStarting(false);
    setTorchOn(false);
  }, []);

  const resumeScanning = useCallback(() => {
    scanningPausedRef.current = false;
    setScannedParticipant(null);
    setLookupError('');
    setRawScannedData(null);
    setActionSuccessMessage('');
  }, []);

  const lookupParticipant = useCallback(async (rawCode: string) => {
    // Instantly pause scanning so no second scan triggers while processing
    scanningPausedRef.current = true;
    setLookupError('');
    setActionSuccessMessage('');
    setRawScannedData(rawCode);

    let searchId: number | null = null;
    let searchKey = rawCode.trim();

    // 1. Try parsing JSON payload from pass
    try {
      const parsed = JSON.parse(rawCode);
      if (parsed && typeof parsed === 'object') {
        if (parsed.id != null && !isNaN(Number(parsed.id))) {
          searchId = Number(parsed.id);
        }
        searchKey = String(
          parsed.roll_number ||
          parsed.rollNumber ||
          parsed.registration_id ||
          parsed.registrationId ||
          parsed.payment_id ||
          parsed.paymentId ||
          parsed.email ||
          parsed.whatsapp_number ||
          parsed.id ||
          rawCode
        ).trim();
      }
    } catch {
      // Plain string
    }

    // 2. Check local in-memory participants first
    const pool = knownParticipantsRef.current;
    if (pool.length > 0) {
      let match: Participant | undefined;
      if (searchId != null) {
        match = pool.find((p) => p.id === searchId);
      }
      if (!match) {
        const lowerKey = searchKey.toLowerCase();
        match = pool.find(
          (p) =>
            (p.registration_id && p.registration_id.toLowerCase() === lowerKey) ||
            p.roll_number.toLowerCase() === lowerKey ||
            p.email.toLowerCase() === lowerKey ||
            (p.payment_id && p.payment_id.toLowerCase() === lowerKey) ||
            p.whatsapp_number === lowerKey ||
            p.full_name.toLowerCase() === lowerKey
        );
      }

      if (match) {
        playBeep(true);
        try {
          navigator.vibrate?.([80, 40, 80]);
        } catch (_) {}
        setScannedParticipant(match);
        return;
      }
    }

    // 3. Fetch from server API
    setSearching(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchId != null) {
        queryParams.set('id', String(searchId));
      } else {
        queryParams.set('search', searchKey);
      }

      const res = await fetch(`/api/participants?${queryParams}`, { headers: authHeaders() });
      const data = await readJsonSafe<Participant[] & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to lookup participant'));

      const list = Array.isArray(data) ? data : [];
      if (list.length === 0) {
        playBeep(false);
        setLookupError(`No participant found for QR pass: "${searchKey.slice(0, 40)}"`);
        setScannedParticipant(null);
      } else {
        playBeep(true);
        try {
          navigator.vibrate?.([80, 40, 80]);
        } catch (_) {}
        setScannedParticipant(list[0]);
      }
    } catch (err) {
      playBeep(false);
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
      setScannedParticipant(null);
    } finally {
      setSearching(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError('');
    setCameraStarting(true);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Camera access requires HTTPS or localhost. You can still scan by clicking "Upload Pass Image" below.');
      setCameraStarting(false);
      return;
    }

    try {
      // Attempt camera with ideal facing mode
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode === 'environment' ? { ideal: 'environment' } : 'user',
          },
          audio: false,
        });
      } catch (e) {
        console.warn('Ideal facingMode failed, falling back to basic video:', e);
        // Fallback to any available video stream
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      // Check torch capability
      try {
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = (videoTrack?.getCapabilities?.() as unknown as { torch?: boolean }) || {};
        setHasTorch(Boolean(capabilities?.torch));
      } catch (_) {}

      const video = videoRef.current;
      if (!video) {
        setCameraStarting(false);
        return;
      }

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      // Wait for video to be ready and playing
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(() => resolve()).catch(() => resolve());
        };
        // Safety timeout
        setTimeout(resolve, 800);
      });

      setCameraActive(true);
      setCameraStarting(false);

      // Start the scan loop using requestAnimationFrame
      let lastScanTime = 0;
      const scanLoop = (timestamp: number) => {
        if (!isMountedRef.current) return;

        // Scan every ~120ms to save CPU while maintaining high responsiveness
        if (
          !scanningPausedRef.current &&
          videoRef.current &&
          videoRef.current.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
          timestamp - lastScanTime > 120
        ) {
          lastScanTime = timestamp;
          const v = videoRef.current;
          const canvas = canvasRef.current;
          if (canvas && v.videoWidth > 0 && v.videoHeight > 0) {
            // Scale down to max 640px width for fast decoding
            const scale = Math.min(1, 640 / v.videoWidth);
            const w = Math.floor(v.videoWidth * scale);
            const h = Math.floor(v.videoHeight * scale);

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, w, h);
              const imageData = ctx.getImageData(0, 0, w, h);
              const code = jsQR(imageData.data, w, h, {
                inversionAttempts: 'attemptBoth',
              });

              if (code && code.data && code.data.trim()) {
                lookupParticipant(code.data.trim());
              }
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(scanLoop);
      };

      animFrameRef.current = requestAnimationFrame(scanLoop);
    } catch (err: unknown) {
      console.error('Camera start error:', err);
      const name = (err as { name?: string })?.name || '';
      let msg = 'Failed to access camera.';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser settings, or use "Upload Pass Image" below.';
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        msg = 'No camera found on this device. You can upload an image of the pass or search manually below.';
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        msg = 'Camera is currently in use by another application. Please close other camera apps and retry.';
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      setCameraError(msg);
      setCameraActive(false);
      setCameraStarting(false);
    }
  }, [facingMode, lookupParticipant, stopCamera]);

  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const track = streamRef.current.getVideoTracks()[0];
    const nextState = !torchOn;
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Image upload fallback (or mobile camera via file picker)
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new window.Image();
    const reader = new FileReader();
    reader.onload = (event) => {
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        // Scale to max 1200px for robust QR detection
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code && code.data && code.data.trim()) {
          lookupParticipant(code.data.trim());
        } else {
          playBeep(false);
          setLookupError('Could not detect a QR code in the selected image. Please ensure the QR code is clearly visible and well-lit.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Manual search submit
  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    lookupParticipant(manualQuery.trim());
  };

  // THE CHECK-IN APPROVAL ACTION (Permission Granted)
  const handleApproveCheckIn = async () => {
    if (!scannedParticipant) return;
    setApproving(true);
    setActionSuccessMessage('');
    try {
      const res = await fetch('/api/checkin', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id: scannedParticipant.id, check_in_status: true }),
      });
      const data = await readJsonSafe<Participant & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to approve check-in'));

      const updated = {
        ...scannedParticipant,
        check_in_status: true,
        check_in_time: data?.check_in_time || new Date().toISOString(),
      };
      setScannedParticipant(updated);
      setActionSuccessMessage(`Check-in approved successfully for ${scannedParticipant.full_name}!`);
      playBeep(true);
      try {
        navigator.vibrate?.([100, 50, 100, 50, 150]);
      } catch (_) {}
      onCheckInSuccess?.(updated);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Failed to approve check-in');
    } finally {
      setApproving(false);
    }
  };

  // UNDO CHECK-IN (Revert check-in if checked in by mistake)
  const handleUndoCheckIn = async () => {
    if (!scannedParticipant) return;
    setUndoing(true);
    setActionSuccessMessage('');
    try {
      const res = await fetch('/api/checkin', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id: scannedParticipant.id, check_in_status: false }),
      });
      const data = await readJsonSafe<Participant & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to undo check-in'));

      const updated = {
        ...scannedParticipant,
        check_in_status: false,
        check_in_time: null,
      };
      setScannedParticipant(updated);
      setActionSuccessMessage(`Check-in undone for ${scannedParticipant.full_name}.`);
      onCheckInSuccess?.(updated);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Failed to undo check-in');
    } finally {
      setUndoing(false);
    }
  };

  // Mount/unmount lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      resumeScanning();
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [isOpen, facingMode]); // Only restart camera if modal opened or facingMode flipped!

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#020612]/75 backdrop-blur-md overflow-y-auto">
      <div className="liquid-glass-strong relative w-full max-w-lg border-emerald-400/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[94vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <div className="liquid-icon-bubble w-9 h-9 rounded-xl border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
              <QrCode size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                Pass QR Scanner
                <span className="liquid-glass-pill text-[10px] uppercase font-mono px-2 py-0.5 rounded-full text-emerald-300 font-bold border-emerald-400/30">
                  Live
                </span>
              </h3>
              <p className="text-[11px] text-slate-300/75">Scan event pass to approve venue check-in</p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="liquid-icon-bubble w-8 h-8 rounded-full text-slate-300 hover:text-white cursor-pointer"
            title="Close Scanner"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* CAMERA VIEWPORT - Kept alive in DOM so camera stream never drops */}
          <div
            className={`relative rounded-2xl overflow-hidden bg-black/70 aspect-video sm:aspect-[4/3] border border-white/15 flex items-center justify-center ${
              scannedParticipant ? 'hidden' : 'block'
            }`}
          >
            {/* Video Element (always mounted, playsInline, autoPlay) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Viewfinder Overlay with Animated Laser */}
            {cameraActive && !scannedParticipant && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-56 h-56 sm:w-64 sm:h-64 border-2 border-cyan-300/40 rounded-2xl">
                  {/* Glowing corners */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                  {/* Animated Scanning Line */}
                  <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-[scannerLine_2s_ease-in-out_infinite]" />
                </div>
              </div>
            )}

            {/* Camera Starting / Error Overlay */}
            {(!cameraActive || cameraStarting) && (
              <div className="absolute inset-0 bg-[#040918]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-slate-200 space-y-3 z-10">
                {cameraStarting ? (
                  <>
                    <LoadingSpinner text="Starting camera stream..." />
                    <p className="text-xs text-slate-400">Please grant camera permissions if prompted</p>
                  </>
                ) : cameraError ? (
                  <>
                    <Camera size={36} className="text-amber-300 opacity-75" />
                    <p className="text-xs text-amber-100/90 max-w-sm">{cameraError}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="liquid-btn-glass px-3 py-1.5 rounded-xl border-emerald-400/35 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw size={12} /> Retry Camera
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="liquid-btn-glass px-3 py-1.5 rounded-xl border-cyan-400/35 text-cyan-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload size={12} /> Upload Pass Image
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* Camera Controls Overlay (Flip, Torch, File) */}
            {cameraActive && (
              <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-2 z-10 px-3">
                <button
                  type="button"
                  onClick={flipCamera}
                  className="liquid-icon-bubble p-2.5 rounded-full text-white cursor-pointer"
                  title="Switch Camera (Front/Back)"
                >
                  <RotateCw size={16} />
                </button>

                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2.5 rounded-full backdrop-blur-md border transition-colors cursor-pointer ${
                      torchOn
                        ? 'bg-amber-400 text-black border-amber-300'
                        : 'liquid-icon-bubble text-white'
                    }`}
                    title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                  >
                    <Flashlight size={16} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="liquid-icon-bubble p-2.5 rounded-full text-white cursor-pointer"
                  title="Upload / Photo of Pass Image"
                >
                  <Upload size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Hidden File Input (supports device camera capture) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFile}
          />

          {/* LOOKUP ERROR BANNER */}
          {lookupError && (
            <div className="liquid-glass p-3.5 rounded-2xl border-red-400/35 text-red-200 text-xs flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-300 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-100">{lookupError}</p>
                {rawScannedData && (
                  <p className="text-[10px] text-red-200/80 mt-1 font-mono break-all line-clamp-2">
                    Scanned content: {rawScannedData}
                  </p>
                )}
              </div>
              <button
                onClick={resumeScanning}
                className="text-[11px] underline text-red-200 hover:text-white font-semibold shrink-0 cursor-pointer"
              >
                Scan Next
              </button>
            </div>
          )}

          {/* PERMISSION & CHECK-IN APPROVAL CARD (Appears when a pass is scanned) */}
          {scannedParticipant && (
            <div className="liquid-glass-card rounded-2xl border-emerald-400/35 p-5 relative overflow-hidden space-y-4">
              <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-400/10 rounded-full blur-2xl pointer-events-none" />

              {/* Student Header */}
              <div className="flex items-start justify-between gap-3 relative">
                <div className="flex items-center gap-3">
                  <div className="liquid-icon-bubble w-12 h-12 rounded-2xl border-emerald-400/40 bg-gradient-to-br from-emerald-500/25 to-cyan-500/25 text-lg font-black text-emerald-200 shrink-0">
                    {scannedParticipant.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white tracking-tight">
                      {scannedParticipant.full_name}
                    </h4>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      {scannedParticipant.registration_id && (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                          {scannedParticipant.registration_id}
                        </span>
                      )}
                      <span className="font-mono text-xs text-slate-300">
                        Roll: {scannedParticipant.roll_number}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Plan Badge */}
                <div className="shrink-0 text-right">
                  {scannedParticipant.year === '2nd Year' ? (
                    <span className="liquid-glass-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-amber-400/35 text-amber-200 text-xs font-bold">
                      <Crown size={12} /> 2nd Year
                    </span>
                  ) : (
                    <span className="liquid-glass-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-cyan-400/35 text-cyan-200 text-xs font-bold">
                      <GraduationCap size={12} /> 1st Year
                    </span>
                  )}
                </div>
              </div>

              {/* Detail Grid */}
              <div className="liquid-glass grid grid-cols-2 gap-2 text-xs p-3.5 rounded-xl">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Branch</span>
                  <span className="text-slate-100 font-medium truncate block" title={scannedParticipant.branch}>
                    {scannedParticipant.branch}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold block">Phone</span>
                  <a
                    href={`https://wa.me/${scannedParticipant.whatsapp_number.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-300 hover:underline font-mono inline-flex items-center gap-1"
                  >
                    <Phone size={11} /> {scannedParticipant.whatsapp_number}
                  </a>
                </div>
                <div className="col-span-2 pt-1.5 border-t border-white/10 flex items-center justify-between">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Payment Status</span>
                  {scannedParticipant.payment_status === 'approved' || scannedParticipant.payment_verified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 font-bold text-[11px] border border-emerald-400/30">
                      <ShieldCheck size={11} /> Verified (Paid ₹{scannedParticipant.payment_amount || (scannedParticipant.year === '2nd Year' ? 699 : 599)})
                    </span>
                  ) : scannedParticipant.payment_status === 'rejected' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-200 font-bold text-[11px] border border-red-400/30">
                      <XCircle size={11} /> Payment Rejected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 font-bold text-[11px] border border-amber-400/30 animate-pulse">
                      <AlertTriangle size={11} /> Pending Verification
                    </span>
                  )}
                </div>
              </div>

              {/* SUCCESS MESSAGE BANNER */}
              {actionSuccessMessage && (
                <div className="liquid-glass p-3 rounded-xl border-emerald-400/40 text-emerald-100 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-300 shrink-0" />
                  <span>{actionSuccessMessage}</span>
                </div>
              )}

              {/* CHECK-IN STATUS & PERMISSION SECTION */}
              <div className="liquid-glass p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-200 font-semibold flex items-center gap-1.5">
                    Venue Check-in Status:
                  </span>
                  {scannedParticipant.check_in_status ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-200 font-bold text-xs border border-emerald-400/30">
                      <CheckCircle2 size={13} /> Checked In
                    </span>
                  ) : (
                    <span className="liquid-glass-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-slate-200 font-semibold text-xs">
                      Not Checked In
                    </span>
                  )}
                </div>

                {/* If already checked in */}
                {scannedParticipant.check_in_status ? (
                  <div className="space-y-3">
                    <div className="liquid-glass p-3 rounded-lg border-amber-400/30 text-xs text-amber-100 flex items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-300 shrink-0" />
                      <span>
                        This student is already checked in
                        {scannedParticipant.check_in_time
                          ? ` at ${new Date(scannedParticipant.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                        .
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={resumeScanning}
                        className="liquid-btn-primary flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        Scan Next Pass <ArrowRight size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={handleUndoCheckIn}
                        disabled={undoing}
                        className="px-3 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-400/30 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                        title="Revert check-in if marked by mistake"
                      >
                        {undoing ? 'Reverting...' : 'Undo Check-in'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* PERMISSION PROMPT: NOT CHECKED IN YET */
                  <div className="space-y-3">
                    <p className="text-xs text-emerald-100/90 font-medium leading-relaxed">
                      👉 <strong>Permission Required:</strong> Confirm to approve venue check-in entry for{' '}
                      <span className="text-white font-bold">{scannedParticipant.full_name}</span>?
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleApproveCheckIn}
                        disabled={approving}
                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {approving ? (
                          <>
                            <LoadingSpinner text="" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            Approve Check-in
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={resumeScanning}
                        disabled={approving}
                        className="liquid-btn-glass py-3 px-4 rounded-xl text-slate-200 hover:text-white text-xs font-semibold cursor-pointer"
                      >
                        Cancel / Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BOTTOM UTILITY / MANUAL SEARCH ACCORDION */}
          {!scannedParticipant && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-300/80 mb-2">
                <span>Pass not scanning? Search manually:</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-cyan-300 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Upload size={12} /> Upload Pass Image
                </button>
              </div>

              <form onSubmit={handleManualSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300/70" />
                  <input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="Enter Roll No, Reg ID (IGN26-...), or Email..."
                    className="liquid-input w-full rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-400/60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !manualQuery.trim()}
                  className="liquid-btn-glass px-3.5 py-2 rounded-xl border-emerald-400/35 text-emerald-200 text-xs font-bold disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {searching ? 'Finding...' : 'Lookup'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
