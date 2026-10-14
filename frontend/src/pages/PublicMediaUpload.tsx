import { apiFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { UploadCloud, CheckCircle2, AlertCircle, Lock, ArrowLeft, Image as ImageIcon, Loader2 } from 'lucide-react';
import { getErrorMessage, readJsonSafe } from '../lib/http';
import { generateImagePreviewDataUrl, generateVideoPosterDataUrl, readFileAsDataUrl } from '../lib/mediaUpload';

const MAX_PUBLIC_UPLOAD_BYTES = 16 * 1024 * 1024; // 16 MB file (~21 MB base64 payload)

export default function PublicMediaUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState('general');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [checkingControl, setCheckingControl] = useState(true);
  const [uploadsEnabled, setUploadsEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch('/api/public-media-control')
      .then((res) => res.json())
      .then((data) => {
        if (active && data && typeof data.enabled === 'boolean') {
          setUploadsEnabled(data.enabled);
        }
      })
      .catch((err) => {
        console.error('Failed to check media upload control status:', err);
      })
      .finally(() => {
        if (active) setCheckingControl(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadsEnabled) {
      setError('Public media uploads are currently closed.');
      return;
    }
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    if (file.size > MAX_PUBLIC_UPLOAD_BYTES) {
      setError('File is too large. Please upload media up to 16 MB.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      const fileDataUrl = await readFileAsDataUrl(file);
      const previewDataUrl = type === 'image'
        ? await generateImagePreviewDataUrl(file)
        : await generateVideoPosterDataUrl(file);

      const res = await apiFetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          category,
          caption,
          file_data_url: fileDataUrl,
          preview_data_url: previewDataUrl,
        }),
      });

      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to submit media'));

      setFile(null);
      setCaption('');
      setCategory('general');
      setSuccess('Upload submitted. It will appear after admin verification.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit media');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium mb-4">Ignite 2.O Community</span>
          <h1 className="text-4xl font-black mb-2">Public Media Upload</h1>
          <p className="text-gray-400">Share event photos and videos. Submissions are reviewed before publishing.</p>
          <p className="text-gray-500 text-sm mt-2">Max file size: 16 MB</p>
        </motion.div>

        {checkingControl ? (
          <div className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-12 text-center">
            <Loader2 className="animate-spin mx-auto text-[#3b82f6] mb-3" size={32} />
            <p className="text-gray-400 text-sm">Checking upload portal status...</p>
          </div>
        ) : !uploadsEnabled ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#191e1b]/90 border border-amber-500/30 rounded-2xl p-8 sm:p-10 text-center space-y-5"
          >
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
              <Lock size={32} />
            </div>
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Submissions Paused
              </span>
              <h2 className="text-2xl font-bold text-white">Public Media Uploads are Currently Closed</h2>
              <p className="text-gray-400 text-sm max-w-md mx-auto mt-2 leading-relaxed">
                Public uploads have been temporarily closed by the event administrators. You can still view all approved event photos and videos in the Gallery.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                to="/gallery"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <ImageIcon size={16} /> Explore Gallery
              </Link>
              <Link
                to="/"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#222923] border border-[#303a32] text-gray-300 hover:text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#28322a] transition-colors"
              >
                <ArrowLeft size={16} /> Back to Home
              </Link>
            </div>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Media File *</label>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600/30 file:px-3 file:py-2 file:text-blue-200"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Caption (optional)</label>
              <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write a short caption" className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#3b82f6]" />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3b82f6]">
                <option value="general">General</option>
                <option value="winner">Winner</option>
              </select>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm">
                <CheckCircle2 size={16} /> {success}
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50">
              <UploadCloud size={18} /> {loading ? 'Submitting...' : 'Submit For Review'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

