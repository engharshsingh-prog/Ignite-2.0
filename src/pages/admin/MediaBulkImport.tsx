import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Link2, CheckCircle2 } from 'lucide-react';
import { authHeaders } from '../../lib/auth';
import { generateImagePreviewDataUrl, generateVideoPosterDataUrl, readFileAsDataUrl } from '../../lib/mediaUpload';

type UploadResponse = {
  imported?: number;
  resolved?: number;
  failed_links?: Array<{ link: string; error: string }>;
};

async function uploadMedia(payload: Record<string, unknown>): Promise<{ ok: boolean; data: UploadResponse | null }> {
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
  return { ok: res.ok, data };
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

    for (let index = 0; index < lines.length; index += 1) {
      const link = lines[index];
      setDriveResult(`Importing ${Math.max(importedMedia, 0)}/${Math.max(resolvedMedia, 1)} media...`);
      const { ok, data } = await uploadMedia({
        type: driveType,
        category: driveCategory,
        caption: driveCaption,
        drive_link: link,
      });

      if (!ok) {
        failedLinks += 1;
        continue;
      }

      importedMedia += Number(data?.imported || 0);
      resolvedMedia += Number(data?.resolved || 0);
      failedLinks += Array.isArray(data?.failed_links) ? data!.failed_links!.length : 0;
      setDriveResult(`Importing ${importedMedia}/${Math.max(resolvedMedia, importedMedia, 1)} media...`);
    }

    setDriveLoading(false);
    setDriveResult(
      `Imported ${importedMedia}/${Math.max(resolvedMedia, importedMedia)} Google Drive media` +
      `${failedLinks ? ` (${failedLinks} link${failedLinks > 1 ? 's' : ''} failed)` : ''}.`
    );
  };

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/admin/upload" className="text-gray-400 hover:text-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-black">Bulk Media Import</h1>
            <p className="text-gray-400 text-sm">Upload many files or import from public Google Drive links</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleBulkFiles} className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2"><Upload size={18} className="text-blue-300" /> Bulk File Upload</h2>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={e => setFiles(Array.from(e.target.files || []))}
              className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600/30 file:px-3 file:py-2 file:text-blue-200"
            />
            <input value={fileCaption} onChange={e => setFileCaption(e.target.value)} placeholder="Caption (applies to all)" className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600" />
            <select value={fileCategory} onChange={e => setFileCategory(e.target.value)} className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white">
              <option value="general">General</option>
              <option value="winner">Winner</option>
            </select>
            <button type="submit" disabled={fileLoading} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold disabled:opacity-50">
              {fileLoading ? 'Uploading...' : 'Upload Files'}
            </button>
            {fileResult && <p className="text-sm text-gray-300 flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-300" /> {fileResult}</p>}
          </form>

          <form onSubmit={handleDriveImport} className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2"><Link2 size={18} className="text-olive-300" /> Google Drive Shared Links</h2>
            <textarea
              value={driveLinks}
              onChange={e => setDriveLinks(e.target.value)}
              placeholder="Paste one public Drive link per line"
              rows={6}
              className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 resize-none"
            />
            <input value={driveCaption} onChange={e => setDriveCaption(e.target.value)} placeholder="Caption (applies to all)" className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600" />
            <div className="grid grid-cols-2 gap-3">
              <select value={driveCategory} onChange={e => setDriveCategory(e.target.value)} className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white">
                <option value="general">General</option>
                <option value="winner">Winner</option>
              </select>
              <select value={driveType} onChange={e => setDriveType(e.target.value as 'image' | 'video')} className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white">
                <option value="image">Image Links</option>
                <option value="video">Video Links</option>
              </select>
            </div>
            <button type="submit" disabled={driveLoading} className="w-full py-3 rounded-xl bg-gradient-to-r from-olive-500 to-olive-400 text-black font-bold disabled:opacity-50">
              {driveLoading ? 'Importing...' : 'Import Links'}
            </button>
            {driveResult && <p className="text-sm text-gray-300 flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-300" /> {driveResult}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

