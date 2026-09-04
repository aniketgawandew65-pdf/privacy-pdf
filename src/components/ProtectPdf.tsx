import React, { useState, useRef } from 'react';
import { Upload, FileText, Download, Loader2, CheckCircle2, X, Lock, Eye, EyeOff } from 'lucide-react';
import { encryptPDF } from '../utils/pdfEngine';

interface ProtectPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const ProtectPdf: React.FC<ProtectPdfProps> = ({ file, onFileChange }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProtect = async () => {
    if (!file) return;

    if (!password) {
      setError('Please enter a password.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(0);

    try {
      const outputBytes = await encryptPDF(file, password, (p) => setProgress(p));
      const blob = new Blob([outputBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      console.error(err);
      setError('Failed to encrypt PDF. The file may be corrupted or already restricted.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setPassword('');
    setConfirmPassword('');
    setDownloadUrl(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]?.type === 'application/pdf') {
              onFileChange(e.dataTransfer.files[0]);
              setDownloadUrl(null);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to password-protect</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]?.type === 'application/pdf') {
                onFileChange(e.target.files[0]);
                setDownloadUrl(null);
              }
            }}
          />
        </div>
      ) : (
        <div className="space-y-5 text-left">
          {/* File Card */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
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

          {/* Password Inputs */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Set Document Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setDownloadUrl(null);
                  }}
                  placeholder="Enter secure password"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setDownloadUrl(null);
                }}
                placeholder="Re-enter password"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Encrypting pages...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleProtect}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Protecting PDF...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Encrypt & Protect PDF</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>PDF encrypted with standard 128-bit password protection!</span>
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace('.pdf', '')}_protected.pdf`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Protected PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};