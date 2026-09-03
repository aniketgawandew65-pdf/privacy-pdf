import { useState } from 'react';
import { TrustBadge } from './components/TrustBadge';
import { Compressor } from './components/Compressor';
import { Merger } from './components/Merger';
import { Splitter } from './components/Splitter';
import { MonetizationCard } from './components/MonetizationCard';
import { ShieldCheck, Zap, Sliders, Files, Scissors } from 'lucide-react';

export default function App() {
  const [activeTool, setActiveTool] = useState<'compress' | 'merge' | 'split'>('compress');
  
  // Shared state: files stay loaded across tab changes
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);

  const activeFile = sharedFiles[0] || null;

  const handleSingleFileChange = (file: File | null) => {
    if (!file) {
      setSharedFiles([]);
    } else {
      setSharedFiles([file]);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-between p-6 selection:bg-emerald-500 selection:text-black">
      {/* Header */}
      <header className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 py-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">1into1 PDF</h1>
            <p className="text-xs text-zinc-400">100% In-Browser Privacy Suite</p>
          </div>
        </div>

        <TrustBadge />
      </header>

      {/* Main Container */}
      <main className="w-full max-w-3xl my-auto text-center py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 mb-6">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Zero uploads • Zero tracking • Works in Airplane Mode
        </div>

        <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
          PDF Tools with <span className="text-emerald-400">Zero Server Cost</span>
        </h2>
        <p className="text-zinc-400 text-base max-w-lg mx-auto mb-6">
          Your files never leave your computer. All operations run directly in your browser.
        </p>

        {/* Tool Navigation */}
        <div className="inline-flex p-1 rounded-xl bg-zinc-900/80 border border-zinc-800 mb-8">
          <button
            onClick={() => setActiveTool('compress')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTool === 'compress'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Compress
          </button>
          <button
            onClick={() => setActiveTool('merge')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTool === 'merge'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Files className="w-4 h-4" />
            Merge
          </button>
          <button
            onClick={() => setActiveTool('split')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTool === 'split'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Scissors className="w-4 h-4" />
            Split
          </button>
        </div>

        {/* Active Tool View */}
        {activeTool === 'compress' && (
          <Compressor file={activeFile} onFileChange={handleSingleFileChange} />
        )}
        {activeTool === 'merge' && (
          <Merger files={sharedFiles} onFilesChange={setSharedFiles} />
        )}
        {activeTool === 'split' && (
          <Splitter file={activeFile} onFileChange={handleSingleFileChange} />
        )}

        <MonetizationCard />
      </main>

      <footer className="w-full max-w-5xl text-center py-4 border-t border-zinc-900 text-xs text-zinc-600">
        All calculations run locally via WebAssembly and Web Workers.
      </footer>
    </div>
  );
}