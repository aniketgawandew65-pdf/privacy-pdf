import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import heic2any from 'heic2any';
import { Zip, ZipPassThrough } from 'fflate';
import {
  Upload,
  Image as ImageIcon,
  Download,
  Loader2,
  CheckCircle2,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileText,
  Archive,
  AlertCircle,
} from 'lucide-react';
import { imagesToPDF } from '../utils/pdfEngine';
import { validateTaskFiles } from '../utils/fileSizeGuard';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';
import {
  saveToolWorkspaceFiles,
  restoreToolWorkspaceFiles,
  clearToolWorkspace,
  saveToolWorkspaceState,
  restoreToolWorkspaceState,
} from '../utils/localWorkspace';

type OutputFormat = 'pdf' | 'jpg' | 'png' | 'webp';

interface ConvertedImage {
  name: string;
  blob: Blob;
  url: string;
}

const isHeic = (file: File) =>
  /\.(heic|heif)$/i.test(file.name) ||
  file.type === 'image/heic' ||
  file.type === 'image/heif';

const isSupportedImage = (file: File) =>
  isHeic(file) ||
  ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type) ||
  /\.(jpe?g|png|webp)$/i.test(file.name);

async function normalizeHeic(file: File): Promise<File> {
  if (!isHeic(file)) return file;

  const result: any = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.95,
  } as any);

  const blob: Blob = Array.isArray(result) ? result[0] : result;

  return new File(
    [blob],
    file.name.replace(/\.(heic|heif)$/i, '.jpg'),
    { type: 'image/jpeg' }
  );
}

