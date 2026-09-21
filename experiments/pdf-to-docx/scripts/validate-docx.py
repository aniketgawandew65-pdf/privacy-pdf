"""Read-only OOXML and ordered text validation for local PDF/DOCX pairs.
Usage: python scripts/validate-docx.py source.pdf output.docx [reference.docx]
Requires pdfplumber and lxml for QA only; neither is part of browser conversion.
"""
import collections
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

import pdfplumber
from lxml import etree

W = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def inspect(path):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None, 'Corrupt ZIP member'
        for name in z.namelist():
            if name.endswith(('.xml', '.rels')):
                etree.fromstring(z.read(name))
        root = etree.fromstring(z.read('word/document.xml'))
        text = ''.join(root.xpath('//w:t/text()', namespaces=W))
        protection = any(b'documentProtection' in z.read(n) for n in z.namelist() if n.endswith('settings.xml'))
        external = []
        for name in z.namelist():
            if name.endswith('.rels'):
                external.extend(etree.fromstring(z.read(name)).xpath('//*[@TargetMode="External"]/@Target'))
        return dict(text=text, tables=len(root.findall('.//w:tbl', W)), rows=len(root.findall('.//w:tr', W)),
                    cells=len(root.findall('.//w:tc', W)), media=len([n for n in z.namelist() if n.startswith('word/media/') and not n.endswith('/')]),
                    sections=len(root.findall('.//w:sectPr', W)), protected=protection, external_relationships=external,
                    fonts=sorted(set(root.xpath('//w:rFonts/@w:ascii', namespaces=W))))

source, output = sys.argv[1:3]
with pdfplumber.open(source) as pdf:
    source_text = ''.join(c['text'] for p in pdf.pages for c in p.chars)
    page_count = len(pdf.pages)
result = inspect(output)
normalized = lambda text: re.sub(r'\s', '', text)
a, b = normalized(source_text), normalized(result.pop('text'))
result.update(source_pages=page_count, source_nonspace_characters=len(a), output_nonspace_characters=len(b),
              ordered_text_equal=a == b, missing=dict(collections.Counter(a)-collections.Counter(b)),
              extra=dict(collections.Counter(b)-collections.Counter(a)),
              source_sha256=hashlib.sha256(Path(source).read_bytes()).hexdigest(),
              output_sha256=hashlib.sha256(Path(output).read_bytes()).hexdigest())
if len(sys.argv)>3:
    ref = inspect(sys.argv[3]); ref_text=ref.pop('text')
    ref['normalized_text_equal_to_pdf']=normalized(ref_text)==a
    result['reference_docx']=ref
print(json.dumps(result, indent=2))
assert result['ordered_text_equal'], 'Source text content/order changed'
assert not result['protected'], 'Unexpected document protection'
assert not result['external_relationships'], 'Output must not require external resources'
