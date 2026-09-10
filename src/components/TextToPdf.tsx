import React, { useState, useRef, useEffect } from "react";
import {
  Download,
  Loader2,
  FileText,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Minus,
  Eraser,
  Undo,
  Redo,
  CheckCircle2,
  AlertCircle,
  FilePlus,
  Trash2,
  Edit3,
  Highlighter,
  Palette,
  Type
} from "lucide-react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
// @ts-ignore
import * as htmlToImage from "html-to-image";

const STORAGE_KEY = "privacy_pdf_text_editor_draft";

const FONT_OPTIONS = [
  { label: "Sans-Serif (Modern)", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif (Classic)", value: "'Times New Roman', Times, serif" },
  { label: "Georgia (Editorial)", value: "Georgia, serif" },
  { label: "Monospace (Code)", value: "'Courier New', Courier, monospace" },
];

const TEXT_COLORS = [
  { label: "Black", value: "#18181b" },
  { label: "Dark Gray", value: "#52525b" },
  { label: "Red", value: "#dc2626" },
  { label: "Blue", value: "#2563eb" },
  { label: "Emerald", value: "#059669" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Orange", value: "#ea580c" },
];

const HIGHLIGHT_COLORS = [
  { label: "None", value: "transparent" },
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Cyan", value: "#bae6fd" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
];

export const TextToPdf: React.FC<any> = () => {
  const [content, setContent] = useState<string>("");
  const [charCount, setCharCount] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [fontSize, setFontSize] = useState<number>(14);
  const [selectedFont, setSelectedFont] = useState<string>(FONT_OPTIONS[0].value);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Auto-restore draft from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) {
        setContent(saved);
        if (editorRef.current) {
          editorRef.current.innerHTML = saved;
          setCharCount(editorRef.current.innerText.trim().length);
        }
      }
    } catch (_) {}
  }, []);

  // Instant 0ms synchronization + auto-save
  const syncContent = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setContent(html);
    setCharCount(editorRef.current.innerText.trim().length);
    setDownloadUrl(null);
    try {
      localStorage.setItem(STORAGE_KEY, html);
    } catch (_) {}
  };

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => syncContent());
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const formatDoc = (cmd: string, val: string = "") => {
    document.execCommand(cmd, false, val);
    syncContent();
  };

  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    formatDoc("fontSize", size >= 18 ? "5" : size >= 14 ? "4" : size >= 12 ? "3" : "2");
  };

  const handleFontFamilyChange = (font: string) => {
    setSelectedFont(font);
    formatDoc("fontName", font);
  };

  const handleApplyTextColor = (color: string) => {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, color);
    syncContent();
    setShowColorPicker(false);
  };

  const handleApplyHighlight = (color: string) => {
    if (color === "transparent") {
      document.execCommand("removeFormat", false);
    } else {
      document.execCommand("styleWithCSS", false, "true");
      const ok = document.execCommand("backColor", false, color);
      if (!ok) {
        document.execCommand("hiliteColor", false, color);
      }
    }
    syncContent();
    setShowHighlightPicker(false);
  };

  const handleStrikethrough = () => {
    document.execCommand("strikeThrough", false);
    syncContent();
  };

  const handleInsertPageBreak = () => {
    const breakHtml = '<div class="page-break-indicator" data-page-break="true" contenteditable="false" style="margin: 18px 0; padding: 8px 12px; border-top: 2px dashed #10b981; border-bottom: 2px dashed #10b981; background: rgba(16,185,129,0.08); display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 700; color: #10b981; user-select: none;"><span>✂ --- PAGE BREAK (Guide Only - Won\'t appear in PDF) ---</span><span class="delete-page-break-btn" style="background: #ef4444; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">✕ Remove</span></div><p><br></p>';
    formatDoc("insertHTML", breakHtml);
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.closest(".delete-page-break-btn")) {
      e.preventDefault();
      e.stopPropagation();
      const breakEl = target.closest(".page-break-indicator, [data-page-break]");
      if (breakEl) {
        breakEl.remove();
        syncContent();
      }
    }
  };

  const handleClearDocument = () => {
    if (window.confirm("Are you sure you want to clear your document?")) {
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
      }
      setContent("");
      setCharCount(0);
      setDownloadUrl(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
  };

  // Option B: Native SVG/Canvas capture via html-to-image (Zero CSS parser errors)
  const handleDownload = async () => {
    const previewElement = previewRef.current;
    if (!previewElement) return;

    const plainText = editorRef.current?.innerText.trim() || "";
    if (!plainText) {
      setError("Please enter some text before downloading.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    // Temporarily normalize preview layout for standard A4 vector export
    const originalTransform = previewElement.style.transform;
    const originalWidth = previewElement.style.width;
    const originalMaxWidth = previewElement.style.maxWidth;
    const originalPadding = previewElement.style.padding;
    const originalShadow = previewElement.style.boxShadow;
    const originalBorder = previewElement.style.border;

    try {
      previewElement.style.transform = "none";
      previewElement.style.width = "794px";
      previewElement.style.maxWidth = "794px";
      previewElement.style.padding = "56px 64px";
      previewElement.style.boxShadow = "none";
      previewElement.style.border = "none";

      const canvas = await htmlToImage.toCanvas(previewElement, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        filter: (node: HTMLElement) => {
          if (node.classList && (node.classList.contains("page-break-indicator") || node.classList.contains("delete-page-break-btn"))) {
            return false;
          }
          if (node.getAttribute && node.getAttribute("data-page-break") === "true") {
            return false;
          }
          return true;
        },
      });

      // Restore preview element immediately
      previewElement.style.transform = originalTransform;
      previewElement.style.width = originalWidth;
      previewElement.style.maxWidth = originalMaxWidth;
      previewElement.style.padding = originalPadding;
      previewElement.style.boxShadow = originalShadow;
      previewElement.style.border = originalBorder;

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error("Canvas rendering produced an empty image.");
      }

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pageWidthPt = 595.28;
      const pageHeightPt = 841.89;
      const a4Ratio = pageHeightPt / pageWidthPt; // ~1.41426

      const pageCanvasHeight = Math.floor(canvas.width * a4Ratio);
      const totalPages = Math.max(1, Math.ceil(canvas.height / pageCanvasHeight));

      for (let p = 0; p < totalPages; p++) {
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = pageCanvasHeight;
        const ctx = pageCanvas.getContext("2d");

        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

          const srcY = p * pageCanvasHeight;
          const srcHeight = Math.min(pageCanvasHeight, canvas.height - srcY);

          ctx.drawImage(
            canvas,
            0,
            srcY,
            canvas.width,
            srcHeight,
            0,
            0,
            canvas.width,
            srcHeight
          );
        }

        const imgDataUrl = pageCanvas.toDataURL("image/jpeg", 0.95);
        const base64Str = imgDataUrl.split(",")[1];
        const binaryStr = window.atob(base64Str);
        const imgBytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          imgBytes[i] = binaryStr.charCodeAt(i);
        }

        const embeddedImg = await pdfDoc.embedJpg(imgBytes);
        const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

        page.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: pageWidthPt,
          height: pageHeightPt,
        });

        // Top margin clean Page X of Y header
        page.drawText(`Page ${p + 1} of ${totalPages}`, {
          x: pageWidthPt - 95,
          y: pageHeightPt - 28,
          size: 9,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      previewElement.style.transform = originalTransform;
      previewElement.style.width = originalWidth;
      previewElement.style.maxWidth = originalMaxWidth;
      previewElement.style.padding = originalPadding;
      previewElement.style.boxShadow = originalShadow;
      previewElement.style.border = originalBorder;

      console.error("PDF generation failed:", err);
      const msg = err?.message || (typeof err === "string" ? err : "") || "An unexpected error occurred during PDF generation.";
      setError("Failed to create PDF: " + msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const hasContent = content && content.replace(/<[^>]*>/g, "").trim().length > 0;

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 text-white space-y-6 select-none">
      {/* Top Document Editor Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            <span className="font-semibold text-sm text-zinc-200">Document Editor</span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
              Auto-Saved
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-400">{charCount} chars</span>
            <button
              type="button"
              onClick={handleClearDocument}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400 transition"
              title="Clear Document"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Rich Text Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 rounded-xl p-2 text-zinc-300 relative">
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("undo")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("redo")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Font Family Selector */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5">
            <Type className="w-3 h-3 text-zinc-400" />
            <select
              value={selectedFont}
              onChange={(e) => handleFontFamilyChange(e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} className="bg-zinc-900 text-white">
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size Selector */}
          <select
            value={fontSize}
            onChange={(e) => handleFontSizeChange(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700/80 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none cursor-pointer"
          >
            <option value={10}>10pt</option>
            <option value={12}>12pt</option>
            <option value={14}>14pt</option>
            <option value={16}>16pt</option>
            <option value={18}>18pt</option>
            <option value={24}>24pt</option>
          </select>

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFontSizeChange(Math.min(32, fontSize + 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A+
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFontSizeChange(Math.max(8, fontSize - 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A-
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Text Color Popover */}
          <div className="relative">
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setShowColorPicker(!showColorPicker); setShowHighlightPicker(false); }}
              className="flex items-center gap-1 p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              title="Text Color"
            >
              <Palette className="w-4 h-4" />
            </button>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-xl p-2 shadow-2xl flex items-center gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleApplyTextColor(c.value)}
                    style={{ backgroundColor: c.value }}
                    className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition shadow"
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Highlighter Popover */}
          <div className="relative">
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setShowHighlightPicker(!showHighlightPicker); setShowColorPicker(false); }}
              className="flex items-center gap-1 p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              title="Highlighter"
            >
              <Highlighter className="w-4 h-4" />
            </button>
            {showHighlightPicker && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-xl p-2 shadow-2xl flex items-center gap-1.5">
                {HIGHLIGHT_COLORS.map((h) => (
                  <button
                    key={h.value}
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleApplyHighlight(h.value)}
                    style={{ backgroundColor: h.value === "transparent" ? "#27272a" : h.value }}
                    className="w-5 h-5 rounded-md border border-white/20 hover:scale-110 transition flex items-center justify-center text-[10px]"
                    title={h.label}
                  >
                    {h.value === "transparent" && "✕"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("bold")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("italic")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("underline")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleStrikethrough}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Strikethrough (Word Cutting)"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("justifyLeft")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("justifyCenter")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("justifyRight")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("justifyFull")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Justify"
          >
            <AlignJustify className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("insertUnorderedList")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("insertOrderedList")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("insertHorizontalRule")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Horizontal Line"
          >
            <Minus className="w-4 h-4" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleInsertPageBreak}
            className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-xs font-semibold transition"
            title="Insert Page Break Marker"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>Page Break</span>
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("removeFormat")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Clear Formatting"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* Input Editor */}
        <div
          ref={editorRef}
          contentEditable={true}
          onClick={handleEditorClick}
          onInput={syncContent}
          onKeyUp={syncContent}
          onPaste={() => setTimeout(syncContent, 0)}
          style={{ fontFamily: selectedFont }}
          data-placeholder="Start typing your document here..."
          className="w-full min-h-[320px] max-h-[520px] overflow-y-auto bg-white text-zinc-900 rounded-xl p-8 sm:p-12 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-left text-sm sm:text-base leading-relaxed break-words select-text cursor-text [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_s]:line-through [&_strike]:line-through [&_del]:line-through"
        />
      </div>

      {/* Bottom Live PDF Preview Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <span className="font-semibold text-sm text-zinc-200">PDF Preview</span>
          <span className="text-xs text-zinc-400 font-mono">A4 Sheet Layout</span>
        </div>

        {/* Single Centered A4 Card (Native Capture Target) */}
        <div className="relative w-full min-h-[480px] bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-center p-6 overflow-auto">
          <div
            id="pdf-preview-sheet"
            ref={previewRef}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              fontFamily: selectedFont,
            }}
            className="w-full max-w-[580px] aspect-[1/1.414] bg-white text-zinc-900 shadow-2xl rounded-lg p-8 sm:p-12 overflow-y-auto text-left border border-zinc-700 select-text transition-transform duration-150 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_s]:line-through [&_strike]:line-through [&_del]:line-through [&_mark]:box-decoration-clone [&_mark]:inline [&_mark]:px-1 [&_.page-break-indicator]:hidden [&_[data-page-break]]:hidden [&_.page-break-line]:hidden"
          >
            {hasContent ? (
              <div
                className="text-zinc-900 text-left leading-relaxed text-sm sm:text-base break-words select-text"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <p className="text-zinc-400 italic text-sm sm:text-base select-none">
                Type your text above to see it appear here live...
              </p>
            )}
          </div>

          {/* Floating Zoom Controls */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-xl p-1 shadow-2xl backdrop-blur-md text-zinc-300 z-10">
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.max(0.6, Math.round((prev - 0.1) * 10) / 10))}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono px-2 text-zinc-300 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.min(2.0, Math.round((prev + 0.1) * 10) / 10))}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1.0)}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {downloadUrl && (
            <button
              type="button"
              onClick={() => setDownloadUrl(null)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-medium transition"
            >
              <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Edit Document</span>
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {!downloadUrl ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={isProcessing || !hasContent}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs transition disabled:opacity-40"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>{isProcessing ? "Generating PDF..." : "Download PDF"}</span>
              </button>
            ) : (
              <a
                href={downloadUrl}
                download="document.pdf"
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Document PDF</span>
              </a>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextToPdf;
