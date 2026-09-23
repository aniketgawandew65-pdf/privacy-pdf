# PDF to PowerPoint validation — 23 September 2026

Branch: `feature/pdf-to-powerpoint`. Base: `c9f772e9d2b408b39916cc937a2f06f3ec502e58`.
This is a preview feature awaiting user testing, not a production approval.

## Results

- Full TypeScript/Vite/PWA build passed. SEO audit passed: 63 static pages and 61 canonical sitemap URLs.
- New package/geometry unit tests: 5 passed. Existing PDF-to-Word regression tests: 29 passed.
- New component and engine ESLint check passed.
- Read-only browser smoke: PDF to Word, PDF to JPG, OCR and Rotate PDF all produced their expected result/download state. No existing engine was modified.
- 24-page synthetic corpus generated 24 valid slides, with 10,131 editable characters. ZIP CRC, XML parsing, relationship targets, media decoding, source order and selected fallback/text expectations passed.
- Corpus covers simple/dense text, two columns, scans, mixed pages, table/ledger, legal clauses, transparency, vectors, landscape, rotation, receipt proportions, font styles/sizes, links, opaque occlusion, low-quality scan, punctuation, diagonal watermark, clipping, huge page, CropBox offsets, blank page, invisible OCR and consecutive/partially hidden text operators.
- Additional multilingual/CMap and overlapping rotated-text cases converted. Unsupported scripts/ambiguous mappings stay in artwork. A source missing its own glyphs cannot be repaired by this converter.
- Final browser-generated PPTX opened directly in bundled headless LibreOffice. The 24-page corpus, rent and April bank outputs were rendered locally for visual inspection. Desktop Microsoft PowerPoint and Keynote were not tested.
- Invalid, empty, damaged and password-protected PDF errors passed. Cancellation passed. A 75-page file converted sequentially.
- Real component credit checks: one successful conversion reduced the current free balance from 2 to 1. Download, invalid range and cancellation did not reduce it further. The existing rules were reused unchanged.
- Chrome Pixel 7 emulation converted five mixed pages with approximately 3 million pixels per page. Physical Android/iOS devices and Safari were not tested for this new tool.
- Production PWA tests passed offline reload plus both Auto and Best fidelity conversions after caching. Network inspection observed local worker GETs and the existing GA4 task metadata POSTs; no document text or filename appeared in those requests. No conversion server is used.

## Reference comparison and measured runs

Timings are local observations, not cross-device guarantees; other work was running on the Mac.

| Input | Slides | Editable characters | PPTX bytes | Local conversion |
|---|---:|---:|---:|---:|
| Synthetic mixed corpus | 24 | 10,131 | 4,246,109 | 7.93 s |
| Rent scan PDF | 10 | 0 | 7,024,036 | 7.22 s |
| April 2022 statement | 9 | 18,010 | 2,389,076 | 37.56 s |
| Repeated digital page stress file | 75 | Present on each page | 5,783,747 | 20.00 s |

The rent reference PPTX is 4,625,147 bytes. It reconstructs the first scan using text shapes and preserves the other nine as images. Our output preserves all ten scans as images at up to 216 dpi on desktop, without OCR number/word substitutions. That improves faithfulness to the scanned first page but gives up its editability and produces a larger file. Mobile resolution is lower and bounded by the shared device policy.

The June 2026 bank reference has six slides, two native tables and many text shapes. The supplied source statements are February 2022 (seven pages) and April 2022 (nine pages). Neither is the matching source, so no page-for-page superiority claim is justified. The April output retains the source's columns, watermark, header and page boundaries; font weight/character spacing differs. Its first two pages use more conservative artwork preservation; most later body text is editable. Tables are not native PowerPoint table objects.

## Strict provisional rating

Overall: **7.8/10** for this preview. It is not yet demonstrated to meet a 9+/10 production target.

