import React, { useState, useEffect } from 'react';
import { X, BookOpen, CheckCircle, Clock, ChevronRight, ChevronLeft, Sparkles, Share2 } from 'lucide-react';
import { KitItem } from '../types';
import { useApp } from '../context/AppContext';

interface KitReaderModalProps {
  kit: KitItem | null;
  onClose: () => void;
}

export const KitReaderModal: React.FC<KitReaderModalProps> = ({ kit, onClose }) => {
  const { showToast, theme } = useApp();
  const isLight = theme === 'light';
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [completedChapters, setCompletedChapters] = useState<number[]>([]);

  useEffect(() => {
    setActiveChapterIndex(0);
    setCompletedChapters([]);
  }, [kit?.id]);

  if (!kit) return null;

  const currentChapter = kit.chapters[activeChapterIndex] || kit.chapters[0];
  const totalChapters = kit.chapters.length;
  const isLast = activeChapterIndex === totalChapters - 1;
  const isFirst = activeChapterIndex === 0;

  const toggleChapterDone = (idx: number) => {
    setCompletedChapters((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleShareTakeaway = () => {
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(`💡 Extrait du Kit ÉVASION "${kit.title}":\n\n"${currentChapter.keyTakeaway}"`)
        .then(() => {
          showToast({
            title: 'Citation copiée ! 📋',
            message: 'Partage-la avec un camarade qui a besoin de clarté.',
            type: 'info',
          });
        })
        .catch(() => {});
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md animate-fade-in ${
      isLight ? 'bg-slate-900/50' : 'bg-black/90'
    }`}>
      <div className={`relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border overflow-hidden ${
        isLight
          ? 'bg-white border-zinc-200 shadow-2xl'
          : 'bg-zinc-950 border-zinc-800 shadow-[0_0_50px_rgba(0,0,0,0.8)]'
      }`}>
        {/* Top Header */}
        <div className={`p-4 sm:p-5 border-b flex items-start justify-between gap-3 ${
          isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800/80 bg-zinc-900/60'
        }`}>
          <div className="flex items-center gap-3">
            <span className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-2xl shrink-0 shadow-inner ${
              isLight ? 'bg-white border-zinc-200' : 'bg-zinc-800/80 border-zinc-700/60'
            }`}>
              {kit.icon}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isLight
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                }`}>
                  {kit.category}
                </span>
                <span className={`text-[11px] flex items-center gap-1 font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  <Clock className="w-3 h-3" />
                  {kit.readingTime}
                </span>
              </div>
              <h2 className={`text-base sm:text-lg font-bold mt-0.5 leading-snug ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                {kit.title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
              isLight
                ? 'bg-zinc-200/80 hover:bg-zinc-300 text-zinc-600 hover:text-zinc-900'
                : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chapters navigation slider / tabs */}
        <div className={`px-4 py-2.5 border-b flex items-center gap-2 overflow-x-auto no-scrollbar ${
          isLight ? 'bg-zinc-50/70 border-zinc-200' : 'bg-zinc-900/30 border-zinc-800/60'
        }`}>
          {kit.chapters.map((ch, idx) => {
            const isActive = idx === activeChapterIndex;
            const isDone = completedChapters.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => setActiveChapterIndex(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? isLight
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold'
                    : isDone
                    ? isLight
                      ? 'bg-zinc-200 text-zinc-800'
                      : 'bg-zinc-800/90 text-zinc-300'
                    : isLight
                    ? 'bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200'
                    : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 border border-zinc-800'
                }`}
              >
                {isDone && <CheckCircle className={`w-3 h-3 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />}
                <span>{`Étape ${idx + 1}`}</span>
              </button>
            );
          })}
        </div>

        {/* Chapter Content Body */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
          <div>
            <span className="text-xs font-mono text-zinc-500">
              Chapitre {activeChapterIndex + 1} sur {totalChapters}
            </span>
            <h3 className={`text-lg sm:text-xl font-bold mt-1 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              {currentChapter.title}
            </h3>
          </div>

          {/* Actionable points */}
          <div className="space-y-3">
            {currentChapter.points.map((point, pIdx) => (
              <div
                key={pIdx}
                className={`p-3.5 rounded-2xl border flex items-start gap-3 transition-colors ${
                  isLight
                    ? 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
                    : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700/80'
                }`}
              >
                <span className={`w-6 h-6 rounded-lg font-mono text-xs flex items-center justify-center font-bold shrink-0 mt-0.5 ${
                  isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-800 text-emerald-400'
                }`}>
                  {pIdx + 1}
                </span>
                <p className={`text-xs sm:text-sm leading-relaxed font-normal ${isLight ? 'text-zinc-700' : 'text-zinc-200'}`}>
                  {point}
                </p>
              </div>
            ))}
          </div>

          {/* Key Takeaway box */}
          <div className={`p-4 rounded-2xl border relative overflow-hidden ${
            isLight
              ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200'
              : 'bg-gradient-to-br from-emerald-950/40 to-zinc-900 border-emerald-800/50'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className={`text-xs font-mono font-bold flex items-center gap-1.5 ${
                isLight ? 'text-emerald-700' : 'text-emerald-400'
              }`}>
                <Sparkles className="w-3.5 h-3.5" />
                <span>À Retenir Absolument</span>
              </span>
              <button
                onClick={handleShareTakeaway}
                className={`text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                  isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Share2 className="w-3 h-3" />
                <span>Copier</span>
              </button>
            </div>
            <p className={`text-xs sm:text-sm font-medium italic leading-relaxed ${
              isLight ? 'text-emerald-900' : 'text-emerald-100'
            }`}>
              « {currentChapter.keyTakeaway} »
            </p>
          </div>
        </div>

        {/* Bottom Pagination Bar */}
        <div className={`p-4 border-t flex items-center justify-between gap-3 ${
          isLight ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800/80 bg-zinc-900/60'
        }`}>
          <button
            onClick={() => setActiveChapterIndex((prev) => Math.max(0, prev - 1))}
            disabled={isFirst}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isFirst
                ? 'opacity-30 cursor-not-allowed text-zinc-500'
                : isLight
                ? 'bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-800'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Précédent</span>
          </button>

          <button
            onClick={() => toggleChapterDone(activeChapterIndex)}
            className={`px-3 py-2 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
              completedChapters.includes(activeChapterIndex)
                ? isLight
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : isLight
                ? 'bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            <CheckCircle className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
            <span>
              {completedChapters.includes(activeChapterIndex) ? 'Étape validée' : 'Marquer comme lu'}
            </span>
          </button>

          <button
            onClick={() => {
              if (isLast) {
                showToast({
                  title: 'Guide terminé avec succès ! 🎓',
                  message: 'Mets ces conseils en pratique dès aujourd\'hui.',
                  type: 'success',
                });
                onClose();
              } else {
                setActiveChapterIndex((prev) => Math.min(totalChapters - 1, prev + 1));
              }
            }}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer"
          >
            <span>{isLast ? 'Terminer' : 'Suivant'}</span>
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
