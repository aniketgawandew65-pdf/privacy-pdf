import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Download, Loader2, CheckCircle2, X, Trash2 } from 'lucide-react';
import { removePagesFromPDF, getPDFPageCount } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';

interface RemovePagesProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

/*
 * Preserve the typed page range while the user previews the
 * generated PDF and returns to the tool.
 *
 * sessionStorage is used because iPhone Safari can recreate the
 * web process while its PDF preview is open.
 *
 * - Preview -> Back: preserved
 * - repeated Preview -> Back: preserved
 * - Safari process recreation: preserved
 * - Remove File: cleared
 * - hard refresh: cleared
 *
 * Only the small page-range string is stored. PDF bytes are not.
 */
const REMOVE_PAGES_DRAFT_PREFIX =
  'oneinto1-remove-pages-draft::';


const getRemovePagesDraftKey =
  (file: File) =>
    `${file.name}::${file.size}::${file.lastModified || 0}`;


const getRemovePagesStorageKey =
  (draftKey: string) =>
    REMOVE_PAGES_DRAFT_PREFIX +
    draftKey;


const readRemovePagesDraft =
  (
    draftKey: string
  ): string | null => {
    try {
      return sessionStorage.getItem(
        getRemovePagesStorageKey(
          draftKey
        )
      );
    } catch {
      return null;
    }
  };


const writeRemovePagesDraft =
  (
    draftKey: string,
    value: string
  ) => {
    try {
      sessionStorage.setItem(
        getRemovePagesStorageKey(
          draftKey
        ),
        value
      );
    } catch (_) {}
  };


const deleteRemovePagesDraft =
  (
    draftKey: string
  ) => {
    try {
      sessionStorage.removeItem(
        getRemovePagesStorageKey(
          draftKey
        )
      );
    } catch (_) {}
  };


/*
 * A genuine Reload starts a fresh Remove Pages session.
 * Back/forward restoration is intentionally preserved.
 */
try {
  const navigation =
    performance.getEntriesByType(
      'navigation'
    )[0] as
      PerformanceNavigationTiming |
      undefined;

  const isHardReload =
    navigation?.type ===
      'reload' ||
    (
      !navigation &&
      (
        performance as any
      ).navigation?.type ===
        1
    );

  if (
    isHardReload &&
    typeof sessionStorage !==
      'undefined'
  ) {
    for (
      let index =
        sessionStorage.length - 1;
      index >= 0;
      index--
    ) {
      const key =
        sessionStorage.key(
          index
        );

      if (
        key?.startsWith(
          REMOVE_PAGES_DRAFT_PREFIX
        )
      ) {
        sessionStorage.removeItem(
          key
        );
      }
    }
  }
} catch (_) {}


