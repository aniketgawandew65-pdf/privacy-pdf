import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  X,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { getPDFMetadata } from '../utils/pdfEngine';
import {
  updatePDFMetadataSafe,
} from '../utils/metadataPdf';
import {
  saveWorkspaceFiles,
  saveToolWorkspaceState,
  restoreToolWorkspaceState,
  clearToolWorkspace,
} from '../utils/localWorkspace';
import {
  exclusivelyProcess,
  hasRecoverableProcessing,
  clearProcessingRecovery,
} from '../utils/localProcessing';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';

interface EditMetadataProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type MetadataDraft = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
};

/*
 * Intentionally module-memory only.
 *
 * This keeps metadata fields when the user navigates away from
 * this tool and comes back during the same app session.
 *
 * A real browser hard refresh creates a fresh JS runtime, so the
 * draft disappears exactly as requested.
 */
const metadataDrafts =
  new Map<string, MetadataDraft>();

const metadataDraftKey =
  (file: File) =>
    [
      file.name,
      file.size,
      file.lastModified || 0,
    ].join(':');

export const EditMetadata: React.FC<EditMetadataProps> = ({ file, onFileChange }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [subject, setSubject] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryPending, setRecoveryPending] =
    useState(false);

  const autoRecoveryAttemptedRef =
    useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setTitle('');
      setAuthor('');
      setSubject('');
      setKeywords('');
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
      setError(null);
      return;
    }

    const draftKey =
      metadataDraftKey(file);

    const recoveryState =
      restoreToolWorkspaceState<{
        recoveryPending?: boolean;
        fileName?: string;
        fileSize?: number;
        fileLastModified?: number;
        title?: string;
        author?: string;
        subject?: string;
        keywords?: string;
      }>('edit-metadata');

    const recoveryMatches =
      Boolean(
        recoveryState?.recoveryPending &&
        recoveryState.fileName ===
          file.name &&
        recoveryState.fileSize ===
          file.size &&
        recoveryState.fileLastModified ===
          (file.lastModified || 0)
      );

    if (
      recoveryMatches
    ) {
      const draft:
        MetadataDraft = {
          title:
            recoveryState?.title ||
            '',

          author:
            recoveryState?.author ||
            '',

          subject:
            recoveryState?.subject ||
            '',

          keywords:
            recoveryState?.keywords ||
            '',
        };

      metadataDrafts.set(
        draftKey,
        draft
      );

      setTitle(
        draft.title
      );

      setAuthor(
        draft.author
      );

      setSubject(
        draft.subject
      );

      setKeywords(
        draft.keywords
      );

      setRecoveryPending(
        true
      );

      setIsLoading(
        false
      );

      setError(null);

      return;
    }

    const existingDraft =
      metadataDrafts.get(
        draftKey
      );

    /*
     * The user already worked on this exact file during the
     * current app session. Restore their latest values instead
     * of rereading the untouched original PDF.
     */
    if (existingDraft) {
      setTitle(
        existingDraft.title
      );

      setAuthor(
        existingDraft.author
      );

      setSubject(
        existingDraft.subject
      );

      setKeywords(
        existingDraft.keywords
      );

      setIsLoading(false);
      setError(null);

      if (downloadUrl) {
        URL.revokeObjectURL(
          downloadUrl
        );
      }

      setDownloadUrl(null);

      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    if (downloadUrl) {
      URL.revokeObjectURL(
        downloadUrl
      );
    }

    setDownloadUrl(null);

    getPDFMetadata(file)
      .then((meta) => {
        if (!isMounted) return;

        const draft: MetadataDraft = {
          title:
            meta.title || '',

          author:
            meta.author || '',

          subject:
            meta.subject || '',

          keywords:
            meta.keywords || '',
        };

        /*
         * Even original metadata is remembered so navigating
         * away/back never causes the fields to flash/reset.
         */
        metadataDrafts.set(
          draftKey,
          draft
        );

        setTitle(
          draft.title
        );

        setAuthor(
          draft.author
        );

        setSubject(
          draft.subject
        );

        setKeywords(
          draft.keywords
        );
      })
      .catch((err: any) => {
        console.warn('Metadata read notice:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [file]);

  const persistMetadataDraft = (
    next:
      Partial<MetadataDraft>
  ) => {
    if (!file) {
      return;
    }

    const key =
      metadataDraftKey(file);

    const current =
      metadataDrafts.get(
        key
      ) || {
        title,
        author,
        subject,
        keywords,
      };

    metadataDrafts.set(
      key,
      {
        ...current,
        ...next,
      }
    );
  };


  const handleSave = async (
    isAutomaticRecovery = false
  ) => {
    if (!file) return;

    const creditCheck =
      checkTaskCredit(
        file
      );

    if (!creditCheck.allowed) {
      setError(
        creditCheck.errorMessage ||
          'This task is not available on your current plan.'
      );

      return;
    }

    setIsProcessing(true);
    setError(null);

    persistMetadataDraft({
      title,
      author,
      subject,
      keywords,
    });

    try {
      /*
       * Ensure the browser-backed source is durably mirrored
       * before the heavy rewrite begins.
       *
       * App.tsx uses this same workspace, so this does not
       * create a second tool-specific 150 MB copy.
       */
      await saveWorkspaceFiles(
        [file]
      );

      setRecoveryPending(
        true
      );

      saveToolWorkspaceState(
        'edit-metadata',
        {
          recoveryPending:
            true,

          fileName:
            file.name,

          fileSize:
            file.size,

          fileLastModified:
            file.lastModified ||
            0,

          title,
          author,
          subject,
          keywords,
        }
      );

      const outputBytes =
        await exclusivelyProcess(
          async () =>
            await updatePDFMetadataSafe(
              file,
              {
                title,
                author,
                subject,
                keywords,
              }
            )
        );

      const cleanBuffer =
        outputBytes.buffer.slice(
          outputBytes.byteOffset,
          outputBytes.byteOffset +
            outputBytes.byteLength
        );

      const blob =
        new Blob(
          [
            cleanBuffer as
              unknown as
              BlobPart,
          ],
          {
            type:
              'application/pdf',
          }
        );

      if (downloadUrl) {
        URL.revokeObjectURL(
          downloadUrl
        );
      }

      const url =
        URL.createObjectURL(
          blob
        );

      setDownloadUrl(
        url
      );

      clearProcessingRecovery();

      setRecoveryPending(
        false
      );

      await clearToolWorkspace(
        'edit-metadata'
      );

      commitTaskCredit();
    } catch (err: any) {
      /*
       * Normal deterministic failure must not cause an
       * endless auto-recovery loop.
       *
       * If Safari kills the process completely, execution
       * never reaches this catch and the marker survives.
       */
      clearProcessingRecovery();

      setRecoveryPending(
        false
      );

      await clearToolWorkspace(
        'edit-metadata'
      );

      if (
        err?.message ===
        'PASSWORD_PROTECTED_PDF'
      ) {
        setError(
          'This PDF requires a password to open. Unlock it first, then edit its metadata.'
        );
      } else if (
        err?.message ===
        'QPDF_RECOVERY_FAILED'
      ) {
        setError(
          'This PDF could not be safely normalized for metadata editing. No output was created.'
        );
      } else {
        setError(
          isAutomaticRecovery
            ? 'Automatic recovery could not complete the metadata update.'
            : 'Could not safely update metadata on this file.'
        );
      }
    } finally {
      setIsProcessing(
        false
      );
    }
  };

  /*
   * ZERO-CLICK AUTOMATIC RECOVERY
   *
   * Metadata writing is atomic rather than page-based.
   * If mobile Safari/Chrome recreates its WebContent process,
   * the durable original + requested metadata are restored and
   * the operation automatically runs again.
   *
   * No Resume button.
   */
  useEffect(() => {
    if (
      !file ||
      !recoveryPending ||
      !hasRecoverableProcessing() ||
      isProcessing ||
      autoRecoveryAttemptedRef.current
    ) {
      return;
    }

    autoRecoveryAttemptedRef.current =
      true;

    const timer =
      window.setTimeout(
        () => {
          void handleSave(
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
    file,
    recoveryPending,
    isProcessing,
    title,
    author,
    subject,
    keywords,
  ]);

  const handleClear = () => {
    clearProcessingRecovery();

    setRecoveryPending(
      false
    );

    autoRecoveryAttemptedRef.current =
      false;

    void clearToolWorkspace(
      'edit-metadata'
    );

    if (file) {
      metadataDrafts.delete(
        metadataDraftKey(
          file
        )
      );
    }

    if (downloadUrl) {
      URL.revokeObjectURL(
        downloadUrl
      );
    }

    onFileChange(null);
    setDownloadUrl(null);
    setError(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF here to edit metadata"
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
              clearProcessingRecovery();

              setRecoveryPending(
                false
              );

              autoRecoveryAttemptedRef.current =
                false;

              void clearToolWorkspace(
                'edit-metadata'
              );

              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to edit metadata</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                clearProcessingRecovery();

                setRecoveryPending(
                  false
                );

                autoRecoveryAttemptedRef.current =
                  false;

                void clearToolWorkspace(
                  'edit-metadata'
                );

                onFileChange(selected);
              }
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-5 text-left">
          {/* File Card */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Reading PDF metadata...</span>
            </div>
          ) : (
            <>
              {/* Form Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      const value =
                        e.target.value;

                      setTitle(value);

                      persistMetadataDraft({
                        title:
                          value,
                      });

                      setDownloadUrl(null);
                    }}
                    placeholder="Document Title"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Author</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => {
                      const value =
                        e.target.value;

                      setAuthor(value);

                      persistMetadataDraft({
                        author:
                          value,
                      });

                      setDownloadUrl(null);
                    }}
                    placeholder="Author name"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-zinc-400">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => {
                      const value =
                        e.target.value;

                      setSubject(value);

                      persistMetadataDraft({
                        subject:
                          value,
                      });

                      setDownloadUrl(null);
                    }}
                    placeholder="Document subject or summary"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-zinc-400">Keywords</label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => {
                      const value =
                        e.target.value;

                      setKeywords(value);

                      persistMetadataDraft({
                        keywords:
                          value,
                      });

                      setDownloadUrl(null);
                    }}
                    placeholder="e.g. statement, financial, 2026 (comma separated)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!downloadUrl ? (
                <button
                  type="button"
                  onClick={() => {
                void handleSave(false);
              }}
                  disabled={isProcessing}
                  className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving metadata...</span>
                    </>
                  ) : (
                    <>
                      <Tag className="w-4 h-4" />
                      <span>Update Metadata</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Metadata updated successfully!</span>
                  </div>
                  <a
                    href={downloadUrl}
                    download={`${file.name.replace(/\.[^/.]+$/, '')}_updated.pdf`}
                    className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    <span>Download Updated PDF</span>
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EditMetadata;