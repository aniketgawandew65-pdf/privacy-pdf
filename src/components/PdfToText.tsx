import { useEffect, useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Copy,
  Download,
  Loader2,
  CheckCircle2,
  Sparkles,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { extractTextFromPDF } from '../utils/pdfEngine';
import {
  clearProcessingRecovery,
  exclusivelyProcess,
  preserveProcessingWorkspace,
} from '../utils/localProcessing';
import {
  clearPdfToTextRecovery,
  pdfToTextJobMatchesFile,
  readPdfToTextJobMeta,
  readPdfToTextPage,
  restorePdfToTextJobSource,
  savePdfToTextJobSource,
  writePdfToTextPage,
} from '../utils/pdfToTextRecovery';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';
import { getLicenseStatus } from '../utils/license';
import {
  useDesktopCapacityRecommendation,
} from '../hooks/useDesktopCapacityRecommendation';
import { DesktopCapacityStatus } from './DesktopCapacityStatus';

interface PdfToTextProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export function PdfToText({ file, onFileChange }: PdfToTextProps) {
  const [extractedText, setExtractedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processingInFlightRef =
    useRef(false);

  const durableRestoreAttemptedRef =
    useRef(false);

  const resumeAttemptedRef =
    useRef(false);

  const checkedRecoveryFileRef =
    useRef<File | null>(null);

  const [recoveryReady, setRecoveryReady] =
    useState(false);

  const {
    recommendation:
      desktopCapacityRecommendation,
  } =
    useDesktopCapacityRecommendation({
      toolId:
        'pdf-to-text',

      selectedBytes:
        file?.size ?? 0,

      enabled:
        Boolean(file) &&
        getLicenseStatus().isPro,
    });


  const discardPdfToTextRecovery =
    () => {
      clearProcessingRecovery();

      void clearPdfToTextRecovery()
        .catch(
          () => {}
        );

      resumeAttemptedRef.current =
        false;

      setRecoveryReady(
        false
      );
    };


  /*
   * Restore the exact source PDF after Safari/WebKit recreates
   * the page during a large extraction.
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
              await restorePdfToTextJobSource();

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
              'Unable to restore interrupted PDF to Text job:',
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
   * App.tsx may restore the same source through its normal
   * workspace before this component mounts.
   */
  useEffect(
    () => {
      if (
        !file
      ) {
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
              await readPdfToTextJobMeta();

            if (
              cancelled ||
              !pdfToTextJobMatchesFile(
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
              'Unable to inspect interrupted PDF to Text job:',
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


  const handleProcess = async () => {
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
      setErrorMsg(
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

    setProgressMsg(
      'Analyzing document...'
    );

    setExtractedText(
      ''
    );

    setErrorMsg(
      null
    );

    try {
      const result =
        await exclusivelyProcess(
          async () => {
            let recoveryEnabled =
              false;

            try {
              await savePdfToTextJobSource(
                file
              );

              recoveryEnabled =
                true;
            } catch (
              recoveryError
            ) {
              console.warn(
                'PDF to Text restart recovery unavailable:',
                recoveryError
              );
            }

            return await extractTextFromPDF(
              file,
              (
                status
              ) => {
                setProgressMsg(
                  status
                );
              },
              recoveryEnabled
                ? {
                    readPage:
                      readPdfToTextPage,

                    writePage:
                      writePdfToTextPage,
                  }
                : {}
            );
          }
        );

      if (
        !result.trim()
      ) {
        setErrorMsg(
          'No readable text was found in this PDF.'
        );

        return;
      }

      setExtractedText(
        result
      );

      /*
       * Finished output exists before the task is charged.
       */
      await clearPdfToTextRecovery();

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
        'Text extraction failed:',
        err
      );

      /*
       * Keep source + completed page checkpoints so reopening
       * continues from the first unfinished page.
       */
      setErrorMsg(
        err?.message ||
          'Processing was interrupted. Reopen PDF to Text to continue from the last completed page.'
      );
    } finally {
      processingInFlightRef.current =
        false;

      setIsProcessing(
        false
      );

      setProgressMsg(
        ''
      );
    }
  };


  /*
   * Resume automatically after Safari restores the large source.
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

            void handleProcess();
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


  const copyToClipboard = () => {
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadTextFile = () => {
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace(/\.[^/.]+$/, '') || 'document'}-text.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl text-left">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] || null;

          discardPdfToTextRecovery();

          onFileChange(selected);
          setExtractedText('');
          setErrorMsg(null);
          e.target.value = '';
        }}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === 'application/pdf') {
              discardPdfToTextRecovery();

              onFileChange(dropped);
              setExtractedText('');
              setErrorMsg(null);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-xl p-8 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-6"
        >
          <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-medium text-zinc-200">Click or drop a PDF to convert to text</p>
          <p className="text-xs text-zinc-500 mt-1">
            Auto-detects digital documents, legal agreements, and physical scans
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mb-6">
          <div className="flex items-center gap-3 truncate pr-2">
            <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="truncate">
              <p className="text-xs font-semibold text-zinc-200 truncate">{file.name}</p>
              <p className="text-[11px] text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => {
              if (
                isProcessing
              ) {
                return;
              }

              discardPdfToTextRecovery();

              processingInFlightRef.current =
                false;

              durableRestoreAttemptedRef.current =
                false;

              checkedRecoveryFileRef.current =
                null;

              onFileChange(null);
              setExtractedText('');
              setErrorMsg(null);
            }}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        </div>
      )}

      {desktopCapacityRecommendation && (
        <DesktopCapacityStatus
          recommendation={
            desktopCapacityRecommendation
          }
          className="mb-6"
        />
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300 mb-6"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {file && !extractedText && (
        <button
          type="button"
          onClick={() => {
            void handleProcess();
          }}
          disabled={isProcessing}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-emerald-500/20 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{progressMsg || 'Converting PDF to text...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Convert to Text</span>
            </>
          )}
        </button>
      )}

      {extractedText && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Converted Text</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex items-center gap-1 text-[#3f3f46] hover:bg-[#3f3f46] hover:text-white rounded-md px-1.5 py-1 transition-colors cursor-pointer"
              >
                {copied ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={downloadTextFile}
                className="flex items-center gap-1 text-[#3f3f46] hover:bg-[#3f3f46] hover:text-white rounded-md px-1.5 py-1 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .txt</span>
              </button>
            </div>
          </div>

          <textarea
            readOnly
            value={extractedText}
            className="w-full h-64 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-none resize-none scrollbar-thin"
          />
        </div>
      )}
    </div>
  );
}

export default PdfToText;