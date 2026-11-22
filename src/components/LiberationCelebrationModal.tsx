import React from 'react';
import { Unlock, Sparkles, Key, Share2, CheckCircle2 } from 'lucide-react';
import { ConfessionPost } from '../types';

interface LiberationCelebrationModalProps {
  post: ConfessionPost | null;
  onClose: () => void;
  onOpenStory: (post: ConfessionPost) => void;
}

export const LiberationCelebrationModal: React.FC<LiberationCelebrationModalProps> = ({
  post,
  onClose,
  onOpenStory,
}) => {
  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm sm:max-w-md bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 border-2 border-emerald-500/80 rounded-3xl p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(16,185,129,0.35)] overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Animated unlocked icon */}
        <div className="relative w-20 h-20 mx-auto mb-5 rounded-3xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.5)] animate-bounce">
          <Unlock className="w-10 h-10 stroke-[2.2]" />
        </div>

        <div className="space-y-2 mb-6">
          <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-bold">
            Les 5 clés ont été rassemblées !
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase glow-text-emerald">
            <span className="text-[#ef4444] animate-neon-flicker inline-block mr-[1px]">É</span>VASION RÉUSSIE
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300">
            <strong className="text-emerald-300 font-mono">{post.authorMatricule}</strong> a brisé les barreaux de sa cellule mentale grâce à la solidarité du collectif !
          </p>
        </div>

        {/* Confession quote preview */}
        <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-300 italic mb-6 line-clamp-3">
          « {post.content} »
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <button
            onClick={() => {
              onClose();
              onOpenStory(post);
            }}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all active:scale-95"
          >
            <Share2 className="w-4 h-4" />
            <span>Partager l'Évasion en Story</span>
          </button>

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
          >
            Continuer à libérer les autres
          </button>
        </div>
      </div>
    </div>
  );
};
