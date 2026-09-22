import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileText, Loader2, X } from 'lucide-react';
import { convertPdfToWord } from '../utils/pdfToWord/convert';
import type { ConversionReport } from '../utils/pdfToWord/model';
import {
  clearPdfToWordRecovery,
  pdfToWordJobMatchesFile,
  preparePdfToWordRecovery,
  readPdfToWordJobMeta,
  readPdfToWordPage,
  writePdfToWordPage,
} from '../utils/pdfToWord/recovery';
import { checkTaskCredit, commitTaskCredit } from '../utils/taskCreditGate';
import {
  clearProcessingRecovery,
  exclusivelyProcess,
  hasRecoverableProcessing,
} from '../utils/localProcessing';
import { saveWorkspaceFiles } from '../utils/localWorkspace';
import { useObjectUrl } from '../utils/useObjectUrl';
import { useDesktopCapacityRecommendation } from '../hooks/useDesktopCapacityRecommendation';
import { DesktopCapacityStatus } from './DesktopCapacityStatus';

interface Props { file: File | null; onFileChange: (file: File | null) => void }

export function PdfToWord({ file, onFileChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const checkedRecoveryFile = useRef<File | null>(null);
  const resumeAttempted = useRef(false);
  const { url, createUrl, revokeNow } = useObjectUrl();
  const { recommendation } = useDesktopCapacityRecommendation({
    toolId: 'pdf-to-word', selectedBytes: file?.size ?? 0, pageCount, enabled: Boolean(file),
  });

  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    revokeNow(); setReport(null); setError(null); setStatus(''); setPageCount(null); setBusy(false);
    setRecoveryReady(false);
    resumeAttempted.current = false;
    checkedRecoveryFile.current = null;
    return () => { controller.current?.abort(); };
  }, [file, revokeNow]);

  useEffect(() => {
    if (!file || checkedRecoveryFile.current === file) return;

    checkedRecoveryFile.current = file;
    let cancelled = false;

    void (async () => {
      try {
        const meta = await readPdfToWordJobMeta();
        if (
          !cancelled &&
          hasRecoverableProcessing() &&
          pdfToWordJobMatchesFile(meta, file)
        ) {
          setRecoveryReady(true);
        }
      } catch (cause) {
        console.warn('Unable to inspect interrupted PDF to Word job:', cause);
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  async function discardRecovery() {
    await clearPdfToWordRecovery();
    clearProcessingRecovery();
    setRecoveryReady(false);
    resumeAttempted.current = false;
  }

  async function selectFile(selected?: File) {
    if (!selected) return;
    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file to continue.'); return;
    }
    await discardRecovery();
    onFileChange(selected);
  }

  async function convert() {
    if (!file || controller.current) return;
    const run = new AbortController();
    controller.current = run;
    setBusy(true); setError(null); setReport(null); revokeNow(); setProgress(0); setStatus('Reading PDF…');

    try {
      await exclusivelyProcess(async () => {
        run.signal.throwIfAborted();
        const check = checkTaskCredit(file);
        if (!check.allowed) throw new Error(check.errorMessage || 'This task is not available on your current plan.');

        let recoveryEnabled = false;
        try {
          await saveWorkspaceFiles([file]);
          await preparePdfToWordRecovery(file);
          recoveryEnabled = true;
        } catch (recoveryError) {
          console.warn('PDF to Word restart recovery unavailable:', recoveryError);
        }

        const result = await convertPdfToWord(
          file,
          run.signal,
          (message, percent, pages) => {
            if (controller.current !== run) return;
            setStatus(message); setProgress(percent); setPageCount(pages);
          },
          recoveryEnabled
            ? {
                readPage: readPdfToWordPage,
                writePage: writePdfToWordPage,
              }
            : {},
        );

        run.signal.throwIfAborted();
        createUrl(result.blob); setReport(result.report); setProgress(100); setStatus('Word file ready.');

        if (recoveryEnabled) await clearPdfToWordRecovery();
        clearProcessingRecovery();
        setRecoveryReady(false);
        resumeAttempted.current = false;
        commitTaskCredit();
      });
    } catch (cause) {
      if (controller.current !== run) return;

      if (run.signal.aborted) {
        await discardRecovery();
        setStatus('Conversion cancelled. No task credit used.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Unable to convert this PDF.');
      }
    } finally {
      if (controller.current === run) { controller.current = null; setBusy(false); }
    }
  }

  useEffect(() => {
    if (!file || !recoveryReady || resumeAttempted.current || controller.current) return;

    const timer = window.setTimeout(() => {
      if (resumeAttempted.current || controller.current) return;
      resumeAttempted.current = true;
      void convert();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [file, recoveryReady]);

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 text-white space-y-6">
      {!file ? (
        <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); }} className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-2xl p-10 text-center transition cursor-pointer bg-zinc-900/30">
          <input id="word-upload" type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = ''; }} />
          <label htmlFor="word-upload" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.getElementById('word-upload')?.click(); } }} className="cursor-pointer flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center text-zinc-400"><FileText className="w-7 h-7" /></div>
            <span className="text-base font-medium text-zinc-200">Select PDF to convert to Word</span>
            <span className="text-xs text-zinc-500">Digital PDFs · Editable text and tables · No uploads</span>
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0"><FileText className="w-5 h-5 text-emerald-500 shrink-0" /><div className="truncate text-sm"><span className="text-zinc-200 font-medium">{file.name}</span><span className="text-xs text-zinc-500 block">{(file.size / 1024 / 1024).toFixed(2)} MB{pageCount !== null ? ` · ${pageCount} pages` : ''}</span></div></div>
            <button type="button" aria-label="Remove file" disabled={busy} onClick={() => { void discardRecovery().then(() => onFileChange(null)); }} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"><X className="w-4 h-4" /></button>
          </div>
          {recommendation && <DesktopCapacityStatus recommendation={recommendation} />}
          <p className="text-xs text-zinc-500">Convert computer-created PDFs to editable Word documents. Scans need OCR. Fonts and complex layouts may differ; review the downloaded file.</p>
          {busy ? (
            <div aria-busy="true" data-processing-active="true" className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <p role="status" className="text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{status}</p>
              <progress aria-label="Conversion progress" value={progress} max={100} className="w-full accent-emerald-500" />
              <button type="button" className="quiet-button" onClick={() => controller.current?.abort()}>Cancel conversion</button>
            </div>
          ) : url && report ? (
            <div className="space-y-3">
              <p role="status" className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Word file ready · {report.pages.length} pages · {report.pages.reduce((n, p) => n + p.tables, 0)} editable tables</p>
              <a href={url} download={file.name.replace(/\.pdf$/i, '') + '-editable.docx'} className="primary-button inline-flex items-center gap-2"><Download size={16} />Download Word document</a>
              {report.warnings.length > 0 && <details className="text-xs text-zinc-500"><summary className="cursor-pointer">Conversion notes</summary><ul className="list-disc pl-5 mt-2 space-y-1">{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
            </div>
          ) : (
            <><button type="button" onClick={() => void convert()} className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"><FileText size={16} />Convert to Word</button>{status && <p role="status" className="text-xs text-zinc-500">{status}</p>}</>
          )}
        </div>
      )}
      {error && <div role="alert" className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}
    </div>
  );
}
