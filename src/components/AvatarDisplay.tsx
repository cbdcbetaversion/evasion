import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { peekResolvedMediaUrl, resolveMediaUrl } from '../utils/mediaStore';

interface AvatarDisplayProps {
  avatar?: string | null;
  alt?: string;
  className?: string;
}

export function isImageAvatar(avatar?: string | null): boolean {
  if (typeof avatar !== 'string') return false;
  const trimmed = avatar.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/api/media/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('idb://')
  );
}

export const AvatarDisplay: React.FC<AvatarDisplayProps> = ({
  avatar,
  alt = 'Avatar',
  className = '',
}) => {
  const safeAvatar = typeof avatar === 'string' ? avatar.trim() : '';
  const [imgFailed, setImgFailed] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>(() =>
    safeAvatar
      ? peekResolvedMediaUrl(safeAvatar) || (safeAvatar.startsWith('idb://') ? '' : safeAvatar)
      : ''
  );

  useEffect(() => {
    setImgFailed(false);
    if (!safeAvatar) {
      setResolvedSrc('');
      return;
    }
    const sync = peekResolvedMediaUrl(safeAvatar);
    if (sync) {
      setResolvedSrc(sync);
      return;
    }
    if (safeAvatar.startsWith('idb://')) {
      let cancelled = false;
      resolveMediaUrl(safeAvatar)
        .then((url) => {
          if (!cancelled) {
            if (url) setResolvedSrc(url);
            else setImgFailed(true);
          }
        })
        .catch(() => {
          if (!cancelled) setImgFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }
    setResolvedSrc(safeAvatar);
  }, [safeAvatar]);

  if (safeAvatar && isImageAvatar(safeAvatar) && !imgFailed && resolvedSrc) {
    return (
      <img
        src={resolvedSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`w-full h-full object-cover rounded-[inherit] ${className}`}
      />
    );
  }

  if (safeAvatar && !isImageAvatar(safeAvatar) && !safeAvatar.includes('/') && safeAvatar.length <= 16) {
    return <span className={`leading-none select-none ${className}`}>{safeAvatar}</span>;
  }

  const cleanAlt = typeof alt === 'string' ? alt.trim() : '';
  const initial =
    cleanAlt && cleanAlt !== 'Avatar' && /^[a-zA-Z0-9À-ÿ]/.test(cleanAlt)
      ? cleanAlt.charAt(0).toUpperCase()
      : '';

  if (initial) {
    return (
      <span
        aria-label={cleanAlt}
        className={`w-full h-full flex items-center justify-center font-black text-zinc-300 select-none text-[0.75em] ${className}`}
      >
        {initial}
      </span>
    );
  }

  return (
    <span className={`w-full h-full flex items-center justify-center text-zinc-400 select-none ${className}`}>
      <User className="w-[52%] h-[52%]" />
    </span>
  );
};

