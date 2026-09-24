"""Synthetic public QA corpus. Run with bundled Python + reportlab/pypdf/Pillow.
Usage: python tests/pdf-to-powerpoint-fixtures.py /private/tmp/pptx-qa
No user document contents are copied into the repository.
"""
import sys, io, json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
from PIL import Image, ImageDraw
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
scan=Image.new('RGB',(900,1200),'#faf8f4');d=ImageDraw.Draw(scan)
for i in range(30):d.text((40,40+i*34),f'Scanned legal agreement clause {i+1}: amount 1234.56',fill='black',stroke_width=1)
scan.save(out/'scan.jpg',quality=65)
logo=Image.new('RGBA',(200,120));d=ImageDraw.Draw(logo);d.ellipse((5,5,195,115),fill=(0,120,80,140));logo.save(out/'logo.png')
c=canvas.Canvas(str(out/'torture.pdf'),pagesize=(595,842));truth=[]
def start(name,size=(595,842),label=True):
 c.setPageSize(size);c.setFillColorRGB(0,0,0);c.setFont('Helvetica-Bold',18)
 if label:c.drawString(30,size[1]-40,name)
 truth.append({'page':len(truth)+1,'case':name})
def end():c.showPage()
start('CASE-01 Simple digital');c.setFont('Helvetica',12);c.drawString(40,740,'Editable invoice 1234.56 and ordinary text.');end()
start('CASE-02 Dense multi-column text');c.setFont('Times-Roman',7)
for x in (30,310):
 for i in range(65):c.drawString(x,775-i*11,f'Row {i+1:02} Reliable text with amount 100.25')
end()
start('CASE-03 Scanned page',label=False);c.drawImage(str(out/'scan.jpg'),0,0,595,842);end()
start('CASE-04 Mixed scan and digital');c.drawImage(str(out/'scan.jpg'),30,100,260,500);c.setFont('Helvetica',14);c.drawString(310,600,'Digital note 678.90');end()
start('CASE-05 Table and bank ledger');c.setFont('Helvetica',9)
for row in range(31):
 y=760-row*20;c.line(30,y,560,y)
 if row<30:
  for col,text in enumerate([f'{row+1:02}-09-2026','Payment reference','500.00','12500.75']):c.drawString([35,145,380,470][col],y-14,text)
for x in [30,140,375,465,560]:c.line(x,160,x,760)
end()
start('CASE-06 Legal clauses');c.setFont('Times-Roman',10)
for i in range(40):c.drawString(30,760-16*i,f'{i+1}. The parties agree to the following terms and conditions.');
end()
start('CASE-07 Transparent logo and graphics');c.drawImage(str(out/'logo.png'),40,520,200,120,mask='auto');c.setFillColorRGB(.2,.4,.8);c.circle(360,580,100,fill=1);end()
start('CASE-08 Landscape',(842,595));c.setFont('Helvetica',16);c.drawString(40,470,'Landscape content across the page');end()
start('CASE-09 Rotated source');c.setFont('Helvetica',15);c.drawString(40,650,'Rotated 90 degrees by page dictionary');end()
start('CASE-10 Receipt',(180,900));c.setFont('Courier',9)
for i in range(50):c.drawString(12,830-i*15,f'Item {i+1:02}   25.00')
end()
start('CASE-11 Font styles');
for i,font in enumerate(['Helvetica','Helvetica-Bold','Helvetica-Oblique','Times-Roman','Times-BoldItalic','Courier']):c.setFont(font,14);c.drawString(35,750-i*45,font+' 123.45 Sample')
c.setFont('Helvetica',4);c.drawString(40,400,'Tiny text 987.65');c.setFont('Helvetica-Bold',60);c.drawString(35,270,'Heading');end()
start('CASE-12 Links');c.setFillColorRGB(0,0,1);c.setFont('Helvetica',14);c.drawString(40,730,'Visit example.com');c.linkURL('https://example.com/',(40,725,170,746),relative=0);end()
start('CASE-13 Overlapping opaque objects');c.setFont('Helvetica',16);c.drawString(40,700,'HIDDEN SECRET TEXT');c.setFillColorRGB(1,1,1);c.rect(30,680,400,50,fill=1,stroke=0);c.setFillColorRGB(0,0,0);c.drawString(40,640,'Visible foreground');end()
start('CASE-14 Vector chart');
for i in range(100):c.setStrokeColorRGB(i/100,.3,.4);c.line(40,200+i*4,550,700-i*2)
end()
start('CASE-15 Low quality scan',label=False);low=scan.resize((225,300));c.drawImage(ImageReader(low),0,0,595,842);end()
start('CASE-16 Unicode and special chars');c.setFont('Helvetica',13);c.drawString(40,740,'Café Résumé £50 €100 — naïve ©');end()
start('CASE-17 Diagonal watermark');c.saveState();c.translate(120,300);c.rotate(35);c.setFillAlpha(.3);c.setFont('Helvetica-Bold',60);c.drawString(0,0,'CONFIDENTIAL');c.restoreState();c.setFont('Helvetica',12);c.drawString(40,720,'Ordinary text above diagonal artwork');end()
start('CASE-18 Clipped text');c.saveState();p=c.beginPath();p.rect(40,650,140,30);c.clipPath(p,stroke=0);c.setFont('Helvetica',22);c.drawString(40,658,'This text is deliberately clipped');c.restoreState();end()
start('CASE-19 Huge page',(12000,12000));c.setFont('Helvetica',500);c.drawString(800,6000,'HUGE 12000 pt');end()
start('CASE-20 Crop offset');c.setFont('Helvetica',14);c.drawString(100,650,'Cropped source content');end()
start('CASE-21 Blank page',label=False);end()
start('CASE-22 Hidden OCR');c.drawImage(str(out/'scan.jpg'),0,0,595,842);t=c.beginText(40,650);t.setTextRenderMode(3);t.setFont('Helvetica',18);t.textOut('INVISIBLE OCR LAYER');c.drawText(t);end()
start('CASE-23 Consecutive text operators');t=c.beginText(40,700);t.setFont('Helvetica',14);t.textOut('First ');t.textOut('second ');t.textOut('third 1234');c.drawText(t);end()
start('CASE-24 Partial text protection');t=c.beginText(40,700);t.setFont('Helvetica',14);t.textOut('Visible ');t.setTextRenderMode(3);t.textOut('hidden ');t.setTextRenderMode(0);t.textOut('visible again');c.drawText(t);end()
c.save()
r=PdfReader(out/'torture.pdf');w=PdfWriter()
for i,p in enumerate(r.pages):
 if i==8:p.rotate(90)
 if i==19:p.cropbox.lower_left=(80,150);p.cropbox.upper_right=(500,750)
 w.add_page(p)
