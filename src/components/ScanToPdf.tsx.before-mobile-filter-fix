import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  RotateCw,
  FlipHorizontal2,
  Trash2,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
} from 'lucide-react';
import { imagesToPDF } from '../utils/pdfEngine';
import heic2any from 'heic2any';

type ScanMode = 'original' | 'grayscale' | 'bw';

interface ScanPage {
  id: string;
  file: File;
  preview: string;
  rotation: number;
  flipped: boolean;
  mode: ScanMode;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isHeic(file: File) {
  return (
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  );
}

async function normalizeImageFile(file: File): Promise<File> {
  if (!isHeic(file)) {
    return file;
  }

  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.95,
  } as any);

  const blob: Blob = Array.isArray(converted)
    ? converted[0]
    : converted;

  return new File(
    [blob],
    file.name.replace(/\.(heic|heif)$/i, '.jpg'),
    {
      type: 'image/jpeg',
      lastModified: Date.now(),
    }
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };

    img.src = url;
  });
}

async function processPage(
  page: ScanPage
): Promise<File> {
  const img = await loadImage(page.file);
  const mode = page.mode;

  const normalizedRotation =
    ((page.rotation % 360) + 360) % 360;

  const sideways =
    normalizedRotation === 90 ||
    normalizedRotation === 270;

  const canvas = document.createElement('canvas');

  canvas.width = sideways
    ? img.naturalHeight
    : img.naturalWidth;

  canvas.height = sideways
    ? img.naturalWidth
    : img.naturalHeight;

  const ctx = canvas.getContext('2d', {
    alpha: false,
  });

  if (!ctx) {
    throw new Error('Canvas is unavailable.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.save();

  ctx.translate(
    canvas.width / 2,
    canvas.height / 2
  );

  ctx.rotate(
    (normalizedRotation * Math.PI) / 180
  );

  if (page.flipped) {
    ctx.scale(-1, 1);
  }

  if (mode === 'grayscale') {
    ctx.filter =
      'grayscale(1) contrast(1.08)';
  }

  if (mode === 'bw') {
    ctx.filter =
      'grayscale(1) contrast(1.55) brightness(1.08)';
  }

  ctx.drawImage(
    img,
    -img.naturalWidth / 2,
    -img.naturalHeight / 2
  );

  ctx.restore();

  const blob = await new Promise<Blob>(
    (resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(
            new Error(
              'Could not process scanned image.'
            )
          );
        },
        'image/jpeg',
        mode === 'bw' ? 0.88 : 0.92
      );
    }
  );

  canvas.width = 0;
  canvas.height = 0;

  return new File(
    [blob],
    `scan-${page.id}.jpg`,
    {
      type: 'image/jpeg',
      lastModified: Date.now(),
    }
  );
}

