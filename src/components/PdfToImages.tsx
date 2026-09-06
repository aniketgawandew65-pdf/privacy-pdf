import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  X,
  Image as ImageIcon,
  Archive,
} from 'lucide-react';
import {
  pdfToImages,
  packageImagesToZip,
  type ExtractedImage,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface PdfToImagesProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const PdfToImages: React.FC<PdfToImagesProps> = ({ file, onFileChange }) => {
  const [images, setImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { url: zipUrl, createUrl, revoke: revokeZipUrl } = useObjectUrl();

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressText('Converting pages to JPG...');
    revokeZipUrl();

    try {
      const extractedImages = await pdfToImages(file);
      setImages(extractedImages);

      if (extractedImages.length > 0) {
        setProgressText('Bundling pages into ZIP archive...');
        const imageItems: ExtractedImage[] = await Promise.all(
          extractedImages.map(async (dataUrl, idx) => {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            return {
              id: `page-${idx + 1}`,
              name: `${file.name.replace(/\.[^/.]+$/, '')}_page_${idx + 1}.jpg`,
              blob,
              dataUrl,
              width: 0,
              height: 0,
            };
          })
        );

        const zipBlob = await packageImagesToZip(imageItems, file.name);
        createUrl(zipBlob);
      }
    } catch (err) {
      console.error('PDF to JPG conversion error:', err);
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setImages([]);
    revokeZipUrl();
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to extract JPG pages"
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
            if (e.dataTransfer.files[0]?.type === 'application/pdf') {
              onFileChange(e.dataTransfer.files[0]);
              setImages([]);
              revokeZipUrl();
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to extract JPG pages</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]?.type === 'application/pdf') {
                onFileChange(e.target.files[0]);
                setImages([]);
                revokeZipUrl();
              }
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
                <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {images.length === 0 ? (
            <button
              onClick={handleConvert}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Converting pages to JPG...'}</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>Convert PDF to JPG</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              {/* Header Bar with Count & One-Click ZIP Download */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Extracted {images.length} {images.length === 1 ? 'Page' : 'Pages'}
                  </span>
                </div>
                {zipUrl && (
                  <a
                    href={zipUrl}
                    download={`${file.name.replace(/\.[^/.]+$/, '')}_pages_jpg.zip`}
                    className="w-full sm:w-auto px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Download All as ZIP</span>
                  </a>
                )}
              </div>

              {/* Image Grid Preview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
                {images.map((imgUrl, index) => (
                  <div
                    key={index}
                    className="relative group border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950 p-2"
                  >
                    <img
                      src={imgUrl}
                      alt={`Page ${index + 1}`}
                      className="w-full h-auto object-contain rounded-lg"
                    />
                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Page {index + 1}</span>
                      <a
                        href={imgUrl}
                        download={`page-${index + 1}.jpg`}
                        className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" /> Save
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PdfToImages;