import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, Trash2, Image, ArrowLeft, Plus, X, Check, Ban, Video } from 'lucide-react';
import { authHeaders } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getErrorMessage, readJsonSafe } from '../../lib/http';
import { generateImagePreviewDataUrl, generateVideoPosterDataUrl, readFileAsDataUrl } from '../../lib/mediaUpload';

interface MediaItem {
  id: number;
  url: string;
  thumb_url: string;
  caption: string;
  type: string;
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  uploaded_by: string;
  uploaded_at: string;
}

type UploadMode = 'file' | 'url';

export default function MediaUpload() {
  const [approvedMedia, setApprovedMedia] = useState<MediaItem[]>([]);
  const [pendingMedia, setPendingMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<UploadMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ url: '', caption: '', type: 'image', category: 'general' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  const [moderating, setModerating] = useState<number | null>(null);
  const [pendingCategoryDrafts, setPendingCategoryDrafts] = useState<Record<number, string>>({});

  const fetchMedia = async () => {
    try {
      const [approvedRes, pendingRes] = await Promise.all([
        fetch('/api/media?status=approved', { headers: authHeaders() }),
        fetch('/api/media?status=pending', { headers: authHeaders() }),
      ]);
      const approvedData = await readJsonSafe<MediaItem[]>(approvedRes);
      const pendingData = await readJsonSafe<MediaItem[]>(pendingRes);
      const nextApproved = Array.isArray(approvedData) ? approvedData : [];
      const nextPending = Array.isArray(pendingData) ? pendingData : [];
      setApprovedMedia(nextApproved);
      setPendingMedia(nextPending);
      setPendingCategoryDrafts(Object.fromEntries(nextPending.map(item => [item.id, item.category || 'general'])));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const resetForm = () => {
    setFile(null);
    setForm({ url: '', caption: '', type: 'image', category: 'general' });
    setMode('file');
    setError('');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        caption: form.caption,
        category: form.category,
      };

      if (mode === 'url') {
        if (!form.url.trim()) throw new Error('URL is required');
        if (!form.type) throw new Error('Type is required');
        payload.url = form.url.trim();
        payload.type = form.type;
      } else {
        if (!file) throw new Error('Please choose a media file');
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const fileDataUrl = await readFileAsDataUrl(file);
        const previewDataUrl = type === 'image'
          ? await generateImagePreviewDataUrl(file)
          : await generateVideoPosterDataUrl(file);

        payload.type = type;
        payload.file_data_url = fileDataUrl;
        payload.preview_data_url = previewDataUrl;
      }

      const res = await fetch('/api/media', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to add media'));

      resetForm();
      setShowForm(false);
      fetchMedia();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add media');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch('/api/media', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
      fetchMedia();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const handleModerate = async (id: number, status: 'approved' | 'rejected') => {
    setModerating(id);
    try {
      const payload: Record<string, unknown> = { id, status };
      if (status === 'approved') {
        payload.category = pendingCategoryDrafts[id] || 'general';
      }

      await fetch('/api/media', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      fetchMedia();
    } catch (err) {
      console.error(err);
    } finally {
      setModerating(null);
    }
  };

  return (
    <div className="min-h-screen text-white pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="liquid-icon-bubble w-10 h-10 rounded-xl text-slate-300 hover:text-white">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent">
                Media Manager
              </h1>
              <p className="text-slate-300/80 text-sm">Manage approved media and verify public submissions</p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowForm(!showForm);
              if (!showForm) resetForm();
            }}
            className="liquid-btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'Add Media'}
          </button>
        </div>
        <div className="mb-6">
          <Link to="/admin/upload-bulk" className="liquid-btn-glass inline-flex items-center gap-2 px-4 py-2 rounded-xl border-cyan-400/35 text-cyan-200 text-sm">
            <Upload size={15} /> Bulk Upload / Drive Import
          </Link>
        </div>

        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-strong rounded-3xl p-6 mb-8">
            <h2 className="font-bold text-lg mb-5 flex items-center gap-2"><Upload size={18} className="text-cyan-300" /> Add New Media</h2>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 flex gap-2">
                <button type="button" onClick={() => setMode('file')} className={`liquid-btn-glass px-4 py-2 rounded-xl text-sm ${mode === 'file' ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100' : 'text-slate-300'}`}>
                  Upload File
                </button>
                <button type="button" onClick={() => setMode('url')} className={`liquid-btn-glass px-4 py-2 rounded-xl text-sm ${mode === 'url' ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100' : 'text-slate-300'}`}>
                  Use URL
                </button>
              </div>

              {mode === 'url' ? (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-slate-300 mb-1.5">Image/Video URL *</label>
                    <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1.5">Type</label>
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="liquid-input w-full rounded-xl px-4 py-3 text-white">
                      <option value="image" className="bg-[#081022] text-white">Image</option>
                      <option value="video" className="bg-[#081022] text-white">Video</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-300 mb-1.5">Media File *</label>
                  <input type="file" accept="image/*,video/*" onChange={e => setFile(e.target.files?.[0] || null)} className="liquid-input w-full rounded-xl px-4 py-3 text-white file:mr-4 file:rounded-lg file:border file:border-cyan-300/30 file:bg-cyan-500/20 file:px-3 file:py-2 file:text-cyan-100 file:text-xs file:font-semibold" />
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Caption</label>
                <input value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="Optional caption" className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="liquid-input w-full rounded-xl px-4 py-3 text-white">
                  <option value="general" className="bg-[#081022] text-white">General</option>
                  <option value="winner" className="bg-[#081022] text-white">Winner</option>
                </select>
              </div>

              {error && <p className="md:col-span-2 text-red-300 text-sm">{error}</p>}
              <div className="md:col-span-2">
                <button type="submit" disabled={submitting} className="liquid-btn-primary px-6 py-3 rounded-xl text-white font-bold disabled:opacity-50">
                  {submitting ? 'Uploading...' : 'Save Media'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {loading ? (
          <LoadingSpinner text="Loading media..." />
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-3 text-white">Pending Public Uploads</h2>
              {pendingMedia.length === 0 ? (
                <div className="liquid-glass-card p-5 rounded-2xl text-sm text-slate-400">No pending submissions.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {pendingMedia.map(item => (
                    <div key={item.id} className="liquid-glass-card rounded-2xl overflow-hidden">
                      <img src={item.thumb_url || item.url} alt={item.caption || 'Pending media'} className="w-full aspect-square object-cover" />
                      <div className="p-3.5">
                        <p className="text-xs text-slate-300/80 mb-2">By: {item.uploaded_by}</p>
                        {item.caption && <p className="text-sm text-white mb-2 line-clamp-2">{item.caption}</p>}
                        <div className="mb-2.5">
                          <label className="block text-[11px] text-slate-400 mb-1">Category on approval</label>
                          <select
                            value={pendingCategoryDrafts[item.id] || item.category || 'general'}
                            onChange={e => setPendingCategoryDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="liquid-input w-full rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="general" className="bg-[#081022] text-white">General</option>
                            <option value="winner" className="bg-[#081022] text-white">Winner</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleModerate(item.id, 'approved')} disabled={moderating === item.id} className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-emerald-500/30">
                            <Check size={13} /> Approve
                          </button>
                          <button onClick={() => handleModerate(item.id, 'rejected')} disabled={moderating === item.id} className="flex-1 px-3 py-2 rounded-lg bg-red-500/20 border border-red-400/40 text-red-200 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-red-500/30">
                            <Ban size={13} /> Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-xl font-bold mb-3 text-white">Approved Media</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {approvedMedia.map(item => (
                  <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="liquid-glass-card group relative rounded-2xl overflow-hidden aspect-square">
                    <img src={item.thumb_url || item.url} alt={item.caption} className="w-full h-full object-cover" />
                    {item.type === 'video' && (
                      <div className="liquid-glass-pill absolute left-2 top-2 px-2.5 py-1 rounded-full text-xs text-cyan-100 flex items-center gap-1">
                        <Video size={12} /> Video
                      </div>
                    )}
                    <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                      <div className="flex justify-end">
                        <button onClick={() => handleDelete(item.id)} disabled={deleting === item.id} className="w-8 h-8 rounded-full bg-red-500/85 flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg">
                          {deleting === item.id ? '...' : <Trash2 size={14} />}
                        </button>
                      </div>
                      <div>
                        {item.caption && <p className="text-white text-xs font-medium truncate">{item.caption}</p>}
                        <div className="flex gap-1 mt-1">
                          <span className="liquid-glass-pill text-[11px] px-2 py-0.5 rounded-full text-cyan-200">{item.type}</span>
                          <span className="liquid-glass-pill text-[11px] px-2 py-0.5 rounded-full text-violet-200">{item.category}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {approvedMedia.length === 0 && (
                  <div className="col-span-full liquid-glass-card rounded-3xl text-center py-20">
                    <Image size={40} className="mx-auto text-cyan-300/60 mb-3" />
                    <p className="text-slate-300">No approved media yet.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

