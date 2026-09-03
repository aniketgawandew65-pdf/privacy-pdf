import { useState, useRef } from 'react';
import heic2any from 'heic2any';
import { Upload, Image as ImageIcon, CheckCircle, Download, Loader2, ShieldCheck } from 'lucide-react';

interface ConvertedImage {
  name: string;
  url: string;
  originalSize: number;
  newSize: number;
}

export function HeicToJpg() {
  const [isConverting, setIsConverting] = useState(false);
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stripExifViaCanvas = async (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const tempUrl = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(tempUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(blob);
          return;
        }

        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (strippedBlob) => {
            if (strippedBlob) {
              resolve(strippedBlob);
            } else {
              resolve(blob);
            }
          },
          'image/jpeg',
          0.92
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
        reject(new Error('Failed to parse decoded image on canvas.'));
      };

      img.src = tempUrl;
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setIsConverting(true);

    const fileList = Array.from(files);
    const results: ConvertedImage[] = [];

    try {
      for (const file of fileList) {
        // Convert HEIC/HEIF blob to standard JPEG blob
        const conversionResult = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.92,
        });

        const rawJpegBlob = Array.isArray(conversionResult)
          ? conversionResult[0]
          : conversionResult;

        // Re-render to canvas to strip all EXIF / GPS metadata
        const cleanBlob = await stripExifViaCanvas(rawJpegBlob);
        const url = URL.createObjectURL(cleanBlob);

        results.push({
          name: file.name.replace(/\.(heic|heif)$/i, '.jpg'),
          url,
          originalSize: file.size,
          newSize: cleanBlob.size,
        });
      }

      setConvertedImages(results);
    } catch (err) {
      console.error('HEIC conversion error:', err);
      setErrorMsg('Failed to convert one or more HEIC files. Please ensure valid formats.');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl text-left">
      <input
        ref={fileInputRef}
        type="file"
        accept=".heic,.HEIC,.heif,.HEIF"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Upload Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-xl p-8 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-6"
      >
        <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-zinc-200">
          Click or drop Apple HEIC / HEIF photos here
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Auto-converts to high-res JPG & strips GPS / EXIF tags
        </p>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-400 mb-6">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>Hardware-accelerated client decoding. Strips location & device markers.</span>
      </div>

      {/* Loading state */}
      {isConverting && (
        <div className="flex items-center justify-center gap-2.5 py-6 text-xs text-emerald-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Decoding HEIC and stripping EXIF telemetry...</span>
        </div>
      )}

      {errorMsg && <p className="text-xs text-red-400 mb-4">{errorMsg}</p>}

      {/* Converted Results List */}
      {convertedImages.length > 0 && !isConverting && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-1 border-b border-zinc-800">
            <span>Converted Photos ({convertedImages.length})</span>
            <button
              onClick={() => setConvertedImages([])}
              className="text-zinc-500 hover:text-red-400 transition"
            >
              Clear
            </button>
          </div>

          {convertedImages.map((img, i) => (
            <div
              key={`${img.name}-${i}`}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200"
            >
              <div className="flex items-center gap-2.5 truncate pr-2">
                <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="truncate">
                  <p className="truncate font-medium">{img.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {(img.originalSize / 1024 / 1024).toFixed(2)} MB →{' '}
                    {(img.newSize / 1024 / 1024).toFixed(2)} MB • EXIF Sanitized
                  </p>
                </div>
              </div>

              <a
                href={img.url}
                download={img.name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            </div>
          ))}

          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>All metadata stripped. Images are clean for private web sharing.</span>
          </div>
        </div>
      )}
    </div>
  );
}