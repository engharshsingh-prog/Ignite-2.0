export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export async function generateImagePreviewDataUrl(file: File, maxSize = 960, quality = 0.72): Promise<string> {
  const source = await readFileAsDataUrl(file);
  const img = await loadImage(source);
  const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create canvas context');

  context.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function generateVideoPosterDataUrl(file: File, width = 640, quality = 0.72): Promise<string> {
  const videoUrl = URL.createObjectURL(file);

  try {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Unable to read video')), { once: true });
    });

    if (video.duration && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(1, Math.max(0, video.duration / 3));
      await new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
        setTimeout(() => resolve(), 250);
      });
    }

    const scale = width / Math.max(video.videoWidth || width, 1);
    const canvasWidth = Math.max(1, Math.round((video.videoWidth || width) * scale));
    const canvasHeight = Math.max(1, Math.round((video.videoHeight || width * 0.5625) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create canvas context');

    context.drawImage(video, 0, 0, canvasWidth, canvasHeight);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}
