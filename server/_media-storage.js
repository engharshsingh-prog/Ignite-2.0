import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { put } from '@vercel/blob';
import { supabase } from './_db.js';

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

  // Strategy 1: Vercel Blob (if token provided)
  if (useBlob) {
    try {
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
    } catch (blobErr) {
      console.warn('[media-storage] Vercel Blob upload failed, attempting next storage backend:', blobErr?.message || blobErr);
    }
  }

  // Strategy 2: Supabase Storage
  if (supabase?.storage) {
    try {
      const bucketName = safeCategory === 'payment-screenshots' ? 'payment-screenshots' : 'uploads';
      const originalPath = `${fileBase}${originalExt}`;

      const { data: origUpload, error: origErr } = await supabase.storage
        .from(bucketName)
        .upload(originalPath, parsedOriginal.buffer, {
          contentType: parsedOriginal.mime,
          upsert: true,
        });

      if (!origErr && origUpload) {
        const { data: origPub } = supabase.storage.from(bucketName).getPublicUrl(originalPath);
        let thumbUrl = origPub.publicUrl;

        if (parsedPreview) {
          thumbFileName = `${fileBase}-thumb${extFromMime(parsedPreview.mime)}`;
          const { data: thumbUpload, error: thumbErr } = await supabase.storage
            .from(bucketName)
            .upload(thumbFileName, parsedPreview.buffer, {
              contentType: parsedPreview.mime,
              upsert: true,
            });

          if (!thumbErr && thumbUpload) {
            const { data: thumbPub } = supabase.storage.from(bucketName).getPublicUrl(thumbFileName);
            thumbUrl = thumbPub.publicUrl;
          }
        }

        return {
          url: origPub.publicUrl,
          thumb_url: thumbUrl,
        };
      } else if (origErr) {
        console.warn('[media-storage] Supabase storage upload failed:', origErr?.message || origErr);
      }
    } catch (sbErr) {
      console.warn('[media-storage] Supabase storage exception:', sbErr?.message || sbErr);
    }
  }

  // Strategy 3: Local filesystem (for local development outside Vercel)
  if (!isVercel) {
    try {
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
    } catch (fsErr) {
      console.warn('[media-storage] Local filesystem write failed:', fsErr?.message || fsErr);
    }
  }

  // Strategy 4: High-res data URL fallback
  // Guarantees zero failures and never blocks participant payment submission on Vercel
  console.log('[media-storage] Using inline data URL fallback for media upload');
  return {
    url: originalDataUrl,
    thumb_url: previewDataUrl || originalDataUrl,
  };
}
