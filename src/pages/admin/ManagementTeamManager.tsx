import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Pencil, ShieldCheck, X, ImageUp } from 'lucide-react';
import LoadingSpinner from '../../components/LoadingSpinner';
import { authHeaders } from '../../lib/auth';
import { getErrorMessage, readJsonSafe } from '../../lib/http';

interface TeamMember {
  id: number;
  name: string;
  branch: string;
  year: string;
  roles: string[];
  fields: string;
  profile_image: string;
  whatsapp_number: string;
}

interface MemberForm {
  name: string;
  branch: string;
  year: string;
  roles: string;
  fields: string;
  whatsapp_number: string;
}

const BRANCHES = ['CSE Core', 'CSE AI/ML', 'AI&DS', 'IT', 'ECE', 'ME'];
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'TM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function toForm(member?: TeamMember): MemberForm {
  if (!member) {
    return {
      name: '',
      branch: BRANCHES[0],
      year: YEARS[0],
      roles: '',
      fields: '',
      whatsapp_number: '',
    };
  }

  return {
    name: member.name,
    branch: member.branch,
    year: member.year,
    roles: member.roles.join(', '),
    fields: member.fields,
    whatsapp_number: member.whatsapp_number,
  };
}

function parseRoles(raw: string): string[] {
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export default function ManagementTeamAdmin() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<MemberForm>(toForm());
  const [profileImage, setProfileImage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/management-team');
      const data = await readJsonSafe<TeamMember[]>(res);
      setMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(toForm());
    setProfileImage('');
    setShowForm(true);
    setError('');
  };

  const openEdit = (member: TeamMember) => {
    setEditing(member);
    setForm(toForm(member));
    setProfileImage(member.profile_image || '');
    setShowForm(true);
    setError('');
  };

  const closeForm = () => {
    setEditing(null);
    setForm(toForm());
    setProfileImage('');
    setShowForm(false);
    setError('');
  };

  const handleImagePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file');
      return;
    }

    try {
      setError('');
      const source = await readFileAsDataUrl(file);
      const image = await loadImage(source);

      if (image.width !== image.height) {
        setError('Only 1:1 ratio images are allowed for profile photos.');
        event.currentTarget.value = '';
        return;
      }

      setProfileImage(source);
    } catch {
      setError('Failed to read image file');
    }
  };

  const clearPhoto = () => {
    setProfileImage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        ...form,
        roles: parseRoles(form.roles),
        profile_image: profileImage,
      };

      const res = await fetch('/api/management-team', {
        method: editing ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to save member'));

      closeForm();
      fetchMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (member: TeamMember) => {
    const ok = window.confirm(`Delete ${member.name} from management team?`);
    if (!ok) return;

    setDeleting(member.id);
    try {
      await fetch('/api/management-team', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id: member.id }),
      });
      fetchMembers();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen text-white pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="liquid-icon-bubble w-10 h-10 rounded-xl text-slate-300 hover:text-white">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent">
                Management Team
              </h1>
              <p className="text-slate-300/80 text-sm">Admin-only control for team listing</p>
            </div>
          </div>
          <button onClick={openCreate} className="liquid-btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold">
            <Plus size={16} /> Add Member
          </button>
        </div>

        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-strong rounded-3xl p-6 mb-8">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg flex items-center gap-2 text-white">
                <ShieldCheck size={18} className="text-cyan-300" />
                {editing ? 'Edit Team Member' : 'Add Team Member'}
              </h2>
              <button onClick={closeForm} className="liquid-icon-bubble w-8 h-8 rounded-lg text-slate-300 hover:text-white">
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="liquid-glass md:col-span-2 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 p-4 rounded-2xl">
                <div className="flex flex-col items-center">
                  <div className="w-44 h-44 rounded-2xl border border-white/20 overflow-hidden bg-[#060d1f] relative shadow-lg">
                    {profileImage ? (
                      <img src={profileImage} alt="Profile preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-cyan-100 bg-gradient-to-br from-cyan-500/40 via-blue-600/40 to-violet-500/40">
                        {getInitials(form.name || 'TM')}
                      </div>
                    )}
                  </div>
                  <label className="mt-3 w-full">
                    <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
                    <span className="liquid-btn-glass w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm border-cyan-400/35 text-cyan-200 cursor-pointer">
                      <ImageUp size={14} /> Upload 1:1 Photo
                    </span>
                  </label>
                  <button type="button" onClick={clearPhoto} className="mt-2 text-xs text-slate-400 hover:text-white">Remove photo</button>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-slate-200">Only square (1:1 ratio) images are accepted for profile photos.</p>
                  <p className="text-xs text-slate-400">Recommended size: 512x512 or 1024x1024.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Name *</label>
                <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Branch *</label>
                <select value={form.branch} onChange={e => setForm(prev => ({ ...prev, branch: e.target.value }))} className="liquid-input w-full rounded-xl px-4 py-3 text-white">
                  {BRANCHES.map(b => (
                    <option key={b} value={b} className="bg-[#081022] text-white">{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Year *</label>
                <select value={form.year} onChange={e => setForm(prev => ({ ...prev, year: e.target.value }))} className="liquid-input w-full rounded-xl px-4 py-3 text-white">
                  {YEARS.map(y => (
                    <option key={y} value={y} className="bg-[#081022] text-white">{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">WhatsApp Number *</label>
                <input value={form.whatsapp_number} maxLength={10} onChange={e => setForm(prev => ({ ...prev, whatsapp_number: e.target.value }))} placeholder="10 digit number" className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Roles * (comma-separated)</label>
                <input value={form.roles} onChange={e => setForm(prev => ({ ...prev, roles: e.target.value }))} placeholder="Lead Coordinator, Sponsorship" className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Fields Dealt *</label>
                <input value={form.fields} onChange={e => setForm(prev => ({ ...prev, fields: e.target.value }))} placeholder="Registrations, Stage ops, Hospitality" className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60" />
              </div>

              {error && <p className="md:col-span-2 text-red-300 text-sm">{error}</p>}

              <div className="md:col-span-2">
                <button type="submit" disabled={submitting} className="liquid-btn-primary px-6 py-3 rounded-xl text-white font-bold disabled:opacity-50">
                  {submitting ? 'Saving...' : editing ? 'Update Member' : 'Add Member'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {loading ? (
          <LoadingSpinner text="Loading management team..." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {members.map(member => (
              <div key={member.id} className="liquid-glass-card rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-cyan-300/35 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 text-white font-bold flex items-center justify-center shrink-0">
                      {member.profile_image ? (
                        <img src={member.profile_image} alt={member.name} className="w-full h-full object-cover" />
                      ) : (
                        getInitials(member.name)
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white truncate">{member.name}</h3>
                      <p className="text-xs text-cyan-200/75 truncate">{member.branch} | {member.year}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(member)} className="liquid-icon-bubble w-8 h-8 rounded-lg border-cyan-400/35 text-cyan-200" title="Edit member">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(member)} disabled={deleting === member.id} className="w-8 h-8 rounded-lg border border-red-400/35 bg-red-500/15 text-red-200 hover:bg-red-500/25 disabled:opacity-50 flex items-center justify-center transition-colors" title="Delete member">
                      {deleting === member.id ? '...' : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 uppercase tracking-[0.12em] mb-2">Roles</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(member.roles.length ? member.roles : ['Unassigned']).map(role => (
                    <span key={role} className="liquid-glass-pill px-3 py-1 rounded-full text-xs text-cyan-200">{role}</span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 uppercase tracking-[0.12em] mb-2">Fields</p>
                <p className="text-sm text-slate-200/90 leading-relaxed">{member.fields || 'Not specified'}</p>
              </div>
            ))}

            {members.length === 0 && (
              <div className="col-span-full liquid-glass-card rounded-3xl text-center py-16 text-slate-400">No team members added yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