| Area | /10 | Main limitation |
|---|---:|---|
| Visual fidelity | 8.5 | Font substitution; raster artwork at bounded resolution |
| Editable content | 6.5 | Reliable horizontal text only; no native tables/OCR |
| Scanned PDFs | 8.5 | Faithful images, larger outputs, not editable |
| Mixed PDFs | 8.5 | Page-level/per-object fallback, one common slide size |
| Fonts/text | 7 | Substitute fonts; complex scripts preserved visually |
| Images/graphics | 8 | Preserved visually, not editable vectors |
| Tables/layout | 7.5 | Positioned text and artwork rather than editable cells |
| PPTX compatibility | 7 | LibreOffice tested; PowerPoint/Keynote still need manual tests |
| Performance | 7.5 | Sequential/bounded canvases; final compressed file still in memory |
| Privacy/offline | 9.5 | Core local and cached; shared analytics still exists |
| Error handling | 8.5 | Explicit failures/cancel; no interrupted-job resume |

## Manual preview checks

1. On desktop PowerPoint and Keynote, open the rent and both bank conversions. Verify every slide and important numbers, especially the bottom rows and watermark.
2. Edit text on a bank transaction slide. Check that nearby columns do not move unexpectedly. Table cells and graphics are not promised editable.
3. Compare Auto with Best fidelity. Try `1-3, 5`; confirm four slides in source order.
4. Try a scan, mixed portrait/landscape PDF, rotated page, cancellation and protected PDF.
5. On physical iPhone Safari and Android Chrome, test normal and Private/Incognito tabs, download/open the PPTX and monitor behavior with longer scans.
6. Let the app finish caching, go offline, reload and convert. Verify the task balance only decreases on success.
7. Supply the actual June 2026 source PDF for a direct comparison with the provided six-slide reference deck.

## Reproduce

- `npm ci`, then `npm run test:pdf-to-powerpoint`, `npm run test:pdf-to-word`, `npm run build`.
- Use Python with reportlab, pypdf, Pillow and lxml: `python tests/pdf-to-powerpoint-fixtures.py /private/tmp/pdf-to-powerpoint-qa`.
- Start Vite on port 5197. Run the browser/integration/smoke scripts with Playwright installed, or set `PLAYWRIGHT_MODULE` to its module path and `CHROME_PATH` to an installed Chrome executable.
- Browser converter: `node tests/pdf-to-powerpoint-browser.mjs INPUT.pdf OUTPUT.pptx [auto|fidelity] [page-range]`.
- Structural verification: `python tests/pdf-to-powerpoint-verify.py OUTPUT.pptx [torture]`.
- Serve the built site on 5198 and run `node tests/pdf-to-powerpoint-offline.mjs`.
- Render PPTX locally with headless LibreOffice; inspect against source PDF renders. Keep real user documents/output outside the repository.

## Exact changed files

Existing files (minimal integration only):

- `package.json` — new test command; dependency versions/lockfile unchanged.
- `public/sitemap.xml` — one added route; unrelated generator changes excluded from source diff.
- `src/App.tsx` — one lazy import, navigation entry and route.
- `src/seoConfig.ts` — new route metadata/date.
- `src/seoContent.ts` — new tool guide/limitations.
- `src/toolCopy.ts` — new tool description.
- `src/utils/toolCapacityProfiles.ts` — one profile and expected registry count 44 → 45.

New files:

- `src/components/PdfToPowerPoint.tsx`
- `src/utils/pdfToPowerPoint/assets.ts`
- `src/utils/pdfToPowerPoint/convert.ts`
- `src/utils/pdfToPowerPoint/geometry.ts`
- `src/utils/pdfToPowerPoint/model.ts`
- `src/utils/pdfToPowerPoint/package.ts`
- `src/utils/pdfToPowerPoint/package.worker.ts`
- `src/utils/pdfToPowerPoint/source.ts`
- `src/utils/pdfToPowerPoint/text.ts`
- `src/utils/pdfToPowerPoint/zip.ts`
- `tests/pdf-to-powerpoint-browser.mjs`
- `tests/pdf-to-powerpoint-fixtures.py`
- `tests/pdf-to-powerpoint-integration.mjs`
- `tests/pdf-to-powerpoint-offline.mjs`
- `tests/pdf-to-powerpoint-package.test.ts`
- `tests/pdf-to-powerpoint-smoke.mjs`
- `tests/pdf-to-powerpoint-verify.py`
- `docs/pdf-to-powerpoint-architecture.md`
- `docs/pdf-to-powerpoint-validation.md`
