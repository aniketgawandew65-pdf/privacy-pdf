import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Download, Loader2, CheckCircle2, X, PenTool, RotateCcw, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
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

  // Password-protection states
  const [isProtected, setIsProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (!file) {
      setTotalPages(1);
      setSelectedPage(1);
      setDownloadUrl(null);
      setIsProtected(false);
      setPassword('');
      setError(null);
      return;
    }

    let isMounted = true;
    setDownloadUrl(null);
    setError(null);
    setPassword('');

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        // Test if document requires a password to open
        try {
          const loadingTask = pdfjsLib.getDocument({ data: uint8.slice() });
          const doc = await loadingTask.promise;
          if (isMounted) {
            setIsProtected(false);
            setTotalPages(doc.numPages);
            setSelectedPage(doc.numPages);
          }
        } catch (err: any) {
          if (
            err?.name === 'PasswordException' ||
            err?.message?.includes('password') ||
            err?.message?.includes('need password')
          ) {
            if (isMounted) {
              setIsProtected(true);
              setTotalPages(1);
              setSelectedPage(1);
            }
          } else {
            const count = await getPDFPageCount(file);
            if (isMounted) {
              setIsProtected(false);
              setTotalPages(count);
              setSelectedPage(count);
            }
          }
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setError('Failed to read PDF pages.');
      }
    })();

    return () => {
      isMounted = false;
    };
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

    if (isProtected && !password.trim()) {
      setError('Please enter the password for this protected PDF.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const signatureDataUrl = canvasRef.current.toDataURL('image/png');
      const pageIndex = Math.max(0, Math.min(selectedPage - 1, totalPages - 1));
      const outputBytes = await signPDF(
        file,
        signatureDataUrl,
        pageIndex,
        isProtected ? password.trim() : undefined
      );

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'INCORRECT_PASSWORD') {
        setError('Incorrect password. Please enter the valid document password.');
      } else {
        setError('Failed to sign the document.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearFile = () => {
    onFileChange(null);
    clearCanvas();
    setDownloadUrl(null);
    setError(null);
    setPassword('');
    setIsProtected(false);
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
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your device</p>
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
                  {Math.round(file.size / 1024)} KB {totalPages > 1 ? `• ${totalPages} pages` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={handleClearFile}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Password Input for Protected PDFs */}
          {isProtected && (
            <div className="p-3.5 bg-zinc-950/70 rounded-xl border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
                <Lock className="w-3.5 h-3.5" />
                <span>This PDF is password-protected</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                    setDownloadUrl(null);
                  }}
                  placeholder="Enter password to unlock and sign"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 pr-9 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Page Target Selector */}
          <div className="flex items-center justify-between gap-4 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Place signature on page:</span>
            <select
              value={selectedPage}
              onChange={(e) => {
                setSelectedPage(Number(e.target.value));
                setDownloadUrl(null);
              }}
              className="bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  Page {num} {num === totalPages && totalPages > 1 ? '(Last)' : ''}
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
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Clear
              </button>
            </div>
            <div className="bg-white rounded-xl overflow-hidden border border-zinc-700 flex justify-center shadow-inner">
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
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleApplySignature}
              disabled={isProcessing || !hasSignature || (isProtected && !password.trim())}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing &amp; Decrypting Document...</span>
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4" />
                  <span>Sign &amp; Stamp PDF</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Document signed successfully! {isProtected && '(Password protection removed)'}</span>
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace('.pdf', '')}_signed.pdf`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
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