async function imageFileToBlob(
  file: File,
  format: Exclude<OutputFormat, 'pdf'>,
  quality: number
): Promise<Blob> {
  const normalized = await normalizeHeic(file);

  const canvas = document.createElement('canvas');
  let width = 0;
  let height = 0;

  try {
    const bitmap = await createImageBitmap(normalized);
    width = bitmap.width;
    height = bitmap.height;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create image canvas.');

    if (format === 'jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
  } catch {
    const objectUrl = URL.createObjectURL(normalized);

    try {
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Could not decode ${file.name}`));
        img.src = objectUrl;
      });

      width = img.naturalWidth;
      height = img.naturalHeight;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create image canvas.');

      if (format === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const mime =
    format === 'png'
      ? 'image/png'
      : format === 'webp'
        ? 'image/webp'
        : 'image/jpeg';

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(
      resolve,
      mime,
      format === 'png' ? undefined : quality
    )
  );

  canvas.width = 0;
  canvas.height = 0;

  if (!blob) {
    throw new Error(
      `${format.toUpperCase()} export is not supported by this browser.`
    );
  }

  return blob;
}

export const ImageToPdf: React.FC = () => {
  const location = useLocation();

  const defaultOutput: OutputFormat =
    location.pathname === '/heic-to-jpg'
      ? 'jpg'
      : 'pdf';

  const [images, setImages] = useState<File[]>([]);
  const [workspaceHydrated, setWorkspaceHydrated] =
    useState(false);
  const [outputFormat, setOutputFormat] =
    useState<OutputFormat>(defaultOutput);
  const [quality, setQuality] = useState(92);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBuildingZip, setIsBuildingZip] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [converted, setConverted] = useState<ConvertedImage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * Keep selected source images available when the user
   * opens/downloads the result and then returns with Back.
   */
  useEffect(() => {
    let cancelled = false;

    const restoreWorkspace = async () => {
      try {
        const restored =
          await restoreToolWorkspaceFiles(
            'image-converter'
          );

        const savedState =
          restoreToolWorkspaceState<{
            outputFormat?: OutputFormat;
            quality?: number;
          }>('image-converter');

        if (cancelled) return;

        if (restored.length > 0) {
          setImages(restored);
        }

        if (savedState?.outputFormat) {
          setOutputFormat(
            savedState.outputFormat
          );
        }

        if (
          typeof savedState?.quality ===
          'number'
        ) {
          setQuality(savedState.quality);
        }
      } catch (error) {
        console.warn(
          'Unable to restore Image Converter workspace:',
          error
        );
      } finally {
        if (!cancelled) {
          setWorkspaceHydrated(true);
        }
      }
    };

    void restoreWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceHydrated) return;

    if (images.length > 0) {
      void saveToolWorkspaceFiles(
        'image-converter',
        images
      );

      saveToolWorkspaceState(
        'image-converter',
        {
          outputFormat,
          quality,
        }
      );
    } else {
      void clearToolWorkspace(
        'image-converter'
      );
    }
  }, [
    images,
    outputFormat,
    quality,
    workspaceHydrated,
  ]);

  const clearGenerated = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    if (zipUrl) URL.revokeObjectURL(zipUrl);

    converted.forEach((item) => URL.revokeObjectURL(item.url));

    setPdfUrl(null);
    setZipUrl(null);
    setConverted([]);
    setErrorMessage(null);
  };

  const handleFilesSelect = (filesList: FileList | null) => {
    if (!filesList) return;
    const sizeCheck = validateTaskFiles(
      [...images, ...Array.from(filesList)],
      'Image conversion files'
    );

    if (!sizeCheck.allowed) {
      setErrorMessage(sizeCheck.errorMessage);
      return;
    }


    const validImages =
      Array.from(filesList).filter(isSupportedImage);

    setImages((prev) => [...prev, ...validImages]);
    clearGenerated();
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    clearGenerated();
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const targetIndex =
      direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= images.length) return;

    const updated = [...images];
    [updated[index], updated[targetIndex]] =
      [updated[targetIndex], updated[index]];

    setImages(updated);
    clearGenerated();
  };

  const handleConvert = async () => {
    if (!images.length) return;

    clearGenerated();
    const sizeCheck = validateTaskFiles(
      images,
      'Image conversion files'
    );

    if (!sizeCheck.allowed) {
      setErrorMessage(sizeCheck.errorMessage);
      return;
    }

    const creditCheck = checkTaskCredit(images);

    if (!creditCheck.allowed) {
      setErrorMessage(
        creditCheck.errorMessage ||
          'This task is not available on your current plan.'
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      if (outputFormat === 'pdf') {
        const normalizedFiles: File[] = [];

        for (const image of images) {
          normalizedFiles.push(await normalizeHeic(image));
        }

        const pdfBytes = await imagesToPDF(normalizedFiles);
        const blob = new Blob(
          [pdfBytes as unknown as BlobPart],
          { type: 'application/pdf' }
        );

        setPdfUrl(URL.createObjectURL(blob));
        commitTaskCredit();
        return;
      }

      const results: ConvertedImage[] = [];

      for (let i = 0; i < images.length; i++) {
        const original = images[i];

        const blob = await imageFileToBlob(
          original,
          outputFormat,
          quality / 100
        );

        const ext = outputFormat === 'jpg' ? 'jpg' : outputFormat;
        const base =
          original.name.replace(/\.[^/.]+$/, '') || `image-${i + 1}`;

        results.push({
          name: `${base}.${ext}`,
          blob,
          url: URL.createObjectURL(blob),
        });
      }

      setConverted(results);
      commitTaskCredit();

      /*
       * Do not build a ZIP automatically.
       *
       * Keep conversion memory limited to the converted
       * image Blobs. The archive is created only if the
       * user explicitly requests it.
       */
    } catch (err: any) {
      console.error('Image conversion error:', err);
      setErrorMessage(
        err?.message || 'Could not convert the selected images.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = async () => {
    if (
      converted.length <= 1
    ) {
      return;
    }

    setIsBuildingZip(true);
    setErrorMessage(null);

    try {
      let downloadUrl =
        zipUrl;

      if (!downloadUrl) {
        const chunks:
          ArrayBuffer[] = [];

        let resolveZip!:
          (blob: Blob) => void;

        let rejectZip!:
          (error: unknown) => void;

        const zipResult =
          new Promise<Blob>(
            (resolve, reject) => {
              resolveZip =
                resolve;

              rejectZip =
                reject;
            }
          );

        const zip =
          new Zip(
            (
              error,
              data,
              final
            ) => {
              if (error) {
                rejectZip(
                  error
                );
                return;
              }

              if (
                data &&
                data.length
              ) {
                /*
                 * Copy fflate output into regular
                 * ArrayBuffer-backed chunks for Blob
                 * compatibility.
                 */
                const copy =
                  new Uint8Array(
                    data.length
                  );

                copy.set(
                  data
                );

                chunks.push(
                  copy.buffer
                );
              }

              if (final) {
                resolveZip(
                  new Blob(
                    chunks,
                    {
                      type:
                        'application/zip',
                    }
                  )
                );
              }
            }
          );

        for (
          const item of converted
        ) {
          const entry =
            new ZipPassThrough(
              item.name
            );

          zip.add(
            entry
          );

          /*
           * Read only one converted image into an
           * ArrayBuffer at a time.
           */
          const bytes =
            new Uint8Array(
              await item.blob.arrayBuffer()
            );

          entry.push(
            bytes,
            true
          );

          await new Promise<void>(
            (resolve) =>
              setTimeout(
                resolve,
                0
              )
          );
        }

        zip.end();

        const zipBlob =
          await zipResult;

        downloadUrl =
          URL.createObjectURL(
            zipBlob
          );

        setZipUrl(
          downloadUrl
        );
      }

      const anchor =
        document.createElement(
          'a'
        );

      anchor.href =
        downloadUrl;

      anchor.download =
        `converted_${outputFormat}_images.zip`;

      document.body.appendChild(
        anchor
      );

      anchor.click();
      anchor.remove();
    } catch (err: any) {
      console.error(
        'Image ZIP creation error:',
        err
      );

      setErrorMessage(
        err?.message ||
          'Could not create the ZIP archive.'
      );
    } finally {
      setIsBuildingZip(false);
    }
  };

  const formatLabel =
    outputFormat === 'pdf'
      ? 'PDF'
      : outputFormat.toUpperCase();

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl text-left">
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFilesSelect(e.dataTransfer.files);
        }}
        className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40 mb-5"
      >
        <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
        <p className="text-sm font-semibold text-zinc-200">
          Drop JPG, PNG, WebP, HEIC or HEIF images
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Convert privately to PDF or another image format
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelect(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="mb-5 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
        <label className="text-xs text-zinc-400 font-medium block mb-2">
          Convert to
        </label>

        <div className="grid grid-cols-4 gap-2">
          {(['pdf', 'jpg', 'png', 'webp'] as OutputFormat[]).map(
            (format) => (
              <button
                key={format}
                type="button"
                onClick={() => {
                  setOutputFormat(format);
                  clearGenerated();
                }}
                className={`py-2 rounded-lg text-xs font-semibold transition ${
                  outputFormat === format
                    ? 'bg-emerald-500 text-black'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {format.toUpperCase()}
              </button>
            )
          )}
        </div>

        {(outputFormat === 'jpg' || outputFormat === 'webp') && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1.5">
              <span>Quality</span>
              <span className="font-mono text-emerald-400">
                {quality}%
              </span>
            </div>

            <input
              type="range"
              min="50"
              max="100"
              step="1"
              value={quality}
              onChange={(e) => {
                setQuality(Number(e.target.value));
                clearGenerated();
              }}
              className="w-full accent-emerald-500"
            />
          </div>
        )}
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

                  <span className="text-zinc-200 truncate font-medium max-w-[150px] sm:max-w-xs">
                    {img.name}
                  </span>

                  <span className="text-zinc-500 shrink-0">
                    {Math.round(img.size / 1024)} KB
                  </span>
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

          {!pdfUrl && converted.length === 0 ? (
            <button
              onClick={handleConvert}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Converting to {formatLabel}...</span>
                </>
              ) : (
                <>
                  {outputFormat === 'pdf'
                    ? <FileText className="w-4 h-4" />
                    : <ImageIcon className="w-4 h-4" />}
                  <span>
                    Convert {images.length}{' '}
                    {images.length === 1 ? 'Image' : 'Images'} to{' '}
                    {formatLabel}
                  </span>
                </>
              )}
            </button>
          ) : null}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {pdfUrl && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                PDF generated successfully
              </div>

              <a
                href={pdfUrl}
                download="converted_document.pdf"
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </a>
            </div>
          )}

          {converted.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/30">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {converted.length} {formatLabel}{' '}
                  {converted.length === 1 ? 'file' : 'files'} ready
                </div>

                {converted.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    disabled={isBuildingZip}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 disabled:opacity-50 text-black rounded-lg text-xs font-semibold"
                  >
                    {isBuildingZip ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Archive className="w-3.5 h-3.5" />
                    )}

                    {isBuildingZip
                      ? 'Creating...'
                      : 'ZIP'}
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {converted.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800"
                  >
                    <div className="flex items-center gap-2 truncate text-xs text-zinc-300">
                      <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </div>

                    <a
                      href={item.url}
                      download={item.name}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Save
                    </a>
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

export default ImageToPdf;
