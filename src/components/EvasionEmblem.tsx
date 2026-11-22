import React, { useId } from 'react';

interface EvasionEmblemProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  animatedRing?: boolean;
  className?: string;
}

const SIZE_MAP: Record<NonNullable<EvasionEmblemProps['size']>, string> = {
  xs: 'w-7 h-7',
  sm: 'w-10 h-10',
  md: 'w-28 h-28 sm:w-32 sm:h-32',
  lg: 'w-44 h-44 sm:w-52 sm:h-52',
};

export const EvasionEmblem: React.FC<EvasionEmblemProps> = ({
  size = 'md',
  animatedRing = false,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `evasionRing_${uid}`;
  const glowId = `evasionGlow_${uid}`;

  return (
    <div
      className={`relative rounded-full bg-[#0b0808] flex items-center justify-center shrink-0 select-none ${
        SIZE_MAP[size]
      } ${
        size === 'lg' || size === 'md'
          ? 'shadow-[0_0_55px_rgba(239,68,68,0.28),0_0_24px_rgba(249,115,22,0.16)]'
          : 'shadow-[0_0_14px_rgba(239,68,68,0.3)]'
      } ${className}`}
    >
      <svg
        viewBox="0 0 160 160"
        className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="55%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <circle
          cx="80"
          cy="80"
          r="73"
          fill="#0c0909"
          stroke="rgba(239,68,68,0.16)"
          strokeWidth={size === 'xs' || size === 'sm' ? '9' : '6'}
        />
        <circle
          cx="80"
          cy="80"
          r="73"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={size === 'xs' || size === 'sm' ? '9' : '6'}
          strokeLinecap="round"
          className={animatedRing ? 'animate-splash-ring' : undefined}
          style={{ filter: 'drop-shadow(0 0 8px rgba(249,115,22,0.55))' }}
        />
      </svg>

      <svg
        viewBox="0 0 512 512"
        className={`relative z-10 w-[64%] h-[64%] pointer-events-none ${
          size === 'lg' || size === 'md' ? 'animate-neon-flicker' : ''
        }`}
        aria-hidden="true"
      >
        <defs>
          <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${glowId})`}>
          <polygon points="256,82 332,82 280,148 220,148" fill="#ef4444" />
          <path
            d="M 148 172 H 364 V 226 H 234 V 262 H 350 V 314 H 234 V 352 H 364 V 408 H 148 Z"
            fill="#ef4444"
          />
        </g>
      </svg>
    </div>
  );
};
