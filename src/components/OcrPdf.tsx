import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  ScanText,
  Languages,
  Search,
} from 'lucide-react';
import {
  ocrPDFToSearchable,
  getPDFPageCount,
  type OcrProgress,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

import {
  clearProcessingRecovery,
  digestText,
  exclusivelyProcess,
  localContentId,
  preserveProcessingWorkspace,
} from '../utils/localProcessing';

import {
  clearOcrSearchPages,
  readOcrSearchPage,
  writeOcrSearchPage,
} from '../utils/ocrSearchPageStore';

import {
  clearOcrSearchJobSource,
  restoreOcrSearchJobSource,
  saveOcrSearchJobSource,
} from '../utils/ocrSearchJobStore';

interface OcrPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'eng', label: 'English (Installed Offline)' },
];

const OCR_RESUME_KEY =
  'oneinto1-searchable-ocr-resume-v1';

type OcrResumeMarker = {
  name: string;
  size: number;
  lastModified: number;
  language: string;
};

const readOcrResumeMarker =
  (): OcrResumeMarker | null => {
    try {
      const raw =
        sessionStorage.getItem(
          OCR_RESUME_KEY
        );

      if (!raw) {
        return null;
      }

      return JSON.parse(
        raw
      ) as OcrResumeMarker;
    } catch {
      return null;
    }
  };

const writeOcrResumeMarker =
  (
    file: File,
    language: string
  ) => {
    try {
      sessionStorage.setItem(
        OCR_RESUME_KEY,
        JSON.stringify({
          name:
            file.name,
          size:
            file.size,
          lastModified:
            file.lastModified ||
            0,
          language,
        } satisfies OcrResumeMarker)
      );
    } catch {}
  };

const clearOcrResumeMarker =
  () => {
    try {
      sessionStorage.removeItem(
        OCR_RESUME_KEY
      );
    } catch {}
  };

const markerMatchesFile =
  (
    marker:
      OcrResumeMarker |
      null,

    file:
      File,

    language:
      string
  ) =>
    Boolean(
      marker &&
      marker.name ===
        file.name &&
      marker.size ===
        file.size &&
      marker.lastModified ===
        (
          file.lastModified ||
          0
        ) &&
      marker.language ===
        language
    );

