import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle,
  CreditCard,
  Hash,
  Mail,
  Phone,
  QrCode,
  Sparkles,
  User,
} from 'lucide-react';
import { getErrorMessage, readJsonSafe } from '../lib/http';

type FieldState = 'idle' | 'valid' | 'invalid';

interface FormData {
  email: string;
  full_name: string;
  roll_number: string;
  branch: string;
  year: string;
  skills: string[];
  payment_id: string;
  whatsapp_number: string;
}

const BRANCHES = ['Computer Science and Engineering (CSE Core)', 'Computer Science and Engineering (CSE AI/ML)', 'Information Technology (IT)', 'Electronics and Communication Engineering (ECE)', 'Mechanical Engineering (ME)'];
const YEARS = ['1st Year', '2nd Year'];
const SKILLS = ['Singing', 'Games/Fun Activities', 'Dance', 'Comedy/Standup', 'Others'];

const YEAR_FEES: Record<string, number> = {
  '1st Year': 500,
  '2nd Year': 650,
};
const UPI_ID = 'harshitkan2908@oksbi';
const UPI_PAYEE_NAME = "Ignite 2.O Event";
const UPI_NOTE = "Ignite 2.O Registration";

function validateField(name: string, value: string): FieldState {
  if (!value) return 'idle';
  switch (name) {
    case 'full_name':
      return value.trim().length >= 2 ? 'valid' : 'invalid';
    case 'roll_number':
      return /^\d{13}$/.test(value.trim()) ? 'valid' : 'invalid';
    case 'email':
      return /^[^\s@]+@gmail\.com$/i.test(value.trim()) ? 'valid' : 'invalid';
    case 'whatsapp_number':
      return /^\d{10}$/.test(value) ? 'valid' : 'invalid';
    case 'payment_id':
      return value.trim().length >= 6 ? 'valid' : 'invalid';
    case 'branch':
    case 'year':
      return value !== '' ? 'valid' : 'idle';
    default:
      return 'idle';
  }
}

