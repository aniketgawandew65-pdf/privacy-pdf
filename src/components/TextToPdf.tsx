import React, { useState, useRef, useEffect } from "react";
import {
  Download,
  Loader2,
  FileText,
  ChevronLeft,
  ChevronRight,
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
  AlertCircle
} from "lucide-react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface StyledWord {
  text: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrike: boolean;
  fontSize: number;
}

interface BlockData {
  words: StyledWord[];
  align: "left" | "center" | "right";
  isListItem: boolean;
  listIndex?: number;
  isHr?: boolean;
}

export const TextToPdf: React.FC<any> = () => {
  const [content, setContent] = useState<string>("");
  const [charCount, setCharCount] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [fontSize, setFontSize] = useState<number>(12);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement | null>(null);

  // Instant 0ms synchronization between editor and preview
  const syncContent = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setContent(html);
    setCharCount(editorRef.current.innerText.trim().length);
    setDownloadUrl(null);
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

  // Traverses the editor DOM to preserve bold, italic, underline, strikethrough, sizes, and lists
  const extractBlocksFromDom = (root: HTMLElement, defaultSize: number): BlockData[] => {
    const blocks: BlockData[] = [];

    const getStyle = (el: HTMLElement, parent: any) => {
      const tag = el.tagName.toLowerCase();
      const isBold = parent.isBold || tag === "b" || tag === "strong" || el.style.fontWeight === "bold" || parseInt(el.style.fontWeight) >= 600;
      const isItalic = parent.isItalic || tag === "i" || tag === "em" || el.style.fontStyle === "italic";
      const isUnderline = parent.isUnderline || tag === "u" || (el.style.textDecoration && el.style.textDecoration.includes("underline"));
      const isStrike = parent.isStrike || tag === "s" || tag === "strike" || tag === "del" || (el.style.textDecoration && el.style.textDecoration.includes("line-through"));

      let sz = parent.fontSize;
      if (tag === "h1") sz = 22;
      else if (tag === "h2") sz = 18;
      else if (tag === "h3") sz = 15;
      else if (tag === "font" && el.getAttribute("size")) {
        const s = el.getAttribute("size");
        if (s === "1") sz = 9;
        else if (s === "2") sz = 10;
        else if (s === "3") sz = 12;
        else if (s === "4") sz = 14;
        else if (s === "5") sz = 18;
        else if (s === "6") sz = 24;
        else if (s === "7") sz = 32;
      } else if (el.style.fontSize) {
        const parsed = parseFloat(el.style.fontSize);
        if (!isNaN(parsed) && parsed > 0) sz = Math.round(parsed);
      }

      return { isBold, isItalic, isUnderline, isStrike, fontSize: sz };
    };

    const traverseInline = (node: Node, curStyle: any, wordsAcc: StyledWord[]) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const raw = node.nodeValue || "";
        const sanitized = raw
          .replace(/₹\s*/g, "Rs. ")
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2013\u2014]/g, "-")
          .replace(/\u2026/g, "...")
          .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "")
          .replace(/[^\x20-\x7E\n]/g, "");

        if (!sanitized) return;

        const tokens = sanitized.split(/(\s+)/);
        for (const token of tokens) {
          if (!token) continue;
          wordsAcc.push({
            text: token,
            isBold: curStyle.isBold,
            isItalic: curStyle.isItalic,
            isUnderline: curStyle.isUnderline,
            isStrike: curStyle.isStrike,
            fontSize: curStyle.fontSize,
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === "br") {
          wordsAcc.push({
            text: "\n",
            isBold: false,
            isItalic: false,
            isUnderline: false,
            isStrike: false,
            fontSize: curStyle.fontSize,
          });
          return;
        }
        const nextStyle = getStyle(el, curStyle);
        for (let i = 0; i < el.childNodes.length; i++) {
          traverseInline(el.childNodes[i], nextStyle, wordsAcc);
        }
      }
    };

    const processBlock = (el: HTMLElement, isListItem: boolean = false, listIndex?: number) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "hr") {
        blocks.push({ words: [], align: "left", isListItem: false, isHr: true });
        return;
      }

      let align: "left" | "center" | "right" = "left";
      const textAlign = el.style.textAlign || el.getAttribute("align") || "";
      if (textAlign === "center") align = "center";
      else if (textAlign === "right") align = "right";

      const baseStyle = {
        isBold: tag === "h1" || tag === "h2" || tag === "h3",
        isItalic: false,
        isUnderline: false,
        isStrike: false,
        fontSize: tag === "h1" ? 22 : tag === "h2" ? 18 : tag === "h3" ? 15 : defaultSize,
      };

      const words: StyledWord[] = [];
      for (let i = 0; i < el.childNodes.length; i++) {
        traverseInline(el.childNodes[i], baseStyle, words);
      }

      blocks.push({ words, align, isListItem, listIndex, isHr: false });
    };

    let standalone: StyledWord[] = [];
    const children = root.childNodes;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();

        if (tag === "ul") {
          if (standalone.length > 0) {
            blocks.push({ words: standalone, align: "left", isListItem: false });
            standalone = [];
          }
          el.querySelectorAll("li").forEach((li) => processBlock(li as HTMLElement, true));
        } else if (tag === "ol") {
          if (standalone.length > 0) {
            blocks.push({ words: standalone, align: "left", isListItem: false });
            standalone = [];
          }
          el.querySelectorAll("li").forEach((li, idx) => processBlock(li as HTMLElement, true, idx + 1));
        } else if (["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr"].includes(tag)) {
          if (standalone.length > 0) {
            blocks.push({ words: standalone, align: "left", isListItem: false });
            standalone = [];
          }
          processBlock(el);
        } else {
          traverseInline(child, { isBold: false, isItalic: false, isUnderline: false, isStrike: false, fontSize: defaultSize }, standalone);
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        traverseInline(child, { isBold: false, isItalic: false, isUnderline: false, isStrike: false, fontSize: defaultSize }, standalone);
      }
    }

    if (standalone.length > 0) {
      blocks.push({ words: standalone, align: "left", isListItem: false });
    }

    return blocks;
  };

  // Export PDF with full rich-text formatting (Bold, Italic, Underline, Strikethrough, Sizing, Lists)
  const handleDownload = async () => {
    if (!editorRef.current) return;
    const plain = editorRef.current.innerText.trim();
    if (!plain) {
      setError("Please enter some text before downloading.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const pdfDoc = await PDFDocument.create();
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      const boldItalicFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

      const getFont = (b: boolean, it: boolean) => {
        if (b && it) return boldItalicFont;
        if (b) return boldFont;
        if (it) return italicFont;
        return regularFont;
      };

      const margin = 50;
      const pageWidth = 595.28; // A4 standard width
      const pageHeight = 841.89; // A4 standard height
      const contentWidth = pageWidth - margin * 2;

      let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let currentY = pageHeight - margin;

      const blocks = extractBlocksFromDom(editorRef.current, fontSize);

      for (const block of blocks) {
        if (block.isHr) {
          if (currentY - 16 < margin) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            currentY = pageHeight - margin;
          }
          currentPage.drawLine({
            start: { x: margin, y: currentY },
            end: { x: pageWidth - margin, y: currentY },
            thickness: 0.75,
            color: rgb(0.8, 0.8, 0.8),
          });
          currentY -= 16;
          continue;
        }

        if (block.words.length === 0) {
          currentY -= fontSize * 1.35;
          if (currentY < margin + fontSize) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            currentY = pageHeight - margin;
          }
          continue;
        }

        const indent = block.isListItem ? 20 : 0;
        const availWidth = contentWidth - indent;

        // Word wrap while retaining each word's styling
        const lines: Array<StyledWord[]> = [];
        let curLine: StyledWord[] = [];
        let curLineWidth = 0;

        for (const w of block.words) {
          if (w.text === "\n") {
            lines.push(curLine);
            curLine = [];
            curLineWidth = 0;
            continue;
          }

          const font = getFont(w.isBold, w.isItalic);
          const wWidth = font.widthOfTextAtSize(w.text, w.fontSize);

          if (curLineWidth + wWidth > availWidth && curLine.length > 0 && w.text.trim().length > 0) {
            lines.push(curLine);
            curLine = [w];
            curLineWidth = wWidth;
          } else {
            curLine.push(w);
            curLineWidth += wWidth;
          }
        }
        if (curLine.length > 0) {
          lines.push(curLine);
        }

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const lineWords = lines[lineIdx];
          if (lineWords.length === 0) {
            currentY -= fontSize * 1.35;
            if (currentY < margin + fontSize) {
              currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
              currentY = pageHeight - margin;
            }
            continue;
          }

          let lineMaxFontSize = fontSize;
          let totalLineWidth = 0;
          for (const w of lineWords) {
            if (w.fontSize > lineMaxFontSize) lineMaxFontSize = w.fontSize;
            const font = getFont(w.isBold, w.isItalic);
            totalLineWidth += font.widthOfTextAtSize(w.text, w.fontSize);
          }

          const lineHeight = lineMaxFontSize * 1.4;

          if (currentY - lineHeight < margin) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            currentY = pageHeight - margin;
          }

          let startX = margin + indent;
          if (block.align === "center") {
            startX = margin + indent + Math.max(0, (availWidth - totalLineWidth) / 2);
          } else if (block.align === "right") {
            startX = pageWidth - margin - totalLineWidth;
          }

          // Bullet / Number rendering
          if (block.isListItem && lineIdx === 0) {
            if (block.listIndex !== undefined) {
              currentPage.drawText(`${block.listIndex}.`, {
                x: margin,
                y: currentY,
                size: lineMaxFontSize,
                font: regularFont,
                color: rgb(0.2, 0.2, 0.2),
              });
            } else {
              currentPage.drawCircle({
                x: margin + 8,
                y: currentY + lineMaxFontSize * 0.32,
                size: 2.2,
                color: rgb(0.2, 0.2, 0.2),
              });
            }
          }

          // Draw styled word segments
          let curX = startX;
          for (const w of lineWords) {
            const font = getFont(w.isBold, w.isItalic);
            const wWidth = font.widthOfTextAtSize(w.text, w.fontSize);

            currentPage.drawText(w.text, {
              x: curX,
              y: currentY,
              size: w.fontSize,
              font: font,
              color: rgb(0.12, 0.12, 0.12),
            });

            if (w.isUnderline && w.text.trim().length > 0) {
              currentPage.drawLine({
                start: { x: curX, y: currentY - 1.5 },
                end: { x: curX + wWidth, y: currentY - 1.5 },
                thickness: 0.8,
                color: rgb(0.15, 0.15, 0.15),
              });
            }

            if (w.isStrike && w.text.trim().length > 0) {
              currentPage.drawLine({
                start: { x: curX, y: currentY + w.fontSize * 0.32 },
                end: { x: curX + wWidth, y: currentY + w.fontSize * 0.32 },
                thickness: 0.8,
                color: rgb(0.15, 0.15, 0.15),
              });
            }

            curX += wWidth;
          }

          currentY -= lineHeight;
        }

        // Space after paragraph
        currentY -= Math.max(4, fontSize * 0.35);
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      setError("Failed to create PDF: " + err.message);
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
          </div>
          <span className="text-xs font-mono text-zinc-400">{charCount} characters</span>
        </div>

        {/* Rich Text Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 rounded-xl p-2 text-zinc-300">
          <button
            type="button"
            onClick={() => formatDoc("undo")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("redo")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <select
            value={fontSize}
            onChange={(e) => handleFontSizeChange(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700/80 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
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
            onClick={() => handleFontSizeChange(Math.min(32, fontSize + 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A+
          </button>
          <button
            type="button"
            onClick={() => handleFontSizeChange(Math.max(8, fontSize - 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A-
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={() => formatDoc("bold")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("italic")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("underline")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("strikeThrough")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={() => formatDoc("justifyLeft")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("justifyCenter")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("justifyRight")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("justifyFull")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Justify"
          >
            <AlignJustify className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={() => formatDoc("insertUnorderedList")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("insertOrderedList")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("insertHorizontalRule")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Horizontal Line"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
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
          onInput={syncContent}
          onKeyUp={syncContent}
          onPaste={() => setTimeout(syncContent, 0)}
          data-placeholder="Start typing your document here..."
          className="w-full min-h-[300px] max-h-[500px] overflow-y-auto bg-white text-zinc-900 rounded-xl p-6 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-left font-sans text-sm sm:text-base leading-relaxed break-words select-text cursor-text"
        />
      </div>

      {/* Bottom Live PDF Preview Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <span className="font-semibold text-sm text-zinc-200">PDF Preview</span>
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 font-mono">
            <ChevronLeft className="w-3.5 h-3.5 opacity-40 cursor-not-allowed" />
            <span>Page 1 of 1</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-40 cursor-not-allowed" />
          </div>
        </div>

        {/* Single Centered A4 Card */}
        <div className="relative w-full min-h-[480px] bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-center p-6 overflow-auto">
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
            }}
            className="w-full max-w-[580px] aspect-[1/1.414] bg-white text-zinc-900 shadow-2xl rounded-lg p-8 sm:p-12 overflow-y-auto text-left border border-zinc-700 select-text transition-transform duration-150"
          >
            {hasContent ? (
              <div
                className="font-sans text-zinc-900 text-left leading-relaxed text-sm sm:text-base break-words select-text"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <p className="text-zinc-400 italic text-sm sm:text-base select-none">
                Type your text above to see it appear here live...
              </p>
            )}
          </div>

          {/* Zoom Controls */}
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
        <div className="flex items-center justify-end gap-3 pt-2">
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
