# Browser-local PDF to editable DOCX experiment

An isolated feasibility prototype for digital PDFs. Choose a PDF, convert it on this device, and download an editable Word document. There is no document editor, upload endpoint, account, or connection to the production application.

## Isolation

Branch: `experiment/local-pdf-to-docx`.

Base: fetched `origin/main` at `3e7568b54dfa47e098717c649f32392ed100332e`.

Everything belongs to `experiments/pdf-to-docx/`, including dependencies, configuration, tests, and this report. No imports from the existing application. No existing project files changed. No merge, push, or deployment is required. Delete this folder/branch to discard the experiment.

## Run locally

Use Node 24 (the version used for verification). Run these commands from this folder:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5192/`. For a built preview:

```sh
npm run build
npm run preview
```

Stop the development server first, or use another port:

```sh
npm run preview -- --port 5193
```

The preview serves static application resources only. PDF bytes are read through the browser File API and never sent to the preview server. No external fonts, analytics, conversion service, or OCR service is used. Downloaded DOCX files include their artwork and require no connection to this app.

## How conversion works

1. PDF.js parses a local file in its bundled worker. The extractor reads text, coordinates, font hints, and drawing operators one page at a time.
2. Horizontal and vertical vector rules are clustered into connected grids. Cell geometry determines rows, columns, horizontal spans, and rectangular vertical merges.
3. Text inside detected cells becomes editable Word table content. Remaining text is grouped into flowing paragraphs using position, gaps, and style changes. Font names, size, emphasis, and some color/underline information become Word run formatting.
4. A graphics render suppresses reconstructed text and detected table rules. Its cropped artwork is placed behind the editable content. Photographs, barcodes with unmapped font codes, and decorative underscore rules remain images. Any text fragments without usable mappings are preserved visually with an explicit warning; their characters are not invented or silently dropped. Readable text is not flattened into a page screenshot. Text already baked into source images cannot be recovered without OCR.
5. A separate worker builds the DOCX using `docx`. Each PDF page supplies a Word section with its page dimensions and inferred margins. A local Blob download contains the result.

The algorithm does not identify the supplied files or use their reference DOCX contents to build output. References are used only for QA.

## Boundaries and limitations

- Digital PDFs only. A page without extractable text stops conversion, including a blank page in an otherwise digital document. Mixed scanned/digital documents are therefore unsupported.
- Existing local Tesseract OCR was studied read-only. Local OCR is feasible, but adding it would still require separate reading-order, table, and confidence reconstruction. It is deliberately not implemented in this first prototype; there is no cloud fallback.
- Ruled tables work best. Unruled tables, newspaper columns, arbitrary rotated text, complex scripts, mathematical notation, and complex clipping are not reliably reconstructed.
- Headers and footers are ordinary page content, not semantic Word header/footer fields. List markers are editable literal text, not automatic Word numbering.
- Fonts are named rather than embedded. Word processors may substitute fonts and alter wrapping. Borders are simplified to black single rules, and cell widths/heights and spacing are approximate.
- Source page breaks are retained. Editing text can increase section height and add pages. Graphics are anchored to source page positions, so large edits can move text relative to artwork.
- Shapes and decoration can survive as a raster graphics layer, not separately editable vector objects. Image resolution is bounded, and overlapping complex artwork is not guaranteed to match the source.
- Unmapped glyphs are detected from replacement/control characters and matched to their drawing operations, without font-name or document-name exceptions. Other readable text continues converting. If the affected drawing cannot be matched, or no editable text remains, conversion stops explicitly. This is not a guarantee that every malformed font mapping can be recognized.
- Rounded table corners are extended to tangent intersections for grid detection. Repeated aligned values infer transaction rows when only column rules exist. Side-by-side blocks and text over fixed artwork use editable, positioned paragraph frames; ordinary prose continues to flow. Large edits in these positioned regions may require manual adjustment in Word.

### Resource controls

30 MB input, 60 pages, 400,000 extracted text characters total, 16,000 text fragments per page, 180,000 drawing operators per page, 3 million rendered pixels per page, and 50 MB total encoded artwork. Table candidates are bounded. Reading, page processing, and DOCX construction have deadlines; conversion supports cancellation and destroys its workers on completion or failure.

These controls reduce risk but do not prove a hard memory ceiling: compressed source images may require large decodes before a small canvas render, and some geometry analysis still runs on the UI thread. Physical-device memory testing is required before integration.

## Verification

```sh
npm run check
npm run format:check
npm test
npm run build
```

There is no ESLint configuration in this experiment; strict TypeScript and Prettier checks are used. Twelve tests cover tables, merges, unruled transaction rows, columns, paragraph boundaries, barcode/unmapped glyph preservation, and decorative rules.

With the preview running, browser QA uses locally installed Chrome. `CHROME_EXECUTABLE` can override the macOS default executable path. Set `PREVIEW_URL` when using a different port.

```sh
PREVIEW_URL=http://127.0.0.1:5193 node scripts/check-browser.mjs
```

Set `ENCRYPTED_PDF` to a local password-protected fixture and `BOND_PDF` to a local digital PDF to include password and cancellation checks. Missing optional fixtures skip those two checks; the recorded evaluation included both.

To convert the two acceptance inputs through the real browser UI:

```sh
PAYSLIP_PDF='/absolute/path/payslip.pdf' \
BOND_PDF='/absolute/path/Bond.pdf' \
PREVIEW_URL=http://127.0.0.1:5193 \
node scripts/convert-references.mjs
```

Outputs, network diagnostics, and screenshots are written under ignored `.local/`. Private inputs and generated documents are not committed. The Python QA helper requires `pdfplumber` and `lxml`; these are only local validation dependencies, never part of conversion:

Set `STATEMENT_PDF` to a third local PDF path to include the bank-statement regression. Its output is `.local/output/statement-editable.docx`.

```sh
python scripts/validate-docx.py source.pdf output.docx reference.docx
```

This checks ZIP/XML integrity, ordered text equality after removing whitespace, table structure, fonts, protection, and external relationships. It does not replace visual rendering or editing tests. See [QUALITY_REPORT.md](QUALITY_REPORT.md) for the actual reference results, differences, and exact file inventory.