export default function Register() {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormData>({
    email: '',
    full_name: '',
    roll_number: '',
    branch: '',
    year: '',
    skills: [],
    payment_id: '',
    whatsapp_number: '',
  });
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<FormData & { id?: number } | null>(null);
  const [error, setError] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const registrationFee = YEAR_FEES[form.year] ?? 0;

  const upiLink = useMemo(() => {
    const params = new URLSearchParams({
      pa: UPI_ID,
      pn: UPI_PAYEE_NAME,
      am: String(registrationFee),
      cu: 'INR',
      tn: UPI_NOTE,
    });
    return `upi://pay?${params.toString()}`;
  }, [registrationFee]);

  const qrSrc = useMemo(() => {
    const data = encodeURIComponent(upiLink);
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${data}`;
  }, [upiLink]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setFieldStates(s => ({ ...s, [name]: validateField(name, value) }));
    if (name === 'email') {
      setOtp('');
      setOtpToken('');
      setOtpSent(false);
      setOtpVerified(false);
      setOtpMessage('');
    }
    setError('');
  };

  const handleSendOtp = async () => {
    if (validateField('email', form.email) !== 'valid') {
      setError('Enter a valid gmail.com address before requesting OTP.');
      return;
    }

    setOtpLoading(true);
    setError('');
    setOtpMessage('');

    try {
      const res = await fetch('/api/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email: form.email }),
      });
      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to send OTP'));

      setOtpSent(true);
      setOtpVerified(false);
      setOtpToken('');
      setOtpMessage('OTP sent. Check Inbox, Spam and Promotions folders.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpSent) {
      setError('Please request OTP first.');
      return;
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter valid 6-digit OTP.');
      return;
    }

    setOtpLoading(true);
    setError('');
    setOtpMessage('');
    try {
      const res = await fetch('/api/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email: form.email, otp: otp.trim() }),
      });
      const data = await readJsonSafe<{ error?: string; otp_token?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'OTP verification failed'));
      if (!data?.otp_token) throw new Error('OTP verification token missing');

      setOtpVerified(true);
      setOtpToken(data.otp_token);
      setOtpMessage('Email verified successfully.');
    } catch (err: unknown) {
      setOtpVerified(false);
      setOtpToken('');
      setError(err instanceof Error ? err.message : 'OTP verification failed');
    } finally {
      setOtpLoading(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setForm(f => {
      const exists = f.skills.includes(skill);
      const next = exists ? f.skills.filter(s => s !== skill) : [...f.skills, skill];
      return { ...f, skills: next };
    });
    setError('');
  };

  const validateStepOne = () => {
    const states: Record<string, FieldState> = {};
    const fields: Array<keyof FormData> = ['email', 'full_name', 'roll_number', 'branch', 'year'];
    let valid = true;

    for (const field of fields) {
      const state = validateField(field, String(form[field]));
      states[field] = state;
      if (state !== 'valid') valid = false;
    }

    setFieldStates(prev => ({ ...prev, ...states }));

    if (valid && !otpVerified) {
      valid = false;
      setError('Email OTP verification is mandatory before continuing.');
    } else if (!valid) {
      setError('Please complete all basic details before continuing.');
    }
    return valid;
  };

  const validateStepTwo = () => {
    const states: Record<string, FieldState> = {};
    const fields: Array<keyof FormData> = ['payment_id', 'whatsapp_number'];
    let valid = true;

    for (const field of fields) {
      const state = validateField(field, String(form[field]));
      states[field] = state;
      if (state !== 'valid') valid = false;
    }

    setFieldStates(prev => ({ ...prev, ...states }));
    if (!valid) setError('Please add valid payment and contact details.');
    return valid;
  };

  const handleNext = () => {
    setError('');
    if (validateStepOne()) setStep(2);
  };

  const handleBack = () => {
    setError('');
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateStepOne()) {
      setStep(1);
      return;
    }
    if (!validateStepTwo()) {
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, otp_token: otpToken }),
      });
      const data = await readJsonSafe<{ id?: number; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Registration failed'));
      setSuccess({ ...form, id: data?.id });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const borderClass = (field: string) => {
    const s = fieldStates[field];
    if (s === 'valid') return 'border-emerald-500 focus:border-emerald-400';
    if (s === 'invalid') return 'border-red-500 focus:border-red-400';
    return 'border-white/10 focus:border-[#3b82f6]';
  };

  const skillSelected = (skill: string) => form.skills.includes(skill);

  if (success) {
    return (
      <div className="min-h-screen bg-[#111411] grid-bg flex items-center justify-center px-4 pt-16">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-emerald-400" />
          </div>
          <h2 className="text-3xl font-display font-black text-white mb-2">Registration Complete</h2>
          <p className="text-gray-400 mb-8">Your registration has been recorded successfully. Confirmation mail has been sent.</p>
          <div className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-6 text-left space-y-3 mb-8 gradient-border">
            <div className="flex justify-between gap-3">
              <span className="text-gray-400 text-sm">Name</span>
              <span className="text-white font-medium text-right">{success.full_name}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400 text-sm">Roll Number</span>
              <span className="text-white font-medium text-right">{success.roll_number}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400 text-sm">Branch</span>
              <span className="text-white font-medium text-right">{success.branch}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400 text-sm">Year</span>
              <span className="text-white font-medium text-right">{success.year}</span>
            </div>
          </div>
          <p className="text-blue-300 text-sm">Save your roll number and WhatsApp number to access your profile later. If email is not in Inbox, check Spam/Promotions.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16 px-4">
      <div className="max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#3b82f6] text-sm font-medium mb-4">Ignite 2.O</span>
            <h1 className="text-4xl font-display font-black mb-2 neon-olive">Register Now</h1>
            <p className="text-gray-400">Step {step} of 2</p>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className={`flex-1 h-2 rounded-full ${step >= 1 ? 'bg-[#3b82f6]' : 'bg-white/10'}`} />
            <div className={`flex-1 h-2 rounded-full ${step >= 2 ? 'bg-[#a3b46a]' : 'bg-white/10'}`} />
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 mb-6">
              <AlertCircle size={18} />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Email Address *</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="yourname@example.com"
                      className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors ${borderClass('email')}`} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Only gmail.com addresses are accepted. OTP and confirmation mails may arrive in Spam or Promotions folders.</p>
                  <div className="mt-2 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={otpLoading || validateField('email', form.email) !== 'valid'}
                      className="sm:w-40 px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-sm hover:bg-blue-600/30 disabled:opacity-50"
                    >
                      {otpLoading ? 'Sending...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                    </button>
                    <div className="flex-1 flex gap-2">
                      <input
                        value={otp}
                        onChange={e => setOtp(e.target.value)}
                        maxLength={6}
                        placeholder="Enter 6-digit OTP"
                        className="flex-1 bg-[#191e1b]/90 border border-[#303a32] rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={otpLoading || !otpSent}
                        className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm hover:bg-emerald-500/30 disabled:opacity-50"
                      >
                        {otpLoading ? '...' : otpVerified ? 'Verified' : 'Verify'}
                      </button>
                    </div>
                  </div>
                  {otpMessage && (
                    <p className={`text-xs mt-1 ${otpVerified ? 'text-emerald-400' : 'text-olive-300'}`}>{otpMessage}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name *</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input name="full_name" value={form.full_name} onChange={handleChange} placeholder="Your full name"
                      className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors ${borderClass('full_name')}`} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Complete Roll Number (13 digits) *</label>
                  <div className="relative">
                    <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input name="roll_number" value={form.roll_number} onChange={handleChange} placeholder="13-digit numerical roll number" maxLength={13}
                      className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors ${borderClass('roll_number')}`} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Branch *</label>
                  <div className="relative">
                    <BookOpen size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <select name="branch" value={form.branch} onChange={handleChange}
                      className={`w-full bg-[#1a1530] border rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none transition-colors appearance-none ${borderClass('branch')}`}>
                      <option value="" className="text-gray-600">Select branch</option>
                      {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Year *</label>
                  <div className="relative">
                    <BookOpen size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <select name="year" value={form.year} onChange={handleChange}
                      className={`w-full bg-[#1a1530] border rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none transition-colors appearance-none ${borderClass('year')}`}>
                      <option value="" className="text-gray-600">Select year</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Showcase Your Skill (Optional, select multiple)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SKILLS.map(skill => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                          skillSelected(skill)
                            ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                            : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Sparkles size={14} />
                          {skill}
                        </span>
                      </button>
                    ))}
                  </div>
                  {form.skills.length > 0 && <p className="text-emerald-400 text-xs mt-1">Selected: {form.skills.join(', ')}</p>}
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-box-olive"
                >
                  Continue to Payment <ArrowRight size={18} />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <QrCode size={18} className="text-olive-400" />
                    <h3 className="font-semibold text-white">Pay Registration Fee</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    {form.year ? `Registration fee for ${form.year}: INR ${registrationFee}` : 'Select year in Step 1 to view fee'}
                  </p>

                  <div className="bg-white rounded-xl p-3 w-fit mx-auto mb-4 glow-box-blue">
                    <img src={qrSrc} alt="UPI Payment QR" className="w-52 h-52 object-contain" />
                  </div>

                  <a
                    href={upiLink}
                    onClick={e => {
                      if (!registrationFee) {
                        e.preventDefault();
                        setError('Please select 1st Year or 2nd Year in Step 1 before payment.');
                      }
                    }}
                    className="block w-full text-center py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold hover:bg-emerald-500/30 transition-colors"
                  >
                    Click to Pay
                  </a>

                  <p className="text-xs text-gray-500 mt-3 break-all">UPI ID: {UPI_ID}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Registration Payment ID *</label>
                  <div className="relative">
                    <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input name="payment_id" value={form.payment_id} onChange={handleChange} placeholder="Transaction / UPI reference ID"
                      className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors ${borderClass('payment_id')}`} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">WhatsApp Number *</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input name="whatsapp_number" value={form.whatsapp_number} onChange={handleChange} placeholder="10-digit WhatsApp number" maxLength={10}
                      className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors ${borderClass('whatsapp_number')}`} />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="sm:w-1/2 py-3 rounded-xl border border-white/20 text-gray-200 font-semibold hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="sm:w-1/2 py-3 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50 glow-box-olive"
                  >
                    {loading ? 'Registering...' : 'Complete Registration'}
                  </button>
                </div>
              </>
            )}
          </form>

          <p className="text-center text-gray-500 text-xs mt-6">
            Already registered? <a href="/my-profile" className="text-blue-400 hover:underline">View your profile</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}