export const ScanToPdf = () => {
  const cameraInputRef =
    useRef<HTMLInputElement>(null);

  const galleryInputRef =
    useRef<HTMLInputElement>(null);

  const [pages, setPages] =
    useState<ScanPage[]>([]);

  const [appearancePageId, setAppearancePageId] =
    useState<string | null>(null);

  const [isProcessing, setIsProcessing] =
    useState(false);

  const [downloadUrl, setDownloadUrl] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const totalSize = useMemo(
    () =>
      pages.reduce(
        (sum, page) => sum + page.file.size,
        0
      ),
    [pages]
  );

  useEffect(() => {
    return () => {
      pages.forEach((page) =>
        URL.revokeObjectURL(page.preview)
      );

      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, []);

  const clearDownload = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }

    setDownloadUrl(null);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;

    const incoming = Array.from(files);

    const valid = incoming.filter(
      (file) =>
        file.type.startsWith('image/') ||
        /\.(jpg|jpeg|png|webp|bmp|heic|heif)$/i.test(file.name)
    );

    if (!valid.length) {
      setError(
        'Please choose a supported image file.'
      );
      return;
    }

    setError(null);

    try {
      const added: ScanPage[] = [];

      for (const file of valid) {
        const normalized =
          await normalizeImageFile(file);

        added.push({
          id: createId(),
          file: normalized,
          preview:
            URL.createObjectURL(normalized),
          rotation: 0,
          flipped: false,
          mode: 'original',
        });
      }

      setPages((current) => [
        ...current,
        ...added,
      ]);

      clearDownload();
    } catch (err) {
      console.error(err);

      setError(
        'One of the photos could not be opened. Try taking the photo again or choosing a JPG/PNG image.'
      );
    }
  };

  const removePage = (index: number) => {
    const target = pages[index];

    if (target) {
      URL.revokeObjectURL(target.preview);
    }

    setPages((current) =>
      current.filter((_, i) => i !== index)
    );

    clearDownload();
  };

  const rotatePage = (index: number) => {
    setPages((current) =>
      current.map((page, i) =>
        i === index
          ? {
              ...page,
              rotation:
                (page.rotation + 90) % 360,
            }
          : page
      )
    );

    clearDownload();
  };

  const movePage = (
    index: number,
    direction: 'up' | 'down'
  ) => {
    const target =
      direction === 'up'
        ? index - 1
        : index + 1;

    if (
      target < 0 ||
      target >= pages.length
    ) {
      return;
    }

    setPages((current) => {
      const updated = [...current];

      [
        updated[index],
        updated[target],
      ] = [
        updated[target],
        updated[index],
      ];

      return updated;
    });

    clearDownload();
  };

  const clearAll = () => {
    pages.forEach((page) =>
      URL.revokeObjectURL(page.preview)
    );

    clearDownload();
    setPages([]);
    setError(null);

    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }

    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  };

  const createPdf = async () => {
    if (!pages.length || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearDownload();

    try {
      const processedFiles: File[] = [];

      for (const page of pages) {
        processedFiles.push(
          await processPage(page)
        );
      }

      const pdfBytes =
        await imagesToPDF(processedFiles);

      const blob = new Blob(
        [pdfBytes as unknown as BlobPart],
        {
          type: 'application/pdf',
        }
      );

      setDownloadUrl(
        URL.createObjectURL(blob)
      );
    } catch (err) {
      console.error(err);

      setError(
        'The scan could not be converted. Try another image or use a smaller photo.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5">

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <button
          type="button"
          onClick={() =>
            cameraInputRef.current?.click()
          }
          className="min-h-28 rounded-2xl border border-zinc-700 bg-zinc-900/60 hover:border-emerald-500/60 transition flex flex-col items-center justify-center gap-2 px-4"
        >
          <Camera className="w-7 h-7 text-emerald-400" />

          <span className="font-semibold text-zinc-100">
            Scan with camera
          </span>

          <span className="text-xs text-zinc-500">
            Best on a phone or tablet
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            galleryInputRef.current?.click()
          }
          className="min-h-28 rounded-2xl border border-zinc-700 bg-zinc-900/60 hover:border-emerald-500/60 transition flex flex-col items-center justify-center gap-2 px-4"
        >
          <ImagePlus className="w-7 h-7 text-emerald-400" />

          <span className="font-semibold text-zinc-100">
            Choose photos
          </span>

          <span className="text-xs text-zinc-500">
            Add one or multiple pages
          </span>
        </button>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) =>
            void addFiles(event.target.files)
          }
        />

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) =>
            void addFiles(event.target.files)
          }
        />

      </div>

      <div className="flex items-start gap-2 rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 text-xs text-zinc-400">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <span>
          Photos are processed on your device.
          They are not uploaded to a document
          processing server.
        </span>
      </div>

      {pages.length > 0 && (
        <>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">

              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  {pages.length}{' '}
                  {pages.length === 1
                    ? 'page'
                    : 'pages'}
                </p>

                <p className="text-xs text-zinc-500 mt-1">
                  {Math.round(
                    totalSize / 1024
                  )}{' '}
                  KB selected
                </p>
              </div>

              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                Clear all
              </button>

            </div>

            <div className="space-y-3">
              {pages.map((page, index) => (
                <div
                  key={page.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/70 overflow-hidden"
                >

                  <div className="flex items-center gap-3 p-3">

                    <div className="w-16 h-20 rounded-lg bg-white overflow-hidden shrink-0 flex items-center justify-center">
                      <img
                        src={page.preview}
                        alt={`Scanned page ${index + 1}`}
                        className="max-w-full max-h-full object-contain"
                        style={{
                          transform: `rotate(${page.rotation}deg) scaleX(${page.flipped ? -1 : 1})`,
                          filter:
                            page.mode === 'grayscale'
                              ? 'grayscale(1) contrast(1.08)'
                              : page.mode === 'bw'
                                ? 'grayscale(1) contrast(1.55) brightness(1.08)'
                                : 'none',
                        }}
                      />
                    </div>

                    <div className="min-w-0 flex-1">

                      <p className="text-sm font-medium text-zinc-200">
                        Page {index + 1}
                      </p>

                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {page.file.name}
                      </p>

                      <p className="text-[10px] text-emerald-500 mt-1 font-medium">
                        {page.mode === 'original'
                          ? 'Original'
                          : page.mode === 'grayscale'
                            ? 'Grayscale'
                            : 'B&W'}
                      </p>

                    </div>

                    <div className="flex items-center gap-1">

                      <button
                        type="button"
                        title="Move up"
                        disabled={index === 0}
                        onClick={() =>
                          movePage(index, 'up')
                        }
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        title="Move down"
                        disabled={
                          index === pages.length - 1
                        }
                        onClick={() =>
                          movePage(index, 'down')
                        }
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        title="Rotate"
                        onClick={() =>
                          rotatePage(index)
                        }
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        title="Flip horizontally"
                        onClick={() => {
                          setPages((current) =>
                            current.map((item) =>
                              item.id === page.id
                                ? {
                                    ...item,
                                    flipped: !item.flipped,
                                  }
                                : item
                            )
                          );

                          clearDownload();
                        }}
                        className={`p-2 rounded-lg transition ${
                          page.flipped
                            ? 'text-emerald-400 bg-emerald-950/40'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                      >
                        <FlipHorizontal2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        title="Change page appearance"
                        onClick={() =>
                          setAppearancePageId(
                            appearancePageId === page.id
                              ? null
                              : page.id
                          )
                        }
                        className={`min-w-8 h-8 px-1 rounded-lg text-[10px] font-bold transition ${
                          appearancePageId === page.id
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                      >
                        FX
                      </button>

                      <button
                        type="button"
                        title="Remove page"
                        onClick={() =>
                          removePage(index)
                        }
                        className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                    </div>

                  </div>

                  {appearancePageId === page.id && (
                    <div className="border-t border-zinc-800 p-3 bg-zinc-900/70">

                      <p className="text-[11px] text-zinc-500 mb-2">
                        Page {index + 1} appearance
                      </p>

                      <div className="grid grid-cols-3 gap-2">

                        {(
                          [
                            ['original', 'Original'],
                            ['grayscale', 'Grayscale'],
                            ['bw', 'B&W'],
                          ] as const
                        ).map(([value, label]) => (

                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setPages((current) =>
                                current.map((item) =>
                                  item.id === page.id
                                    ? {
                                        ...item,
                                        mode: value,
                                      }
                                    : item
                                )
                              );

                              setAppearancePageId(null);
                              clearDownload();
                            }}
                            className={`min-h-10 rounded-lg border text-xs font-medium transition ${
                              page.mode === value
                                ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                            }`}
                          >
                            {label}
                          </button>

                        ))}

                      </div>

                    </div>
                  )}

                </div>
              ))}
            </div>

          </div>

          {!downloadUrl ? (
            <button
              type="button"
              disabled={isProcessing}
              onClick={createPdf}
              className="w-full min-h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold flex items-center justify-center gap-2 transition"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating PDF…
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  Create PDF from{' '}
                  {pages.length}{' '}
                  {pages.length === 1
                    ? 'scan'
                    : 'scans'}
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">

              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 flex items-center justify-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                PDF created successfully
              </div>

              <a
                href={downloadUrl}
                download="scanned-document.pdf"
                className="w-full min-h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-5 h-5" />
                Download scanned PDF
              </a>

            </div>
          )}
        </>
      )}

      {error && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

    </div>
  );
};

export default ScanToPdf;
