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
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gray-400 hover:text-white">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-black">Media Manager</h1>
              <p className="text-gray-400 text-sm">Manage approved media and verify public submissions</p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowForm(!showForm);
              if (!showForm) resetForm();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3b82f6] text-white font-semibold hover:bg-[#3b82f6]/90 transition-colors"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'Add Media'}
          </button>
        </div>
        <div className="mb-6">
          <Link to="/admin/upload-bulk" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-olive-500/20 border border-olive-500/30 text-olive-300 text-sm hover:bg-olive-500/30 transition-colors">
            <Upload size={15} /> Bulk Upload / Drive Import
          </Link>
        </div>

        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-6 mb-8">
            <h2 className="font-bold text-lg mb-5 flex items-center gap-2"><Upload size={18} className="text-blue-400" /> Add New Media</h2>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 flex gap-2">
                <button type="button" onClick={() => setMode('file')} className={`px-4 py-2 rounded-xl text-sm border ${mode === 'file' ? 'bg-blue-600/30 border-blue-500/50 text-blue-200' : 'bg-white/5 border-white/15 text-gray-400'}`}>
                  Upload File
                </button>
                <button type="button" onClick={() => setMode('url')} className={`px-4 py-2 rounded-xl text-sm border ${mode === 'url' ? 'bg-blue-600/30 border-blue-500/50 text-blue-200' : 'bg-white/5 border-white/15 text-gray-400'}`}>
                  Use URL
                </button>
              </div>

              {mode === 'url' ? (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1.5">Image/Video URL *</label>
                    <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Type</label>
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6]">
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Media File *</label>
                  <input type="file" accept="image/*,video/*" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600/30 file:px-3 file:py-2 file:text-blue-200" />
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Caption</label>
                <input value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="Optional caption" className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6]">
                  <option value="general">General</option>
                  <option value="winner">Winner</option>
                </select>
              </div>

              {error && <p className="md:col-span-2 text-red-400 text-sm">{error}</p>}
              <div className="md:col-span-2">
                <button type="submit" disabled={submitting} className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
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
              <h2 className="text-xl font-bold mb-3">Pending Public Uploads</h2>
              {pendingMedia.length === 0 ? (
                <div className="p-5 rounded-2xl bg-[#191e1b]/90 border border-[#303a32] text-sm text-gray-500">No pending submissions.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {pendingMedia.map(item => (
                    <div key={item.id} className="rounded-xl overflow-hidden bg-[#191e1b]/90 border border-[#303a32]">
                      <img src={item.thumb_url || item.url} alt={item.caption || 'Pending media'} className="w-full aspect-square object-cover" />
                      <div className="p-3">
                        <p className="text-xs text-gray-400 mb-2">By: {item.uploaded_by}</p>
                        {item.caption && <p className="text-sm text-white mb-2 line-clamp-2">{item.caption}</p>}
                        <div className="mb-2">
                          <label className="block text-[11px] text-gray-500 mb-1">Category on approval</label>
                          <select
                            value={pendingCategoryDrafts[item.id] || item.category || 'general'}
                            onChange={e => setPendingCategoryDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-full bg-[#222923] border border-[#303a32] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                          >
                            <option value="general">General</option>
                            <option value="winner">Winner</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleModerate(item.id, 'approved')} disabled={moderating === item.id} className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1">
                            <Check size={13} /> Approve
                          </button>
                          <button onClick={() => handleModerate(item.id, 'rejected')} disabled={moderating === item.id} className="flex-1 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center justify-center gap-1">
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
              <h2 className="text-xl font-bold mb-3">Approved Media</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {approvedMedia.map(item => (
                  <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group relative rounded-xl overflow-hidden aspect-square bg-[#191e1b]/90 border border-[#303a32]">
                    <img src={item.thumb_url || item.url} alt={item.caption} className="w-full h-full object-cover" />
                    {item.type === 'video' && (
                      <div className="absolute left-2 top-2 px-2 py-1 rounded-full bg-black/60 text-xs text-white flex items-center gap-1">
                        <Video size={12} /> Video
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                      <div className="flex justify-end">
                        <button onClick={() => handleDelete(item.id)} disabled={deleting === item.id} className="w-8 h-8 rounded-full bg-red-500/80 flex items-center justify-center text-white hover:bg-red-600 transition-colors">
                          {deleting === item.id ? '...' : <Trash2 size={14} />}
                        </button>
                      </div>
                      <div>
                        {item.caption && <p className="text-white text-xs font-medium truncate">{item.caption}</p>}
                        <div className="flex gap-1 mt-1">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/50 text-blue-200">{item.type}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-olive-500/50 text-olive-200">{item.category}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {approvedMedia.length === 0 && (
                  <div className="col-span-full text-center py-20">
                    <Image size={40} className="mx-auto text-gray-700 mb-3" />
                    <p className="text-gray-500">No approved media yet.</p>
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