export const OcrPdf: React.FC<OcrPdfProps> = ({ file, onFileChange }) => {
  const [language, setLanguage] = useState('eng');
  const [pageCount, setPageCount] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressInfo, setProgressInfo] = useState<OcrProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * Same-JS-process duplicate protection.
   *
   * Browser-process recovery is handled by the persistent
   * per-page checkpoints below.
   */
  const processingInFlightRef =
    useRef(false);

  const resumeAttemptedRef =
    useRef(false);

  /*
   * Separate from the OCR-run resume guard.
   *
   * This guard prevents repeated IndexedDB/OPFS restoration
   * attempts while the component is mounted with file=null.
   */
  const durableRestoreAttemptedRef =
    useRef(false);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Pre-warm offline files into browser cache on initial mount
  useEffect(() => {
    const prewarmOfflineCache = async () => {
      try {
        const assets = [
          '/tessdata/worker.min.js',
          '/tessdata/tesseract-core-simd-lstm.wasm.js',
          '/tessdata/eng.traineddata.gz',
        ];
        assets.forEach((url) => {
          fetch(url, { cache: 'force-cache' }).catch(() => {});
        });
      } catch {
        // Silent catch: pre-warming failure should not block standard flow
      }
    };
    prewarmOfflineCache();
  }, []);

  useEffect(() => {
    if (!file) {
      resumeAttemptedRef.current =
        false;

      setPageCount(0);
      revokeDownloadUrl();
      setErrorMessage(null);
      setProgressInfo(null);
      return;
    }

    let isMounted = true;
    getPDFPageCount(file)
      .then((count) => {
        if (isMounted) setPageCount(count);
      })
      .catch((err) => {
        console.error('Error reading PDF:', err);
        if (isMounted) {
          setErrorMessage('Could not inspect PDF. The file may be password-protected.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [file]);

  /*
   * ==========================================================
   * DURABLE INPUT RESTORATION
   * ==========================================================
   *
   * Safari can recreate its WebContent process while OCR is
   * running.
   *
   * Page checkpoints already survive in IndexedDB.
   * This restores the missing source File automatically from
   * OPFS even when sessionStorage itself was lost/recreated.
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
              await restoreOcrSearchJobSource();


            if (
              cancelled ||
              !restored
            ) {
              return;
            }


            /*
             * Recreate the lightweight session markers used by
             * the existing auto-resume + global wake-lock layers.
             */
            preserveProcessingWorkspace();


            writeOcrResumeMarker(
              restored.file,
              restored.language
            );


            setLanguage(
              restored.language
            );


            /*
             * This repopulates App.tsx sharedFiles.
             *
             * The normal OCR resume effect then sees the restored
             * File and automatically continues from the first
             * unfinished IndexedDB page checkpoint.
             */
            onFileChange(
              restored.file
            );
          } catch (
            error
          ) {
            console.warn(
              'Unable to restore interrupted Searchable OCR job:',
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


  const handleRunOcr =
    async () => {
      if (
        !file ||
        processingInFlightRef.current
      ) {
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

      /*
       * This tiny marker contains no document bytes/text.
       * It only tells the restored OCR screen that an
       * interrupted job should continue automatically.
       */
      writeOcrResumeMarker(
        file,
        language
      );

      let cacheIdentity:
        string |
        null =
          null;

      try {
        const outputBytes =
          await exclusivelyProcess(
            async () => {
              /*
               * Durable restart recovery.
               *
               * The complete source is written to a dedicated
               * OPFS recovery location. Metadata is published
               * to IndexedDB only after that write succeeds.
               *
               * This does NOT change OCR bytes or output.
               */
              await saveOcrSearchJobSource(
                file,
                language
              );

              setProgressInfo({
                status:
                  'Preparing local OCR recovery...',
                progress:
                  5,
              });

              const sourceIdentity =
                await localContentId(
                  file
                );

              cacheIdentity =
                await digestText(
                  JSON.stringify(
                    [
                      'searchable-ocr-v1',
                      sourceIdentity,
                      language,
                      2.0,
                    ]
                  )
                );

              return await ocrPDFToSearchable(
                file,
                language,
                (
                  progress
                ) => {
                  setProgressInfo(
                    progress
                  );
                },
                {
                  readPage:
                    async (
                      pageNumber
                    ) =>
                      await readOcrSearchPage(
                        cacheIdentity!,
                        pageNumber
                      ),

                  writePage:
                    async (
                      pageNumber,
                      pageData
                    ) => {
                      await writeOcrSearchPage(
                        cacheIdentity!,
                        pageNumber,
                        pageData
                      );
                    },
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
         * The complete searchable PDF now exists.
         * Recovery is no longer needed for this job.
         */
        clearOcrResumeMarker();

        clearProcessingRecovery();

        await clearOcrSearchJobSource();


        if (
          cacheIdentity
        ) {
          void clearOcrSearchPages(
            cacheIdentity
          ).catch(
            (
              recoveryError
            ) => {
              console.warn(
                'Unable to clear completed Searchable OCR recovery data:',
                recoveryError
              );
            }
          );
        }
      } catch (
        err:
          any
      ) {
        console.error(
          'OCR Error:',
          err
        );

        /*
         * IMPORTANT:
         * Keep both the job marker and page checkpoints.
         * A browser-process restart/retry resumes instead of
         * throwing completed work away.
         */
        setErrorMessage(
          err?.message ||
          String(err) ||
          'Processing was interrupted. Reopen this tool to continue from the last completed page.'
        );
      } finally {
        processingInFlightRef.current =
          false;

        setIsProcessing(
          false
        );

        setProgressInfo(
          null
        );
      }
    };

  /*
   * ==========================================================
   * AUTOMATIC SAFARI/WEBKIT PROCESS-RESTART RESUME
   * ==========================================================
   *
   * When App.tsx restores the OPFS-backed source File, this
   * component sees the job marker and relaunches the engine.
   *
   * The engine itself skips every page already stored in IDB,
   * so the visible progress jumps to the first unfinished page.
   */
  useEffect(
    () => {
      if (
        !file ||
        resumeAttemptedRef.current
      ) {
        return;
      }

      const marker =
        readOcrResumeMarker();

      if (
        !markerMatchesFile(
          marker,
          file,
          language
        )
      ) {
        return;
      }

      resumeAttemptedRef.current =
        true;

      const timer =
        window.setTimeout(
          () => {
            void handleRunOcr();
          },
          100
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    },
    [
      file,
      language,
    ]
  );


  const handleClear = () => {
    if (isProcessing) return;

    clearOcrResumeMarker();

    clearProcessingRecovery();

    void clearOcrSearchJobSource()
      .catch(
        (
          recoveryError
        ) => {
          console.warn(
            'Unable to clear durable Searchable OCR source:',
            recoveryError
          );
        }
      );

    void clearOcrSearchPages()
      .catch(
        (
          recoveryError
        ) => {
          console.warn(
            'Unable to clear Searchable OCR recovery records:',
            recoveryError
          );
        }
      );

    resumeAttemptedRef.current =
      false;

    onFileChange(null);
    revokeDownloadUrl();
    setErrorMessage(null);
    setProgressInfo(null);
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
          aria-label="Drop a scanned PDF to make searchable"
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
          <ScanText className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a scanned PDF to make it searchable</p>
          <p className="text-xs text-zinc-500 mt-1">Client-side OCR via Tesseract.js • Zero cloud uploads</p>
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
                  {pageCount > 0 ? `${pageCount} Pages • ` : ''}
                  {Math.round(file.size / 1024)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              disabled={isProcessing}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Language Selection */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <Languages className="w-3.5 h-3.5 text-emerald-400" />
              <span>OCR Language</span>
            </label>
            <select
              value={language}
              disabled={isProcessing}
              onChange={(e) => {
                setLanguage(e.target.value);
                revokeDownloadUrl();
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Value Prop Banner */}
          <div className="p-3 bg-zinc-950/50 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 flex items-start gap-2.5">
            <Search className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Embeds an invisible, coordinate-accurate text layer beneath your scans. The visual presentation remains unchanged, but all words become selectable and searchable via Ctrl+F / Cmd+F.
            </span>
          </div>

          {/* Progress Indicator */}
          {isProcessing && progressInfo && (
            <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">{progressInfo.status}</span>
                <span className="text-emerald-400 font-semibold">{progressInfo.progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressInfo.progress}%` }}
                />
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

          {/* Action Trigger / Download State */}
          {!downloadUrl ? (
            <button
              onClick={handleRunOcr}
              disabled={isProcessing || pageCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing OCR in browser...</span>
                </>
              ) : (
                <>
                  <ScanText className="w-4 h-4 stroke-[2.5]" />
                  <span>Make PDF Searchable ({pageCount} Pages)</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Searchable PDF Generated Successfully
              </div>
              <a
                href={downloadUrl}
                download={`searchable_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Searchable PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};