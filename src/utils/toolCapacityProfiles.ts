/**
 * 1into1 PDF — Tool Capacity Profiles
 *
 * PHASE 2 ONLY
 *
 * This registry describes how each tool consumes local
 * browser resources.
 *
 * It does NOT:
 * - change the 150 MB mobile limit
 * - remove the desktop limit
 * - block or allow files
 * - change task credits
 * - change any tool processing engine
 * - show any new UI
 *
 * Later phases combine these profiles with
 * deviceCapability.ts to calculate Desktop Pro
 * recommendations.
 */

export type ProcessingClass =
  | 'A'
  | 'B'
  | 'C'
  | 'D';

export type ResourceIntensity =
  | 'low'
  | 'medium'
  | 'high'
  | 'very-high';

export type InputMetric =
  | 'single-bytes'
  | 'combined-bytes'
  | 'bytes-pages'
  | 'bytes-pages-pixels'
  | 'text-size'
  | 'table-size'
  | 'image-pixels';

export type RecoveryMode =
  | 'none'
  | 'workspace'
  | 'atomic-restart'
  | 'page-checkpoint'
  | 'streaming';

export type DesktopLargeFileReadiness =
  | 'ready'
  | 'conservative'
  | 'upgrade-priority';

export type OutputGrowth =
  | 'small'
  | 'similar'
  | 'variable'
  | 'large';

export interface ToolCapacityProfile {
  id: string;
  name: string;
  route: string;

  processingClass: ProcessingClass;

  inputMetric: InputMetric;

  multiFile: boolean;
  aggregateInputBytes: boolean;

  memoryIntensity: ResourceIntensity;
  cpuIntensity: ResourceIntensity;
  storageIntensity: ResourceIntensity;

  pageComplexity: boolean;
  pixelComplexity: boolean;

  outputGrowth: OutputGrowth;

  recovery: RecoveryMode;

  usesOpfs: boolean;
  usesWorker: boolean;

  desktopReadiness:
    DesktopLargeFileReadiness;

  notes: string;
}

/*
 * ----------------------------------------------------------
 * CLASS MEANING
 * ----------------------------------------------------------
 *
 * A
 * Lightweight/text/vector generation.
 *
 * B
 * Structural PDF modification/rearrangement.
 *
 * C
 * Whole-document or multi-document memory-heavy processing.
 *
 * D
 * Rendering, OCR, images, canvases or page/pixel-heavy work.
 */

