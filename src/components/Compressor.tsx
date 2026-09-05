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
import JSZip from 'jszip';
import { getLicenseStatus } from '../utils/license';
import { useObjectUrl } from '../utils/useObjectUrl';
import { compressPDF, getPDFPageCount, type CompressionProgress } from '../utils/pdfEngine';
import { checkActionAllowed, recordActionExecution, getDailyUsage } from '../utils/usageTracker';
import { ProModal } from './ProModal';
import { useBatchQueue } from '../utils/useBatchQueue';
import { BatchQueueDrawer } from './BatchQueueDrawer';
import type { BatchTask } from '../utils/workerPool';

interface CompressorProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type CompressionLevel = 'recommended' | 'extreme' | 'target';

const MAX_FREE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_PRO_BYTES = 150 * 1024 * 1024; // 150 MB

export function Compressor({ file, onFileChange }: CompressorProps) {
  const [level, setLevel] = useState<CompressionLevel>('target');
  const [targetKb, setTargetKb] = useState(100);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);
  const [dailyStats, setDailyStats] = useState(getDailyUsage());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-file batch state
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
  };

  useEffect(() => {
    window.addEventListener('storage', syncState);
    document.addEventListener('visibilitychange', syncState);
    return () => {
      window.removeEventListener('storage', syncState);
      document.removeEventListener('visibilitychange', syncState);
    };
  }, []);

  // Dynamically inspect page count whenever a single file is selected
  useEffect(() => {
    if (!file) {
      setTotalPages(1);
      return;
    }
    let isMounted = true;
    getPDFPageCount(file)
      .then((count) => {
        if (isMounted) {
          const pages = Math.max(1, count);
          setTotalPages(pages);
          const origKb = Math.round(file.size / 1024);
          // Default to a balanced ~75 KB per page, capped under the original file size
          const balancedDefault = Math.min(
            Math.max(50, Math.round(pages * 75)),
            Math.max(50, Math.round(origKb * 0.85))
          );
          setTargetKb(balancedDefault);
        }
      })
      .catch(() => {
        if (isMounted) setTotalPages(1);
      });
    return () => {
      isMounted = false;
    };
  }, [file]);

  const originalSizeKb = useMemo(() => (file ? Math.round(file.size / 1024) : 0), [file]);

  // Adaptive slider boundaries
  const minSliderKb = 50;
  const maxSliderKb = useMemo(() => {
    if (!file) return 1000;
    // Scale up to 95% of original size or maximum 150 MB (153,600 KB)
    return Math.max(100, Math.min(Math.floor(originalSizeKb * 0.95), 150 * 1024));
  }, [file, originalSizeKb]);

  // Readability threshold: ~75 KB per page for sharp document clarity
  const recommendedReadableKb = useMemo(() => {
    return Math.min(Math.max(80, Math.round(totalPages * 75)), maxSliderKb);
  }, [totalPages, maxSliderKb]);

  // Real-time clarity predictor
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

    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const limit = isPro ? MAX_PRO_BYTES : MAX_FREE_BYTES;
    const limitMB = isPro ? 150 : 25;
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

    if (totalBytes > limit) {
      setErrorMessage(
        isPro
          ? `Total batch size (${totalMB} MB) exceeds the Pro limit of ${limitMB} MB.`
          : `Total size (${totalMB} MB) exceeds the free 25 MB limit. Upgrade to Pro for up to 150 MB.`
      );
      setIsProModalOpen(true);
      return false;
    }

    if (!isPro && files.length > dailyStats.remaining) {
      setErrorMessage(
        `You have ${dailyStats.remaining} free task(s) remaining today, but selected ${files.length} files.`
      );
      setIsProModalOpen(true);
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
      const check = checkActionAllowed(files[0].size);
      if (!check.allowed) {
        setErrorMessage(check.errorMessage || 'File exceeds upload limit.');
        setIsProModalOpen(true);
        return;
      }
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
      files.map((f) => ({
        id: f.name,
        input: { file: f, level, targetKb },
        run: async (input, signal) => {
          if (signal.aborted) throw new Error('Task aborted');
          const outputBytes = await compressPDF(input.file, {
            level: input.level,
            targetKb: input.targetKb,
          });
          recordActionExecution();
          return new Blob([outputBytes as BlobPart], { type: 'application/pdf' });
        },
      }));

    startBatch(tasks);
    syncState();
  };

  const handleCompress = async () => {
    if (!file) return;

    const limitCheck = checkActionAllowed(file.size);
    if (!limitCheck.allowed) {
      setErrorMessage(limitCheck.errorMessage || 'Daily task limit reached.');
      setIsProModalOpen(true);
      return;
    }

    setIsCompressing(true);
    setErrorMessage(null);
    setProgressStatus('Initializing local engine...');
    revokeDownloadUrl();

    try {
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
      recordActionExecution();
      syncState();
    } catch (err) {
      console.error('Compression error:', err);
      setErrorMessage('Failed to compress PDF. The document may be corrupted or password-locked.');
    } finally {
      setIsCompressing(false);
      setProgressStatus('');
    }
  };

  const handleDownloadBatchZip = async () => {
    const zip = new JSZip();
    Object.entries(tasksState).forEach(([fileName, task]) => {
      if (task.status === 'completed' && task.result) {
        const baseName = fileName.replace(/\.[^/.]+$/, '');
        zip.file(`${baseName}_compressed.pdf`, task.result);
      }
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    createZipUrl(zipBlob);

    const tempLink = document.createElement('a');
    tempLink.href = URL.createObjectURL(zipBlob);
    tempLink.download = 'compressed_bundle.zip';
    tempLink.click();
    setTimeout(() => URL.revokeObjectURL(tempLink.href), 1000);
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
    <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl text-left">
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

      {/* Free Tier Usage Indicator */}
      {!isPro && (
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-800 text-xs">
          <span className="text-zinc-400">
            Daily Free Tasks:{' '}
            <strong className="text-zinc-200">
              {dailyStats.remaining} of {dailyStats.max} remaining
            </strong>
          </span>
          <button
            onClick={() => setIsProModalOpen(true)}
            className="text-emerald-400 hover:text-emerald-300 font-medium transition"
          >
            Unlock Unlimited
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-5 p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* No Files Selected (Upload Area) */}
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
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none rounded-xl p-8 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-6"
        >
          <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-200">
            Click or drop PDF files to compress
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Single or multi-file batch • Max {isPro ? '150 MB' : '25 MB'}
          </p>
        </div>
      )}

      {/* Multi-File Batch Drawer */}
      {batchFiles.length > 1 && (
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-xs text-zinc-400">
              Batch Mode ({batchFiles.length} files queued)
            </span>
            <button
              onClick={handleClearAll}
              className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1 transition"
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

      {/* Single File Card */}
      {file && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mb-6">
          <div className="flex items-center gap-2.5 truncate">
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
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition ml-3 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        </div>
      )}

      {/* Settings */}
      <div className="space-y-3 mb-6">
        <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" />
          Compression Mode
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => setLevel('target')}
            className={`p-3 rounded-xl border text-left transition-all ${
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
            className={`p-3 rounded-xl border text-left transition-all ${
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
            className={`p-3 rounded-xl border text-left transition-all ${
              level === 'recommended'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <p className="text-xs font-semibold">Standard</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Lossless vector cleanup</p>
          </button>
        </div>

        {/* Adaptive Target Slider & Clarity Indicator */}
        {level === 'target' && (
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mt-3">
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
              className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />

            <div className="flex justify-between text-[10px] text-zinc-500 mt-1.5">
              <span>Min: {formatSize(minSliderKb)}</span>
              <span>Max: {formatSize(maxSliderKb)}</span>
            </div>

            {/* Live Clarity Predictor */}
            <div className={`mt-3 p-2.5 rounded-lg border flex items-start gap-2 ${clarityStatus.color}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-semibold">{clarityStatus.badge}:</span> {clarityStatus.desc}
              </div>
            </div>

            {/* Auto-set to sharp readability preset */}
            {targetKb < recommendedReadableKb && (
              <button
                type="button"
                onClick={() => setTargetKb(recommendedReadableKb)}
                className="mt-2.5 w-full py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 flex items-center justify-center gap-1.5 text-xs font-medium transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Auto-Set to Sharp Readability ({formatSize(recommendedReadableKb)})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action Button for Single File */}
      {file && (
        <button
          disabled={isCompressing}
          onClick={handleCompress}
          className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold transition flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-emerald-500/20"
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

      {/* Download Result for Single File */}
      {downloadUrl && compressedSize && file && (
        <div className="mt-4 p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
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
            className="w-full sm:w-auto py-2 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition flex items-center justify-center gap-1.5 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        </div>
      )}

      <ProModal isOpen={isProModalOpen} onClose={() => setIsProModalOpen(false)} />
    </div>
  );
}