"""Behavior checks after rendering the page-containment corpus fixture locally.

Run check-pdf-to-word.mjs, render its DOCX outputs, then pass WORD_QA_DIR here.
PDFTOPPM can select the local Poppler binary. No files are uploaded.
"""
import collections
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from pypdf import PdfReader

root = Path(sys.argv[1])
result = root / 'renders/page-containment/page-containment.pdf'
pages = PdfReader(result).pages
assert len(pages) == 3, ('source pages must remain isolated', len(pages))
for index, page in enumerate(pages, 1):
    text = page.extract_text() or ''
    assert f'ISOLATED-SOURCE-{index}' in text
    assert all(f'ISOLATED-SOURCE-{other}' not in text for other in range(1, 4) if other != index)
    if index != 2:
        for label in ['Metric', 'Revenue', 'EBITDA', 'Users']:
            assert f'{label}-{index}' in text, (index, label, 'table overflow or clipping')
        for value in ['12.84M', '2.40M', '98,421', 'REF-000001', 'REF-000002', 'REF-000003']:
            assert value in text, (index, value)
    else:
        for n in range(5):
            assert f'0010-000{n}' in text and f'1,234.5{n}' in text

# Compare the angle and opacity of visible red watermark ink, not XML settings.
# Exclude the lower opaque control and nonred chart; body text remains native.
def watermark(pdf, directory, label):
    prefix = Path(directory) / label
    subprocess.run([os.environ.get('PDFTOPPM', 'pdftoppm'), '-f', '2', '-l', '2',
                    '-r', '96', '-png', '-singlefile', str(pdf), str(prefix)],
                   check=True, capture_output=True)
    pixels = np.asarray(Image.open(prefix.with_suffix('.png')).convert('RGB')).astype(float)
    pixels = pixels[:round(642 * 96 / 72)]
    r, g, b = (pixels[:, :, i] for i in range(3))
    mask = (r - g > 12) & (r - b > 12)
    yy, xx = np.nonzero(mask)
    assert len(xx) > 100, 'visible diagonal watermark disappeared'
    covariance = np.cov(np.vstack([xx, yy]))
    _, eigenvectors = np.linalg.eigh(covariance)
    axis = eigenvectors[:, -1]
    angle = math.degrees(math.atan2(axis[1], axis[0])) % 180
    color = collections.Counter(map(tuple, pixels[mask].astype(int))).most_common(1)[0][0]
    return angle, color

with tempfile.TemporaryDirectory(prefix='pdf-word-watermark-') as directory:
    source = watermark(root / 'inputs/page-containment.pdf', directory, 'source')
    actual = watermark(result, directory, 'word')
    error = abs(source[0] - actual[0])
    error = min(error, 180 - error)
    assert error < 3, ('watermark angle changed', source, actual)
    assert max(abs(a-b) for a,b in zip(source[1], actual[1])) <= 8, ('watermark opacity/color changed', source, actual)
    assert actual[1][1] > 200, ('translucent watermark became opaque', actual)
    print(f'PASS: 3 isolated pages, all editable table rows/values, body accounts; watermark angle error {error:.2f} degrees; opacity/color retained')
