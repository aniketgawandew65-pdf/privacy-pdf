import { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Copy,
  Download,
  Loader2,
  CheckCircle2,
  Sparkles,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { extractTextFromPDF } from '../utils/pdfEngine';

interface PdfToTextProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export function PdfToText({ file, onFileChange }: PdfToTextProps) {
  const [extractedText, setExtractedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressMsg('Analyzing document...');
    setExtractedText('');
    setErrorMsg(null);

    try {
      const result = await extractTextFromPDF(file, (status) => {
        setProgressMsg(status);
      });
      setExtractedText(result);
    } catch (err: any) {
      console.error('Text extraction failed:', err);
      setErrorMsg(err.message || 'Failed to extract text from this document.');
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
          setErrorMsg(null);
          e.target.value = '';
        }}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === 'application/pdf') {
              onFileChange(dropped);
              setExtractedText('');
              setErrorMsg(null);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-xl p-8 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-6"
        >
          <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-medium text-zinc-200">Click or drop a PDF to extract text</p>
          <p className="text-xs text-zinc-500 mt-1">
            Auto-detects digital documents, legal agreements, and physical scans
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
            type="button"
            onClick={() => {
              onFileChange(null);
              setExtractedText('');
              setErrorMsg(null);
            }}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300 mb-6"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {file && !extractedText && (
        <button
          type="button"
          onClick={handleProcess}
          disabled={isProcessing}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-emerald-500/20 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{progressMsg || 'Processing document...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Extract Text</span>
            </>
          )}
        </button>
      )}

      {extractedText && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Extracted Content</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex items-center gap-1 text-zinc-300 hover:text-white transition cursor-pointer"
              >
                {copied ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={downloadTextFile}
                className="flex items-center gap-1 text-zinc-300 hover:text-white transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .txt</span>
              </button>
            </div>
          </div>

          <textarea
            readOnly
            value={extractedText}
            className="w-full h-64 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-none resize-none scrollbar-thin"
          />
        </div>
      )}
    </div>
  );
}

export default PdfToText;