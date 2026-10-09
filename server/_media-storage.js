import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { put } from '@vercel/blob';

function sanitizeCategory(category) {
  const value = String(category || 'general').toLowerCase();
  const sanitized = value.replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized || 'general';
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function extFromMime(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };

  if (map[mime]) return map[mime];
  const fallback = mime.split('/')[1] || 'bin';
  return `.${fallback.replace(/[^a-z0-9]/gi, '')}`;
}

export async function storeMediaUpload({ category, originalDataUrl, previewDataUrl }) {
  const parsedOriginal = parseDataUrl(originalDataUrl);
  if (!parsedOriginal) throw new Error('Invalid uploaded media');

  const parsedPreview = previewDataUrl ? parseDataUrl(previewDataUrl) : null;
  const safeCategory = sanitizeCategory(category);

  const fileBase = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const originalExt = extFromMime(parsedOriginal.mime);
  const originalFileName = `${fileBase}${originalExt}`;

  let thumbFileName = originalFileName;
  const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const isVercel = Boolean(process.env.VERCEL);

  if (useBlob) {
    const baseKey = `uploads/${safeCategory}`;
    const originalKey = `${baseKey}/original/${originalFileName}`;
    const originalResult = await put(originalKey, parsedOriginal.buffer, {
      access: 'public',
      contentType: parsedOriginal.mime,
    });

    let thumbUrl = originalResult.url;
    if (parsedPreview) {
      thumbFileName = `${fileBase}${extFromMime(parsedPreview.mime)}`;
      const thumbKey = `${baseKey}/thumbs/${thumbFileName}`;
      const thumbResult = await put(thumbKey, parsedPreview.buffer, {
        access: 'public',
        contentType: parsedPreview.mime,
      });
      thumbUrl = thumbResult.url;
    }

    return {
      url: originalResult.url,
      thumb_url: thumbUrl,
    };
  }

  if (isVercel) {
    throw new Error('Upload storage not configured. Set BLOB_READ_WRITE_TOKEN for Vercel Blob storage.');
  }

  const basePublicDir = path.join(process.cwd(), 'public', 'uploads', safeCategory);
  const originalDir = path.join(basePublicDir, 'original');
  const thumbsDir = path.join(basePublicDir, 'thumbs');

  fs.mkdirSync(originalDir, { recursive: true });
  fs.mkdirSync(thumbsDir, { recursive: true });

  const originalPath = path.join(originalDir, originalFileName);
  fs.writeFileSync(originalPath, parsedOriginal.buffer);

  if (parsedPreview) {
    thumbFileName = `${fileBase}${extFromMime(parsedPreview.mime)}`;
    const thumbPath = path.join(thumbsDir, thumbFileName);
    fs.writeFileSync(thumbPath, parsedPreview.buffer);
  }

  return {
    url: `/uploads/${safeCategory}/original/${originalFileName}`,
    thumb_url: `/uploads/${safeCategory}/thumbs/${thumbFileName}`,
  };
}
