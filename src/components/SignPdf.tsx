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
  Unlock,
  Eye,
  EyeOff,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Move,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { signPDF, type SignaturePlacement, getPDFPageCount } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

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

// Auto-trims transparent canvas borders so the signature lines stay bold and sharp
function getTrimmedSignatureDataUrl(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hasInk = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasInk = true;
      }
    }
  }

  if (!hasInk) return canvas.toDataURL('image/png');

  const padding = 8;
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropW = Math.min(width - cropX, maxX - minX + padding * 2);
  const cropH = Math.min(height - cropY, maxY - minY + padding * 2);

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = cropW;
  trimmedCanvas.height = cropH;
  const tCtx = trimmedCanvas.getContext('2d');
  if (!tCtx) return canvas.toDataURL('image/png');

  tCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return trimmedCanvas.toDataURL('image/png');
}

export const SignPdf: React.FC<SignPdfProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Zoom and viewport scaling
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({
    width: 540,
    height: 760,
  });

  // Placements and UI states
  const [placements, setPlacements] = useState<PagePlacementsMap>({});
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Password-protection states
  const [isProtected, setIsProtected] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

  // Processing & feedback states
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // DOM Refs
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<any>(null);

  // Drawing state
  const isPadDrawing = useRef(false);

  // Drag & resize tracking
  const dragInfo = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Load and inspect PDF file
  useEffect(() => {
    if (!file) {
      setTotalPages(1);
      setCurrentPage(1);
      setPlacements({});
      setSignatureDataUrl(null);
      setHasDrawnSignature(false);
      setIsProtected(false);
      setIsUnlocked(false);
      setPassword('');
      setErrorMessage(null);
      setSuccessMessage(null);
      setZoomLevel(1.0);
      revokeDownloadUrl();
      pdfDocRef.current = null;
      return;
    }

    let isMounted = true;
    revokeDownloadUrl();
    setErrorMessage(null);
    setSuccessMessage(null);
    setPassword('');
    setIsUnlocked(false);

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
            setIsUnlocked(true);
            setTotalPages(doc.numPages);
            setCurrentPage(doc.numPages);
          }
        } catch (err: any) {
          if (
            err?.name === 'PasswordException' ||
            err?.message?.includes('password') ||
            err?.message?.includes('need password')
          ) {
            if (isMounted) {
              setIsProtected(true);
              setIsUnlocked(false);
              setTotalPages(1);
              setCurrentPage(1);
            }
          } else {
            const count = await getPDFPageCount(file);
            if (isMounted) {
              setIsProtected(false);
              setIsUnlocked(true);
              setTotalPages(count);
              setCurrentPage(count);
            }
          }
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setErrorMessage('Failed to open PDF document.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file, revokeDownloadUrl]);

  // Authenticate and unlock protected PDF for live preview
  const handleVerifyAndUnlock = async () => {
    if (!file || !password.trim()) {
      setErrorMessage('Please enter the document password.');
      return;
    }

    setIsVerifyingPassword(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      const loadingTask = pdfjsLib.getDocument({
        data: uint8.slice(),
        password: password.trim(),
      });

      const doc = await loadingTask.promise;
      pdfDocRef.current = doc;
      setIsUnlocked(true);
      setTotalPages(doc.numPages);
      setCurrentPage(doc.numPages);
      setSuccessMessage('Password verified! Document preview unlocked.');
    } catch (err: any) {
      setIsUnlocked(false);
      setErrorMessage('Incorrect password. Please verify and try again.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  // Render current document page with high-res zoom scaling
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !pageCanvasRef.current || !isUnlocked) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const baseWidth = 540;
      const aspectRatio = unscaledViewport.height / unscaledViewport.width;
      const baseHeight = Math.round(baseWidth * aspectRatio);
      setPageDimensions({ width: baseWidth, height: baseHeight });

      const dpr = Math.max(window.devicePixelRatio || 1, 2.0);
      const renderScale = (baseWidth / unscaledViewport.width) * dpr * zoomLevel;
      const viewport = page.getViewport({ scale: renderScale });

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
  }, [currentPage, zoomLevel, isUnlocked]);

  useEffect(() => {
    if (pdfDocRef.current && totalPages > 0 && isUnlocked) {
      renderCurrentPage();
    }
  }, [currentPage, totalPages, isUnlocked, zoomLevel, renderCurrentPage]);

  // High-precision signature drawing mechanics
  const getPadCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isPadDrawing.current = true;
    const pt = getPadCoordinates(e);

    ctx.lineWidth = 3.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';

    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isPadDrawing.current) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getPadCoordinates(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    setHasDrawnSignature(true);
    revokeDownloadUrl();
  };

  const stopDrawing = () => {
    if (!isPadDrawing.current) return;
    isPadDrawing.current = false;

    const canvas = drawCanvasRef.current;
    if (canvas) {
      const trimmedUrl = getTrimmedSignatureDataUrl(canvas);
      setSignatureDataUrl(trimmedUrl);

      setPlacements((prev) => {
        if (prev[currentPage]) return prev;
        return {
          ...prev,
          [currentPage]: {
            xPercent: 0.65,
            yPercent: 0.80,
            widthPercent: 0.22,
            heightPercent: 0.08,
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
    revokeDownloadUrl();
  };

  // Convert mouse event to normalized [0, 1] relative to overlay
  const getNormalizedCoords = useCallback((clientX: number, clientY: number) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  // Moving and resizing placed signature
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
        const nextW = Math.max(0.06, Math.min(1 - state.initialX, state.initialW + dx));
        const nextH = Math.max(0.02, Math.min(1 - state.initialY, state.initialH + dy));

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

  const handleAddToThisPage = () => {
    setPlacements((prev) => ({
      ...prev,
      [currentPage]: {
        xPercent: 0.65,
        yPercent: 0.80,
        widthPercent: 0.22,
        heightPercent: 0.08,
      },
    }));
  };

  const handleRemoveFromThisPage = () => {
    setPlacements((prev) => ({
      ...prev,
      [currentPage]: null,
    }));
  };

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

  const handleApplySignature = async () => {
    if (!file || !signatureDataUrl) return;

    if (isProtected && !isUnlocked) {
      setErrorMessage('Please unlock the document with its password first.');
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
      setErrorMessage('Please place your signature on at least one page.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await signPDF(
        file,
        signatureDataUrl,
        payload,
        isProtected ? password.trim() : undefined
      );

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'INCORRECT_PASSWORD') {
        setErrorMessage('Incorrect password. Please verify the document password.');
      } else {
        setErrorMessage('Failed to sign document.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const currentBox = placements[currentPage];
  const totalSignedCount = Object.values(placements).filter(Boolean).length;
  const displayWidth = Math.round(pageDimensions.width * zoomLevel);
  const displayHeight = Math.round(pageDimensions.height * zoomLevel);

  return (
    <div className="w-full max-w-3xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
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
        <div className="space-y-5 text-left select-none">
          {/* File Card */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {Math.round(file.size / 1024)} KB {totalPages > 1 ? `• ${totalPages} pages` : ''}
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

          {/* Password Authentication & Preview Unlock Banner */}
          {isProtected && (
            <div className={`p-4 rounded-xl border transition-all space-y-3 ${
              isUnlocked ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-zinc-950/70 border-amber-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium">
                  {isUnlocked ? (
                    <>
                      <Unlock className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Document unlocked for visual signing</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-300">Password-Protected Document</span>
                    </>
                  )}
                </div>
                {isUnlocked && (
                  <span className="text-[11px] text-emerald-400 font-mono">Password active</span>
                )}
              </div>

              {!isUnlocked && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorMessage(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleVerifyAndUnlock();
                        }
                      }}
                      placeholder="Enter password to view and sign"
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
                  <button
                    type="button"
                    onClick={handleVerifyAndUnlock}
                    disabled={isVerifyingPassword || !password.trim()}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {isVerifyingPassword ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                    <span>Unlock Preview</span>
                  </button>
                </div>
              )}
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
                width={800}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-[120px] touch-none cursor-crosshair"
              />
            </div>
          </div>

          {/* Interactive Document Placer */}
          {signatureDataUrl && isUnlocked && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. Position &amp; size signature on page</span>
                </label>

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

              {/* Page Navigation & Explicit Add/Remove Button */}
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

                <div className="flex items-center gap-2">
                  {!currentBox ? (
                    <button
                      type="button"
                      onClick={handleAddToThisPage}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition cursor-pointer shadow-md shadow-emerald-500/20"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Add to this page</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded font-medium">
                        <Check className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
                        <span>Placed</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveFromThisPage}
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-red-400 bg-zinc-800/80 hover:bg-zinc-800 px-2 py-0.5 rounded transition cursor-pointer"
                        title="Remove signature from this page"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Surface & Zoom Viewport */}
              <div className="relative bg-zinc-950/80 rounded-xl border border-zinc-800 overflow-hidden shadow-inner">
                {isLoadingPage && (
                  <div className="absolute inset-0 bg-zinc-950/60 z-30 flex items-center justify-center backdrop-blur-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  </div>
                )}

                {/* 2D Scrollable Document Canvas Area */}
                <div className="overflow-auto min-h-[420px] max-h-[620px] p-6 sm:p-10 text-center">
                  <div
                    style={{
                      width: `${displayWidth}px`,
                      height: `${displayHeight}px`,
                    }}
                    className="relative inline-block text-left shadow-2xl bg-white rounded-xs align-middle"
                  >
                    <canvas
                      ref={pageCanvasRef}
                      style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
                      className="block rounded-xs pointer-events-none"
                    />

                    <div
                      ref={overlayRef}
                      style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
                      className="absolute inset-0 z-10"
                    >
                      {currentBox && (
                        <div
                          onMouseDown={handleSignatureBoxMouseDown}
                          className="absolute ring-2 ring-emerald-500 bg-emerald-500/10 rounded-xs cursor-move flex items-center justify-center shadow-lg select-none group z-20"
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

                          <div className="absolute top-0.5 left-0.5 p-0.5 bg-emerald-600 rounded-xs text-white opacity-0 group-hover:opacity-100 transition pointer-events-none">
                            <Move className="w-2.5 h-2.5" />
                          </div>

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

                {/* Floating Zoom Bar Pinned to Bottom-Right */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-700/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg shadow-2xl z-30">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(0.75, parseFloat((z - 0.25).toFixed(2))))}
                    disabled={zoomLevel <= 0.75}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800 transition cursor-pointer"
                    title="Zoom Out (-)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(1.0)}
                    className="text-[11px] font-mono font-medium text-zinc-300 hover:text-emerald-400 min-w-[42px] text-center transition cursor-pointer px-1 py-0.5 rounded hover:bg-zinc-800/60"
                    title="Reset to 100%"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(2.5, parseFloat((z + 0.25).toFixed(2))))}
                    disabled={zoomLevel >= 2.5}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800 transition cursor-pointer"
                    title="Zoom In (+)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 text-center">
                Click &amp; hold signature to move anywhere • Drag bottom-right corner to resize.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/40 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleApplySignature}
              disabled={isProcessing || !hasDrawnSignature || (isProtected && !isUnlocked)}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed text-xs"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing &amp; Removing Password Lock...</span>
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
                  Document signed successfully! {isProtected && '(Password lock permanently removed)'}
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