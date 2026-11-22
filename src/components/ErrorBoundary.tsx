import React from 'react';

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('ÉVASION ErrorBoundary intercepted error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] w-full bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#ff0050]/15 border border-[#ff0050]/40 flex items-center justify-center text-2xl">
            ⚠️
          </div>
          <div className="space-y-1 max-w-sm">
            <h2 className="text-base font-black text-white">Reconnexion nécessaire</h2>
            <p className="text-xs text-zinc-400">
              L’affichage vient d’être réinitialisé après le changement d’autorisation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-5 py-2.5 rounded-xl bg-[#ff0050] hover:bg-[#ff1a62] text-white text-xs font-bold cursor-pointer active:scale-95 transition-all"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
