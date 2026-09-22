"""Render the local corpus and compare source/output at the same resolution.

DOCX_RENDERER must point to render_docx.py; use a bundled document runtime.
Private documents and all generated artifacts remain in WORD_QA_DIR.
Pixel differences are diagnostics, not a claim of perceptual equivalence.
"""
import json, os, subprocess, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'node_modules/.cache/pdf-to-word-qa').resolve()
renderer = os.environ['DOCX_RENDERER']
selected = os.environ.get('WORD_SAMPLES', '').split(',')
reports = []
for sample in json.loads((root / 'manifest.json').read_text()):
    name = sample['name']
    if selected != [''] and name not in selected:
        continue
    output = root / 'renders' / name
    output.mkdir(parents=True, exist_ok=True)
    for old in output.glob('page-*.png'):
        old.unlink()
    subprocess.run([sys.executable, renderer, str(root / 'outputs' / f'{name}.docx'),
                    '--output_dir', str(output), '--emit_pdf', '--width', '1200', '--height', '1600'],
                   check=True, capture_output=True)
    pair = root / 'comparisons' / name
    pair.mkdir(parents=True, exist_ok=True)
    for pattern in ['source-*.png', 'word-*.png', 'comparison-*.png']:
        for old in pair.glob(pattern):
            old.unlink()
    for label, pdf in [('source', sample['file']), ('word', str(output / f'{name}.pdf'))]:
        subprocess.run([os.environ.get('PDFTOPPM', 'pdftoppm'), '-cropbox', '-r', '96', '-png',
                        str(pdf), str(pair / label)], check=True, capture_output=True)
    source_pages, word_pages = sorted(pair.glob('source-*.png')), sorted(pair.glob('word-*.png'))
    assert len(source_pages) == len(word_pages), (name, 'page count', len(source_pages), len(word_pages))
    metrics = []
    for number, (source, word) in enumerate(zip(source_pages, word_pages), 1):
        with Image.open(source) as a, Image.open(word) as b:
            # Twip rounding can add a single raster pixel; align canvases without scaling.
            assert abs(a.width-b.width) <= 1 and abs(a.height-b.height) <= 1, (name, 'page size')
            size = (max(a.width,b.width), max(a.height,b.height))
            left, right = Image.new('RGB',size,'white'), Image.new('RGB',size,'white')
            left.paste(a,(0,0)); right.paste(b,(0,0))
            diff = ImageChops.difference(left,right)
            metrics.append({'page':number, 'mean_pixel_error_0_to_1':round(sum(ImageStat.Stat(diff).mean)/765,6)})
            comparison = Image.new('RGB',(size[0]*2,size[1]),'white')
            comparison.paste(left,(0,0));comparison.paste(right,(size[0],0))
            comparison.save(pair/f'comparison-{number}.png')
    reports.append({'name':name,'pages':metrics})
    print(name, 'rendered', len(metrics), 'pages', flush=True)
(root / ('visual-metrics-'+('-'.join(selected) if selected != [''] else 'all')+'.json')).write_text(json.dumps(reports,indent=2))
