import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Printer,
  Sliders,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { loadPdfJsFromBlob } from '../utils/pdfjs';
import {
  convertToGrayscalePDF,
  type GrayscaleMode,
} from '../utils/pdfEngine';
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

import {
  clearProcessingRecovery,
  exclusivelyProcess,
  preserveProcessingWorkspace,
} from '../utils/localProcessing';

import {
  clearGrayscaleRecovery,
  grayscaleJobMatchesFile,
  readGrayscaleJobMeta,
  readGrayscalePage,
  restoreGrayscaleJobSource,
  saveGrayscaleJobSource,
  writeGrayscalePage,
} from '../utils/grayscaleRecovery';

interface GrayscalePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type GrayscaleRecoverySettings = {
  mode: GrayscaleMode;
  threshold: number;
};

export const GrayscalePdf: React.FC<GrayscalePdfProps> = ({ file, onFileChange }) => {
  const [mode, setMode] = useState<GrayscaleMode>('grayscale');
  const [threshold, setThreshold] = useState<number>(135);

  /*
   * Keep the slider responsive, but do not reopen/render a large
   * PDF for every tiny finger movement on mobile Safari.
   */
  const [previewThreshold, setPreviewThreshold] =
    useState<number>(135);

  const [totalPages, setTotalPages] = useState<number>(0);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processingInFlightRef =
    useRef(false);

  const durableRestoreAttemptedRef =
    useRef(false);

  const resumeAttemptedRef =
    useRef(false);

  const checkedRecoveryFileRef =
    useRef<File | null>(null);

  const previewBusyRef =
    useRef(false);

  const recoverySettingsRef =
    useRef<GrayscaleRecoverySettings | null>(null);

  const previewObjectUrlRef =
    useRef<string | null>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const {
    recommendation:
      desktopCapacityRecommendation,
  } =
    useDesktopCapacityRecommendation({
      toolId:
        'grayscale-pdf',

      selectedBytes:
        file?.size ?? 0,

      /*
       * Grayscale already knows the document page count from
       * its normal preview path. No extra capacity-only parsing.
       */
      pageCount:
        totalPages > 0
          ? totalPages
          : null,

      enabled:
        Boolean(file) &&
        getLicenseStatus().isPro,
    });

  /*
   * Threshold sliders fire many input events while a finger moves.
   *
   * On a ~150 MB PDF, reopening PDF.js for every event can create
   * several overlapping large preview jobs and make iOS Safari
   * terminate/restart the page.
   *
   * The displayed threshold number changes immediately; only the
   * expensive visual preview waits until the user pauses.
   */
  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          setPreviewThreshold(
            threshold
          );
        },
        350
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [threshold]);

  // Generate real-time preview of page 1
  useEffect(() => {
    if (!file) {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(
          previewObjectUrlRef.current
        );

        previewObjectUrlRef.current =
          null;
      }

      previewBusyRef.current =
        false;

      setPreviewUrl(null);
      setTotalPages(0);
      setZoomLevel(1);
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }

    let isMounted = true;

    let disposePdf:
      | (() => Promise<void>)
      | null = null;

    let generatedPreviewUrl:
      | string
      | null = null;

    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(
        previewObjectUrlRef.current
      );

      previewObjectUrlRef.current =
        null;
    }

    setPreviewUrl(null);

    previewBusyRef.current =
      true;

    setIsLoadingPreview(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    (async () => {
      try {
        const loaded =
          await loadPdfJsFromBlob(
            file
          );

        disposePdf =
          loaded.dispose;

        if (!isMounted) {
          await disposePdf();
          disposePdf = null;
          return;
        }

        const pdf =
          loaded.pdf;

        setTotalPages(
          pdf.numPages
        );

        const page =
          await pdf.getPage(1);

        try {
          const viewport =
            page.getViewport({
              scale: 1.2,
            });

          const canvas =
            document.createElement(
              'canvas'
            );

          try {
            canvas.width =
              Math.floor(
                viewport.width
              );

            canvas.height =
              Math.floor(
                viewport.height
              );

            const ctx =
              canvas.getContext(
                '2d'
              );

            if (ctx) {
              await page.render({
                canvasContext:
                  ctx as any,
                viewport,
              } as any).promise;

              const imgData =
                ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );

              const data =
                imgData.data;

              for (
                let i = 0;
                i < data.length;
                i += 4
              ) {
                const gray =
                  0.299 * data[i] +
                  0.587 * data[i + 1] +
                  0.114 * data[i + 2];

                const val =
                  mode === 'pure-bw'
                    ? (
                        gray < previewThreshold
                          ? 0
                          : 255
                      )
                    : gray;

                data[i] = val;
                data[i + 1] = val;
                data[i + 2] = val;
              }

              ctx.putImageData(
                imgData,
                0,
                0
              );

              const previewBlob =
                await new Promise<Blob>(
                  (
                    resolve,
                    reject
                  ) => {
                    canvas.toBlob(
                      (blob) => {
                        if (blob) {
                          resolve(
                            blob
                          );
                        } else {
                          reject(
                            new Error(
                              'Unable to create preview.'
                            )
                          );
                        }
                      },
                      'image/jpeg',
                      0.9
                    );
                  }
                );

              generatedPreviewUrl =
                URL.createObjectURL(
                  previewBlob
                );

              if (isMounted) {
                previewObjectUrlRef.current =
                  generatedPreviewUrl;

                setPreviewUrl(
                  generatedPreviewUrl
                );
              } else {
                URL.revokeObjectURL(
                  generatedPreviewUrl
                );

                generatedPreviewUrl =
                  null;
              }
            }
          } finally {
            canvas.width = 1;
            canvas.height = 1;
          }
        } finally {
          try {
            page.cleanup();
          } catch (_) {}
        }
      } catch (err) {
        console.error(
          'Preview error:',
          err
        );

        if (isMounted) {
          setErrorMessage(
            'Could not render document preview.'
          );
        }
      } finally {
        if (disposePdf) {
          try {
            await disposePdf();
          } catch (_) {}

          disposePdf = null;
        }

        previewBusyRef.current =
          false;

        if (isMounted) {
          setIsLoadingPreview(
            false
          );
        }
      }
    })();

    return () => {
      isMounted = false;

      if (disposePdf) {
        void disposePdf();
        disposePdf = null;
      }

      if (generatedPreviewUrl) {
        URL.revokeObjectURL(
          generatedPreviewUrl
        );

        if (
          previewObjectUrlRef.current ===
          generatedPreviewUrl
        ) {
          previewObjectUrlRef.current =
            null;
        }

        generatedPreviewUrl =
          null;
      }
    };
  }, [file, mode, previewThreshold]);

  /*
   * ==========================================================
   * DURABLE SOURCE RESTORE AFTER SAFARI/WEBKIT RESTART
   * ==========================================================
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

      previewBusyRef.current =
        true;

      setIsLoadingPreview(
        true
      );

      void (
        async () => {
          try {
            const restored =
              await restoreGrayscaleJobSource();

            if (
              cancelled ||
              !restored
            ) {
              if (
                !cancelled
              ) {
                previewBusyRef.current =
                  false;

                setIsLoadingPreview(
                  false
                );
              }

              return;
            }

            const settings:
              GrayscaleRecoverySettings =
                {
                  mode:
                    restored.mode,

                  threshold:
                    restored.threshold,
                };

            recoverySettingsRef.current =
              settings;

            setMode(
              restored.mode
            );

            setThreshold(
              restored.threshold
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
              'Unable to restore interrupted Grayscale job:',
              error
            );

            if (
              !cancelled
            ) {
              previewBusyRef.current =
                false;

              setIsLoadingPreview(
                false
              );
            }
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
   * App.tsx may restore the same source through the generic
   * workspace first. Recover the dedicated conversion settings.
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
              await readGrayscaleJobMeta();

            if (
              cancelled ||
              !grayscaleJobMatchesFile(
                meta,
                file
              )
            ) {
              return;
            }

            const settings:
              GrayscaleRecoverySettings =
                {
                  mode:
                    meta!.mode,

                  threshold:
                    meta!.threshold,
                };

            recoverySettingsRef.current =
              settings;

            setMode(
              meta!.mode
            );

            setThreshold(
              meta!.threshold
            );

            preserveProcessingWorkspace();

            setRecoveryReady(
              true
            );
          } catch (
            error
          ) {
            console.warn(
              'Unable to inspect interrupted Grayscale job:',
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
        GrayscaleRecoverySettings
    ) => {
      if (
        !file ||
        processingInFlightRef.current
      ) {
        return;
      }

      const activeSettings:
        GrayscaleRecoverySettings =
          forcedSettings || {
            mode,
            threshold,
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

      setErrorMessage(
        null
      );

      revokeDownloadUrl();

      try {
        const outputBytes =
          await exclusivelyProcess(
            async () => {
              let recoveryEnabled =
                false;

              try {
                await saveGrayscaleJobSource(
                  file,
                  activeSettings.mode,
                  activeSettings.threshold
                );

                recoveryEnabled =
                  true;
              } catch (
                recoveryError
              ) {
                console.warn(
                  'Grayscale restart recovery unavailable:',
                  recoveryError
                );
              }

              return await convertToGrayscalePDF(
                file,
                {
                  mode:
                    activeSettings.mode,

                  threshold:
                    activeSettings.threshold,

                  onProgress:
                    (
                      curr,
                      total
                    ) => {
                      setProgressText(
                        `Converting page ${curr} of ${total}...`
                      );
                    },

                  recovery:
                    recoveryEnabled
                      ? {
                          readPage:
                            readGrayscalePage,

                          writePage:
                            writeGrayscalePage,
                        }
                      : undefined,
                }
              );
            }
          );

        const blob =
          new Blob(
            [
              outputBytes as unknown as BlobPart,
            ],
            {
              type:
                'application/pdf',
            }
          );

        createUrl(
          blob
        );

        /*
         * Complete output exists: clear recovery, then charge.
         */
        await clearGrayscaleRecovery();

        clearProcessingRecovery();

        recoverySettingsRef.current =
          null;

        setRecoveryReady(
          false
        );

        resumeAttemptedRef.current =
          false;

        commitTaskCredit();
      } catch (
        err:
          any
      ) {
        console.error(
          'Grayscale error:',
          err
        );

        /*
         * Keep source and finished page checkpoints after an
         * interruption so reopening can continue.
         */
        setErrorMessage(
          err?.message ||
            String(err) ||
            'Processing was interrupted. Reopen B&W / Grayscale to continue from the last completed page.'
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
   * Resume only after the live page-1 preview has released its
   * PDF.js document and canvas.
   */
  useEffect(
    () => {
      if (
        !file ||
        !recoveryReady ||
        isLoadingPreview ||
        previewBusyRef.current ||
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
              previewBusyRef.current ||
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
      isLoadingPreview,
      mode,
      threshold,
    ]
  );

  const discardGrayscaleRecovery =
    () => {
      clearProcessingRecovery();

      void clearGrayscaleRecovery()
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


  const handleClear = () => {
    if (
      isProcessing
    ) {
      return;
    }

    discardGrayscaleRecovery();

    processingInFlightRef.current =
      false;

    durableRestoreAttemptedRef.current =
      false;

    checkedRecoveryFileRef.current =
      null;

    previewBusyRef.current =
      false;

    onFileChange(null);
    setPreviewUrl(null);
    setZoomLevel(1);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(2.5, Number((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))));
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  return (
    <div
      aria-busy={
        isProcessing
          ? true
          : undefined
      }
      data-processing-active={
        isProcessing
          ? 'true'
          : undefined
      }
      className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl"
    >
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to convert to black and white"
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
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === 'application/pdf') {
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Printer className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to convert to B&amp;W / Grayscale</p>
          <p className="text-xs text-zinc-500 mt-1">Optimize for printing, toner saving, and legal filings</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                onFileChange(selected);
              }
              e.target.value = '';
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
                <p className="text-xs text-zinc-500">
                  {totalPages > 0 ? `${totalPages} Pages • ` : ''}
                  {Math.round(file.size / 1024)} KB
                </p>
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

          {desktopCapacityRecommendation && (
            <DesktopCapacityStatus
              recommendation={
                desktopCapacityRecommendation
              }
            />
          )}

          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                if (
                  isProcessing ||
                  mode === 'grayscale'
                ) {
                  return;
                }

                discardGrayscaleRecovery();

                setMode('grayscale');
                revokeDownloadUrl();
              }}
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mode === 'grayscale'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Smooth Grayscale</span>
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                if (
                  isProcessing ||
                  mode === 'pure-bw'
                ) {
                  return;
                }

                discardGrayscaleRecovery();

                setMode('pure-bw');
                revokeDownloadUrl();
              }}
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mode === 'pure-bw'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Pure B&amp;W (Photocopy)</span>
            </button>
          </div>

          {/* Threshold Slider (Only for Pure B&W) */}
          {mode === 'pure-bw' && (
            <div className="space-y-2 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-300 font-medium">Scan Contrast Threshold</span>
                <span className="text-emerald-400 font-semibold">{threshold}</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={threshold}
                disabled={isProcessing}
                onChange={(e) => {
                  if (
                    isProcessing
                  ) {
                    return;
                  }

                  setThreshold(
                    Number(
                      e.target.value
                    )
                  );

                  revokeDownloadUrl();
                }}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <p className="text-[11px] text-zinc-500">
                Lower values make text thinner; higher values darken text and scan details.
              </p>
            </div>
          )}

          {/* Real-time Page 1 Preview Card with Zoom Controls & 4-Way Scroll Box */}
          {previewUrl && (
            <div className="p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-medium">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Page 1 Live Preview</span>
                </div>

                {/* Zoom Controls Bar */}
                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoomLevel <= 0.5}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Zoom Out (-25%)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono text-zinc-300 px-1.5 select-none min-w-[42px] text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoomLevel >= 2.5}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Zoom In (+25%)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-[1px] h-3 bg-zinc-800 mx-0.5" />
                  <button
                    type="button"
                    onClick={handleZoomReset}
                    disabled={zoomLevel === 1}
                    className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/80 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Reset to 100%"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 4-Way Scroll / Pan Preview Window */}
              <div
                className="w-full h-80 bg-zinc-950/90 rounded-lg border border-zinc-800/90 overflow-auto overscroll-contain scrollbar-thin p-4 shadow-inner"
                style={{
                  WebkitOverflowScrolling:
                    'touch',
                }}
              >
                <div className="min-w-full min-h-full flex">
                  {isLoadingPreview ? (
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Grayscale Preview"
                      style={{
                        width: `${Math.round(200 * zoomLevel)}px`,
                        maxWidth: 'none',
                      }}
                      className="block max-w-none shrink-0 m-auto rounded border border-zinc-700/80 shadow-2xl object-contain transition-all duration-150 select-none"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger */}
          {!downloadUrl ? (
            <button
              onClick={() => {
                void handleConvert();
              }}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Converting to monochrome...'}</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 stroke-[2.5]" />
                  <span>Convert to {mode === 'pure-bw' ? 'Pure B&W' : 'Grayscale'}</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Converted Successfully
              </div>
              <a
                href={downloadUrl}
                download={`grayscale_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Grayscale PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GrayscalePdf;