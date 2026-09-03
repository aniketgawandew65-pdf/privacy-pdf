import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isChunkError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    const isChunk =
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.name === 'ChunkLoadError';

    return {
      hasError: true,
      error,
      isChunkError: Boolean(isChunk),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in tool component:', error, errorInfo);

    // Auto-reload once if a new build invalidated the old chunk hash
    const isChunk =
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.name === 'ChunkLoadError';

    if (isChunk) {
      const storageKey = 'last_chunk_reload';
      const lastReload = sessionStorage.getItem(storageKey);
      const now = Date.now();

      // Only auto-reload if we haven't reloaded in the last 10 seconds
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem(storageKey, now.toString());
        window.location.reload();
      }
    }
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, isChunkError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-zinc-900/80 border border-emerald-500/30 text-center shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
              <Sparkles className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-semibold text-white">Application Updated</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                A newer version of 1into1 PDF is available. Refresh to load the latest local modules.
              </p>
            </div>

            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Update Now
            </button>
          </div>
        );
      }

      return (
        <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-zinc-900/80 border border-red-500/30 text-center shadow-xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">Something went wrong</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              {this.props.fallbackMessage ||
                'Processing halted. The file may be corrupt, password-restricted, or exceeded available browser memory.'}
            </p>
          </div>

          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Tool
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}