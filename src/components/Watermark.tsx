import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  X,
  Stamp,
  Type,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { addWatermarkToPDF, type WatermarkOptions } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface WatermarkProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

const PRESET_COLORS = [
  { label: 'Slate Gray', hex: '#64748b' },
  { label: 'Crimson Red', hex: '#dc2626' },
  { label: 'Corporate Blue', hex: '#2563eb' },
  { label: 'Emerald Green', hex: '#059669' },
  { label: 'Amber Orange', hex: '#d97706' },
  { label: 'Pitch Black', hex: '#000000' },
];

export const Watermark: React.FC<WatermarkProps> = ({ file, onFileChange }) => {
  const [watermarkType, setWatermarkType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);

  // Typography & Styling controls
  const [fontFamily, setFontFamily] = useState<'Helvetica' | 'TimesRoman' | 'Courier'>('Helvetica');
  const [fontSize, setFontSize] = useState<number>(48);
  const [colorHex, setColorHex] = useState<string>('#dc2626');
  const [opacity, setOpacity] = useState<number>(0.25);
  const [angle, setAngle] = useState<number>(-45);
  const [letterSpacing, setLetterSpacing] = useState<number>(2);
  const [position, setPosition] = useState<'center' | 'top' | 'bottom'>('center');

  // Preview & Processing state
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<any>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Load PDF for live preview
  useEffect(() => {
    if (!file) {
      setTotalPages(1);
      setCurrentPage(1);
      revokeDownloadUrl();
      setError(null);
      pdfDocRef.current = null;
      return;
    }

    let isMounted = true;
    setIsLoadingPage(true);
    revokeDownloadUrl();
    setError(null);

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer).slice() }).promise;
        if (!isMounted) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error('Error loading PDF for preview:', err);
        if (isMounted) setError('Failed to open PDF document.');
      } finally {
        if (isMounted) setIsLoadingPage(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file, revokeDownloadUrl]);

  // Render background PDF page
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const dpr = Math.max(window.devicePixelRatio || 1, 2.0);
      const displayWidth = 460;
      const scale = (displayWidth / unscaledViewport.width) * dpr;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({
          canvasContext: ctx as any,
          viewport,
        } as any).promise;
      }
    } catch (err) {
      console.error('Preview render error:', err);
    } finally {
      setIsLoadingPage(false);
    }
  }, [currentPage]);

  useEffect(() => {
    if (pdfDocRef.current && totalPages > 0) {
      renderCurrentPage();
    }
  }, [currentPage, totalPages, renderCurrentPage]);

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setImageFileName(selected.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageDataUrl(event.target?.result as string);
        revokeDownloadUrl();
      };
      reader.readAsDataURL(selected);
    }
  };

  const handleApplyWatermark = async () => {
    if (!file) return;
    if (watermarkType === 'text' && !text.trim()) {
      setError('Please enter watermark text.');
      return;
    }
    if (watermarkType === 'image' && !imageDataUrl) {
      setError('Please upload a watermark logo image.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    revokeDownloadUrl();

    try {
      const opts: WatermarkOptions = {
        type: watermarkType,
        text: text.trim(),
        imageDataUrl: imageDataUrl || undefined,
        fontFamily,
        fontSize,
        colorHex,
        opacity,
        angle,
        letterSpacing: watermarkType === 'text' ? letterSpacing : 0,
        position,
      };

      const outputBytes = await addWatermarkToPDF(file, opts);
      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err) {
      console.error(err);
      setError('Failed to apply watermark. The PDF may be password-protected or corrupted.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    onFileChange(null);
    revokeDownloadUrl();
    setError(null);
    setImageDataUrl(null);
    setImageFileName(null);
  };

  // Preview overlay CSS computation
  const getOverlayPositionStyles = () => {
    let top = '50%';
    let transform = `translate(-50%, -50%) rotate(${angle}deg)`;

    if (position === 'top') {
      top = '14%';
    } else if (position === 'bottom') {
      top = '86%';
    }

    return {
      top,
      left: '50%',
      transform,
    };
  };

  const getFontFamilyCSS = () => {
    if (fontFamily === 'TimesRoman') return '"Times New Roman", Times, serif';
    if (fontFamily === 'Courier') return '"Courier New", Courier, monospace';
    return 'Helvetica, Arial, sans-serif';
  };

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
              revokeDownloadUrl();
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Stamp className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to add a watermark</p>
          <p className="text-xs text-zinc-500 mt-1">Text stamps &amp; company logo watermarks • 100% locally processed</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]?.type === 'application/pdf') {
                onFileChange(e.target.files[0]);
                revokeDownloadUrl();
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
                  {Math.round(file.size / 1024)} KB • {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switcher: Text Stamp vs Image Logo */}
          <div className="grid grid-cols-2 gap-2 bg-zinc-950/60 p-1.5 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setWatermarkType('text');
                revokeDownloadUrl();
              }}
              className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
                watermarkType === 'text'
                  ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Text Watermark</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setWatermarkType('image');
                revokeDownloadUrl();
              }}
              className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
                watermarkType === 'image'
                  ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Logo / Image Stamp</span>
            </button>
          </div>

          {/* Configuration Grid */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-4">
            {watermarkType === 'text' ? (
              <>
                {/* Text Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">Watermark Text</label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      revokeDownloadUrl();
                    }}
                    placeholder="e.g., CONFIDENTIAL, DRAFT, INTERNAL USE"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Font & Color Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Font Family</label>
                    <select
                      value={fontFamily}
                      onChange={(e) => {
                        setFontFamily(e.target.value as any);
                        revokeDownloadUrl();
                      }}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="Helvetica">Helvetica (Modern Sans-Serif)</option>
                      <option value="TimesRoman">Times Roman (Formal Serif)</option>
                      <option value="Courier">Courier (Monospace Code)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">Color Palette</label>
                    <div className="flex items-center gap-1.5">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => {
                            setColorHex(c.hex);
                            revokeDownloadUrl();
                          }}
                          className={`w-6 h-6 rounded-full border-2 transition cursor-pointer ${
                            colorHex.toLowerCase() === c.hex.toLowerCase()
                              ? 'border-white scale-110'
                              : 'border-transparent hover:scale-105'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.label}
                        />
                      ))}
                      <input
                        type="color"
                        value={colorHex}
                        onChange={(e) => {
                          setColorHex(e.target.value);
                          revokeDownloadUrl();
                        }}
                        className="w-7 h-7 rounded-md cursor-pointer border-0 bg-transparent ml-1"
                        title="Custom Color"
                      />
                    </div>
                  </div>
                </div>

                {/* Sliders: Font Size & Letter Spacing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Font Size</span>
                      <span className="font-mono">{fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={18}
                      max={96}
                      value={fontSize}
                      onChange={(e) => {
                        setFontSize(Number(e.target.value));
                        revokeDownloadUrl();
                      }}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Character Spacing</span>
                      <span className="font-mono">{letterSpacing} spaces</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={6}
                      value={letterSpacing}
                      onChange={(e) => {
                        setLetterSpacing(Number(e.target.value));
                        revokeDownloadUrl();
                      }}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>
              </>
            ) : (
              /* Logo / Image Watermark Upload */
              <div className="space-y-3">
                <label className="text-xs font-medium text-zinc-300">Upload Company Logo / Seal</label>
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-700 hover:border-emerald-500/50 p-4 rounded-xl text-center cursor-pointer bg-zinc-900/40 transition"
                >
                  <Upload className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                  <p className="text-xs font-medium text-zinc-300">
                    {imageFileName || 'Select PNG with transparent background or JPG logo'}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">High-resolution graphics recommended</p>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Logo Scale</span>
                    <span className="font-mono">{fontSize}%</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={fontSize}
                    onChange={(e) => {
                      setFontSize(Number(e.target.value));
                      revokeDownloadUrl();
                    }}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Common Controls: Orientation, Position, Opacity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-800/80">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Angle</label>
                <select
                  value={angle}
                  onChange={(e) => {
                    setAngle(Number(e.target.value));
                    revokeDownloadUrl();
                  }}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value={-45}>Diagonal (-45°)</option>
                  <option value={0}>Horizontal (0°)</option>
                  <option value={90}>Vertical (90°)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Position</label>
                <select
                  value={position}
                  onChange={(e) => {
                    setPosition(e.target.value as any);
                    revokeDownloadUrl();
                  }}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="center">Centered</option>
                  <option value="top">Top Header</option>
                  <option value="bottom">Bottom Footer</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-zinc-400">
                  <span>Transparency</span>
                  <span className="font-mono">{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.9}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => {
                    setOpacity(Number(e.target.value));
                    revokeDownloadUrl();
                  }}
                  className="w-full accent-emerald-500 cursor-pointer mt-1"
                />
              </div>
            </div>
          </div>

          {/* Live Interactive Page Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-300 px-1">
              <span>Live Watermark Preview</span>
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
            </div>

            <div className="relative bg-zinc-950/90 rounded-xl border border-zinc-800 flex items-center justify-center p-4 overflow-hidden shadow-inner min-h-[360px]">
              {isLoadingPage && (
                <div className="absolute inset-0 bg-zinc-950/60 z-30 flex items-center justify-center backdrop-blur-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              )}

              <div className="relative inline-block leading-none shadow-2xl bg-white rounded-xs">
                <canvas
                  ref={canvasRef}
                  className="block rounded-xs max-h-[460px] w-auto h-auto object-contain pointer-events-none"
                />

                {/* Realtime Watermark Overlay */}
                <div
                  className="absolute pointer-events-none whitespace-nowrap select-none font-bold"
                  style={{
                    ...getOverlayPositionStyles(),
                    opacity,
                    color: colorHex,
                    fontSize: `${Math.round(fontSize * 0.46)}px`,
                    fontFamily: getFontFamilyCSS(),
                    letterSpacing: watermarkType === 'text' ? `${letterSpacing * 6}px` : undefined,
                  }}
                >
                  {watermarkType === 'text' ? (
                    text || 'WATERMARK'
                  ) : imageDataUrl ? (
                    <img
                      src={imageDataUrl}
                      alt="Watermark Logo"
                      style={{
                        width: `${Math.round(fontSize * 2.2)}px`,
                        height: 'auto',
                      }}
                      className="object-contain"
                    />
                  ) : null}
                </div>
              </div>
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
              onClick={handleApplyWatermark}
              disabled={isProcessing || (watermarkType === 'text' && !text.trim()) || (watermarkType === 'image' && !imageDataUrl)}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed text-xs"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Stamping Watermark Across {totalPages} Pages...</span>
                </>
              ) : (
                <>
                  <Stamp className="w-4 h-4" />
                  <span>Apply Watermark to All Pages</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Watermark stamped successfully on all pages!</span>
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace('.pdf', '')}_watermarked.pdf`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer text-xs"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Watermarked PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};