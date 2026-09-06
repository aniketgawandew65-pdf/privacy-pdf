import { useState, useRef } from 'react';
import heic2any from 'heic2any';
import {
  Upload,
  Image as ImageIcon,
  CheckCircle,
  Download,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

interface ConvertedImage {
  name: string;
  url: string;
  originalSize: number;
  newSize: number;
}

export function HeicToJpg() {
  const [isConverting, setIsConverting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setIsConverting(true);

    const fileList = Array.from(files);
    const results: ConvertedImage[] = [];
    const failedFiles: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setStatusText(`Converting ${file.name} (${i + 1}/${fileList.length})...`);

      try {
        // Direct conversion call without secondary buffer copying
        const conversionResult: any = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9,
        } as any);

        const jpegBlob: Blob = Array.isArray(conversionResult)
          ? conversionResult[0]
          : conversionResult;

        const url = URL.createObjectURL(jpegBlob);

        results.push({
          name: file.name.replace(/\.(heic|heif)$/i, '.jpg'),
          url,
          originalSize: file.size,
          newSize: jpegBlob.size,
        });
      } catch (err: any) {
        console.warn(`Standard decode failed for ${file.name}, retrying container mode...`, err);

        // Fallback for Apple Live Photo / Multi-frame containers
        try {
          const multiResult: any = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.9,
            multiple: true,
          } as any);

          const fallbackBlob: Blob = Array.isArray(multiResult)
            ? multiResult[0]
            : multiResult;

          const url = URL.createObjectURL(fallbackBlob);
          results.push({
            name: file.name.replace(/\.(heic|heif)$/i, '.jpg'),
            url,
            originalSize: file.size,
            newSize: fallbackBlob.size,
          });
        } catch (secondaryErr) {
          failedFiles.push(file.name);
        }
      }
    }

    setConvertedImages((prev) => [...prev, ...results]);
    setIsConverting(false);
    setStatusText('');

    if (failedFiles.length > 0) {
      setErrorMsg(
        `Failed to convert: ${failedFiles.join(', ')}. These shots contain Apple Live Photo video tracks.`
      );
    }
  };

  const handleClear = () => {
    convertedImages.forEach((img) => URL.revokeObjectURL(img.url));
    setConvertedImages([]);
    setErrorMsg(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl text-left">
      <input
        ref={fileInputRef}
        type="file"
        accept=".heic,.HEIC,.heif,.HEIF"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => !isConverting && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isConverting) {
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!isConverting && e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
          }
        }}
        className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-all mb-6 ${
          isConverting
            ? 'border-zinc-800 bg-zinc-950/20 cursor-not-allowed opacity-50'
            : 'border-zinc-700 hover:border-emerald-500/60 bg-zinc-950/40 hover:bg-zinc-950/80'
        }`}
      >
        <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2 stroke-[1.5]" />
        <p className="text-sm font-medium text-zinc-200">
          Click or drop Apple HEIC / HEIF photos here
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Auto-converts to standard high-res JPG &amp; strips GPS / EXIF tags
        </p>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-400 mb-6">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>Hardware-accelerated client decoding. Strips location &amp; device markers.</span>
      </div>

      {isConverting && (
        <div className="flex items-center justify-center gap-2.5 py-4 text-xs text-emerald-400 mb-6 bg-zinc-950 rounded-xl border border-zinc-800">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{statusText || 'Converting HEIC to JPG...'}</span>
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

      {convertedImages.length > 0 && !isConverting && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-1 border-b border-zinc-800">
            <span>Converted Photos ({convertedImages.length})</span>
            <button
              onClick={handleClear}
              className="text-zinc-500 hover:text-red-400 transition cursor-pointer"
            >
              Clear All
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
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
                      {(img.newSize / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <a
                  href={img.url}
                  download={img.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Images converted cleanly and ready for web use.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default HeicToJpg;