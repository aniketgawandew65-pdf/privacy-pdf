import React, { useState, useRef } from 'react';
import {
  Download,
  Upload,
  Receipt,
  FileCode2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { generateHtmlPDF, type HtmlToPdfOptions } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

const RECEIPT_TEMPLATE = `<div style="text-align: center; margin-bottom: 12px;">
  <h2 style="margin: 0; font-size: 16px;">COFFEE &amp; BAKERY</h2>
  <p style="margin: 2px 0; color: #52525b; font-size: 10px;">Order #48291 • Table 4</p>
  <p style="margin: 0; color: #52525b; font-size: 10px;">Date: Sept 5, 2026 10:45 AM</p>
</div>

<hr/>

<table>
  <thead>
    <tr>
      <th>Item</th>
      <th style="text-align: center;">Qty</th>
      <th style="text-align: right;">Total</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Oat Cappuccino</td>
      <td style="text-align: center;">2</td>
      <td style="text-align: right;">$9.00</td>
    </tr>
    <tr>
      <td>Almond Croissant</td>
      <td style="text-align: center;">1</td>
      <td style="text-align: right;">$4.50</td>
    </tr>
    <tr>
      <td>Matcha Latte</td>
      <td style="text-align: center;">1</td>
      <td style="text-align: right;">$5.25</td>
    </tr>
  </tbody>
</table>

<hr/>

<div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 6px;">
  <span>Total Due:</span>
  <span>$18.75</span>
</div>

<p style="text-align: center; margin-top: 16px; font-size: 10px; color: #71717a;">
  Thank you for visiting! • Zero Cloud Saved
</p>`;

export const HtmlToPdf: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [htmlContent, setHtmlContent] = useState<string>(RECEIPT_TEMPLATE);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('receipt_document');
  const [pageSize, setPageSize] = useState<'receipt' | 'a4' | 'letter'>('receipt');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeUrl } = useObjectUrl();

  const handleFileDrop = async (selectedFile: File) => {
    setFile(selectedFile);
    setFileName(selectedFile.name.replace(/\.[^/.]+$/, ''));
    revokeUrl();
    setErrorMessage(null);

    try {
      const text = await selectedFile.text();
      setHtmlContent(text);
      if (pageSize === 'receipt') setPageSize('a4');
    } catch {
      setErrorMessage('Could not read HTML file.');
    }
  };

  const handleConvert = async () => {
    if (!htmlContent.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeUrl();

    try {
      const options: HtmlToPdfOptions = {
        html: htmlContent,
        pageSize,
        orientation,
      };

      const pdfBytes = await generateHtmlPDF(options);
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to render HTML to PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setHtmlContent('');
    setFileName('document');
    revokeUrl();
    setErrorMessage(null);
  };

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
          <Receipt className="w-3.5 h-3.5" />
          <span>HTML / Receipt Code</span>
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
          <span>Upload .html File</span>
        </button>
      </div>

      {/* Input Section */}
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
            <FileCode2 className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
            <p className="text-sm font-semibold text-zinc-200">Drop an .html file here</p>
            <p className="text-xs text-zinc-500 mt-1">Direct sandbox rendering • Zero server uploads</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,text/html"
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
              <FileCode2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
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
            <label className="font-medium text-zinc-300">HTML / Receipt Markup</label>
            <button
              onClick={() => {
                setHtmlContent(RECEIPT_TEMPLATE);
                setPageSize('receipt');
                revokeUrl();
              }}
              className="text-emerald-400 hover:underline text-[11px]"
            >
              Load Sample Receipt
            </button>
          </div>
          <textarea
            value={htmlContent}
            onChange={(e) => {
              setHtmlContent(e.target.value);
              revokeUrl();
            }}
            rows={8}
            placeholder="<div>Your HTML or Receipt Code here...</div>"
            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-200 font-mono resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
          />
        </div>
      )}

      {/* Format Controls */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="space-y-1">
          <label className="text-[11px] text-zinc-400">Page Format</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(e.target.value as any);
              revokeUrl();
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="receipt">80mm Thermal Receipt</option>
            <option value="a4">A4 (Invoice / Document)</option>
            <option value="letter">US Letter</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-zinc-400">Orientation</label>
          <select
            value={orientation}
            disabled={pageSize === 'receipt'}
            onChange={(e) => {
              setOrientation(e.target.value as any);
              revokeUrl();
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-40"
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
      </div>

      {/* Error Feedback */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      {!downloadUrl ? (
        <button
          onClick={handleConvert}
          disabled={isProcessing || !htmlContent.trim()}
          className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed text-xs"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Rendering HTML into PDF...</span>
            </>
          ) : (
            <>
              <Receipt className="w-4 h-4 stroke-[2.5]" />
              <span>Convert to PDF</span>
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
            <CheckCircle2 className="w-4 h-4" /> PDF Generated Successfully
          </div>
          <a
            href={downloadUrl}
            download={`${fileName || 'document'}.pdf`}
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

export default HtmlToPdf;