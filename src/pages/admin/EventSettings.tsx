import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Plus, Trash2, CalendarClock, QrCode, Upload } from 'lucide-react';
import { authHeaders } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getErrorMessage, readJsonSafe } from '../../lib/http';
import { fetchEventSettings } from '../../lib/eventSettings';
import type { EventFlowItem } from '../../lib/eventSettings';

interface FormState {
  title: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  dressCodeMale: string;
  dressCodeFemale: string;
  countdownLocal: string;
  flow: EventFlowItem[];
  supportNote: string;
  fee1stYear: number;
  fee2ndYear: number;
  qr1stYearUrl: string;
  qr2ndYearUrl: string;
  upiId1stYear: string;
  upiId2ndYear: string;
  upiName1stYear: string;
  upiName2ndYear: string;
  updatedAt: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

const toInputValue = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const fromInputValue = (value: string) => {
  if (!value) return '';
  return value.length === 16 ? `${value}:00` : value;
};

export default function EventSettings() {
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const settings = await fetchEventSettings();
      setForm({
        title: settings.title,
        dateLabel: settings.dateLabel,
        timeLabel: settings.timeLabel,
        venue: settings.venue,
        dressCodeMale: settings.dressCodeMale,
        dressCodeFemale: settings.dressCodeFemale,
        countdownLocal: toInputValue(settings.countdownIso),
        flow: settings.flow,
        supportNote: settings.supportNote,
        fee1stYear: settings.fee1stYear ?? 599,
        fee2ndYear: settings.fee2ndYear ?? 699,
        qr1stYearUrl: settings.qr1stYearUrl || '/payment-qr-1st-year.png',
        qr2ndYearUrl: settings.qr2ndYearUrl || '/payment-qr-2nd-year.png',
        upiId1stYear: settings.upiId1stYear || 'ysamarjeetyadav2334@okaxis',
        upiId2ndYear: settings.upiId2ndYear || 'ysamarjeetyadav2334@okaxis',
        upiName1stYear: settings.upiName1stYear || 'Samarjeet Yadav',
        upiName2ndYear: settings.upiName2ndYear || 'Samarjeet Yadav',
        updatedAt: settings.updatedAt,
      });
    } catch (err) {
      setForm(null);
      setError(err instanceof Error ? err.message : 'Failed to load event settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleQrUpload = (year: '1st' | '2nd', file: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setError('Please upload a valid image file (PNG, JPG, or WEBP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image file size exceeds 10MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (year === '1st') {
        setForm((prev) => prev ? { ...prev, qr1stYearUrl: dataUrl } : prev);
      } else {
        setForm((prev) => prev ? { ...prev, qr2ndYearUrl: dataUrl } : prev);
      }
    };
    reader.readAsDataURL(file);
  };

  const updateFlow = (index: number, key: keyof EventFlowItem, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const nextFlow = prev.flow.map((item, idx) => idx === index ? { ...item, [key]: value } : item);
      return { ...prev, flow: nextFlow };
    });
  };

  const addFlowRow = () => {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, flow: [...prev.flow, { time: '', title: '', desc: '' }] };
    });
  };

  const removeFlowRow = (index: number) => {
    setForm((prev) => {
      if (!prev) return prev;
      const nextFlow = prev.flow.filter((_, idx) => idx !== index);
      return { ...prev, flow: nextFlow.length ? nextFlow : [{ time: '', title: '', desc: '' }] };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = {
        title: form.title,
        date_label: form.dateLabel,
        time_label: form.timeLabel,
        venue: form.venue,
        dress_code_male: form.dressCodeMale,
        dress_code_female: form.dressCodeFemale,
        countdown_iso: fromInputValue(form.countdownLocal),
        flow: form.flow,
        support_note: form.supportNote,
        fee_1st_year: form.fee1stYear,
        fee_2nd_year: form.fee2ndYear,
        qr_1st_year_url: form.qr1stYearUrl,
        qr_2nd_year_url: form.qr2ndYearUrl,
        upi_id_1st_year: form.upiId1stYear,
        upi_id_2nd_year: form.upiId2ndYear,
        upi_name_1st_year: form.upiName1stYear,
        upi_name_2nd_year: form.upiName2ndYear,
      };
      const res = await fetch('/api/event-settings', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await readJsonSafe<any>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to save event settings'));
      setForm((prev) => prev ? {
        ...prev,
        qr1stYearUrl: data?.qr_1st_year_url || prev.qr1stYearUrl,
        qr2ndYearUrl: data?.qr_2nd_year_url || prev.qr2ndYearUrl,
        updatedAt: data?.updated_at || new Date().toISOString()
      } : prev);
      setMessage('Event settings updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen text-white pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="liquid-icon-bubble w-10 h-10 rounded-xl text-slate-300 hover:text-white">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black flex items-center gap-2.5 bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent">
                <CalendarClock size={24} className="text-cyan-300" /> Event Settings
              </h1>
              <p className="text-slate-300/80 text-sm">Update venue, timing, countdown, dress code and day flow</p>
            </div>
          </div>
          <button
            onClick={loadSettings}
            className="liquid-btn-glass px-4 py-2 rounded-xl text-slate-200 text-sm"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <LoadingSpinner text="Loading event settings..." />
        ) : !form ? (
          <div role="alert" className="liquid-glass-strong rounded-2xl border-red-400/35 p-5 text-red-100">
            <p>{error || 'Event settings could not be loaded.'}</p>
            <button onClick={loadSettings} className="liquid-btn-primary mt-3 rounded-xl px-4 py-2 text-white text-sm">Try again</button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-strong rounded-3xl p-6">
              <h2 className="text-lg font-bold mb-4 text-white">Core Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="event-title" className="block text-sm text-slate-300 mb-1.5">Event Title</label>
                  <input
                    id="event-title"
                    value={form.title}
                    onChange={(e) => setForm((prev) => prev ? { ...prev, title: e.target.value } : prev)}
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label htmlFor="event-venue" className="block text-sm text-slate-300 mb-1.5">Venue</label>
                  <input
                    id="event-venue"
                    value={form.venue}
                    onChange={(e) => setForm((prev) => prev ? { ...prev, venue: e.target.value } : prev)}
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label htmlFor="event-date" className="block text-sm text-slate-300 mb-1.5">Display Date</label>
                  <input
                    id="event-date"
                    value={form.dateLabel}
                    onChange={(e) => setForm((prev) => prev ? { ...prev, dateLabel: e.target.value } : prev)}
                    placeholder="Enter event date"
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label htmlFor="event-time" className="block text-sm text-slate-300 mb-1.5">Display Time</label>
                  <input
                    id="event-time"
                    value={form.timeLabel}
                    onChange={(e) => setForm((prev) => prev ? { ...prev, timeLabel: e.target.value } : prev)}
                    placeholder="Enter event time"
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label htmlFor="countdown-date" className="block text-sm text-slate-300 mb-1.5">Countdown Date & Time</label>
                  <input
                    id="countdown-date"
                    type="datetime-local"
                    value={form.countdownLocal}
                    onChange={(e) => setForm((prev) => prev ? { ...prev, countdownLocal: e.target.value } : prev)}
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5">Last Updated</label>
                  <div className="liquid-glass w-full rounded-xl px-4 py-3 text-sm text-cyan-100/85">
                    {form.updatedAt ? new Date(form.updatedAt).toLocaleString() : 'Not yet updated'}
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex items-center gap-2.5 mb-2">
                <QrCode size={20} className="text-cyan-300" />
                <h2 className="text-lg font-bold text-white">Payment & QR Code Settings</h2>
              </div>
              <p className="text-xs text-slate-300/80 mb-6">
                Configure independent registration fees, payment UPI accounts, and QR codes for 1st Year and 2nd Year participants.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1st Year Configuration */}
                <div className="liquid-glass rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                      1st Year Configuration
                    </h3>
                    <span className="liquid-glass-pill text-xs font-semibold px-2.5 py-1 rounded-full text-cyan-200 border-cyan-400/35">
                      INR {form.fee1stYear}
                    </span>
                  </div>

                  <div>
                    <label htmlFor="fee-1st-year" className="block text-sm text-slate-200 mb-1">
                      Registration Fee (INR) *
                    </label>
                    <input
                      id="fee-1st-year"
                      type="number"
                      min="0"
                      value={form.fee1stYear}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, fee1stYear: Number(e.target.value) } : prev)}
                      className="liquid-input w-full rounded-xl px-4 py-2.5 text-white font-mono"
                      placeholder="599"
                    />
                  </div>

                  <div>
                    <label htmlFor="upi-id-1st-year" className="block text-sm text-slate-200 mb-1">
                      UPI ID *
                    </label>
                    <input
                      id="upi-id-1st-year"
                      type="text"
                      value={form.upiId1stYear}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, upiId1stYear: e.target.value } : prev)}
                      className="liquid-input w-full rounded-xl px-4 py-2.5 text-white font-mono text-sm"
                      placeholder="e.g. ysamarjeetyadav2334@okaxis"
                    />
                  </div>

                  <div>
                    <label htmlFor="upi-name-1st-year" className="block text-sm text-slate-200 mb-1">
                      Payee / Account Name
                    </label>
                    <input
                      id="upi-name-1st-year"
                      type="text"
                      value={form.upiName1stYear}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, upiName1stYear: e.target.value } : prev)}
                      className="liquid-input w-full rounded-xl px-4 py-2.5 text-white text-sm"
                      placeholder="e.g. Samarjeet Yadav"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-200 mb-1.5">
                      1st Year Payment QR Code
                    </label>
                    <div className="liquid-glass flex flex-col sm:flex-row items-center gap-4 p-3 rounded-xl">
                      {form.qr1stYearUrl ? (
                        <div className="w-24 h-24 bg-white rounded-xl p-1 flex items-center justify-center flex-shrink-0 shadow-md">
                          <img
                            src={form.qr1stYearUrl}
                            alt="1st Year QR Preview"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-24 h-24 bg-white/5 rounded-xl border border-dashed border-white/25 flex items-center justify-center text-xs text-slate-400 text-center p-2 flex-shrink-0">
                          No QR
                        </div>
                      )}
                      <div className="flex-1 w-full space-y-2">
                        <label className="liquid-btn-glass flex items-center justify-center gap-2 px-3 py-2 border-cyan-400/35 text-cyan-200 text-xs font-semibold rounded-xl cursor-pointer">
                          <Upload size={14} /> Upload New QR Image
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => handleQrUpload('1st', e.target.files?.[0] || null)}
                          />
                        </label>
                        <input
                          type="text"
                          value={form.qr1stYearUrl}
                          onChange={(e) => setForm((prev) => prev ? { ...prev, qr1stYearUrl: e.target.value } : prev)}
                          placeholder="/payment-qr-1st-year.png"
                          className="liquid-input w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2nd Year Configuration */}
                <div className="liquid-glass rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                      2nd Year Configuration
                    </h3>
                    <span className="liquid-glass-pill text-xs font-semibold px-2.5 py-1 rounded-full text-emerald-200 border-emerald-400/35">
                      INR {form.fee2ndYear}
                    </span>
                  </div>

                  <div>
                    <label htmlFor="fee-2nd-year" className="block text-sm text-slate-200 mb-1">
                      Registration Fee (INR) *
                    </label>
                    <input
                      id="fee-2nd-year"
                      type="number"
                      min="0"
                      value={form.fee2ndYear}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, fee2ndYear: Number(e.target.value) } : prev)}
                      className="liquid-input w-full rounded-xl px-4 py-2.5 text-white font-mono"
                      placeholder="699"
                    />
                  </div>

                  <div>
                    <label htmlFor="upi-id-2nd-year" className="block text-sm text-slate-200 mb-1">
                      UPI ID *
                    </label>
                    <input
                      id="upi-id-2nd-year"
                      type="text"
                      value={form.upiId2ndYear}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, upiId2ndYear: e.target.value } : prev)}
                      className="liquid-input w-full rounded-xl px-4 py-2.5 text-white font-mono text-sm"
                      placeholder="e.g. ysamarjeetyadav2334@okaxis"
                    />
                  </div>

                  <div>
                    <label htmlFor="upi-name-2nd-year" className="block text-sm text-slate-200 mb-1">
                      Payee / Account Name
                    </label>
                    <input
                      id="upi-name-2nd-year"
                      type="text"
                      value={form.upiName2ndYear}
                      onChange={(e) => setForm((prev) => prev ? { ...prev, upiName2ndYear: e.target.value } : prev)}
                      className="liquid-input w-full rounded-xl px-4 py-2.5 text-white text-sm"
                      placeholder="e.g. Samarjeet Yadav"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-200 mb-1.5">
                      2nd Year Payment QR Code
                    </label>
                    <div className="liquid-glass flex flex-col sm:flex-row items-center gap-4 p-3 rounded-xl">
                      {form.qr2ndYearUrl ? (
                        <div className="w-24 h-24 bg-white rounded-xl p-1 flex items-center justify-center flex-shrink-0 shadow-md">
                          <img
                            src={form.qr2ndYearUrl}
                            alt="2nd Year QR Preview"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-24 h-24 bg-white/5 rounded-xl border border-dashed border-white/25 flex items-center justify-center text-xs text-slate-400 text-center p-2 flex-shrink-0">
                          No QR
                        </div>
                      )}
                      <div className="flex-1 w-full space-y-2">
                        <label className="liquid-btn-glass flex items-center justify-center gap-2 px-3 py-2 border-emerald-400/35 text-emerald-200 text-xs font-semibold rounded-xl cursor-pointer">
                          <Upload size={14} /> Upload New QR Image
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => handleQrUpload('2nd', e.target.files?.[0] || null)}
                          />
                        </label>
                        <input
                          type="text"
                          value={form.qr2ndYearUrl}
                          onChange={(e) => setForm((prev) => prev ? { ...prev, qr2ndYearUrl: e.target.value } : prev)}
                          placeholder="/payment-qr-2nd-year.png"
                          className="liquid-input w-full rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-strong rounded-3xl p-6">
              <h2 className="text-lg font-bold mb-4 text-white">Dress Code & Support Note</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dress-code-male" className="block text-sm text-slate-300 mb-1.5">Dress Code (Boys)</label>
                  <input
                    id="dress-code-male"
                    value={form.dressCodeMale}
                    onChange={(e) => setForm((prev) => prev ? { ...prev, dressCodeMale: e.target.value } : prev)}
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label htmlFor="dress-code-female" className="block text-sm text-slate-300 mb-1.5">Dress Code (Girls)</label>
                  <input
                    id="dress-code-female"
                    value={form.dressCodeFemale}
                    onChange={(e) => setForm((prev) => prev ? { ...prev, dressCodeFemale: e.target.value } : prev)}
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="support-note" className="block text-sm text-slate-300 mb-1.5">Support Note (Pending Payment)</label>
                  <textarea
                    id="support-note"
                    value={form.supportNote}
                    onChange={(e) => setForm((prev) => prev ? { ...prev, supportNote: e.target.value } : prev)}
                    rows={2}
                    className="liquid-input w-full rounded-xl px-4 py-3 text-white resize-none"
                  />
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-strong rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Day Flow</h2>
                <button
                  type="button"
                  onClick={addFlowRow}
                  className="liquid-btn-glass px-3.5 py-2 rounded-xl border-emerald-400/35 text-emerald-200 text-sm flex items-center gap-2"
                >
                  <Plus size={14} /> Add Slot
                </button>
              </div>
              <div className="space-y-3">
                {form.flow.map((item, idx) => (
                  <div key={`${idx}-${item.time}-${item.title}`} className="grid grid-cols-1 md:grid-cols-[120px_1fr_1fr_40px] gap-3 items-center">
                    <input
                      aria-label={`Slot ${idx + 1} time`}
                      value={item.time}
                      onChange={(e) => updateFlow(idx, 'time', e.target.value)}
                      placeholder="11:00"
                      className="liquid-input w-full rounded-xl px-3 py-2.5 text-white"
                    />
                    <input
                      aria-label={`Slot ${idx + 1} title`}
                      value={item.title}
                      onChange={(e) => updateFlow(idx, 'title', e.target.value)}
                      placeholder="Session title"
                      className="liquid-input w-full rounded-xl px-3 py-2.5 text-white"
                    />
                    <input
                      aria-label={`Slot ${idx + 1} description`}
                      value={item.desc}
                      onChange={(e) => updateFlow(idx, 'desc', e.target.value)}
                      placeholder="Short description"
                      className="liquid-input w-full rounded-xl px-3 py-2.5 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeFlowRow(idx)}
                      className="w-10 h-10 rounded-xl border border-red-400/35 bg-red-500/15 text-red-200 flex items-center justify-center hover:bg-red-500/25 transition-colors"
                      aria-label="Remove slot"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>

            {(error || message) && (
              <div className="liquid-glass rounded-2xl px-4 py-3 text-sm">
                {error && <p className="text-red-300">{error}</p>}
                {message && <p className="text-emerald-300">{message}</p>}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="liquid-btn-primary px-6 py-3 rounded-xl text-white font-bold disabled:opacity-50 flex items-center gap-2"
              >
                <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
