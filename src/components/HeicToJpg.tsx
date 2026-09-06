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
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<boolean>(false);

  // Attempt instant native hardware decode first (Safari, macOS Chromium)
  const decodeNative = async (file: File): Promise<Blob | null> => {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return null;
      }

      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );

      canvas.width = 0;
      canvas.height = 0;
      return blob;
    } catch {
      return null;
    }
  };

  // Safe fallback to heic2any with a 20s timeout race
  const decodeWithHeic2Any = async (file: File): Promise<Blob> => {
    const conversionPromise = (async () => {
      const safeBlob = new Blob([await file.arrayBuffer()], { type: 'image/heic' });
      const conversionResult: any = await heic2any({
        blob: safeBlob,
        toType: 'image/jpeg',
        quality: 0.92,
      } as any);

      return Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `"${file.name}" timed out. It may contain complex Apple ProRAW or HDR GainMap data.`
            )
          ),
        20000
      )
    );

    return Promise.race([conversionPromise, timeoutPromise]);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setErrorMsg(null);
    setIsConverting(true);
    abortRef.current = false;

    const fileList = Array.from(files);
    const results: ConvertedImage[] = [];
    const failedNames: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      if (abortRef.current) break;

      const file = fileList[i];
      setProgressStatus(`Converting ${i + 1} of ${fileList.length}: ${file.name}...`);

      try {
        // Step 1: Try native decode first (sub-second)
        let jpegBlob = await decodeNative(file);

        // Step 2: Fallback to heic2any if native isn't supported
        if (!jpegBlob) {
          jpegBlob = await decodeWithHeic2Any(file);
        }

        if (jpegBlob) {
          const url = URL.createObjectURL(jpegBlob);
          results.push({
            name: file.name.replace(/\.(heic|heif)$/i, '.jpg'),
            url,
            originalSize: file.size,
            newSize: jpegBlob.size,
          });
        } else {
          failedNames.push(file.name);
        }
      } catch (err: any) {
        console.error(`Error converting ${file.name}:`, err);
        failedNames.push(file.name);
      }
    }

    setConvertedImages((prev) => [...prev, ...results]);
    setIsConverting(false);
    setProgressStatus('');

    if (failedNames.length > 0) {
      setErrorMsg(
        `Could not convert ${failedNames.length} file(s): ${failedNames.join(
          ', '
        )}. Files may be corrupted or use an unsupported Apple HDR codec.`
      );
    }
  };

  const handleCancel = () => {
    abortRef.current = true;
    setIsConverting(false);
    setProgressStatus('');
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
          e.target.value = ''; // Reset input to allow re-uploading the same file
        }}
      />

      {/* Upload Zone */}
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
          Auto-converts to standard high-res JPG & strips GPS / EXIF tags
        </p>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-400 mb-6">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>Hardware-accelerated client decoding. Strips location &amp; device markers.</span>
      </div>

      {/* Active Conversion State with Abort Option */}
      {isConverting && (
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5 text-xs text-emerald-400 truncate">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="truncate">{progressStatus || 'Processing photos...'}</span>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="px-2.5 py-1 text-xs rounded-lg border border-red-900/60 bg-red-950/30 text-red-400 hover:bg-red-900/40 transition shrink-0 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error Notice */}
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300 mb-6"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Converted Results List */}
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
                      {(img.newSize / 1024 / 1024).toFixed(2)} MB • EXIF Sanitized
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
            <span>All metadata stripped. Images are clean for private web sharing.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default HeicToJpg;