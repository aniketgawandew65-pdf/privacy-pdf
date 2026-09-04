import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { TrustBadge } from './components/TrustBadge';
import { ProModal } from './components/ProModal';
import { ErrorBoundary } from './components/ErrorBoundary';
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
  Camera,
  Loader2,
  LayoutGrid,
  EyeOff,
} from 'lucide-react';

// Code-split all tool components to minimize initial bundle size
const Compressor = lazy(() => import('./components/Compressor').then((m) => ({ default: m.Compressor })));
const Merger = lazy(() => import('./components/Merger').then((m) => ({ default: m.Merger })));
const Splitter = lazy(() => import('./components/Splitter').then((m) => ({ default: m.Splitter })));
const ImageToPdf = lazy(() => import('./components/ImageToPdf').then((m) => ({ default: m.ImageToPdf })));
const RotatePdf = lazy(() => import('./components/RotatePdf').then((m) => ({ default: m.RotatePdf })));
const PdfToImages = lazy(() => import('./components/PdfToImages').then((m) => ({ default: m.PdfToImages })));
const RemovePages = lazy(() => import('./components/RemovePages').then((m) => ({ default: m.RemovePages })));
const Watermark = lazy(() => import('./components/Watermark').then((m) => ({ default: m.Watermark })));
const PageNumbers = lazy(() => import('./components/PageNumbers').then((m) => ({ default: m.PageNumbers })));
const PdfToText = lazy(() => import('./components/PdfToText').then((m) => ({ default: m.PdfToText })));
const EditMetadata = lazy(() => import('./components/EditMetadata').then((m) => ({ default: m.EditMetadata })));
const SignPdf = lazy(() => import('./components/SignPdf').then((m) => ({ default: m.SignPdf })));
const ProtectPdf = lazy(() => import('./components/ProtectPdf').then((m) => ({ default: m.ProtectPdf })));
const UnlockPdf = lazy(() => import('./components/UnlockPdf').then((m) => ({ default: m.UnlockPdf })));
const HeicToJpg = lazy(() => import('./components/HeicToJpg').then((m) => ({ default: m.HeicToJpg })));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy })));
const Terms = lazy(() => import('./components/Terms').then((m) => ({ default: m.Terms })));
const NotFound = lazy(() => import('./components/NotFound').then((m) => ({ default: m.NotFound })));
const OrganizePdf = lazy(() => import('./components/OrganizePdf').then((m) => ({ default: m.OrganizePdf })));
const SanitizePdf = lazy(() => import('./components/SanitizePdf').then((m) => ({ default: m.SanitizePdf })));
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function ToolFallback() {
  return (
    <div className="w-full max-w-xl mx-auto h-64 flex flex-col items-center justify-center gap-3 rounded-2xl bg-zinc-900/40 border border-zinc-800">
      <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
      <span className="text-xs text-zinc-400">Loading module locally...</span>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);

  // Synchronize Pro status across tabs and upon same-tab visibility changes
  useEffect(() => {
    const handleSync = () => setIsPro(getLicenseStatus().isPro);
    window.addEventListener('storage', handleSync);
    document.addEventListener('visibilitychange', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, []);

  // Dynamic SEO title, description, and per-route canonical URL updates
  useEffect(() => {
    const meta = TOOLS_METADATA[location.pathname] || TOOLS_METADATA['/'];
    document.title = meta.title;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      descMeta.setAttribute('content', meta.description);
    }

    // Dynamic canonical tag management per route
    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    const cleanPath = location.pathname === '/' ? '' : location.pathname;
    canonicalLink.href = `https://www.1into1.com${cleanPath}`;
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
    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
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
            <p className="text-lg font-bold tracking-tight text-white">1into1 PDF</p>
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
          Zero uploads • Turn off Wi-Fi to test • 100% Private
        </div>

        {/* Primary Page H1 */}
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
          {currentMeta.heading.includes('Never Upload Your Files') ? (
            <>
              Free PDF Tools That{' '}
              <span className="text-emerald-400">Never Upload Your Files</span>
            </>
          ) : (
            currentMeta.heading
          )}
        </h1>

        <p className="text-zinc-400 text-base max-w-lg mx-auto mb-6">
          {currentMeta.subheading}
        </p>

        {/* Primary Semantic Navigation Bar */}
        <nav
          aria-label="PDF Tools"
          className="w-full inline-flex flex-nowrap sm:flex-wrap overflow-x-auto justify-start sm:justify-center gap-1 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800 mb-8 max-w-4xl scrollbar-none"
        >
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
          <NavLink to="/organize-pdf" className={navClass}>
            <LayoutGrid className="w-4 h-4" />
            Organize
          </NavLink>
          <NavLink to="/image-to-pdf" className={navClass}>
            <ImageIcon className="w-4 h-4" />
            Image to PDF
          </NavLink>
          <NavLink to="/pdf-to-jpg" className={navClass}>
            <FileImage className="w-4 h-4" />
            PDF to JPG
          </NavLink>
          <NavLink to="/heic-to-jpg" className={navClass}>
            <Camera className="w-4 h-4" />
            HEIC to JPG
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
          <NavLink to="/sanitize-pdf" className={navClass}>
          <EyeOff className="w-4 h-4" />
           Sanitize
          </NavLink>
          <NavLink to="/rotate-pdf" className={navClass}>
            <RotateCw className="w-4 h-4" />
            Rotate
          </NavLink>
        </nav>

        {/* Dynamic Tool Routing with Boundary & Suspense */}
        <ErrorBoundary>
          <Suspense fallback={<ToolFallback />}>
            <Routes>
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-pdf" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/merge-pdf" element={<Merger files={sharedFiles} onFilesChange={setSharedFiles} />} />
              <Route path="/split-pdf" element={<Splitter file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/organize-pdf" element={<OrganizePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/image-to-pdf" element={<ImageToPdf />} />
              <Route path="/pdf-to-jpg" element={<PdfToImages file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/heic-to-jpg" element={<HeicToJpg />} />
              <Route path="/remove-pages" element={<RemovePages file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/watermark-pdf" element={<Watermark file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/page-numbers" element={<PageNumbers file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/extract-text" element={<PdfToText file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/sign-pdf" element={<SignPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/protect-pdf" element={<ProtectPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/unlock-pdf" element={<UnlockPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/edit-metadata" element={<EditMetadata file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/rotate-pdf" element={<RotatePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/sanitize-pdf" element={<SanitizePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl py-6 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
        <div>
          <span>100% In-Browser. Powered by </span>
          <span className="text-zinc-400">pdf-lib</span> &{' '}
          <span className="text-zinc-400">Tesseract.js</span>
        </div>

        <div className="flex items-center gap-4">
          <NavLink to="/privacy" className="hover:text-zinc-300 transition">
            Privacy Policy
          </NavLink>
          <NavLink to="/terms" className="hover:text-zinc-300 transition">
            Terms of Service
          </NavLink>
        </div>
      </footer>

      {/* Pro Modal */}
      <ProModal isOpen={isProModalOpen} onClose={() => setIsProModalOpen(false)} />
    </div>
  );
}