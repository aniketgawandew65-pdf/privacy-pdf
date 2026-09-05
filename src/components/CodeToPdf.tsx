import React, { useState, useRef } from 'react';
import {
  Download,
  Code2,
  Upload,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { generateCodePDF, type CodeToPdfOptions } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

const SAMPLE_CODE = `// 1into1 Serverless PDF Engine
import { PDFDocument } from 'pdf-lib';

export async function sanitizeDocument(fileBuffer) {
  const doc = await PDFDocument.load(fileBuffer);
  
  // Wipe all sensitive OS & device identifiers
  doc.setTitle('');
  doc.setAuthor('');
  doc.setProducer('1into1 Privacy Suite');
  
  return await doc.save();
}`;

export const CodeToPdf: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [file, setFile] = useState<File | null>(null);
  const [codeContent, setCodeContent] = useState<string>(SAMPLE_CODE);
  const [title, setTitle] = useState<string>('engine.js');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(8.5);
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeUrl } = useObjectUrl();

  const handleFileDrop = async (selectedFile: File) => {
    setFile(selectedFile);
    setTitle(selectedFile.name);
    revokeUrl();
    setErrorMessage(null);

    try {
      const text = await selectedFile.text();
      setCodeContent(text);
    } catch {
      setErrorMessage('Could not read code file.');
    }
  };

  const handleConvert = async () => {
    if (!codeContent.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeUrl();

    try {
      const options: CodeToPdfOptions = {
        code: codeContent,
        title: title.trim(),
        theme,
        showLineNumbers,
        fontSize,
        pageSize,
        orientation,
      };

      const pdfBytes = await generateCodePDF(options);
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate code PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setCodeContent('');
    setTitle('');
    revokeUrl();
    setErrorMessage(null);
  };

  const lineCount = codeContent.split('\n').length;

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl text-left space-y-6">
      {/* Mode Switcher */}
      <div className="flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-medium">
        <button
          onClick={() => {
            setActiveTab('paste');
            revokeUrl();
          }}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'paste'
              ? 'bg-zinc-800 text-emerald-400 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Paste Code</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('upload');
            revokeUrl();
          }}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'upload'
              ? 'bg-zinc-800 text-emerald-400 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload File</span>
        </button>
      </div>

      {/* Input Area */}
      {activeTab === 'upload' ? (
        !file ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFileDrop(dropped);
            }}
            className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
          >
            <FileCode className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-zinc-200">Drop code file (.js, .ts, .py, .json, etc.)</p>
            <p className="text-xs text-zinc-500 mt-1">Syntax highlighted • Client-side vector export</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) handleFileDrop(selected);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileCode className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{lineCount} lines • {Math.round(file.size / 1024)} KB</p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <label className="font-medium text-zinc-300">Source Snippet</label>
            <span className="text-[11px] text-zinc-500">{lineCount} lines</span>
          </div>
          <textarea
            value={codeContent}
            onChange={(e) => {
              setCodeContent(e.target.value);
              revokeUrl();
            }}
            placeholder="Paste your source code here..."
            rows={8}
            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-200 font-mono resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
          />
        </div>
      )}

      {/* Configuration Controls */}
      <div className="space-y-3 pt-1">
        <div>
          <label className="text-xs font-medium text-zinc-400 block mb-1">Header Title (Optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. main.py or query.sql"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Theme</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="dark">Dark (Terminal)</option>
              <option value="light">Light (Print)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Orientation</label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Size</label>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="7.5">7.5pt (Compact)</option>
              <option value="8.5">8.5pt (Standard)</option>
              <option value="10">10pt (Large)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-zinc-400">Page Format</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
            </select>
          </div>
        </div>

        {/* Line Numbers Toggle */}
        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={showLineNumbers}
            onChange={(e) => setShowLineNumbers(e.target.checked)}
            className="rounded border-zinc-800 accent-emerald-500 w-3.5 h-3.5"
          />
          <span>Include line numbers column</span>
        </label>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action / Download Buttons */}
      {!downloadUrl ? (
        <button
          onClick={handleConvert}
          disabled={isProcessing || !codeContent.trim()}
          className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed text-xs"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Formatting syntax &amp; layout...</span>
            </>
          ) : (
            <>
              <Code2 className="w-4 h-4 stroke-[2.5]" />
              <span>Convert Code to PDF</span>
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Code PDF Exported Successfully
          </div>
          <a
            href={downloadUrl}
            download={`${title.trim().replace(/\.[^/.]+$/, '') || 'code'}.pdf`}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-xs"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>Download PDF</span>
          </a>
        </div>
      )}
    </div>
  );
};