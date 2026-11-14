import { useEffect, useState } from 'react';
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
  MessageCircle,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
  Lock,
} from 'lucide-react';
import { getErrorMessage, readJsonSafe } from '../lib/http';
import { useEventSettings } from '../lib/useEventSettings';

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
  payment_amount?: number | null;
  whatsapp_number: string;
  skills?: string[];
  approval_status?: 'pending_approval' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  payment_id?: string | null;
  payment_verified?: boolean;
  payment_status?: 'pending_verification' | 'approved' | 'rejected';
  payment_rejected_reason?: string | null;
  account_holder_name?: string | null;
  payment_screenshot_url?: string | null;
}

const BRANCHES = [
  'Computer Science and Engineering (CSE Core)',
  'Computer Science and Engineering (CSE AI/ML)',
  'Artificial Intelligence and Data Science (AI&DS)',
  'Information Technology (IT)',
  'Electronics and Communication Engineering (ECE)',
  'Mechanical Engineering (ME)'
];
const SKILLS = ['Singing', 'Games/Fun Activities', 'Dance', 'Comedy/Standup', 'Others'];

const UPI_ID = 'ysamarjeetyadav2334@okaxis';
const UPI_PAYEE_NAME = 'Samarjeet Yadav';

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
    case 'account_holder_name':
      return value.trim().length >= 2 ? 'valid' : 'invalid';
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
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountHolderNameState, setAccountHolderNameState] = useState<FieldState>('idle');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState('');
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
  const [otpSentEmail, setOtpSentEmail] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const interval = setInterval(() => {
      setOtpCooldown(c => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpCooldown]);

  // Status Lookup Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [lookupRoll, setLookupRoll] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const { settings } = useEventSettings();

  const [paymentYear, setPaymentYear] = useState<'1st Year' | '2nd Year'>('1st Year');
  const [qrImageError, setQrImageError] = useState(false);

  useEffect(() => {
    const yr = activeParticipant?.year || form.year;
    if (yr === '2nd Year') {
      setPaymentYear('2nd Year');
    } else if (yr === '1st Year') {
      setPaymentYear('1st Year');
    }
  }, [activeParticipant?.year, form.year]);

  useEffect(() => {
    setQrImageError(false);
  }, [paymentYear, settings.qr1stYearUrl, settings.qr2ndYearUrl]);

  const activeFee = paymentYear === '2nd Year' ? (settings.fee2ndYear ?? 699) : (settings.fee1stYear ?? 599);
  const activeUpiId = paymentYear === '2nd Year' ? (settings.upiId2ndYear || UPI_ID) : (settings.upiId1stYear || UPI_ID);
  const activeUpiName = paymentYear === '2nd Year' ? (settings.upiName2ndYear || UPI_PAYEE_NAME) : (settings.upiName1stYear || UPI_PAYEE_NAME);
  const activeQrUrl = paymentYear === '2nd Year' ? (settings.qr2ndYearUrl || '/payment-qr-2nd-year.png') : (settings.qr1stYearUrl || '/payment-qr-1st-year.png');

  // Check URL query on mount for continuation token (?token=... or ?step=2&token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      verifyTokenAndLoadStep2(token);
    }

    // Check if there is an active OTP verification session in sessionStorage
    try {
      const raw = sessionStorage.getItem('ignite_otp_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.email && parsed?.token) {
          fetch('/api/email-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check', email: parsed.email, otp_token: parsed.token }),
          })
            .then(res => res.json())
            .then(data => {
              if (data?.valid) {
                setForm(f => ({ ...f, email: parsed.email }));
                setFieldStates(s => ({ ...s, email: 'valid' }));
                setOtpToken(parsed.token);
                setOtpVerified(true);
                setOtpSent(true);
                setOtpSentEmail(parsed.email);
                setOtpMessage('Email verified successfully.');
              } else {
                sessionStorage.removeItem('ignite_otp_session');
              }
            })
            .catch(() => {
              sessionStorage.removeItem('ignite_otp_session');
            });
        }
      }
    } catch (_) {}
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
      setOtpSentEmail('');
      setOtpVerified(false);
      setOtpMessage('');
      setOtpCooldown(0);
      try {
        sessionStorage.removeItem('ignite_otp_session');
      } catch (_) {}
    }
    setError('');
  };

  const handleSendOtp = async () => {
    const cleanEmail = form.email.trim().toLowerCase();
    if (validateField('email', cleanEmail) !== 'valid') {
      setError('Enter a valid gmail.com address before requesting OTP.');
      return;
    }

    if (otpCooldown > 0) {
      setError(`Please wait ${otpCooldown}s before requesting another OTP.`);
      return;
    }

    setOtpLoading(true);
    setError('');
    setOtpMessage('');

    try {
      const res = await fetch('/api/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email: cleanEmail }),
      });
      const data = await readJsonSafe<{ error?: string; cooldown_seconds?: number; message?: string }>(res);
      if (!res.ok) {
        if (data?.cooldown_seconds) {
          setOtpCooldown(data.cooldown_seconds);
        }
        throw new Error(getErrorMessage(data, 'Failed to send OTP'));
      }

      setOtpSent(true);
      setOtpSentEmail(cleanEmail);
      setOtpVerified(false);
      setOtpToken('');
      try {
        sessionStorage.removeItem('ignite_otp_session');
      } catch (_) {}
      setOtpCooldown(data?.cooldown_seconds || 45);
      setOtpMessage(data?.message || 'OTP sent. Please check your Gmail inbox (and Spam or Updates folder).');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanEmail = form.email.trim().toLowerCase();
    if (!otpSent || !otpSentEmail) {
      setError('Please click "Send OTP" to receive a verification code first.');
      return;
    }
    if (otpSentEmail !== cleanEmail) {
      setError(`Email was changed to "${cleanEmail}". Please click "Send OTP" for this email address.`);
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
        body: JSON.stringify({ action: 'verify', email: cleanEmail, otp: otp.trim() }),
      });
      const data = await readJsonSafe<{ error?: string; otp_token?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'OTP verification failed'));
      if (!data?.otp_token) throw new Error('OTP verification token missing from server response');

      setOtpVerified(true);
      setOtpToken(data.otp_token);
      setOtpMessage('Email verified successfully.');
      setError('');
      try {
        sessionStorage.setItem(
          'ignite_otp_session',
          JSON.stringify({ email: cleanEmail, token: data.otp_token })
        );
      } catch (_) {}
    } catch (err: unknown) {
      setOtpVerified(false);
      setOtpToken('');
      setOtpMessage('');
      try {
        sessionStorage.removeItem('ignite_otp_session');
      } catch (_) {}
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
    } else if (valid && form.year === '2nd Year' && settings.registration2ndYearEnabled === false) {
      valid = false;
      setError('2nd Year registrations are currently closed by Super Admin.');
    } else if (valid && form.year === '1st Year' && settings.registration1stYearEnabled === false) {
      valid = false;
      setError('1st Year registrations are currently closed by Super Admin.');
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
      const data = await readJsonSafe<{ success?: boolean; participant?: SubmittedParticipant; error?: string; redirectToStep2?: boolean; step2_token?: string; step2_token_expires_at?: string; locked?: boolean }>(res);
      if (!res.ok) {
        throw new Error(getErrorMessage(data, 'Registration submission failed'));
      }

      try {
        sessionStorage.removeItem('ignite_otp_session');
      } catch (_) {}

      // Handle case where email is already registered but approved and payment not submitted
      if (data?.redirectToStep2 && data?.participant) {
        setActiveParticipant(data.participant);
        // Use the step2_token returned directly from the backend
        if (data.step2_token) {
          setStep2Token(data.step2_token);
          setStep(2);
          setViewState('step2');
        } else {
          // Fallback: fetch token via status lookup
          const regId = data.participant.registration_id;
          if (!regId) {
            setViewState('pending');
            setStep(1);
            return;
          }
          const statusRes = await fetch(`/api/registration-status?registration_id=${encodeURIComponent(regId)}`);
          const statusData = await readJsonSafe<{ token?: string | null }>(statusRes);
          if (statusData?.token) {
            setStep2Token(statusData.token);
            setStep(2);
            setViewState('step2');
          } else {
            setViewState('pending');
            setStep(1);
          }
        }
        return;
      }

      if (data?.participant) {
        setActiveParticipant(data.participant);
        setViewState('pending');
        setStep(1);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration submission failed';
      setError(message);
      // Synchronize frontend OTP state if backend reports an OTP verification error
      if (message.toLowerCase().includes('otp') || message.toLowerCase().includes('verification')) {
        setOtpVerified(false);
        setOtpToken('');
        setOtpMessage('');
        try {
          sessionStorage.removeItem('ignite_otp_session');
        } catch (_) {}
      }
    } finally {
      setLoading(false);
    }
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['png', 'jpg', 'jpeg', 'webp'];
    if (!validTypes.includes(file.type) && (!ext || !validExts.includes(ext))) {
      setScreenshotError('Please upload an image in PNG, JPG, JPEG, or WEBP format.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setScreenshotError('Image file size exceeds 10MB limit. Please upload a smaller image.');
      return;
    }

    setScreenshotError('');
    setScreenshotFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setScreenshotDataUrl(result);
      setScreenshotPreview(result);
    };
    reader.onerror = () => {
      setScreenshotError('Failed to read the selected screenshot. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setScreenshotDataUrl(null);
    setScreenshotError('');
  };

  // Submit Step 2 Payment
  const handleSubmitStep2Payment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setScreenshotError('');

    const aState = validateField('account_holder_name', accountHolderName);
    setAccountHolderNameState(aState);
    if (aState !== 'valid') {
      setError('Account Holder Name is required (minimum 2 characters).');
      return;
    }

    if (!screenshotDataUrl) {
      setScreenshotError('Payment screenshot is required. Please upload your payment screenshot.');
      setError('Please upload your payment screenshot before submitting.');
      return;
    }

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
        body: JSON.stringify({
          token: step2Token,
          payment_id: paymentId.trim(),
          account_holder_name: accountHolderName.trim(),
          screenshot_data_url: screenshotDataUrl,
          year: paymentYear,
        }),
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
        payment_id?: string | null;
        payment_verified?: boolean;
        payment_status?: 'pending_verification' | 'approved' | 'rejected';
        payment_rejected_reason?: string | null;
        account_holder_name?: string | null;
        payment_screenshot_url?: string | null;
        rejection_reason?: string | null;
        error?: string;
      }>(res);

      if (!res.ok) throw new Error(getErrorMessage(data, 'Could not fetch latest status'));

      if (data?.approval_status === 'approved') {
        if (data.has_paid) {
          setActiveParticipant(prev => prev ? {
            ...prev,
            payment_id: data.payment_id ?? prev.payment_id,
            payment_verified: data.payment_verified ?? prev.payment_verified,
            payment_status: data.payment_status ?? prev.payment_status,
            payment_rejected_reason: data.payment_rejected_reason ?? prev.payment_rejected_reason,
            account_holder_name: data.account_holder_name ?? prev.account_holder_name,
            payment_screenshot_url: data.payment_screenshot_url ?? prev.payment_screenshot_url,
          } : null);
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
        payment_id?: string | null;
        payment_verified?: boolean;
        payment_status?: 'pending_verification' | 'approved' | 'rejected';
        payment_rejected_reason?: string | null;
        account_holder_name?: string | null;
        payment_screenshot_url?: string | null;
        payment_amount?: number | null;
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
        payment_amount: data.payment_amount,
        whatsapp_number: data.whatsapp_number || '',
        approval_status: data.approval_status,
        rejection_reason: data.rejection_reason,
        payment_id: data.payment_id,
        payment_verified: data.payment_verified,
        payment_status: data.payment_status,
        payment_rejected_reason: data.payment_rejected_reason,
        account_holder_name: data.account_holder_name,
        payment_screenshot_url: data.payment_screenshot_url,
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
    if (s === 'valid') return '!border-emerald-500/80 focus:!border-emerald-600';
    if (s === 'invalid') return '!border-red-500/80 focus:!border-red-600';
    return '';
  };

  const skillSelected = (skill: string) => form.skills.includes(skill);

  // VIEW 1: Final Completed Screen
  if (viewState === 'completed' && activeParticipant) {
    const waHolderName = activeParticipant.account_holder_name || accountHolderName || 'N/A';
    const waText = `Hello Samarjeet Yadav, I have completed my payment for Ignite 2.O. Please find my payment details below.

Participant Name: ${activeParticipant.full_name}
Account Holder Name: ${waHolderName}
Registration ID: ${activeParticipant.registration_id || 'N/A'}

I am sharing my payment screenshot for verification. Please confirm my payment.`;

    const waLink = `https://wa.me/919984972334?text=${encodeURIComponent(waText)}`;
    const isApproved = activeParticipant.payment_status === 'approved' || Boolean(activeParticipant.payment_verified);
    const isRejected = activeParticipant.payment_status === 'rejected';

    return (
      <div className="min-h-screen text-slate-900 flex items-center justify-center px-4 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center">
          <div className="liquid-icon-bubble w-20 h-20 border-emerald-500/40 bg-emerald-500/12 mx-auto mb-6 shadow-[0_8px_28px_rgba(16,185,129,0.18)]">
            <CheckCircle size={40} className="text-emerald-600" />
          </div>
          <h2 className="text-3xl font-display font-black bg-gradient-to-r from-slate-900 via-sky-700 to-emerald-700 bg-clip-text text-transparent mb-2">
            Registration Complete!
          </h2>
          <p className="text-slate-600 mb-6">Your payment details have been submitted and recorded successfully.</p>

          <div className="liquid-glass-strong rounded-3xl p-6 text-left space-y-3 mb-5">
            <div className="flex justify-between gap-3 border-b border-slate-900/10 pb-2.5">
              <span className="text-slate-500 text-sm">Registration ID</span>
              <span className="text-emerald-700 font-mono font-bold text-sm">{activeParticipant.registration_id}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 text-sm">Name</span>
              <span className="text-slate-900 font-semibold text-right">{activeParticipant.full_name}</span>
            </div>
            {(activeParticipant.account_holder_name || accountHolderName) && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 text-sm">Account Holder Name</span>
                <span className="text-slate-900 font-medium text-right">{activeParticipant.account_holder_name || accountHolderName}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 text-sm">Roll / Enrolment No</span>
              <span className="text-slate-900 font-medium font-mono text-right">{activeParticipant.roll_number}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 text-sm">Branch & Year</span>
              <span className="text-slate-900 font-medium text-right text-xs sm:text-sm">{activeParticipant.branch} ({activeParticipant.year})</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 text-sm">Registration Amount</span>
              <span className="text-emerald-700 font-bold text-sm">
                INR {activeParticipant.payment_amount || (activeParticipant.year === '2nd Year' ? (settings.fee2ndYear ?? 699) : (settings.fee1stYear ?? 599))}
              </span>
            </div>
            {activeParticipant.payment_id && (
              <div className="flex justify-between gap-3 border-t border-slate-900/10 pt-2.5">
                <span className="text-slate-500 text-sm">Payment ID</span>
                <span className="text-sky-700 font-mono text-xs text-right font-semibold">{activeParticipant.payment_id}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 items-center">
              <span className="text-slate-500 text-sm">Payment Status</span>
              {isApproved ? (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/12 text-emerald-700 border border-emerald-500/35">
                  Approved
                </span>
              ) : isRejected ? (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-500/12 text-red-700 border border-red-500/35">
                  Rejected
                </span>
              ) : (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-500/12 text-amber-800 border border-amber-500/35">
                  Pending Verification
                </span>
              )}
            </div>

            {(activeParticipant.payment_screenshot_url || screenshotPreview) && (
              <div className="border-t border-slate-900/10 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 text-xs">Uploaded Payment Screenshot</span>
                  <a
                    href={activeParticipant.payment_screenshot_url || screenshotPreview || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-700 font-medium hover:underline"
                  >
                    View Full Image
                  </a>
                </div>
                <div className="rounded-xl border border-slate-900/10 overflow-hidden w-24 h-24 bg-slate-100">
                  <img
                    src={activeParticipant.payment_screenshot_url || screenshotPreview || ''}
                    alt="Payment Screenshot Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>

          {isRejected && activeParticipant.payment_rejected_reason && (
            <div className="liquid-glass rounded-xl border-red-400/40 bg-red-50/80 p-3.5 text-left text-xs text-red-700 mb-5">
              <span className="font-semibold text-red-800">Rejection Reason: </span>
              {activeParticipant.payment_rejected_reason}
            </div>
          )}

          {/* WhatsApp Payment Confirmation Button */}
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/40 text-white font-bold text-sm sm:text-base shadow-[0_8px_24px_rgba(16,185,129,0.28)] transition-all text-center mb-3"
          >
            <MessageCircle size={18} />
            Send Payment Screenshot on WhatsApp
          </a>

          {/* WhatsApp Instruction Notice Box */}
          <div className="liquid-glass rounded-2xl border-amber-500/35 bg-amber-50/75 p-3.5 text-left text-xs text-amber-900 mb-5 space-y-1.5">
            <p className="font-semibold text-amber-800 flex items-center gap-1.5">
              <AlertCircle size={14} className="flex-shrink-0 text-amber-600" />
              Manual Screenshot Attachment in WhatsApp:
            </p>
            <p>
              WhatsApp's click-to-chat opens with your details pre-filled, but <strong>cannot automatically attach images</strong>.
              Please manually attach and send your payment screenshot to <strong>Samarjeet Yadav (+91 99849 72334)</strong> in the WhatsApp chat.
            </p>
            <p className="text-amber-800/80 text-[11px]">
              Your screenshot is also uploaded on this portal and is waiting for administrator verification.
            </p>
          </div>

          <a
            href="/my-profile"
            className="liquid-btn-primary block w-full py-3.5 rounded-xl text-white font-bold text-center text-sm sm:text-base"
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
      <div className="min-h-screen text-slate-900 flex items-center justify-center px-4 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg w-full text-center">
          <div className="liquid-icon-bubble w-20 h-20 border-amber-500/35 bg-amber-500/12 mx-auto mb-5 shadow-[0_8px_26px_rgba(245,158,11,0.18)]">
            <Clock size={38} className="text-amber-600" />
          </div>

          <div className="liquid-glass-pill inline-flex items-center gap-2 px-3.5 py-1 rounded-full border-amber-500/35 text-amber-800 text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Pending Admin Verification
          </div>

          <h2 className="text-3xl font-display font-black bg-gradient-to-r from-slate-900 via-sky-700 to-blue-700 bg-clip-text text-transparent mb-2">
            Registration Submitted!
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mb-6 leading-relaxed">
            Your registration has been submitted successfully. Please wait while our admin team verifies your details.
            You will receive an email once your registration is approved.
          </p>

          <div className="liquid-glass-strong rounded-3xl p-6 text-left space-y-3 mb-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-900/10">
              <div>
                <p className="text-xs text-slate-500">Registration ID</p>
                <p className="text-lg font-mono font-bold text-sky-700">{activeParticipant.registration_id || 'Generating...'}</p>
              </div>
              <button
                type="button"
                onClick={copyRegistrationId}
                className="liquid-btn-glass px-3 py-1.5 rounded-lg text-xs text-slate-700 inline-flex items-center gap-1.5 font-medium"
              >
                <Copy size={13} /> {copiedId ? 'Copied' : 'Copy ID'}
              </button>
            </div>

            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500">Participant Name:</span>
              <span className="text-slate-900 font-semibold text-right">{activeParticipant.full_name}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500">Roll / Enrolment No:</span>
              <span className="text-slate-900 font-mono text-right">{activeParticipant.roll_number}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500">Branch & Year:</span>
              <span className="text-slate-900 text-right text-xs sm:text-sm">{activeParticipant.branch} ({activeParticipant.year})</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500">WhatsApp Number:</span>
              <span className="text-slate-900 font-mono text-right">+91 {activeParticipant.whatsapp_number}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm border-t border-slate-900/10 pt-2.5">
              <span className="text-slate-500">Email:</span>
              <span className="text-slate-800 text-xs sm:text-sm text-right break-all">{activeParticipant.email}</span>
            </div>
          </div>

          <div className="liquid-glass rounded-2xl border-sky-400/35 p-4 text-left mb-6">
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} className="text-sky-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 space-y-1">
                <p className="font-semibold text-sky-800">Important Note on Step 2 (Payment):</p>
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
              className="liquid-btn-glass flex-1 py-3 rounded-xl text-slate-900 font-semibold inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Check Live Approval Status
            </button>
            <button
              type="button"
              onClick={() => {
                setViewState('form');
                setStep(1);
              }}
              className="liquid-btn-glass py-3 px-4 rounded-xl text-slate-600 hover:text-slate-900 text-sm font-medium"
            >
              New Form
            </button>
          </div>

          {error && <p className="text-xs text-red-600 mt-3 font-medium">{error}</p>}
        </motion.div>
      </div>
    );
  }

  // VIEW 3: Rejection Notice Screen
  if (viewState === 'rejected' && activeParticipant) {
    return (
      <div className="min-h-screen text-slate-900 flex items-center justify-center px-4 pt-24 pb-16">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center">
          <div className="liquid-icon-bubble w-20 h-20 border-red-500/35 bg-red-500/12 mx-auto mb-5 shadow-[0_8px_26px_rgba(239,68,68,0.18)]">
            <XCircle size={38} className="text-red-600" />
          </div>

          <div className="liquid-glass-pill inline-flex items-center gap-2 px-3.5 py-1 rounded-full border-red-500/35 text-red-700 text-xs font-semibold mb-3">
            Registration Not Approved
          </div>

          <h2 className="text-3xl font-display font-black text-slate-900 mb-2">Request Rejected</h2>
          <p className="text-slate-600 text-sm mb-6">
            Your Step 1 registration request for Ignite 2.O could not be approved at this time.
          </p>

          <div className="liquid-glass-card rounded-2xl border-red-400/35 p-5 text-left mb-6">
            <p className="text-xs text-slate-500 mb-1">Rejection Reason:</p>
            <p className="text-sm text-red-700 font-medium">
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
            className="liquid-btn-primary w-full py-3.5 rounded-xl text-white font-bold"
          >
            Register Again with Correct Details
          </button>
        </motion.div>
      </div>
    );
  }

  // VIEW 4 & 5: Main Interactive Registration Flow (Step 1 Form & Approved Step 2 Payment)
  return (
    <div className="min-h-screen text-slate-900 pt-24 pb-20 px-4">
      <div className="max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <span className="liquid-glass-pill inline-block px-4 py-1.5 rounded-full text-sky-800 text-xs font-semibold uppercase tracking-wider mb-4">
              Ignite 2.O
            </span>
            <h1 className="text-4xl font-display font-black mb-2 bg-gradient-to-r from-slate-900 via-sky-700 to-violet-700 bg-clip-text text-transparent">
              {step === 1 ? 'Step 1: Registration' : 'Step 2: Payment'}
            </h1>
            <p className="text-slate-600 text-sm">
              {step === 1
                ? 'Fill details and submit for admin approval'
                : 'Registration approved! Complete payment to finalize'}
            </p>
          </div>

          {/* Stepper Indicator */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1">
              <div className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_2px_10px_rgba(14,165,233,0.35)]" />
              <p className="text-[11px] text-sky-800 mt-1.5 text-center font-semibold">Step 1: Details & Verification</p>
            </div>
            <div className="flex-1">
              <div className={`h-2 rounded-full transition-colors ${step >= 2 ? 'bg-gradient-to-r from-blue-600 to-violet-600 shadow-[0_2px_10px_rgba(124,58,237,0.35)]' : 'bg-slate-900/10'}`} />
              <p className={`text-[11px] mt-1.5 text-center font-semibold ${step >= 2 ? 'text-violet-700' : 'text-slate-500'}`}>
                Step 2: Approved Payment
              </p>
            </div>
          </div>

          {/* Step 2 Approved Banner */}
          {step === 2 && activeParticipant && (
            <div className="liquid-glass rounded-2xl border-emerald-500/35 bg-emerald-50/75 p-4 mb-6 flex items-start gap-3">
              <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Registration Approved by Admin</p>
                <p className="text-xs text-slate-700 mt-0.5">
                  Welcome, <span className="text-slate-900 font-semibold">{activeParticipant.full_name}</span> ({activeParticipant.registration_id}). Complete payment to confirm your seat.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="liquid-glass rounded-2xl border-red-400/45 bg-red-50/85 flex items-start gap-3 p-4 text-red-700 mb-6">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5 text-red-600" />
              <div className="text-sm flex-1">
                <p className="font-medium">{error}</p>
                {error.toLowerCase().includes('already registered') && (
                  <a
                    href="/my-profile"
                    className="inline-block mt-1.5 text-xs text-sky-700 font-semibold underline hover:text-sky-800"
                  >
                    View your registration & entry pass in My Profile →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* STEP 1 FORM */}
          {step === 1 && (
            <form onSubmit={handleSubmitStep1} className="liquid-glass-strong rounded-3xl p-6 sm:p-8 space-y-5">
              {/* Email Address with OTP */}
              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email Address *</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600" />
                  <input
                    id="reg-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange}
                    readOnly={otpVerified}
                    placeholder="yourname@gmail.com"
                    className={`liquid-input w-full rounded-xl pl-10 pr-20 py-3 text-slate-900 placeholder-slate-400 ${
                      otpVerified ? 'opacity-85 cursor-not-allowed !border-emerald-500/70' : borderClass('email')
                    }`}
                  />
                  {otpVerified && (
                    <button
                      type="button"
                      onClick={() => {
                        setOtpVerified(false);
                        setOtpSent(false);
                        setOtpSentEmail('');
                        setOtpToken('');
                        setOtp('');
                        setOtpMessage('');
                        try {
                          sessionStorage.removeItem('ignite_otp_session');
                        } catch (_) {}
                      }}
                      className="liquid-glass-pill absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-sky-700 hover:text-slate-900 underline font-medium px-2.5 py-1 rounded-lg"
                    >
                      Change
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Only gmail.com addresses are accepted. Verification OTP will be sent here.
                </p>

                {/* Send / Verify OTP Controls */}
                <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={otpLoading || otpCooldown > 0 || validateField('email', form.email) !== 'valid'}
                    className={`sm:w-44 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 ${
                      validateField('email', form.email) === 'valid' && otpCooldown === 0 && !otpLoading
                        ? 'liquid-btn-primary shadow-lg shadow-sky-500/30 hover:scale-[1.02] cursor-pointer'
                        : otpCooldown > 0
                        ? 'bg-amber-600/85 text-white border border-amber-400/50 shadow-sm cursor-not-allowed'
                        : 'liquid-btn-primary opacity-60 cursor-not-allowed'
                    }`}
                  >
                    {otpLoading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : otpCooldown > 0 ? (
                      <>
                        <Clock size={14} />
                        <span>Resend in {otpCooldown}s</span>
                      </>
                    ) : otpSent ? (
                      <>
                        <RefreshCw size={14} />
                        <span>Resend OTP</span>
                      </>
                    ) : (
                      <>
                        <Mail size={14} />
                        <span>Send OTP</span>
                      </>
                    )}
                  </button>
                  <div className="flex-1 flex gap-2">
                    <input
                      id="reg-otp"
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={e => {
                        setOtp(e.target.value);
                        if (error && (error.toLowerCase().includes('otp') || error.toLowerCase().includes('verification'))) {
                          setError('');
                        }
                      }}
                      maxLength={6}
                      readOnly={otpVerified}
                      placeholder="Enter 6-digit OTP"
                      className={`liquid-input flex-1 rounded-xl px-3.5 py-2 text-slate-900 placeholder-slate-400 font-mono tracking-widest text-sm ${
                        otpVerified
                          ? 'bg-emerald-50/70 border-emerald-500/60 text-emerald-950 font-bold cursor-not-allowed'
                          : otpSent
                          ? 'border-sky-400/80 focus:border-sky-500 shadow-sm shadow-sky-500/10'
                          : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={otpLoading || !otpSent || otpVerified}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-1.5 ${
                        otpVerified
                          ? 'bg-emerald-600 border border-emerald-400 shadow-md shadow-emerald-500/25 cursor-default'
                          : otpSent && otp.trim().length === 6
                          ? 'liquid-btn-success shadow-xl shadow-emerald-500/40 hover:scale-[1.03] animate-pulse cursor-pointer'
                          : otpSent
                          ? 'liquid-btn-success shadow-md shadow-emerald-500/25 cursor-pointer'
                          : 'liquid-btn-success opacity-60 cursor-not-allowed'
                      }`}
                    >
                      {otpLoading ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : otpVerified ? (
                        <>
                          <CheckCircle size={15} className="text-white" />
                          <span>Verified</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={15} />
                          <span>Verify</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {otpMessage && (!error || (!error.toLowerCase().includes('otp') && !error.toLowerCase().includes('verification'))) && (
                  <p className={`text-xs mt-1.5 font-medium ${otpVerified ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {otpMessage}
                  </p>
                )}
              </div>

              {/* Full Name */}
              <div>
                <label htmlFor="reg-fullname" className="block text-sm font-medium text-slate-700 mb-1.5">Full Name *</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600" />
                  <input
                    id="reg-fullname"
                    name="full_name"
                    autoComplete="name"
                    value={form.full_name}
                    onChange={handleChange}
                    placeholder="Your complete full name"
                    className={`liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400 ${borderClass('full_name')}`}
                  />
                </div>
              </div>

              {/* Roll / Enrolment Number */}
              <div>
                <label htmlFor="reg-rollno" className="block text-sm font-medium text-slate-700 mb-1.5">Roll Number / Enrolment Number *</label>
                <div className="relative">
                  <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600" />
                  <input
                    id="reg-rollno"
                    name="roll_number"
                    value={form.roll_number}
                    onChange={handleChange}
                    placeholder="e.g. 2614670010009 (up to 15 chars)"
                    maxLength={15}
                    className={`liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400 font-mono ${borderClass('roll_number')}`}
                  />
                </div>
              </div>

              {/* WhatsApp Number (Present in Our Group) */}
              <div>
                <label htmlFor="reg-whatsapp" className="block text-sm font-medium text-slate-700 mb-1.5">
                  WhatsApp Number / Phone Number (Present in Our Group) *
                </label>
                <div className="relative flex">
                  <div className="liquid-glass inline-flex items-center gap-1.5 px-3.5 rounded-l-xl border-r-0 text-sky-800 font-medium text-sm select-none">
                    <Phone size={14} className="text-emerald-600" />
                    <span>+91</span>
                  </div>
                  <input
                    id="reg-whatsapp"
                    name="whatsapp_number"
                    type="tel"
                    autoComplete="tel"
                    value={form.whatsapp_number}
                    onChange={handleChange}
                    placeholder="10-digit WhatsApp phone number"
                    maxLength={10}
                    inputMode="numeric"
                    className={`liquid-input flex-1 rounded-r-xl rounded-l-none px-4 py-3 text-slate-900 placeholder-slate-400 font-mono ${borderClass('whatsapp_number')}`}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Ensure this phone number is present in the official Ignite WhatsApp group for verification.
                </p>
              </div>

              {/* Branch */}
              <div>
                <label htmlFor="reg-branch" className="block text-sm font-medium text-slate-700 mb-1.5">Branch *</label>
                <div className="relative">
                  <BookOpen size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600" />
                  <select
                    id="reg-branch"
                    name="branch"
                    value={form.branch}
                    onChange={handleChange}
                    className={`liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-slate-900 appearance-none ${borderClass('branch')}`}
                  >
                    <option value="" className="bg-white text-slate-400">Select branch</option>
                    {BRANCHES.map(b => (
                      <option key={b} value={b} className="bg-white text-slate-900">
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Year */}
              <div>
                <label htmlFor="reg-year" className="block text-sm font-medium text-slate-700 mb-1.5">Year *</label>
                <div className="relative">
                  <BookOpen size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600" />
                  <select
                    id="reg-year"
                    name="year"
                    value={form.year}
                    onChange={handleChange}
                    className={`liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-slate-900 appearance-none ${borderClass('year')}`}
                  >
                    <option value="" className="bg-white text-slate-400">Select year</option>
                    <option value="1st Year" disabled={settings.registration1stYearEnabled === false} className="bg-white text-slate-900">
                      1st Year (INR {settings.fee1stYear ?? 599}) {settings.registration1stYearEnabled === false ? '🔒 [Registrations Closed]' : ''}
                    </option>
                    <option value="2nd Year" disabled={settings.registration2ndYearEnabled === false} className="bg-white text-slate-900">
                      2nd Year (INR {settings.fee2ndYear ?? 699}) {settings.registration2ndYearEnabled === false ? '🔒 [Registrations Closed]' : ''}
                    </option>
                  </select>
                </div>

                {form.year === '2nd Year' && settings.registration2ndYearEnabled === false && (
                  <div className="liquid-glass mt-2.5 p-3 rounded-xl border-amber-500/35 bg-amber-50/80 text-amber-800 text-xs flex items-center gap-2">
                    <AlertCircle size={15} className="flex-shrink-0 text-amber-600" />
                    <span>2nd Year registrations are currently closed by Super Admin.</span>
                  </div>
                )}
                {form.year === '1st Year' && settings.registration1stYearEnabled === false && (
                  <div className="liquid-glass mt-2.5 p-3 rounded-xl border-amber-500/35 bg-amber-50/80 text-amber-800 text-xs flex items-center gap-2">
                    <AlertCircle size={15} className="flex-shrink-0 text-amber-600" />
                    <span>1st Year registrations are currently closed by Super Admin.</span>
                  </div>
                )}

                {form.year && !((form.year === '2nd Year' && settings.registration2ndYearEnabled === false) || (form.year === '1st Year' && settings.registration1stYearEnabled === false)) && (
                  <p className="text-xs text-sky-800 mt-1.5 font-medium">
                    Applicable Registration Fee: <span className="text-emerald-700 font-bold">INR {form.year === '2nd Year' ? (settings.fee2ndYear ?? 699) : (settings.fee1stYear ?? 599)}</span>
                  </p>
                )}
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Showcase Your Skill (Optional, select multiple)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SKILLS.map(skill => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3.5 py-2.5 rounded-xl border text-sm transition-all text-left backdrop-blur-md font-medium ${
                        skillSelected(skill)
                          ? 'border-sky-500/60 bg-sky-500/12 text-sky-900 shadow-[0_4px_14px_rgba(14,165,233,0.14)]'
                          : 'border-slate-900/10 bg-white/60 text-slate-700 hover:border-sky-400/50 hover:bg-white/90'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Sparkles size={14} className={skillSelected(skill) ? 'text-sky-600' : 'text-slate-400'} />
                        {skill}
                      </span>
                    </button>
                  ))}
                </div>
                {form.skills.length > 0 && (
                  <p className="text-emerald-700 text-xs mt-2 font-medium">Selected: {form.skills.join(', ')}</p>
                )}
              </div>

              {/* Submit Step 1 Button */}
              <button
                type="submit"
                disabled={
                  loading ||
                  (form.year === '2nd Year' && settings.registration2ndYearEnabled === false) ||
                  (form.year === '1st Year' && settings.registration1stYearEnabled === false)
                }
                className="liquid-btn-primary w-full py-4 rounded-xl text-white font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'Submitting Step 1...'
                  : form.year === '2nd Year' && settings.registration2ndYearEnabled === false
                  ? '2nd Year Registrations Closed'
                  : form.year === '1st Year' && settings.registration1stYearEnabled === false
                  ? '1st Year Registrations Closed'
                  : 'Submit for Admin Approval'} <ArrowRight size={18} />
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(true)}
                  className="text-xs text-sky-700 hover:text-sky-800 underline inline-flex items-center gap-1.5 font-medium"
                >
                  <Search size={13} /> Already submitted Step 1? Check Approval Status / Continue to Payment
                </button>
              </div>
            </form>
          )}

          {/* STEP 2 PAYMENT FORM (Only unlocked after admin approval) */}
          {step === 2 && activeParticipant && (
            <form onSubmit={handleSubmitStep2Payment} className="space-y-5">
              <div className="liquid-glass-strong rounded-3xl p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="liquid-icon-bubble w-9 h-9 text-sky-600">
                      <QrCode size={17} />
                    </span>
                    <h3 className="font-semibold text-slate-900">Pay Registration Fee</h3>
                  </div>
                  <span className={`liquid-glass-pill text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
                    paymentYear === '2nd Year'
                      ? 'border-amber-500/40 text-amber-800'
                      : 'border-sky-400/40 text-sky-800'
                  }`}>
                    <Lock size={12} /> {paymentYear} Payment Locked
                  </span>
                </div>

                {/* Locked Academic Year & Fee Card */}
                <div className={`liquid-glass p-4 rounded-2xl mb-5 flex items-center justify-between ${
                  paymentYear === '2nd Year'
                    ? 'border-amber-500/35 text-amber-900'
                    : 'border-sky-400/35 text-sky-900'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`liquid-icon-bubble w-10 h-10 rounded-xl ${
                      paymentYear === '2nd Year'
                        ? 'border-amber-500/35 bg-amber-500/12 text-amber-600'
                        : 'border-sky-500/35 bg-sky-500/12 text-sky-600'
                    }`}>
                      <Lock size={17} />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                        Registered Academic Year (Locked)
                      </p>
                      <p className="text-base font-black text-slate-900">{paymentYear}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      Applicable Fee
                    </p>
                    <p className="text-lg font-black text-emerald-700">INR {activeFee}</p>
                  </div>
                </div>

                {/* QR Code Display or Clear Error if Not Configured */}
                {!activeQrUrl || qrImageError ? (
                  <div className="liquid-glass rounded-2xl border-red-400/40 bg-red-50/75 p-4 text-red-700 text-center my-4">
                    <AlertCircle size={24} className="mx-auto mb-2 text-red-600" />
                    <p className="text-sm font-semibold">No QR Code Configured for {paymentYear}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      The payment QR code for {paymentYear} participants has not been configured yet. Please pay directly via UPI ID below or contact support.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl p-3 w-fit mx-auto mb-4 shadow-[0_12px_32px_rgba(14,165,233,0.14)] border border-slate-900/10">
                    <img
                      key={`${paymentYear}-${activeQrUrl}`}
                      src={activeQrUrl}
                      alt={`${paymentYear} Payment QR`}
                      onError={() => setQrImageError(true)}
                      className="w-60 h-auto max-w-full rounded-xl object-contain mx-auto"
                    />
                  </div>
                )}

                <p className="text-xs text-slate-600 mt-1 break-all text-center">
                  Payee: <span className="text-slate-900 font-semibold">{activeUpiName}</span> | UPI ID: <span className="font-mono text-sky-700 font-semibold">{activeUpiId}</span>
                </p>
              </div>

              <div className="liquid-glass-strong rounded-3xl p-6 space-y-5">
                {/* Account Holder Name */}
                <div>
                  <label htmlFor="reg-account-holder" className="block text-sm font-medium text-slate-700 mb-1.5">Account Holder Name *</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600" />
                    <input
                      id="reg-account-holder"
                      name="account_holder_name"
                      autoComplete="name"
                      value={accountHolderName}
                      onChange={e => {
                        setAccountHolderName(e.target.value);
                        setAccountHolderNameState(validateField('account_holder_name', e.target.value));
                        setError('');
                      }}
                      placeholder="Name of account holder who made the payment"
                      className={`liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400 ${
                        accountHolderNameState === 'valid'
                          ? '!border-emerald-500/80 focus:!border-emerald-600'
                          : accountHolderNameState === 'invalid'
                          ? '!border-red-500/80 focus:!border-red-600'
                          : ''
                      }`}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Enter the exact account holder name corresponding to the bank / UPI account used for payment.
                  </p>
                </div>

                {/* Upload Payment Screenshot */}
                <div>
                  <label htmlFor="reg-payment-screenshot" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Upload Payment Screenshot *
                  </label>
                  <div className="relative">
                    {!screenshotPreview ? (
                      <label htmlFor="reg-payment-screenshot" className={`liquid-glass flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer hover:bg-white/80 transition-colors ${screenshotError ? '!border-red-400/60 bg-red-50/75' : 'border-sky-400/40'}`}>
                        <Upload size={30} className={`mb-2 ${screenshotError ? 'text-red-600' : 'text-sky-600'}`} />
                        <p className="text-sm font-semibold text-slate-900">Click to upload payment screenshot</p>
                        <p className="text-xs text-slate-500 mt-1">PNG, JPG, JPEG, or WEBP (Max 10MB)</p>
                        <input
                          id="reg-payment-screenshot"
                          name="payment_screenshot"
                          type="file"
                          aria-label="Upload payment screenshot"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          onChange={handleScreenshotChange}
                          className="hidden"
                        />
                      </label>
                    ) : (
                      <div className="liquid-glass p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                        <img
                          src={screenshotPreview}
                          alt="Payment screenshot preview"
                          className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-xl border border-slate-900/15 shadow-md flex-shrink-0"
                        />
                        <div className="flex-1 text-center sm:text-left min-w-0">
                          <div className="flex items-center gap-2 justify-center sm:justify-start">
                            <CheckCircle size={16} className="text-emerald-600" />
                            <span className="text-sm font-semibold text-emerald-700">Screenshot Selected</span>
                          </div>
                          <p className="text-xs text-slate-700 truncate mt-1">{screenshotFile?.name || 'payment-screenshot'}</p>
                          {screenshotFile?.size && (
                            <p className="text-[11px] text-slate-500">{(screenshotFile.size / 1024).toFixed(1)} KB</p>
                          )}
                          <div className="flex items-center gap-2 mt-3 justify-center sm:justify-start">
                            <label htmlFor="reg-payment-screenshot-replace" className="liquid-btn-glass px-3 py-1.5 rounded-lg border-sky-400/40 text-sky-800 text-xs font-medium cursor-pointer">
                              Replace Screenshot
                              <input
                                id="reg-payment-screenshot-replace"
                                name="payment_screenshot_replace"
                                type="file"
                                aria-label="Replace payment screenshot"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                onChange={handleScreenshotChange}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={handleRemoveScreenshot}
                              className="px-3 py-1.5 rounded-lg bg-red-500/12 hover:bg-red-500/20 text-red-700 text-xs font-medium border border-red-400/35 transition-colors inline-flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {screenshotError && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
                      <AlertCircle size={12} /> {screenshotError}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="reg-payment-id" className="block text-sm font-medium text-slate-700 mb-1.5">Registration Payment ID *</label>
                  <div className="relative">
                    <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600" />
                    <input
                      id="reg-payment-id"
                      name="payment_id"
                      value={paymentId}
                      onChange={e => {
                        setPaymentId(e.target.value);
                        setPaymentIdState(validateField('payment_id', e.target.value));
                        setError('');
                      }}
                      placeholder="Enter UPI Transaction / UTR / Reference ID"
                      className={`liquid-input w-full rounded-xl pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400 font-mono ${
                        paymentIdState === 'valid'
                          ? '!border-emerald-500/80 focus:!border-emerald-600'
                          : paymentIdState === 'invalid'
                          ? '!border-red-500/80 focus:!border-red-600'
                          : ''
                      }`}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Copy and paste the 12-digit UPI reference ID or transaction reference from your payment app.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="liquid-btn-primary w-full py-4 rounded-xl text-white font-bold text-lg disabled:opacity-50"
                >
                  {loading ? 'Submitting Payment...' : 'Complete Registration & Submit Payment'}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-slate-600 text-xs mt-6">
            Already registered and paid? <a href="/my-profile" className="text-sky-700 font-semibold hover:underline">View your profile</a>
          </p>
        </motion.div>
      </div>

      {/* STATUS LOOKUP MODAL */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-slate-950/35 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="liquid-glass-strong w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900/10">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Search size={16} className="text-sky-600" /> Check Registration Approval Status
              </h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="liquid-icon-bubble w-8 h-8 rounded-lg text-slate-700 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleLookupSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Enter your Roll Number and registered Gmail address to check if your registration has been approved:
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Roll / Enrolment Number</label>
                <input
                  value={lookupRoll}
                  onChange={e => setLookupRoll(e.target.value)}
                  placeholder="e.g. 2614670010009"
                  maxLength={15}
                  className="liquid-input w-full rounded-xl px-3.5 py-2.5 text-slate-900 placeholder-slate-400 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Registered Gmail Address</label>
                <input
                  type="email"
                  value={lookupEmail}
                  onChange={e => setLookupEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="liquid-input w-full rounded-xl px-3.5 py-2.5 text-slate-900 placeholder-slate-400 text-sm"
                />
              </div>

              {lookupError && <p className="text-xs text-red-600 font-medium">{lookupError}</p>}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="liquid-btn-glass px-4 py-2 rounded-xl text-slate-700 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="liquid-btn-primary px-5 py-2 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
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
