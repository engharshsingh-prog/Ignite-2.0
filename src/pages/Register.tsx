import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  Hash,
  Mail,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { getErrorMessage, readJsonSafe } from '../lib/http';

type FieldState = 'idle' | 'valid' | 'invalid';

interface Step1FormData {
  email: string;
  full_name: string;
  roll_number: string;
  branch: string;
  year: string;
  skills: string[];
  whatsapp_number: string;
}

interface SubmittedParticipant {
  id?: number;
  registration_id?: string;
  full_name: string;
  email: string;
  roll_number: string;
  branch: string;
  year: string;
  whatsapp_number: string;
  skills?: string[];
  approval_status?: 'pending_approval' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  payment_id?: string | null;
  payment_verified?: boolean;
}

const BRANCHES = [
  'Computer Science and Engineering (CSE Core)',
  'Computer Science and Engineering (CSE AI/ML)',
  'Artificial Intelligence and Data Science (AI&DS)',
  'Information Technology (IT)',
  'Electronics and Communication Engineering (ECE)',
  'Mechanical Engineering (ME)'
];
const YEARS = ['1st Year', '2nd Year'];
const SKILLS = ['Singing', 'Games/Fun Activities', 'Dance', 'Comedy/Standup', 'Others'];

const YEAR_FEES: Record<string, number> = {
  '1st Year': 1,
  '2nd Year': 1,
};
const UPI_ID = 'harikesh40-1@oksbi';
const UPI_PAYEE_NAME = 'harikesh bahadur singh';
const UPI_NOTE = 'Ignite 2.O Registration';

