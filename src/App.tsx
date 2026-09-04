import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { TrustBadge } from './components/TrustBadge';
import { ProModal } from './components/ProModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getLicenseStatus } from './utils/license';
import { TOOLS_METADATA } from './seoConfig';
import { NetworkAuditDrawer } from './components/NetworkAuditDrawer';
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
  SquareSlash,
  Crop,
  FileCheck2,
  Printer,
  Scaling,
  Columns2,
  FileDigit,
  Images,
  ScanText,
  GitCompare,
  Wrench,
  Moon,
  BookOpen,
  Bot,
  Table,
  FileCode,
} from 'lucide-react';

// Code-split all tool components to keep initial bundle tiny
const Compressor = lazy(() => import('./components/Compressor').then((m) => ({ default: m.Compressor })));
const Merger = lazy(() => import('./components/Merger').then((m) => ({ default: m.Merger })));
const Splitter = lazy(() => import('./components/Splitter').then((m) => ({ default: m.Splitter })));
const OrganizePdf = lazy(() => import('./components/OrganizePdf').then((m) => ({ default: m.OrganizePdf })));
const RotatePdf = lazy(() => import('./components/RotatePdf').then((m) => ({ default: m.RotatePdf })));
const CropPdf = lazy(() => import('./components/CropPdf').then((m) => ({ default: m.CropPdf })));
const RemovePages = lazy(() => import('./components/RemovePages').then((m) => ({ default: m.RemovePages })));
const ResizePdf = lazy(() => import('./components/ResizePdf').then((m) => ({ default: m.ResizePdf })));
const NUpPdf = lazy(() => import('./components/NUpPdf').then((m) => ({ default: m.NUpPdf })));
const BookletPdf = lazy(() => import('./components/BookletPdf').then((m) => ({ default: m.BookletPdf })));
const DeskewPdf = lazy(() => import('./components/DeskewPdf').then((m) => ({ default: m.DeskewPdf })));

const SanitizePdf = lazy(() => import('./components/SanitizePdf').then((m) => ({ default: m.SanitizePdf })));
const RedactPdf = lazy(() => import('./components/RedactPdf').then((m) => ({ default: m.RedactPdf })));
const ProtectPdf = lazy(() => import('./components/ProtectPdf').then((m) => ({ default: m.ProtectPdf })));
const UnlockPdf = lazy(() => import('./components/UnlockPdf').then((m) => ({ default: m.UnlockPdf })));
const SignPdf = lazy(() => import('./components/SignPdf').then((m) => ({ default: m.SignPdf })));
const Watermark = lazy(() => import('./components/Watermark').then((m) => ({ default: m.Watermark })));
const BatesNumbering = lazy(() => import('./components/BatesNumbering').then((m) => ({ default: m.BatesNumbering })));
const ComparePdf = lazy(() => import('./components/ComparePdf').then((m) => ({ default: m.ComparePdf })));
const RepairPdf = lazy(() => import('./components/RepairPdf').then((m) => ({ default: m.RepairPdf })));

const FillFormPdf = lazy(() => import('./components/FillFormPdf').then((m) => ({ default: m.FillFormPdf })));
const ImageToPdf = lazy(() => import('./components/ImageToPdf').then((m) => ({ default: m.ImageToPdf })));
const PdfToImages = lazy(() => import('./components/PdfToImages').then((m) => ({ default: m.PdfToImages })));
const HeicToJpg = lazy(() => import('./components/HeicToJpg').then((m) => ({ default: m.HeicToJpg })));
const ExtractImages = lazy(() => import('./components/ExtractImages').then((m) => ({ default: m.ExtractImages })));
const PdfToText = lazy(() => import('./components/PdfToText').then((m) => ({ default: m.PdfToText })));
const OcrPdf = lazy(() => import('./components/OcrPdf').then((m) => ({ default: m.OcrPdf })));
const GrayscalePdf = lazy(() => import('./components/GrayscalePdf').then((m) => ({ default: m.GrayscalePdf })));
const DarkModePdf = lazy(() => import('./components/DarkModePdf').then((m) => ({ default: m.DarkModePdf })));
const EditMetadata = lazy(() => import('./components/EditMetadata').then((m) => ({ default: m.EditMetadata })));
const PageNumbers = lazy(() => import('./components/PageNumbers').then((m) => ({ default: m.PageNumbers })));
const AiSummaryPdf = lazy(() => import('./components/AiSummaryPdf').then((m) => ({ default: m.AiSummaryPdf })));

