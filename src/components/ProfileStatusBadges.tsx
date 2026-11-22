import React from 'react';
import { BadgeCheck, Briefcase, User } from 'lucide-react';

interface ProfileStatusBadgesProps {
  isVerified?: boolean;
  profileType?: 'personal' | 'professional';
  compact?: boolean;
  showPersonalLabel?: boolean;
  className?: string;
}

export const ProfileStatusBadges: React.FC<ProfileStatusBadgesProps> = ({
  isVerified = false,
  profileType = 'personal',
  compact = false,
  showPersonalLabel = false,
  className = '',
}) => {
  const isPro = profileType === 'professional';
  const showPersonal = !isPro && showPersonalLabel;

  if (!isVerified && !isPro && !showPersonal) {
    return null;
  }

  return (
    <span className={`inline-flex items-center flex-wrap gap-1 align-middle ${className}`}>
      {isVerified && (
        <span
          title="Profil vérifié via Google"
          className={`inline-flex items-center gap-1 rounded-full font-black uppercase tracking-wider border border-sky-400/45 bg-sky-500/15 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.22)] ${
            compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
          }`}
        >
          <BadgeCheck className={compact ? 'w-3 h-3 text-sky-400 shrink-0' : 'w-3.5 h-3.5 text-sky-400 shrink-0'} />
          <span>Vérifié</span>
        </span>
      )}

      {isPro && (
        <span
          title="Compte Professionnel"
          className={`inline-flex items-center gap-1 rounded-full font-black uppercase tracking-wider border border-amber-400/45 bg-amber-500/15 text-amber-300 ${
            compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
          }`}
        >
          <Briefcase className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
          <span>{compact ? 'Pro' : 'Professionnel'}</span>
        </span>
      )}

      {showPersonal && (
        <span
          title="Compte Particulier"
          className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider border border-zinc-700/80 bg-zinc-800/80 text-zinc-300 ${
            compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
          }`}
        >
          <User className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
          <span>Particulier</span>
        </span>
      )}
    </span>
  );
};