export const RemovePages: React.FC<RemovePagesProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pagesInput, setPagesInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * Prevent default/empty state from overwriting a restored draft
   * before the current PDF has finished loading.
   */
  const draftReadyKeyRef =
    useRef<string | null>(null);

  // Managed Object URL lifecycle to prevent memory leaks on mobile
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  useEffect(() => {
    revokeDownloadUrl();

    if (file) {
      const draftKey =
        getRemovePagesDraftKey(
          file
        );

      draftReadyKeyRef.current =
        null;

      getPDFPageCount(file)
        .then((count) => {
          setTotalPages(
            count
          );

          setPagesInput(
            readRemovePagesDraft(
              draftKey
            ) || ''
          );

          setError(
            null
          );

          draftReadyKeyRef.current =
            draftKey;
        })
        .catch(() => {
          setError(
            'Failed to read PDF pages.'
          );
        });
    } else {
      draftReadyKeyRef.current =
        null;

      setTotalPages(0);
      setPagesInput('');
      setError(null);
    }
  }, [file, revokeDownloadUrl]);


  /*
   * Persist only after this file has finished restoring.
   */
  useEffect(() => {
    if (!file) {
      return;
    }

    const draftKey =
      getRemovePagesDraftKey(
        file
      );

    if (
      draftReadyKeyRef.current !==
      draftKey
    ) {
      return;
    }

    writeRemovePagesDraft(
      draftKey,
      pagesInput
    );
  }, [
    file,
    pagesInput,
  ]);

  const parsePageNumbers = (
    input: string,
    max: number
  ): {
    pages: number[];
    error: string | null;
  } => {
    const pages =
      new Set<number>();

    const value =
      input.trim();

    if (!value) {
      return {
        pages: [],
        error:
          'Enter at least one page or page range.',
      };
    }


    const parts =
      value
        .split(',')
        .map(
          (part) =>
            part.trim()
        );


    for (const part of parts) {
      if (!part) {
        return {
          pages: [],
          error:
            'Empty page range detected. Remove extra commas.',
        };
      }


      /*
       * Single page must be a whole integer.
       *
       * 86       valid
       * 86.5     invalid
       * abc      invalid
       */
      if (
        /^\d+$/.test(
          part
        )
      ) {
        const page =
          Number(
            part
          );

        if (
          page < 1 ||
          page > max
        ) {
          return {
            pages: [],
            error:
              `Page "${part}" is outside this PDF. ` +
              `Choose a page between 1 and ${max}.`,
          };
        }

        pages.add(
          page
        );

        continue;
      }


      /*
       * Range must be exactly INTEGER-INTEGER.
       *
       * Valid:
       *   7-8
       *   10-5  -> interpreted as pages 5 through 10
       *
       * Invalid:
       *   1-10.9.5
       *   7568.7-8
       */
      const match =
        part.match(
          /^(\d+)\s*-\s*(\d+)$/
        );


      if (!match) {
        return {
          pages: [],
          error:
            `Invalid page range "${part}". ` +
            `Use whole page numbers only, for example 2, 4-6, 10.`,
        };
      }


      const startPage =
        Number(
          match[1]
        );

      const endPage =
        Number(
          match[2]
        );


      if (
        startPage < 1 ||
        startPage > max
      ) {
        return {
          pages: [],
          error:
            `Page "${startPage}" in range "${part}" is outside this PDF. ` +
            `Choose pages between 1 and ${max}.`,
        };
      }


      if (
        endPage < 1 ||
        endPage > max
      ) {
        return {
          pages: [],
          error:
            `Page "${endPage}" in range "${part}" is outside this PDF. ` +
            `Choose pages between 1 and ${max}.`,
        };
      }


      const from =
        Math.min(
          startPage,
          endPage
        );

      const to =
        Math.max(
          startPage,
          endPage
        );


      for (
        let page = from;
        page <= to;
        page++
      ) {
        pages.add(
          page
        );
      }
    }


    return {
      pages:
        Array.from(
          pages
        ).sort(
          (a, b) =>
            a - b
        ),

      error: null,
    };
  };

  const handleRemove = async () => {
    if (!file || totalPages === 0) return;
    setError(null);

    const parsedPages =
      parsePageNumbers(
        pagesInput,
        totalPages
      );

    if (
      parsedPages.error
    ) {
      setError(
        parsedPages.error
      );

      return;
    }

    const pagesToRemove =
      parsedPages.pages;

    if (
      pagesToRemove.length ===
      0
    ) {
      setError(
        'Please specify valid page number(s) to remove.'
      );

      return;
    }

    if (
      pagesToRemove.length >=
      totalPages
    ) {
      setError(
        'Cannot remove all pages from the PDF.'
      );

      return;
    }

    const creditCheck = checkTaskCredit(file);

    if (!creditCheck.allowed) {
      setError(
        creditCheck.errorMessage ||
          'This task is not available on your current plan.'
      );
      return;
    }

    setIsProcessing(true);
    revokeDownloadUrl();

    try {
      const outputBytes = await removePagesFromPDF(file, pagesToRemove);
      const blob = new Blob([outputBytes as BlobPart], { type: 'application/pdf' });
      createUrl(blob);

      commitTaskCredit();
    } catch (err) {
      console.error(err);
      setError('Failed to process PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    if (file) {
      deleteRemovePagesDraft(
        getRemovePagesDraftKey(
          file
        )
      );
    }

    draftReadyKeyRef.current =
      null;

    onFileChange(null);
    revokeDownloadUrl();
    setPagesInput('');
    setError(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload PDF to remove pages"
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
            const dropped = e.dataTransfer.files[0];
            if (dropped) {
              if (dropped.type === 'application/pdf' || dropped.name.toLowerCase().endsWith('.pdf')) {
                onFileChange(dropped);
                setError(null);
              } else {
                setError('Please upload a valid PDF file.');
              }
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to remove pages</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) {
                if (selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf')) {
                  onFileChange(selected);
                  setError(null);
                } else {
                  setError('Please select a valid PDF file.');
                }
              }
              e.target.value = ''; // Clears input buffer to allow selecting the same file consecutively
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
                  {Math.round(file.size / 1024)} KB • {totalPages} {totalPages === 1 ? 'page' : 'pages'}
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

          {/* Page input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">
              Pages to remove (e.g. 2, 4-6)
            </label>
            <input
              type="text"
              value={pagesInput}
              onChange={(e) => {
                setPagesInput(
                  e.target.value
                );

                /*
                 * The old generated PDF no longer represents
                 * the currently typed page-removal settings.
                 */
                revokeDownloadUrl();
                setError(null);
              }}
              placeholder="e.g. 1, 3, 5-7"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleRemove}
              disabled={isProcessing || !pagesInput.trim()}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Removing pages...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Remove Pages & Download</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Pages successfully removed!</span>
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace(/\.pdf$/i, '')}_modified.pdf`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Clean PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};