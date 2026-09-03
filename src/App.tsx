import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { TrustBadge } from './components/TrustBadge';
import { Compressor } from './components/Compressor';
import { Merger } from './components/Merger';
import { Splitter } from './components/Splitter';
import { ImageToPdf } from './components/ImageToPdf';
import { RotatePdf } from './components/RotatePdf';
import { PdfToImages } from './components/PdfToImages';
import { RemovePages } from './components/RemovePages';
import { Watermark } from './components/Watermark';
import { PageNumbers } from './components/PageNumbers';
import { PdfToText } from './components/PdfToText';
import { EditMetadata } from './components/EditMetadata';
import { SignPdf } from './components/SignPdf';
import { ProtectPdf } from './components/ProtectPdf';
import { UnlockPdf } from './components/UnlockPdf';
import { MonetizationCard } from './components/MonetizationCard';
import { ProModal } from './components/ProModal';
import { getLicenseStatus } from './utils/license';
import { TOOLS_METADATA } from './seoConfig';
import {
  ShieldCheck,
  Sliders,
  Files,
  Scissors,
  Image as ImageIcon,
  RotateCw,
  Download,
  FileImage,
  Trash2,
  Stamp,
  Hash,
  AlignLeft,
  Tag,
  PenTool,
  Lock,
  Unlock,
  Sparkles,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function App() {
  const location = useLocation();
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);

  // Synchronize Pro status on license changes
  useEffect(() => {
    const handleStorage = () => setIsPro(getLicenseStatus().isPro);
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Dynamic SEO title & description updates
  useEffect(() => {
    const meta = TOOLS_METADATA[location.pathname] || TOOLS_METADATA['/'];
    document.title = meta.title;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      descMeta.setAttribute('content', meta.description);
    }
  }, [location.pathname]);

  // PWA install handler
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const activeFile = sharedFiles[0] || null;

  const handleSingleFileChange = (file: File | null) => {
    if (!file) {
      setSharedFiles([]);
    } else {
      setSharedFiles([file]);
    }
  };

  const currentMeta = TOOLS_METADATA[location.pathname] || TOOLS_METADATA['/'];

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
      isActive ? 'bg-zinc-800 text-emerald-400 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
    }`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-between p-6 selection:bg-emerald-500 selection:text-black">
      {/* Header */}
      <header className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 py-4 border-b border-zinc-800/80">
        <NavLink to="/" className="flex items-center gap-3 text-left">
          <img
            src="/logo.png"
            alt="1into1 Logo"
            width="40"
            height="40"
            className="w-10 h-10 rounded-xl object-contain bg-white p-1 border border-zinc-800 shrink-0"
          />
          <div>
            <h1 className="text-lg font-bold tracking-tight">1into1 PDF</h1>
            <p className="text-xs text-zinc-400">100% In-Browser Privacy Suite</p>
          </div>
        </NavLink>

        <div className="flex items-center gap-2.5">
          {/* Pro Status / Upgrade Trigger */}
          <button
            onClick={() => setIsProModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              isPro
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-zinc-900 hover:bg-zinc-800 text-amber-300 border-amber-500/30 shadow-sm'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isPro ? 'Pro Active' : 'Upgrade Pro'}
          </button>

          {installPrompt && (
            <button
              onClick={handleInstallApp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition-all shadow-md shadow-emerald-500/20"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              Install App
            </button>
          )}

          <TrustBadge />
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-4xl my-auto text-center py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 mb-6">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Zero uploads • Zero tracking • Works in Airplane Mode
        </div>

        <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
          {currentMeta.heading.replace('Zero Server Cost', '')}
          {currentMeta.heading.includes('Zero Server Cost') ? (
            <span className="text-emerald-400">Zero Server Cost</span>
          ) : null}
        </h2>
        <p className="text-zinc-400 text-base max-w-lg mx-auto mb-6">
          {currentMeta.subheading}
        </p>

        {/* SEO Navigation Bar */}
        <div className="inline-flex flex-wrap justify-center gap-1 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800 mb-8 max-w-3xl">
          <NavLink to="/compress-pdf" className={navClass}>
            <Sliders className="w-4 h-4" />
            Compress
          </NavLink>
          <NavLink to="/merge-pdf" className={navClass}>
            <Files className="w-4 h-4" />
            Merge
          </NavLink>
          <NavLink to="/split-pdf" className={navClass}>
            <Scissors className="w-4 h-4" />
            Split
          </NavLink>
          <NavLink to="/image-to-pdf" className={navClass}>
            <ImageIcon className="w-4 h-4" />
            Image to PDF
          </NavLink>
          <NavLink to="/pdf-to-jpg" className={navClass}>
            <FileImage className="w-4 h-4" />
            PDF to JPG
          </NavLink>
          <NavLink to="/remove-pages" className={navClass}>
            <Trash2 className="w-4 h-4" />
            Remove Pages
          </NavLink>
          <NavLink to="/watermark-pdf" className={navClass}>
            <Stamp className="w-4 h-4" />
            Watermark
          </NavLink>
          <NavLink to="/page-numbers" className={navClass}>
            <Hash className="w-4 h-4" />
            Page Numbers
          </NavLink>
          <NavLink to="/extract-text" className={navClass}>
            <AlignLeft className="w-4 h-4" />
            Extract Text
          </NavLink>
          <NavLink to="/sign-pdf" className={navClass}>
            <PenTool className="w-4 h-4" />
            Sign
          </NavLink>
          <NavLink to="/protect-pdf" className={navClass}>
            <Lock className="w-4 h-4" />
            Protect
          </NavLink>
          <NavLink to="/unlock-pdf" className={navClass}>
            <Unlock className="w-4 h-4" />
            Unlock
          </NavLink>
          <NavLink to="/edit-metadata" className={navClass}>
            <Tag className="w-4 h-4" />
            Metadata
          </NavLink>
          <NavLink to="/rotate-pdf" className={navClass}>
            <RotateCw className="w-4 h-4" />
            Rotate
          </NavLink>
        </div>

        {/* Route Definitions */}
        <Routes>
          <Route path="/" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/compress-pdf" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/merge-pdf" element={<Merger files={sharedFiles} onFilesChange={setSharedFiles} />} />
          <Route path="/split-pdf" element={<Splitter file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/image-to-pdf" element={<ImageToPdf />} />
          <Route path="/pdf-to-jpg" element={<PdfToImages file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/remove-pages" element={<RemovePages file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/watermark-pdf" element={<Watermark file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/page-numbers" element={<PageNumbers file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/extract-text" element={<PdfToText file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/sign-pdf" element={<SignPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/protect-pdf" element={<ProtectPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/unlock-pdf" element={<UnlockPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/edit-metadata" element={<EditMetadata file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="/rotate-pdf" element={<RotatePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <MonetizationCard />
      </main>

      <footer className="w-full max-w-5xl text-center py-4 border-t border-zinc-900 text-xs text-zinc-600">
        All calculations run locally via WebAssembly and Web Workers.
      </footer>

      {/* Pro Modal */}
      <ProModal isOpen={isProModalOpen} onClose={() => setIsProModalOpen(false)} />
    </div>
  );
}