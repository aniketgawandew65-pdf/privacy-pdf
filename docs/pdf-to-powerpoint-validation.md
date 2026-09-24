# PDF to PowerPoint validation — 24 September 2026

Branch: `feature/pdf-to-powerpoint`. Base: `c9f772e9d2b408b39916cc937a2f06f3ec502e58`.
Draft PR #14 remains a preview awaiting manual approval. Main/production is untouched.

## Quality improvements in this revision

- Recognized font names now override incorrect generic PDF family flags. The supplied statement marks ArialMT as monospace; that previously selected Courier New and preserved an entire text block as artwork.
- Two-character fragments can use slightly more tracking only when their total width differs by at most 20% and the gap stays within 30% of font size. Longer runs retain the original tighter limit. This fixes a two-letter fragment that previously preserved all 3,467 surrounding characters on statement page two. Whole PDF text objects are still removed together, preserving cursor and stacking semantics.
- Clear, fully ruled grids become native PowerPoint tables. Cell values, row/column sizes and uniform borders come from the PDF; no values or missing rows are inferred. Single-run cells only. Ambiguous/multiline/merged/dashed/clipped/overpainted/annotated layouts retain the existing text/artwork approach. Table border operators are removed atomically, so original borders are not left behind. Complex bank tables remain positioned text, not native cells.
- A lone full-page scan is rendered at no more than its source resolution, within the existing device budget. Text, vectors, masks, clipping, annotations or unknown operations keep the full normal budget. The supplied rent scans already need that resolution and remain unchanged.
- Optional table analysis has explicit limits for large vector paths and dense grids.

## Measured results

V1 is commit `561aef9`. Timings are local observations on a busy Mac, not cross-device performance guarantees.

| Input | Slides | Editable characters, V1 → current | PPTX bytes, V1 → current | Current local run |
|---|---:|---:|---:|---:|
| Synthetic mixed corpus | 24 | 10,131 → 10,131 | 4,246,109 → 3,733,470 | 6.39 s |
| April 2022 statement | 9 | 18,010 → 22,378 | 2,389,076 → 1,865,650 | 10.54 s |
| Rent scan PDF | 10 | 0 → 0 | 7,024,036 → 7,024,036 | 34.74 s under load |
| Repeated digital stress file | 75 | Present on every slide | 5,783,747 | 13.20 s |

The corpus is 12.1% smaller and the statement is 21.9% smaller. Statement pages two through nine have all extracted text editable. Page one preserves 36 barcode-related characters as artwork. This is measured coverage of these documents, not a promise for all PDFs.

The synthetic ledger now has one native table containing 30 rows and 120 cells. Every cell's date/description/amount was checked. Its LibreOffice render contains all 155 expected words, with a maximum coordinate drift of 0.454 pt relative to the previous positioned-text output. A render check guards against a structurally present table being invisible to a reader. Four additional real PDF cases verify native-table counts `[1, 0, 0, 0]`: clear grid, multiple text runs per cell, covered content, dashed borders.

## Verification

- Full TypeScript/Vite/PWA build and SEO audit passed: 63 static pages, 61 canonical URLs. Scoped ESLint passed.
- 15 PDF-to-PowerPoint unit tests and 29 existing Word regression tests passed.
- ZIP CRC, XML, media decoding, relationships, slide order/count, expected text and hidden-text exclusion passed for the 24-page corpus. Native-cell and rendered-word/position assertions passed.
- Bundled headless LibreOffice opened and rendered the generated presentations. Visually checked native ledger, statement pages 1/2/3/9 and diagonal watermark against source/baseline. The second-page spacing correction retained the layout. PowerPoint desktop and Keynote remain untested.
- Invalid, empty, damaged and encrypted PDF errors; cancellation; and 75-page sequential conversion passed.
- Component credit test: 2 → 1 after success; download, invalid range and cancellation did not charge again.
- Chrome Pixel 7 emulation converted five mixed pages with a maximum 3,002,877 pixels per page. This is not physical Android/iPhone/Safari validation.
- Built PWA passed offline reload and both Auto/Best fidelity conversions after caching. Network inspection saw local worker GETs and existing GA4 task metadata POSTs, with no document upload observed.
- Read-only existing-tool smoke passed: PDF to Word, PDF to JPG, OCR, Rotate PDF. Existing engines and shared behavior are unchanged.
- One statement attempt timed out under concurrent build/render/browser load; it passed on the stable retry. One development integration run was interrupted by a source reload; the repeated run against stable source passed. Neither failed run is counted as a pass.

## Reference comparison

The rent reference deck is 4,625,147 bytes and OCR-reconstructs the first scan, preserving the other nine as images. Our ten-slide output preserves the scanned appearance without OCR word/number substitutions, but is larger and is not text-editable.

