import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Moon,
  Eye,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { invertPDF, type DarkModeFilter } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface DarkModePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const DarkModePdf: React.FC<DarkModePdfProps> = ({ file, onFileChange }) => {
  const [filter, setFilter] = useState<DarkModeFilter>('oled');
  const [totalPages, setTotalPages] = useState<number>(0);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Generate real-time live preview of page 1
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setTotalPages(0);
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        if (!isMounted) return;

        setTotalPages(pdf.numPages);
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.8 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await page.render({
            canvasContext: ctx as any,
            viewport,
          } as any).promise;

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if (filter === 'invert') {
              data[i] = 255 - r;
              data[i + 1] = 255 - g;
              data[i + 2] = 255 - b;
            } else if (filter === 'oled') {
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              if (lum > 210) {
                data[i] = 12;
                data[i + 1] = 12;
                data[i + 2] = 12;
              } else if (lum < 80) {
                data[i] = 230;
                data[i + 1] = 230;
                data[i + 2] = 230;
              } else {
                data[i] = 255 - r;
                data[i + 1] = 255 - g;
                data[i + 2] = 255 - b;
              }
            } else if (filter === 'sepia') {
              const tr = 0.393 * r + 0.769 * g + 0.189 * b;
              const tg = 0.349 * r + 0.686 * g + 0.168 * b;
              const tb = 0.272 * r + 0.534 * g + 0.131 * b;
              data[i] = Math.min(255, tr);
              data[i + 1] = Math.min(255, tg);
              data[i + 2] = Math.min(255, tb);
            }
          }

          ctx.putImageData(imgData, 0, 0);
          if (isMounted) {
            setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
          }
        }
        canvas.width = 0;
        canvas.height = 0;
      } catch (err) {
        console.error('Preview error:', err);
        if (isMounted) setErrorMessage('Could not render document preview.');
      } finally {
        if (isMounted) setIsLoadingPreview(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file, filter]);

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await invertPDF(file, {
        filter,
        onProgress: (curr, total) => {
          setProgressText(`Converting page ${curr} of ${total} to dark mode...`);
        },
      });

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Dark mode conversion error:', err);
      setErrorMessage(err.message || 'Failed to invert PDF colors.');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setPreviewUrl(null);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  const filterOptions: { id: DarkModeFilter; label: string; desc: string }[] = [
    { id: 'oled', label: 'OLED Pitch Black', desc: 'True black background, soft white text' },
    { id: 'invert', label: 'Classic Inversion', desc: 'Exact RGB negative of entire page' },
    { id: 'sepia', label: 'Warm Sepia', desc: 'Low blue-light amber reading filter' },
  ];

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to invert colors or enable dark mode"
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
          <Moon className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here for Dark Mode / Invert Colors</p>
          <p className="text-xs text-zinc-500 mt-1">OLED black, classic negative, or warm reading sepia</p>
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
                  {totalPages > 0 ? `${totalPages} Pages • ` : ''}
                  {Math.round(file.size / 1024)} KB
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

          {/* Preset Selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Reading Theme</label>
            <div className="grid grid-cols-3 gap-2">
              {filterOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setFilter(opt.id);
                    revokeDownloadUrl();
                  }}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    filter === opt.id
                      ? 'border-emerald-500 bg-emerald-950/40'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold ${
                      filter === opt.id ? 'text-emerald-400' : 'text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Live Page 1 Preview Card */}
          {previewUrl && (
            <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 flex flex-col items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 self-start">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Page 1 Live Preview:</span>
              </div>
              <div className="w-40 aspect-[3/4] bg-zinc-900 rounded border border-zinc-700 overflow-hidden flex items-center justify-center shadow-inner">
                {isLoadingPreview ? (
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                ) : (
                  <img src={previewUrl} alt="Dark Mode Preview" className="w-full h-full object-contain" />
                )}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger / Download */}
          {!downloadUrl ? (
            <button
              onClick={handleConvert}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Transforming color space...'}</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 stroke-[2.5]" />
                  <span>Convert Document to Dark Mode</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Dark Mode Document Generated Successfully
              </div>
              <a
                href={downloadUrl}
                download={`darkmode_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Dark Mode PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};