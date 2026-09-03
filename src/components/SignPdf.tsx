import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Download, Loader2, CheckCircle2, X, PenTool, RotateCcw } from 'lucide-react';
import { signPDF, getPDFPageCount } from '../utils/pdfEngine';

interface SignPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const SignPdf: React.FC<SignPdfProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState(1);
  const [selectedPage, setSelectedPage] = useState(1);
  const [hasSignature, setHasSignature] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (file) {
      getPDFPageCount(file).then((count) => {
        setTotalPages(count);
        setSelectedPage(count); // Default to last page for signatures
      }).catch(() => {
        setError('Failed to read PDF pages.');
      });
      setDownloadUrl(null);
      setError(null);
    } else {
      setTotalPages(1);
      setSelectedPage(1);
      setDownloadUrl(null);
    }
  }, [file]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawing.current = true;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
    setDownloadUrl(null);
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setDownloadUrl(null);
  };

  const handleApplySignature = async () => {
    if (!file || !hasSignature || !canvasRef.current) return;
    setIsProcessing(true);
    setError(null);

    try {
      const signatureDataUrl = canvasRef.current.toDataURL('image/png');
      const pageIndex = Math.max(0, Math.min(selectedPage - 1, totalPages - 1));
      const outputBytes = await signPDF(file, signatureDataUrl, pageIndex);
      const blob = new Blob([outputBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      console.error(err);
      setError('Failed to sign the document.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearFile = () => {
    onFileChange(null);
    clearCanvas();
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
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to sign</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]?.type === 'application/pdf') {
                onFileChange(e.target.files[0]);
              }
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
                <p className="text-xs text-zinc-500">
                  {Math.round(file.size / 1024)} KB • {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                </p>
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

          {/* Page Target Selector */}
          <div className="flex items-center justify-between gap-4 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Place signature on page:</span>
            <select
              value={selectedPage}
              onChange={(e) => {
                setSelectedPage(Number(e.target.value));
                setDownloadUrl(null);
              }}
              className="bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  Page {num} {num === totalPages ? '(Last)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Signature Canvas Pad */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">Draw your signature</label>
              <button
                type="button"
                onClick={clearCanvas}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                <RotateCcw className="w-3 h-3" />
                Clear
              </button>
            </div>
            <div className="bg-white rounded-xl overflow-hidden border border-zinc-700 flex justify-center">
              <canvas
                ref={canvasRef}
                width={460}
                height={130}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-[130px] touch-none cursor-crosshair"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleApplySignature}
              disabled={isProcessing || !hasSignature}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing document...</span>
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4" />
                  <span>Sign & Stamp PDF</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Document signed successfully!</span>
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace('.pdf', '')}_signed.pdf`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Signed PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};