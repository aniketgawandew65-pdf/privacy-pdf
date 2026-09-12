import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { ProModal } from './components/ProModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getLicenseStatus } from './utils/license';
import { TOOLS_METADATA } from './seoConfig';
import { TOOL_COPY } from './toolCopy';
import { blogMeta, renderBlog, renderGuide } from './seoContent';
import { NetworkAuditDrawer } from './components/NetworkAuditDrawer';
import {
  Sliders,
  Files,
  Scissors,
  Image as ImageIcon,
  RotateCw,
  Download,
  Upload,
  FileImage,
  Trash2,
  Stamp,
  Hash,
  AlignLeft,
  Tag,
  PenTool,
  Lock,
  Unlock,
  Search,
  ArrowRight,
  ChevronDown,
  ShieldCheck,
  Zap,
  WifiOff,
  UserRoundCheck,
  X,
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
  Type,
  FileEdit,
  Code2,
  Receipt,
} from 'lucide-react';

declare const __BUILD_TIME__: string;

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
const ScanToPdf = lazy(() => import('./components/ScanToPdf').then((m) => ({ default: m.ScanToPdf })));
const AnnotatePdf = lazy(() => import('./components/AnnotatePdf'));
const ImageToPdf = lazy(() => import('./components/ImageToPdf'));
const TextToPdf = lazy(() => import('./components/TextToPdf').then((m) => ({ default: m.TextToPdf })));
const PdfToImages = lazy(() => import('./components/PdfToImages').then((m) => ({ default: m.PdfToImages })));
const CompressImage = lazy(() => import('./components/CompressImage').then((m) => ({ default: m.CompressImage })));
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
const CsvToPdf = lazy(() => import('./components/CsvToPdf').then((m: any) => ({ default: m.CsvToPdf || m.default })));
const VisualEditor = lazy(() => import('./components/VisualEditor').then((m) => ({ default: m.VisualEditor })));
const CodeToPdf = lazy(() => import('./components/CodeToPdf').then((m) => ({ default: m.CodeToPdf })));
const HtmlToPdf = lazy(() => import('./components/HtmlToPdf').then((m) => ({ default: m.HtmlToPdf })));

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
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const TOOLS_LIST: NavTool[] = [
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

  { name: 'Sanitize', path: '/sanitize-pdf', category: 'security', icon: EyeOff },
  { name: 'Redact', path: '/redact-pdf', category: 'security', icon: SquareSlash },
  { name: 'Protect', path: '/protect-pdf', category: 'security', icon: Lock },
  { name: 'Unlock', path: '/unlock-pdf', category: 'security', icon: Unlock },
  { name: 'Sign', path: '/sign-pdf', category: 'security', icon: PenTool },
  { name: 'Watermark', path: '/watermark-pdf', category: 'security', icon: Stamp },
  { name: 'Bates Stamping', path: '/bates-numbering', category: 'security', icon: FileDigit },
  { name: 'Compare Diff', path: '/compare-pdf', category: 'security', icon: GitCompare },
  { name: 'Repair PDF', path: '/repair-pdf', category: 'security', icon: Wrench },

  { name: 'Text to PDF', path: '/text-to-pdf', category: 'convert', icon: Type },
  { name: 'AI Summary & Chat', path: '/ai-summary-pdf', category: 'convert', icon: Bot },
  { name: 'OCR Searchable', path: '/ocr-pdf', category: 'convert', icon: ScanText },
{ name: 'Fill & Flatten', path: '/fill-pdf', category: 'convert', icon: FileCheck2 },
  { name: 'Extract Images', path: '/extract-images', category: 'convert', icon: Images },
  { name: 'Dark Mode', path: '/dark-mode-pdf', category: 'convert', icon: Moon },
  { name: 'B&W / Grayscale', path: '/grayscale-pdf', category: 'convert', icon: Printer },
  { name: 'Annotate PDF', path: '/annotate-pdf', category: 'organize', icon: FileEdit },
  { name: 'Scan to PDF', path: '/scan-to-pdf', category: 'convert', icon: Camera },
  { name: 'Image Converter', path: '/image-converter', category: 'convert', icon: ImageIcon },
  { name: 'PDF to Image', path: '/pdf-to-image', category: 'convert', icon: FileImage },
  { name: 'Compress Image', path: '/compress-image', category: 'convert', icon: ImageIcon },
  { name: 'PDF to Text', path: '/pdf-to-text', category: 'convert', icon: AlignLeft },
  { name: 'Edit Metadata', path: '/edit-metadata', category: 'convert', icon: Tag },
  { name: 'Page Numbers', path: '/page-numbers', category: 'convert', icon: Hash },
  { name: 'PDF to CSV / Excel', path: '/pdf-to-csv', category: 'convert', icon: Table },
  { name: 'PDF to Markdown', path: '/pdf-to-markdown', category: 'convert', icon: FileCode },
  { name: 'CSV to PDF', path: '/csv-to-pdf', category: 'convert', icon: Table },
  { name: 'Edit PDF', path: '/edit-pdf', category: 'organize', icon: FileEdit },
  { name: 'Code to PDF', path: '/code-to-pdf', category: 'convert', icon: Code2 },
  { name: 'HTML / Receipt to PDF', path: '/html-to-pdf', category: 'convert', icon: Receipt },
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
  const proRequested =
    new URLSearchParams(location.search).get('pro') === 'true';

  const isDevMode = proRequested;
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory>('all');


  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const isFileDrag = e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files');
      if (!isFileDrag) return;
      dragCounter.current += 1;
      setIsDraggingFile(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const isFileDrag = e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files');
      if (!isFileDrag) return;
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        setIsDraggingFile(false);
        dragCounter.current = 0;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingFile(false);
      dragCounter.current = 0;

      const droppedFiles = e.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        const filesArray = Array.from(droppedFiles).filter(
          (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        );
        if (filesArray.length > 0) {
          setSharedFiles(filesArray);
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  useEffect(() => {
    const handleSync = () => setIsPro(getLicenseStatus().isPro);
    window.addEventListener('storage', handleSync);
    document.addEventListener('visibilitychange', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, []);

  useEffect(() => {
    const meta = blogMeta(location.pathname) || TOOLS_METADATA[location.pathname] || { title: 'Page not found | 1into1 PDF', description: 'Find the right PDF tool at 1into1.', heading: 'Page not found', subheading: 'Choose a tool to keep working.' };
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
    const cleanPath = location.pathname === '/' ? '' : location.pathname === '/visual-editor' ? '/edit-pdf' : location.pathname;
    const pageUrl = `https://www.1into1.com${cleanPath}`;
    canonicalLink.href = pageUrl;
    for (const [selector, value] of [
      ['meta[property="og:title"]', meta.title], ['meta[property="og:description"]', meta.description],
      ['meta[property="og:url"]', pageUrl], ['meta[name="twitter:title"]', meta.title],
      ['meta[name="twitter:description"]', meta.description], ['meta[name="twitter:url"]', pageUrl],
    ]) document.querySelector(selector)?.setAttribute('content', value);


    let scriptTag = document.querySelector<HTMLScriptElement>('#schema-org-ld');
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = 'schema-org-ld';
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }

    const organization = {
      '@type': 'Organization',
      '@id': 'https://www.1into1.com/#organization',
      name: '1into1 PDF',
      url: 'https://www.1into1.com/',
    };

    const breadcrumbItems = location.pathname.startsWith('/blog/')
      ? [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.1into1.com/' },
          { '@type': 'ListItem', position: 2, name: 'PDF Guides', item: 'https://www.1into1.com/blog' },
          { '@type': 'ListItem', position: 3, name: meta.heading, item: pageUrl },
        ]
      : location.pathname === '/'
        ? []
        : [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.1into1.com/' },
            { '@type': 'ListItem', position: 2, name: meta.heading, item: pageUrl },
          ];

    let primaryEntity: Record<string, unknown>;

    if (location.pathname === '/') {
      primaryEntity = {
        '@type': 'WebSite',
        '@id': 'https://www.1into1.com/#website',
        name: '1into1 PDF',
        url: pageUrl,
        description: meta.description,
        publisher: { '@id': 'https://www.1into1.com/#organization' },
      };
    } else if (location.pathname === '/blog') {
      primaryEntity = {
        '@type': 'CollectionPage',
        '@id': `${pageUrl}#page`,
        name: meta.heading,
        description: meta.description,
        url: pageUrl,
        isPartOf: { '@id': 'https://www.1into1.com/#website' },
      };
    } else if (location.pathname.startsWith('/blog/')) {
      primaryEntity = {
        '@type': 'Article',
        '@id': `${pageUrl}#article`,
        headline: meta.heading,
        name: meta.heading,
        description: meta.description,
        url: pageUrl,
        author: { '@id': 'https://www.1into1.com/#organization' },
        publisher: { '@id': 'https://www.1into1.com/#organization' },
        mainEntityOfPage: pageUrl,
      };
    } else if (['/privacy', '/terms'].includes(location.pathname)) {
      primaryEntity = {
        '@type': 'WebPage',
        '@id': `${pageUrl}#page`,
        name: meta.heading,
        description: meta.description,
        url: pageUrl,
        isPartOf: { '@id': 'https://www.1into1.com/#website' },
      };
    } else {
      primaryEntity = {
        '@type': 'WebApplication',
        '@id': `${pageUrl}#app`,
        name: meta.heading,
        url: pageUrl,
        description: meta.description,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern web browser with HTML5 support',
        provider: { '@id': 'https://www.1into1.com/#organization' },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        featureList: [
          'Local-first PDF processing',
          'Browser-based document tools',
          'No account required for core tools',
          'Offline-capable PWA for supported local workflows',
        ],
      };
    }

    scriptTag.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        primaryEntity,
        ...(breadcrumbItems.length ? [{
          '@type': 'BreadcrumbList',
          '@id': `${pageUrl}#breadcrumb`,
          itemListElement: breadcrumbItems,
        }] : []),
      ],
    });
  }, [location.pathname]);

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

  const currentMeta = blogMeta(location.pathname) || TOOLS_METADATA[location.pathname] || { heading: 'Page not found', subheading: 'Choose a tool to keep working.' };

  const visibleTools = TOOLS_LIST.filter(tool =>
    (selectedCategory === 'all' || tool.category === selectedCategory) &&
    `${tool.name} ${tool.path} ${TOOLS_METADATA[tool.path]?.description || ''}`.toLowerCase().includes(search.toLowerCase().trim())
  );
  const isHome = location.pathname === '/';
  const isBlog = Boolean(blogMeta(location.pathname));
  const isInfo = ['/privacy', '/terms'].includes(location.pathname) || isBlog;
  const closeDirectory = () => { setDirectoryOpen(false); setSearch(''); };
  const popular = TOOLS_LIST.filter(tool => ['/compress-pdf','/merge-pdf','/split-pdf','/sign-pdf','/image-converter'].includes(tool.path));


  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to tool</a>
      <header className="site-header">
        <NavLink to="/" className="brand" aria-label="1into1 PDF home" onClick={closeDirectory}>
          <img src="/logo.png" alt="" width="40" height="40" />
          <span>1into1<span className="brand-light"> PDF</span></span>
        </NavLink>
        <div className="header-actions">
          <button className="quiet-button tools-toggle" onClick={() => setDirectoryOpen(!directoryOpen)} aria-expanded={directoryOpen} aria-controls="tool-directory"><LayoutGrid size={17} /><span>All tools</span><ChevronDown size={14} /></button>
          {installPrompt && <button className="quiet-button install-button" onClick={handleInstallApp}><Download size={16} />Install</button>}
          <button className="primary-button pro-button" onClick={() => setIsProModalOpen(true)}>{isDevMode ? 'Admin Pro' : isPro ? 'Pro active' : 'Get Pro'}<ArrowRight size={15} /></button>
        </div>
      </header>

      <main className="site-main">
        <section className={`page-intro ${isHome ? 'home-intro' : ''}`}>
          <div className="eyebrow"><ShieldCheck size={14} /> YOUR FILES. YOUR DEVICE.</div>
          <h1>{isHome ? <>All tasks.<br className="mobile-break" /> <span>Simply done.</span></> : currentMeta.heading}</h1>
          <p>{isHome ? 'Everyday PDF tools, with privacy built in. Compress, merge, edit and convert — right in your browser.' : TOOL_COPY[location.pathname] || currentMeta.subheading}</p>
          {!isInfo && <div className="trust-points" aria-label="Local PDF tool benefits">
            <span><Zap size={14} />Lightning fast</span>
            <span><WifiOff size={14} />No internet needed</span>
            <span><ShieldCheck size={14} />100% private</span>
            <span><UserRoundCheck size={14} />No signup</span>
          </div>}
          {!isInfo && <p className="trust-caption">*Local PDF tools after the app and required resources have loaded. Optional cloud AI and checkout need a connection.</p>}
        </section>

        <nav className="quick-tools" aria-label="Popular PDF tools">
          {popular.map(tool => { const Icon = tool.icon; return <NavLink key={tool.path} to={tool.path} onClick={closeDirectory} className={({isActive}) => `quick-tool ${isActive || (isHome && tool.path === '/compress-pdf') ? 'is-active' : ''}`}><Icon size={17} />{tool.name}</NavLink>; })}
          <button className="quick-tool more-tools" onClick={() => setDirectoryOpen(!directoryOpen)} aria-expanded={directoryOpen} aria-controls="tool-directory"><Search size={17} />Find a tool</button>
        </nav>

        {directoryOpen && <section id="tool-directory" className="tool-directory" aria-label="All PDF tools">
          <div className="directory-heading"><div><span className="eyebrow">THE TOOLKIT</span><h2>What would you like to do?</h2></div><button className="icon-button" aria-label="Close tool directory" onClick={closeDirectory}><X size={20} /></button></div>
          <div className="tool-search"><Search size={19} /><input type="search" aria-label="Search PDF tools" placeholder="Search tools — crop, OCR, convert…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="category-tabs" role="group" aria-label="Filter tools">
            {([{id:'all',label:'All tools'},{id:'organize',label:'Organize'},{id:'security',label:'Protect & sign'},{id:'convert',label:'Convert & create'}] as const).map(category => <button key={category.id} aria-pressed={selectedCategory === category.id} onClick={() => setSelectedCategory(category.id)}>{category.label}</button>)}
          </div>
          <p className="search-count" aria-live="polite">{visibleTools.length} tools</p>
          <div className="directory-grid">{visibleTools.map(tool => {const Icon = tool.icon; return <NavLink key={tool.path} to={tool.path} onClick={closeDirectory} className="directory-card"><Icon size={20} /><div><strong>{tool.name}</strong><span>{TOOL_COPY[tool.path] || TOOLS_METADATA[tool.path]?.subheading}</span></div><ArrowRight size={15} /></NavLink>;})}</div>
          {visibleTools.length === 0 && <p className="empty-search">No matching tools. Try “merge”, “image” or “text”.</p>}
        </section>}

        <section id="workspace" className="tool-workspace" aria-label="Document workspace" tabIndex={-1}>
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<ToolFallback />}>
            <Routes>
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />

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

              <Route path="/sanitize-pdf" element={<SanitizePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/redact-pdf" element={<RedactPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/protect-pdf" element={<ProtectPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/unlock-pdf" element={<UnlockPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/sign-pdf" element={<SignPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/watermark-pdf" element={<Watermark file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/bates-numbering" element={<BatesNumbering file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compare-pdf" element={<ComparePdf />} />
              <Route path="/repair-pdf" element={<RepairPdf file={activeFile} onFileChange={handleSingleFileChange} />} />

              <Route path="/text-to-pdf" element={<TextToPdf />} />
              <Route path="/ai-summary-pdf" element={<AiSummaryPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/ocr-pdf" element={<OcrPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/fill-pdf" element={<FillFormPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/annotate-pdf" element={<AnnotatePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/scan-to-pdf" element={<ScanToPdf />} />
              <Route path="/image-converter" element={<ImageToPdf />} />
              <Route path="/image-to-pdf" element={<ImageToPdf />} />
              <Route path="/heic-to-jpg" element={<ImageToPdf />} />

              <Route path="/pdf-to-image" element={<PdfToImages file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/pdf-to-jpg" element={<PdfToImages file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-image" element={<CompressImage />} />
              <Route path="/extract-images" element={<ExtractImages file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/pdf-to-text" element={<PdfToText file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/grayscale-pdf" element={<GrayscalePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/dark-mode-pdf" element={<DarkModePdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/edit-metadata" element={<EditMetadata file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/page-numbers" element={<PageNumbers file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/pdf-to-csv" element={<PdfToCsv file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/pdf-to-markdown" element={<PdfToMarkdown file={activeFile} onFileChange={handleSingleFileChange} />} />

              <Route path="/bank-statement-to-excel" element={<PdfToCsv file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/offline-pdf-redaction" element={<RedactPdf file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/extract-pdf-for-llm" element={<PdfToMarkdown file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-pdf-to-100kb" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-pdf-to-50kb" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-pdf-to-200kb" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/compress-pdf-to-500kb" element={<Compressor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/csv-to-pdf" element={<CsvToPdf />} />
              <Route path="/edit-pdf" element={<VisualEditor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/visual-editor" element={<VisualEditor file={activeFile} onFileChange={handleSingleFileChange} />} />
              <Route path="/code-to-pdf" element={<CodeToPdf />} />
              <Route path="/html-to-pdf" element={<HtmlToPdf />} />

              <Route path="/blog" element={<div dangerouslySetInnerHTML={{ __html: renderBlog('/blog') }} />} />
              <Route path="/blog/:slug" element={isBlog ? <div dangerouslySetInnerHTML={{ __html: renderBlog(location.pathname) }} /> : <NotFound />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </ErrorBoundary>
        </section>
        {!isInfo && <div className="workspace-note"><ShieldCheck size={15} /><span>PDF processing stays on your device. Cloud AI is optional.</span><NavLink to="/privacy">How it works</NavLink></div>}
        {isHome && <section className="benefits" aria-label="Why 1into1"><div><span>01</span><h2>Pick a file.</h2><p>No account needed to use the local tools.</p></div><div><span>02</span><h2>Make it yours.</h2><p>Simple controls. No upload queue.</p></div><div><span>03</span><h2>Keep moving.</h2><p>Download your result and get on with your day.</p></div></section>}
        {!isInfo && <div dangerouslySetInnerHTML={{ __html: renderGuide(location.pathname) }} />}
      </main>

      <footer className="site-footer">
        <div className="footer-top"><NavLink to="/" className="footer-brand">1into1 PDF</NavLink><NavLink to="/blog">PDF guides</NavLink></div>
        <details className="footer-directory"><summary>Explore all {TOOLS_LIST.length} tools<ChevronDown size={15} /></summary><nav aria-label="Complete PDF tool directory">{TOOLS_LIST.map(tool => <NavLink key={tool.path} to={tool.path}>{tool.name}</NavLink>)}</nav></details>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} 1into1</span><div><NavLink to="/privacy">Privacy</NavLink><NavLink to="/terms">Terms</NavLink><button onClick={() => setIsAuditDrawerOpen(true)}>Network activity</button><button onClick={() => setIsProModalOpen(true)}>Pricing</button></div></div>
      
        {isDevMode && (
          <div className="live-build-status">
            <span className="live-build-dot" />
            <span>Live Build: {__BUILD_TIME__}</span>
          </div>
        )}

</footer>
      {isDraggingFile && <div className="drop-overlay"><Upload size={36} /><h2>Drop your PDF here</h2><p>Your file opens on this device.</p></div>}
      <ProModal isOpen={isProModalOpen} onClose={() => setIsProModalOpen(false)} />
      <NetworkAuditDrawer isOpen={isAuditDrawerOpen} onClose={() => setIsAuditDrawerOpen(false)} />
    </div>
  );
}
