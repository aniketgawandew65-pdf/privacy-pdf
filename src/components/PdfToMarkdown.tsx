import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileCode,
  FileText,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';

import {
  extractMarkdownFromPDF,
  type ExtractedMarkdownResult,
} from '../utils/pdfEngine';

import {
  clearProcessingRecovery,
  digestText,
  exclusivelyProcess,
  hasRecoverableProcessing,
  localContentId,
} from '../utils/localProcessing';

import {
  clearMarkdownPages,
  readMarkdownPage,
  writeMarkdownPage,
} from '../utils/markdownPageStore';

import {
  saveWorkspaceFiles,
} from '../utils/localWorkspace';

import {
  useObjectUrl,
} from '../utils/useObjectUrl';

import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';


interface PdfToMarkdownProps {
  file:
    File |
    null;

  onFileChange:
    (
      file:
        File |
        null
    ) => void;
}


export const PdfToMarkdown:
  React.FC<
    PdfToMarkdownProps
  > =
  ({
    file,
    onFileChange,
  }) => {
    const [
      detectHeadings,
      setDetectHeadings,
    ] =
      useState(
        true
      );

    const [
      detectLists,
      setDetectLists,
    ] =
      useState(
        true
      );

    const [
      joinHyphenatedWords,
      setJoinHyphenatedWords,
    ] =
      useState(
        true
      );

    const [
      mdResult,
      setMdResult,
    ] =
      useState<
        ExtractedMarkdownResult |
        null
      >(
        null
      );

    const [
      isExtracting,
      setIsExtracting,
    ] =
      useState(
        false
      );

    const [
      progressStatus,
      setProgressStatus,
    ] =
      useState(
        ''
      );

    const [
      isCopied,
      setIsCopied,
    ] =
      useState(
        false
      );

    const [
      errorMessage,
      setErrorMessage,
    ] =
      useState<
        string |
        null
      >(
        null
      );

    const fileInputRef =
      useRef<
        HTMLInputElement
      >(
        null
      );

    /*
     * Synchronous same-page protection.
     */
    const extractionInFlightRef =
      useRef(
        false
      );

    /*
     * Prevent React from silently launching the exact same job
     * more than once inside one browser process.
     *
     * Browser-restart recovery is handled separately by the
     * persistent IndexedDB page cache.
     */
    const lastAutoStartedJobRef =
      useRef<
        string |
        null
      >(
        null
      );


    const fileIdentity =
      file
        ? [
            file.name,
            file.size,
            file.lastModified,
          ].join(
            '|'
          )
        : '';


    const extractionJobKey =
      file
        ? [
            fileIdentity,

            detectHeadings
              ? 'headings:1'
              : 'headings:0',

            detectLists
              ? 'lists:1'
              : 'lists:0',

            joinHyphenatedWords
              ? 'hyphen:1'
              : 'hyphen:0',
          ].join(
            '|'
          )
        : '';


    const {
      url:
        downloadUrl,

      createUrl,

      revoke:
        revokeDownloadUrl,
    } =
      useObjectUrl();


    const handleExtraction =
      async () => {
        if (
          !file ||
          extractionInFlightRef.current
        ) {
          return;
        }

        if (
          lastAutoStartedJobRef.current ===
          extractionJobKey
        ) {
          return;
        }

        const creditCheck =
          checkTaskCredit(file);

        if (!creditCheck.allowed) {
          setErrorMessage(
            creditCheck.errorMessage ||
              'This task is not available on your current plan.'
          );
          return;
        }

        lastAutoStartedJobRef.current =
          extractionJobKey;

        extractionInFlightRef.current =
          true;

        setIsExtracting(
          true
        );

        setErrorMessage(
          null
        );

        revokeDownloadUrl();

        let completed =
          false;

        try {
          /*
           * exclusivelyProcess() does two important things:
           *
           * 1. prevents another local PDF operation from racing
           *    this one;
           * 2. sets the global recoverable-processing marker.
           *
           * If iOS kills this browser process, App.tsx keeps the
           * OPFS workspace on the recreated page.
           */
          const result =
            await exclusivelyProcess(
              async () => {
                /*
                 * Confirm source PDF persistence before beginning
                 * a long 150 MB mobile OCR run.
                 *
                 * App.tsx also mirrors sharedFiles to OPFS;
                 * saveWorkspaceFiles is serialized and becomes a
                 * no-op when this exact workspace already exists.
                 */
                await saveWorkspaceFiles(
                  [
                    file,
                  ]
                );

                setProgressStatus(
                  'Preparing local recovery...'
                );

                /*
                 * Same content identity mechanism used by the
                 * Private PII recovery architecture.
                 */
                const sourceIdentity =
                  await localContentId(
                    file
                  );

                /*
                 * Cache identity includes the extraction options.
                 * Changing a Markdown setting must never reuse
                 * pages produced under different settings.
                 */
                const cacheIdentity =
                  await digestText(
                    JSON.stringify(
                      [
                        'pdf-to-markdown-pages-v1',
                        sourceIdentity,
                        detectHeadings,
                        detectLists,
                        joinHyphenatedWords,
                      ]
                    )
                  );

                return await extractMarkdownFromPDF(
                  file,
                  {
                    detectHeadings,
                    detectLists,
                    joinHyphenatedWords,

                    onProgress:
                      (
                        current,
                        total
                      ) => {
                        setProgressStatus(
                          `Parsing page ${current} of ${total}...`
                        );
                      },

                    /*
                     * These callbacks are the recovery system.
                     *
                     * A completed page is in IndexedDB.
                     * An unfinished page is absent.
                     */
                    readCachedPage:
                      async (
                        pageNumber
                      ) =>
                        await readMarkdownPage(
                          cacheIdentity,
                          pageNumber
                        ),

                    writeCachedPage:
                      async (
                        pageNumber,
                        markdown
                      ) => {
                        await writeMarkdownPage(
                          cacheIdentity,
                          pageNumber,
                          markdown
                        );
                      },
                  }
                );
              }
            );


          if (
            !result.markdown
              .trim()
          ) {
            setErrorMessage(
              'No readable text was found in this PDF.'
            );

            setMdResult(
              null
            );
          } else {
            setMdResult(
              result
            );

            const blob =
              new Blob(
                [
                  result.markdown,
                ],
                {
                  type:
                    'text/markdown;charset=utf-8;',
                }
              );

            createUrl(
              blob
            );

            completed =
              true;
          }

          /*
           * Full document succeeded.
           * The page records can remain available for instant
           * in-session reconstruction, but the browser-restart
           * processing marker is no longer needed.
           */
          clearProcessingRecovery();

          if (completed) {
            commitTaskCredit();
          }
        } catch (
          err:
            any
        ) {
          console.error(
            'Markdown extraction error:',
            err
          );

          /*
           * Do NOT clear the recovery marker/page cache here.
           *
           * If processing was interrupted, reopening/retrying
           * continues from the already completed page records.
           */
          setErrorMessage(
            err?.message ||
            'Processing was interrupted. Reopen this tool to continue from the last completed page.'
          );

          setMdResult(
            null
          );
        } finally {
          extractionInFlightRef.current =
            false;

          lastAutoStartedJobRef.current =
            null;

          setIsExtracting(
            false
          );

          setProgressStatus(
            ''
          );
        }
      };


    useEffect(
      () => {
        lastAutoStartedJobRef.current =
          null;

        setMdResult(
          null
        );

        revokeDownloadUrl();

        setErrorMessage(
          null
        );

        setProgressStatus(
          ''
        );

        if (!file) {
          return;
        }

        /*
         * Normal upload/settings changes do NOT start a task.
         *
         * Only an interrupted browser-recoverable job resumes
         * automatically using its saved page checkpoints.
         */
        if (
          hasRecoverableProcessing()
        ) {
          void handleExtraction();
        }
      },
      [
        fileIdentity,
        detectHeadings,
        detectLists,
        joinHyphenatedWords,
      ]
    );


    const handleCopy =
      () => {
        if (!mdResult) {
          return;
        }

        void navigator
          .clipboard
          .writeText(
            mdResult.markdown
          );

        setIsCopied(
          true
        );

        window.setTimeout(
          () =>
            setIsCopied(
              false
            ),
          2000
        );
      };


    const handleClear =
      () => {
        lastAutoStartedJobRef.current =
          null;

        /*
         * Explicit Clear means the user no longer wants this
         * recovery job. Remove Markdown page checkpoints.
         */
        void clearMarkdownPages()
          .catch(
            (
              error
            ) => {
              console.warn(
                'Unable to clear Markdown recovery records:',
                error
              );
            }
          );

        clearProcessingRecovery();

        onFileChange(
          null
        );

        setMdResult(
          null
        );

        revokeDownloadUrl();

        setErrorMessage(
          null
        );
      };


    return (
      <div className="w-full max-w-4xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a PDF to convert to Markdown"

            onClick={() =>
              fileInputRef.current
                ?.click()
            }

            onKeyDown={(event) => {
              if (
                event.key ===
                  'Enter' ||
                event.key ===
                  ' '
              ) {
                event.preventDefault();

                fileInputRef.current
                  ?.click();
              }
            }}

            onDragOver={(event) =>
              event.preventDefault()
            }

            onDrop={(event) => {
              event.preventDefault();

              const dropped =
                event.dataTransfer
                  .files?.[0];

              if (
                dropped &&
                (
                  dropped.type ===
                    'application/pdf' ||
                  dropped.name
                    .toLowerCase()
                    .endsWith(
                      '.pdf'
                    )
                )
              ) {
                onFileChange(
                  dropped
                );
              }
            }}

            className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
          >
            <FileCode className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />

            <p className="text-sm font-semibold text-zinc-200">
              Drop a PDF to convert to Markdown (.md)
            </p>

            <p className="text-xs text-zinc-500 mt-1">
              Ready for LLMs, NotebookLM, & RAG • Zero Server Uploads
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"

              onChange={(event) => {
                const selected =
                  event.target
                    .files?.[0];

                if (
                  selected &&
                  (
                    selected.type ===
                      'application/pdf' ||
                    selected.name
                      .toLowerCase()
                      .endsWith(
                        '.pdf'
                      )
                  )
                ) {
                  onFileChange(
                    selected
                  );
                }

                event.target.value =
                  '';
              }}
            />
          </div>
        ) : (
          <div className="space-y-6 text-left">

            <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">

              <div className="flex items-center gap-3 truncate">
                <FileText className="w-6 h-6 text-emerald-400 shrink-0" />

                <div className="truncate">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {file.name}
                  </p>

                  <p className="text-xs text-zinc-500">
                    {mdResult
                      ? `~${mdResult.estimatedTokens.toLocaleString()} tokens • ${mdResult.wordCount.toLocaleString()} words`
                      : `${Math.round(file.size / 1024)} KB`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClear}
                disabled={isExtracting}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-40"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs text-zinc-300">

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={detectHeadings}
                  disabled={isExtracting}

                  onChange={(event) =>
                    setDetectHeadings(
                      event.target.checked
                    )
                  }

                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                />

                <span>
                  Detect Headings (#, ##)
                </span>
              </label>


              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={detectLists}
                  disabled={isExtracting}

                  onChange={(event) =>
                    setDetectLists(
                      event.target.checked
                    )
                  }

                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                />

                <span>
                  Clean Bullet Lists
                </span>
              </label>


              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={joinHyphenatedWords}
                  disabled={isExtracting}

                  onChange={(event) =>
                    setJoinHyphenatedWords(
                      event.target.checked
                    )
                  }

                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                />

                <span>
                  Join Hyphenated Words
                </span>
              </label>
            </div>


            {!isExtracting && !mdResult && (
              <button
                type="button"
                onClick={() =>
                  void handleExtraction()
                }
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm"
              >
                <FileCode className="w-4 h-4" />
                <span>
                  Convert to Markdown
                </span>
              </button>
            )}


            {isExtracting ? (
              <div
                aria-busy="true"
                data-processing-active="true"
                className="h-64 flex flex-col items-center justify-center gap-3 bg-zinc-950/50 rounded-xl border border-zinc-800 text-xs text-zinc-400"
              >
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />

                <span>
                  {progressStatus ||
                    'Structuring Markdown...'}
                </span>

                <span className="text-[11px] text-zinc-600">
                  Completed pages are saved locally for automatic recovery.
                </span>
              </div>
            ) : mdResult ? (
              <div className="space-y-2">

                <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Structured Markdown Preview
                  </span>

                  <span className="text-zinc-500">
                    {mdResult.charCount.toLocaleString()} chars
                  </span>
                </div>


                <div className="relative">
                  <textarea
                    readOnly
                    value={mdResult.markdown}
                    rows={12}
                    className="w-full font-mono text-xs p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none focus:border-zinc-700 resize-none selection:bg-emerald-500 selection:text-black leading-relaxed"
                  />

                  <button
                    type="button"
                    onClick={handleCopy}
                    className="absolute top-3 right-3 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs shadow-md backdrop-blur-sm"
                    title="Copy to clipboard"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />

                        <span className="text-emerald-400">
                          Copied
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />

                        <span>
                          Copy MD
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}


            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />

                <span>
                  {errorMessage}
                </span>
              </div>
            )}


            {downloadUrl && (
              <div className="pt-2">
                <a
                  href={downloadUrl}
                  download={`${file.name.replace(/\.[^/.]+$/, '')}.md`}
                  className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />

                  <span>
                    Download .md File
                  </span>
                </a>
              </div>
            )}

          </div>
        )}
      </div>
    );
  };
