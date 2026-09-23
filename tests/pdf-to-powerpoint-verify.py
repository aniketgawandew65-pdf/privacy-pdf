"""Validate produced PPTX structure and synthetic corpus semantic expectations."""
import sys, re, posixpath, json, io
from zipfile import ZipFile
from lxml import etree as E
from PIL import Image
p=sys.argv[1]
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
with ZipFile(p) as z:
 assert z.testzip() is None
 names=set(z.namelist());slides=sorted([n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)],key=lambda n:int(re.search(r'(\d+)\.xml',n)[1]))
 for name in names:
  if name.endswith(('.xml','.rels')):
   root=E.fromstring(z.read(name))
   if name.endswith('.rels'):
    parent='' if name=='_rels/.rels' else name.split('/_rels/')[0]
    for rel in root:
     if rel.get('TargetMode')=='External':assert rel.get('Target').startswith(('http://','https://','mailto:'));continue
     target=posixpath.normpath(posixpath.join(parent,rel.get('Target')));assert target in names,(name,target)
 for name in slides:
  root=E.fromstring(z.read(name));assert len(root.findall('.//p:pic',ns))==1
  ids=[x.get('id') for x in root.findall('.//p:cNvPr',ns)];assert len(ids)==len(set(ids))
  for ext in root.xpath('//p:spPr/a:xfrm/a:ext',namespaces=ns):assert int(ext.get('cx'))>0 and int(ext.get('cy'))>0
 for name in names:
  if name.startswith('ppt/media/'):
   im=Image.open(io.BytesIO(z.read(name)));im.verify()
 text=lambda i:''.join(E.fromstring(z.read(slides[i-1])).xpath('//a:t/text()',namespaces=ns))
 if len(sys.argv)>2 and sys.argv[2]=='torture':
  assert len(slides)==24
  for i in [1,2,4,5,6,7,8,10,11,12,13,14,16,17,19,23,24]:assert f'CASE-{i:02}' in text(i),(i,text(i))
  for i in [3,9,15,18,20,21,22]:assert not text(i),(i,text(i))
  assert 'HIDDEN SECRET' not in text(13)
  assert 'INVISIBLE OCR' not in text(22)
  assert 'First second third 1234' in text(23)
  assert 'hidden' not in text(24).lower()
 print(json.dumps({'file':p,'slides':len(slides),'editableCharacters':sum(len(text(i+1)) for i in range(len(slides))),'valid':True}))
