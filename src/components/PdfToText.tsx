import { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Upload,
  FileText,
  Copy,
  Download,
  Loader2,
  CheckCircle2,
  ScanText,
  Sparkles,
} from 'lucide-react';

// Configure pdfjs worker if not already globally set
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface PdfToTextProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export function PdfToText({ file, onFileChange }: PdfToTextProps) {
  const [extractedText, setExtractedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [useOcr, setUseOcr] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fast digital extraction from embedded PDF text layers
  const extractDigitalText = async (fileData: File): Promise<string> => {
    const arrayBuffer = await fileData.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      setProgressMsg(`Reading digital layer: page ${i} of ${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items
        .map((item: any) => item.str || '')
        .filter(Boolean);

      if (strings.length > 0) {
        fullText += `--- Page ${i} ---\n` + strings.join(' ') + '\n\n';
      }
    }

    return fullText.trim();
  };

  // Optical Character Recognition for scanned pages via Tesseract.js
  const extractOcrText = async (fileData: File): Promise<string> => {
    const arrayBuffer = await fileData.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    setProgressMsg('Initializing local OCR engine...');
    const worker = await createWorker('eng');

    for (let i = 1; i <= pdf.numPages; i++) {
      setProgressMsg(`Rendering page ${i} for OCR...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) continue;

      // Render PDF page to canvas with explicit any casting to satisfy TypeScript
      await (page.render({ canvasContext: ctx as any, viewport } as any)).promise;

      // Run Tesseract recognition on the rendered canvas
      setProgressMsg(`Recognizing scanned text on page ${i} of ${pdf.numPages}...`);
      const { data } = await worker.recognize(canvas);

      if (data.text.trim()) {
        fullText += `--- Page ${i} (OCR) ---\n` + data.text.trim() + '\n\n';
      }
    }

    await worker.terminate();
    return fullText.trim();
  };

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressMsg('Analyzing document...');
    setExtractedText('');

    try {
      let result = '';
      if (useOcr) {
        result = await extractOcrText(file);
      } else {
        result = await extractDigitalText(file);
        // Fallback to OCR if digital layer has no text
        if (!result) {
          setProgressMsg('No digital text layer found. Running Tesseract OCR fallback...');
          result = await extractOcrText(file);
        }
      }

      setExtractedText(result || 'No readable text could be identified in this document.');
    } catch (err) {
      console.error('Text extraction failed:', err);
      setProgressMsg('Error extracting text. Document may be encrypted or corrupted.');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadTextFile = () => {
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace(/\.[^/.]+$/, '') || 'extracted'}-text.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl text-left">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] || null;
          onFileChange(selected);
          setExtractedText('');
        }}
      />

      {/* Upload Zone */}
      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-xl p-8 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-6"
        >
          <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-200">Click or drop a PDF to extract text</p>
          <p className="text-xs text-zinc-500 mt-1">
            Supports native digital text and scanned OCR documents
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mb-6">
          <div className="flex items-center gap-3 truncate pr-2">
            <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="truncate">
              <p className="text-xs font-semibold text-zinc-200 truncate">{file.name}</p>
              <p className="text-[11px] text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button
            onClick={() => {
              onFileChange(null);
              setExtractedText('');
            }}
            className="text-xs text-zinc-400 hover:text-red-400 transition shrink-0"
          >
            Change
          </button>
        </div>
      )}

      {/* OCR Toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 mb-6">
        <div className="flex items-center gap-2">
          <ScanText className="w-4 h-4 text-emerald-400" />
          <div>
            <p className="text-xs font-medium text-zinc-200">Force Deep OCR (Scanned Paper)</p>
            <p className="text-[10px] text-zinc-500">
              Uses Tesseract WebAssembly to read physical document scans
            </p>
          </div>
        </div>
        <input
          type="checkbox"
          checked={useOcr}
          onChange={(e) => setUseOcr(e.target.checked)}
          className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
        />
      </div>

      {/* Action Button */}
      {file && !extractedText && (
        <button
          onClick={handleProcess}
          disabled={isProcessing}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-emerald-500/20"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{progressMsg || 'Processing...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Extract Text</span>
            </>
          )}
        </button>
      )}

      {/* Extracted Output */}
      {extractedText && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Extracted Content</span>
            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1 text-zinc-300 hover:text-white transition"
              >
                {copied ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                onClick={downloadTextFile}
                className="flex items-center gap-1 text-zinc-300 hover:text-white transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .txt</span>
              </button>
            </div>
          </div>

          <textarea
            readOnly
            value={extractedText}
            className="w-full h-48 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-none resize-none"
          />
        </div>
      )}
    </div>
  );
}