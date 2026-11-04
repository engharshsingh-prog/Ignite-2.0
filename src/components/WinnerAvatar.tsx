import { useState } from 'react';
import { normalizeImageUrl } from '../lib/imageUrl';

interface WinnerAvatarProps {
  src?: string | null;
  name: string;
  className?: string;
  fallbackClassName?: string;
  textSize?: string;
}

export default function WinnerAvatar({
  src,
  name,
  className = 'w-12 h-12 rounded-full object-cover',
  fallbackClassName = 'w-12 h-12 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#718044] flex items-center justify-center font-bold text-white',
  textSize = 'text-base',
}: WinnerAvatarProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const normalizedSrc = normalizeImageUrl(src);

  if (!normalizedSrc || loadFailed) {
    return (
      <div className={fallbackClassName}>
        <span className={textSize}>{name ? name.charAt(0).toUpperCase() : '?'}</span>
      </div>
    );
  }

  return (
    <img
      src={normalizedSrc}
      alt={name}
      className={className}
      onError={() => setLoadFailed(true)}
      loading="lazy"
    />
  );
}

