import { useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo, type DragEvent } from 'react';
import {
  Upload,
  Loader2,
  Download,
  Sliders,
  CheckCircle,
  FileText,
  Trash2,
  AlertCircle,
  X,
  Sparkles,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { getLicenseStatus } from '../utils/license';
import { useObjectUrl } from '../utils/useObjectUrl';
import type { CompressionProgress } from '../utils/exactCompressor';
import {
  getDailyUsage,
} from '../utils/usageTracker';
import { validateTaskFiles } from '../utils/fileSizeGuard';
import {
  isMobileSafetyEnvironment,
} from '../utils/deviceCapability';
import {
  useDesktopCapacityRecommendation,
} from '../hooks/useDesktopCapacityRecommendation';
import { DesktopCapacityStatus } from './DesktopCapacityStatus';
import {
  getActiveGoogleBonus,
  subscribeGoogleBonus,
} from '../utils/googleBonus';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';
import { ProModal } from './ProModal';
import { useBatchQueue } from '../utils/useBatchQueue';
import { BatchQueueDrawer } from './BatchQueueDrawer';
import type { BatchTask } from '../utils/workerPool';

interface CompressorProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type CompressionLevel = 'recommended' | 'extreme' | 'target';

export function Compressor({ file, onFileChange }: CompressorProps) {
  const { pathname } = useLocation();
  const routeTarget = Number(pathname.match(/compress-pdf-to-(\d+)kb/)?.[1]) || null;
  const [level, setLevel] = useState<CompressionLevel>('target');
  const [targetKb, setTargetKb] = useState(routeTarget || 100);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);
  const [dailyStats, setDailyStats] = useState(getDailyUsage());
  const [hasBonusAccount, setHasBonusAccount] = useState(
    () => Boolean(getActiveGoogleBonus())
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const { createUrl: createZipUrl, revoke: revokeZipUrl } = useObjectUrl();
  const { tasksState, isProcessing: isBatchRunning, startBatch, cancelBatch } = useBatchQueue<
    { file: File; level: CompressionLevel; targetKb: number },
    Blob
  >();

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const syncState = () => {
    setIsPro(getLicenseStatus().isPro);
    setDailyStats(getDailyUsage());
    setHasBonusAccount(
      Boolean(getActiveGoogleBonus())
    );
  };

  useEffect(() => {
    const unsubscribeGoogleBonus =
      subscribeGoogleBonus(syncState);

    window.addEventListener('storage', syncState);
    document.addEventListener('visibilitychange', syncState);

    return () => {
      unsubscribeGoogleBonus();
      window.removeEventListener('storage', syncState);
      document.removeEventListener('visibilitychange', syncState);
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setTotalPages(1);
      return;
    }
    let isMounted = true;
    import('../utils/exactCompressor')
      .then(({ getPDFPageCount }) => getPDFPageCount(file))
      .then((count) => {
        if (isMounted) {
          const pages = Math.max(1, count);
          setTotalPages(pages);
          const origKb = Math.round(file.size / 1024);
          const balancedDefault = Math.min(
            Math.max(50, Math.round(pages * 75)),
            Math.max(50, Math.round(origKb * 0.85))
          );
          setTargetKb(routeTarget || balancedDefault);
        }
      })
      .catch(() => {
        if (isMounted) setTotalPages(1);
      });
    return () => {
      isMounted = false;
    };
  }, [file, routeTarget]);

  useEffect(() => { if (routeTarget) { setTargetKb(routeTarget); setLevel('target'); } }, [routeTarget]);

  const originalSizeKb = useMemo(() => (file ? Math.round(file.size / 1024) : 0), [file]);

  const selectedInputBytes =
    useMemo(
      () => {
        if (file) {
          return file.size;
        }

        return batchFiles.reduce(
          (
            total,
            selectedFile
          ) =>
            total +
            selectedFile.size,
          0
        );
      },
      [file, batchFiles]
    );

  const {
    recommendation:
      desktopCapacityRecommendation,
  } =
    useDesktopCapacityRecommendation({
      toolId:
        'compress-pdf',

      selectedBytes:
        selectedInputBytes,

      /*
       * Single-file Compress already knows the PDF
       * page count. Batch page counts are not cheaply
       * available before processing, so combined bytes
       * remain the safe preflight signal there.
       */
      pageCount:
        file
          ? totalPages
          : null,

      enabled:
        isPro,
    });

  const minSliderKb = 50;
  const maxSliderKb = useMemo(() => {
    if (!file) return 1000;

    /*
     * The target-size slider should follow the source document,
     * not the old 150 MB upload ceiling.
     */
    return Math.max(
      100,
      Math.floor(originalSizeKb * 0.95)
    );
  }, [file, originalSizeKb]);

  const recommendedReadableKb = useMemo(() => {
    return Math.min(Math.max(80, Math.round(totalPages * 75)), maxSliderKb);
  }, [totalPages, maxSliderKb]);

  const clarityStatus = useMemo(() => {
    const kbPerPage = targetKb / totalPages;
    if (kbPerPage < 35) {
      return {
        level: 'low',
        badge: '🔴 Heavy Blur Warning',
        desc: `~${kbPerPage.toFixed(1)} KB/page. Strict upload mode; fine text and table rows will be blurry.`,
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      };
    } else if (kbPerPage < 80) {
      return {
        level: 'medium',
        badge: '🟡 Balanced Clarity',
        desc: `~${kbPerPage.toFixed(1)} KB/page. Fully legible text with moderate graphic compression.`,
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      };
    }
    return {
      level: 'high',
      badge: '🟢 Sharp Clarity',
      desc: `~${kbPerPage.toFixed(1)} KB/page. Crisp text, official stamps, and high graphical detail.`,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    };
  }, [targetKb, totalPages]);

  const formatSize = (kb: number): string => {
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${Math.round(kb)} KB`;
  };

  const validateFiles = (files: File[]): boolean => {
    if (files.length === 0) return false;

    const sizeCheck =
      validateTaskFiles(
        files,
        'Compression files'
      );

    if (!sizeCheck.allowed) {
      setErrorMessage(
        sizeCheck.errorMessage
      );

      if (!isPro) {
        setIsProModalOpen(true);
      }

      return false;
    }

    return true;
  };

  const handleFilesSelected = (files: File[]) => {
    setErrorMessage(null);
    revokeDownloadUrl();
    revokeZipUrl();
    setCompressedSize(null);

    if (files.length === 0) return;
    if (!validateFiles(files)) return;

    if (files.length === 1) {
      setBatchFiles([]);
      onFileChange(files[0]);
    } else {
      onFileChange(null);
      setBatchFiles(files);
      initiateBatch(files);
    }
  };

  const initiateBatch = (files: File[]) => {
    revokeZipUrl();
    const tasks: BatchTask<{ file: File; level: CompressionLevel; targetKb: number }, Blob>[] =
      files.map((f, index) => ({
        id: `${index + 1}_${f.name}`,
        input: { file: f, level, targetKb },
        run: async (input, signal) => {
          if (signal.aborted) throw new Error('Task aborted');

          const creditCheck =
            checkTaskCredit(input.file);

          if (!creditCheck.allowed) {
            throw new Error(
              creditCheck.errorMessage ||
                'This task is not available on your current plan.'
            );
          }

          const { compressPDF } =
            await import('../utils/exactCompressor');

          const outputBytes =
            await compressPDF(input.file, {
              level: input.level,
              targetKb: input.targetKb,
            });

          const blob =
            new Blob(
              [outputBytes as BlobPart],
              { type: 'application/pdf' }
            );

          commitTaskCredit();
          syncState();

          return blob;
        },
      }));

    startBatch(tasks);
    syncState();
  };

  const handleCompress = async () => {
    if (!file) return;

    const limitCheck = checkTaskCredit(file);

    if (!limitCheck.allowed) {
      setErrorMessage(
        limitCheck.errorMessage ||
          'This task is not available on your current plan.'
      );

      setIsProModalOpen(true);
      return;
    }

    setIsCompressing(true);
    setErrorMessage(null);
    setProgressStatus('Initializing local engine...');
    revokeDownloadUrl();

    try {
      const { compressPDF } = await import('../utils/exactCompressor');
      const outputBytes = await compressPDF(file, {
        level,
        targetKb,
        onProgress: (progress: CompressionProgress) => {
          setProgressStatus(progress.stage);
        },
      });

      const blob = new Blob([outputBytes as BlobPart], { type: 'application/pdf' });
      setCompressedSize(blob.size);
      createUrl(blob);
      commitTaskCredit();
      syncState();
    } catch (err) {
      console.error('Compression error:', err);
      const errStr = String((err as any)?.message || err || "");
      if (errStr.toLowerCase().includes("password") || errStr.toLowerCase().includes("encrypted")) {
        setErrorMessage("This PDF is password-protected. Please unlock it before compressing.");
      } else if (errStr.toLowerCase().includes("corrupt") || errStr.toLowerCase().includes("invalid pdf")) {
        setErrorMessage("Failed to parse PDF. The document file structure may be damaged.");
      } else {
        setErrorMessage(errStr || "Failed to compress PDF. Please try again.");
      }
    } finally {
      setIsCompressing(false);
      setProgressStatus('');
    }
  };

  

  const handleDownloadBatchZip = async () => {
    const {
      Zip,
      ZipPassThrough,
    } = await import(
      'fflate'
    );

    const completedTasks =
      Object.entries(
        tasksState
      ).filter(
        ([, task]) =>
          task.status ===
            'completed' &&
          Boolean(
            task.result
          )
      );

    if (
      completedTasks.length === 0
    ) {
      return;
    }

    const chunks:
      ArrayBuffer[] = [];

    let resolveZip!:
      (blob: Blob) => void;

    let rejectZip!:
      (error: unknown) => void;

    const zipResult =
      new Promise<Blob>(
        (resolve, reject) => {
          resolveZip =
            resolve;

          rejectZip =
            reject;
        }
      );

    const zip =
      new Zip(
        (
          error,
          data,
          final
        ) => {
          if (error) {
            rejectZip(
              error
            );
            return;
          }

          if (
            data &&
            data.length
          ) {
            const copy =
              new Uint8Array(
                data.length
              );

            copy.set(
              data
            );

            chunks.push(
              copy.buffer
            );
          }

          if (final) {
            resolveZip(
              new Blob(
                chunks,
                {
                  type:
                    'application/zip',
                }
              )
            );
          }
        }
      );

    for (
      const [
        fileName,
        task,
      ] of completedTasks
    ) {
      if (!task.result) {
        continue;
      }

      const baseName =
        fileName.replace(
          /\.[^/.]+$/,
          ''
        );

      const entry =
        new ZipPassThrough(
          `${baseName}_compressed.pdf`
        );

      zip.add(
        entry
      );

      /*
       * Materialize only one compressed PDF
       * into an ArrayBuffer at a time.
       */
      const bytes =
        new Uint8Array(
          await task.result.arrayBuffer()
        );

      entry.push(
        bytes,
        true
      );

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }

    zip.end();

    const zipBlob =
      await zipResult;

    /*
     * Reuse the managed object URL instead
     * of creating a second untracked URL.
     */
    const downloadUrl =
      createZipUrl(
        zipBlob
      );

    const tempLink =
      document.createElement(
        'a'
      );

    tempLink.href =
      downloadUrl;

    tempLink.download =
      'compressed_bundle.zip';

    document.body.appendChild(
      tempLink
    );

    tempLink.click();

    document.body.removeChild(
      tempLink
    );
  };

  const handleClearAll = () => {
    onFileChange(null);
    setBatchFiles([]);
    revokeDownloadUrl();
    revokeZipUrl();
    cancelBatch();
    setCompressedSize(null);
    setErrorMessage(null);
    setProgressStatus('');
  };

  return (
    <div className="w-full max-w-xl mx-auto p-4 sm:p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl text-left">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files ? Array.from(e.target.files) : [];
          handleFilesSelected(selected);
          e.target.value = '';
        }}
      />

      {!isPro && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 sm:pb-4 mb-4 sm:mb-5 border-b border-zinc-800 text-xs">
          <div className="space-y-1">
            <div className="text-zinc-400">
              Daily Free Tasks:{' '}
              <strong className="text-zinc-200">
                {dailyStats.anonymousRemaining} of 2 remaining
              </strong>
              {' '}• Desktop: Any size. Your device decides.
            </div>

            {hasBonusAccount ? (
              <div className="text-emerald-400">
                Extra Tasks:{' '}
                <strong>
                  {dailyStats.bonusRemaining} of 2 remaining
                </strong>
                {' '}• Same file-size access
              </div>
            ) : (
              <div className="text-emerald-400">
                Sign in to unlock 2 more tasks • Same file-size access
              </div>
            )}
          </div>

          <button
            onClick={() => setIsProModalOpen(true)}
            className="text-emerald-400 hover:text-emerald-300 font-medium transition cursor-pointer shrink-0"
          >
            Unlock Unlimited
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 sm:mb-5 p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {desktopCapacityRecommendation && (
        <DesktopCapacityStatus
          recommendation={
            desktopCapacityRecommendation
          }
          className="mb-4 sm:mb-5"
        />
      )}

      {!file && batchFiles.length === 0 && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload PDF to compress"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            const dropped = Array.from(e.dataTransfer.files).filter(
              (f) => f.type === 'application/pdf'
            );
            handleFilesSelected(dropped);
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 active:border-emerald-500 focus:border-emerald-500 focus:outline-none rounded-xl p-6 sm:p-8 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-5 touch-manipulation min-h-[140px] flex flex-col items-center justify-center"
        >
          <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-200">
            Tap or drop PDF files to compress
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Single or multi-file batch • {isPro
              ? (
                isMobileSafetyEnvironment()
                  ? 'Max 150 MB per task'
                  : 'Desktop Pro uses hardware-aware capacity'
              )
              : dailyStats.bonusRemaining > 0
                ? 'Max 150 MB'
                : 'Max 100 MB'}
          </p>
        </div>
      )}

      {batchFiles.length > 1 && (
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-xs text-zinc-400">
              Batch Mode ({batchFiles.length} files queued)
            </span>
            <button
              onClick={handleClearAll}
              className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1 transition p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Clear All
            </button>
          </div>

          <BatchQueueDrawer
            tasks={tasksState}
            isProcessing={isBatchRunning}
            onCancel={cancelBatch}
            onDownloadAll={handleDownloadBatchZip}
            title="Parallel PDF Compression"
          />
        </div>
      )}

      {file && (
        <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mb-5 sm:mb-6">
          <div className="flex items-center gap-2.5 truncate min-w-0">
            <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="truncate">
              <p className="text-xs font-medium text-zinc-200 truncate">{file.name}</p>
              <p className="text-[11px] text-zinc-500">
                {formatSize(originalSizeKb)} • {totalPages} page{totalPages > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition ml-3 shrink-0 p-2 min-h-[44px] min-w-[44px] justify-center cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Remove</span>
          </button>
        </div>
      )}

      <div className="space-y-3 mb-5 sm:mb-6">
        <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" />
          Compression Mode
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => setLevel('target')}
            className={`p-3 rounded-xl border text-left transition-all min-h-[44px] cursor-pointer ${
              level === 'target'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <p className="text-xs font-semibold">Target Size</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Strict KB matching</p>
          </button>

          <button
            type="button"
            onClick={() => setLevel('extreme')}
            className={`p-3 rounded-xl border text-left transition-all min-h-[44px] cursor-pointer ${
              level === 'extreme'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <p className="text-xs font-semibold">Extreme</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Aggressive reduction</p>
          </button>

          <button
            type="button"
            onClick={() => setLevel('recommended')}
            className={`p-3 rounded-xl border text-left transition-all min-h-[44px] cursor-pointer ${
              level === 'recommended'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <p className="text-xs font-semibold">Standard</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Balanced image compression</p>
          </button>
        </div>

        {level === 'target' && (
          <div className="p-3 sm:p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mt-3">
            <div className="flex justify-between items-center text-xs text-zinc-300 mb-2">
              <span className="font-medium">Target Output Size:</span>
              <span className="font-bold text-emerald-400 text-sm">{formatSize(targetKb)}</span>
            </div>

            <input
              type="range"
              min={minSliderKb}
              max={maxSliderKb}
              step={maxSliderKb > 10000 ? 50 : 10}
              value={targetKb}
              onChange={(e) => setTargetKb(Number(e.target.value))}
              className="w-full h-3 sm:h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-pan-x"
            />

            <div className="flex justify-between text-[10px] text-zinc-500 mt-1.5">
              <span>Min: {formatSize(minSliderKb)}</span>
              <span>Max: {formatSize(maxSliderKb)}</span>
            </div>

            <div className={`mt-3 p-2.5 rounded-lg border flex items-start gap-2 ${clarityStatus.color}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-semibold">{clarityStatus.badge}:</span> {clarityStatus.desc}
              </div>
            </div>

            {targetKb < recommendedReadableKb && (
              <button
                type="button"
                onClick={() => setTargetKb(recommendedReadableKb)}
                className="mt-2.5 w-full py-2 sm:py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 flex items-center justify-center gap-1.5 text-xs font-medium transition min-h-[44px] cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Auto-Set to Sharp Readability ({formatSize(recommendedReadableKb)})
              </button>
            )}
          </div>
        )}
      </div>

      {file && (
        <button
          disabled={isCompressing}
          onClick={handleCompress}
          className="w-full py-3.5 sm:py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold transition flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-emerald-500/20 min-h-[48px] cursor-pointer"
        >
          {isCompressing ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{progressStatus || 'Compressing PDF Locally...'}</span>
            </div>
          ) : (
            <span>Compress PDF</span>
          )}
        </button>
      )}

      {downloadUrl && compressedSize && file && (
        <div className="mt-4 p-3.5 sm:p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Compression Complete
            </p>
            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
              <span>{formatSize(originalSizeKb)}</span>
              <ArrowRight className="w-3 h-3 text-zinc-500" />
              <span className="text-emerald-400 font-bold">{formatSize(Math.round(compressedSize / 1024))}</span>
              <span>
                ({Math.max(0, Math.round(((file.size - compressedSize) / file.size) * 100))}% reduction)
              </span>
            </div>
          </div>
          <a
            href={downloadUrl}
            download={`compressed_${file.name}`}
            className="w-full sm:w-auto py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition flex items-center justify-center gap-1.5 shrink-0 min-h-[44px]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </a>
        </div>
      )}

      <ProModal isOpen={isProModalOpen} onClose={() => setIsProModalOpen(false)} />
    </div>
  );
}
