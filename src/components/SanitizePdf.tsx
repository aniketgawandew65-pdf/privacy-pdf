import React, { useState, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  ShieldCheck,
  AlertCircle,
  EyeOff,
  Info,
} from 'lucide-react';
import { sanitizePDF } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';
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
  clearSanitizeRecovery,
  readSanitizeJobMeta,
  readSanitizePage,
  restoreSanitizeJobSource,
  sanitizeJobMatchesFile,
  saveSanitizeJobSource,
  writeSanitizePage,
} from '../utils/sanitizeRecovery';

interface SanitizePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const SanitizePdf: React.FC<SanitizePdfProps> = ({ file, onFileChange }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processingInFlightRef =
    useRef(false);

  const durableRestoreAttemptedRef =
    useRef(false);

  const checkedRecoveryFileRef =
    useRef<File | null>(null);

  const resumeAttemptedRef =
    useRef(false);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  /*
   * ==========================================================
   * RESTORE INTERRUPTED SANITIZE JOB
   * ==========================================================
   */
  React.useEffect(() => {
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
            await restoreSanitizeJobSource();

          if (
            cancelled ||
            !restored
          ) {
            return;
          }

          preserveProcessingWorkspace();

          setRecoveryReady(
            true
          );

          onFileChange(
            restored
          );
        } catch (
          error
        ) {
          console.warn(
            'Unable to restore interrupted Sanitize job:',
            error
          );
        }
      }
    )();

    return () => {
      cancelled =
        true;
    };
  }, [
    file,
    onFileChange,
  ]);


  /*
   * Detect a recovery job if the same source File is already
   * present in the current SPA session.
   */
  React.useEffect(() => {
    if (!file) {
      checkedRecoveryFileRef.current =
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
            await readSanitizeJobMeta();

          if (
            cancelled ||
            !sanitizeJobMatchesFile(
              meta,
              file
            )
          ) {
            return;
          }

          preserveProcessingWorkspace();

          setRecoveryReady(
            true
          );
        } catch (
          error
        ) {
          console.warn(
            'Unable to inspect Sanitize recovery:',
            error
          );
        }
      }
    )();

    return () => {
      cancelled =
        true;
    };
  }, [
    file,
  ]);


  const handleSanitize =
    async () => {
      if (
        !file ||
        processingInFlightRef.current
      ) {
        return;
      }


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
                await saveSanitizeJobSource(
                  file
                );

                recoveryEnabled =
                  true;

                setRecoveryReady(
                  true
                );
              } catch (
                recoveryError
              ) {
                console.warn(
                  'Sanitize restart recovery unavailable:',
                  recoveryError
                );
              }


              return await sanitizePDF(
                file,
                {
                  onProgress:
                    (
                      current,
                      total
                    ) => {
                      setProgressText(
                        `Deep sanitizing page ${current} of ${total}...`
                      );
                    },

                  recovery:
                    recoveryEnabled
                      ? {
                          readPage:
                            readSanitizePage,

                          writePage:
                            writeSanitizePage,
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
         * The final clean PDF exists. Recovery can now be
         * deleted and this successful operation charged.
         */
        await clearSanitizeRecovery();

        clearProcessingRecovery();

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
          'Sanitize error:',
          err
        );

        setErrorMessage(
          err?.message ||
            'Sanitization was interrupted. Reopen Sanitize to continue from the last completed page.'
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
   * Automatically continue after Safari/WebKit recreation.
   */
  React.useEffect(() => {
    if (
      !file ||
      !recoveryReady ||
      resumeAttemptedRef.current ||
      processingInFlightRef.current
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          if (
            resumeAttemptedRef.current ||
            processingInFlightRef.current
          ) {
            return;
          }

          resumeAttemptedRef.current =
            true;

          void handleSanitize();
        },
        300
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    file,
    recoveryReady,
  ]);


  const discardSanitizeRecovery =
    () => {
      clearProcessingRecovery();

      void clearSanitizeRecovery()
        .catch(
          () => {}
        );

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

    discardSanitizeRecovery();

    processingInFlightRef.current =
      false;

    durableRestoreAttemptedRef.current =
      false;

    checkedRecoveryFileRef.current =
      null;

    onFileChange(
      null
    );

    revokeDownloadUrl();

    setErrorMessage(
      null
    );
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to strip hidden metadata and tracking tags"
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
              setErrorMessage(null);
              revokeDownloadUrl();
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <EyeOff className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to sanitize metadata</p>
          <p className="text-xs text-zinc-500 mt-1">Strips author, device, timestamp, and XMP tracking data</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                setErrorMessage(null);
                revokeDownloadUrl();
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
                <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Items Removed Breakdown */}
          <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Deep sanitization removes hidden & interactive data:</span>
            </div>
            <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-400 list-disc list-inside">
              <li>All document metadata</li>
              <li>XMP & custom Info keys</li>
              <li>Embedded files</li>
              <li>Comments & annotations</li>
              <li>Forms & hidden values</li>
              <li>JavaScript & actions</li>
              <li>Tracking links</li>
              <li>Invisible / OCR text layers</li>
            </ul>

            {/* Clarification Notice */}
            <div className="pt-2 border-t border-zinc-800/60 flex items-start gap-2 text-[11px] text-zinc-500">
              <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
              <span>
                Deep Sanitize rebuilds only the visible page appearance into a clean PDF. Links, forms, comments, attachments, scripts, bookmarks and selectable/OCR text layers are intentionally removed. To black out visible sensitive details, use <strong>Redact</strong>.
              </span>
            </div>
          </div>

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
              onClick={handleSanitize}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Deep sanitizing document...'}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                  <span>Deep Sanitize & Rebuild PDF</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Deep Sanitization Completed Successfully
              </div>
              <a
                href={downloadUrl}
                download={`sanitized_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Download Cleaned PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};