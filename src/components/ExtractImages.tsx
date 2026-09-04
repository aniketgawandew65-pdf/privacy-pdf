import React, { useState, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Images,
  Archive,
  HelpCircle,
} from 'lucide-react';
import {
  extractImagesFromPDF,
  packageImagesToZip,
  type ExtractedImage,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface ExtractImagesProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const ExtractImages: React.FC<ExtractImagesProps> = ({ file, onFileChange }) => {
  const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: zipUrl, createUrl, revoke: revokeZipUrl } = useObjectUrl();

  const handleScanAndExtract = async () => {
    if (!file) return;
    setIsScanning(true);
    setErrorMessage(null);
    revokeZipUrl();

    try {
      const results = await extractImagesFromPDF(file, (curr, total) => {
        setProgressText(`Scanning page ${curr} of ${total} for embedded images...`);
      });

      setExtractedImages(results);
      setHasScanned(true);

      if (results.length > 0) {
        setProgressText('Bundling images into ZIP archive...');
        const zipBlob = await packageImagesToZip(results, file.name);
        createUrl(zipBlob);
      }
    } catch (err: any) {
      console.error('Image extraction error:', err);
      setErrorMessage(err.message || 'Failed to extract images from PDF.');
    } finally {
      setIsScanning(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setExtractedImages([]);
    setHasScanned(false);
    revokeZipUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to extract embedded images"
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
          <Images className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to extract embedded images</p>
          <p className="text-xs text-zinc-500 mt-1">Isolate photos, diagrams, and figures in full original resolution</p>
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
                  {Math.round(file.size / 1024)} KB
                  {hasScanned && ` • ${extractedImages.length} images found`}
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

          {/* Trigger Scan if Not Run */}
          {!hasScanned && (
            <button
              onClick={handleScanAndExtract}
              disabled={isScanning}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Scanning PDF for images...'}</span>
                </>
              ) : (
                <>
                  <Images className="w-4 h-4 stroke-[2.5]" />
                  <span>Scan & Extract Embedded Images</span>
                </>
              )}
            </button>
          )}

          {/* No Images Found Notice */}
          {hasScanned && extractedImages.length === 0 && !isScanning && (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/30 flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200/90 space-y-1">
                <p className="font-semibold">No embedded bitmap images found</p>
                <p className="text-zinc-400 leading-relaxed">
                  This PDF contains pure vector drawings or selectable text without embedded raster photos. To convert whole pages into image files, use{' '}
                  <span className="text-emerald-400 font-medium">PDF to JPG</span>.
                </p>
              </div>
            </div>
          )}

          {/* Extracted Images Gallery */}
          {extractedImages.length > 0 && (
            <div className="space-y-4">
              {zipUrl && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl">
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Found {extractedImages.length} embedded images</span>
                  </div>
                  <a
                    href={zipUrl}
                    download={`${file.name.replace(/\.[^/.]+$/, '')}_images.zip`}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition shadow"
                  >
                    <Archive className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Download All as ZIP</span>
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[420px] overflow-y-auto p-1 pr-2 scrollbar-thin">
                {extractedImages.map((img) => (
                  <div
                    key={img.id}
                    className="flex flex-col bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden group hover:border-zinc-700 transition"
                  >
                    <div className="w-full aspect-square bg-zinc-900 flex items-center justify-center p-2 overflow-hidden">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="p-2 flex items-center justify-between border-t border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {img.width}×{img.height}
                      </span>
                      <a
                        href={img.dataUrl}
                        download={img.name}
                        className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition"
                        title="Download image"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
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
        </div>
      )}
    </div>
  );
};