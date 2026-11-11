import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Link2, CheckCircle2 } from 'lucide-react';
import { authHeaders } from '../../lib/auth';
import { generateImagePreviewDataUrl, generateVideoPosterDataUrl, readFileAsDataUrl } from '../../lib/mediaUpload';

type UploadResponse = {
  imported?: number;
  resolved?: number;
  failed_links?: Array<{ link: string; error: string }>;
  error?: string;
};

async function uploadMedia(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: UploadResponse | null }> {
  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    let data: UploadResponse | null = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, data: { error: err?.message || 'Network request failed' } };
  }
}

export default function MediaBulkImport() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileCategory, setFileCategory] = useState('general');
  const [fileCaption, setFileCaption] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileResult, setFileResult] = useState('');

  const [driveLinks, setDriveLinks] = useState('');
  const [driveCategory, setDriveCategory] = useState('general');
  const [driveType, setDriveType] = useState<'image' | 'video'>('image');
  const [driveCaption, setDriveCaption] = useState('');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveResult, setDriveResult] = useState('');

  const handleBulkFiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setFileResult('Select at least one file.');
      return;
    }

    setFileLoading(true);
    setFileResult('');
    let success = 0;

    for (const file of files) {
      try {
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const original = await readFileAsDataUrl(file);
        const preview = type === 'image'
          ? await generateImagePreviewDataUrl(file)
          : await generateVideoPosterDataUrl(file);

        const { ok } = await uploadMedia({
          type,
          category: fileCategory,
          caption: fileCaption,
          file_data_url: original,
          preview_data_url: preview,
        });

        if (ok) success += 1;
      } catch {
        // Skip failures and continue with next file.
      }
    }

    setFileLoading(false);
    setFileResult(`Uploaded ${success}/${files.length} files.`);
  };

  const handleDriveImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = driveLinks
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setDriveResult('Paste at least one public Google Drive link.');
      return;
    }

    setDriveLoading(true);
    setDriveResult('');
    let importedMedia = 0;
    let resolvedMedia = 0;
    let failedLinks = 0;
    const failureMessages: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const link = lines[index];
      setDriveResult(`Importing media from link ${index + 1}/${lines.length}...`);
      const { ok, status, data } = await uploadMedia({
        type: driveType,
        category: driveCategory,
        caption: driveCaption,
        drive_link: link,
      });

      if (!ok) {
        failedLinks += 1;
        const errMsg = data?.error || (status === 504 ? 'Execution timed out (Vercel limit)' : `HTTP error ${status}`);
        failureMessages.push(`Link ${index + 1}: ${errMsg}`);
        continue;
      }

      importedMedia += Number(data?.imported || 0);
      resolvedMedia += Number(data?.resolved || 0);
      if (Array.isArray(data?.failed_links) && data.failed_links.length > 0) {
        failedLinks += data.failed_links.length;
        data.failed_links.forEach(f => failureMessages.push(f.error || 'Failed to import'));
      }
      setDriveResult(`Imported ${importedMedia}/${Math.max(resolvedMedia, importedMedia, 1)} media...`);
    }

    setDriveLoading(false);
    let resultMsg = `Imported ${importedMedia}/${Math.max(resolvedMedia, importedMedia)} Google Drive media`;
    if (failedLinks > 0) {
      resultMsg += ` (${failedLinks} link${failedLinks > 1 ? 's' : ''} failed: ${failureMessages.slice(0, 2).join('; ')})`;
    } else {
      resultMsg += ' successfully.';
    }
    setDriveResult(resultMsg);
  };

  return (
    <div className="min-h-screen text-white pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/admin/upload" className="liquid-icon-bubble w-10 h-10 rounded-xl text-slate-300 hover:text-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent">
              Bulk Media Import
            </h1>
            <p className="text-slate-300/80 text-sm">Upload many files or import from public Google Drive links</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleBulkFiles} className="liquid-glass-strong rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-white"><Upload size={18} className="text-cyan-300" /> Bulk File Upload</h2>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={e => setFiles(Array.from(e.target.files || []))}
              className="liquid-input w-full rounded-xl px-4 py-3 text-white file:mr-3 file:rounded-lg file:border file:border-cyan-300/30 file:bg-cyan-500/20 file:px-3 file:py-2 file:text-cyan-100 file:text-xs file:font-semibold"
            />
            <input value={fileCaption} onChange={e => setFileCaption(e.target.value)} placeholder="Caption (applies to all)" className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60" />
            <select value={fileCategory} onChange={e => setFileCategory(e.target.value)} className="liquid-input w-full rounded-xl px-4 py-3 text-white">
              <option value="general" className="bg-[#081022] text-white">General</option>
              <option value="winner" className="bg-[#081022] text-white">Winner</option>
            </select>
            <button type="submit" disabled={fileLoading} className="liquid-btn-primary w-full py-3 rounded-xl text-white font-bold disabled:opacity-50">
              {fileLoading ? 'Uploading...' : 'Upload Files'}
            </button>
            {fileResult && <p className="text-sm text-slate-200 flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-300" /> {fileResult}</p>}
          </form>

          <form onSubmit={handleDriveImport} className="liquid-glass-strong rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-white"><Link2 size={18} className="text-violet-300" /> Google Drive Shared Links</h2>
            <textarea
              value={driveLinks}
              onChange={e => setDriveLinks(e.target.value)}
              placeholder="Paste one public Drive link per line"
              rows={6}
              className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60 resize-none"
            />
            <input value={driveCaption} onChange={e => setDriveCaption(e.target.value)} placeholder="Caption (applies to all)" className="liquid-input w-full rounded-xl px-4 py-3 text-white placeholder-slate-400/60" />
            <div className="grid grid-cols-2 gap-3">
              <select value={driveCategory} onChange={e => setDriveCategory(e.target.value)} className="liquid-input w-full rounded-xl px-4 py-3 text-white">
                <option value="general" className="bg-[#081022] text-white">General</option>
                <option value="winner" className="bg-[#081022] text-white">Winner</option>
              </select>
              <select value={driveType} onChange={e => setDriveType(e.target.value as 'image' | 'video')} className="liquid-input w-full rounded-xl px-4 py-3 text-white">
                <option value="image" className="bg-[#081022] text-white">Image Links</option>
                <option value="video" className="bg-[#081022] text-white">Video Links</option>
              </select>
            </div>
            <button type="submit" disabled={driveLoading} className="liquid-btn-primary w-full py-3 rounded-xl text-white font-bold disabled:opacity-50">
              {driveLoading ? 'Importing...' : 'Import Links'}
            </button>
            {driveResult && <p className="text-sm text-slate-200 flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-300" /> {driveResult}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

