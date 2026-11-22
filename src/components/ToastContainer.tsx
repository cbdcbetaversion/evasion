import React from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toast, hideToast } = useApp();

  if (!toast) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] sm:w-auto animate-bounce-in pointer-events-auto">
      <div className="rounded-2xl bg-zinc-900/95 border border-zinc-700/80 shadow-[0_10px_35px_rgba(0,0,0,0.8)] backdrop-blur-md px-4 py-3 flex items-center gap-3 text-left">
        {toast.icon === 'EVASION_LOGO' ? (
          <img
            src="/pwa-192x192.png"
            alt="É"
            className="w-8 h-8 rounded-lg shrink-0 select-none border border-red-500/30 shadow-sm"
          />
        ) : (
          toast.icon && <span className="text-xl shrink-0 select-none">{toast.icon}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white tracking-wide">
            {toast.title}
          </div>
          {toast.message && (
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
              {toast.message}
            </p>
          )}
        </div>

        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              hideToast();
            }}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors shadow-sm cursor-pointer"
          >
            {toast.action.label}
          </button>
        )}

        <button
          type="button"
          onClick={hideToast}
          className="w-6 h-6 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