w.write(out/'torture.pdf')
w=PdfWriter();w.add_page(r.pages[0]);w.encrypt('test-password');w.write(out/'encrypted.pdf')
w=PdfWriter();w.write(out/'empty.pdf')
(out/'invalid.pdf').write_bytes(b'not a PDF')
(out/'damaged.pdf').write_bytes(b'%PDF-1.7\ntruncated body')
w=PdfWriter()
for _ in range(75):w.add_page(r.pages[0])
w.write(out/'many.pdf')
(out/'truth.json').write_text(json.dumps(truth,indent=2))
print(out)
# Single-page files for component/unchanged-tool smoke tests.
for name,index in [('simple',0),('scan',2)]:
 w=PdfWriter();w.add_page(r.pages[index]);w.write(out/(name+'.pdf'))
# Standard Japanese CID text exercises local CMap loading; Latin punctuation
# exercises readable text without relying on a machine-specific font path.
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))
c=canvas.Canvas(str(out/'unicode.pdf'));c.setFont('Helvetica',20)
c.drawString(40,740,'Résumé £50 €100 — café');c.setFont('HeiseiMin-W3',20)
c.drawString(40,600,'日本語 テスト');c.save()
c=canvas.Canvas(str(out/'overlap.pdf'));c.setFont('Helvetica',20)
c.drawString(40,500,'UNDERLAPPING TEXT');c.saveState();c.translate(40,500)
c.rotate(25);c.drawString(0,0,'ROTATED OVERLAY');c.restoreState();c.save()
# Table confidence guards: a normal grid, ambiguous text, covered content, dashes.
c=canvas.Canvas(str(out/'table-guards.pdf'),pagesize=(300,240))
for case in range(4):
 c.setFont('Helvetica',10)
 if case==3:c.setDash(3,2)
 for x in [20,140,280]:c.line(x,40,x,180)
 for y in [40,110,180]:c.line(20,y,280,y)
 for x,y,value in [(25,155,'Item'),(145,155,'Amount'),(25,85,'Total'),(145,85,'1234.56')]:c.drawString(x,y,value)
 if case==1:c.drawString(25,135,'Second run')
 if case==2:c.setFillColorRGB(1,1,1);c.rect(140,40,140,70,stroke=0,fill=1)
 c.showPage()
c.save()
