import { sanitizeRichHtml } from '../utils/sanitizeHtml';
import { safeStorage } from '../utils/safeStorage';
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
  Type
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
// @ts-ignore
import html2canvas from "html2canvas";

const STORAGE_KEY = "privacy_pdf_text_editor_draft";

// Exact standard A4 dimensions at 96 DPI: 794px width x 1123px height
const A4_WIDTH_PX = 794;
const A4_PAGE_HEIGHT_PX = 1123;
const USABLE_PAGE_HEIGHT_PX = 1011; // 1123px - (56px top + 56px bottom padding)

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
  const [toolbarFontSize, setToolbarFontSize] = useState<number>(14);
  const [selectedFont, setSelectedFont] = useState<string>(FONT_OPTIONS[0].value);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fitScale, setFitScale] = useState<number>(0.5);
  const [pagesHtml, setPagesHtml] = useState<string[]>([""]);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const previewOuterRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // 1. Auto-restore draft from localStorage
  useEffect(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) {
        setContent(sanitizeRichHtml(saved));
        if (editorRef.current) {
          editorRef.current.innerHTML = sanitizeRichHtml(saved);
          setCharCount(editorRef.current.innerText.trim().length);
        }
      }
    } catch (_) {}
  }, []);

  // 2. Track mobile selection range so toolbar taps never lose highlighted words
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (
        sel &&
        sel.rangeCount > 0 &&
        editorRef.current &&
        editorRef.current.contains(sel.anchorNode)
      ) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  // 3. True DOM Pagination: Measures elements and partitions them into separate A4 page containers
  const paginateDocument = useCallback((rawHtml: string, font: string, baseSize: number) => {
    if (!rawHtml || !rawHtml.trim()) {
      setPagesHtml([""]);
      return;
    }

    const cleanHtml = sanitizeRichHtml(rawHtml)
      .replace(/--- PAGE BREAK[\s\S]*?---/gi, "")
      .replace(/✂/g, "");

    // Match pagination measurements to the real PDF/preview rendering.
    // Without this, a line can be assigned to the previous page and then
    // get clipped by the final fixed-height A4 sheet.
    const measurementStyle = document.createElement("style");
    measurementStyle.textContent = `
      .text-to-pdf-measure p {
        margin: 0 0 6px 0;
      }
      .text-to-pdf-measure table {
        width: 100%;
        border-collapse: collapse;
        margin: 12px 0;
        font-size: inherit;
      }
      .text-to-pdf-measure th,
      .text-to-pdf-measure td {
        border: 1px solid #d4d4d8;
        padding: 8px 12px;
        text-align: left;
      }
      .text-to-pdf-measure th {
        font-weight: 600;
      }
      .text-to-pdf-measure ul {
        list-style-type: disc;
        padding-left: 28px;
        margin: 8px 0;
      }
      .text-to-pdf-measure ol {
        list-style-type: decimal;
        padding-left: 28px;
        margin: 8px 0;
      }
      .text-to-pdf-measure li {
        display: list-item;
        margin-bottom: 4px;
      }
      .text-to-pdf-measure hr {
        border: none;
        border-top: 1px solid #e4e4e7;
        margin: 16px 0;
      }
      .text-to-pdf-measure [style*="font-size"] {
        line-height: 1.35;
      }
      .text-to-pdf-measure font[size="1"] { font-size: 10px !important; }
      .text-to-pdf-measure font[size="2"] { font-size: 12px !important; }
      .text-to-pdf-measure font[size="3"] { font-size: 14px !important; }
      .text-to-pdf-measure font[size="4"] { font-size: 16px !important; }
      .text-to-pdf-measure font[size="5"] { font-size: 18px !important; }
      .text-to-pdf-measure font[size="6"] { font-size: 24px !important; }
      .text-to-pdf-measure font[size="7"] { font-size: 32px !important; }
    `;
    document.head.appendChild(measurementStyle);

    const measuringSandbox = document.createElement("div");
    measuringSandbox.className = "text-to-pdf-measure";
    measuringSandbox.style.position = "absolute";
    measuringSandbox.style.left = "-9999px";
    measuringSandbox.style.top = "0";
    measuringSandbox.style.width = `${A4_WIDTH_PX}px`;
    measuringSandbox.style.padding = "56px 64px";
    measuringSandbox.style.boxSizing = "border-box";
    measuringSandbox.style.fontFamily = font;
    measuringSandbox.style.fontSize = `${baseSize}px`;
    measuringSandbox.style.lineHeight = "1.6";
    measuringSandbox.style.wordBreak = "break-word";
    measuringSandbox.innerHTML = cleanHtml;
    document.body.appendChild(measuringSandbox);

    const testContainer = document.createElement("div");
    testContainer.className = "text-to-pdf-measure";
    testContainer.style.position = "absolute";
    testContainer.style.left = "-9999px";
    testContainer.style.top = "0";
    testContainer.style.width = `${A4_WIDTH_PX}px`;
    testContainer.style.padding = "56px 64px";
    testContainer.style.boxSizing = "border-box";
    testContainer.style.fontFamily = font;
    testContainer.style.fontSize = `${baseSize}px`;
    testContainer.style.lineHeight = "1.6";
    testContainer.style.wordBreak = "break-word";
    document.body.appendChild(testContainer);

    const pages: string[] = [];
    const PAGE_RENDER_SAFETY_PX = 12;
    let curPageContainer = document.createElement("div");

    const nodes = Array.from(measuringSandbox.childNodes);

    for (const node of nodes) {
      const isManualBreak =
        node.nodeType === Node.ELEMENT_NODE &&
        ((node as HTMLElement).classList?.contains("doc-page-break") ||
          (node as HTMLElement).style?.pageBreakBefore === "always" ||
          (node as HTMLElement).style?.breakBefore === "page");

      if (isManualBreak) {
        if (curPageContainer.childNodes.length > 0) {
          pages.push(curPageContainer.innerHTML);
          curPageContainer = document.createElement("div");
        }
        continue;
      }

      const clone = node.cloneNode(true);
      curPageContainer.appendChild(clone);

      testContainer.innerHTML = curPageContainer.innerHTML;
      const totalH = testContainer.scrollHeight - 112; // exclude top + bottom padding

      if (
        totalH > USABLE_PAGE_HEIGHT_PX - PAGE_RENDER_SAFETY_PX &&
        curPageContainer.childNodes.length > 1
      ) {
        curPageContainer.removeChild(clone);
        pages.push(curPageContainer.innerHTML);

        curPageContainer = document.createElement("div");
        curPageContainer.appendChild(clone);
        testContainer.innerHTML = curPageContainer.innerHTML;
      }
    }

    if (curPageContainer.childNodes.length > 0) {
      pages.push(curPageContainer.innerHTML);
    }

    document.body.removeChild(measuringSandbox);
    document.body.removeChild(testContainer);
    measurementStyle.remove();

    setPagesHtml(pages.length > 0 ? pages : [""]);
  }, []);

  // 4. Update preview scale responsive to mobile screen width
  const updateScale = useCallback(() => {
    if (previewOuterRef.current) {
      const availableW = previewOuterRef.current.clientWidth - 32;
      const baseScale = Math.min(1, Math.max(0.2, availableW / A4_WIDTH_PX));
      setFitScale(baseScale);
    }
  }, []);

  // 5. Instant 0ms synchronization + auto-save
  const syncContent = () => {
    if (!editorRef.current) return;
    const html = sanitizeRichHtml(editorRef.current.innerHTML);
    setContent(html);
    setCharCount(editorRef.current.innerText.trim().length);
    setDownloadUrl(null);
    try {
      safeStorage.setItem(STORAGE_KEY, html);
    } catch (_) {}
    paginateDocument(html, selectedFont, fontSize);
  };

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => syncContent());
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [paginateDocument, selectedFont, fontSize]);

  useEffect(() => {
    updateScale();
    paginateDocument(content, selectedFont, fontSize);
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [content, fontSize, selectedFont, updateScale, paginateDocument]);

  const formatDoc = (cmd: string, val: string = "") => {
    document.execCommand(cmd, false, val);
    syncContent();
  };

  // 6. Word-level font size formatting
  const handleFontSizeChange = (size: number) => {
    setToolbarFontSize(size);

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
      // No text selection: this becomes the normal/base typing size.
      setFontSize(size);

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

  // 7. Manual Page Break
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
      setPagesHtml([""]);
      try {
        safeStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
  };

  // 8. Isolated Iframe PDF Export (Bypasses oklch errors completely while matching preview 1:1)
  const handleDownload = async () => {
    if (!editorRef.current) return;
    const plainText = editorRef.current.innerText.trim();
    if (!plainText) {
      setError("Please enter some text before downloading.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    // Create an isolated iframe so html2canvas never encounters host Tailwind oklch styles
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = `${A4_WIDTH_PX}px`;
    iframe.style.height = `${A4_PAGE_HEIGHT_PX}px`;
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error("Unable to create document renderer.");

      const pdfDoc = await PDFDocument.create();
      const pageWidthPt = 595.28;
      const pageHeightPt = 841.89;

      for (let i = 0; i < pagesHtml.length; i++) {
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
                  width: ${A4_WIDTH_PX}px;
                  height: ${A4_PAGE_HEIGHT_PX}px;
                  background-color: #ffffff;
                  color: #18181b;
                  font-family: ${selectedFont};
                  font-size: ${fontSize}px;
                  line-height: 1.6;
                  word-break: break-word;
                  overflow: hidden;
                  position: relative;
                }
                p { margin: 0 0 6px 0; }
                table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: inherit; }
                th, td { border: 1px solid #d4d4d8; padding: 8px 12px; text-align: left; }
                th { background-color: #f4f4f5; font-weight: 600; }
                ul { list-style-type: disc; padding-left: 28px; margin: 8px 0; }
                ol { list-style-type: decimal; padding-left: 28px; margin: 8px 0; }
                li { display: list-item; margin-bottom: 4px; }
                hr { border: none; border-top: 1px solid #e4e4e7; margin: 16px 0; }
                [style*="font-size"] { line-height: 1.35; }
                font[size="1"] { font-size: 10px !important; }
                font[size="2"] { font-size: 12px !important; }
                font[size="3"] { font-size: 14px !important; }
                font[size="4"] { font-size: 16px !important; }
                font[size="5"] { font-size: 18px !important; }
                font[size="6"] { font-size: 24px !important; }
                font[size="7"] { font-size: 32px !important; }
              </style>
            </head>
            <body>
              <div style="position: absolute; top: 24px; right: 64px; font-size: 9px; font-family: Helvetica, Arial, sans-serif; color: #71717a;">
                Page ${i + 1} of ${pagesHtml.length}
              </div>
              ${pagesHtml[i]}
            </body>
          </html>
        `);
        iframeDoc.close();

        const canvas = await html2canvas(iframeDoc.body, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          width: A4_WIDTH_PX,
          height: A4_PAGE_HEIGHT_PX,
          logging: false,
        });

        const imgDataUrl = canvas.toDataURL("image/jpeg", 0.95);
        const base64Str = imgDataUrl.split(",")[1];
        const binaryStr = window.atob(base64Str);
        const imgBytes = new Uint8Array(binaryStr.length);
        for (let b = 0; b < binaryStr.length; b++) {
          imgBytes[b] = binaryStr.charCodeAt(b);
        }

        const embeddedImg = await pdfDoc.embedJpg(imgBytes);
        const pdfPage = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
        pdfPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: pageWidthPt,
          height: pageHeightPt,
        });
      }

      document.body.removeChild(iframe);

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
  const effectiveScale = fitScale * zoom;

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 text-white space-y-6 select-none">
      {/* Top Document Editor Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            <span className="font-semibold text-sm text-zinc-200">Document Editor</span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
              {pagesHtml.length} {pagesHtml.length === 1 ? "Page" : "Pages"}
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

          {/* Font Size Selector */}
          <select
            value={toolbarFontSize}
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
            onClick={() => handleFontSizeChange(Math.min(32, toolbarFontSize + 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A+
          </button>
          <button
            type="button"
            onTouchStart={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFontSizeChange(Math.max(8, toolbarFontSize - 2))}
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

        <p className="text-xs text-zinc-400">Your draft is saved in this browser. Clear the document to remove the saved draft.</p>
        {/* Input Editor */}
        <div className="relative w-full rounded-xl overflow-hidden bg-white shadow-inner">
          <div
            ref={editorRef}
            contentEditable={true}
            onInput={syncContent}
            onKeyUp={syncContent}
            onPaste={(event) => {
              event.preventDefault();
              const rich = event.clipboardData.getData('text/html');
              if (rich) document.execCommand('insertHTML', false, sanitizeRichHtml(rich));
              else document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
              syncContent();
            }}
            style={{ fontFamily: selectedFont, color: "#18181b" }}
            data-placeholder="Start typing your document here..."
            className="relative z-0 w-full min-h-[360px] max-h-[540px] overflow-y-auto text-zinc-900 p-8 sm:p-12 focus:outline-none text-left text-sm sm:text-base leading-relaxed break-words select-text cursor-text [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1"
          />
        </div>
      </div>

      {/* Bottom Live PDF Preview Card (Physical Stacked A4 Sheets) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
          <span className="font-semibold text-sm text-zinc-200">PDF Preview</span>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-zinc-400 font-mono">
              {pagesHtml.length} {pagesHtml.length === 1 ? "Page" : "Pages"} (Discrete A4 Sheets)
            </span>

            <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 text-zinc-300">
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(0.6, Math.round((prev - 0.1) * 10) / 10))}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <span className="text-xs font-mono px-1 min-w-[3rem] text-center text-zinc-300">
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
        </div>

        {/* Vertical Stack of Real A4 Sheets */}
        <div
          ref={previewOuterRef}
          className="relative w-full min-h-[500px] max-h-[700px] bg-zinc-950 border border-zinc-800/80 rounded-xl flex flex-col items-center gap-8 p-6 overflow-y-auto overflow-x-hidden"
        >
          {pagesHtml.map((pageHtml, index) => (
            <div
              key={index}
              style={{
                width: `${A4_WIDTH_PX * effectiveScale}px`,
                height: `${A4_PAGE_HEIGHT_PX * effectiveScale}px`,
                position: "relative",
                flexShrink: 0,
              }}
            >
              {/* Discrete A4 Sheet matching PDF layout 1:1 */}
              <div
                style={{
                  width: `${A4_WIDTH_PX}px`,
                  height: `${A4_PAGE_HEIGHT_PX}px`,
                  padding: "56px 64px",
                  boxSizing: "border-box",
                  transform: `scale(${effectiveScale})`,
                  transformOrigin: "top left",
                  backgroundColor: "#ffffff",
                  color: "#18181b",
                  fontFamily: selectedFont,
                  fontSize: `${fontSize}px`,
                  lineHeight: "1.6",
                  wordBreak: "break-word",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
                  borderRadius: "6px",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  overflow: "hidden",
                }}
                className="text-zinc-900 text-left select-text border border-zinc-300 [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-7 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-7 [&_ol]:my-2 [&_li]:my-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-zinc-300 [&_th]:p-2 [&_th]:bg-zinc-100 [&_th]:font-semibold [&_td]:border [&_td]:border-zinc-300 [&_td]:p-2"
              >
                {/* Official Page Number Header */}
                <div
                  style={{
                    position: "absolute",
                    top: "24px",
                    right: "64px",
                    fontSize: "9px",
                    fontFamily: "Helvetica, Arial, sans-serif",
                    color: "#71717a",
                  }}
                >
                  Page {index + 1} of {pagesHtml.length}
                </div>

                {/* Page Content */}
                {hasContent ? (
                  <div dangerouslySetInnerHTML={{ __html: pageHtml }} />
                ) : (
                  <p className="text-zinc-400 italic text-sm select-none">
                    Type your text above to see it appear here live...
                  </p>
                )}
              </div>
            </div>
          ))}

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