const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy })));
const Terms = lazy(() => import('./components/Terms').then((m) => ({ default: m.Terms })));
const PdfToCsv = lazy(() => import('./components/PdfToCsv').then((m) => ({ default: m.PdfToCsv })));
const PdfToMarkdown = lazy(() => import('./components/PdfToMarkdown').then((m) => ({ default: m.PdfToMarkdown })));

const NotFound = lazy(() => import('./components/NotFound').then((m) => ({ default: m.NotFound })));

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type ToolCategory = 'all' | 'organize' | 'security' | 'convert';

interface NavTool {
  name: string;
  path: string;
  category: 'organize' | 'security' | 'convert';
  icon: React.ComponentType<{ className?: string }>;
}

const TOOLS_LIST: NavTool[] = [
  // Organize & Size
  { name: 'Compress', path: '/compress-pdf', category: 'organize', icon: Sliders },
  { name: 'Merge', path: '/merge-pdf', category: 'organize', icon: Files },
  { name: 'Split', path: '/split-pdf', category: 'organize', icon: Scissors },
  { name: 'Organize', path: '/organize-pdf', category: 'organize', icon: LayoutGrid },
  { name: 'Crop', path: '/crop-pdf', category: 'organize', icon: Crop },
  { name: 'Rotate', path: '/rotate-pdf', category: 'organize', icon: RotateCw },
  { name: 'Remove Pages', path: '/remove-pages', category: 'organize', icon: Trash2 },
  { name: 'Resize', path: '/resize-pdf', category: 'organize', icon: Scaling },
  { name: 'N-Up (Pages/Sheet)', path: '/nup-pdf', category: 'organize', icon: Columns2 },
  { name: 'Booklet Maker', path: '/booklet-pdf', category: 'organize', icon: BookOpen },
  { name: 'Deskew', path: '/deskew-pdf', category: 'organize', icon: RotateCw },

  // Security & Privacy
  { name: 'Sanitize', path: '/sanitize-pdf', category: 'security', icon: EyeOff },
  { name: 'Redact', path: '/redact-pdf', category: 'security', icon: SquareSlash },
  { name: 'Protect', path: '/protect-pdf', category: 'security', icon: Lock },
  { name: 'Unlock', path: '/unlock-pdf', category: 'security', icon: Unlock },
  { name: 'Sign', path: '/sign-pdf', category: 'security', icon: PenTool },
  { name: 'Watermark', path: '/watermark-pdf', category: 'security', icon: Stamp },
  { name: 'Bates Stamping', path: '/bates-numbering', category: 'security', icon: FileDigit },
  { name: 'Compare Diff', path: '/compare-pdf', category: 'security', icon: GitCompare },
  { name: 'Repair PDF', path: '/repair-pdf', category: 'security', icon: Wrench },

  // Convert, AI & Text
  { name: 'AI Summary & Chat', path: '/ai-summary-pdf', category: 'convert', icon: Bot },
  { name: 'OCR Searchable', path: '/ocr-pdf', category: 'convert', icon: ScanText },
  { name: 'Fill & Flatten', path: '/fill-pdf', category: 'convert', icon: FileCheck2 },
  { name: 'Extract Images', path: '/extract-images', category: 'convert', icon: Images },
  { name: 'Dark Mode', path: '/dark-mode-pdf', category: 'convert', icon: Moon },
  { name: 'B&W / Grayscale', path: '/grayscale-pdf', category: 'convert', icon: Printer },
  { name: 'Image to PDF', path: '/image-to-pdf', category: 'convert', icon: ImageIcon },
  { name: 'PDF to JPG', path: '/pdf-to-jpg', category: 'convert', icon: FileImage },
  { name: 'HEIC to JPG', path: '/heic-to-jpg', category: 'convert', icon: Camera },
  { name: 'Extract Text', path: '/extract-text', category: 'convert', icon: AlignLeft },
  { name: 'Edit Metadata', path: '/edit-metadata', category: 'convert', icon: Tag },
  { name: 'Page Numbers', path: '/page-numbers', category: 'convert', icon: Hash },
  { name: 'PDF to CSV / Excel', path: '/pdf-to-csv', category: 'convert', icon: Table },
  { name: 'PDF to Markdown', path: '/pdf-to-markdown', category: 'convert', icon: FileCode },
];

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
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory>('all');

  // Synchronize Pro status across tabs
  useEffect(() => {
    const handleSync = () => setIsPro(getLicenseStatus().isPro);
    window.addEventListener('storage', handleSync);
    document.addEventListener('visibilitychange', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, []);

  // Dynamic SEO title, description, canonical link, and JSON-LD schema injection
  useEffect(() => {
    const meta = TOOLS_METADATA[location.pathname] || TOOLS_METADATA['/'];
    document.title = meta.title;

    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      descMeta.setAttribute('content', meta.description);
    }

    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    const cleanPath = location.pathname === '/' ? '' : location.pathname;
    const pageUrl = `https://www.1into1.com${cleanPath}`;
    canonicalLink.href = pageUrl;

    // Inject/Update dynamic Schema.org JSON-LD
    let scriptTag = document.querySelector<HTMLScriptElement>('#schema-org-ld');
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = 'schema-org-ld';
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }

    scriptTag.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: meta.title,
      url: pageUrl,
      description: meta.description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires HTML5 and WebAssembly support',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      featureList: [
        '100% Client-Side Processing',
        'Zero Server Uploads',
        'Fully Offline Compatible',
      ],
    });
  }, [location.pathname]);

  // Sync category view on direct URL navigation
  useEffect(() => {
    const currentTool = TOOLS_LIST.find((t) => t.path === location.pathname);
    if (currentTool && selectedCategory !== 'all' && selectedCategory !== currentTool.category) {
      setSelectedCategory(currentTool.category);
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

  const visibleTools =
    selectedCategory === 'all'
      ? TOOLS_LIST
      : TOOLS_LIST.filter((tool) => tool.category === selectedCategory);

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

          <button
            type="button"
            onClick={() => setIsAuditDrawerOpen(true)}
            className="cursor-pointer transition hover:opacity-85 focus:outline-none"
            title="Click to view real-time privacy & network telemetry audit"
          >
            <TrustBadge />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-4xl my-auto text-center py-8">
        <button
          type="button"
          onClick={() => setIsAuditDrawerOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 mb-6 hover:border-zinc-700 hover:text-white transition cursor-pointer"
          title="Click to inspect network telemetry"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Zero uploads • Turn off Wi-Fi to test • 100% Private
        </button>

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

        {/* Categorized Navigation Suite */}
        <div className="flex flex-col items-center gap-3 mb-8 w-full max-w-5xl mx-auto px-2">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 border border-zinc-800 rounded-2xl backdrop-blur-md overflow-x-auto max-w-full">
            {[
              { id: 'organize', label: 'Organize & Size' },
              { id: 'security', label: 'Security & Privacy' },
              { id: 'convert', label: 'Convert, AI & Text' },
              { id: 'all', label: 'All Tools' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id as ToolCategory)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === tab.id
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent hover:bg-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filtered Tool Buttons */}
          <nav aria-label="PDF Tools" className="flex flex-wrap items-center justify-center gap-2 max-w-full">
            {visibleTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <NavLink
                  key={tool.path}
                  to={tool.path}
                  className={({ isActive }) =>
                    `px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 border whitespace-nowrap transition-all ${
                      isActive || (tool.path === '/compress-pdf' && location.pathname === '/')
                        ? 'bg-zinc-800 text-emerald-400 border-zinc-700 shadow-sm'
                        : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{tool.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Dynamic Tool Routing */}
        <ErrorBoundary>
          <Suspense fallback={<ToolFallback />}>
            <Routes>
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />

              {/* Core & Page Operations */}
              <Route path="/" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-pdf" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/merge-pdf" element={<Merger files={sharedFiles} onFilesChange={setSharedFiles} />} />
              <Route path="/split-pdf" element={<Splitter file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/organize-pdf" element={<OrganizePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/rotate-pdf" element={<RotatePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/crop-pdf" element={<CropPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/remove-pages" element={<RemovePages file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/resize-pdf" element={<ResizePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/nup-pdf" element={<NUpPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/booklet-pdf" element={<BookletPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/deskew-pdf" element={<DeskewPdf file={activeFile} onFileChange={handleSingleFileChange} />} />

              {/* Security & Privacy */}
              <Route path="/sanitize-pdf" element={<SanitizePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/redact-pdf" element={<RedactPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/protect-pdf" element={<ProtectPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/unlock-pdf" element={<UnlockPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/sign-pdf" element={<SignPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/watermark-pdf" element={<Watermark file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/bates-numbering" element={<BatesNumbering file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compare-pdf" element={<ComparePdf />} />
              <Route path="/repair-pdf" element={<RepairPdf file={activeFile} onFileChange={handleSingleFileChange} />} />

              {/* Convert, AI & Text */}
              <Route path="/ai-summary-pdf" element={<AiSummaryPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/ocr-pdf" element={<OcrPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/fill-pdf" element={<FillFormPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/image-to-pdf" element={<ImageToPdf />} />
              <Route path="/pdf-to-jpg" element={<PdfToImages file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/heic-to-jpg" element={<HeicToJpg />} />
              <Route path="/extract-images" element={<ExtractImages file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/extract-text" element={<PdfToText file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/grayscale-pdf" element={<GrayscalePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/dark-mode-pdf" element={<DarkModePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/edit-metadata" element={<EditMetadata file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/page-numbers" element={<PageNumbers file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/pdf-to-csv" element={<PdfToCsv file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/pdf-to-markdown" element={<PdfToMarkdown file={activeFile} onFileChange={handleSingleFileChange} />} />

              {/* Programmatic High-Intent Aliases */}
              <Route path="/bank-statement-to-excel" element={<PdfToCsv file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/offline-pdf-redaction" element={<RedactPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/extract-pdf-for-llm" element={<PdfToMarkdown file={activeFile} onFileChange={handleSingleFileChange} />} />
              {/* Target-KB Programmatic Aliases */}
              <Route path="/compress-pdf-to-100kb" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-pdf-to-200kb" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-pdf-to-500kb" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
            
            
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl py-8 border-t border-zinc-900 flex flex-col gap-6 text-xs text-zinc-500">
        {/* Popular Workflows & SEO Directory */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left pb-4 border-b border-zinc-900/60">
          <span className="font-semibold text-zinc-400 text-[11px] uppercase tracking-wider shrink-0">
            Popular Workflows:
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <NavLink
              to="/compress-pdf-to-100kb"
              className="text-zinc-400 hover:text-emerald-400 transition"
            >
              Compress to 100KB
            </NavLink>
            <span className="text-zinc-800">•</span>
            <NavLink
              to="/compress-pdf-to-200kb"
              className="text-zinc-400 hover:text-emerald-400 transition"
            >
              Compress to 200KB
            </NavLink>
            <span className="text-zinc-800">•</span>
            <NavLink
              to="/compress-pdf-to-500kb"
              className="text-zinc-400 hover:text-emerald-400 transition"
            >
              Compress to 500KB
            </NavLink>
            <span className="text-zinc-800">•</span>
            <NavLink
              to="/bank-statement-to-excel"
              className="text-zinc-400 hover:text-emerald-400 transition"
            >
              Bank Statement to Excel
            </NavLink>
            <span className="text-zinc-800">•</span>
            <NavLink
              to="/offline-pdf-redaction"
              className="text-zinc-400 hover:text-emerald-400 transition"
            >
              Offline PDF Redaction
            </NavLink>
            <span className="text-zinc-800">•</span>
            <NavLink
              to="/extract-pdf-for-llm"
              className="text-zinc-400 hover:text-emerald-400 transition"
            >
              Extract PDF for LLMs
            </NavLink>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <span>100% In-Browser. Zero Server Processing. Powered by </span>
            <span className="text-zinc-400">pdf-lib</span>,{' '}
            <span className="text-zinc-400">PDF.js</span> &amp;{' '}
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
        </div>
      </footer>

      {/* Pro Modal */}
      <ProModal isOpen={isProModalOpen} onClose={() => setIsProModalOpen(false)} />

      {/* Network Audit Drawer */}
      <NetworkAuditDrawer
        isOpen={isAuditDrawerOpen}
        onClose={() => setIsAuditDrawerOpen(false)}
      />
    </div>
  );
}