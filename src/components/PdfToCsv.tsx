import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Table,
} from 'lucide-react';
import { extractTableFromPDF, type ExtractedTableResult } from '../utils/pdfEngine';
import {
  refineExtractedTableResult,
} from '../utils/pdfCsvStructure';
import { useObjectUrl } from '../utils/useObjectUrl';
import {
  clearProcessingRecovery,
  exclusivelyProcess,
  preserveProcessingWorkspace,
} from '../utils/localProcessing';
import {
  clearPdfToCsvRecovery,
  pdfToCsvJobMatchesFile,
  readPdfToCsvJobMeta,
  readPdfToCsvPage,
  restorePdfToCsvJobSource,
  savePdfToCsvJobSource,
  writePdfToCsvPage,
  type PdfToCsvSettings,
} from '../utils/pdfToCsvRecovery';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';

interface PdfToCsvProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const PdfToCsv: React.FC<PdfToCsvProps> = ({ file, onFileChange }) => {
  const [delimiter, setDelimiter] = useState<',' | ';' | '\t'>(',');
  const [yTolerance, setYTolerance] = useState<number>(4);
  const [minColumnGap, setMinColumnGap] = useState<number>(12);

  const [tableData, setTableData] = useState<ExtractedTableResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
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
    useRef<PdfToCsvSettings | null>(
      null
    );

  const [recoveryReady, setRecoveryReady] =
    useState(false);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  /*
   * ==========================================================
   * PDF -> CSV DIRECT SCREEN WAKE LOCK
   * ==========================================================
   *
   * The global wake-lock controller remains untouched.
   *
   * PDF -> CSV performs long OCR / PDF.js recycle phases, so
   * hold an explicit sentinel for this operation from the
   * Extract CSV user gesture until processing actually ends.
   */
  const csvWakeLockRef =
    useRef<any>(
      null
    );

  const csvWakeRetryRef =
    useRef<number | null>(
      null
    );


  const acquireCsvWakeLock =
    async () => {
      if (
        document.visibilityState !==
        'visible'
      ) {
        return;
      }

      const current =
        csvWakeLockRef.current;

      if (
        current &&
        current.released !==
          true
      ) {
        return;
      }

      const wakeLockApi =
        (
          navigator as any
        ).wakeLock;

      if (
        !wakeLockApi ||
        typeof wakeLockApi.request !==
          'function'
      ) {
        return;
      }

      csvWakeLockRef.current =
        null;

      try {
        const sentinel =
          await wakeLockApi.request(
            'screen'
          );

        csvWakeLockRef.current =
          sentinel;

        sentinel
          ?.addEventListener?.(
            'release',
            () => {
              if (
                csvWakeLockRef.current ===
                sentinel
              ) {
                csvWakeLockRef.current =
                  null;
              }
            },
            {
              once: true,
            }
          );
      } catch (_) {
        csvWakeLockRef.current =
          null;
      }
    };


  const startCsvWakeGuard =
    async () => {
      /*
       * First request happens directly from the Extract CSV
       * click before the heavy OCR work begins.
       */
      await acquireCsvWakeLock();

      if (
        csvWakeRetryRef.current !==
        null
      ) {
        window.clearInterval(
          csvWakeRetryRef.current
        );
      }

      csvWakeRetryRef.current =
        window.setInterval(
          () => {
            const current =
              csvWakeLockRef.current;

            if (
              !current ||
              current.released ===
                true
            ) {
              csvWakeLockRef.current =
                null;

              void acquireCsvWakeLock();
            }
          },
          1000
        );
    };


  const stopCsvWakeGuard =
    async () => {
      if (
        csvWakeRetryRef.current !==
        null
      ) {
        window.clearInterval(
          csvWakeRetryRef.current
        );

        csvWakeRetryRef.current =
          null;
      }

      const current =
        csvWakeLockRef.current;

      csvWakeLockRef.current =
        null;

      if (
        current &&
        typeof current.release ===
          'function'
      ) {
        try {
          await current.release();
        } catch (_) {}
      }
    };


  useEffect(
    () => {
      const handleVisibility =
        () => {
          if (
            document.visibilityState ===
              'visible' &&
            processingInFlightRef.current
          ) {
            void acquireCsvWakeLock();
          }
        };

      document.addEventListener(
        'visibilitychange',
        handleVisibility
      );

      return () => {
        document.removeEventListener(
          'visibilitychange',
          handleVisibility
        );

        if (
          csvWakeRetryRef.current !==
          null
        ) {
          window.clearInterval(
            csvWakeRetryRef.current
          );

          csvWakeRetryRef.current =
            null;
        }

        const current =
          csvWakeLockRef.current;

        csvWakeLockRef.current =
          null;

        if (
          current &&
          typeof current.release ===
            'function'
        ) {
          void current
            .release()
            .catch(
              () => {}
            );
        }
      };
    },
    []
  );


