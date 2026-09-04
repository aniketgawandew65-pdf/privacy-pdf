import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  FileCheck2,
  Layers,
  HelpCircle,
} from 'lucide-react';
import {
  getPDFFormFields,
  fillAndFlattenPDF,
  type FormFieldData,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface FillFormPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const FillFormPdf: React.FC<FillFormPdfProps> = ({ file, onFileChange }) => {
  const [fields, setFields] = useState<FormFieldData[]>([]);
  const [formData, setFormData] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(true);

  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Load interactive form fields
  useEffect(() => {
    if (!file) {
      setFields([]);
      setFormData({});
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoadingFields(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    (async () => {
      try {
        const detectedFields = await getPDFFormFields(file);
        if (!isMounted) return;

        setFields(detectedFields);

        // Initialize state values
        const initialData: Record<string, string | boolean> = {};
        detectedFields.forEach((f) => {
          initialData[f.name] = f.value;
        });
        setFormData(initialData);
      } catch (err) {
        console.error('Failed to read form fields:', err);
        if (isMounted) {
          setErrorMessage('Could not scan form fields. The document may be corrupted or password-protected.');
        }
      } finally {
        if (isMounted) setIsLoadingFields(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  const handleFieldChange = (name: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    revokeDownloadUrl();
  };

  const handleProcessForm = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await fillAndFlattenPDF(file, formData, flatten);
      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Failed to fill form:', err);
      setErrorMessage(err.message || 'Failed to process form.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setFields([]);
    setFormData({});
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to fill form fields"
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
          <FileCheck2 className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF form here to fill & flatten</p>
          <p className="text-xs text-zinc-500 mt-1">Populate interactive text fields, checkboxes & bake permanently</p>
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
                  {fields.length > 0 ? `${fields.length} detected fields` : 'Scanning fields...'}
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

          {/* Loading Indicator */}
          {isLoadingFields && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
              <p className="text-xs text-zinc-400">Inspecting interactive form structure...</p>
            </div>
          )}

          {/* No Fields Notice */}
          {!isLoadingFields && fields.length === 0 && (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/30 flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200/90 space-y-1">
                <p className="font-semibold">No interactive form fields detected</p>
                <p className="text-zinc-400 leading-relaxed">
                  This document is a flat or scanned PDF without native AcroForm inputs. To overlay text or signatures onto a flat page, use the{' '}
                  <span className="text-emerald-400 font-medium">Sign PDF</span> tool.
                </p>
              </div>
            </div>
          )}

          {/* Interactive Form Fields Inputs */}
          {!isLoadingFields && fields.length > 0 && (
            <div className="space-y-4 max-h-[380px] overflow-y-auto p-1 pr-2 scrollbar-thin">
              {fields.map((field) => (
                <div key={field.name} className="space-y-1.5 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/70">
                  <label className="text-xs font-medium text-zinc-300 block truncate">
                    {field.name}
                  </label>

                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={(formData[field.name] as string) || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                      placeholder={`Enter ${field.name}...`}
                    />
                  )}

                  {field.type === 'checkbox' && (
                    <label className="flex items-center gap-2.5 text-xs text-zinc-400 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={Boolean(formData[field.name])}
                        onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                      />
                      <span>Checked</span>
                    </label>
                  )}

                  {field.type === 'dropdown' && (
                    <select
                      value={(formData[field.name] as string) || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Flatten Option Toggle */}
          {fields.length > 0 && (
            <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="text-xs font-medium text-zinc-200">Flatten Form</p>
                  <p className="text-[11px] text-zinc-500">Bake fields permanently into static text</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={flatten}
                onChange={(e) => setFlatten(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
              />
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger */}
          {!downloadUrl ? (
            <button
              onClick={handleProcessForm}
              disabled={isProcessing || fields.length === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving form data...</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4 stroke-[2.5]" />
                  <span>{flatten ? 'Fill & Flatten PDF' : 'Save Filled Form PDF'}</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Form Processed & Saved Successfully
              </div>
              <a
                href={downloadUrl}
                download={`filled_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Filled PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};