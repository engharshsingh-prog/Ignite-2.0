import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Hash, Phone, Mail, CheckCircle, XCircle, Search, QrCode, Download, Share2, FileDown, AlertCircle, Users } from 'lucide-react';
import QRCode from 'qrcode';
import { getErrorMessage, readJsonSafe } from '../lib/http';
import { useEventSettings } from '../lib/useEventSettings';
import { drawPassEventDetails, drawPassParticipantDetails } from '../lib/passArtwork';

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

async function dataUrlToFile(dataUrl: string, name: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || 'image/png' });
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load pass template image'));
    img.src = src;
  });
}



export default function MyProfile() {
  const { settings } = useEventSettings();
  const [email, setEmail] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [error, setError] = useState('');
  const [qrBusy, setQrBusy] = useState<'download' | 'share' | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const qrPayload = useMemo(() => {
    if (!participant) return '';
    return JSON.stringify({
      id: participant.id,
      full_name: participant.full_name,
      roll_number: participant.roll_number,
      payment_id: participant.payment_id,
      email: participant.email,
      whatsapp_number: participant.whatsapp_number,
    });
  }, [participant]);

  const qrImageUrl = useMemo(() => {
    if (!qrPayload) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrPayload)}`;
  }, [qrPayload]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setParticipant(null);
    setActionMessage('');
    try {
      const res = await fetch('/api/participant-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          roll_number: rollNumber.trim(),
          whatsapp_number: whatsappNumber.trim(),
        }),
      });
      const data = await readJsonSafe<Participant & { error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Unable to find profile'));
      if (!data) throw new Error('Empty response from server');
      setParticipant(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lookup failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const downloadQr = async () => {
    if (!participant || !qrImageUrl) return;
    setQrBusy('download');
    setActionMessage('');
    try {
      const response = await fetch(qrImageUrl);
      if (!response.ok) throw new Error('Failed to load QR image');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileNameSafe(participant.full_name || 'participant')}-ignite26-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to download QR');
    } finally {
      setQrBusy(null);
    }
  };

  const shareQr = async () => {
    if (!participant || !qrPayload) return;
    setQrBusy('share');
    setActionMessage('');
    try {
      const file = await dataUrlToFile(await QRCode.toDataURL(qrPayload), `${fileNameSafe(participant.full_name || 'participant')}-ignite26-qr.png`);
      const shareText = `${participant.full_name} | ${participant.roll_number} | Ignite 2.O`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Ignite 2.O Registration QR",
          text: shareText,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: "Ignite 2.O Registration QR",
          text: `${shareText}\n${qrPayload}`,
        });
      } else {
        await navigator.clipboard.writeText(qrPayload);
        setActionMessage('QR payload copied to clipboard.');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setQrBusy(null);
        return;
      }
      setActionMessage(err instanceof Error ? err.message : 'Failed to share QR');
    } finally {
      setQrBusy(null);
    }
  };

  const downloadTicketPdf = async () => {
    if (!participant || !participant.payment_verified) return;

    setPdfBusy(true);
    setActionMessage('');
    try {
      const template = await loadImage('/event-pass.svg');
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

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ignite26-pass-${fileNameSafe(participant.full_name || participant.roll_number)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to generate pass image');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="min-h-screen text-white pt-24 pb-20 px-4">
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-10">
            <div className="liquid-icon-bubble w-16 h-16 mx-auto mb-4 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.22)]">
              <User size={28} />
            </div>
            <h1 className="text-4xl font-black mb-2 bg-gradient-to-r from-white via-cyan-100 to-violet-300 bg-clip-text text-transparent">
              My Profile
            </h1>
            <p className="text-slate-300/80 text-sm sm:text-base">
              Enter your email, roll number/enrolment number, and WhatsApp number to view your registration.
            </p>
          </div>

          <form onSubmit={handleLookup} className="liquid-glass-strong rounded-3xl p-6 sm:p-7 mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-300/70" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="yourname@example.com"
                    className="liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400/60"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">Roll Number/Enrolment Number</label>
                <div className="relative">
                  <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-300/70" />
                  <input
                    value={rollNumber}
                    onChange={e => setRollNumber(e.target.value)}
                    placeholder="Roll number or enrolment number (under 15 chars)"
                    maxLength={15}
                    className="liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400/60"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">WhatsApp Number</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-300/70" />
                  <input
                    value={whatsappNumber}
                    onChange={e => setWhatsappNumber(e.target.value)}
                    placeholder="10-digit WhatsApp number"
                    maxLength={10}
                    className="liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400/60"
                  />
                </div>
              </div>
            </div>
            {error && <p className="text-red-300 text-sm mt-3">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="liquid-btn-primary w-full mt-5 py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Search size={18} /> {loading ? 'Searching...' : 'Find My Profile'}
            </button>
          </form>

          {participant && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="liquid-glass-strong rounded-3xl overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-500/75 via-blue-600/80 to-violet-600/75 backdrop-blur-md border-b border-white/15 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/35 flex items-center justify-center text-2xl font-black text-white shadow-lg">
                    {participant.full_name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">{participant.full_name}</h2>
                    <p className="text-cyan-100/90 text-sm">{participant.roll_number} | {participant.branch}</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-white/10">
                  <span className="text-slate-400 text-sm">Payment Status</span>
                  <div className="flex items-center gap-2">
                    {participant.payment_verified ? (
                      <><CheckCircle size={18} className="text-emerald-300" /><span className="text-emerald-300 font-semibold">Verified</span></>
                    ) : (
                      <><AlertCircle size={18} className="text-amber-300" /><span className="text-amber-300 font-semibold">Pending Verification</span></>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/10">
                  <span className="text-slate-400 text-sm">Check-in Status</span>
                  <div className="flex items-center gap-2">
                    {participant.check_in_status ? (
                      <><CheckCircle size={18} className="text-emerald-300" /><span className="text-emerald-300 font-semibold">Checked In</span></>
                    ) : (
                      <><XCircle size={18} className="text-slate-400" /><span className="text-slate-300">Not Yet</span></>
                    )}
                  </div>
                </div>
                {participant.check_in_time && (
                  <div className="flex justify-between py-3 border-b border-white/10">
                    <span className="text-slate-400 text-sm">Check-in Time</span>
                    <span className="text-white text-sm">{new Date(participant.check_in_time).toLocaleTimeString()}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 border-b border-white/10 gap-3">
                  <span className="text-slate-400 text-sm">Email</span>
                  <span className="text-white text-sm text-right break-all">{participant.email}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-white/10 gap-3">
                  <span className="text-slate-400 text-sm">Year</span>
                  <span className="text-white text-sm text-right">{participant.year}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-white/10 gap-3">
                  <span className="text-slate-400 text-sm">Skills</span>
                  <span className="text-white text-sm text-right">{Array.isArray(participant.skills) ? participant.skills.join(', ') : ''}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-white/10 gap-3">
                  <span className="text-slate-400 text-sm">Payment ID</span>
                  <span className="text-cyan-200 font-mono text-sm text-right">{participant.payment_id}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-white/10 gap-3">
                  <span className="text-slate-400 text-sm">WhatsApp</span>
                  <span className="text-white text-sm text-right">{participant.whatsapp_number}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-white/10">
                  <span className="text-slate-400 text-sm">Registered On</span>
                  <span className="text-white text-sm">{new Date(participant.registered_at).toLocaleDateString()}</span>
                </div>

                <div className="mt-2 pt-4 border-t border-white/10">
                  <p className="text-cyan-100 text-sm font-medium mb-3 flex items-center gap-2"><QrCode size={15} className="text-cyan-300" /> Registration QR</p>
                  <div className="liquid-glass rounded-2xl p-4">
                    <img src={qrImageUrl} alt="Registration QR" className="w-52 h-52 mx-auto rounded-xl bg-white p-2 shadow-lg" />
                    <div className="mt-4 flex gap-2.5">
                      <button
                        type="button"
                        onClick={downloadQr}
                        disabled={qrBusy !== null}
                        className="liquid-btn-glass flex-1 px-3 py-2.5 rounded-xl border-cyan-400/35 text-cyan-200 text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                      >
                        <Download size={14} /> {qrBusy === 'download' ? 'Downloading...' : 'Download QR'}
                      </button>
                      <button
                        type="button"
                        onClick={shareQr}
                        disabled={qrBusy !== null}
                        className="liquid-btn-glass flex-1 px-3 py-2.5 rounded-xl border-violet-400/35 text-violet-200 text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                      >
                        <Share2 size={14} /> {qrBusy === 'share' ? 'Sharing...' : 'Share QR'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-4 border-t border-white/10">
                  {participant.payment_verified ? (
                    <button
                      type="button"
                      onClick={downloadTicketPdf}
                      disabled={pdfBusy}
                      className="liquid-btn-primary w-full px-4 py-3.5 rounded-xl text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      <FileDown size={16} /> {pdfBusy ? 'Generating Pass...' : 'Download Event Pass'}
                    </button>
                  ) : (
                    <div className="liquid-glass rounded-2xl border-cyan-400/30 p-4">
                      <p className="text-cyan-100 text-sm leading-relaxed">
                        {settings.supportNote}
                      </p>
                      <Link
                        to="/management-team"
                        className="liquid-btn-glass mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border-emerald-400/35 text-emerald-200 text-sm"
                      >
                        <Users size={14} /> Contact Management Team
                      </Link>
                    </div>
                  )}
                </div>

                {actionMessage && <p className="text-xs text-slate-300">{actionMessage}</p>}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
