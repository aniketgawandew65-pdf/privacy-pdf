import React, { useState, useRef } from 'react';
import { Upload, RotateCw, Download, Loader2, CheckCircle2, FileText, X, AlertCircle } from 'lucide-react';
import { rotatePDF } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface RotatePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const RotatePdf: React.FC<RotatePdfProps> = ({ file, onFileChange }) => {
  const [angle, setAngle] = useState<number>(90);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const handleRotate = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await rotatePDF(file, angle);
      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err) {
      console.error('Rotation error:', err);
      setErrorMessage('Failed to rotate PDF. The file may be damaged, corrupted, or password-protected.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearFile = () => {
    onFileChange(null);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF here to rotate pages"
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
              setErrorMessage(null);
              revokeDownloadUrl();
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to rotate pages</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                setErrorMessage(null);
                revokeDownloadUrl();
                onFileChange(selected);
              }
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-6 text-left">
          {/* File Card with Clear */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
              </div>
            </div>
            <button
              onClick={handleClearFile}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Angle Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Choose Clockwise Rotation</label>
            <div className="grid grid-cols-3 gap-2">
              {[90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => {
                    setAngle(deg);
                    revokeDownloadUrl();
                    setErrorMessage(null);
                  }}
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    angle === deg
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  +{deg}°
                </button>
              ))}
            </div>
          </div>

          {!downloadUrl ? (
            <button
              onClick={handleRotate}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rotating locally...</span>
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4" />
                  <span>Rotate PDF +{angle}°</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Rotated {angle}° Successfully
              </div>
              <a
                href={downloadUrl}
                download={`rotated_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Download Rotated PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};