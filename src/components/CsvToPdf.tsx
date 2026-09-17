import React, { useEffect, useState, useRef } from 'react';
import {
  Download,
  Table,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { generateCsvPDF, type CsvToPdfOptions } from '../utils/pdfEngine';
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

export const CsvToPdf: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>('');
  const [workspaceHydrated, setWorkspaceHydrated] =
    useState(false);
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [theme, setTheme] = useState<'striped' | 'clean' | 'emerald'>('striped');
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeUrl } = useObjectUrl();

  /*
   * Restore CSV / pasted spreadsheet input after
   * Download/Preview -> Back.
   */
  useEffect(() => {
    let cancelled = false;

    const restoreWorkspace = async () => {
      try {
        const restored =
          await restoreToolWorkspaceFiles(
            'csv-to-pdf'
          );

        const restoredContentFiles =
          await restoreToolWorkspaceFiles(
            'csv-to-pdf-content'
          );

        const savedState =
          restoreToolWorkspaceState<{
            activeTab?: 'upload' | 'paste';
            pastedText?: string;
            documentTitle?: string;
            orientation?: 'auto' | 'portrait' | 'landscape';
            theme?: 'striped' | 'clean' | 'emerald';
            pageSize?: 'a4' | 'letter';
          }>('csv-to-pdf');

        if (cancelled) return;

        if (restored[0]) {
          setFile(restored[0]);

          try {
            const raw =
              await restored[0].text();

            const parsed =
              parseDelimitedData(raw);

            if (!cancelled) {
              setRowCount(
                parsed.length
              );
            }
          } catch {
            // File remains available even if row counting fails.
          }
        }

        if (savedState?.activeTab) {
          setActiveTab(
            savedState.activeTab
          );
        }

        let restoredPaste:
          | string
          | null =
            null;

        if (
          restoredContentFiles[0]
        ) {
          try {
            restoredPaste =
              await restoredContentFiles[0]
                .text();
          } catch (_) {
            restoredPaste = null;
          }
        }

        /*
         * One-time migration from the previous sessionStorage
         * representation.
         */
        if (
          restoredPaste === null &&
          typeof savedState?.pastedText ===
            'string'
        ) {
          restoredPaste =
            savedState.pastedText;
        }

        if (
          !cancelled &&
          restoredPaste !== null
        ) {
          setPastedText(
            restoredPaste
          );

          try {
            setRowCount(
              parseDelimitedData(
                restoredPaste
              ).length
            );
          } catch (_) {}
        }

        if (
          typeof savedState?.documentTitle ===
          'string'
        ) {
          setDocumentTitle(
            savedState.documentTitle
          );
        }

        if (savedState?.orientation) {
          setOrientation(
            savedState.orientation
          );
        }

        if (savedState?.theme) {
          setTheme(
            savedState.theme
          );
        }

        if (savedState?.pageSize) {
          setPageSize(
            savedState.pageSize
          );
        }
      } catch (error) {
        console.warn(
          'Unable to restore CSV to PDF workspace:',
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
   * Persist uploaded CSV separately from lightweight controls.
   */
  useEffect(() => {
    if (!workspaceHydrated) return;

    if (file) {
      void saveToolWorkspaceFiles(
        'csv-to-pdf',
        [file]
      );
    }
  }, [
    file,
    workspaceHydrated,
  ]);

  /*
   * Keep only lightweight controls in sessionStorage.
   */
  useEffect(() => {
    if (!workspaceHydrated) return;

    saveToolWorkspaceState(
      'csv-to-pdf',
      {
        activeTab,
        documentTitle,
        orientation,
        theme,
        pageSize,
      }
    );
  }, [
    activeTab,
    documentTitle,
    orientation,
    theme,
    pageSize,
    workspaceHydrated,
  ]);

  /*
   * Paste-mode spreadsheet data is browser-local OPFS data,
   * not sessionStorage JSON.
   */
  useEffect(() => {
    if (!workspaceHydrated) return;

    if (
      activeTab === 'upload' &&
      file
    ) {
      void clearToolWorkspace(
        'csv-to-pdf-content'
      );
      return;
    }

    if (!pastedText.trim()) {
      void clearToolWorkspace(
        'csv-to-pdf-content'
      );
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          void saveToolWorkspaceFiles(
            'csv-to-pdf-content',
            [
              new File(
                [pastedText],
                'pasted-data.txt',
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
    pastedText,
    workspaceHydrated,
  ]);

  const parseDelimitedData = (raw: string): string[][] => {
    const lines = raw.trim().split(/\r?\n/);
    if (!lines.length) return [];

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    return lines
      .map((line) => {
        if (delimiter === '\t') {
          return line.split('\t').map((c) => c.trim().replace(/^"|"$/g, ''));
        }
        const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
        const row: string[] = [];
        let match;
        while ((match = regex.exec(line)) !== null) {
          let val = match[1] || '';
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1).replace(/""/g, '"');
          }
          row.push(val.trim());
          if (regex.lastIndex === match.index) regex.lastIndex++;
        }
        return row.filter((_, idx) => idx < row.length - 1 || row[row.length - 1] !== '');
      })
      .filter((r) => r.length > 0 && r.some((c) => c !== ''));
  };

  const handleFileDrop = (selectedFile: File) => {
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
    setDocumentTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    revokeUrl();
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        const parsed = parseDelimitedData(content);
        setRowCount(parsed.length);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleConvert = async () => {
    const creditCheck = checkTaskCredit(file || undefined);
    if (!creditCheck.allowed) {
      setErrorMessage(
        creditCheck.errorMessage ||
          'This task is not available on your current plan.'
      );
      return;
    }

    if (file) {
      const currentSizeCheck = validateTaskFiles(
        [file],
        'Selected file'
      );

      if (!currentSizeCheck.allowed) {
        setErrorMessage(currentSizeCheck.errorMessage);
        return;
      }
    }

    setIsProcessing(true);
    setErrorMessage(null);
    revokeUrl();

    try {
      let rawText = pastedText;

      if (activeTab === 'upload') {
        if (!file) throw new Error('Please select a CSV or spreadsheet file.');
        rawText = await file.text();
      }

      const rows = parseDelimitedData(rawText);
      if (rows.length === 0) throw new Error('No valid tabular rows found in data.');

      const colCount = Math.max(...rows.map((r) => r.length));
      const effectiveOrientation =
        orientation === 'auto' ? (colCount > 5 ? 'landscape' : 'portrait') : orientation;

      const options: CsvToPdfOptions = {
        rows,
        title: documentTitle.trim(),
        orientation: effectiveOrientation,
        pageSize,
        theme,
      };

      const pdfBytes = await generateCsvPDF(options);
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
      commitTaskCredit();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process spreadsheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPastedText('');
    setRowCount(0);
    revokeUrl();
    setErrorMessage(null);

    void clearToolWorkspace(
      'csv-to-pdf'
    );

    void clearToolWorkspace(
      'csv-to-pdf-content'
    );
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl text-left space-y-6">
      {/* Mode Switcher */}
      <div className="flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-medium">
        <button
          onClick={() => {
            setActiveTab('upload');
            revokeUrl();
          }}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'upload'
              ? 'bg-zinc-800 text-emerald-400 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload File</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('paste');
            revokeUrl();
          }}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'paste'
              ? 'bg-zinc-800 text-emerald-400 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>Paste Spreadsheet Data</span>
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
            <FileSpreadsheet className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-zinc-200">Drop your .CSV or .TSV file here</p>
            <p className="text-xs text-zinc-500 mt-1">Direct client-side parsing • Zero data uploads</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
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
              <FileSpreadsheet className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {rowCount > 0 ? `${rowCount} rows detected • ` : ''}
                  {Math.round(file.size / 1024)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
            <span>Spreadsheet Cells</span>
            <span className="text-zinc-500 text-[11px]">Copy &amp; paste from Excel or Sheets</span>
          </label>
          <textarea
            value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value);
              revokeUrl();
            }}
            placeholder="Paste cells directly here (e.g. columns separated by commas or tabs)..."
            rows={6}
            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 font-mono resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
          />
        </div>
      )}

      {/* Configuration Controls */}
      <div className="space-y-3 pt-1">
        <div>
          <label className="text-xs font-medium text-zinc-400 block mb-1">Document Title (Optional)</label>
          <input
            type="text"
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            placeholder="e.g. Q3 Sales & Operations Report"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Orientation</label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="auto">Auto (Smart)</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Table Theme</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="striped">Striped Rows</option>
              <option value="clean">Clean Minimal</option>
              <option value="emerald">Emerald Modern</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Page Size</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
            </select>
          </div>
        </div>
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
          onClick={handleConvert}
          disabled={isProcessing || (activeTab === 'upload' ? !file : !pastedText.trim())}
          className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed text-xs"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Building vector table...</span>
            </>
          ) : (
            <>
              <Table className="w-4 h-4 stroke-[2.5]" />
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
            download={`${documentTitle.trim() || 'spreadsheet_report'}.pdf`}
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
export default CsvToPdf;