import { useState, useEffect, useRef } from 'react';
import { Upload, Loader2, Download, Sliders, CheckCircle, FileText, Trash2, AlertCircle } from 'lucide-react';
import { getLicenseStatus } from '../utils/license';
import { useObjectUrl } from '../utils/useObjectUrl';
import { compressPDF, type CompressionProgress } from '../utils/pdfEngine';
import { checkActionAllowed, recordActionExecution, getDailyUsage } from '../utils/usageTracker';
import { ProModal } from './ProModal';

interface CompressorProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type CompressionLevel = 'recommended' | 'extreme' | 'target';

export function Compressor({ file, onFileChange }: CompressorProps) {
  const [level, setLevel] = useState<CompressionLevel>('target');
  const [targetKb, setTargetKb] = useState(100);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);
  const [dailyStats, setDailyStats] = useState(getDailyUsage());
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = (selectedFile: File | null) => {
    setErrorMessage(null);
    revokeDownloadUrl();
    setCompressedSize(null);

    if (!selectedFile) {
      onFileChange(null);
      return;
    }

    const check = checkActionAllowed(selectedFile.size);
    if (!check.allowed) {
      setErrorMessage(check.errorMessage || 'File exceeds upload limit.');
      setIsProModalOpen(true);
      return;
    }

    onFileChange(selectedFile);
  };

  const handleCompress = async () => {
    if (!file) return;

    // Enforce 4 tasks/day limit and file size cap
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

  const handleClearFile = () => {
    onFileChange(null);
    revokeDownloadUrl();
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
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] || null;
          handleFileSelect(selected);
          e.target.value = '';
        }}
      />

      {/* Free Tier Usage Indicator */}
      {!isPro && (
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-800 text-xs">
          <span className="text-zinc-400">
            Daily Free Tasks: <strong className="text-zinc-200">{dailyStats.remaining} of {dailyStats.max} remaining</strong>
          </span>
          <button
            onClick={() => setIsProModalOpen(true)}
            className="text-emerald-400 hover:text-emerald-300 font-medium transition"
          >
            Unlock Unlimited
          </button>
        </div>
      )}

      {/* Upload Zone */}
      {!file ? (
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
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0] || null;
            handleFileSelect(dropped);
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none rounded-xl p-8 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-6"
        >
          <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-200">Click or drop a PDF to compress</p>
          <p className="text-xs text-zinc-500 mt-1">
            Processed 100% locally • Max {isPro ? '150 MB' : '25 MB'}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mb-6">
          <div className="flex items-center gap-2.5 truncate">
            <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="truncate">
              <p className="text-xs font-medium text-zinc-200 truncate">{file.name}</p>
              <p className="text-[11px] text-zinc-500">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          </div>
          <button
            onClick={handleClearFile}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-400 transition ml-3 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mb-5 p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Mode Selectors */}
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

        {/* Target Slider */}
        {level === 'target' && (
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mt-3">
            <div className="flex justify-between text-xs text-zinc-300 mb-2">
              <span>Target Output Size:</span>
              <span className="font-semibold text-emerald-400">{targetKb} KB</span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="25"
              value={targetKb}
              onChange={(e) => setTargetKb(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Engine will tune quality and DPI to fit within ~{targetKb} KB.
            </p>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        disabled={!file || isCompressing}
        onClick={handleCompress}
        className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold transition flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-emerald-500/20"
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

      {/* Download Result */}
      {downloadUrl && compressedSize && file && (
        <div className="mt-4 p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Compression Complete
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Original: {(file.size / 1024).toFixed(0)} KB → Result: {(compressedSize / 1024).toFixed(0)} KB (
              {Math.round(((file.size - compressedSize) / file.size) * 100)}% reduction)
            </p>
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