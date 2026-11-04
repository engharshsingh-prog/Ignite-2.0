import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Plus, Trash2, ArrowLeft, X, Crown, Upload, Check, Edit2, AlertCircle } from 'lucide-react';
import { authHeaders } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';
import WinnerAvatar from '../../components/WinnerAvatar';
import { normalizeImageUrl } from '../../lib/imageUrl';
import { getErrorMessage, readJsonSafe } from '../../lib/http';

interface Winner {
  id: number;
  participant_id?: number | null;
  name: string;
  roll_no: string;
  branch: string;
  award_title: string;
  image_url: string;
  description: string;
}

interface Participant {
  id: number;
  full_name: string;
  roll_number: string;
  branch: string;
}

const AWARDS = [
  'Mr. IGNITE',
  'Ms. IGNITE',
  'Mr. Fresher',
  'Ms. Fresher',
  'Best Dancer',
  'Best Singer',
  'Most Talented',
  'Mr. Personality',
  'Ms. Personality',
  'Best Dressed',
  'Funniest Fresher',
  'Custom...',
];

export default function WinnersManager() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    participant_id: '',
    name: '',
    roll_no: '',
    branch: '',
    award_title: '',
    image_url: '',
    description: '',
  });
  const [customAward, setCustomAward] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  // Edit State
  const [editingWinner, setEditingWinner] = useState<Winner | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    roll_no: '',
    branch: '',
    award_title: '',
    image_url: '',
    description: '',
  });
  const [editCustomAward, setEditCustomAward] = useState('');
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState('');

  const addFileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      const [wRes, pRes] = await Promise.all([
        fetch('/api/winners', { headers: authHeaders() }),
        fetch('/api/participants', { headers: authHeaders() }),
      ]);
      const winnersData = await readJsonSafe<Winner[]>(wRes);
      const participantsData = await readJsonSafe<Participant[]>(pRes);
      setWinners(Array.isArray(winnersData) ? winnersData : []);
      setParticipants(Array.isArray(participantsData) ? participantsData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleParticipantSelect = (id: string) => {
    const p = participants.find((item) => String(item.id) === id);
    if (p) {
      setForm((f) => ({
        ...f,
        participant_id: id,
        name: p.full_name,
        roll_no: p.roll_number,
        branch: p.branch,
      }));
    } else {
      setForm((f) => ({ ...f, participant_id: id }));
    }
  };

  const handleUrlInput = (raw: string, isEdit = false) => {
    const normalized = normalizeImageUrl(raw);
    if (isEdit) {
      setEditForm((prev) => ({ ...prev, image_url: normalized }));
    } else {
      setForm((prev) => ({ ...prev, image_url: normalized }));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      const msg = 'File size exceeds 5MB limit. Please choose a smaller image.';
      if (isEdit) setEditError(msg);
      else setError(msg);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (isEdit) {
        setEditForm((prev) => ({ ...prev, image_url: dataUrl }));
        setEditError('');
      } else {
        setForm((prev) => ({ ...prev, image_url: dataUrl }));
        setError('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const awardTitle = form.award_title === 'Custom...' ? customAward : form.award_title;
    if (!form.name || !awardTitle) {
      setError('Name and award title are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/winners', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          image_url: normalizeImageUrl(form.image_url),
          award_title: awardTitle,
        }),
      });
      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to add winner'));
      setForm({
        participant_id: '',
        name: '',
        roll_no: '',
        branch: '',
        award_title: '',
        image_url: '',
        description: '',
      });
      setCustomAward('');
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (w: Winner) => {
    setEditingWinner(w);
    const isStandardAward = AWARDS.includes(w.award_title);
    setEditForm({
      name: w.name,
      roll_no: w.roll_no || '',
      branch: w.branch || '',
      award_title: isStandardAward ? w.award_title : 'Custom...',
      image_url: normalizeImageUrl(w.image_url) || '',
      description: w.description || '',
    });
    setEditCustomAward(isStandardAward ? '' : w.award_title);
    setEditError('');
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWinner) return;
    const awardTitle = editForm.award_title === 'Custom...' ? editCustomAward : editForm.award_title;
    if (!editForm.name || !awardTitle) {
      setEditError('Name and award title are required');
      return;
    }
    setUpdating(true);
    setEditError('');
    try {
      const res = await fetch('/api/winners', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          id: editingWinner.id,
          participant_id: editingWinner.participant_id || null,
          name: editForm.name,
          roll_no: editForm.roll_no,
          branch: editForm.branch,
          award_title: awardTitle,
          image_url: normalizeImageUrl(editForm.image_url),
          description: editForm.description,
        }),
      });
      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update winner'));
      setEditingWinner(null);
      fetchData();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this winner entry?')) return;
    setDeleting(id);
    try {
      await fetch('/api/winners', {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ id }),
      });
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const isDriveConverted = (url: string) => url.includes('googleusercontent.com') || url.includes('drive.google.com');

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gray-400 hover:text-white p-2 rounded-xl bg-white/5 border border-white/10 transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black">Winners Manager</h1>
              <p className="text-gray-400 text-sm">Manage Hall of Fame entries & photos</p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowForm(!showForm);
              setEditingWinner(null);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-olive-500 text-black font-bold hover:bg-olive-400 transition-colors shadow-lg shadow-olive-500/20"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'Add Winner'}
          </button>
        </div>

        {/* Add Winner Form */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#191e1b]/95 border border-[#303a32] rounded-2xl p-6 mb-8 shadow-2xl"
          >
            <h2 className="font-bold text-lg mb-5 flex items-center gap-2 text-olive-300">
              <Crown size={20} className="text-olive-400" /> Add New Winner
            </h2>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Select Participant (optional)</label>
                <select
                  value={form.participant_id}
                  onChange={(e) => handleParticipantSelect(e.target.value)}
                  className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-olive-500"
                >
                  <option value="">-- Select participant --</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.roll_number})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Award Title *</label>
                <select
                  value={form.award_title}
                  onChange={(e) => setForm((f) => ({ ...f, award_title: e.target.value }))}
                  className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-olive-500"
                >
                  <option value="">-- Select award --</option>
                  {AWARDS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                {form.award_title === 'Custom...' && (
                  <input
                    value={customAward}
                    onChange={(e) => setCustomAward(e.target.value)}
                    placeholder="Enter custom award name"
                    className="mt-2 w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Winner's full name"
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Roll No / Enrolment No</label>
                <input
                  value={form.roll_no}
                  onChange={(e) => setForm((f) => ({ ...f, roll_no: e.target.value }))}
                  placeholder="e.g., 64001096"
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Branch</label>
                <input
                  value={form.branch}
                  onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                  placeholder="e.g., ECE"
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500"
                />
              </div>

              {/* Photo Input (URL + File Upload + Live Preview) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm text-gray-400">Winner Photo</label>
                  <span className="text-xs text-gray-500">Google Drive, URL, or File</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    value={form.image_url}
                    onChange={(e) => handleUrlInput(e.target.value, false)}
                    placeholder="Paste link (Google Drive, URL, etc.)"
                    className="flex-1 bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-olive-500"
                  />
                  <input
                    ref={addFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, false)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => addFileInputRef.current?.click()}
                    className="px-3.5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                    title="Upload image from device"
                  >
                    <Upload size={14} />
                    <span>Upload</span>
                  </button>
                </div>

                {/* Status indicator & preview */}
                {form.image_url && (
                  <div className="mt-2.5 flex items-center gap-3 p-2.5 rounded-xl bg-black/40 border border-white/10">
                    <WinnerAvatar
                      src={form.image_url}
                      name={form.name || 'Preview'}
                      className="w-10 h-10 rounded-full object-cover border border-emerald-500/50"
                      fallbackClassName="w-10 h-10 rounded-full bg-olive-600/30 flex items-center justify-center font-bold text-sm text-olive-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                        <Check size={12} />
                        {isDriveConverted(form.image_url) ? 'Direct Google Drive image ready' : 'Photo attached'}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">{form.image_url.slice(0, 48)}...</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, image_url: '' }))}
                      className="text-gray-400 hover:text-red-400 p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1.5">Description / Citation</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Why they won this award..."
                  rows={3}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500 resize-none"
                />
              </div>

              {error && (
                <div className="md:col-span-2 flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-olive-500 to-olive-400 text-black font-bold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-olive-500/20"
                >
                  {submitting ? 'Adding...' : 'Add to Hall of Fame'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Edit Winner Modal */}
        {editingWinner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#191e1b] border border-[#303a32] rounded-2xl p-6 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg flex items-center gap-2 text-olive-300">
                  <Edit2 size={18} className="text-olive-400" /> Edit Winner Details & Photo
                </h2>
                <button
                  onClick={() => setEditingWinner(null)}
                  className="text-gray-400 hover:text-white p-1.5 rounded-lg bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleEditSave} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 uppercase font-medium mb-1">Name</label>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-olive-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase font-medium mb-1">Roll No</label>
                    <input
                      value={editForm.roll_no}
                      onChange={(e) => setEditForm((f) => ({ ...f, roll_no: e.target.value }))}
                      className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-olive-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 uppercase font-medium mb-1">Branch</label>
                    <input
                      value={editForm.branch}
                      onChange={(e) => setEditForm((f) => ({ ...f, branch: e.target.value }))}
                      className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-olive-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 uppercase font-medium mb-1">Award Title</label>
                  <select
                    value={editForm.award_title}
                    onChange={(e) => setEditForm((f) => ({ ...f, award_title: e.target.value }))}
                    className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-olive-500 text-sm"
                  >
                    {AWARDS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  {editForm.award_title === 'Custom...' && (
                    <input
                      value={editCustomAward}
                      onChange={(e) => setEditCustomAward(e.target.value)}
                      placeholder="Custom award name"
                      className="mt-2 w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  )}
                </div>

                {/* Photo Update Section */}
                <div className="p-4 rounded-xl border border-white/10 bg-black/30">
                  <label className="block text-xs text-gray-400 uppercase font-medium mb-2">Photo & Avatar</label>
                  <div className="flex items-center gap-4 mb-3">
                    <WinnerAvatar
                      src={editForm.image_url}
                      name={editForm.name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-olive-400/50 shadow-md shrink-0"
                      fallbackClassName="w-16 h-16 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#718044] flex items-center justify-center font-bold text-xl text-white shrink-0 border-2 border-olive-400/50"
                      textSize="text-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">Live Photo Preview</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {editForm.image_url ? 'Photo loaded successfully' : 'No photo uploaded; using initial avatar'}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => editFileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg bg-olive-500/20 border border-olive-500/40 text-olive-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-olive-500/30 transition-colors"
                        >
                          <Upload size={12} /> Upload Photo
                        </button>
                        {editForm.image_url && (
                          <button
                            type="button"
                            onClick={() => setEditForm((f) => ({ ...f, image_url: '' }))}
                            className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, true)}
                    className="hidden"
                  />

                  <div className="mt-2">
                    <label className="block text-[11px] text-gray-500 mb-1">Or paste direct link / Google Drive link:</label>
                    <input
                      value={editForm.image_url}
                      onChange={(e) => handleUrlInput(e.target.value, true)}
                      placeholder="https://drive.google.com/..."
                      className="w-full bg-[#191e1b] border border-[#303a32] rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-olive-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 uppercase font-medium mb-1">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-olive-500 text-sm resize-none"
                  />
                </div>

                {editError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    <AlertCircle size={16} />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingWinner(null)}
                    className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updating}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-olive-500 to-olive-400 text-black text-sm font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    {updating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Winners List Grid */}
        {loading ? (
          <LoadingSpinner text="Loading winners..." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {winners.map((w) => (
              <motion.div
                key={w.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-5 relative group hover:border-olive-500/40 transition-all shadow-lg"
              >
                {/* Actions: Edit & Delete */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(w)}
                    title="Edit Winner & Photo"
                    className="w-8 h-8 rounded-full bg-white/5 border border-white/15 text-gray-300 flex items-center justify-center hover:bg-white/15 hover:text-white transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(w.id)}
                    disabled={deleting === w.id}
                    title="Delete Winner"
                    className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/25 transition-colors"
                  >
                    {deleting === w.id ? '...' : <Trash2 size={13} />}
                  </button>
                </div>

                {/* Avatar & Info */}
                <div className="flex items-center gap-3.5 mb-3.5 pr-20">
                  <WinnerAvatar
                    src={w.image_url}
                    name={w.name}
                    className="w-12 h-12 rounded-full object-cover border border-white/15 shadow shrink-0"
                    fallbackClassName="w-12 h-12 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#718044] flex items-center justify-center font-bold text-white shrink-0 border border-white/15"
                  />
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-base leading-snug truncate">{w.name}</h3>
                    <p className="text-gray-400 text-xs truncate mt-0.5">
                      {w.roll_no || 'No Roll'} &bull; {w.branch || 'General'}
                    </p>
                  </div>
                </div>

                {/* Award Title Badge */}
                <div className="flex items-center gap-2 mb-2.5">
                  <Trophy size={15} className="text-olive-400 shrink-0" />
                  <span className="text-olive-300 text-sm font-semibold tracking-wide truncate">{w.award_title}</span>
                </div>

                {/* Description */}
                {w.description && (
                  <p className="text-gray-400 text-xs leading-relaxed line-clamp-4">{w.description}</p>
                )}
              </motion.div>
            ))}

            {winners.length === 0 && (
              <div className="col-span-full text-center py-16 bg-[#191e1b]/40 rounded-2xl border border-white/5">
                <Trophy size={40} className="mx-auto text-gray-700 mb-3" />
                <p className="text-gray-500">No winners added yet.</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-3 text-sm text-olive-400 hover:underline font-semibold"
                >
                  + Add First Winner
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
