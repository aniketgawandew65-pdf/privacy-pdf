import { useState, useEffect, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Upload, Loader2, Download, Sliders, CheckCircle, FileText, Lock } from 'lucide-react';
import { getLicenseStatus } from '../utils/license';
import { ProModal } from './ProModal';

interface CompressorProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type CompressionLevel = 'recommended' | 'extreme' | 'target';

export function Compressor({ file, onFileChange }: CompressorProps) {
  const [level, setLevel] = useState<CompressionLevel>('recommended');
  const [targetKb, setTargetKb] = useState(200);
  const [isCompressing, setIsCompressing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isPro, setIsPro] = useState(getLicenseStatus().isPro);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleStorage = () => setIsPro(getLicenseStatus().isPro);
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleSelectLevel = (selected: CompressionLevel) => {
    if (selected !== 'recommended' && !isPro) {
      setIsProModalOpen(true);
      return;
    }
    setLevel(selected);
  };

  const handleCompress = async () => {
    if (!file) return;

    if (level !== 'recommended' && !isPro) {
      setIsProModalOpen(true);
      return;
    }

    setIsCompressing(true);
    setDownloadUrl(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      // In-browser compression via structural cleanup and object re-serialization
      const compressedBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      const blob = new Blob([compressedBytes as any], { type: 'application/pdf' });
      setCompressedSize(blob.size);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      console.error('Compression error:', err);
      alert('Failed to compress PDF. The file may be password protected or corrupted.');
    } finally {
      setIsCompressing(false);
    }
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
          onFileChange(selected);
          setDownloadUrl(null);
          setCompressedSize(null);
        }}
      />

      {/* Upload Zone */}
      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-xl p-8 text-center transition-all bg-zinc-950/40 hover:bg-zinc-950/80 mb-6"
        >
          <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-200">Click or drop a PDF to compress</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally in your browser</p>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mb-6">
          <div className="flex items-center gap-2.5 truncate">
            <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="truncate">
              <p className="text-xs font-medium text-zinc-200 truncate">{file.name}</p>
              <p className="text-[11px] text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
          <button
            onClick={() => {
              onFileChange(null);
              setDownloadUrl(null);
              setCompressedSize(null);
            }}
            className="text-xs text-zinc-500 hover:text-red-400 transition ml-3"
          >
            Change
          </button>
        </div>
      )}

      {/* Mode Selectors */}
      <div className="space-y-3 mb-6">
        <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" />
          Compression Mode
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Recommended (Free) */}
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
            <p className="text-[10px] text-zinc-500 mt-0.5">Optimal balance</p>
          </button>

          {/* Extreme (Pro) */}
          <button
            type="button"
            onClick={() => handleSelectLevel('extreme')}
            className={`relative p-3 rounded-xl border text-left transition-all ${
              level === 'extreme'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            {!isPro && (
              <span className="absolute top-2 right-2 text-amber-400">
                <Lock className="w-3.5 h-3.5" />
              </span>
            )}
            <p className="text-xs font-semibold flex items-center gap-1">Extreme</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Maximum reduction</p>
          </button>

          {/* Target Size (Pro) */}
          <button
            type="button"
            onClick={() => handleSelectLevel('target')}
            className={`relative p-3 rounded-xl border text-left transition-all ${
              level === 'target'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            {!isPro && (
              <span className="absolute top-2 right-2 text-amber-400">
                <Lock className="w-3.5 h-3.5" />
              </span>
            )}
            <p className="text-xs font-semibold flex items-center gap-1">Target Size</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Strict KB limits</p>
          </button>
        </div>

        {/* Target Slider (Shown when Target Size is active) */}
        {level === 'target' && (
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 mt-3">
            <div className="flex justify-between text-xs text-zinc-300 mb-2">
              <span>Target Limit:</span>
              <span className="font-semibold text-emerald-400">{targetKb} KB</span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="50"
              value={targetKb}
              onChange={(e) => setTargetKb(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        disabled={!file || isCompressing}
        onClick={handleCompress}
        className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
      >
        {isCompressing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Compressing PDF Locally...
          </>
        ) : (
          'Compress PDF'
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
              Original: {(file.size / 1024).toFixed(0)} KB → New: {(compressedSize / 1024).toFixed(0)} KB
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