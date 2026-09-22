# Local PDF → Word reconstruction

This improvement batch continues `feature/pdf-to-word-integration` from
`f76c09dc6bbc96e5a61dbebe9d8daacb5d3d6317`. It is an experimental reconstruction
engine, not a guarantee of identical rendering for every digital PDF.

## General engine changes

- A shared top-left, PDF.js viewport coordinate model converts points to twips
  and EMU. Text baseline offsets use font ascent/descent and the actual paragraph
  line advance. Source crop, rotation,
  user-unit scaling, page sizes and intentional whitespace remain meaningful.
- Font descriptors and family classes choose serif, sans-serif, monospace or
  symbolic fallbacks. Available source families are retained; fallback run
  advances are calibrated against browser font metrics. Substitution is reported.
- Source line breaks remain explicit. Table padding follows source text extents;
  tight lines reserve half an em for differences in receiving-editor font metrics.
  Font size, text content, fixed row heights and real editable cells are retained.
- Native table borders retain color and thickness. Rounded or filled drawing
  paths stay in the text-free artwork layer, with corresponding duplicate native
  edges suppressed. All layers use page-relative coordinates.
- Conservative unruled-table inference requires at least three aligned columns
  and three consecutive rows. Two-column prose remains independent text regions.
- Editable 90°/270° text uses vertical text flow in positioned shapes. Other angles
  retain DrawingML rotation plus a clear editor-compatibility warning. Rotation
  alone no longer makes a run italic; deliberately sheared text retains italics.
- Widely separated text blocks use positioned paragraphs so footers and deliberate
  blank space do not collapse into ordinary document flow.

These rules depend on geometry and typography, not filenames, account details,
bank names, column labels or document-specific coordinates. Conversion still runs
locally using the existing PDF and reconstruction workers. Credits, pricing,
shared capacity rules and product UI code are unchanged.

## Reproducing QA

```sh
npm run test:pdf-to-word
npx tsc -b
npm run build
npm run dev -- --host 127.0.0.1 --port 5194 --strictPort
```

Run the following against the development server **after** builds finish, since
generated public assets can trigger a development-page reload:

```sh
# Set PLAYWRIGHT_MODULE to an installed Playwright module if not locally resolvable.
# Optional STATEMENT_PDF, PAYSLIP_PDF and BOND_PDF add private local reference PDFs.
node scripts/check-pdf-to-word.mjs
node scripts/check-pdf-to-word-ui.mjs

# Use a document runtime with LibreOffice, Poppler, Pillow, lxml and pypdf.
# DOCX_RENDERER points to render_docx.py; PDFTOPPM can override the Poppler executable.
python scripts/render-pdf-to-word-qa.py
python scripts/verify-pdf-to-word.py node_modules/.cache/pdf-to-word-qa
```

`PREVIEW_URL` overrides the server address, `WORD_QA_DIR` overrides the browser
runner's output directory, and `WORD_SAMPLES` selects comma-separated fixture
names. Pass a custom QA directory as the Python scripts' first argument.

The corpus contains 19 synthetic fixtures spanning reusable flow, columns,
ruled/merged/unruled tables, rounded headers, artwork, font classes, text rotation,
landscape, mixed page sizes and cropped/rotated pages. Some document labels share
the same geometry template; these are focused regressions rather than 19 diverse
real-world designs. The three supplied real PDFs are additional local regressions.
An image-only fixture must fail explicitly. No source PDFs, generated DOCX files,
screenshots or private extracted text are committed.

The package validator checks XML/ZIP integrity, editable character inventory,
per-cell text order, native table/cell counts, table origins and column widths,
section sizes, artwork anchors and rendered page counts. Character inventory is
compared with recoverable text in the extraction model; barcode/unmapped artwork
is intentionally outside that inventory. It does not prove visible text is never
clipped or establish reading order for arbitrary layouts.

The rendering script creates same-resolution side-by-side comparisons and
per-page mean pixel differences. Pixel differences are diagnostic measurements,
not pass thresholds or a percentage-fidelity claim. Manual comparison remains
necessary, especially for dense cells and fonts.

The UI runner verifies selection, image-only failure, worker cancellation,
successful credit charging, download behavior, zero-credit blocking and the
150 MB mobile safety gate. It disables the existing analytics bootstrap during
its network assertion; conversion must then issue no non-read requests. Mobile
checks use Chrome with iPhone/Pixel viewport emulation, not physical devices or
mobile Safari.

## Validation for this batch

- TypeScript and the full application build passed, including the SEO/PWA steps.
- All 20 PDF-to-Word unit tests passed, covering the existing extraction policies
  and the new geometry, font, table, rotation and multiline baseline regressions.
- UI checks passed for credits, worker cancellation, downloads, local processing
  and emulated mobile safety/viewport behavior.
- Package checks covered 22 documents / 34 source pages, 16 native tables and
  32,435 non-whitespace editable characters from the extraction model. The maximum
  encoded table-origin rounding error was 0.0182 PDF points. Column widths,
  artwork anchors, section sizes and per-cell character order also passed.
- All 34 pages were rendered and compared with same-resolution source images;
  all rendered page counts matched. Representative manual checks included the
  statement, payslip, photo-and-text document, columns, merged tables, fonts,
  artwork and rotated labels. The rotation limitation below remains visible.

These counts are regression evidence for this corpus, not universal conversion
guarantees. Build warnings from existing PDF/WASM dependencies remain.

## Remaining limitations

- The tested LibreOffice renderer ignores 180° and arbitrary shape-text rotation;
  content stays editable but can appear horizontal. The conversion report warns
  about this. Desktop Word rendering of these angles has not been verified.
- Font substitution still changes glyph shape and can change spacing in other
  editors. Embedded PDF fonts are not embedded into DOCX. Dense or unusual text
  needs review; complex scripts, RTL reading order and vertical CJK typesetting
  are not comprehensively validated by this corpus.
- Unruled inference deliberately leaves ambiguous/multiline and two-column layouts
  as text. Three-column prose can remain ambiguous. Lists are editable text rather
  than fully inferred Word numbering structures.
- Non-text artwork is preserved as a raster layer; arbitrary foreground/background
  interleaving is not fully reconstructed. Decorative text classified as unmapped
  or barcode artwork is preserved visually, not made editable.
- Fixed tables preserve source row heights and positioned elements preserve page
  geometry. Large edits can overflow those boxes and require manual Word layout
  adjustments. Repeating content is positioned per page, not deduplicated into
  semantic Word headers/footers.
- Long documents still depend on available browser memory during final DOCX
  assembly. Range-backed reads, transferable artwork buffers, workers and existing
  per-page protections remain; no new desktop file/page cap is introduced.
- Image-only/scanned pages and password-protected inputs remain unsupported.
- This batch has no physical Android/iOS or desktop Microsoft Word acceptance run.
  A Cloudflare preview and user review are still needed before any merge decision.

## Files in this batch

- `src/utils/pdfToWord/model.ts`
- `src/utils/pdfToWord/geometry.ts`
- `src/utils/pdfToWord/fonts.ts`
- `src/utils/pdfToWord/extract.ts`
- `src/utils/pdfToWord/layout.ts`
- `src/utils/pdfToWord/docx.ts`
- `tests/pdf-to-word-geometry.test.ts`
- `tests/pdf-to-word/corpus.mjs`
- `scripts/check-pdf-to-word.mjs`
- `scripts/check-pdf-to-word-ui.mjs`
- `scripts/render-pdf-to-word-qa.py`
- `scripts/verify-pdf-to-word.py`
- `PDF-TO-WORD.md`
