import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Synthetic, non-sensitive digital documents. Labels describe test coverage;
// the converter never sees them as classification hints.
export async function makeCorpus(directory) {
  await mkdir(directory, { recursive: true });
  const specs = [
    ['invoice','table'], ['letter','flow'], ['resume','columns'], ['contract','flow'],
    ['certificate','art'], ['financial-report','table'], ['two-columns','columns'],
    ['complex-table','table'], ['merged-cells','merged'], ['form','table'],
    ['logo-heavy','art'], ['rotated-text','rotate'], ['landscape','landscape'],
    ['mixed-page-sizes','mixed'], ['different-fonts','fonts'], ['mixed-artwork','art'],
    ['unruled-table','unruled'], ['rounded-header','rounded'], ['cropped-rotated-page','crop'],
    ['page-containment','containment'],
  ];
  const manifest = [];
  for (const [name, type] of specs) {
    const pdf = await PDFDocument.create();
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const serif = await pdf.embedFont(StandardFonts.TimesRoman);
    const mono = await pdf.embedFont(StandardFonts.Courier);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageSizes = type === 'containment' ? [[595,842],[595,842],[612,792]] : type === 'mixed' ? [[612,792],[792,612],[420,595]] : [type === 'landscape' ? [792,612] : [612,792]];
    for (let index=0;index<pageSizes.length;index++) {
      const [width,height]=pageSizes[index]; const page=pdf.addPage([width,height]);
      const text=(value,x,y,size=11,font=sans,angle=0,color=rgb(.1,.15,.2))=>page.drawText(value,{x,y,size,font,rotate:degrees(angle),color});
      text('Digital reconstruction fixture',40,height-45,18,bold);
      text(`Page ${index+1} | Reference 2048-07`,40,25,9,serif);
      if(type==='containment') {
        text(`ISOLATED-SOURCE-${index+1}`,40,height-70,10);
        if(index===1) {
          page.drawCircle({x:300,y:450,size:110,color:rgb(.1,.5,.7)});
          for(let n=0;n<5;n++)text(`Editable account 0010-000${n} amount 1,234.5${n}`,40,360-n*18,10);
          page.drawText('TRANSLUCENT DOCUMENT',{x:-50,y:180,size:46,font:bold,rotate:degrees(37),opacity:.16,color:rgb(.85,.1,.1)});
          page.drawText('OPAQUE CONTROL',{x:100,y:110,size:20,font:sans,rotate:degrees(-20),opacity:1,color:rgb(.85,.1,.1)});
        } else {
          const top=index===0?88:height-110;
          const xs=[40,210,380,550],ys=[0,1,2,3,4].map(n=>top-n*22);
          for(const y of ys)page.drawLine({start:{x:40,y},end:{x:550,y},thickness:.5});
          for(const x of xs)page.drawLine({start:{x,y:top},end:{x,y:top-88},thickness:.5});
          ['Metric','Revenue','EBITDA','Users'].forEach((value,n)=>{
            text(`${value}-${index+1}`,44,ys[n]-15,9);
            text(['Value','12.84M','2.40M','98,421'][n],214,ys[n]-15,9);
            text(['Reference','REF-000001','REF-000002','REF-000003'][n],384,ys[n]-15,9);
          });
        }
      } else if(['table','merged','rounded','unruled'].includes(type)) {
        const xs=[40,120,320,440,560], ys=[height-100,height-124,height-156,height-194,height-230];
        const hasRule=type!=='unruled';
        if(type==='rounded') {
          // Bezier rounded rectangle, deliberately retained as chrome.
          const x=40,y=height-100,w=520,h=24,r=6;
          page.drawSvgPath(`M ${x+r} ${-y} L ${x+w-r} ${-y} Q ${x+w} ${-y} ${x+w} ${-y+r} L ${x+w} ${-y+h-r} Q ${x+w} ${-y+h} ${x+w-r} ${-y+h} L ${x+r} ${-y+h} Q ${x} ${-y+h} ${x} ${-y+h-r} L ${x} ${-y+r} Q ${x} ${-y} ${x+r} ${-y} Z`,{color:rgb(.82,.9,.94),borderColor:rgb(.2,.3,.6),borderWidth:1});
        } else if(hasRule) page.drawRectangle({x:40,y:ys[1],width:520,height:24,color:rgb(.85,.92,.94)});
        if(hasRule) {
          for(const y of ys) page.drawLine({start:{x:xs[0],y},end:{x:xs.at(-1),y},thickness:1.25,color:rgb(.2,.3,.6)});
          for(let i=0;i<xs.length;i++) page.drawLine({start:{x:xs[i],y:(type==='merged'&&i===2)?ys[1]:ys[0]},end:{x:xs[i],y:ys.at(-1)},thickness:.75,color:rgb(.2,.3,.6)});
        }
        const rows=type==='merged' ? [['Item','Description and rate','','Total'],['01','Consulting','120.00','240.00'],['02','Materials','10.50','31.50'],['03','Adjustment','-5.00','-5.00']] : [['Item','Description','Rate','Total'],['01','Consulting','120.00','240.00'],['02','Materials','10.50','31.50'],['03','Adjustment','-5.00','-5.00']];
        rows.forEach((row,r)=>row.forEach((value,c)=>{if(value)text(value,xs[c]+3,ys[r]-16,r===0?10:11,r===0?bold:sans)}));
        text('All values retain their original punctuation.',40,ys.at(-1)-35,11,serif);
      } else if(type==='columns') {
        for(let col=0;col<2;col++) for(let row=0;row<14;row++) text(`Column ${col+1} paragraph ${row+1}.`,40+col*280,height-100-row*18,11,serif);
      } else if(type==='rotate') {
        text('Horizontal label',70,height-120,12);
        text('Ninety degrees',120,350,14,sans,90);
        text('One eighty',390,450,14,sans,180);
        text('Two seventy',480,620,14,sans,270);
        text('Thirty degrees',220,210,14,sans,30);
      } else if(type==='art') {
        page.drawRectangle({x:20,y:100,width:width-40,height:height-180,color:rgb(.98,.91,.83)});
        page.drawCircle({x:80,y:height-100,size:30,color:rgb(.1,.5,.5)});
        text('Editable foreground title',130,height-100,18,bold);
        for(let row=0;row<7;row++) text(`Independent text line ${row+1}: 100.25 EUR.`,70,height-170-row*25,12,serif);
        page.drawLine({start:{x:40,y:80},end:{x:width-40,y:80},thickness:2,color:rgb(.1,.5,.5)});
      } else if(type==='fonts') {
        for(const [i,font] of [sans,serif,mono,bold].entries()) {
          text('Width and punctuation: 0123456789 - 1,234.56',40,height-105-i*60,13,font);
          text('Francais: cafe; Espanol: accion.',40,height-125-i*60,11,font);
        }
      } else {
        for(let row=0;row<15;row++) text(`Paragraph ${row+1}. A digital document preserves text and spacing.`,40,height-100-row*19,11,serif);
      }
      if(type==='crop') { page.setCropBox(20,15,572,752); page.setRotation(degrees(90)); }
    }
    const file=path.join(directory,`${name}.pdf`);await writeFile(file,await pdf.save());manifest.push({name,file,type,pages:pageSizes.length});
  }
  // Explicit unsupported image-only case, not a successful acceptance fixture.
  const scan=await PDFDocument.create();scan.addPage().drawRectangle({x:30,y:30,width:200,height:200,color:rgb(.4,.4,.4)});
  await writeFile(path.join(directory,'no-text.pdf'),await scan.save());
  await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  return manifest;
}
if(process.argv[1]===new URL(import.meta.url).pathname) await makeCorpus(process.argv[2] || 'node_modules/.cache/pdf-to-word-qa/inputs');
