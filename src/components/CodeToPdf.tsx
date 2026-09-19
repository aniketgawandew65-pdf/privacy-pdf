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
import React, { useEffect, useState, useRef } from 'react';
import {
  Download,
  Code2,
  Upload,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { generateCodeVectorPDF, type CodeVectorPdfOptions } from '../utils/codeVectorPdf';
import { useObjectUrl } from '../utils/useObjectUrl';
import { getLicenseStatus } from '../utils/license';
import {
  useDesktopCapacityRecommendation,
} from '../hooks/useDesktopCapacityRecommendation';
import { DesktopCapacityStatus } from './DesktopCapacityStatus';
import {
  exclusivelyProcess,
  hasRecoverableProcessing,
  clearProcessingRecovery,
} from '../utils/localProcessing';

const SAMPLE_CODE = `// 1into1 Serverless PDF Engine
import { PDFDocument } from 'pdf-lib';

export async function sanitizeDocument(fileBuffer) {
  const doc = await PDFDocument.load(fileBuffer);
  
  // Wipe all sensitive OS & device identifiers
  doc.setTitle('');
  doc.setAuthor('');
  doc.setProducer('1into1 Privacy Suite');
  
  return await doc.save();
}`;

export const CodeToPdf: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [file, setFile] = useState<File | null>(null);
  const [codeContent, setCodeContent] = useState<string>(SAMPLE_CODE);
  const [workspaceHydrated, setWorkspaceHydrated] =
    useState(false);
  const [title, setTitle] = useState<string>('engine.js');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(8.5);
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);

  const autoRecoveryAttemptedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeUrl } = useObjectUrl();

  const codeCapacityBytes =
    activeTab === 'upload'
      ? file?.size ?? 0
      : codeContent.length;

  const {
    recommendation:
      desktopCapacityRecommendation,
  } =
    useDesktopCapacityRecommendation({
      toolId:
        'code-to-pdf',

      selectedBytes:
        codeCapacityBytes,

      enabled:
        codeCapacityBytes > 0 &&
        getLicenseStatus().isPro,
    });

  /*
   * Restore Code to PDF input after Preview/Download -> Back.
   */
  useEffect(() => {
    let cancelled = false;

    const restoreWorkspace = async () => {
      try {
        const restored =
          await restoreToolWorkspaceFiles(
            'code-to-pdf'
          );

        const restoredContentFiles =
          await restoreToolWorkspaceFiles(
            'code-to-pdf-content'
          );

        const savedState =
          restoreToolWorkspaceState<{
            activeTab?: 'paste' | 'upload';
            codeContent?: string;
            title?: string;
            theme?: 'dark' | 'light';
            showLineNumbers?: boolean;
            fontSize?: number;
            pageSize?: 'a4' | 'letter';
            orientation?: 'portrait' | 'landscape';
            recoveryPending?: boolean;
          }>('code-to-pdf');

        if (cancelled) return;

        if (restored[0]) {
          setFile(restored[0]);
        }

        if (savedState?.activeTab) {
          setActiveTab(savedState.activeTab);
        }

        let restoredCode:
          | string
          | null =
            null;

        if (
          savedState?.activeTab ===
            'upload' &&
          restored[0]
        ) {
          try {
            restoredCode =
              await restored[0].text();
          } catch (_) {
            restoredCode = null;
          }
        } else if (
          restoredContentFiles[0]
        ) {
          try {
            restoredCode =
              await restoredContentFiles[0]
                .text();
          } catch (_) {
            restoredCode = null;
          }
        }

        /*
         * One-time migration from old sessionStorage content.
         */
        if (
          restoredCode === null &&
          typeof savedState?.codeContent ===
            'string'
        ) {
          restoredCode =
            savedState.codeContent;
        }

        if (
          !cancelled &&
          restoredCode !== null
        ) {
          setCodeContent(
            restoredCode
          );
        }

        if (
          typeof savedState?.title ===
          'string'
        ) {
          setTitle(savedState.title);
        }

        if (savedState?.theme) {
          setTheme(savedState.theme);
        }

        if (
          typeof savedState?.showLineNumbers ===
          'boolean'
        ) {
          setShowLineNumbers(
            savedState.showLineNumbers
          );
        }

        if (
          typeof savedState?.fontSize ===
          'number'
        ) {
          setFontSize(savedState.fontSize);
        }

        if (savedState?.pageSize) {
          setPageSize(savedState.pageSize);
        }

        if (savedState?.orientation) {
          setOrientation(
            savedState.orientation
          );
        }

        setRecoveryPending(
          Boolean(savedState?.recoveryPending)
        );
      } catch (error) {
        console.warn(
          'Unable to restore Code to PDF workspace:',
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

  /*
   * Save uploaded source file separately.
   */
  useEffect(() => {
    if (
      !workspaceHydrated ||
      !file
    ) {
      return;
    }

    void saveToolWorkspaceFiles(
      'code-to-pdf',
      [file]
    );
  }, [
    file,
    workspaceHydrated,
  ]);

  /*
   * Keep only lightweight editor controls in sessionStorage.
   */
  useEffect(() => {
    if (!workspaceHydrated) return;

    saveToolWorkspaceState(
      'code-to-pdf',
      {
        activeTab,
        title,
        theme,
        showLineNumbers,
        fontSize,
        pageSize,
        orientation,
        recoveryPending,
      }
    );
  }, [
    activeTab,
    title,
    theme,
    showLineNumbers,
    fontSize,
    pageSize,
    orientation,
    recoveryPending,
    workspaceHydrated,
  ]);

  /*
   * Paste-mode code stays in browser-local OPFS.
   * Upload mode already has its source file persisted.
   */
  useEffect(() => {
    if (!workspaceHydrated) return;

    if (
      activeTab === 'upload' &&
      file
    ) {
      void clearToolWorkspace(
        'code-to-pdf-content'
      );
      return;
    }

    if (!codeContent.trim()) {
      void clearToolWorkspace(
        'code-to-pdf-content'
      );
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          void saveToolWorkspaceFiles(
            'code-to-pdf-content',
            [
              new File(
                [codeContent],
                'editor-code.txt',
                {
                  type:
                    'text/plain;charset=utf-8',
                  lastModified:
                    Date.now(),
                }
              ),
            ]
          );
        },
        400
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    activeTab,
    file,
    codeContent,
    workspaceHydrated,
  ]);

  const handleFileDrop = async (selectedFile: File) => {
    clearProcessingRecovery();
    setRecoveryPending(false);
    autoRecoveryAttemptedRef.current = false;

    // Source file size limit
    const sizeCheck = validateTaskFiles(
      [selectedFile],
      'Selected file'
    );

    if (!sizeCheck.allowed) {
      setErrorMessage(sizeCheck.errorMessage);
      return;
    }

    setFile(selectedFile);
    setTitle(selectedFile.name);
    revokeUrl();
    setErrorMessage(null);

    try {
      const text = await selectedFile.text();
      setCodeContent(text);
    } catch {
      setErrorMessage('Could not read code file.');
    }
  };

  const handleConvert = async (
    isAutomaticRecovery = false
  ) => {
    if (
      activeTab === 'paste' &&
      !codeContent.trim()
    ) {
      return;
    }

    if (
      activeTab === 'upload' &&
      !file
    ) {
      return;
    }

    const creditCheck =
      checkTaskCredit(
        file || undefined
      );

    if (!creditCheck.allowed) {
      setErrorMessage(
        creditCheck.errorMessage ||
          'This task is not available on your current plan.'
      );
      return;
    }

    if (file) {
      const sizeCheck =
        validateTaskFiles(
          [file],
          'Selected file'
        );

      if (!sizeCheck.allowed) {
        setErrorMessage(
          sizeCheck.errorMessage
        );
        return;
      }
    }

    setIsProcessing(true);
    setErrorMessage(null);
    revokeUrl();

    let sourceCode = '';

    try {
      /*
       * Save the exact source locally before PDF generation.
       * This is what makes browser-process recovery possible.
       */
      const sourceSaved =
        activeTab === 'upload'
          ? (
              file
                ? await saveToolWorkspaceFiles(
                    'code-to-pdf',
                    [file]
                  )
                : false
            )
          : await saveToolWorkspaceFiles(
              'code-to-pdf-content',
              [
                new File(
                  [codeContent],
                  'editor-code.txt',
                  {
                    type: 'text/plain;charset=utf-8',
                    lastModified: Date.now(),
                  }
                ),
              ]
            );

      if (!sourceSaved) {
        throw new Error(
          'Local recovery storage is unavailable. Please keep this tab open and try again.'
        );
      }

      setRecoveryPending(true);

      saveToolWorkspaceState(
        'code-to-pdf',
        {
          activeTab,
          title,
          theme,
          showLineNumbers,
          fontSize,
          pageSize,
          orientation,
          recoveryPending: true,
        }
      );

      const pdfBytes =
        await exclusivelyProcess(
          async () => {
            if (
              activeTab === 'upload'
            ) {
              if (!file) {
                throw new Error(
                  'Please select a source file.'
                );
              }

              sourceCode =
                await file.text();
            } else {
              sourceCode =
                codeContent;
            }

            if (!sourceCode.trim()) {
              throw new Error(
                'No source code detected to convert.'
              );
            }

            const options:
              CodeVectorPdfOptions = {
                code: sourceCode,
                title: title.trim(),
                theme,
                showLineNumbers,
                fontSize,
                pageSize,
                orientation,
              };

            return await generateCodeVectorPDF(
              options
            );
          }
        );

      sourceCode = '';

      const blob =
        new Blob(
          [pdfBytes as unknown as BlobPart],
          {
            type: 'application/pdf',
          }
        );

      createUrl(blob);

      clearProcessingRecovery();
      setRecoveryPending(false);

      saveToolWorkspaceState(
        'code-to-pdf',
        {
          activeTab,
          title,
          theme,
          showLineNumbers,
          fontSize,
          pageSize,
          orientation,
          recoveryPending: false,
        }
      );

      commitTaskCredit();
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          (
            isAutomaticRecovery
              ? 'Automatic recovery could not complete the Code PDF.'
              : 'Failed to generate code PDF.'
          )
      );
    } finally {
      sourceCode = '';
      setIsProcessing(false);
    }
  };

  /*
   * ZERO-CLICK AUTO RECOVERY
   *
   * Restores the local source and automatically re-runs the
   * interrupted conversion after Safari/Chrome WebContent
   * recreation. No Resume button.
   */
  useEffect(() => {
    if (
      !workspaceHydrated ||
      !recoveryPending ||
      !hasRecoverableProcessing() ||
      isProcessing ||
      autoRecoveryAttemptedRef.current
    ) {
      return;
    }

    const sourceReady =
      activeTab === 'upload'
        ? Boolean(file)
        : Boolean(codeContent.trim());

    if (!sourceReady) {
      clearProcessingRecovery();
      setRecoveryPending(false);

      setErrorMessage(
        'The interrupted conversion could not be restored because its local source is no longer available.'
      );

      return;
    }

    autoRecoveryAttemptedRef.current = true;

    const timer =
      window.setTimeout(
        () => {
          void handleConvert(true);
        },
        250
      );

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    workspaceHydrated,
    recoveryPending,
    isProcessing,
    activeTab,
    file,
    codeContent,
    title,
    theme,
    showLineNumbers,
    fontSize,
    pageSize,
    orientation,
  ]);

  const handleClear = () => {
    clearProcessingRecovery();
    setRecoveryPending(false);
    autoRecoveryAttemptedRef.current = false;

    setFile(null);
    setCodeContent('');
    setTitle('');
    revokeUrl();
    setErrorMessage(null);

    void clearToolWorkspace(
      'code-to-pdf'
    );

    void clearToolWorkspace(
      'code-to-pdf-content'
    );
  };

  const lineCount = codeContent.split('\n').length;

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl text-left space-y-6">
      {/* Mode Switcher */}
      <div className="code-pdf-mode-switch">
        <button
          type="button"
          onClick={() => {
            setActiveTab('paste');
            revokeUrl();
          }}
          className={`code-pdf-mode-tab ${
            activeTab === 'paste'
              ? 'code-pdf-mode-active'
              : 'code-pdf-mode-inactive'
          }`}
        >
          <Code2 className="code-pdf-mode-icon" />
          <span>Paste Code</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('upload');
            revokeUrl();
          }}
          className={`code-pdf-mode-tab ${
            activeTab === 'upload'
              ? 'code-pdf-mode-active'
              : 'code-pdf-mode-inactive'
          }`}
        >
          <Upload className="code-pdf-mode-icon" />
          <span>Upload File</span>
        </button>
      </div>

      {/* Input Area */}
      {activeTab === 'upload' ? (
        !file ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFileDrop(dropped);
            }}
            className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
          >
            <FileCode className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-zinc-200">Drop code file (.js, .ts, .py, .json, etc.)</p>
            <p className="text-xs text-zinc-500 mt-1">Syntax highlighted • Client-side vector export</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) handleFileDrop(selected);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileCode className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{lineCount} lines • {Math.round(file.size / 1024)} KB</p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <label className="font-medium text-zinc-300">Source Snippet</label>
            <span className="text-[11px] text-zinc-500">{lineCount} lines</span>
          </div>
          <textarea
            value={codeContent}
            onChange={(e) => {
              setCodeContent(e.target.value);
              revokeUrl();
            }}
            placeholder="Paste your source code here..."
            rows={8}
            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-200 font-mono resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
          />
        </div>
      )}

      {desktopCapacityRecommendation && (
        <DesktopCapacityStatus
          recommendation={
            desktopCapacityRecommendation
          }
        />
      )}

      {/* Configuration Controls */}
      <div className="space-y-3 pt-1">
        <div>
          <label className="text-xs font-medium text-zinc-400 block mb-1">Header Title (Optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              revokeUrl();
            }}
            placeholder="e.g. main.py or query.sql"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Theme</label>
            <select
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value as any);
                revokeUrl();
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="dark">Dark (Terminal)</option>
              <option value="light">Light (Print)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Orientation</label>
            <select
              value={orientation}
              onChange={(e) => {
                setOrientation(e.target.value as any);
                revokeUrl();
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Size</label>
            <select
              value={fontSize}
              onChange={(e) => {
                setFontSize(Number(e.target.value));
                revokeUrl();
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="7.5">7.5pt (Compact)</option>
              <option value="8.5">8.5pt (Standard)</option>
              <option value="10">10pt (Large)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Page Format</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value as any);
                revokeUrl();
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
            </select>
          </div>
        </div>

        {/* Line Numbers Toggle */}
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={showLineNumbers}
            onChange={(e) => {
              setShowLineNumbers(e.target.checked);
              revokeUrl();
            }}
            className="rounded border-zinc-800 accent-emerald-500 w-3.5 h-3.5"
          />
          <span>Include line numbers column</span>
        </label>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action / Download Buttons */}
      {!downloadUrl ? (
        <button
          onClick={() => {
            void handleConvert(false);
          }}
          disabled={isProcessing || !codeContent.trim()}
          className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed text-xs"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Formatting syntax &amp; layout...</span>
            </>
          ) : (
            <>
              <Code2 className="w-4 h-4 stroke-[2.5]" />
              <span>Convert Code to PDF</span>
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Code PDF Exported Successfully
          </div>
          <a
            href={downloadUrl}
            download={`${title.trim().replace(/\.[^/.]+$/, '') || 'code'}.pdf`}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-xs"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>Download PDF</span>
          </a>
        </div>
      )}
    </div>
  );
};
