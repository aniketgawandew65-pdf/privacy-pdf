import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, ArrowUp, ArrowDown, Files, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { getLicenseStatus } from '../utils/license';
import { ProModal } from './ProModal';
import { mergePDFs } from '../utils/pdfEngine';
import { mergePDFsWithQpdf } from '../utils/largeMergeEngine';
import { useObjectUrl } from '../utils/useObjectUrl';
import { validateTaskFiles } from '../utils/fileSizeGuard';
import { isMobileSafetyEnvironment } from '../utils/deviceCapability';
import { useDesktopCapacityRecommendation } from '../hooks/useDesktopCapacityRecommendation';
import { DesktopCapacityStatus } from './DesktopCapacityStatus';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';

interface MergerProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

const LEGACY_FALLBACK_LIMIT_BYTES =
  150 * 1024 * 1024;

const getTotalSizeBytes = (files: File[]) =>
  files.reduce((total, file) => total + file.size, 0);

export function Merger({ files, onFilesChange }: MergerProps) {
  const [isMerging, setIsMerging] = useState(false);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mergeStage, setMergeStage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const totalSizeBytes =
    getTotalSizeBytes(files);

  const {
    recommendation:
      desktopCapacityRecommendation,
  } =
    useDesktopCapacityRecommendation({
      toolId:
        'merge-pdf',
      selectedBytes:
        totalSizeBytes,
      enabled:
        files.length > 0 &&
        isPro,
    });

  // Keep Pro status in sync with localStorage
  useEffect(() => {
    const handleStorage = () => setIsPro(getLicenseStatus().isPro);
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleAddFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const addedList = Array.from(newFiles).filter(
      (f) =>
        f.type === 'application/pdf' ||
        f.name.toLowerCase().endsWith('.pdf')
    );

    const combined = [...files, ...addedList];

    /*
     * Validate the WHOLE merge workload, not only the newest
     * FileList. This matters when mobile users add files in
     * multiple selections.
     *
     * Desktop bypasses the fixed 150 MB selection ceiling for every task tier.
     * Mobile/tablet retains the 150 MB combined-task cap for every tier.
     */
    const sizeCheck =
      validateTaskFiles(
        combined,
        'Selected files'
      );

    if (!sizeCheck.allowed) {
      setErrorMessage(
        sizeCheck.errorMessage
      );
      return;
    }

    onFilesChange(combined);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onFilesChange(updated);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= files.length) return;

    const updated = [...files];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    onFilesChange(updated);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  const handleMerge = async () => {
    if (files.length < 2) return;

    const totalBytes = getTotalSizeBytes(files);

    const creditCheck = checkTaskCredit(totalBytes);

    if (!creditCheck.allowed) {
      setErrorMessage(
        creditCheck.errorMessage ||
          'This merge is not available on your current plan.'
      );
      return;
    }

    setIsMerging(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const desktopDeviceSized =
        !isMobileSafetyEnvironment();

      let blob: Blob;

      if (desktopDeviceSized) {
        try {
          blob =
            await mergePDFsWithQpdf(
              files,
              ({ stage }) =>
                setMergeStage(stage)
            );
        } catch (optimizedError) {
          /*
           * Keep the proven pdf-lib + raster compatibility
           * engine for smaller/protected PDFs.
           *
           * Do NOT send a very large workload back into the
           * legacy whole-document engine, because that would
           * recreate the exact memory problem Phase 5 fixes.
           */
          if (
            totalBytes >
            LEGACY_FALLBACK_LIMIT_BYTES
          ) {
            console.error(
              'Optimized Desktop merge failed:',
              optimizedError
            );

            throw new Error(
              'The optimized Desktop merge engine could not process one of these large PDFs. If a file is encrypted, password-protected, or damaged, unlock or repair it first and try again.'
            );
          }

          console.warn(
            'Optimized merge unavailable. Falling back to compatibility engine:',
            optimizedError
          );

          setMergeStage(
            'Using compatibility merge engine…'
          );

          const mergedBytes =
            await mergePDFs(files);

          blob =
            new Blob(
              [
                mergedBytes as unknown as
                  BlobPart,
              ],
              {
                type:
                  'application/pdf',
              }
            );
        }
      } else {
        setMergeStage(
          'Merging documents locally…'
        );

        const mergedBytes =
          await mergePDFs(files);

        blob =
          new Blob(
            [
              mergedBytes as unknown as
                BlobPart,
            ],
            {
              type:
                'application/pdf',
            }
          );
      }

      createUrl(blob);

      // Successful result = exactly one task credit.
      commitTaskCredit();
    } catch (err: any) {
      console.error('Failed to merge PDFs:', err);
      setErrorMessage(err.message || 'Error merging files. One of the documents may be password protected.');
    } finally {
      setIsMerging(false);
      setMergeStage(null);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl text-left">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleAddFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Upload Dropzone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-xl p-6 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-6"
      >
        <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-zinc-200">
          Click or drop PDF files here to merge
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          {isMobileSafetyEnvironment()
            ? 'Mobile & tablet: Up to 150 MB total per task'
            : 'Desktop: Any size. Your device decides.'}
        </p>
      </div>

      {/* Selected File List */}
      {files.length > 0 && (
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-1 border-b border-zinc-800">
            <span>Documents ({files.length})</span>
            <button
              onClick={() => {
                onFilesChange([]);
                revokeDownloadUrl();
                setErrorMessage(null);
              }}
              className="text-zinc-500 hover:text-red-400 transition"
            >
              Clear all
            </button>
          </div>

          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-200"
            >
              <div className="flex items-center gap-2 truncate pr-2">
                <Files className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">{f.name}</span>
                <span className="text-[10px] text-zinc-500">
                  ({(f.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  disabled={i === 0}
                  onClick={() => moveFile(i, 'up')}
                  className="p-1 rounded text-[#3f3f46] hover:bg-[#3f3f46] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={i === files.length - 1}
                  onClick={() => moveFile(i, 'down')}
                  className="p-1 rounded text-[#3f3f46] hover:bg-[#3f3f46] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeFile(i)}
                  className="p-1 rounded text-zinc-400 hover:text-red-400 transition"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {desktopCapacityRecommendation && (
        <div className="mb-6">
          <DesktopCapacityStatus
            recommendation={desktopCapacityRecommendation}
          />
        </div>
      )}

      {/* Error Feedback */}
      {errorMessage && (
        <div className="p-3 mb-4 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        {!downloadUrl ? (
          <button
            disabled={
              files.length < 2 ||
              isMerging
            }
            onClick={handleMerge}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            {isMerging ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {mergeStage || 'Merging Documents Locally...'}
              </>
            ) : (
              `Merge ${files.length > 0 ? files.length : ''} Files`
            )}
          </button>
        ) : (
          <a
            href={downloadUrl}
            download="merged-document.pdf"
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold text-center transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle className="w-4 h-4 text-black stroke-[2.5]" />
            Download Merged PDF
          </a>
        )}
      </div>

      <ProModal isOpen={isProModalOpen} onClose={() => setIsProModalOpen(false)} />
    </div>
  );
}