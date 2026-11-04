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
