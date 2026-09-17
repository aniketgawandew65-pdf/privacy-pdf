import React, { useEffect, useRef, useState } from 'react';
import { Zip, ZipPassThrough } from 'fflate';
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
import { pdfToImages } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';

type OutputFormat = 'jpg' | 'png' | 'webp';

interface PdfToImagesProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const PdfToImages: React.FC<PdfToImagesProps> = ({
  file,
  onFileChange,
}) => {
  const [images, setImages] = useState<Blob[]>([]);
  const [imageUrls, setImageUrls] =
    useState<string[]>([]);
  const [outputFormat, setOutputFormat] =
    useState<OutputFormat>('jpg');
  const [quality, setQuality] = useState(92);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBuildingZip, setIsBuildingZip] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    url: zipUrl,
    createUrl,
    revoke: revokeZipUrl,
  } = useObjectUrl();

  useEffect(() => {
    const urls =
      images.map(
        (blob) =>
          URL.createObjectURL(
            blob
          )
      );

    setImageUrls(
      urls
    );

    return () => {
      for (
        const url of urls
      ) {
        try {
          URL.revokeObjectURL(
            url
          );
        } catch (_) {}
      }
    };
  }, [images]);

  const resetOutput = () => {
    setImages([]);
    revokeZipUrl();
    setErrorMessage(null);
  };

  const handleConvert = async () => {
    if (!file) return;

    const creditCheck = checkTaskCredit(file);

    if (!creditCheck.allowed) {
      setErrorMessage(
        creditCheck.errorMessage ||
          'This task is not available on your current plan.'
      );
      return;
    }

    setIsProcessing(true);
    setProgressText(
      `Converting PDF pages to ${outputFormat.toUpperCase()}...`
    );

    resetOutput();

    try {
      const extractedImages = await pdfToImages(
        file,
        outputFormat,
        quality / 100
      );

      setImages(extractedImages);

      if (extractedImages.length > 0) {
        commitTaskCredit();
      } else {
        setErrorMessage('No PDF pages could be converted.');
      }

      /*
       * Do not build the ZIP here.
       *
       * Keep conversion memory limited to the page-image
       * Blobs. The archive is generated only if the user
       * explicitly asks to download all pages.
       */

    } catch (err: any) {
      console.error('PDF to image conversion error:', err);
      setErrorMessage(
        err?.message || 'Could not convert this PDF to images.'
      );
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleDownloadZip = async () => {
    if (
      !file ||
      images.length === 0
    ) {
      return;
    }

    setIsBuildingZip(true);

    try {
      let downloadUrl =
        zipUrl;

      if (!downloadUrl) {
        setProgressText(
          'Bundling pages into ZIP archive...'
        );

        const base =
          file.name.replace(
            /\.[^/.]+$/,
            ''
          );

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
          let i = 0;
          i < images.length;
          i++
        ) {
          const entry =
            new ZipPassThrough(
              `${base}_page_${i + 1}.${outputFormat}`
            );

          zip.add(
            entry
          );

          /*
           * Only one page image is materialized as an
           * ArrayBuffer at a time.
           */
          const bytes =
            new Uint8Array(
              await images[i].arrayBuffer()
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
          createUrl(
            zipBlob
          );
      }

      const anchor =
        document.createElement(
          'a'
        );

      anchor.href =
        downloadUrl;

      anchor.download =
        `${file.name.replace(
          /\.[^/.]+$/,
          ''
        )}_pages_${outputFormat}.zip`;

      document.body.appendChild(
        anchor
      );

      anchor.click();
      anchor.remove();
    } catch (err) {
      console.error(
        'ZIP creation error:',
        err
      );
    } finally {
      setIsBuildingZip(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    resetOutput();
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to convert pages to images"
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

            if (
              e.dataTransfer.files[0]?.type ===
              'application/pdf'
            ) {
              onFileChange(e.dataTransfer.files[0]);
              resetOutput();
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />

          <p className="text-sm font-semibold text-zinc-200">
            Drop a PDF here
          </p>

          <p className="text-xs text-zinc-500 mt-1">
            Convert every page to JPG, PNG or WebP locally
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (
                e.target.files?.[0]?.type ===
                'application/pdf'
              ) {
                onFileChange(e.target.files[0]);
                resetOutput();
              }

              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-5 text-left">
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />

              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {Math.round(file.size / 1024)} KB
                </p>
              </div>
            </div>

            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl border border-red-900/50 bg-red-950/20 text-xs text-red-300">
              {errorMessage}
            </div>
          )}

          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800">
            <label className="text-xs text-zinc-400 font-medium block mb-2">
              Convert PDF pages to
            </label>

            <div className="grid grid-cols-3 gap-2">
              {(['jpg', 'png', 'webp'] as OutputFormat[]).map(
                (format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => {
                      setOutputFormat(format);
                      resetOutput();
                    }}
                    className={`py-2 rounded-lg text-xs font-semibold transition ${
                      outputFormat === format
                        ? 'bg-emerald-500 text-black'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                    }`}
                  >
                    {format.toUpperCase()}
                  </button>
                )
              )}
            </div>

            {(outputFormat === 'jpg' ||
              outputFormat === 'webp') && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1.5">
                  <span>Image quality</span>
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
                    resetOutput();
                  }}
                  className="w-full accent-emerald-500"
                />
              </div>
            )}
          </div>

          {images.length === 0 ? (
            <button
              onClick={handleConvert}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {progressText ||
                      `Converting to ${outputFormat.toUpperCase()}...`}
                  </span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>
                    Convert PDF to {outputFormat.toUpperCase()}
                  </span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />

                  <span>
                    Converted {images.length}{' '}
                    {images.length === 1 ? 'Page' : 'Pages'} to{' '}
                    {outputFormat.toUpperCase()}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={isBuildingZip}
                  className="w-full sm:w-auto px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
                >
                  {isBuildingZip ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}

                  <span>
                    {isBuildingZip
                      ? 'Creating ZIP...'
                      : 'Download All as ZIP'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
                {imageUrls.map((imgUrl, index) => (
                  <div
                    key={index}
                    className="relative border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950 p-2"
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
                        download={`page-${index + 1}.${outputFormat}`}
                        className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        Save
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