  const discardPdfToCsvRecovery =
    () => {
      clearProcessingRecovery();

      void clearPdfToCsvRecovery()
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
   * Safari may recreate the page while a large 86-page
   * extraction is running. Restore the exact browser-local
   * source and parsing settings.
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
              await restorePdfToCsvJobSource();

            if (
              cancelled ||
              !restored
            ) {
              return;
            }

            recoverySettingsRef.current =
              restored.settings;

            setDelimiter(
              restored.settings
                .delimiter
            );

            setYTolerance(
              restored.settings
                .yTolerance
            );

            setMinColumnGap(
              restored.settings
                .minColumnGap
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
              'Unable to restore interrupted PDF to CSV job:',
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
   * The generic workspace may already contain the same source
   * when this component mounts. Reconnect it to its dedicated
   * CSV checkpoint job.
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
              await readPdfToCsvJobMeta();

            if (
              cancelled ||
              !meta ||
              !pdfToCsvJobMatchesFile(
                meta,
                file
              )
            ) {
              return;
            }

            const settings:
              PdfToCsvSettings = {
                delimiter:
                  meta.delimiter,

                yTolerance:
                  meta.yTolerance,

                minColumnGap:
                  meta.minColumnGap,
              };

            recoverySettingsRef.current =
              settings;

            setDelimiter(
              settings.delimiter
            );

            setYTolerance(
              settings.yTolerance
            );

            setMinColumnGap(
              settings.minColumnGap
            );

            preserveProcessingWorkspace();

            setRecoveryReady(
              true
            );
          } catch (
            error
          ) {
            console.warn(
              'Unable to inspect interrupted PDF to CSV job:',
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


  const parseDocument = async (
    forcedSettings?:
      PdfToCsvSettings
  ) => {
    if (
      !file ||
      processingInFlightRef.current
    ) {
      return;
    }

    const activeSettings:
      PdfToCsvSettings =
        forcedSettings || {
          delimiter,
          yTolerance,
          minColumnGap,
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


    /*
     * Acquire from the actual Extract CSV user gesture.
     */
    await startCsvWakeGuard();

    processingInFlightRef.current =
      true;

    setIsProcessing(
      true
    );

    setErrorMessage(
      null
    );

    setProgressText(
      'Preparing CSV extraction...'
    );

    revokeDownloadUrl();


    try {
      const rawResult =
        await exclusivelyProcess(
          async () => {
            let recoveryEnabled =
              false;

            try {
              await savePdfToCsvJobSource(
                file,
                activeSettings
              );

              recoveryEnabled =
                true;
            } catch (
              recoveryError
            ) {
              console.warn(
                'PDF to CSV restart recovery unavailable:',
                recoveryError
              );
            }


            return await extractTableFromPDF(
              file,
              {
                delimiter:
                  activeSettings.delimiter,

                yTolerance:
                  activeSettings.yTolerance,

                minColumnGap:
                  activeSettings.minColumnGap,

                onProgress:
                  (
                    current,
                    total
                  ) => {
                    setProgressText(
                      `Analyzing page ${current} of ${total} coordinates...`
                    );
                  },

                recovery:
                  recoveryEnabled
                    ? {
                        readPage:
                          readPdfToCsvPage,

                        writePage:
                          writePdfToCsvPage,
                      }
                    : undefined,
              }
            );
          }
        );


      /*
       * Refinement runs only AFTER extraction/checkpointing.
       * Recovery data remains the untouched raw page data.
       */
      const result =
        refineExtractedTableResult(
          rawResult,
          activeSettings.delimiter
        );


      if (
        result.totalRows ===
          0
      ) {
        setErrorMessage(
          'No tabular data detected. If this is a scanned document, use "OCR Searchable" first.'
        );

        setTableData(
          null
        );
      } else {
        setTableData(
          result
        );


        const isTsv =
          activeSettings.delimiter ===
          '\t';


        /*
         * UTF-8 BOM improves Excel handling for names,
         * addresses and non-ASCII text.
         *
         * Tab mode is a genuine TSV rather than a .csv file
         * containing tabs.
         */
        const blob =
          new Blob(
            [
              '\uFEFF',
              result.csv,
            ],
            {
              type:
                isTsv
                  ? 'text/tab-separated-values;charset=utf-8;'
                  : 'text/csv;charset=utf-8;',
            }
          );


        createUrl(
          blob
        );


        /*
         * Final usable CSV exists before charging the task.
         */
        await clearPdfToCsvRecovery();

        clearProcessingRecovery();

        recoverySettingsRef.current =
          null;

        setRecoveryReady(
          false
        );

        resumeAttemptedRef.current =
          false;

        commitTaskCredit();
      }
    } catch (
      err:
        any
    ) {
      console.error(
        'Table parsing error:',
        err
      );


      /*
       * Keep source and completed-page checkpoints intact.
       */
      setErrorMessage(
        err?.message ||
          'Processing was interrupted. Reopen PDF to CSV to continue from the last completed page.'
      );

      setTableData(
        null
      );
    } finally {
      processingInFlightRef.current =
        false;

      await stopCsvWakeGuard();

      setIsProcessing(
        false
      );

      setProgressText(
        ''
      );
    }
  };


  /*
   * After Safari/WebKit recreates the page, automatically
   * continue the interrupted extraction once.
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

      if (!settings) {
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

            void parseDocument(
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


  useEffect(() => {
    setTableData(null);
    revokeDownloadUrl();
    setErrorMessage(null);
    setProgressText('');
  }, [file, delimiter, yTolerance, minColumnGap]);

  const handleClear = () => {
    if (
      isProcessing
    ) {
      return;
    }

    discardPdfToCsvRecovery();

    processingInFlightRef.current =
      false;

    durableRestoreAttemptedRef.current =
      false;

    checkedRecoveryFileRef.current =
      null;

    onFileChange(null);
    setTableData(null);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to extract tables to CSV"
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
              discardPdfToCsvRecovery();
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Table className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop bank statements or invoices to extract CSV</p>
          <p className="text-xs text-zinc-500 mt-1">100% In-Browser Table Parser • Zero Financial Data Egress</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                discardPdfToCsvRecovery();
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
                  {tableData ? `${tableData.totalRows} Rows Extracted • ` : ''}
                  {Math.round(file.size / 1024)} KB
                </p>
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

          {/* Tuning Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs">
            <div>
              <label className="text-zinc-300 font-medium block mb-1.5">Delimiter</label>
              <select
                value={delimiter}
                disabled={isProcessing}
                onChange={(e) => {
                  if (isProcessing) return;

                  discardPdfToCsvRecovery();

                  setDelimiter(
                    e.target.value as
                      ',' | ';' | '\t'
                  );
                }}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                <option value=",">Comma (Standard CSV)</option>
                <option value=";">Semicolon (;)</option>
                <option value={'\t'}>Tab (TSV / Excel Paste)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-zinc-300 font-medium">Row Gap ({yTolerance}px)</span>
                <span className="text-zinc-500 text-[10px]">Vertical</span>
              </div>
              <input
                type="range"
                min="2"
                max="10"
                step="1"
                value={yTolerance}
                disabled={isProcessing}
                onChange={(e) => {
                  if (isProcessing) return;

                  discardPdfToCsvRecovery();

                  setYTolerance(
                    parseInt(
                      e.target.value,
                      10
                    )
                  );
                }}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-zinc-300 font-medium">Column Gap ({minColumnGap}px)</span>
                <span className="text-zinc-500 text-[10px]">Horizontal</span>
              </div>
              <input
                type="range"
                min="6"
                max="30"
                step="2"
                value={minColumnGap}
                disabled={isProcessing}
                onChange={(e) => {
                  if (isProcessing) return;

                  discardPdfToCsvRecovery();

                  setMinColumnGap(
                    parseInt(
                      e.target.value,
                      10
                    )
                  );
                }}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void parseDocument()}
            disabled={isProcessing}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extracting CSV...</span>
              </>
            ) : (
              <>
                <Table className="w-4 h-4" />
                <span>Extract CSV</span>
              </>
            )}
          </button>

          {/* Table Data Preview */}
          {isProcessing ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 bg-zinc-950/50 rounded-xl border border-zinc-800 text-xs text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span>{progressText || 'Parsing tabular structure...'}</span>
            </div>
          ) : tableData && tableData.rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span>Preview (First {Math.min(tableData.rows.length, 12)} rows)</span>
                <span>{tableData.totalRows} total rows found</span>
              </div>

              <div className="overflow-x-auto max-h-64 border border-zinc-800 rounded-xl bg-zinc-950/80">
                <table className="w-full text-left text-xs border-collapse">
                  <tbody>
                    {tableData.rows.slice(0, 12).map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          rIdx === 0
                            ? 'bg-zinc-900/90 text-emerald-400 font-semibold border-b border-zinc-800'
                            : 'border-b border-zinc-900/80 hover:bg-zinc-900/40 text-zinc-300'
                        }
                      >
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 border-r border-zinc-800/40 truncate max-w-[200px]">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Download Action */}
          {downloadUrl && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Ready for CSV Export ({tableData?.totalRows} rows)
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace(/\.[^/.]+$/, '')}.${delimiter === '\t' ? 'tsv' : 'csv'}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {delimiter === '\t'
                    ? 'Download TSV / Excel Table'
                    : 'Download CSV / Excel Table'}
                </span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};