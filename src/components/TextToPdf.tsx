import React, { useState, useRef, useEffect, useCallback } from "react";
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
  Palette,
  Type,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
// @ts-ignore
import html2canvas from "html2canvas";

const STORAGE_KEY = "privacy_pdf_text_editor_draft";
const A4_PAGE_HEIGHT_PX = 1040; // Printable A4 page content height threshold

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

export const TextToPdf: React.FC<any> = () => {
  const [content, setContent] = useState<string>("");
  const [charCount, setCharCount] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [fontSize, setFontSize] = useState<number>(14);
  const [selectedFont, setSelectedFont] = useState<string>(FONT_OPTIONS[0].value);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [previewPage, setPreviewPage] = useState<number>(1);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // 1. Auto-restore draft from localStorage
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

  // 2. Track mobile selection range so toolbar taps never lose selected words
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (
        sel &&
        sel.rangeCount > 0 &&
        !sel.isCollapsed &&
        editorRef.current &&
        editorRef.current.contains(sel.anchorNode)
      ) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  // 3. Dynamically calculate Word-style page break positions based on content height
  const updatePageBreaks = useCallback(() => {
    if (!editorRef.current) return;
    const scrollH = editorRef.current.scrollHeight;
    const totalPages = Math.max(1, Math.ceil(scrollH / A4_PAGE_HEIGHT_PX));
    const breaks: number[] = [];
    for (let i = 1; i < totalPages; i++) {
      breaks.push(i * A4_PAGE_HEIGHT_PX);
    }
    setPageBreaks(breaks);
  }, []);

  // 4. Instant 0ms synchronization + auto-save
  const syncContent = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setContent(html);
    setCharCount(editorRef.current.innerText.trim().length);
    setDownloadUrl(null);
    try {
      localStorage.setItem(STORAGE_KEY, html);
    } catch (_) {}
    setTimeout(updatePageBreaks, 40);
  };

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => syncContent());
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [updatePageBreaks]);

  const formatDoc = (cmd: string, val: string = "") => {
    document.execCommand(cmd, false, val);
    syncContent();
  };

  // 5. Precise individual word / sentence font size application
  const handleFontSizeChange = (size: number) => {
    setFontSize(size);

    const sel = window.getSelection();
    if (savedRangeRef.current) {
      if (!sel || sel.isCollapsed || !editorRef.current?.contains(sel.anchorNode)) {
        sel?.removeAllRanges();
        sel?.addRange(savedRangeRef.current);
      }
    }

    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      span.style.lineHeight = "1.35";
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.addRange(newRange);
      syncContent();
    } else {
      const level = size >= 32 ? "7" : size >= 24 ? "6" : size >= 18 ? "5" : size >= 16 ? "4" : size >= 14 ? "3" : "2";
      document.execCommand("fontSize", false, level);
      if (editorRef.current) {
        editorRef.current.querySelectorAll("font[size]").forEach((fontEl: any) => {
          const s = fontEl.getAttribute("size");
          if (s === "7") fontEl.style.fontSize = "32px";
          else if (s === "6") fontEl.style.fontSize = "24px";
          else if (s === "5") fontEl.style.fontSize = "18px";
          else if (s === "4") fontEl.style.fontSize = "16px";
          else if (s === "3") fontEl.style.fontSize = "14px";
          else if (s === "2") fontEl.style.fontSize = "12px";
          fontEl.style.lineHeight = "1.35";
        });
      }
      syncContent();
    }
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

  // 6. Manual Page Break: Inserts an unprinted layout break
  const handleInsertPageBreak = () => {
    const breakHtml = '<div class="doc-page-break" contenteditable="false" style="page-break-before: always; break-before: page; margin: 24px 0; border-top: 2px dashed #10b981; height: 0; user-select: none;"></div><p><br></p>';
    formatDoc("insertHTML", breakHtml);
  };

  const handleClearDocument = () => {
    if (window.confirm("Are you sure you want to clear your document?")) {
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
      }
      setContent("");
      setCharCount(0);
      setDownloadUrl(null);
      setPageBreaks([]);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
  };

  // 7. Multi-Page A4 PDF Generator preserving individual word font sizes
  const handleDownload = async () => {
    if (!editorRef.current) return;
    const plainText = editorRef.current.innerText.trim();
    if (!plainText) {
      setError("Please enter some text before downloading.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "794px"; // Standard A4 width at 96 DPI
    iframe.style.height = "1123px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error("Unable to create document renderer.");

      let cleanHtml = content
        .replace(/--- PAGE BREAK[\s\S]*?---/gi, "")
        .replace(/✂/g, "");

      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              * { box-sizing: border-box; }
              body {
                margin: 0;
                padding: 56px 64px;
                width: 794px;
                background: #ffffff;
                color: #18181b;
                font-family: ${selectedFont};
                font-size: ${fontSize}px;
                line-height: 1.6;
                word-break: break-word;
              }
              table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: inherit; }
              th, td { border: 1px solid #d4d4d8; padding: 8px 12px; text-align: left; }
              th { background-color: #f4f4f5; font-weight: 600; }
              ul { list-style-type: disc; padding-left: 28px; margin: 8px 0; }
              ol { list-style-type: decimal; padding-left: 28px; margin: 8px 0; }
              li { display: list-item; margin-bottom: 4px; }
              p { margin: 6px 0; }
              hr { border: none; border-top: 1px solid #e4e4e7; margin: 16px 0; }
              
              /* Explicit word font sizes mapping */
              [style*="font-size"] { line-height: 1.35; }
              font[size="1"] { font-size: 10px !important; }
              font[size="2"] { font-size: 12px !important; }
              font[size="3"] { font-size: 14px !important; }
              font[size="4"] { font-size: 16px !important; }
              font[size="5"] { font-size: 18px !important; }
              font[size="6"] { font-size: 24px !important; }
              font[size="7"] { font-size: 32px !important; }

              .doc-page-break {
                page-break-before: always !important;
                break-before: page !important;
                border: none !important;
                margin: 0 !important;
                padding: 0 !important;
                height: 0 !important;
                visibility: hidden !important;
              }
            </style>
          </head>
          <body>
            <div>${cleanHtml}</div>
          </body>
        </html>
      `);
      iframeDoc.close();

      const renderBody = iframeDoc.body;
      const targetEl = iframeDoc.getElementById("render-content") || renderBody;
      targetEl.querySelectorAll(".doc-page-break").forEach((el: any) => {
        el.style.visibility = "hidden";
        el.style.border = "none";
      });

      const canvas = await html2canvas(renderBody, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        windowWidth: 794,
        logging: false,
        ignoreElements: (el: Element) => {
          return el.classList?.contains("doc-page-break") && !el.innerHTML;
        },
      });

      document.body.removeChild(iframe);

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error("Render produced an empty canvas.");
      }

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pageWidthPt = 595.28;
      const pageHeightPt = 841.89;
      const a4Ratio = pageHeightPt / pageWidthPt;

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

        // Clean page number in upper right header
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
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      console.error("PDF generation failed:", err);
      const msg = err?.message || (typeof err === "string" ? err : "") || "An unexpected error occurred during PDF generation.";
      setError("Failed to create PDF: " + msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const hasContent = content && content.replace(/<[^>]*>/g, "").trim().length > 0;
  const totalPagesCount = Math.max(1, pageBreaks.length + 1);

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
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("redo")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Font Selector */}
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

          {/* Font Size Selector with word-level sizing */}
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
            <option value={32}>32pt</option>
          </select>

          <button
            type="button"
            onTouchStart={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFontSizeChange(Math.min(32, fontSize + 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A+
          </button>
          <button
            type="button"
            onTouchStart={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFontSizeChange(Math.max(8, fontSize - 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A-
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Text Color Picker */}
          <div className="relative">
            <button
              type="button"
              onTouchStart={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowColorPicker(!showColorPicker)}
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
                    onTouchStart={(e) => e.preventDefault()}
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

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("underline")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
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
            onTouchStart={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleInsertPageBreak}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-xs font-semibold transition"
            title="Insert Clean Page Break"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>Page Break</span>
          </button>

          <button
            type="button"
            onTouchStart={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatDoc("removeFormat")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Clear Formatting"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* Input Editor with True MS Word Page Sheet Layout */}
        <div className="relative w-full rounded-2xl overflow-hidden bg-zinc-950 p-4 sm:p-6 flex justify-center">
          <div className="relative w-full max-w-[794px] bg-white rounded-lg shadow-2xl overflow-hidden border border-zinc-300">
            
            {/* Top margin corner crop marks (Page 1) */}
            <div className="absolute top-4 left-6 text-zinc-400 text-sm select-none pointer-events-none font-mono">┌</div>
            <div className="absolute top-4 right-6 text-zinc-400 text-sm select-none pointer-events-none font-mono">┐</div>

            <div
              ref={editorRef}
              contentEditable={true}
              onInput={syncContent}
              onKeyUp={syncContent}
              onPaste={() => setTimeout(syncContent, 0)}
              style={{ fontFamily: selectedFont }}
              data-placeholder="Start typing your document here..."
              className="w-full min-h-[500px] max-h-[640px] overflow-y-auto text-zinc-900 p-8 sm:p-14 focus:outline-none text-left text-sm sm:text-base leading-relaxed break-words select-text cursor-text [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1"
            />

            {/* MS Word Physical Page Gutter Dividers with Margin Crop Marks */}
            {pageBreaks.map((topPos, idx) => (
              <div
                key={idx}
                style={{ top: `${topPos}px` }}
                className="absolute left-0 right-0 pointer-events-none z-20 flex flex-col select-none -translate-y-1/2"
              >
                {/* Bottom of previous page corner marks */}
                <div className="w-full px-6 flex justify-between text-zinc-400 text-sm font-mono pb-1">
                  <span>└</span>
                  <span>┘</span>
                </div>

                {/* Neutral gray desk gap separating the two sheets */}
                <div className="w-full h-8 bg-zinc-900 border-y border-zinc-800 flex items-center justify-center shadow-inner">
                  <span className="px-3 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] font-mono font-semibold rounded-full border border-zinc-700 shadow">
                    Page {idx + 2} Starts Here
                  </span>
                </div>

                {/* Top of next page corner marks */}
                <div className="w-full px-6 flex justify-between text-zinc-400 text-sm font-mono pt-1">
                  <span>┌</span>
                  <span>┐</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Live PDF Preview Card with Page Flipper */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <span className="font-semibold text-sm text-zinc-200">PDF Preview</span>
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 font-mono">
            <button
              type="button"
              disabled={previewPage <= 1}
              onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
              className="hover:text-white disabled:opacity-30 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>Page {previewPage} of {totalPagesCount}</span>
            <button
              type="button"
              disabled={previewPage >= totalPagesCount}
              onClick={() => setPreviewPage((p) => Math.min(totalPagesCount, p + 1))}
              className="hover:text-white disabled:opacity-30 transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Centered A4 Preview Sheet */}
        <div className="relative w-full min-h-[500px] bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-center p-6 overflow-hidden">
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              fontFamily: selectedFont,
            }}
            className="relative w-full max-w-[580px] aspect-[1/1.414] bg-white text-zinc-900 shadow-2xl rounded-lg p-8 sm:p-12 overflow-hidden text-left border border-zinc-700 select-text transition-transform duration-150 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1"
          >
            {/* Corner marks for preview sheet */}
            <div className="absolute top-4 left-6 text-zinc-400 text-xs select-none font-mono pointer-events-none">┌</div>
            <div className="absolute top-4 right-6 text-zinc-400 text-xs select-none font-mono pointer-events-none">┐</div>
            <div className="absolute bottom-4 left-6 text-zinc-400 text-xs select-none font-mono pointer-events-none">└</div>
            <div className="absolute bottom-4 right-6 text-zinc-400 text-xs select-none font-mono pointer-events-none">┘</div>

            {hasContent ? (
              <div
                ref={previewRef}
                style={{
                  transform: `translateY(-${(previewPage - 1) * 100}%)`,
                  transition: "transform 0.2s ease-in-out",
                }}
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