The supplied June 2026 reference deck has six slides and two native tables. The supplied source statements are February 2022 (seven pages) and April 2022 (nine pages), so a direct page-for-page competitor comparison is not valid. The April output retains columns, watermark, logos and page boundaries, but uses substitute fonts. Its complex rounded/unruled tables remain positioned text plus artwork.

## Strict provisional rating

**8.4/10**, up from the initial **7.8/10** preview. The requested **9.5/10 is not yet demonstrated**. This remains a qualitative engineering assessment, not a standardized benchmark score.

| Area | /10 | Remaining limit |
|---|---:|---|
| Visual fidelity | 8.8 | Substitute fonts and bounded raster artwork |
| Editable content | 8.2 | Reliable horizontal scripts; conservative complex-layout fallback |
| Scanned PDFs | 8.7 | Source-aware resolution, but no OCR editing; rent output still larger |
| Mixed PDFs | 8.5 | One common slide size; bounded per-page fallback |
| Fonts/text | 8.2 | Better classification/tracking; no embedded font reproduction |
| Images/graphics | 8 | Visually preserved, mostly not editable vectors |
| Tables/layout | 8 | Simple native grids; merged/multiline/rounded tables remain text/artwork |
| PPTX compatibility | 7.5 | LibreOffice round trips pass; PowerPoint/Keynote acceptance pending |
| Performance | 8 | Bounded pages and smaller scans; compressed output stays in memory |
| Privacy/offline | 9.5 | Local conversion/cached assets; shared analytics remains |
| Error handling | 8.5 | Explicit failures/cancel; no interrupted-job resume |

## Manual acceptance needed

1. Open statement, native-ledger and rent PPTX files in desktop PowerPoint and Keynote. Verify all slides, important numbers, font spacing and bottom rows. Edit the synthetic ledger as cells; edit bank text independently.
2. On physical iPhone Safari and Android Chrome, try normal and Private/Incognito sessions, conversion/download/opening, cancellation and a longer scan. Earlier physical-device credit tests do not validate this new converter.
3. Compare Auto/Best fidelity and page range `1-3, 5`; try rotated/mixed-size PDFs. Go offline after caching and verify conversion and success-only task charging.
4. A matching June 2026 PDF is still needed for a direct comparison with the supplied reference PPTX.

## Reproduce

- `npm ci`; `npm run test:pdf-to-powerpoint`; `npm run test:pdf-to-word`; `npm run build`.
- Generate fixtures with Python + reportlab/pypdf/Pillow: `python tests/pdf-to-powerpoint-fixtures.py /private/tmp/pdf-to-powerpoint-qa`.
- Start Vite on 5197. Use the browser/integration/smoke scripts with `PLAYWRIGHT_MODULE` and `CHROME_PATH` if needed.
- Convert: `node tests/pdf-to-powerpoint-browser.mjs INPUT.pdf OUTPUT.pptx [auto|fidelity] [page-range]`.
- Render with headless LibreOffice. Validate corpus plus rendered native-table geometry: `python tests/pdf-to-powerpoint-verify.py OUTPUT.pptx torture RENDERED.pdf`.
- The `table-guards.pdf` fixture must report native-table counts `[1,0,0,0]`.
- Serve the build on 5198; run `node tests/pdf-to-powerpoint-offline.mjs`.
- Keep real user documents, outputs and screenshots outside the repository.

## Files changed in this revision (relative to V1)

Added: `src/utils/pdfToPowerPoint/fonts.ts`, `rules.ts`, `scan.ts`, `tables.ts`; `tests/pdf-to-powerpoint-fonts.test.ts`, `pdf-to-powerpoint-scan.test.ts`, `pdf-to-powerpoint-tables.test.ts`.

Updated: `src/utils/pdfToPowerPoint/convert.ts`, `model.ts`, `package.ts`, `text.ts`; `tests/pdf-to-powerpoint-fixtures.py`, `pdf-to-powerpoint-verify.py`; both PDF-to-PowerPoint architecture/validation documents.

No existing tool engine, UI, pricing, credit rule, dependency or shared integration file changed in this revision.

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

- `src/utils/pdfToPowerPoint/fonts.ts`
- `src/utils/pdfToPowerPoint/rules.ts`
- `src/utils/pdfToPowerPoint/scan.ts`
- `src/utils/pdfToPowerPoint/tables.ts`
- `tests/pdf-to-powerpoint-fonts.test.ts`
- `tests/pdf-to-powerpoint-scan.test.ts`
- `tests/pdf-to-powerpoint-tables.test.ts`
