import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  FileText,
  X,
  AlertCircle,
  Copy,
  Check,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { extractMarkdownFromPDF, type ExtractedMarkdownResult } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface PdfToMarkdownProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const PdfToMarkdown: React.FC<PdfToMarkdownProps> = ({ file, onFileChange }) => {
  const [detectHeadings, setDetectHeadings] = useState(true);
  const [detectLists, setDetectLists] = useState(true);
  const [joinHyphenatedWords, setJoinHyphenatedWords] = useState(true);

  const [mdResult, setMdResult] = useState<ExtractedMarkdownResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progressStatus, setProgressStatus] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const handleExtraction = async () => {
    if (!file) return;
    setIsExtracting(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const result = await extractMarkdownFromPDF(file, {
        detectHeadings,
        detectLists,
        joinHyphenatedWords,
        onProgress: (curr, total) => setProgressStatus(`Parsing page ${curr} of ${total}...`),
      });

      if (!result.markdown.trim()) {
        setErrorMessage('No selectable text found in this PDF. Use "OCR Searchable" first for scanned files.');
        setMdResult(null);
      } else {
        setMdResult(result);
        const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8;' });
        createUrl(blob);
      }
    } catch (err: any) {
      console.error('Markdown extraction error:', err);
      setErrorMessage(err.message || 'Failed to extract Markdown.');
      setMdResult(null);
    } finally {
      setIsExtracting(false);
      setProgressStatus('');
    }
  };

  useEffect(() => {
    if (!file) {
      setMdResult(null);
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }
    handleExtraction();
  }, [file, detectHeadings, detectLists, joinHyphenatedWords]);

  const handleCopy = () => {
    if (!mdResult) return;
    navigator.clipboard.writeText(mdResult.markdown);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleClear = () => {
    onFileChange(null);
    setMdResult(null);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to convert to Markdown"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === 'application/pdf') {
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <FileCode className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF to convert to Markdown (.md)</p>
          <p className="text-xs text-zinc-500 mt-1">Ready for LLMs, NotebookLM, & RAG • Zero Server Uploads</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                onFileChange(selected);
              }
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-6 text-left">
          {/* File Card */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {mdResult
                    ? `~${mdResult.estimatedTokens.toLocaleString()} tokens • ${mdResult.wordCount.toLocaleString()} words`
                    : `${Math.round(file.size / 1024)} KB`}
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Option Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs text-zinc-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={detectHeadings}
                onChange={(e) => setDetectHeadings(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
              />
              <span>Detect Headings (#, ##)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={detectLists}
                onChange={(e) => setDetectLists(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
              />
              <span>Clean Bullet Lists</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={joinHyphenatedWords}
                onChange={(e) => setJoinHyphenatedWords(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
              />
              <span>Join Hyphenated Words</span>
            </label>
          </div>

          {/* Markdown Output Area */}
          {isExtracting ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 bg-zinc-950/50 rounded-xl border border-zinc-800 text-xs text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span>{progressStatus || 'Structuring Markdown...'}</span>
            </div>
          ) : mdResult ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Structured Markdown Preview
                </span>
                <span className="text-zinc-500">
                  {mdResult.charCount.toLocaleString()} chars
                </span>
              </div>

              <div className="relative">
                <textarea
                  readOnly
                  value={mdResult.markdown}
                  rows={12}
                  className="w-full font-mono text-xs p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none focus:border-zinc-700 resize-none selection:bg-emerald-500 selection:text-black leading-relaxed"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs shadow-md backdrop-blur-sm"
                  title="Copy to clipboard"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy MD</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Button */}
          {downloadUrl && (
            <div className="pt-2">
              <a
                href={downloadUrl}
                download={`${file.name.replace(/\.[^/.]+$/, '')}.md`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download .md File</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};