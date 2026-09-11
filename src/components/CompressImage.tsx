import { useEffect, useRef, useState, type DragEvent } from 'react';
import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';
import {
  Upload,
  Download,
  Loader2,
  Image as ImageIcon,
  ShieldCheck,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface CompressedResult {
  name: string;
  url: string;
  originalSize: number;
  newSize: number;
  type: string;
}

const TARGET_PRESETS = [100, 200, 500, 1000];

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isHeic(file: File) {
  return (
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  );
}

async function prepareImage(file: File): Promise<File> {
  if (!isHeic(file)) {
    return file;
  }

  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.95,
  } as any);

  const blob: Blob = Array.isArray(result)
    ? result[0]
    : result;

  const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');

  return new File(
    [blob],
    newName,
    {
      type: 'image/jpeg',
      lastModified: Date.now(),
    }
  );
}

export function CompressImage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<CompressedResult[]>([]);

  const [targetKb, setTargetKb] = useState(200);
  const [removeMetadata, setRemoveMetadata] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const clearResults = () => {
    results.forEach((result) => URL.revokeObjectURL(result.url));
    setResults([]);
  };

  useEffect(() => {
    return () => {
      results.forEach((result) => URL.revokeObjectURL(result.url));
    };
  }, [results]);

  const validateFiles = (incoming: File[]) => {
    return incoming.filter((file) => {
      return (
        file.type.startsWith('image/') ||
        /\.(jpg|jpeg|png|webp|bmp|heic|heif|avif)$/i.test(file.name)
      );
    });
  };

  const selectFiles = (incoming: File[]) => {
    const valid = validateFiles(incoming);

    setError(null);
    clearResults();

    if (!valid.length) {
      setFiles([]);
      setError(
        'Choose JPG, JPEG, PNG, WebP, BMP, HEIC, HEIF or another browser-supported image.'
      );
      return;
    }

    if (valid.length > 20) {
      setFiles(valid.slice(0, 20));
      setError('Up to 20 images can be processed at once.');
      return;
    }

    setFiles(valid);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    selectFiles(
      Array.from(event.dataTransfer.files)
    );
  };

  const compressImages = async () => {
    if (!files.length || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setProgress(0);
    clearResults();

    const completed: CompressedResult[] = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const original = files[index];

        setStatus(
          `Compressing ${original.name} (${index + 1}/${files.length})`
        );

        const prepared = await prepareImage(original);

        const requestedMb = Math.max(
          0.02,
          targetKb / 1024
        );

        /*
         * If metadata removal is ON and the file is already smaller
         * than the requested target, force a light browser re-encode.
         * This prevents us from simply returning the untouched file
         * with its original metadata.
         */
        const maxSizeMB =
          removeMetadata &&
          prepared.size <= targetKb * 1024
            ? Math.max(
                0.02,
                (prepared.size * 0.97) /
                  (1024 * 1024)
              )
            : requestedMb;

        const compressed = await imageCompression(
          prepared,
          {
            maxSizeMB,
            useWebWorker: true,

            /*
             * OFF = ask the compressor to retain EXIF where supported.
             * ON = metadata is intentionally removed.
             */
            preserveExif: !removeMetadata,

            maxWidthOrHeight: 8192,
            initialQuality: 0.92,

            onProgress: (fileProgress) => {
              const overall =
                ((index + fileProgress / 100) /
                  files.length) *
                100;

              setProgress(
                Math.min(100, Math.round(overall))
              );
            },
          }
        );

        const outputName =
          isHeic(original)
            ? original.name.replace(
                /\.(heic|heif)$/i,
                '.jpg'
              )
            : compressed.name || original.name;

        completed.push({
          name: outputName,
          url: URL.createObjectURL(compressed),
          originalSize: original.size,
          newSize: compressed.size,
          type: compressed.type,
        });
      }

      setResults(completed);
      setProgress(100);
      setStatus(
        `${completed.length} image${
          completed.length === 1 ? '' : 's'
        } ready`
      );
    } catch (err) {
      console.error(err);

      completed.forEach((item) =>
        URL.revokeObjectURL(item.url)
      );

      setError(
        'This image could not be compressed in the browser. Try JPG, PNG, WebP or HEIC.'
      );

      setStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAll = () => {
    clearResults();
    setFiles([]);
    setError(null);
    setProgress(0);
    setStatus('');

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5">

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="rounded-[24px] border border-zinc-300 bg-white px-6 py-10 text-center cursor-pointer hover:border-zinc-500 transition"
      >
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept="image/*,.heic,.heif"
          onChange={(event) =>
            selectFiles(
              Array.from(event.target.files || [])
            )
          }
        />

        <Upload className="w-7 h-7 mx-auto mb-3 text-zinc-700" />

        <h2 className="text-lg font-semibold text-zinc-900">
          Tap or drop images to compress
        </h2>

        <p className="text-sm text-zinc-500 mt-1">
          JPG, PNG, WebP, BMP, HEIC / HEIF and other
          browser-supported images
        </p>

        <p className="text-xs text-emerald-700 mt-3 font-medium">
          Files stay on your device
        </p>
      </div>

      {files.length > 0 && (
        <div className="rounded-[24px] border border-zinc-300 bg-white p-5 sm:p-6 space-y-6">

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {files.length} image{files.length === 1 ? '' : 's'} selected
              </p>

              <p className="text-xs text-zinc-500 mt-1">
                {formatSize(
                  files.reduce(
                    (total, file) => total + file.size,
                    0
                  )
                )} total
              </p>
            </div>

            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-900 mb-3">
              Target maximum size
            </label>

            <div className="grid grid-cols-4 gap-2 mb-3">
              {TARGET_PRESETS.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setTargetKb(size)}
                  className={`min-h-11 rounded-xl border text-sm font-medium transition ${
                    targetKb === size
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {size >= 1000
                    ? `${size / 1000} MB`
                    : `${size} KB`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="5000"
                step="10"
                value={targetKb}
                onChange={(event) =>
                  setTargetKb(
                    Number(event.target.value)
                  )
                }
                className="flex-1"
              />

              <div className="min-w-[92px] rounded-xl border border-zinc-300 px-3 py-2 text-center text-sm font-semibold text-zinc-900">
                {targetKb >= 1000
                  ? `${(targetKb / 1000).toFixed(
                      targetKb % 1000 ? 1 : 0
                    )} MB`
                  : `${targetKb} KB`}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-300 p-4 flex items-center justify-between gap-5">

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />

                <p className="text-sm font-semibold text-zinc-900">
                  Remove image metadata
                </p>
              </div>

              <p className="text-xs text-zinc-500 mt-1.5">
                Removes EXIF, GPS and camera metadata where supported.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={removeMetadata}
              onClick={() =>
                setRemoveMetadata((value) => !value)
              }
              className={`relative w-12 h-7 shrink-0 rounded-full transition ${
                removeMetadata
                  ? 'bg-emerald-700'
                  : 'bg-zinc-300'
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  removeMetadata
                    ? 'left-6'
                    : 'left-1'
                }`}
              />
            </button>
          </div>

          <div className="text-xs text-zinc-500">
            Metadata removal:{' '}
            <strong
              className={
                removeMetadata
                  ? 'text-emerald-700'
                  : 'text-zinc-800'
              }
            >
              {removeMetadata ? 'ON' : 'OFF'}
            </strong>

            {!removeMetadata && (
              <span>
                {' '}— EXIF will be preserved where the format and browser compressor support it.
              </span>
            )}
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{status}</span>
                <span>{progress}%</span>
              </div>

              <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-700 transition-all"
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={isProcessing}
            onClick={compressImages}
            className="w-full min-h-14 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Compressing…
              </>
            ) : (
              <>
                <ImageIcon className="w-5 h-5" />
                Compress Image{files.length > 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-[24px] border border-zinc-300 bg-white p-5 sm:p-6 space-y-4">

          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />

            <h2 className="font-semibold">
              Compression complete
            </h2>
          </div>

          <div className="space-y-2">
            {results.map((result, index) => {
              const reduction =
                result.originalSize > 0
                  ? Math.max(
                      0,
                      Math.round(
                        (1 -
                          result.newSize /
                            result.originalSize) *
                          100
                      )
                    )
                  : 0;

              return (
                <div
                  key={`${result.name}-${index}`}
                  className="rounded-2xl border border-zinc-200 p-4 flex items-center justify-between gap-4"
                >

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 truncate">
                      {result.name}
                    </p>

                    <p className="text-xs text-zinc-500 mt-1">
                      {formatSize(result.originalSize)}
                      {' → '}
                      <strong className="text-emerald-700">
                        {formatSize(result.newSize)}
                      </strong>

                      {reduction > 0 && (
                        <>
                          {' '}• {reduction}% smaller
                        </>
                      )}
                    </p>
                  </div>

                  <a
                    href={result.url}
                    download={result.name}
                    className="min-h-10 px-3 rounded-xl bg-zinc-900 text-white text-sm font-medium flex items-center gap-2 shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <section className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-5 sm:p-6">

        <h2 className="text-base font-semibold text-zinc-900">
          Private image compression in your browser
        </h2>

        <p className="text-sm text-zinc-600 leading-6 mt-2">
          Reduce JPG, PNG, WebP, HEIC and other common image files
          without uploading the image to a remote compression server.
          Choose a target size and optionally remove EXIF, GPS and
          camera metadata before downloading the result.
        </p>

        <div className="flex items-start gap-2 mt-4 text-xs text-zinc-500">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />

          <span>
            Compression runs locally. HEIC / HEIF files are decoded
            in the browser before compression.
          </span>
        </div>
      </section>

    </div>
  );
}

export default CompressImage;
