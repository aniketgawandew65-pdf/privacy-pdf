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
import {
  clearProcessingRecovery,
  exclusivelyProcess,
  preserveProcessingWorkspace,
} from '../utils/localProcessing';
import {
  clearPdfToImagesRecovery,
  finalizePdfToImagesRecovery,
  pdfToImagesJobMatchesFile,
  readPdfToImagesJobMeta,
  readPdfToImagesPage,
  restorePdfToImagesJobSource,
  savePdfToImagesJobSource,
  writePdfToImagesPage,
} from '../utils/pdfToImagesRecovery';
import { useObjectUrl } from '../utils/useObjectUrl';
import { getLicenseStatus } from '../utils/license';
import {
  useDesktopCapacityRecommendation,
} from '../hooks/useDesktopCapacityRecommendation';
import { DesktopCapacityStatus } from './DesktopCapacityStatus';
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

  const processingInFlightRef =
    useRef(false);

  const durableRestoreAttemptedRef =
    useRef(false);

  const resumeAttemptedRef =
    useRef(false);

  const checkedRecoveryFileRef =
    useRef<File | null>(null);

  const recoverySettingsRef =
    useRef<{
      format: OutputFormat;
      quality: number;
    } | null>(null);

  const [recoveryReady, setRecoveryReady] =
    useState(false);

  const {
    url: zipUrl,
    createUrl,
    revoke: revokeZipUrl,
  } = useObjectUrl();

  const {
    recommendation:
      desktopCapacityRecommendation,
  } =
    useDesktopCapacityRecommendation({
      toolId:
        'pdf-to-image',

      selectedBytes:
        file?.size ?? 0,

      /*
       * Do not open/render the PDF only to obtain page metrics.
       * The recommendation can safely start with source bytes.
       */
      enabled:
        Boolean(file) &&
        getLicenseStatus().isPro,
    });

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

  const discardPdfToImagesRecovery =
    () => {
      clearProcessingRecovery();

      void clearPdfToImagesRecovery()
        .catch(
          () => {}
        );

      recoverySettingsRef.current =
        null;

      resumeAttemptedRef.current =
        false;

      setRecoveryReady(
        false
      );
    };


  /*
   * Safari may recreate the page after WebKit memory pressure.
   * Restore the exact source PDF and conversion settings.
   */
  useEffect(
    () => {
      if (
        file ||
        durableRestoreAttemptedRef.current
      ) {
        return;
      }

      durableRestoreAttemptedRef.current =
        true;

      let cancelled =
        false;

      void (
        async () => {
          try {
            const restored =
              await restorePdfToImagesJobSource();

            if (
              cancelled ||
              !restored
            ) {
              return;
            }

            recoverySettingsRef.current =
              {
                format:
                  restored.format,
                quality:
                  restored.quality,
              };

            setOutputFormat(
              restored.format
            );

            setQuality(
              restored.quality
            );

            preserveProcessingWorkspace();

            setRecoveryReady(
              true
            );

            onFileChange(
              restored.file
            );
          } catch (
            error
          ) {
            console.warn(
              'Unable to restore interrupted PDF to Image job:',
              error
            );
          }
        }
      )();

      return () => {
        cancelled =
          true;
      };
    },
    [
      file,
      onFileChange,
    ]
  );


  /*
   * If App restored the source first, reconnect it to the
   * dedicated PDF-to-Image recovery job.
   */
  useEffect(
    () => {
      if (
        !file
      ) {
        checkedRecoveryFileRef.current =
          null;

        recoverySettingsRef.current =
          null;

        setRecoveryReady(
          false
        );

        return;
      }

      if (
        checkedRecoveryFileRef.current ===
        file
      ) {
        return;
      }

      checkedRecoveryFileRef.current =
        file;

      let cancelled =
        false;

      void (
        async () => {
          try {
            const meta =
              await readPdfToImagesJobMeta();

            if (
              cancelled ||
              !pdfToImagesJobMatchesFile(
                meta,
                file
              )
            ) {
              return;
            }

            recoverySettingsRef.current =
              {
                format:
                  meta!.format,
                quality:
                  meta!.quality,
              };

            setOutputFormat(
              meta!.format
            );

            setQuality(
              meta!.quality
            );

            preserveProcessingWorkspace();

            setRecoveryReady(
              true
            );
          } catch (
            error
          ) {
            console.warn(
              'Unable to inspect interrupted PDF to Image job:',
              error
            );
          }
        }
      )();

      return () => {
        cancelled =
          true;
      };
    },
    [
      file,
    ]
  );


  const handleConvert =
    async (
      forcedSettings?:
        {
          format:
            OutputFormat;
          quality:
            number;
        }
    ) => {
      if (
        !file ||
        processingInFlightRef.current
      ) {
        return;
      }

      const activeSettings =
        forcedSettings || {
          format:
            outputFormat,
          quality,
        };

      const creditCheck =
        checkTaskCredit(
          file
        );

      if (
        !creditCheck.allowed
      ) {
        setErrorMessage(
          creditCheck.errorMessage ||
            'This task is not available on your current plan.'
        );

        return;
      }

      processingInFlightRef.current =
        true;

      setIsProcessing(
        true
      );

      setProgressText(
        `Preparing ${activeSettings.format.toUpperCase()} conversion...`
      );

      resetOutput();

      try {
        const extractedImages =
          await exclusivelyProcess(
            async () => {
              let recoveryEnabled =
                false;

              try {
                await savePdfToImagesJobSource(
                  file,
                  activeSettings.format,
                  activeSettings.quality
                );

                recoveryEnabled =
                  true;
              } catch (
                recoveryError
              ) {
                console.warn(
                  'PDF to Image restart recovery unavailable:',
                  recoveryError
                );
              }

              return await pdfToImages(
                file,
                activeSettings.format,
                activeSettings.quality /
                  100,
                {
                  onProgress:
                    (
                      current,
                      total
                    ) => {
                      setProgressText(
                        `Converting page ${current} of ${total} to ${activeSettings.format.toUpperCase()}...`
                      );
                    },

                  recovery:
                    recoveryEnabled
                      ? {
                          readPage:
                            (
                              pageNumber
                            ) =>
                              readPdfToImagesPage(
                                pageNumber,
                                activeSettings.format
                              ),

                          writePage:
                            (
                              pageNumber,
                              pageBlob
                            ) =>
                              writePdfToImagesPage(
                                pageNumber,
                                activeSettings.format,
                                pageBlob
                              ),
                        }
                      : undefined,
                }
              );
            }
          );

        setImages(
          extractedImages
        );

        if (
          extractedImages.length >
          0
        ) {
          /*
           * Finished output exists before the task is charged.
           */
          /*
           * Keep the completed page image files alive for the
           * preview, Save buttons and ZIP download.
           *
           * Only the active recovery metadata/source PDF are
           * removed here.
           */
          await finalizePdfToImagesRecovery();

          clearProcessingRecovery();

          recoverySettingsRef.current =
            null;

          setRecoveryReady(
            false
          );

          resumeAttemptedRef.current =
            false;

          commitTaskCredit();
        } else {
          setErrorMessage(
            'No PDF pages could be converted.'
          );
        }
      } catch (
        err:
          any
      ) {
        console.error(
          'PDF to image conversion error:',
          err
        );

        /*
         * Keep completed page checkpoints after interruption.
         */
        setErrorMessage(
          err?.message ||
            'Processing was interrupted. Reopen PDF to Image to continue from the last completed page.'
        );
      } finally {
        processingInFlightRef.current =
          false;

        setIsProcessing(
          false
        );

        setProgressText(
          ''
        );
      }
    };


  /*
   * Resume from the first missing page after Safari recreates
   * the process.
   */
  useEffect(
    () => {
      if (
        !file ||
        !recoveryReady ||
        resumeAttemptedRef.current
      ) {
        return;
      }

      const settings =
        recoverySettingsRef.current;

      if (
        !settings
      ) {
        return;
      }

      const timer =
        window.setTimeout(
          () => {
            if (
              resumeAttemptedRef.current
            ) {
              return;
            }

            resumeAttemptedRef.current =
              true;

            void handleConvert(
              settings
            );
          },
          250
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    },
    [
      file,
      recoveryReady,
    ]
  );


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
    if (
      isProcessing
    ) {
      return;
    }

    discardPdfToImagesRecovery();

    processingInFlightRef.current =
      false;

    durableRestoreAttemptedRef.current =
      false;

    checkedRecoveryFileRef.current =
      null;

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

          {desktopCapacityRecommendation && (
            <DesktopCapacityStatus
              recommendation={
                desktopCapacityRecommendation
              }
            />
          )}

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
                    disabled={
                      isProcessing
                    }
                    onClick={() => {
                      if (
                        isProcessing
                      ) {
                        return;
                      }

                      discardPdfToImagesRecovery();

                      setOutputFormat(
                        format
                      );

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
                  disabled={
                    isProcessing
                  }
                  onChange={(e) => {
                    if (
                      isProcessing
                    ) {
                      return;
                    }

                    discardPdfToImagesRecovery();

                    setQuality(
                      Number(
                        e.target.value
                      )
                    );

                    resetOutput();
                  }}
                  className="w-full accent-emerald-500"
                />
              </div>
            )}
          </div>

          {images.length === 0 ? (
            <button
              onClick={() => {
                void handleConvert();
              }}
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
                      loading="lazy"
                      decoding="async"
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
