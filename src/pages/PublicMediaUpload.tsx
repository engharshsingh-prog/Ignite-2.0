import { useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      const res = await fetch('/api/media', {
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
      </div>
    </div>
  );
}