function validateField(name: string, value: string): FieldState {
  if (!value) return 'idle';
  switch (name) {
    case 'full_name':
      return value.trim().length >= 2 ? 'valid' : 'invalid';
    case 'roll_number': {
      const clean = value.trim();
      return clean.length >= 1 && clean.length <= 15 && /^[a-zA-Z0-9\/-]+$/.test(clean) ? 'valid' : 'invalid';
    }
    case 'email':
      return /^[^\s@]+@gmail\.com$/i.test(value.trim()) ? 'valid' : 'invalid';
    case 'whatsapp_number':
      return /^\d{10}$/.test(value.trim()) ? 'valid' : 'invalid';
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
  const [viewState, setViewState] = useState<'form' | 'pending' | 'step2' | 'completed' | 'rejected'>('form');

  // Step 1 Form
  const [form, setForm] = useState<Step1FormData>({
    email: '',
    full_name: '',
    roll_number: '',
    branch: '',
    year: '',
    skills: [],
    whatsapp_number: '',
  });

  // Step 2 Payment Form
  const [paymentId, setPaymentId] = useState('');
  const [paymentIdState, setPaymentIdState] = useState<FieldState>('idle');
  const [step2Token, setStep2Token] = useState<string | null>(null);

  // Active Participant context (for pending/approved/completed display)
  const [activeParticipant, setActiveParticipant] = useState<SubmittedParticipant | null>(null);

  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Email OTP
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');

  // Status Lookup Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [lookupRoll, setLookupRoll] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const registrationFee = YEAR_FEES[activeParticipant?.year || form.year] ?? 1;

  const upiLink = useMemo(() => {
    const params = new URLSearchParams({
      pa: UPI_ID,
      pn: UPI_PAYEE_NAME,
      am: Number(registrationFee || 1).toFixed(2),
      cu: 'INR',
      tn: UPI_NOTE,
      aid: 'uGICAgIC1tYyuJw',
    });
    return `upi://pay?${params.toString()}`;
  }, [registrationFee]);

  const qrSrc = useMemo(() => {
    return '/payment-qr.jpg';
  }, []);

  // Check URL query on mount for continuation token (?token=... or ?step=2&token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      verifyTokenAndLoadStep2(token);
    }
  }, []);

  const verifyTokenAndLoadStep2 = async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/registration-step2/verify?token=${encodeURIComponent(token)}`);
      const data = await readJsonSafe<{
        allowed?: boolean;
        already_paid?: boolean;
        status?: string;
        rejection_reason?: string;
        participant?: SubmittedParticipant;
        error?: string;
      }>(res);

      if (!res.ok) {
        if (data?.status === 'pending_approval') {
          setActiveParticipant(data.participant || null);
          setViewState('pending');
          setStep(1);
          return;
        }
        if (data?.status === 'rejected') {
          setActiveParticipant(data.participant || null);
          setViewState('rejected');
          setStep(1);
          setError(data.rejection_reason || 'Registration was rejected by admin.');
          return;
        }
        throw new Error(getErrorMessage(data, 'Invalid or expired registration link.'));
      }

      if (data?.already_paid) {
        setActiveParticipant(data.participant || null);
        setViewState('completed');
        return;
      }

      if (data?.allowed && data.participant) {
        setActiveParticipant(data.participant);
        setStep2Token(token);
        setStep(2);
        setViewState('step2');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify registration access.');
    } finally {
      setLoading(false);
    }
  };

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
      setOtpMessage('OTP sent. Check Inbox, Spam, and Promotions folders.');
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
      setError('Enter a valid 6-digit OTP.');
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
    const fields: Array<keyof Step1FormData> = ['email', 'full_name', 'roll_number', 'branch', 'year', 'whatsapp_number'];
    let valid = true;

    for (const field of fields) {
      const state = validateField(field, String(form[field]));
      states[field] = state;
      if (state !== 'valid') valid = false;
    }

    setFieldStates(prev => ({ ...prev, ...states }));

    if (valid && !otpVerified) {
      valid = false;
      setError('Email OTP verification is mandatory before submitting Step 1.');
    } else if (!valid) {
      setError('Please fill all required details correctly before continuing.');
    }
    return valid;
  };

  // Submit Step 1 -> Sends approval request to admin, does NOT open Step 2 immediately!
  const handleSubmitStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateStepOne()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, otp_token: otpToken }),
      });
      const data = await readJsonSafe<{ success?: boolean; participant?: SubmittedParticipant; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Registration submission failed'));

      if (data?.participant) {
        setActiveParticipant(data.participant);
        setViewState('pending');
        setStep(1);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration submission failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Step 2 Payment
  const handleSubmitStep2Payment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const pState = validateField('payment_id', paymentId);
    setPaymentIdState(pState);
    if (pState !== 'valid') {
      setError('Please enter a valid Payment / Transaction Reference ID (min 6 characters).');
      return;
    }

    if (!step2Token) {
      setError('Continuation authorization token is missing. Please use the secure link sent to your email.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/registration-step2/submit-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: step2Token, payment_id: paymentId.trim() }),
      });
      const data = await readJsonSafe<{ success?: boolean; participant?: SubmittedParticipant; error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Payment submission failed'));

      if (data?.participant) {
        setActiveParticipant(data.participant);
        setViewState('completed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payment submission failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Check live status for active participant
  const handleRefreshLiveStatus = async () => {
    if (!activeParticipant) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (activeParticipant.registration_id) params.set('registration_id', activeParticipant.registration_id);
      else {
        params.set('roll_number', activeParticipant.roll_number);
        params.set('email', activeParticipant.email);
      }

      const res = await fetch(`/api/registration-status?${params.toString()}`);
      const data = await readJsonSafe<{
        found?: boolean;
        approval_status?: 'pending_approval' | 'approved' | 'rejected';
        token?: string | null;
        has_paid?: boolean;
        payment_verified?: boolean;
        rejection_reason?: string | null;
        error?: string;
      }>(res);

      if (!res.ok) throw new Error(getErrorMessage(data, 'Could not fetch latest status'));

      if (data?.approval_status === 'approved') {
        if (data.has_paid) {
          setViewState('completed');
        } else if (data.token) {
          setStep2Token(data.token);
          setStep(2);
          setViewState('step2');
        }
      } else if (data?.approval_status === 'rejected') {
        setViewState('rejected');
        setError(data.rejection_reason || 'Registration was rejected by admin.');
      } else {
        // Still pending
        setViewState('pending');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh status');
    } finally {
      setLoading(false);
    }
  };

  // Status Lookup Modal Submission
  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError('');
    if (!lookupRoll.trim() || !lookupEmail.trim()) {
      setLookupError('Roll number and Gmail address are required.');
      return;
    }

    setLookupLoading(true);
    try {
      const params = new URLSearchParams({
        roll_number: lookupRoll.trim(),
        email: lookupEmail.trim(),
      });
      const res = await fetch(`/api/registration-status?${params.toString()}`);
      const data = await readJsonSafe<{
        found?: boolean;
        id?: number;
        registration_id?: string;
        full_name?: string;
        email?: string;
        roll_number?: string;
        branch?: string;
        year?: string;
        whatsapp_number?: string;
        approval_status?: 'pending_approval' | 'approved' | 'rejected';
        rejection_reason?: string | null;
        token?: string | null;
        has_paid?: boolean;
        error?: string;
      }>(res);

      if (!res.ok || !data) throw new Error(getErrorMessage(data, 'Registration not found with provided details.'));

      setShowStatusModal(false);

      const p: SubmittedParticipant = {
        id: data.id,
        registration_id: data.registration_id,
        full_name: data.full_name || '',
        email: data.email || '',
        roll_number: data.roll_number || '',
        branch: data.branch || '',
        year: data.year || '',
        whatsapp_number: data.whatsapp_number || '',
        approval_status: data.approval_status,
        rejection_reason: data.rejection_reason,
      };

      setActiveParticipant(p);

      if (data.approval_status === 'approved') {
        if (data.has_paid) {
          setViewState('completed');
        } else if (data.token) {
          setStep2Token(data.token);
          setStep(2);
          setViewState('step2');
        }
      } else if (data.approval_status === 'rejected') {
        setViewState('rejected');
        setError(data.rejection_reason || 'Registration was rejected by admin.');
      } else {
        setViewState('pending');
      }
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Status lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };

  const copyRegistrationId = () => {
    if (activeParticipant?.registration_id) {
      navigator.clipboard.writeText(activeParticipant.registration_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const borderClass = (field: string) => {
    const s = fieldStates[field];
    if (s === 'valid') return 'border-emerald-500 focus:border-emerald-400';
    if (s === 'invalid') return 'border-red-500 focus:border-red-400';
    return 'border-white/10 focus:border-[#3b82f6]';
  };

  const skillSelected = (skill: string) => form.skills.includes(skill);

  // VIEW 1: Final Completed Screen
  if (viewState === 'completed' && activeParticipant) {
    return (
      <div className="min-h-screen bg-[#111411] grid-bg flex items-center justify-center px-4 pt-20 pb-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-emerald-400" />
          </div>
          <h2 className="text-3xl font-display font-black text-white mb-2">Registration Complete!</h2>
          <p className="text-gray-300 mb-6">Your payment details have been submitted and recorded successfully.</p>

          <div className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-6 text-left space-y-3 mb-6 gradient-border">
            <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
              <span className="text-gray-400 text-sm">Registration ID</span>
              <span className="text-emerald-400 font-mono font-bold text-sm">{activeParticipant.registration_id}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400 text-sm">Name</span>
              <span className="text-white font-medium text-right">{activeParticipant.full_name}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400 text-sm">Roll / Enrolment No</span>
              <span className="text-white font-medium font-mono text-right">{activeParticipant.roll_number}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-400 text-sm">Branch & Year</span>
              <span className="text-white font-medium text-right text-xs sm:text-sm">{activeParticipant.branch} ({activeParticipant.year})</span>
            </div>
            {activeParticipant.payment_id && (
              <div className="flex justify-between gap-3 border-t border-white/5 pt-2">
                <span className="text-gray-400 text-sm">Payment ID</span>
                <span className="text-blue-300 font-mono text-xs text-right">{activeParticipant.payment_id}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 items-center">
              <span className="text-gray-400 text-sm">Payment Status</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${activeParticipant.payment_verified ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                {activeParticipant.payment_verified ? 'Verified' : 'Verification Pending'}
              </span>
            </div>
          </div>

          <a
            href="/my-profile"
            className="block w-full py-3.5 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold hover:opacity-90 transition-opacity text-center"
          >
            Go to My Profile & Entry Pass
          </a>
        </motion.div>
      </div>
    );
  }

  // VIEW 2: Pending Approval Confirmation Screen (Step 2 Strictly Locked)
  if (viewState === 'pending' && activeParticipant) {
    return (
      <div className="min-h-screen bg-[#111411] grid-bg flex items-center justify-center px-4 pt-20 pb-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg w-full text-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-5">
            <Clock size={38} className="text-amber-400" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Pending Admin Verification
          </div>

          <h2 className="text-3xl font-display font-black text-white mb-2">Registration Submitted!</h2>
          <p className="text-gray-300 text-sm sm:text-base mb-6 leading-relaxed">
            Your registration has been submitted successfully. Please wait while our admin team verifies your details.
            You will receive an email once your registration is approved.
          </p>

          <div className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-6 text-left space-y-3 mb-6 gradient-border">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <p className="text-xs text-gray-400">Registration ID</p>
                <p className="text-lg font-mono font-bold text-blue-400">{activeParticipant.registration_id || 'Generating...'}</p>
              </div>
              <button
                type="button"
                onClick={copyRegistrationId}
                className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-gray-300 inline-flex items-center gap-1.5 transition-colors"
              >
                <Copy size={13} /> {copiedId ? 'Copied' : 'Copy ID'}
              </button>
            </div>

            <div className="flex justify-between gap-3 text-sm">
              <span className="text-gray-400">Participant Name:</span>
              <span className="text-white font-medium text-right">{activeParticipant.full_name}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-gray-400">Roll / Enrolment No:</span>
              <span className="text-white font-mono text-right">{activeParticipant.roll_number}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-gray-400">Branch & Year:</span>
              <span className="text-white text-right text-xs sm:text-sm">{activeParticipant.branch} ({activeParticipant.year})</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-gray-400">WhatsApp Number:</span>
              <span className="text-white font-mono text-right">+91 {activeParticipant.whatsapp_number}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm border-t border-white/5 pt-2">
              <span className="text-gray-400">Email:</span>
              <span className="text-gray-300 text-xs sm:text-sm text-right break-all">{activeParticipant.email}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-left mb-6">
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-gray-300 space-y-1">
                <p className="font-semibold text-blue-300">Important Note on Step 2 (Payment):</p>
                <p>
                  Step 2 and the payment page are strictly locked until an authorized administrator verifies your group membership and details.
                </p>
                <p>
                  As soon as an admin approves your request, you will receive an approval email with a secure continuation link to complete payment.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleRefreshLiveStatus}
              disabled={loading}
              className="flex-1 py-3 rounded-xl border border-white/20 bg-white/5 text-gray-200 font-semibold hover:bg-white/10 transition-colors inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Check Live Approval Status
            </button>
            <button
              type="button"
              onClick={() => {
                setViewState('form');
                setStep(1);
              }}
              className="py-3 px-4 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
            >
              New Form
            </button>
          </div>

          {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        </motion.div>
      </div>
    );
  }

  // VIEW 3: Rejection Notice Screen
  if (viewState === 'rejected' && activeParticipant) {
    return (
      <div className="min-h-screen bg-[#111411] grid-bg flex items-center justify-center px-4 pt-20 pb-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto mb-5">
            <XCircle size={38} className="text-red-400" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold mb-3">
            Registration Not Approved
          </div>

          <h2 className="text-3xl font-display font-black text-white mb-2">Request Rejected</h2>
          <p className="text-gray-300 text-sm mb-6">
            Your Step 1 registration request for Ignite 2.O could not be approved at this time.
          </p>

          <div className="bg-[#191e1b]/90 border border-red-500/30 rounded-2xl p-5 text-left mb-6">
            <p className="text-xs text-gray-400 mb-1">Rejection Reason:</p>
            <p className="text-sm text-red-300 font-medium">
              {activeParticipant.rejection_reason || error || 'Details could not be verified by admin.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setViewState('form');
              setStep(1);
              setError('');
            }}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold hover:opacity-90 transition-opacity"
          >
            Register Again with Correct Details
          </button>
        </motion.div>
      </div>
    );
  }

  // VIEW 4 & 5: Main Interactive Registration Flow (Step 1 Form & Approved Step 2 Payment)
  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16 px-4">
      <div className="max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#3b82f6] text-sm font-medium mb-4">
              Ignite 2.O
            </span>
            <h1 className="text-4xl font-display font-black mb-2 neon-olive">
              {step === 1 ? 'Step 1: Registration' : 'Step 2: Payment'}
            </h1>
            <p className="text-gray-400 text-sm">
              {step === 1
                ? 'Fill details and submit for admin approval'
                : 'Registration approved! Complete payment to finalize'}
            </p>
          </div>

          {/* Stepper Indicator */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1">
              <div className="h-2 rounded-full bg-[#3b82f6]" />
              <p className="text-[11px] text-gray-400 mt-1 text-center font-semibold">Step 1: Details & Verification</p>
            </div>
            <div className="flex-1">
              <div className={`h-2 rounded-full transition-colors ${step >= 2 ? 'bg-[#a3b46a]' : 'bg-white/10'}`} />
              <p className={`text-[11px] mt-1 text-center font-semibold ${step >= 2 ? 'text-[#a3b46a]' : 'text-gray-500'}`}>
                Step 2: Approved Payment
              </p>
            </div>
          </div>

          {/* Step 2 Approved Banner */}
          {step === 2 && activeParticipant && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 mb-6 flex items-start gap-3">
              <ShieldCheck size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-emerald-300">Registration Approved by Admin</p>
                <p className="text-xs text-gray-300 mt-0.5">
                  Welcome, <span className="text-white font-medium">{activeParticipant.full_name}</span> ({activeParticipant.registration_id}). Complete payment to confirm your seat.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 mb-6">
              <AlertCircle size={18} className="flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* STEP 1 FORM */}
          {step === 1 && (
            <form onSubmit={handleSubmitStep1} className="space-y-5">
              {/* Email Address with OTP */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email Address *</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="yourname@gmail.com"
                    className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors ${borderClass('email')}`}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Only gmail.com addresses are accepted. Verification OTP will be sent here.
                </p>

                {/* Send / Verify OTP Controls */}
                <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={otpLoading || validateField('email', form.email) !== 'valid'}
                    className="sm:w-40 px-4 py-2.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-sm hover:bg-blue-600/30 transition-colors disabled:opacity-50"
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
                      className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                    >
                      {otpLoading ? '...' : otpVerified ? 'Verified' : 'Verify'}
                    </button>
                  </div>
                </div>
                {otpMessage && (
                  <p className={`text-xs mt-1.5 ${otpVerified ? 'text-emerald-400' : 'text-amber-300'}`}>
                    {otpMessage}
                  </p>
                )}
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    name="full_name"
                    value={form.full_name}
                    onChange={handleChange}
                    placeholder="Your complete full name"
                    className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors ${borderClass('full_name')}`}
                  />
                </div>
              </div>

              {/* Roll / Enrolment Number */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Roll Number / Enrolment Number *</label>
                <div className="relative">
                  <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    name="roll_number"
                    value={form.roll_number}
                    onChange={handleChange}
                    placeholder="e.g. 2614670010009 (up to 15 chars)"
                    maxLength={15}
                    className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors font-mono ${borderClass('roll_number')}`}
                  />
                </div>
              </div>

              {/* WhatsApp Number (Present in Our Group) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  WhatsApp Number / Phone Number (Present in Our Group) *
                </label>
                <div className="relative flex">
                  <div className="inline-flex items-center gap-1 px-3.5 rounded-l-xl bg-white/5 border border-r-0 border-white/10 text-gray-400 text-sm select-none">
                    <Phone size={14} className="text-emerald-400" />
                    <span>+91</span>
                  </div>
                  <input
                    name="whatsapp_number"
                    value={form.whatsapp_number}
                    onChange={handleChange}
                    placeholder="10-digit WhatsApp phone number"
                    maxLength={10}
                    inputMode="numeric"
                    className={`flex-1 bg-white/5 border rounded-r-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors font-mono ${borderClass('whatsapp_number')}`}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Ensure this phone number is present in the official Ignite WhatsApp group for verification.
                </p>
              </div>

              {/* Branch */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Branch *</label>
                <div className="relative">
                  <BookOpen size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <select
                    name="branch"
                    value={form.branch}
                    onChange={handleChange}
                    className={`w-full bg-[#1a1530] border rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none transition-colors appearance-none ${borderClass('branch')}`}
                  >
                    <option value="" className="text-gray-600">Select branch</option>
                    {BRANCHES.map(b => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Year */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Year *</label>
                <div className="relative">
                  <BookOpen size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <select
                    name="year"
                    value={form.year}
                    onChange={handleChange}
                    className={`w-full bg-[#1a1530] border rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none transition-colors appearance-none ${borderClass('year')}`}
                  >
                    <option value="" className="text-gray-600">Select year</option>
                    {YEARS.map(y => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Showcase Your Skill (Optional, select multiple)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SKILLS.map(skill => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
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
                {form.skills.length > 0 && (
                  <p className="text-emerald-400 text-xs mt-1.5">Selected: {form.skills.join(', ')}</p>
                )}
              </div>

              {/* Submit Step 1 Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-box-olive disabled:opacity-50"
              >
                {loading ? 'Submitting Step 1...' : 'Submit for Admin Approval'} <ArrowRight size={18} />
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(true)}
                  className="text-xs text-blue-300 hover:text-blue-200 underline inline-flex items-center gap-1.5"
                >
                  <Search size={13} /> Already submitted Step 1? Check Approval Status / Continue to Payment
                </button>
              </div>
            </form>
          )}

          {/* STEP 2 PAYMENT FORM (Only unlocked after admin approval) */}
          {step === 2 && activeParticipant && (
            <form onSubmit={handleSubmitStep2Payment} className="space-y-5">
              <div className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <QrCode size={18} className="text-olive-400" />
                  <h3 className="font-semibold text-white">Pay Registration Fee</h3>
                </div>
                <p className="text-sm text-gray-300 mb-4">
                  Registration fee: <span className="text-emerald-400 font-bold text-base">INR {registrationFee}</span>
                  {activeParticipant.year && <span className="text-gray-400 text-xs ml-1.5">({activeParticipant.year})</span>}
                </p>

                <div className="bg-white rounded-2xl p-3 w-fit mx-auto mb-4 shadow-xl">
                  <img src={qrSrc} alt="UPI Payment QR" className="w-60 h-auto max-w-full rounded-xl object-contain mx-auto" />
                </div>

                <a
                  href={upiLink}
                  className="block w-full text-center py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold hover:bg-emerald-500/30 transition-colors shadow-sm"
                >
                  Click to Pay (INR {registrationFee})
                </a>

                <p className="text-xs text-gray-400 mt-3 break-all text-center">
                  UPI ID: <span className="font-mono text-white font-medium">{UPI_ID}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Registration Payment ID *</label>
                <div className="relative">
                  <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    name="payment_id"
                    value={paymentId}
                    onChange={e => {
                      setPaymentId(e.target.value);
                      setPaymentIdState(validateField('payment_id', e.target.value));
                      setError('');
                    }}
                    placeholder="Enter UPI Transaction / UTR / Reference ID"
                    className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors font-mono ${
                      paymentIdState === 'valid'
                        ? 'border-emerald-500 focus:border-emerald-400'
                        : paymentIdState === 'invalid'
                        ? 'border-red-500 focus:border-red-400'
                        : 'border-white/10 focus:border-[#3b82f6]'
                    }`}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Copy and paste the 12-digit UPI reference ID or transaction reference from your payment app.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 glow-box-olive"
              >
                {loading ? 'Submitting Payment...' : 'Complete Registration & Submit Payment'}
              </button>
            </form>
          )}

          <p className="text-center text-gray-500 text-xs mt-6">
            Already registered and paid? <a href="/my-profile" className="text-blue-400 hover:underline">View your profile</a>
          </p>
        </motion.div>
      </div>

      {/* STATUS LOOKUP MODAL */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-[#171127] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Search size={16} className="text-blue-400" /> Check Registration Approval Status
              </h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleLookupSubmit} className="p-6 space-y-4">
              <p className="text-xs text-gray-400">
                Enter your Roll Number and registered Gmail address to check if your registration has been approved:
              </p>

              <div>
                <label className="block text-xs text-gray-300 mb-1">Roll / Enrolment Number</label>
                <input
                  value={lookupRoll}
                  onChange={e => setLookupRoll(e.target.value)}
                  placeholder="e.g. 2614670010009"
                  maxLength={15}
                  className="w-full bg-[#191e1b] border border-[#303a32] rounded-xl px-3.5 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1">Registered Gmail Address</label>
                <input
                  type="email"
                  value={lookupEmail}
                  onChange={e => setLookupEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full bg-[#191e1b] border border-[#303a32] rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {lookupError && <p className="text-xs text-red-400">{lookupError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="px-4 py-2 rounded-xl border border-white/15 text-gray-300 hover:bg-white/5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm disabled:opacity-50"
                >
                  {lookupLoading ? 'Checking...' : 'Check Status'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
