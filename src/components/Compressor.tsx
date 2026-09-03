import React, { useState, useRef } from 'react';
import { Upload, Sliders, Download, Loader2, CheckCircle2, FileText } from 'lucide-react';
import { compressPDFToTarget, type CompressionProgress } from '../utils/pdfEngine';

export const Compressor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [targetSizeKB, setTargetSizeKB] = useState<number>(200);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<CompressionProgress | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const originalSizeKB = file ? Math.round(file.size / 1024) : 0;

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') return;
    setFile(selectedFile);
    setDownloadUrl(null);
    setCompressedSize(null);
    const initialTarget = Math.max(50, Math.round((selectedFile.size / 1024) * 0.5));
    setTargetSizeKB(initialTarget);
  };

  const handleCompress = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress({ currentPage: 0, totalPages: 0, stage: 'Starting local compression...' });

    try {
      const outputBytes = await compressPDFToTarget(
        file,
        targetSizeKB,
        (p: CompressionProgress) => setProgress(p)
      );
      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      setCompressedSize(Math.round(blob.size / 1024));
      setDownloadUrl(url);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-10 text-center bg-zinc-950/40"
        >
          <Upload className="w-10 h-10 text-emerald-400 mx-auto mb-3 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF file here or click to browse</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
        </div>
      ) : (
        <div className="space-y-6 text-left">
          {/* File Meta */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{originalSizeKB} KB Original</p>
              </div>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setDownloadUrl(null);
              }}
              className="text-xs text-zinc-400 hover:text-red-400 transition-colors ml-3"
            >
              Remove
            </button>
          </div>

          {/* Compress-to-Target Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-zinc-300 font-medium">
                <Sliders className="w-4 h-4 text-emerald-400" /> Target File Size
              </span>
              <span className="font-mono text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                {targetSizeKB} KB
              </span>
            </div>
            <input
              type="range"
              min={30}
              max={originalSizeKB}
              value={targetSizeKB}
              disabled={isProcessing}
              onChange={(e) => setTargetSizeKB(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
            />
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Max compression (~30 KB)</span>
              <span>Original ({originalSizeKB} KB)</span>
            </div>
          </div>

          {/* Action Button */}
          {!downloadUrl ? (
            <button
              onClick={handleCompress}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progress?.stage || 'Compressing locally...'}</span>
                </>
              ) : (
                <span>Compress to {targetSizeKB} KB</span>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Ready: {compressedSize} KB
                </span>
                <span className="text-zinc-400">
                  {originalSizeKB > 0 && compressedSize
                    ? `Saved ${Math.round(((originalSizeKB - compressedSize) / originalSizeKB) * 100)}%`
                    : ''}
                </span>
              </div>
              <a
                href={downloadUrl}
                download={`compressed_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Download Compressed PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};