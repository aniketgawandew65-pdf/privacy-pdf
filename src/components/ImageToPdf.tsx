import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Download, Loader2, CheckCircle2, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { imagesToPDF } from '../utils/pdfEngine';

export const ImageToPdf: React.FC = () => {
  const [images, setImages] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelect = (filesList: FileList | null) => {
    if (!filesList) return;
    const validImages = Array.from(filesList).filter((f) => f.type.startsWith('image/'));
    setImages((prev) => [...prev, ...validImages]);
    setDownloadUrl(null);
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
    setDownloadUrl(null);
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setImages(updated);
    setDownloadUrl(null);
  };

  const handleConvert = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    try {
      const pdfBytes = await imagesToPDF(images);
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFilesSelect(e.dataTransfer.files);
        }}
        className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40 mb-6"
      >
        <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
        <p className="text-sm font-semibold text-zinc-200">Drop images here (JPG, PNG, WebP)</p>
        <p className="text-xs text-zinc-500 mt-1">Converts to a clean PDF 100% inside your browser</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelect(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="space-y-4">
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {images.map((img, idx) => (
              <div
                key={`${img.name}-${idx}`}
                className="flex items-center justify-between p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 text-xs"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 font-mono text-[10px]">
                    {idx + 1}
                  </span>
                  <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-zinc-200 truncate font-medium max-w-[180px] sm:max-w-xs">{img.name}</span>
                  <span className="text-zinc-500">({Math.round(img.size / 1024)} KB)</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => moveImage(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveImage(idx, 'down')}
                    disabled={idx === images.length - 1}
                    className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeImage(idx)}
                    className="p-1 text-zinc-500 hover:text-red-400 ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!downloadUrl ? (
            <button
              onClick={handleConvert}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Converting images to PDF...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>Convert {images.length} {images.length === 1 ? 'Image' : 'Images'} to PDF</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Generated Successfully
              </div>
              <a
                href={downloadUrl}
                download="converted_document.pdf"
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};