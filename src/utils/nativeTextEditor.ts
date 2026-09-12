import { PDFDocument, PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, StandardFontEmbedder, StandardFonts, decodePDFRawStream } from 'pdf-lib';

type Token = { kind: 'string'|'name'|'number'|'word'|'array'|'dict'; start: number; end: number; value: string; children?: Token[] };
type FontMap = { name: string; decode: (hex: string) => string; encode: (text: string) => string; width: (hex: string) => number; codeSize: number };
export type TextRun = { id: string; page: number; text: string; font: string; fontSize: number };
type InternalRun = TextRun & { start: number; end: number; map: FontMap; advance: number; charSpacing: number; wordSpacing: number };
export type TextEdit = { id: string; text: string };
export type EditableDocument = { runs: TextRun[]; pageCount: number; notices: string[]; export: (edits: TextEdit[]) => Promise<Uint8Array> };
const name = (s: string) => PDFName.of(s);
const bytesToString = (bytes: Uint8Array) => { let s=''; for(let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.subarray(i,i+8192)); return s; };
const hex = (s: string) => Array.from(s,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('').toUpperCase();
const number = (dict: PDFDict, key: string, fallback=0) => { const v=dict.lookup(name(key)); return v instanceof PDFNumber?v.asNumber():fallback; };

// Parse PDF strings and arrays, not JavaScript strings or regex matches against binary data.
function tokenize(source: string): Token[] {
  let i=0, count=0;
  function next(depth=0): Token|undefined {
    if(depth>30 || ++count>500000) throw new Error('This page is too complex for the text editor.');
    while(i<source.length) { if(/[\s\0]/.test(source[i])) {i++;continue;} if(source[i]==='%'){while(i<source.length&&!/[\r\n]/.test(source[i]))i++;continue;} break; }
    if(i>=source.length)return;
    const start=i, c=source[i++];
    if(c==='(') {
      let value='', nesting=1;
      while(i<source.length&&nesting) {
        let ch=source[i++];
        if(ch==='\\') {
          ch=source[i++];
          if(ch==='\r'||ch==='\n') {if(ch==='\r'&&source[i]==='\n')i++;continue;}
          if(/[0-7]/.test(ch||'')){let oct=ch;while(oct.length<3&&/[0-7]/.test(source[i]||''))oct+=source[i++];value+=String.fromCharCode(parseInt(oct,8)&255);}
          else value+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'} as Record<string,string>)[ch]??ch;
        } else if(ch==='('){nesting++;value+=ch;} else if(ch===')'){if(--nesting)value+=ch;}
        else if(ch==='\r'){if(source[i]==='\n')i++;value+='\n';} else value+=ch;
      }
      if(nesting)throw new Error('Malformed PDF text string.');
      return {kind:'string',start,end:i,value:hex(value)};
    }
    if(c==='<'&&source[i]!=='<') {
      const close=source.indexOf('>',i);if(close<0)throw new Error('Malformed PDF hex string.');
      let value=source.slice(i,close).replace(/\s/g,'').toUpperCase();if(!/^[\dA-F]*$/.test(value))throw new Error('Invalid hex string.');if(value.length%2)value+='0';i=close+1;
      return {kind:'string',start,end:i,value};
    }
    if(c==='['||(c==='<'&&source[i]==='<')) {
      const dict=c==='<';if(dict)i++;const children: Token[]=[];
      while(i<source.length) {
        while(/\s/.test(source[i]||''))i++;
        if((!dict&&source[i]===']')||(dict&&source.slice(i,i+2)==='>>')){i+=dict?2:1;return {kind:dict?'dict':'array',start,end:i,value:'',children};}
        const child=next(depth+1);if(child)children.push(child);
      }
      throw new Error('Unclosed PDF array or dictionary.');
    }
    if(c==='/') {while(i<source.length&&!/[\s\0()[\]<>/%]/.test(source[i]))i++;return {kind:'name',start,end:i,value:source.slice(start+1,i).replace(/#([\da-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))};}
    while(i<source.length&&!/[\s\0()[\]<>/%]/.test(source[i]))i++;
    const value=source.slice(start,i);
    if(value==='BI')throw new Error('Inline-image content is not supported by this editor yet.');
    return {kind:/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)?'number':'word',start,end:i,value};
  }
  const result: Token[]=[];let t:Token|undefined;while((t=next()))result.push(t);return result;
}

function unicodeHex(s: string) {if(s.length%4)throw new Error('Unsupported Unicode mapping.');let out='';for(let i=0;i<s.length;i+=4)out+=String.fromCharCode(parseInt(s.slice(i,i+4),16));return out;}
function cmap(stream: PDFRawStream): Map<string,string> {
  const source=bytesToString(decodePDFRawStream(stream).decode());
  if(source.includes('usecmap'))throw new Error('Inherited font character maps are not supported yet.');
  const result=new Map<string,string>();
  for(const section of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const m of section[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi))result.set(m[1].toUpperCase(),unicodeHex(m[2]));
  for(const section of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const ts=tokenize(section[1]);
    for(let i=0;i<ts.length;i+=3) {
      const [a,b,c]=ts.slice(i,i+3);if(!a||!b||!c||a.kind!=='string'||b.kind!=='string')throw new Error('Unsupported character range.');
      const first=parseInt(a.value,16),last=parseInt(b.value,16);if(last-first>65536||last<first)throw new Error('Character range is too large.');
      for(let n=first;n<=last;n++) {
        const dest=c.kind==='array'?c.children?.[n-first]?.value:(BigInt('0x'+c.value)+BigInt(n-first)).toString(16).padStart(c.value.length,'0');
        if(!dest)throw new Error('Incomplete font character range.');
        result.set(n.toString(16).padStart(a.value.length,'0').toUpperCase(),unicodeHex(dest));
      }
    }
  }
  return result;
}

function fontMap(font: PDFDict): FontMap {
  const subtype=font.lookup(name('Subtype'))?.toString();
  const base=font.lookup(name('BaseFont'))?.toString().slice(1)||'Embedded font';
  if(!['/Type0','/TrueType','/Type1'].includes(subtype||''))throw new Error('Unsupported font type.');
  const composite=subtype==='/Type0';
  const enc=font.lookup(name('Encoding'));
  if(composite&&enc?.toString()!=='/Identity-H')throw new Error('Only horizontal Identity-H composite fonts are supported.');
  let widthsFont=font;
  if(composite) {const descendants=font.lookup(name('DescendantFonts'));if(!(descendants instanceof PDFArray))throw new Error('Missing descendant font.');const d=descendants.lookup(0);if(!(d instanceof PDFDict))throw new Error('Missing font metrics.');widthsFont=d;}
  const toUnicode=font.lookup(name('ToUnicode'));
  let mapping=toUnicode instanceof PDFRawStream?cmap(toUnicode):new Map<string,string>();
  let standard:StandardFontEmbedder|undefined;
  if(!composite&&Object.values(StandardFonts).includes(base as StandardFonts))standard=StandardFontEmbedder.for(base as Parameters<typeof StandardFontEmbedder.for>[0]);
  if(!mapping.size) {
    if(composite||enc instanceof PDFDict||(!standard&&enc?.toString()!=='/WinAnsiEncoding'))throw new Error('This font has no supported Unicode map.');
    if(standard&&enc&&enc.toString()!=='/WinAnsiEncoding')throw new Error('This font encoding needs an explicit Unicode map.');
    if(standard) {
      // Without an explicit encoding, only the shared ASCII range is unambiguous.
      for(let n=32;n<(enc?256:127);n++) {if(!enc&&(n===39||n===96))continue;const char=new TextDecoder('windows-1252').decode(Uint8Array.of(n));try {mapping.set(standard.encodeText(char).asString().toUpperCase(),char);}catch{/* Not a character in this font. */}}
    } else {
      for(let n=32;n<256;n++) mapping.set(n.toString(16).padStart(2,'0').toUpperCase(),new TextDecoder('windows-1252').decode(Uint8Array.of(n)));
    }
  }
  const codeSize=composite?4:2;
  mapping=new Map([...mapping].filter(([code])=>code.length===codeSize));
  const inverse=new Map<string,string>();for(const [code,char] of mapping)if(!inverse.has(char))inverse.set(char,code);
  const ambiguous=new Set<string>();for(const [code,char] of mapping)if(inverse.get(char)!==code)ambiguous.add(char);
  const widths=new Map<number,number>();
  if(composite) {
    const w=widthsFont.lookup(name('W'));
    if(w instanceof PDFArray)for(let i=0;i<w.size();) {
      const first=w.lookup(i++),next=w.lookup(i++);if(!(first instanceof PDFNumber))throw new Error('Invalid font widths.');
      if(next instanceof PDFArray){for(let j=0;j<next.size();j++){const v=next.lookup(j);if(v instanceof PDFNumber)widths.set(first.asNumber()+j,v.asNumber());}}
      else {const width=w.lookup(i++);if(!(next instanceof PDFNumber)||!(width instanceof PDFNumber)||next.asNumber()-first.asNumber()>65536)throw new Error('Invalid font width range.');for(let n=first.asNumber();n<=next.asNumber();n++)widths.set(n,width.asNumber());}
    }
  } else {
    const w=font.lookup(name('Widths')),first=number(font,'FirstChar');
    if(w instanceof PDFArray)for(let i=0;i<w.size();i++){const v=w.lookup(i);if(v instanceof PDFNumber)widths.set(first+i,v.asNumber());}
    if(!w&&!standard)throw new Error('This font has no usable width information.');
  }
  const decode=(s:string)=>{if(s.length%codeSize)throw new Error('Unsupported character encoding.');let text='';for(let i=0;i<s.length;i+=codeSize){const char=mapping.get(s.slice(i,i+codeSize));if(char===undefined)throw new Error('Unmapped font character.');text+=char;}return text;};
  return {name:base,codeSize,decode,encode:(text:string)=>{
    if(/[\p{Mark}\u0590-\u0DFF\u200C-\u200F\u202A-\u202E\u2066-\u2069]/u.test(text))throw new Error('This text needs contextual shaping or right-to-left layout, which this editor does not yet support.');
    let out='';for(const char of Array.from(text)){const code=inverse.get(char);if(!code||ambiguous.has(char))throw new Error(`The original font cannot reproduce “${char}” unambiguously. Use characters available in this PDF.`);out+=code;}return out;
  },width:(s:string)=>{
    let width=0;for(let i=0;i<s.length;i+=codeSize){const code=s.slice(i,i+codeSize),n=parseInt(code,16);const w=widths.get(n);if(w!==undefined)width+=w;else if(composite)width+=number(widthsFont,'DW',1000);else if(standard)width+=standard.widthOfTextAtSize(decode(code),1000);else throw new Error('Missing character width.');}return width;
  }};
}

export async function openTextEditor(input: Uint8Array): Promise<EditableDocument> {
  const doc=await PDFDocument.load(input,{updateMetadata:false});
  const pages=doc.getPages(),runs:InternalRun[]=[],sources=new Map<number,string>(),notices=new Set<string>();
  for(let pageIndex=0;pageIndex<pages.length;pageIndex++) {
    const page=pages[pageIndex];
    try {
      const contents=page.node.Contents();const streams=contents instanceof PDFArray?contents.asArray().map(x=>doc.context.lookup(x)):contents?[contents]:[];
      const strings=streams.map(s=>{if(!(s instanceof PDFRawStream))throw new Error('Unsupported content stream.');return bytesToString(decodePDFRawStream(s).decode());});
      const source=strings.join('\n');if(source.length>16*1024*1024)throw new Error('Page content exceeds the editor’s memory limit.');
      const tokens=tokenize(source);
      const resources=page.node.Resources(),fonts=resources?.lookup(name('Font'));
      const hasActualText=(ts:Token[]):boolean=>ts.some(t=>(t.kind==='name'&&t.value==='ActualText')||(t.children&&hasActualText(t.children)));
      if(hasActualText(tokens))throw new Error('This page has alternate ActualText content and remains read-only.');
      const properties=resources?.lookup(name('Properties'));
      if(properties instanceof PDFDict&&properties.entries().some(([key])=>{const p=properties.lookup(key);return p instanceof PDFDict&&p.has(name('ActualText'));}))throw new Error('This page has alternate text in its marked-content properties.');
      const states=resources?.lookup(name('ExtGState'));
      if(states instanceof PDFDict&&states.entries().some(([key])=>{const s=states.lookup(key);return s instanceof PDFDict&&s.has(name('Font'));}))throw new Error('Fonts selected through external graphics states are not supported yet.');
      const maps=new Map<string,FontMap>();
      if(fonts instanceof PDFDict)for(const [key] of fonts.entries()){const font=fonts.lookup(key);try{if(font instanceof PDFDict)maps.set(key.decodeText(),fontMap(font));}catch{/* Unsupported fonts remain read-only. */}}
      let state={font:'',size:0,char:0,word:0,render:0},inside=false;
      const stack:typeof state[]=[];let operands:Token[]=[];
      for(const token of tokens) {
        if(token.kind!=='word'){operands.push(token);continue;}
        const op=token.value, n=(idx:number)=>Number(operands[idx]?.value);
        if(op==='q')stack.push({...state});if(op==='Q')state=stack.pop()||{font:'',size:0,char:0,word:0,render:0};
        if(op==='BT')inside=true;if(op==='ET')inside=false;
        if(op==='Tf'&&operands.length===2)state={...state,font:operands[0].value,size:n(1)};
        if(op==='Tc')state.char=n(0);if(op==='Tw')state.word=n(0);if(op==='Tr')state.render=n(0);
        if(op==='"'){state.word=n(0);state.char=n(1);}
        if(inside&&['Tj','TJ',"'",'"'].includes(op)) {
          const map=maps.get(state.font),arg=operands.at(-1);
          if(map&&arg&&state.size>0&&[0,1,2].includes(state.render))try {
            const parts=arg.kind==='array'?arg.children||[]:[arg];
            if(parts.some(t=>!['string','number'].includes(t.kind)))throw new Error('Invalid text array.');
            let text='',advance=0;
            for(const p of parts) {
              if(p.kind==='number'){advance-=Number(p.value);continue;}
              text+=map.decode(p.value);advance+=map.width(p.value)+(p.value.length/map.codeSize)*state.char*1000/state.size;
              if(map.codeSize===2)for(let i=0;i<p.value.length;i+=2)if(p.value.slice(i,i+2)==='20')advance+=state.word*1000/state.size;
            }
            if(text.trim()&&Number.isFinite(advance))runs.push({id:`${pageIndex}:${arg.start}`,page:pageIndex+1,text,font:map.name,fontSize:state.size,start:operands[0].start,end:token.end,map,advance,charSpacing:state.char,wordSpacing:state.word});
            // Quote operators move to another line / set spacing. Keep them read-only for now.
            if(op!== 'Tj'&&op!=='TJ'&&runs.at(-1)?.id===`${pageIndex}:${arg.start}`)runs.pop();
          }catch{notices.add(`Some text on page ${pageIndex+1} uses an unsupported encoding.`);}
          else notices.add(`Some text on page ${pageIndex+1} cannot be edited with its original font.`);
        }
        if(op==='Do')notices.add(`Page ${pageIndex+1} contains an image or reusable object. Text inside reusable objects is read-only.`);
        operands=[];
      }
      sources.set(pageIndex,source);
    }catch(err){notices.add(`Page ${pageIndex+1}: ${err instanceof Error?err.message:'Cannot inspect this page.'}`);}
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {runs:runs.map(({id,page,text,font,fontSize})=>({id,page,text,font,fontSize})),pageCount:pages.length,notices:[...notices],export:async edits=>{
    // Always rebuild from the source so undo and repeated previews never accumulate edits.
    const output=await PDFDocument.load(input,{updateMetadata:false}),byPage=new Map<number,{start:number;end:number;value:string}[]>();
    const seen=new Set<string>();
    for(const edit of edits) {
      const run=runs.find(r=>r.id===edit.id);if(!run||seen.has(edit.id))throw new Error('This edit no longer matches the original PDF.');seen.add(edit.id);
      if(edit.text===run.text)continue;
      if(/[\r\n\t\0]/.test(edit.text))throw new Error('Use a single line of text for each selection.');
      const encoded=run.map.encode(edit.text);let advance=run.map.width(encoded)+(encoded.length/run.map.codeSize)*run.charSpacing*1000/run.fontSize;
      if(run.map.codeSize===2)for(let i=0;i<encoded.length;i+=2)if(encoded.slice(i,i+2)==='20')advance+=run.wordSpacing*1000/run.fontSize;
      if(advance>run.advance+1)throw new Error('The replacement is wider than the original text. Use shorter wording to avoid overlapping nearby content.');
      const compensation=advance-run.advance;
      const value=`[<${encoded}> ${compensation.toFixed(6)}] TJ`;
      const list=byPage.get(run.page-1)||[];list.push({start:run.start,end:run.end,value});byPage.set(run.page-1,list);
    }
    for(const [idx,changes] of byPage) {
      let source=sources.get(idx)!;
      for(const c of changes.sort((a,b)=>b.start-a.start))source=source.slice(0,c.start)+c.value+source.slice(c.end);
      const stream=output.context.flateStream(Uint8Array.from(source,c=>c.charCodeAt(0)));
      output.getPage(idx).node.set(name('Contents'),output.context.register(stream));
    }
    return output.save({useObjectStreams:true});
  }};
}