export const TOOL_CAPACITY_PROFILES:
  readonly ToolCapacityProfile[] = [

  /*
   * ========================================================
   * ORGANIZE
   * ========================================================
   */

  {
    id: 'compress-pdf',
    name: 'Compress PDF',
    route: '/compress-pdf',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: true,
    aggregateInputBytes: true,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'variable',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'PDF.js rendering, canvases and output PDF accumulation make pixel complexity important.',
  },

  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    route: '/merge-pdf',
    processingClass: 'C',
    inputMetric: 'combined-bytes',
    multiFile: true,
    aggregateInputBytes: true,
    memoryIntensity: 'very-high',
    cpuIntensity: 'medium',
    storageIntensity: 'medium',
    pageComplexity: false,
    pixelComplexity: false,
    outputGrowth: 'large',
    recovery: 'atomic-restart',
    usesOpfs: false,
    usesWorker: true,
    desktopReadiness: 'conservative',
    notes:
      'Desktop Pro uses qpdf WASM in an isolated Worker with WORKERFS-mounted browser Files, avoiding full JavaScript input buffers. Final qpdf output still resides in WASM memory, so capacity remains conservative until stress-tested.',
  },

  {
    id: 'split-pdf',
    name: 'Split PDF',
    route: '/split-pdf',
    processingClass: 'C',
    inputMetric: 'single-bytes',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'variable',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Whole-source structural path plus generated split documents or ZIP output.',
  },

  {
    id: 'organize-pdf',
    name: 'Organize PDF',
    route: '/organize-pdf',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Structural whole-PDF processing with PDF.js previews.',
  },

  {
    id: 'crop-pdf',
    name: 'Crop PDF',
    route: '/crop-pdf',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Uses pdf-lib for document mutation and PDF.js/canvas for preview.',
  },

  {
    id: 'rotate-pdf',
    name: 'Rotate PDF',
    route: '/rotate-pdf',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Whole-document structural processing; protected-file fallback can render pages.',
  },

  {
    id: 'remove-pages',
    name: 'Remove Pages',
    route: '/remove-pages',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'small',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Whole-document copy/rebuild path; protected documents can use PDF.js fallback.',
  },

  {
    id: 'resize-pdf',
    name: 'Resize PDF',
    route: '/resize-pdf',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Lossless vector path where possible with heavier protected-file fallback.',
  },

  {
    id: 'nup-pdf',
    name: 'N-Up',
    route: '/nup-pdf',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'variable',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Builds a new output document containing embedded source pages.',
  },

  {
    id: 'booklet-pdf',
    name: 'Booklet Maker',
    route: '/booklet-pdf',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'variable',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Rearranges and embeds source pages into a newly accumulated booklet PDF.',
  },

  {
    id: 'deskew-pdf',
    name: 'Deskew PDF',
    route: '/deskew-pdf',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Canvas/render-heavy deskew processing makes rendered pixels more important than file MB alone.',
  },

  /*
   * ========================================================
   * SECURITY
   * ========================================================
   */

  {
    id: 'sanitize-pdf',
    name: 'Sanitize PDF',
    route: '/sanitize-pdf',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'similar',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Page processing with durable recovery substantially reduces long-job risk.',
  },

  {
    id: 'private-pii-secrets-auto-redactor',
    name: 'Private PII & Secrets Auto-Redactor',
    route: '/private-pii-secrets-auto-redactor',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'very-high',
    cpuIntensity: 'very-high',
    storageIntensity: 'high',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'similar',
    recovery: 'streaming',
    usesOpfs: true,
    usesWorker: true,
    desktopReadiness: 'ready',
    notes:
      'OCR, bounded rendering, persisted scan data and streaming destructive redaction.',
  },

  {
    id: 'redact-pdf',
    name: 'Redact PDF',
    route: '/redact-pdf',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'high',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'similar',
    recovery: 'streaming',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Large-file streaming redaction path already uses bounded rendering and OPFS output.',
  },

  {
    id: 'protect-pdf',
    name: 'Protect PDF',
    route: '/protect-pdf',
    processingClass: 'C',
    inputMetric: 'single-bytes',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'medium',
    pageComplexity: false,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: true,
    desktopReadiness: 'conservative',
    notes:
      'qpdf processing runs in a Worker, but final encrypted output still returns through memory.',
  },

  {
    id: 'unlock-pdf',
    name: 'Unlock PDF',
    route: '/unlock-pdf',
    processingClass: 'C',
    inputMetric: 'single-bytes',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Browser-backed PDF.js input is efficient, but rebuilt unlocked output still accumulates.',
  },

  {
    id: 'sign-pdf',
    name: 'Sign PDF',
    route: '/sign-pdf',
    processingClass: 'C',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Whole-document parse/edit/save operation with preview rendering.',
  },

  {
    id: 'watermark-pdf',
    name: 'Watermark PDF',
    route: '/watermark-pdf',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'medium',
    cpuIntensity: 'medium',
    storageIntensity: 'high',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'atomic-restart',
    usesOpfs: true,
    usesWorker: true,
    desktopReadiness: 'ready',
    notes:
      'Large-file worker path uses qpdf-WASM with OPFS-backed output.',
  },

  {
    id: 'bates-numbering',
    name: 'Bates Stamping',
    route: '/bates-numbering',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'medium',
    cpuIntensity: 'medium',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Durable source and page checkpoints reduce risk for long stamping jobs.',
  },

  {
    id: 'compare-pdf',
    name: 'Compare Diff',
    route: '/compare-pdf',
    processingClass: 'D',
    inputMetric: 'combined-bytes',
    multiFile: true,
    aggregateInputBytes: true,
    memoryIntensity: 'very-high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'small',
    recovery: 'workspace',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Two source PDFs and rendered comparison pages can coexist; combined workload matters.',
  },

  {
    id: 'repair-pdf',
    name: 'Repair PDF',
    route: '/repair-pdf',
    processingClass: 'C',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'very-high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Attempts whole-document structural repair and can fall back to expensive raster reconstruction.',
  },

  /*
   * ========================================================
   * CONVERT / CREATE
   * ========================================================
   */

  {
    id: 'text-to-pdf',
    name: 'Text to PDF',
    route: '/text-to-pdf',
    processingClass: 'A',
    inputMetric: 'text-size',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'low',
    cpuIntensity: 'low',
    storageIntensity: 'low',
    pageComplexity: false,
    pixelComplexity: false,
    outputGrowth: 'variable',
    recovery: 'workspace',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Primarily text/vector PDF generation rather than decoding an existing large PDF.',
  },

  {
    id: 'ai-summary-pdf',
    name: 'AI Summary & Chat',
    route: '/ai-summary-pdf',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'small',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Local text extraction can fall back to OCR before optional external AI interaction.',
  },

  {
    id: 'ocr-pdf',
    name: 'OCR Searchable',
    route: '/ocr-pdf',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'very-high',
    cpuIntensity: 'very-high',
    storageIntensity: 'high',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'similar',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: true,
    desktopReadiness: 'ready',
    notes:
      'Two-phase OCR persists compact page results and durable source before final searchable PDF assembly.',
  },

  {
    id: 'fill-pdf',
    name: 'Fill & Flatten',
    route: '/fill-pdf',
    processingClass: 'C',
    inputMetric: 'single-bytes',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: false,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'pdf-lib loads the complete form document before editing and serialization.',
  },

  {
    id: 'extract-images',
    name: 'Extract Images',
    route: '/extract-images',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'high',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'large',
    recovery: 'streaming',
    usesOpfs: true,
    usesWorker: true,
    desktopReadiness: 'ready',
    notes:
      'Page-wise extraction persists images to OPFS and packages ZIP output in a Worker.',
  },

  {
    id: 'dark-mode-pdf',
    name: 'Dark Mode',
    route: '/dark-mode-pdf',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'high',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'similar',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Page-wise raster transformation with durable source and cached page results.',
  },

  {
    id: 'grayscale-pdf',
    name: 'B&W / Grayscale',
    route: '/grayscale-pdf',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'similar',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Page-wise raster conversion with durable recovery.',
  },

  {
    id: 'annotate-pdf',
    name: 'Annotate PDF',
    route: '/annotate-pdf',
    processingClass: 'C',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Interactive preview plus whole-document overlay application and save.',
  },

  {
    id: 'scan-to-pdf',
    name: 'Scan to PDF',
    route: '/scan-to-pdf',
    processingClass: 'D',
    inputMetric: 'image-pixels',
    multiFile: true,
    aggregateInputBytes: true,
    memoryIntensity: 'very-high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: false,
    pixelComplexity: true,
    outputGrowth: 'large',
    recovery: 'workspace',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Decoded camera/image pixels can consume far more memory than compressed source file bytes.',
  },

  {
    id: 'image-converter',
    name: 'Image Converter',
    route: '/image-converter',
    processingClass: 'D',
    inputMetric: 'image-pixels',
    multiFile: true,
    aggregateInputBytes: true,
    memoryIntensity: 'very-high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: false,
    pixelComplexity: true,
    outputGrowth: 'variable',
    recovery: 'workspace',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Multi-image decode/canvas conversion makes pixel dimensions more important than compressed MB.',
  },

  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    route: '/pdf-to-image',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'high',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'large',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Page-wise rendering with OPFS-backed durable recovery.',
  },

  {
    id: 'compress-image',
    name: 'Compress Image',
    route: '/compress-image',
    processingClass: 'D',
    inputMetric: 'image-pixels',
    multiFile: true,
    aggregateInputBytes: true,
    memoryIntensity: 'very-high',
    cpuIntensity: 'high',
    storageIntensity: 'low',
    pageComplexity: false,
    pixelComplexity: true,
    outputGrowth: 'small',
    recovery: 'workspace',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Decoded pixels can greatly exceed source image file size during compression.',
  },

  {
    id: 'pdf-to-text',
    name: 'PDF to Text',
    route: '/pdf-to-text',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'small',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: true,
    desktopReadiness: 'ready',
    notes:
      'Browser-backed PDF.js extraction with OCR fallback and page checkpoints.',
  },

  {
    id: 'edit-metadata',
    name: 'Edit Metadata',
    route: '/edit-metadata',
    processingClass: 'C',
    inputMetric: 'single-bytes',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'medium',
    pageComplexity: false,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'atomic-restart',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'qpdf-WASM/pdf-lib metadata path still requires significant whole-document memory.',
  },

  {
    id: 'page-numbers',
    name: 'Page Numbers',
    route: '/page-numbers',
    processingClass: 'B',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'none',
    usesOpfs: false,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Normal structural path is efficient but protected-file fallback may rebuild pages.',
  },

  {
    id: 'pdf-to-csv',
    name: 'PDF to CSV / Excel',
    route: '/pdf-to-csv',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'small',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: true,
    desktopReadiness: 'ready',
    notes:
      'Digital extraction is page-wise; low-text pages use OCR with durable page checkpoints.',
  },

  {
    id: 'document-data-extractor',
    name: 'Universal Data Extractor',
    route: '/document-data-extractor',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'small',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: true,
    desktopReadiness: 'ready',
    notes:
      'Digital and scanned extraction paths use page persistence and resumable processing.',
  },

  {
    id: 'pdf-to-markdown',
    name: 'PDF to Markdown',
    route: '/pdf-to-markdown',
    processingClass: 'D',
    inputMetric: 'bytes-pages-pixels',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'high',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: true,
    outputGrowth: 'small',
    recovery: 'page-checkpoint',
    usesOpfs: true,
    usesWorker: true,
    desktopReadiness: 'ready',
    notes:
      'Streaming page extraction with OCR fallback and cached page results.',
  },

  {
    id: 'csv-to-pdf',
    name: 'CSV to PDF',
    route: '/csv-to-pdf',
    processingClass: 'A',
    inputMetric: 'table-size',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'medium',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: false,
    pixelComplexity: false,
    outputGrowth: 'variable',
    recovery: 'workspace',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Generates vector/tabular PDF from parsed CSV rather than decoding an existing PDF.',
  },

  {
    id: 'edit-pdf',
    name: 'Edit PDF',
    route: '/edit-pdf',
    processingClass: 'C',
    inputMetric: 'bytes-pages',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'high',
    cpuIntensity: 'medium',
    storageIntensity: 'medium',
    pageComplexity: true,
    pixelComplexity: false,
    outputGrowth: 'similar',
    recovery: 'workspace',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'conservative',
    notes:
      'Preview uses PDF.js while final overlay application parses and serializes the whole document.',
  },

  {
    id: 'code-to-pdf',
    name: 'Code to PDF',
    route: '/code-to-pdf',
    processingClass: 'A',
    inputMetric: 'text-size',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'low',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: false,
    pixelComplexity: false,
    outputGrowth: 'variable',
    recovery: 'atomic-restart',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Vector PDF generation from text/code; no source PDF object graph.',
  },

  {
    id: 'html-to-pdf',
    name: 'HTML / Receipt to PDF',
    route: '/html-to-pdf',
    processingClass: 'A',
    inputMetric: 'text-size',
    multiFile: false,
    aggregateInputBytes: false,
    memoryIntensity: 'medium',
    cpuIntensity: 'medium',
    storageIntensity: 'low',
    pageComplexity: false,
    pixelComplexity: false,
    outputGrowth: 'variable',
    recovery: 'atomic-restart',
    usesOpfs: true,
    usesWorker: false,
    desktopReadiness: 'ready',
    notes:
      'Semantic/vector HTML conversion; source is text rather than a decoded PDF.',
  },
] as const;

export const TOOL_CAPACITY_PROFILE_COUNT =
  TOOL_CAPACITY_PROFILES.length;

export function getToolCapacityProfile(
  idOrRoute: string
): ToolCapacityProfile | null {
  return (
    TOOL_CAPACITY_PROFILES.find(
      (profile) =>
        profile.id === idOrRoute ||
        profile.route === idOrRoute
    ) || null
  );
}

export function getToolProfilesByClass(
  processingClass: ProcessingClass
): readonly ToolCapacityProfile[] {
  return TOOL_CAPACITY_PROFILES.filter(
    (profile) =>
      profile.processingClass ===
      processingClass
  );
}

export function getDesktopReadyProfiles():
readonly ToolCapacityProfile[] {
  return TOOL_CAPACITY_PROFILES.filter(
    (profile) =>
      profile.desktopReadiness ===
      'ready'
  );
}

/*
 * Keep the audited registry complete.
 *
 * This has no runtime effect on tool processing.
 */
if (
  TOOL_CAPACITY_PROFILE_COUNT !== 43
) {
  console.warn(
    `1into1 capacity registry expected 43 tools but found ${TOOL_CAPACITY_PROFILE_COUNT}.`
  );
}
