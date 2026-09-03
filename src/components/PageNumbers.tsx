import React, { useState, useRef } from 'react';
import { Upload, FileText, Download, Loader2, CheckCircle2, X, Hash } from 'lucide-react';
import { addPageNumbersToPDF } from '../utils/pdfEngine';

interface PageNumbersProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const PageNumbers: React.FC<PageNumbersProps> = ({ file, onFileChange }) => {
  const [position, setPosition] = useState<'bottom-center' | 'bottom-right'>('bottom-center');
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleApplyNumbers = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    try {
      const outputBytes = await addPageNumbersToPDF(file, position);
      const blob = new Blob([outputBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      console.error(err);
      setError('Failed to add page numbers.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setDownloadUrl(null);
    setError(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]?.type === 'application/pdf') {
              onFileChange(e.dataTransfer.files[0]);
              setDownloadUrl(null);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to add page numbers</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]?.type === 'application/pdf') {
                onFileChange(e.target.files[0]);
                setDownloadUrl(null);
              }
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

          {/* Position Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Numbering Position</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPosition('bottom-center');
                  setDownloadUrl(null);
                }}
                className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                  position === 'bottom-center'
                    ? 'bg-zinc-800 border-emerald-500/50 text-emerald-400'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Bottom Center
              </button>
              <button
                type="button"
                onClick={() => {
                  setPosition('bottom-right');
                  setDownloadUrl(null);
                }}
                className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                  position === 'bottom-right'
                    ? 'bg-zinc-800 border-emerald-500/50 text-emerald-400'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Bottom Right
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleApplyNumbers}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Numbering pages...</span>
                </>
              ) : (
                <>
                  <Hash className="w-4 h-4" />
                  <span>Add Page Numbers</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Page numbers applied successfully!</span>
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace('.pdf', '')}_numbered.pdf`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Numbered PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};