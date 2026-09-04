import React, { useState, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Wrench,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { repairPDF, type RepairResult } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface RepairPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const RepairPdf: React.FC<RepairPdfProps> = ({ file, onFileChange }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [repairInfo, setRepairInfo] = useState<RepairResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const handleRepair = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();
    setRepairInfo(null);

    try {
      const result = await repairPDF(file, (stage) => {
        setProgressStage(stage);
      });

      setRepairInfo(result);
      const blob = new Blob([result.bytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Repair failed:', err);
      setErrorMessage(
        err.message || 'Unable to salvage document. File structure may be completely truncated.'
      );
    } finally {
      setIsProcessing(false);
      setProgressStage('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setRepairInfo(null);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a damaged PDF to repair"
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
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Wrench className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a damaged or unreadable PDF to repair</p>
          <p className="text-xs text-zinc-500 mt-1">Rebuild corrupt cross-reference tables & trailer dictionaries</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                onFileChange(selected);
              }
              e.target.value = '';
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
                <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
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

          {/* Recovery Explanation Card */}
          <div className="p-3.5 bg-zinc-950/50 rounded-xl border border-zinc-800/80 space-y-2 text-xs text-zinc-400">
            <div className="flex items-center gap-2 text-zinc-200 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Two-Stage Recovery Architecture</span>
            </div>
            <ul className="space-y-1.5 list-disc pl-4 text-zinc-400 text-[11px] leading-relaxed">
              <li>
                <strong className="text-zinc-300">Stage 1 (Lossless):</strong> Rebuilds damaged index tables while preserving 100% original vector text and forms.
              </li>
              <li>
                <strong className="text-zinc-300">Stage 2 (Salvage):</strong> If stream indices are broken, recovers individual rendered page streams directly.
              </li>
            </ul>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger / Download */}
          {!downloadUrl ? (
            <button
              onClick={handleRepair}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressStage || 'Repairing document structure...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 stroke-[2.5]" />
                  <span>Diagnose & Rebuild PDF</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/30 space-y-1 text-xs text-emerald-400">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Document Successfully Repaired</span>
                </div>
                <p className="text-[11px] text-zinc-400 pl-5">
                  Recovered {repairInfo?.recoveredPages} page{repairInfo?.recoveredPages === 1 ? '' : 's'} via{' '}
                  <span className="text-zinc-200 font-mono">
                    {repairInfo?.method === 'lossless' ? 'Lossless Vector Re-serialization' : 'Stream Salvage Extraction'}
                  </span>.
                </p>
              </div>

              <a
                href={downloadUrl}
                download={`repaired_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Repaired PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};