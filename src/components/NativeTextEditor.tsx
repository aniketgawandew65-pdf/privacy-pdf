import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { Upload, Download, Loader2, Undo2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { openTextEditor, type EditableDocument, type TextRun } from '../utils/nativeTextEditor';
import { useObjectUrl } from '../utils/useObjectUrl';

export default function NativeTextEditor({file,onFileChange}:{file:File|null;onFileChange:(file:File|null)=>void}) {
  const [editor,setEditor]=useState<EditableDocument|null>(null);
  const [pdf,setPdf]=useState<pdfjs.PDFDocumentProxy|null>(null);
  const [page,setPage]=useState(1),[zoom,setZoom]=useState(1);
  const [selected,setSelected]=useState<TextRun|null>(null),[draft,setDraft]=useState('');
  const [edits,setEdits]=useState<Record<string,string>>({}),[history,setHistory]=useState<Record<string,string>[]>([]);
  const [search,setSearch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [visibleRuns,setVisibleRuns]=useState(200);
  const [view,setView]=useState<'edited'|'original'>('edited');
  const [previewBytes,setPreviewBytes]=useState<Uint8Array|null>(null);
  const [previewBusy,setPreviewBusy]=useState(false);
  const original=useRef<Uint8Array|null>(null),generation=useRef(0),canvas=useRef<HTMLCanvasElement>(null),input=useRef<HTMLInputElement>(null);
  const {url,createUrl,revoke}=useObjectUrl();
  const count=Object.keys(edits).length;
  useEffect(()=>{
    const id=++generation.current;
    // Reset the previous document before this asynchronous PDF engine session starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditor(null);setEdits({});setHistory([]);setSelected(null);setPage(1);setZoom(1);setSearch('');setVisibleRuns(200);setError('');setPreviewBytes(null);original.current=null;revoke();
    if(!file){setBusy(false);return;}
    setBusy(true);
    void (async()=>{
      try {
        if(file.size>25*1024*1024)throw new Error('Use a PDF under 25 MB for the text editor.');
        const bytes=new Uint8Array(await file.arrayBuffer());
        const next=await openTextEditor(bytes);
        if(id!==generation.current)return;
        original.current=bytes;setEditor(next);setPreviewBytes(bytes);setView('edited');
      }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'Could not open this PDF.');}
      finally{if(id===generation.current)setBusy(false);}
    })();
    return ()=>{generation.current=id+1;};
  // File changes own the editor session; URL helpers are stable.
  },[file,revoke]);

  useEffect(()=>{
    const bytes=view==='original'?original.current:previewBytes;
    // The old PDF.js document is destroyed below; do not keep rendering it while the next one loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPdf(null);setPreviewBusy(!!bytes);
    if(!bytes)return;
    const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false});let active=true;
    void task.promise.then(doc=>{if(active)setPdf(doc);}).catch(e=>{if(active){setError(String(e.message||e));setPreviewBusy(false);}});
    return()=>{active=false;void task.destroy();};
  },[previewBytes,view]);

  useEffect(()=>{
    if(!pdf||!canvas.current)return;
    setPreviewBusy(true);
    let active=true;let rendering:pdfjs.RenderTask|undefined;
    void (async()=>{
      const p=await pdf.getPage(page);if(!active||!canvas.current)return;
      const base=p.getViewport({scale:1});
      const viewport=p.getViewport({scale:Math.min(1.6,1200/base.width)});
      const c=canvas.current;c.width=viewport.width;c.height=viewport.height;
      const context=c.getContext('2d');if(!context)throw new Error('Page preview is unavailable on this device.');
      rendering=p.render({canvasContext:context,viewport});await rendering.promise;
      if(active)setPreviewBusy(false);
    })().catch(e=>{if(active&&e.name!=='RenderingCancelledException'){if(canvas.current)canvas.current.width=0;setPreviewBusy(false);setError(e.message||'Could not render this page.');}});
    return()=>{active=false;rendering?.cancel();};
  },[pdf,page]);

  async function update(next:Record<string,string>,saveHistory=true) {
    if(!editor)return;const id=generation.current;setBusy(true);setError('');
    try {
      const bytes=await editor.export(Object.entries(next).map(([id,text])=>({id,text})));
      if(id!==generation.current)return;
      if(saveHistory)setHistory(h=>[...h,edits]);
      setEdits(next);setPreviewBytes(bytes);setView('edited');createUrl(new Blob([bytes as BlobPart],{type:'application/pdf'}));
    }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'Could not apply this edit.');}
    finally{if(id===generation.current)setBusy(false);}
  }
  function select(run:TextRun){setSelected(run);setDraft(edits[run.id]??run.text);setError('');}
  const pageRuns=editor?.runs.filter(r=>r.page===page&&`${r.text} ${edits[r.id]||''}`.toLowerCase().includes(search.toLowerCase()))||[];
  return <div className="native-editor">
    <div className="native-intro"><strong>Edit existing text · Beta</strong><p>For supported computer-generated PDFs. Reuses the original font and edits the text instructions in the file. No document upload.</p></div>
    <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)onFileChange(f);e.target.value='';}} />
    {!file?<button className="native-upload" onClick={()=>input.current?.click()}><Upload size={28}/><strong>Choose a PDF to edit</strong><span>Computer-generated documents · Up to 25 MB</span></button>:<div className="native-toolbar"><strong className="native-filename">{file.name}</strong><button disabled={busy} onClick={()=>input.current?.click()}>Change file</button><button disabled={busy} onClick={()=>onFileChange(null)}>Clear</button></div>}
    {error&&<p role="alert" className="native-error">{error}</p>}
    {busy&&<p role="status" className="native-status"><Loader2 className="animate-spin" size={18}/> {editor?'Applying changes to the PDF…':'Inspecting text and embedded fonts…'}</p>}
    {editor&&<>
      <div className="native-toolbar">
        <button aria-label="Previous page" disabled={page===1||busy} onClick={()=>{setPage(p=>p-1);setSelected(null);}}><ChevronLeft size={18}/></button>
        <span>Page {page} of {editor.pageCount}</span>
        <button aria-label="Next page" disabled={page===editor.pageCount||busy} onClick={()=>{setPage(p=>p+1);setSelected(null);}}><ChevronRight size={18}/></button>
        <button aria-label="Zoom out" disabled={zoom<=0.75} onClick={()=>setZoom(z=>Math.max(.75,z-.25))}><ZoomOut size={18}/></button>
        <button aria-label="Zoom in" disabled={zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.25))}><ZoomIn size={18}/></button>
        <div className="native-view" role="group" aria-label="Compare document"><button aria-pressed={view==='original'} onClick={()=>setView('original')}>Original</button><button aria-pressed={view==='edited'} onClick={()=>setView('edited')}>Edited</button></div>
      </div>
      <div className="native-layout">
        <div className="native-preview" aria-busy={previewBusy}>{previewBusy&&<p role="status" className="native-status">Rendering {view} page…</p>}<canvas ref={canvas} style={{width:`${zoom*100}%`,visibility:previewBusy?'hidden':'visible'}} aria-label={`${view==='original'?'Original':'Edited'} PDF page ${page}`}/></div>
        <section className="native-text-panel" aria-label="Existing PDF text">
          <h2>Choose text to change</h2><p className="native-help">Text is listed in PDF storage order, which may differ from reading order.</p>
          <input type="search" aria-label="Find text on this page" placeholder="Find text on this page" value={search} onChange={e=>setSearch(e.target.value)}/>
          <div className="native-runs">{pageRuns.slice(0,visibleRuns).map(run=><button key={run.id} disabled={busy} aria-pressed={selected?.id===run.id} onClick={()=>select(run)}><span>{edits[run.id]??run.text}</span><small>{run.font.replace(/^[A-Z]{6}\+/,'')} · {run.fontSize.toFixed(1)} pt{edits[run.id]!==undefined?' · Edited':''}</small></button>)}</div>
          {pageRuns.length>visibleRuns&&<button className="native-help" onClick={()=>setVisibleRuns(n=>n+200)}>Show more text ({visibleRuns} of {pageRuns.length})</button>}
          {!pageRuns.length&&<p className="native-empty">{search?'No matching editable text on this page.':'No supported editable text found on this page. It may be scanned, use outlines, or contain fonts or objects this editor does not support.'}</p>}
          {selected&&<form onSubmit={e=>{e.preventDefault();const next={...edits};if(draft===selected.text)delete next[selected.id];else next[selected.id]=draft;void update(next);}}>
            <label htmlFor="native-replacement">Replacement text</label><textarea id="native-replacement" rows={3} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/>
            <p className="native-help">Original font and size stay unchanged. Longer text must fit the original width; unavailable characters are rejected.</p>
            <button className="primary-button" disabled={busy||draft===(edits[selected.id]??selected.text)}>Apply and preview</button>
          </form>}
        </section>
      </div>
      <div className="native-toolbar"><button disabled={busy||!history.length} onClick={()=>{const next=history.at(-1)!;setHistory(h=>h.slice(0,-1));setSelected(null);void update(next,false);}}><Undo2 size={17}/>Undo last edit</button><span>{count} text {count===1?'change':'changes'}</span>{url&&count>0&&!busy&&<a className="primary-button" href={url} download={`edited_${file?.name||'document.pdf'}`}><Download size={17}/>Download edited PDF</a>}</div>
      <p className="native-help">Review each changed page before sharing. This is text editing, not secure redaction or certificate signing. Keep your original; editing can invalidate existing digital signatures.</p>
      {!!editor.notices.length&&<details className="native-support"><summary>Compatibility notes ({editor.notices.length})</summary><ul>{editor.notices.map(n=><li key={n}>{n}</li>)}</ul></details>}
    </>}
  </div>;
}
