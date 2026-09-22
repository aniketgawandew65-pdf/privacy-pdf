"""Validate local QA packages and (when present) rendered page geometry.
Usage: python scripts/verify-pdf-to-word.py node_modules/.cache/pdf-to-word-qa
No source documents or extracted content should be committed.
"""
import json,sys,re,zipfile,collections
from pathlib import Path
from lxml import etree
from pypdf import PdfReader
root=Path(sys.argv[1]); ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
clean=lambda value: re.sub(r'\s','',value)
reports=[]
for meta in sorted((root/'outputs').glob('*.json')):
 data=json.loads(meta.read_text());name=meta.stem;source=data['source']
 with zipfile.ZipFile(meta.with_suffix('.docx')) as z:
  assert z.testzip() is None
  for member in z.namelist():
   if member.endswith(('.xml','.rels')):etree.fromstring(z.read(member))
  xml=etree.fromstring(z.read('word/document.xml'))
  expected=''.join(s['text'] for p in source for s in p['spans']);actual=''.join(xml.xpath('//w:t/text()',namespaces=ns))
  assert collections.Counter(clean(expected))==collections.Counter(clean(actual)),f'{name}: character inventory'
  assert not xml.xpath('//w:documentProtection',namespaces=ns)
  tables=xml.xpath('//w:tbl',namespaces=ns); source_tables=[t for p in source for t in p['tables']]
  assert len(tables)==len(source_tables),f'{name}: table count'
  errors=[]
  for table,grid in zip(tables,source_tables):
   pos=table.find('w:tblPr/w:tblpPr',ns)
   for attr,key in [('tblpX','x'),('tblpY','y')]:
    delta=abs(float(pos.get('{'+ns['w']+'}'+attr))/20-grid[key]);errors.append(delta);assert delta<=.026
   widths=table.xpath('w:tblGrid/w:gridCol/@w:w',namespaces=ns)
   for i,width in enumerate(widths):assert abs(float(width)/20-(grid['xs'][i+1]-grid['xs'][i]))<=.026
   actual_cells=[c for c in table.xpath('w:tr/w:tc',namespaces=ns) if not c.xpath('w:tcPr/w:vMerge[not(@w:val) or @w:val="continue"]',namespaces=ns)]
   expected_cells=[c for row in grid['rows'] for c in row if c['rowSpan']>0]
   assert len(actual_cells)==len(expected_cells),(name,'cell count')
   for c,e in zip(actual_cells,expected_cells):
    assert clean(''.join(c.xpath('.//w:t/text()',namespaces=ns)))==clean(''.join(s['text'] for s in sorted(e['spans'],key=lambda s:(round(s['y']/2),s['x'])))),(name,'cell text order')
  sections=xml.xpath('//w:sectPr',namespaces=ns);assert len(sections)==len(source)
  for section,page in zip(sections,source):
   size=section.find('w:pgSz',ns)
   assert abs(int(size.get('{'+ns['w']+'}w'))/20-page['width'])<.026
   assert abs(int(size.get('{'+ns['w']+'}h'))/20-page['height'])<.026
  images=xml.xpath('//wp:anchor[wp:docPr/@name="Preserved PDF artwork"]',namespaces=ns);source_images=[p for page in source for p in page['pictures']]
  assert len(images)==len(source_images)
  for image,picture in zip(images,source_images):
   for axis,coordinate in [('H','x'),('V','y')]:
    value=float(image.find(f'wp:position{axis}/wp:posOffset',ns).text)/12700
    assert abs(value-picture[coordinate])<.001
  report={'name':name,'pages':len(source),'characters':len(clean(actual)),'tables':len(tables),'max_table_origin_error_pt':max(errors,default=0),'package':'pass'}
  rendered=root/'renders'/name/(name+'.pdf')
  if rendered.exists():
   pages=PdfReader(rendered).pages;report['rendered_pages']=len(pages)
   assert len(pages)==len(source),(name,'rendered page count',len(pages),len(source))
  reports.append(report)
 print(name,'PASS',len(source),'pages',len(clean(actual)),'characters',len(tables),'tables')
(root/'validation.json').write_text(json.dumps(reports,indent=2))
