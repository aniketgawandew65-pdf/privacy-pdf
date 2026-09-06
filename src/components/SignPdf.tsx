import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  X,
  PenTool,
  RotateCcw,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Move,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { signPDF, type SignaturePlacement, getPDFPageCount } from '../utils/pdfEngine';

interface SignPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

interface PagePlacementsMap {
  [pageNumber: number]: {
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
  } | null;
}

export const SignPdf: React.FC<SignPdfProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Per-page signature coordinate map
  const [placements, setPlacements] = useState<PagePlacementsMap>({});
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Encryption states
  const [isProtected, setIsProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Rendering & processing states
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Canvas refs
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<any>(null);

  // Drawing pad tracking
  const isPadDrawing = useRef(false);

  // Drag & resize tracking for visual placement
  const dragInfo = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  // Check file protection & page count
  useEffect(() => {
    if (!file) {
      setTotalPages(1);
      setCurrentPage(1);
      setPlacements({});
      setSignatureDataUrl(null);
      setHasDrawnSignature(false);
      setDownloadUrl(null);
      setIsProtected(false);
      setPassword('');
      setError(null);
      pdfDocRef.current = null;
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

        try {
          const loadingTask = pdfjsLib.getDocument({ data: uint8.slice() });
          const doc = await loadingTask.promise;
          if (isMounted) {
            pdfDocRef.current = doc;
            setIsProtected(false);
            setTotalPages(doc.numPages);
            setCurrentPage(doc.numPages); // Default to last page
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
              setCurrentPage(1);
            }
          } else {
            const count = await getPDFPageCount(file);
            if (isMounted) {
              setIsProtected(false);
              setTotalPages(count);
              setCurrentPage(count);
            }
          }
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setError('Failed to inspect PDF.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  // Render document page to background canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !pageCanvasRef.current) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const dpr = Math.max(window.devicePixelRatio || 1, 2.0);
      const displayWidth = 520;
      const scale = (displayWidth / unscaledViewport.width) * dpr;
      const viewport = page.getViewport({ scale });

      const canvas = pageCanvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({
          canvasContext: ctx as any,
          viewport,
          annotationMode: (pdfjsLib as any).AnnotationMode?.ENABLE ?? 2,
        } as any).promise;
      }
    } catch (err) {
      console.error('Page render error:', err);
    } finally {
      setIsLoadingPage(false);
    }
  }, [currentPage]);

  useEffect(() => {
    if (pdfDocRef.current && totalPages > 0) {
      renderCurrentPage();
    }
  }, [currentPage, totalPages, renderCurrentPage]);

  // Signature Pad Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isPadDrawing.current = true;
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
    if (!isPadDrawing.current) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasDrawnSignature(true);
    setDownloadUrl(null);
  };

  const stopDrawing = () => {
    if (!isPadDrawing.current) return;
    isPadDrawing.current = false;
    const canvas = drawCanvasRef.current;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      setSignatureDataUrl(url);

      // Initialize default placement on current page if not already set
      setPlacements((prev) => {
        if (prev[currentPage]) return prev;
        return {
          ...prev,
          [currentPage]: {
            xPercent: 0.65,
            yPercent: 0.82,
            widthPercent: 0.26,
            heightPercent: 0.10,
          },
        };
      });
    }
  };

  const clearCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSignature(false);
    setSignatureDataUrl(null);
    setPlacements({});
    setDownloadUrl(null);
  };

  // Convert mouse event to normalized [0, 1] relative to overlay
  const getNormalizedCoords = useCallback((clientX: number, clientY: number) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  // Global mouse handlers for moving & resizing the placed signature
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragInfo.current;
      if (!state) return;

      const current = getNormalizedCoords(e.clientX, e.clientY);
      const dx = current.x - state.startX;
      const dy = current.y - state.startY;

      if (state.mode === 'move') {
        const nextX = Math.max(0, Math.min(1 - state.initialW, state.initialX + dx));
        const nextY = Math.max(0, Math.min(1 - state.initialH, state.initialY + dy));

        setPlacements((prev) => ({
          ...prev,
          [currentPage]: {
            ...prev[currentPage]!,
            xPercent: nextX,
            yPercent: nextY,
          },
        }));
      } else if (state.mode === 'resize') {
        const nextW = Math.max(0.08, Math.min(1 - state.initialX, state.initialW + dx));
        const nextH = Math.max(0.03, Math.min(1 - state.initialY, state.initialH + dy));

        setPlacements((prev) => ({
          ...prev,
          [currentPage]: {
            ...prev[currentPage]!,
            widthPercent: nextW,
            heightPercent: nextH,
          },
        }));
      }
    };

    const handleMouseUp = () => {
      dragInfo.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [currentPage, getNormalizedCoords]);

  // Start moving signature box
  const handleSignatureBoxMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentBox = placements[currentPage];
    if (!currentBox) return;

    const coords = getNormalizedCoords(e.clientX, e.clientY);
    dragInfo.current = {
      mode: 'move',
      startX: coords.x,
      startY: coords.y,
      initialX: currentBox.xPercent,
      initialY: currentBox.yPercent,
      initialW: currentBox.widthPercent,
      initialH: currentBox.heightPercent,
    };
  };

  // Start resizing signature box from bottom-right handle
  const handleResizeHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentBox = placements[currentPage];
    if (!currentBox) return;

    const coords = getNormalizedCoords(e.clientX, e.clientY);
    dragInfo.current = {
      mode: 'resize',
      startX: coords.x,
      startY: coords.y,
      initialX: currentBox.xPercent,
      initialY: currentBox.yPercent,
      initialW: currentBox.widthPercent,
      initialH: currentBox.heightPercent,
    };
  };

  // Copy signature position across all pages
  const handleCopyToAllPages = () => {
    const currentBox = placements[currentPage];
    if (!currentBox) return;

    const newMap: PagePlacementsMap = {};
    for (let i = 1; i <= totalPages; i++) {
      newMap[i] = { ...currentBox };
    }
    setPlacements(newMap);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  // Toggle signature on / off for current page
  const toggleCurrentPageSignature = () => {
    setPlacements((prev) => {
      if (prev[currentPage]) {
        return { ...prev, [currentPage]: null };
      }
      return {
        ...prev,
        [currentPage]: {
          xPercent: 0.65,
          yPercent: 0.82,
          widthPercent: 0.26,
          heightPercent: 0.10,
        },
      };
    });
  };

  const handleApplySignature = async () => {
    if (!file || !signatureDataUrl) return;

    if (isProtected && !password.trim()) {
      setError('Please enter the password for this protected PDF.');
      return;
    }

    const payload: SignaturePlacement[] = [];
    Object.entries(placements).forEach(([pageStr, box]) => {
      if (box) {
        payload.push({
          pageIndex: parseInt(pageStr, 10) - 1,
          xPercent: box.xPercent,
          yPercent: box.yPercent,
          widthPercent: box.widthPercent,
          heightPercent: box.heightPercent,
        });
      }
    });

    if (payload.length === 0) {
      setError('Please place your signature on at least one page.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const outputBytes = await signPDF(
        file,
        signatureDataUrl,
        payload,
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
        setError('Failed to sign document.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const currentBox = placements[currentPage];
  const totalSignedCount = Object.values(placements).filter(Boolean).length;

  return (
    <div className="w-full max-w-2xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
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
          <p className="text-xs text-zinc-500 mt-1">Multi-page placement • Visual drag &amp; drop • 100% offline</p>
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
                  {totalSignedCount > 0 && ` • ${totalSignedCount} signed`}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                onFileChange(null);
                clearCanvas();
              }}
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

          {/* Signature Draw Pad */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-emerald-400" />
                <span>1. Draw your signature</span>
              </label>
              {hasDrawnSignature && (
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Redraw
                </button>
              )}
            </div>
            <div className="bg-white rounded-xl overflow-hidden border border-zinc-700 flex justify-center shadow-inner">
              <canvas
                ref={drawCanvasRef}
                width={460}
                height={110}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-[110px] touch-none cursor-crosshair"
              />
            </div>
          </div>

          {/* Interactive Document Placer */}
          {signatureDataUrl && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. Position &amp; size signature on page</span>
                </label>

                {/* Copy To All Button */}
                {totalPages > 1 && currentBox && (
                  <button
                    type="button"
                    onClick={handleCopyToAllPages}
                    className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    {copiedNotification ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied to all {totalPages} pages!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy position to all pages</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Page Navigator */}
              <div className="flex items-center justify-between text-xs text-zinc-300 px-1">
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={toggleCurrentPageSignature}
                  className={`text-[11px] px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                    currentBox
                      ? 'bg-zinc-800 text-zinc-300 hover:text-red-400'
                      : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                  }`}
                >
                  {currentBox ? 'Remove from this page' : '+ Add to this page'}
                </button>
              </div>

              {/* Document Surface & Drag Overlay */}
              <div className="relative bg-zinc-950/80 rounded-xl border border-zinc-800 flex items-center justify-center p-3 overflow-auto min-h-[380px] max-h-[520px]">
                {isLoadingPage && (
                  <div className="absolute inset-0 bg-zinc-950/60 z-30 flex items-center justify-center backdrop-blur-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  </div>
                )}

                <div className="relative inline-block leading-none shadow-2xl bg-white rounded-xs">
                  <canvas
                    ref={pageCanvasRef}
                    className="block rounded-xs max-h-[480px] w-auto h-auto object-contain pointer-events-none"
                  />

                  <div ref={overlayRef} className="absolute inset-0 z-10">
                    {currentBox && (
                      <div
                        onMouseDown={handleSignatureBoxMouseDown}
                        className="absolute ring-2 ring-emerald-500 bg-emerald-500/10 rounded-xs cursor-move flex items-center justify-center shadow-lg select-none group"
                        style={{
                          left: `${currentBox.xPercent * 100}%`,
                          top: `${currentBox.yPercent * 100}%`,
                          width: `${currentBox.widthPercent * 100}%`,
                          height: `${currentBox.heightPercent * 100}%`,
                        }}
                      >
                        <img
                          src={signatureDataUrl}
                          alt="Signature Preview"
                          className="w-full h-full object-contain pointer-events-none"
                        />

                        {/* Drag indicator in top-left */}
                        <div className="absolute top-0.5 left-0.5 p-0.5 bg-emerald-600 rounded-xs text-white opacity-0 group-hover:opacity-100 transition pointer-events-none">
                          <Move className="w-2.5 h-2.5" />
                        </div>

                        {/* Bottom-Right Resize Handle */}
                        <div
                          onMouseDown={handleResizeHandleMouseDown}
                          className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-emerald-500 rounded-xs cursor-nwse-resize shadow-md z-20 hover:scale-125 transition-transform"
                          title="Drag to resize signature"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 text-center">
                Click &amp; hold signature to move anywhere • Drag bottom-right corner to resize.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleApplySignature}
              disabled={isProcessing || !hasDrawnSignature || (isProtected && !password.trim())}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed text-xs"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Applying Signatures...</span>
                </>
              ) : (
                <>
                  <PenTool className="w-4 h-4" />
                  <span>
                    Sign PDF {totalSignedCount > 1 ? `(${totalSignedCount} Pages)` : ''}
                  </span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Document signed successfully! {isProtected && '(Password lock removed)'}
                </span>
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace('.pdf', '')}_signed.pdf`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer text-xs"
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