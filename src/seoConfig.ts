export interface ToolMeta {
  path: string;
  title: string;
  description: string;
  heading: string;
  subheading: string;
}

export const TOOLS_METADATA: Record<string, ToolMeta> = {
  '/': {
    path: '/',
    title: '1into1 PDF — Free, Private PDF & Image Tools (Zero Uploads)',
    description: 'Compress, merge, split, OCR, and convert PDFs and HEIC images 100% locally in your browser. Disconnect your internet and test—files never leave your device.',
    heading: 'Free PDF Tools That Never Upload Your Files',
    subheading: 'Local-first processing powered by your browser memory. Turn off your Wi-Fi and everything still works.',
  },
  '/compress-pdf': {
    path: '/compress-pdf',
    title: 'Compress PDF Offline — Reduce File Size Privately',
    description: 'Compress PDF documents client-side without uploading to any server. Fast, lossless, and secure.',
    heading: 'Compress PDF Locally',
    subheading: 'Reduce PDF file size securely in your browser with zero data transmission.',
  },
  '/merge-pdf': {
    path: '/merge-pdf',
    title: 'Merge PDF Online & Offline — Combine PDF Files Privately',
    description: 'Merge multiple PDF files into one single document client-side with zero data uploads.',
    heading: 'Merge Multiple PDFs',
    subheading: 'Combine and organize your documents without sending files to remote servers.',
  },
  '/split-pdf': {
    path: '/split-pdf',
    title: 'Split PDF Pages Privately — Zero Server Uploads',
    description: 'Extract pages or split PDF documents into multiple files completely offline.',
    heading: 'Split PDF Documents',
    subheading: 'Separate individual pages or ranges locally on your device.',
  },
  '/image-to-pdf': {
    path: '/image-to-pdf',
    title: 'Convert Images to PDF — JPG, PNG to PDF Locally',
    description: 'Convert JPG, PNG, and WebP images to high-quality PDF files directly in your browser.',
    heading: 'Image to PDF Converter',
    subheading: 'Bundle images into a clean PDF document without cloud processing.',
  },
  '/pdf-to-jpg': {
    path: '/pdf-to-jpg',
    title: 'Convert PDF to JPG Images — High Resolution & Private',
    description: 'Render and extract high-resolution JPG images from any PDF file locally.',
    heading: 'PDF to High-Res JPG',
    subheading: 'Export each PDF page as an image directly in your browser session.',
  },
  '/heic-to-jpg': {
    path: '/heic-to-jpg',
    title: 'HEIC to JPG Converter Online & Private (EXIF Stripped) | 1into1',
    description: 'Convert iPhone HEIC/HEIF photos to JPG locally in your browser. Automatically strip GPS location and private camera EXIF data with zero server uploads.',
    heading: 'Convert HEIC to JPG & Strip EXIF',
    subheading: 'Convert Apple photos to standard JPG and remove sensitive GPS metadata locally.',
  },
  '/remove-pages': {
    path: '/remove-pages',
    title: 'Delete PDF Pages — Clean & Remove Unwanted Pages',
    description: 'Remove unwanted pages from your PDF file without uploading confidential data.',
    heading: 'Remove PDF Pages',
    subheading: 'Select and permanently delete pages from your document in memory.',
  },
  '/watermark-pdf': {
    path: '/watermark-pdf',
    title: 'Add Watermark to PDF — In-Browser PDF Protection',
    description: 'Add custom text watermarks to all PDF pages securely without server uploads.',
    heading: 'Stamp PDF Watermark',
    subheading: 'Protect confidential files by adding custom stamps locally.',
  },
  '/page-numbers': {
    path: '/page-numbers',
    title: 'Add Page Numbers to PDF — Flexible Formatting Locally',
    description: 'Number PDF pages with customizable positioning and styles completely offline.',
    heading: 'Insert Page Numbers',
    subheading: 'Add sequential pagination across your PDF without tracking.',
  },
  '/extract-text': {
    path: '/extract-text',
    title: 'Extract Text from PDF — Private In-Browser Text Reader',
    description: 'Extract raw text from PDF files directly inside the browser using WebAssembly.',
    heading: 'Extract PDF Text',
    subheading: 'Copy raw text content from your documents with zero network requests.',
  },
  '/sign-pdf': {
    path: '/sign-pdf',
    title: 'Sign PDF Document Privately — Draw & Place Signatures',
    description: 'Electronically sign contracts and forms directly in your browser without cloud uploads.',
    heading: 'Sign PDF Online & Offline',
    subheading: 'Draw and place your electronic signature securely on any PDF page.',
  },
  '/protect-pdf': {
    path: '/protect-pdf',
    title: 'Password Protect PDF — 128-bit Client-Side Encryption',
    description: 'Encrypt your PDF files with standard password protection without sending files over the web.',
    heading: 'Password Protect PDF',
    subheading: 'Apply 128-bit encryption directly inside your browser.',
  },
  '/unlock-pdf': {
    path: '/unlock-pdf',
    title: 'Unlock Protected PDF — Remove PDF Password Locally',
    description: 'Decrypt and remove password restrictions from your PDF files without server logs.',
    heading: 'Unlock PDF Document',
    subheading: 'Decrypt and save an unrestricted copy entirely on your machine.',
  },
  '/edit-metadata': {
    path: '/edit-metadata',
    title: 'Edit PDF Metadata — Clean Title, Author, Keywords Privately',
    description: 'Inspect and edit title, author, subject, and producer metadata of any PDF locally.',
    heading: 'Edit Document Metadata',
    subheading: 'View or scrub embedded metadata tags cleanly in your browser.',
  },
  '/rotate-pdf': {
    path: '/rotate-pdf',
    title: 'Rotate PDF Pages — Change Orientation In-Browser',
    description: 'Rotate PDF pages permanently by 90, 180, or 270 degrees without server uploads.',
    heading: 'Rotate PDF Pages',
    subheading: 'Reorient landscape and portrait pages directly in local memory.',
  },
  '/organize-pdf': {
    path: '/organize-pdf',
    title: 'Organize PDF Pages — Reorder, Rotate & Delete Pages Free',
    description: 'Visually organize, reorder, rotate, and delete pages from PDF documents locally in your browser. 100% private, zero server uploads.',
    heading: 'Organize PDF Pages',
    subheading: 'Drag and drop page thumbnails to reorder, rotate, or delete pages in memory.',
  },
  '/sanitize-pdf': {
    path: '/sanitize-pdf',
    title: 'Sanitize PDF — Strip Hidden Metadata & Tracking Tags',
    description: 'Remove author, creation dates, software fingerprints, and XMP metadata from PDF files in your browser. 100% private and offline.',
    heading: 'Sanitize PDF Metadata',
    subheading: 'Wipe hidden tracking identifiers, hardware signatures, and author data before sharing.',
  },
};