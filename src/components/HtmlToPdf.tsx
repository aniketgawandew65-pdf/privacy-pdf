import React, { useEffect, useState, useRef } from 'react';
import {
  Download,
  Upload,
  Receipt,
  FileCode2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';
import { generateHtmlPDF, type HtmlToPdfOptions } from '../utils/pdfEngine';
import { generateStyledVectorHtmlPDF } from '../utils/htmlVectorPdf';
import { useObjectUrl } from '../utils/useObjectUrl';
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
import {
  exclusivelyProcess,
  hasRecoverableProcessing,
  clearProcessingRecovery,
} from '../utils/localProcessing';

const SAMPLE_RECEIPT = `<div style="text-align: center; margin-bottom: 12px;">
  <h2 style="margin: 0; font-size: 16px;">COFFEE &amp; BAKERY</h2>
  <p style="margin: 2px 0; color: #52525b; font-size: 10px;">Order #48291 • Table 4</p>
  <p style="margin: 0; color: #52525b; font-size: 10px;">Date: Sept 8, 2026 10:45 AM</p>
</div>

<hr/>

<table>
  <thead>
    <tr>
      <th>Item</th>
      <th style="text-align: center;">Qty</th>
      <th style="text-align: right;">Total</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Oat Cappuccino</td>
      <td style="text-align: center;">2</td>
      <td style="text-align: right;">$9.00</td>
    </tr>
    <tr>
      <td>Almond Croissant</td>
      <td style="text-align: center;">1</td>
      <td style="text-align: right;">$4.50</td>
    </tr>
    <tr>
      <td>Matcha Latte</td>
      <td style="text-align: center;">1</td>
      <td style="text-align: right;">$5.25</td>
    </tr>
  </tbody>
</table>

<hr/>

<div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 6px;">
  <span>Total Due:</span>
  <span>$18.75</span>
</div>

<p style="text-align: center; margin-top: 16px; font-size: 10px; color: #71717a;">
  Thank you for visiting! • Zero Cloud Saved
</p>`;

const SAMPLE_LANDING_PAGE = `<div style="width: 100%; max-width: 760px; margin: 0 auto; padding: 40px 24px; background: #09090b; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center;">
  
  <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #a855f7; margin: 0 0 16px 0;">
    PURPL3 OS AI • 1INTO1
  </p>

  <h1 style="font-size: 36px; line-height: 1.15; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 16px 0; color: #ffffff;">
    The Age of Typing is Over.<br />
    <span style="color: #c084fc;">The Age of Intent is Here.</span>
  </h1>

  <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; max-width: 520px; margin: 0 auto 28px auto;">
    Voice-controlled autonomous OS agent for macOS. Scrapes the web, inspects PDFs, plays music, and controls your workspace completely hands-free.
  </p>

  <div style="display: flex; justify-content: center; gap: 12px; margin-bottom: 32px;">
    <span style="background: #a855f7; color: #ffffff; font-size: 12px; font-weight: 600; padding: 9px 20px; border-radius: 9999px;">
      Get PURPL3 for Mac
    </span>
    <span style="background: #18181b; color: #d4d4d8; font-size: 12px; font-weight: 500; padding: 9px 18px; border-radius: 9999px; border: 1px solid #27272a;">
      Watch Demo
    </span>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; text-align: left; margin-top: 20px;">
    <div style="background: #18181b; border: 1px solid #27272a; padding: 16px; border-radius: 12px;">
      <h3 style="margin: 0 0 6px 0; font-size: 13px; color: #f4f4f5;">✈️ Travel &amp; Flight Booking</h3>
      <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #71717a;">Compare travel costs, airline options, and hotel ranges with one voice command.</p>
    </div>
    <div style="background: #18181b; border: 1px solid #27272a; padding: 16px; border-radius: 12px;">
      <h3 style="margin: 0 0 6px 0; font-size: 13px; color: #f4f4f5;">📄 Deep Research &amp; Synthesis</h3>
      <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #71717a;">Synthesizes real-time web research into publication-grade Word documents with figures.</p>
    </div>
  </div>

</div>`;

export const HtmlToPdf: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [htmlContent, setHtmlContent] = useState<string>(SAMPLE_RECEIPT);
  const [file, setFile] = useState<File | null>(null);
  const [workspaceHydrated, setWorkspaceHydrated] =
    useState(false);
  const [fileName, setFileName] = useState<string>('receipt_document');
  const [pageSize, setPageSize] = useState<'receipt' | 'a4' | 'letter'>('receipt');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressLabel, setProgressLabel] =
    useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] =
    useState(false);

  /*
   * Prevent one restored mount from starting the same recovery
   * twice while React state/effects settle.
   */
  const autoRecoveryAttemptedRef =
    useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeUrl } = useObjectUrl();

  /*
   * Restore HTML / Receipt input after
   * Preview/Download -> Back.
   */
  useEffect(() => {
    let cancelled = false;

    const restoreWorkspace = async () => {
      try {
        const restored =
          await restoreToolWorkspaceFiles(
            'html-to-pdf'
          );

        const restoredContentFiles =
          await restoreToolWorkspaceFiles(
            'html-to-pdf-content'
          );

        const savedState =
          restoreToolWorkspaceState<{
            activeTab?: 'paste' | 'upload';
            htmlContent?: string;
            fileName?: string;
            pageSize?: 'receipt' | 'a4' | 'letter';
            orientation?: 'portrait' | 'landscape';
            recoveryPending?: boolean;
          }>('html-to-pdf');

        if (cancelled) return;

        if (restored[0]) {
          setFile(restored[0]);
        }

        if (savedState?.activeTab) {
          setActiveTab(
            savedState.activeTab
          );
        }

        let restoredHtml:
          | string
          | null =
            null;

        /*
         * Upload mode already restored the original File from
         * OPFS above.
         *
         * Do NOT also decode that potentially huge file into a
         * JavaScript string during workspace hydration.
         *
         * The file will be read only when Convert is pressed.
         */
        if (
          savedState?.activeTab !==
            'upload' &&
          restoredContentFiles[0]
        ) {
          try {
            restoredHtml =
              await restoredContentFiles[0]
                .text();
          } catch (_) {
            restoredHtml = null;
          }
        }

        /*
         * One-time migration from the old sessionStorage state.
         */
        if (
          restoredHtml === null &&
          savedState?.activeTab !==
            'upload' &&
          typeof savedState?.htmlContent ===
            'string'
        ) {
          restoredHtml =
            savedState.htmlContent;
        }

        if (
          !cancelled &&
          restoredHtml !== null
        ) {
          setHtmlContent(
            restoredHtml
          );
        }

        if (
          typeof savedState?.fileName ===
          'string'
        ) {
          setFileName(
            savedState.fileName
          );
        }

        if (savedState?.pageSize) {
          setPageSize(
            savedState.pageSize
          );
        }

        if (savedState?.orientation) {
          setOrientation(
            savedState.orientation
          );
        }

        setRecoveryPending(
          Boolean(
            savedState?.recoveryPending
          )
        );
      } catch (error) {
        console.warn(
          'Unable to restore HTML to PDF workspace:',
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
   * Save uploaded HTML file separately.
   */
  useEffect(() => {
    if (
      !workspaceHydrated ||
      !file
    ) {
      return;
    }

    void saveToolWorkspaceFiles(
      'html-to-pdf',
      [file]
    );
  }, [
    file,
    workspaceHydrated,
  ]);

  /*
   * Lightweight UI controls stay in sessionStorage.
   */
  useEffect(() => {
    if (!workspaceHydrated) return;

    saveToolWorkspaceState(
      'html-to-pdf',
      {
        activeTab,
        fileName,
        pageSize,
        orientation,
        recoveryPending,
      }
    );
  }, [
    activeTab,
    fileName,
    pageSize,
    orientation,
    recoveryPending,
    workspaceHydrated,
  ]);

  /*
   * Paste-mode HTML belongs in OPFS.
   *
   * Upload mode already has the original source file in OPFS,
   * so avoid duplicating that potentially very large document.
   */
  useEffect(() => {
    if (!workspaceHydrated) return;

    if (
      activeTab === 'upload' &&
      file
    ) {
      void clearToolWorkspace(
        'html-to-pdf-content'
      );
      return;
    }

    if (!htmlContent.trim()) {
      void clearToolWorkspace(
        'html-to-pdf-content'
      );
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          void saveToolWorkspaceFiles(
            'html-to-pdf-content',
            [
              new File(
                [htmlContent],
                'editor.html',
                {
                  type: 'text/html',
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
    htmlContent,
    workspaceHydrated,
  ]);

  const handleFileDrop = async (
    selectedFile: File
  ) => {
    /*
     * A deliberately selected replacement file is a new job.
     */
    clearProcessingRecovery();
    setRecoveryPending(false);
    autoRecoveryAttemptedRef.current =
      false;

    const sizeCheck =
      validateTaskFiles(
        [selectedFile],
        'Selected file'
      );

    if (!sizeCheck.allowed) {
      setErrorMessage(
        sizeCheck.errorMessage
      );
      return;
    }

    /*
     * Keep only the File reference here.
     *
     * OLD:
     * File + selectedFile.text() remained in memory together.
     *
     * NEW:
     * The HTML string is created only during Convert.
     */
    setFile(
      selectedFile
    );

    /*
     * Upload mode owns the File itself.
     * Release any previous pasted HTML string immediately.
     */
    setHtmlContent(
      ''
    );

    setFileName(
      selectedFile.name.replace(
        /\.[^/.]+$/,
        ''
      )
    );

    revokeUrl();
    setErrorMessage(
      null
    );

    if (
      pageSize ===
      'receipt'
    ) {
      setPageSize(
        'a4'
      );
    }
  };

  const handleConvert =
    async (
      isAutomaticRecovery =
        false
    ) => {
      if (
        activeTab ===
          'paste' &&
        !htmlContent.trim()
      ) {
        return;
      }

      if (
        activeTab ===
          'upload' &&
        !file
      ) {
        return;
      }

      if (file) {
        const currentSizeCheck =
          validateTaskFiles(
            [file],
            'Selected file'
          );

        if (
          !currentSizeCheck.allowed
        ) {
          setErrorMessage(
            currentSizeCheck.errorMessage
          );
          return;
        }
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

      setIsProcessing(
        true
      );

      setProgressLabel(
        isAutomaticRecovery
          ? 'Recovering interrupted conversion…'
          : 'Preparing HTML...'
      );

      setErrorMessage(
        null
      );

      revokeUrl();

      /*
       * Keep uploaded HTML text alive only for this conversion.
       */
      let sourceHtml =
        '';

      try {
        /*
         * ====================================================
         * DURABLE AUTO-RECOVERY
         * ====================================================
         *
         * Ensure the exact source exists in OPFS BEFORE the
         * heavy DOM/PDF work begins. If mobile Safari/Chrome
         * recreates the browser process, the source and current
         * format settings can be restored automatically.
         */
        const sourceSaved =
          activeTab === 'upload'
            ? (
                file
                  ? await saveToolWorkspaceFiles(
                      'html-to-pdf',
                      [file]
                    )
                  : false
              )
            : await saveToolWorkspaceFiles(
                'html-to-pdf-content',
                [
                  new File(
                    [htmlContent],
                    'editor.html',
                    {
                      type:
                        'text/html',
                      lastModified:
                        Date.now(),
                    }
                  ),
                ]
              );

        if (!sourceSaved) {
          throw new Error(
            'Local recovery storage is unavailable. Please keep this tab open and try again.'
          );
        }

        /*
         * Persist tool identity/settings before installing the
         * shared processing marker. This prevents another tool
         * from accidentally treating this recovery as its own.
         */
        setRecoveryPending(true);

        saveToolWorkspaceState(
          'html-to-pdf',
          {
            activeTab,
            fileName,
            pageSize,
            orientation,
            recoveryPending:
              true,
          }
        );

        const pdfBytes =
          await exclusivelyProcess(
            async () => {
              if (
                activeTab ===
                  'upload'
              ) {
                if (!file) {
                  throw new Error(
                    'Please select an HTML file.'
                  );
                }

                sourceHtml =
                  await file.text();
              } else {
                sourceHtml =
                  htmlContent;
              }

              if (
                !sourceHtml.trim()
              ) {
                throw new Error(
                  'No content provided to convert.'
                );
              }

              const options:
                HtmlToPdfOptions = {
                  html:
                    sourceHtml,
                  pageSize,
                  orientation,
                  onProgress: (
                    _current,
                    _total,
                    stage
                  ) => {
                    setProgressLabel(
                      stage
                    );
                  },
                };

              return pageSize ===
                'receipt'
                ? await generateHtmlPDF(
                    options
                  )
                : await generateStyledVectorHtmlPDF({
                    html:
                      sourceHtml,
                    pageSize,
                    orientation,
                    onProgress:
                      options.onProgress,
                  });
            }
          );

        /*
         * Release our direct reference before creating the
         * downloadable Blob.
         */
        sourceHtml =
          '';

        const blob =
          new Blob(
            [
              pdfBytes as
                unknown as
                BlobPart,
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
         * Output exists successfully: this is no longer an
         * interrupted/recoverable job.
         */
        clearProcessingRecovery();
        setRecoveryPending(false);

        saveToolWorkspaceState(
          'html-to-pdf',
          {
            activeTab,
            fileName,
            pageSize,
            orientation,
            recoveryPending:
              false,
          }
        );

        commitTaskCredit();
      } catch (
        err: any
      ) {
        setErrorMessage(
          err?.message ||
            'Failed to render HTML to PDF.'
        );
      } finally {
        sourceHtml =
          '';

        setIsProcessing(
          false
        );

        setProgressLabel(
          ''
        );
      }
    };

  /*
   * ==========================================================
   * ZERO-CLICK AUTO RESUME
   * ==========================================================
   *
   * After an iOS/Android browser/WebContent recreation:
   * 1. OPFS restores the original HTML source.
   * 2. session state restores format/orientation.
   * 3. the shared recovery marker prevents App.tsx from wiping
   *    that workspace.
   * 4. conversion starts automatically — no Resume button.
   *
   * HTML rendering is intentionally kept atomic to protect the
   * newly stabilized vector renderer. Therefore recovery
   * restarts the interrupted render from its durable source
   * rather than pretending a half-built in-memory jsPDF object
   * survived the browser process.
   */
  useEffect(() => {
    if (
      !workspaceHydrated ||
      !recoveryPending ||
      !hasRecoverableProcessing() ||
      isProcessing ||
      autoRecoveryAttemptedRef
        .current
    ) {
      return;
    }

    const sourceReady =
      activeTab === 'upload'
        ? Boolean(file)
        : Boolean(
            htmlContent.trim()
          );

    if (!sourceReady) {
      /*
       * The browser removed its private storage or recovery
       * source is otherwise unavailable. Do not leave a stale
       * global processing marker keeping the app in recovery
       * mode forever.
       */
      clearProcessingRecovery();
      setRecoveryPending(false);

      setErrorMessage(
        'The interrupted conversion could not be restored because its local source is no longer available.'
      );

      return;
    }

    autoRecoveryAttemptedRef.current =
      true;

    const timer =
      window.setTimeout(
        () => {
          void handleConvert(
            true
          );
        },
        250
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    workspaceHydrated,
    recoveryPending,
    isProcessing,
    activeTab,
    file,
    htmlContent,
    pageSize,
    orientation,
  ]);

  const handleClear = () => {
    clearProcessingRecovery();
    setRecoveryPending(false);
    autoRecoveryAttemptedRef.current =
      false;

    setFile(null);
    setHtmlContent('');
    setFileName('document');
    revokeUrl();
    setErrorMessage(null);

    void clearToolWorkspace(
      'html-to-pdf'
    );

    void clearToolWorkspace(
      'html-to-pdf-content'
    );
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl text-left space-y-6">
      {/* Mode Switcher */}
      <div className="flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-medium">
        <button
          onClick={() => {
            setActiveTab('paste');
            revokeUrl();
          }}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'paste'
              ? '!bg-emerald-700 !text-white font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>HTML / Receipt Code</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('upload');
            revokeUrl();
          }}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'upload'
              ? '!bg-emerald-700 !text-white font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload .html File</span>
        </button>
      </div>

      {/* Input Section */}
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
            <FileCode2 className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-zinc-200">Drop an .html file here</p>
            <p className="text-xs text-zinc-500 mt-1">Direct sandbox rendering • Zero server uploads</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,text/html"
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
              <FileCode2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
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
            <label className="font-medium text-zinc-300">HTML / Receipt Markup</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setHtmlContent(SAMPLE_RECEIPT);
                  setPageSize('receipt');
                  setFileName('receipt_sample');
                  revokeUrl();
                }}
                className="text-emerald-400 hover:underline text-[11px]"
              >
                Sample Receipt
              </button>
              <span>•</span>
              <button
                onClick={() => {
                  setHtmlContent(SAMPLE_LANDING_PAGE);
                  setPageSize('a4');
                  setFileName('purpl3_landing');
                  revokeUrl();
                }}
                className="text-purple-400 hover:underline text-[11px] flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>Sample Hero Page</span>
              </button>
            </div>
          </div>
          <textarea
            value={htmlContent}
            onChange={(e) => {
              setHtmlContent(e.target.value);
              revokeUrl();
            }}
            rows={8}
            placeholder="<div>Your HTML or Receipt Code here...</div>"
            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-200 font-mono resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
          />
        </div>
      )}

      {/* Format Controls */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="space-y-1">
          <label className="text-[11px] text-zinc-400">Page Format</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(e.target.value as any);
              revokeUrl();
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="receipt">80mm Thermal Receipt</option>
            <option value="a4">A4 (Invoice / Document)</option>
            <option value="letter">US Letter</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-zinc-400">Orientation</label>
          <select
            value={orientation}
            disabled={pageSize === 'receipt'}
            onChange={(e) => {
              setOrientation(e.target.value as any);
              revokeUrl();
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-40"
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
      </div>

      {/* Error Feedback */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      {!downloadUrl ? (
        <button
          onClick={handleConvert}
          disabled={
            isProcessing ||
            (
              activeTab === 'upload'
                ? !file
                : !htmlContent.trim()
            )
          }
          className={`w-full py-3 px-4 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer disabled:cursor-not-allowed text-xs ${
            isProcessing
              ? '!bg-emerald-700 !text-white opacity-100 shadow-emerald-700/20'
              : '!bg-emerald-600 hover:!bg-emerald-500 !text-white disabled:!bg-zinc-300 disabled:!text-zinc-600 disabled:opacity-100 shadow-emerald-600/20'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {progressLabel ||
                  'Rendering HTML into PDF...'}
              </span>
            </>
          ) : (
            <>
              <Receipt className="w-4 h-4 stroke-[2.5]" />
              <span>Convert to PDF</span>
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
            <CheckCircle2 className="w-4 h-4" /> PDF Generated Successfully
          </div>
          <a
            href={downloadUrl}
            download={`${fileName || 'document'}.pdf`}
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

export default HtmlToPdf;