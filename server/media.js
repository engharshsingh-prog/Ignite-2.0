import db from './_db.js';
import { getAdminFromRequest, requireAdmin } from './_auth.js';
import { storeMediaUpload } from './_media-storage.js';
import { writeActivity } from './_activity.js';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']);

function extractDriveFileId(link) {
  const value = String(link || '').trim();
  if (!value) return null;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
    /\/uc\?(?:[^#\s]*&)?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractDriveFolderId(link) {
  const value = String(link || '').trim();
  if (!value) return null;
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

function inferDriveMediaType(name, fallback = 'image') {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return fallback;
}

function driveMediaUrls(fileId) {
  return {
    url: `https://drive.google.com/uc?export=download&id=${fileId}`,
    thumb_url: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
  };
}

async function resolvePublicDriveFolderMedia(folderId, fallbackType) {
  const response = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#grid`, {
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Unable to read Drive folder (HTTP ${response.status})`);
  }

  const html = await response.text();
  const byId = new Map();

  const anchorRegex = /href="\/file\/d\/([a-zA-Z0-9_-]+)\/view[^"]*"[^>]*>([^<]*)</g;
  let match = anchorRegex.exec(html);
  while (match) {
    const id = match[1];
    const name = (match[2] || '').trim();
    if (!byId.has(id)) byId.set(id, { id, name, type: inferDriveMediaType(name, fallbackType) });
    match = anchorRegex.exec(html);
  }

  if (byId.size === 0) {
    const fallbackRegex = /\/file\/d\/([a-zA-Z0-9_-]+)\/view/g;
    let fallback = fallbackRegex.exec(html);
    while (fallback) {
      const id = fallback[1];
      if (!byId.has(id)) byId.set(id, { id, name: '', type: fallbackType });
      fallback = fallbackRegex.exec(html);
    }
  }

  return Array.from(byId.values());
}

async function insertMediaRecord({ mediaUrl, thumbUrl, caption, type, category, status, uploadedBy }) {
  const result = await db
    .prepare('INSERT INTO media (url, thumb_url, caption, type, category, status, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(mediaUrl, thumbUrl || mediaUrl, caption || '', type, category, status, uploadedBy);

  const row = await db.prepare('SELECT * FROM media WHERE id = ?').get(result.lastInsertRowid);
  await writeActivity({
    entity_type: 'media',
    entity_id: row.id,
    action: uploadedBy === 'public' ? 'media_submitted_public' : 'media_added_by_admin',
    actor_email: uploadedBy,
    details: {
      type: row.type,
      category: row.category,
      status: row.status,
    },
  });
  return row;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const admin = await getAdminFromRequest(req);
      const { category, status } = req.query;
      const params = [];
      let where = '1=1';

      if (category && category !== 'all') {
        where += ' AND category = ?';
        params.push(category);
      }

      if (admin) {
        if (status && status !== 'all') {
          where += ' AND status = ?';
          params.push(status);
        }
      } else {
        where += " AND status = 'approved'";
      }

      const rows = await db.prepare(`SELECT * FROM media WHERE ${where} ORDER BY uploaded_at DESC`).all(...params);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const admin = await getAdminFromRequest(req);
      const {
        url,
        thumb_url,
        caption,
        type,
        category,
        file_data_url,
        preview_data_url,
        drive_link,
        drive_links,
      } = req.body || {};

      if (!type || !category) {
        return res.status(400).json({ error: 'Type and category are required' });
      }

      const driveInputLinks = Array.isArray(drive_links)
        ? drive_links.map((item) => String(item || '').trim()).filter(Boolean)
        : drive_link
          ? [String(drive_link).trim()]
          : [];

      if (driveInputLinks.length > 0) {
        if (!admin) return res.status(403).json({ error: 'Admin access required for Drive imports' });

        const imported = [];
        let totalResolved = 0;
        const failedLinks = [];

        for (const link of driveInputLinks) {
          try {
            const folderId = extractDriveFolderId(link);
            const fileId = extractDriveFileId(link);
            let entries = [];

            if (folderId) {
              entries = await resolvePublicDriveFolderMedia(folderId, type);
            } else if (fileId) {
              entries = [{ id: fileId, type, name: '' }];
            } else {
              failedLinks.push({ link, error: 'Unsupported Google Drive link format' });
              continue;
            }

            const mediaEntries = entries.filter((entry) => entry.type === 'image' || entry.type === 'video');
            totalResolved += mediaEntries.length;

            for (const entry of mediaEntries) {
              const urls = driveMediaUrls(entry.id);
              const row = await insertMediaRecord({
                mediaUrl: urls.url,
                thumbUrl: urls.thumb_url,
                caption: caption || entry.name || '',
                type: entry.type,
                category,
                status: 'approved',
                uploadedBy: admin.email,
              });
              imported.push(row);
            }
          } catch (error) {
            failedLinks.push({ link, error: error?.message || 'Failed to import link' });
          }
        }

        return res.status(201).json({
          ok: true,
          imported: imported.length,
          resolved: totalResolved,
          failed_links: failedLinks,
          rows: imported,
        });
      }

      let mediaUrl = String(url || '').trim();
      let thumbUrl = '';

      if (file_data_url) {
        const stored = await storeMediaUpload({
          category,
          originalDataUrl: file_data_url,
          previewDataUrl: preview_data_url || file_data_url,
        });
        mediaUrl = stored.url;
        thumbUrl = stored.thumb_url;
      }

      if (!mediaUrl) {
        return res.status(400).json({ error: 'URL or uploaded file is required' });
      }

      const status = admin ? 'approved' : 'pending';
      const uploadedBy = admin ? admin.email : 'public';
      const mediaThumb = String(thumb_url || '').trim();

      const row = await insertMediaRecord({
        mediaUrl,
        thumbUrl: thumbUrl || mediaThumb,
        caption,
        type,
        category,
        status,
        uploadedBy,
      });

      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const { id, status, category } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Media ID required' });
      if (!ALLOWED_STATUSES.has(String(status))) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const existing = await db.prepare('SELECT * FROM media WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Media not found' });

      const nextCategory = String(category || existing.category).trim() || existing.category;
      await db.prepare('UPDATE media SET status = ?, category = ? WHERE id = ?').run(status, nextCategory, id);
      const updated = await db.prepare('SELECT * FROM media WHERE id = ?').get(id);

      await writeActivity({
        entity_type: 'media',
        entity_id: updated.id,
        action: status === 'approved' ? 'media_approved' : status === 'rejected' ? 'media_rejected' : 'media_marked_pending',
        actor_email: admin.email,
        details: {
          previous_status: existing.status,
          new_status: updated.status,
          previous_category: existing.category,
          category: updated.category,
          type: updated.type,
        },
      });

      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Media ID required' });

      const existing = await db.prepare('SELECT * FROM media WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Media not found' });

      await db.prepare('DELETE FROM media WHERE id = ?').run(id);

      await writeActivity({
        entity_type: 'media',
        entity_id: Number(id),
        action: 'media_deleted',
        actor_email: admin.email,
        details: {
          deleted_record: {
            id: existing.id,
            category: existing.category,
            type: existing.type,
            status: existing.status,
          },
        },
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Media API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

