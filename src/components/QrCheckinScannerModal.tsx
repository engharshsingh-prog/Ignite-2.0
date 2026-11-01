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
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(success ? 880 : 330, ctx.currentTime);
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
  const scanTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
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
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  }, []);

  const resumeScanning = useCallback(() => {
    setScannedParticipant(null);
    setLookupError('');
    setRawScannedData(null);
    setActionSuccessMessage('');
  }, []);

  const lookupParticipant = useCallback(
    async (rawCode: string) => {
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
        // Not a JSON string, proceed with raw text
      }

      // Check in known in-memory participants first if provided
      if (knownParticipants && knownParticipants.length > 0) {
        let match: Participant | undefined;
        if (searchId != null) {
          match = knownParticipants.find((p) => p.id === searchId);
        }
        if (!match) {
          const lowerKey = searchKey.toLowerCase();
          match = knownParticipants.find(
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

      // 2. Fetch live from server
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
    },
    [knownParticipants]
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError('');
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Check torch capability
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = (videoTrack?.getCapabilities?.() as unknown as { torch?: boolean }) || {};
      setHasTorch(Boolean(capabilities?.torch));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);

      // Start scanning loop
      scanTimerRef.current = window.setInterval(() => {
        // Pause scanning if we already have a candidate waiting for permission
        if (scannedParticipant || !videoRef.current || videoRef.current.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
          return;
        }

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

        if (code && code.data && code.data.trim()) {
          lookupParticipant(code.data.trim());
        }
      }, 150);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Unable to access camera. Please allow camera permissions or upload a pass image.');
      setCameraActive(false);
    }
  }, [facingMode, lookupParticipant, scannedParticipant, stopCamera]);

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

  // Handle image upload from file picker
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new window.Image();
    const reader = new FileReader();
    reader.onload = (event) => {
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, img.width, img.height);
        if (code && code.data) {
          lookupParticipant(code.data);
        } else {
          playBeep(false);
          setLookupError('Could not detect a valid QR code in the selected image. Please try another image.');
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

  // Lifecycle when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      resumeScanning();
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera, resumeScanning]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#141815] border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#242e26] bg-[#1a211c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <QrCode size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                Pass QR Scanner
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Live
                </span>
              </h3>
              <p className="text-[11px] text-gray-400">Scan event pass to approve venue check-in</p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
            title="Close Scanner"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* CAMERA VIEWPORT (Hidden when a participant is actively under review for permission) */}
          {!scannedParticipant && (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video sm:aspect-[4/3] border border-white/10 flex items-center justify-center">
              {/* Video Element */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder Overlay with Animated Laser */}
              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-56 h-56 sm:w-64 sm:h-64 border-2 border-emerald-400/40 rounded-2xl">
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

              {/* Camera State Messages */}
              {!cameraActive && (
                <div className="p-6 text-center text-gray-400 space-y-3">
                  <Camera size={40} className="mx-auto opacity-40 text-emerald-400" />
                  <p className="text-sm">
                    {cameraError || 'Starting camera stream for QR code scanning...'}
                  </p>
                  <button
                    onClick={startCamera}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw size={13} /> Retry Camera
                  </button>
                </div>
              )}

              {/* Camera Controls Overlay (Flip, Torch, File) */}
              {cameraActive && (
                <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-2 z-10 px-3">
                  <button
                    type="button"
                    onClick={flipCamera}
                    className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm border border-white/20 transition-colors"
                    title="Switch Camera (Front/Back)"
                  >
                    <RotateCw size={16} />
                  </button>

                  {hasTorch && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`p-2.5 rounded-full backdrop-blur-sm border transition-colors ${
                        torchOn
                          ? 'bg-amber-400 text-black border-amber-300'
                          : 'bg-black/60 hover:bg-black/80 text-white border-white/20'
                      }`}
                      title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                    >
                      <Flashlight size={16} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm border border-white/20 transition-colors"
                    title="Upload Pass Image from Device"
                  >
                    <Upload size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFile}
          />

          {/* LOOKUP ERROR BANNER */}
          {lookupError && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-100">{lookupError}</p>
                {rawScannedData && (
                  <p className="text-[10px] text-red-300/80 mt-1 font-mono break-all line-clamp-2">
                    Scanned: {rawScannedData}
                  </p>
                )}
              </div>
              <button
                onClick={resumeScanning}
                className="text-[11px] underline text-red-300 hover:text-white font-semibold shrink-0"
              >
                Scan Next
              </button>
            </div>
          )}

          {/* PERMISSION & CHECK-IN APPROVAL CARD (Appears when a pass is scanned) */}
          {scannedParticipant && (
            <div className="rounded-2xl border border-emerald-500/40 bg-[#19221b] p-5 shadow-xl relative overflow-hidden space-y-4">
              <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

              {/* Student Header */}
              <div className="flex items-start justify-between gap-3 relative">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-blue-500/30 border border-emerald-500/40 flex items-center justify-center text-lg font-black text-emerald-300 shrink-0">
                    {scannedParticipant.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white tracking-tight">
                      {scannedParticipant.full_name}
                    </h4>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      {scannedParticipant.registration_id && (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {scannedParticipant.registration_id}
                        </span>
                      )}
                      <span className="font-mono text-xs text-gray-300">
                        Roll: {scannedParticipant.roll_number}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Plan Badge */}
                <div className="shrink-0 text-right">
                  {scannedParticipant.year === '2nd Year' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold">
                      <Crown size={12} /> 2nd Year
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30 text-xs font-bold">
                      <GraduationCap size={12} /> 1st Year
                    </span>
                  )}
                </div>
              </div>

              {/* Detail Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-black/30 p-3 rounded-xl border border-white/5">
                <div>
                  <span className="text-gray-400 text-[10px] uppercase font-semibold block">Branch</span>
                  <span className="text-gray-200 font-medium truncate block" title={scannedParticipant.branch}>
                    {scannedParticipant.branch}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 text-[10px] uppercase font-semibold block">Phone</span>
                  <a
                    href={`https://wa.me/${scannedParticipant.whatsapp_number.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-300 hover:underline font-mono inline-flex items-center gap-1"
                  >
                    <Phone size={11} /> {scannedParticipant.whatsapp_number}
                  </a>
                </div>
                <div className="col-span-2 pt-1 border-t border-white/5 flex items-center justify-between">
                  <span className="text-gray-400 text-[10px] uppercase font-semibold">Payment Status</span>
                  {scannedParticipant.payment_status === 'approved' || scannedParticipant.payment_verified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold text-[11px] border border-emerald-500/30">
                      <ShieldCheck size={11} /> Verified (Paid ₹{scannedParticipant.payment_amount || (scannedParticipant.year === '2nd Year' ? 699 : 599)})
                    </span>
                  ) : scannedParticipant.payment_status === 'rejected' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 font-bold text-[11px] border border-red-500/30">
                      <XCircle size={11} /> Payment Rejected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold text-[11px] border border-amber-500/30 animate-pulse">
                      <AlertTriangle size={11} /> Pending Verification
                    </span>
                  )}
                </div>
              </div>

              {/* SUCCESS MESSAGE BANNER */}
              {actionSuccessMessage && (
                <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>{actionSuccessMessage}</span>
                </div>
              )}

              {/* CHECK-IN STATUS & PERMISSION SECTION */}
              <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300 font-semibold flex items-center gap-1.5">
                    Venue Check-in Status:
                  </span>
                  {scannedParticipant.check_in_status ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30">
                      <CheckCircle2 size={13} /> Checked In
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-500/20 text-gray-300 font-semibold text-xs border border-gray-500/30">
                      Not Checked In
                    </span>
                  )}
                </div>

                {/* If already checked in */}
                {scannedParticipant.check_in_status ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-400 shrink-0" />
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
                        className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-950/40"
                      >
                        Scan Next Pass <ArrowRight size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={handleUndoCheckIn}
                        disabled={undoing}
                        className="px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/25 text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Revert check-in if marked by mistake"
                      >
                        {undoing ? 'Reverting...' : 'Undo Check-in'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* PERMISSION PROMPT: NOT CHECKED IN YET */
                  <div className="space-y-3">
                    <p className="text-xs text-emerald-200/90 font-medium leading-relaxed">
                      👉 <strong>Permission Required:</strong> Confirm to approve venue check-in entry for{' '}
                      <span className="text-white font-bold">{scannedParticipant.full_name}</span>?
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleApproveCheckIn}
                        disabled={approving}
                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-black font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
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
                        className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-semibold transition-colors"
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
            <div className="pt-2 border-t border-[#242e26]">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>Pass not scanning? Search manually:</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <Upload size={12} /> Upload Pass Image
                </button>
              </div>

              <form onSubmit={handleManualSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="Enter Roll No, Reg ID (IGN26-...), or Email..."
                    className="w-full bg-[#121613] border border-[#303a32] rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !manualQuery.trim()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-colors disabled:opacity-50 shrink-0"
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
