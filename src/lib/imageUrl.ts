/**
 * Normalizes image URLs from Google Drive, Dropbox, etc. into direct embeddable image sources.
 */
export function normalizeImageUrl(rawUrl: string | null | undefined): string {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  // Google Drive patterns
  const drivePatterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
    /\/uc\?(?:[^#\s]*&)?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of drivePatterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }

  // Dropbox
  if (value.includes('dropbox.com')) {
    return value.replace(/[?&]dl=0/, '?raw=1');
  }

  return value;
}

/**
 * Returns video playback info, detecting Google Drive video preview iframes.
 */
export function getVideoEmbedInfo(rawUrl: string | null | undefined): { isDrive: boolean; embedUrl: string } {
  const value = String(rawUrl || '').trim();
  if (!value) return { isDrive: false, embedUrl: '' };

  const drivePatterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
    /\/uc\?(?:[^#\s]*&)?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of drivePatterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return { isDrive: true, embedUrl: `https://drive.google.com/file/d/${match[1]}/preview` };
    }
  }

  return { isDrive: false, embedUrl: value };
}
