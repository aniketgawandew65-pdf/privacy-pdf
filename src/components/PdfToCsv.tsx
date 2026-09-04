import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Table,
} from 'lucide-react';
import { extractTableFromPDF, type ExtractedTableResult } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface PdfToCsvProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const PdfToCsv: React.FC<PdfToCsvProps> = ({ file, onFileChange }) => {
  const [delimiter, setDelimiter] = useState<',' | ';' | '\t'>(',');
  const [yTolerance, setYTolerance] = useState<number>(4);
  const [minColumnGap, setMinColumnGap] = useState<number>(12);

  const [tableData, setTableData] = useState<ExtractedTableResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const parseDocument = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const result = await extractTableFromPDF(file, {
        delimiter,
        yTolerance,
        minColumnGap,
        onProgress: (curr, total) => {
          setProgressText(`Analyzing page ${curr} of ${total} coordinates...`);
        },
      });

      if (result.totalRows === 0) {
        setErrorMessage('No tabular data detected. If this is a scanned document, use "OCR Searchable" first.');
        setTableData(null);
      } else {
        setTableData(result);
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
        createUrl(blob);
      }
    } catch (err: any) {
      console.error('Table parsing error:', err);
      setErrorMessage(err.message || 'Failed to extract tables from document.');
      setTableData(null);
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  useEffect(() => {
    if (!file) {
      setTableData(null);
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }
    parseDocument();
  }, [file, delimiter, yTolerance, minColumnGap]);

  const handleClear = () => {
    onFileChange(null);
    setTableData(null);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to extract tables to CSV"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === 'application/pdf') {
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Table className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop bank statements or invoices to extract CSV</p>
          <p className="text-xs text-zinc-500 mt-1">100% In-Browser Table Parser • Zero Financial Data Egress</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                onFileChange(selected);
              }
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-6 text-left">
          {/* File Card */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {tableData ? `${tableData.totalRows} Rows Extracted • ` : ''}
                  {Math.round(file.size / 1024)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tuning Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs">
            <div>
              <label className="text-zinc-300 font-medium block mb-1.5">Delimiter</label>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value as any)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                <option value=",">Comma (Standard CSV)</option>
                <option value=";">Semicolon (;)</option>
                <option value="&#9;">Tab (TSV / Excel Paste)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-zinc-300 font-medium">Row Gap ({yTolerance}px)</span>
                <span className="text-zinc-500 text-[10px]">Vertical</span>
              </div>
              <input
                type="range"
                min="2"
                max="10"
                step="1"
                value={yTolerance}
                onChange={(e) => setYTolerance(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-zinc-300 font-medium">Column Gap ({minColumnGap}px)</span>
                <span className="text-zinc-500 text-[10px]">Horizontal</span>
              </div>
              <input
                type="range"
                min="6"
                max="30"
                step="2"
                value={minColumnGap}
                onChange={(e) => setMinColumnGap(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Table Data Preview */}
          {isProcessing ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3 bg-zinc-950/50 rounded-xl border border-zinc-800 text-xs text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span>{progressText || 'Parsing tabular structure...'}</span>
            </div>
          ) : tableData && tableData.rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span>Preview (First {Math.min(tableData.rows.length, 12)} rows)</span>
                <span>{tableData.totalRows} total rows found</span>
              </div>

              <div className="overflow-x-auto max-h-64 border border-zinc-800 rounded-xl bg-zinc-950/80">
                <table className="w-full text-left text-xs border-collapse">
                  <tbody>
                    {tableData.rows.slice(0, 12).map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          rIdx === 0
                            ? 'bg-zinc-900/90 text-emerald-400 font-semibold border-b border-zinc-800'
                            : 'border-b border-zinc-900/80 hover:bg-zinc-900/40 text-zinc-300'
                        }
                      >
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 border-r border-zinc-800/40 truncate max-w-[200px]">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Download Action */}
          {downloadUrl && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Ready for CSV Export ({tableData?.totalRows} rows)
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace(/\.[^/.]+$/, '')}.csv`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 text-sm"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download CSV / Excel Table</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};