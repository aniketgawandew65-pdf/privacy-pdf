# PDF to editable DOCX experiment results

## Assessment

The browser-local approach works for both supplied digital PDFs: all extracted source characters remain in order as editable Word text, both ruled tables become real Word tables, and the Bond photograph survives as an embedded image. The result is useful for reviewing feasibility, but **not ready for production integration**. Font substitution, border simplification, arbitrary document layouts, Word/WPS compatibility, and physical mobile memory behavior need more work and testing.

This is an experiment on `experiment/local-pdf-to-docx`, based on freshly fetched main `3e7568b54dfa47e098717c649f32392ed100332e`. Existing application code and configuration were not changed. No merge, push, or production deployment was performed.

## Evidence and comparison method

Both source PDFs and both supplied reference DOCX files were inspected, including every rendered page and their text/table structures. Fresh output was generated through the prototype's real file-selection, conversion, and download interface in local desktop Chrome. The DOCX packages were checked, rendered with bundled LibreOffice, and every final output page was visually reviewed: one payslip page and five Bond pages.

Text equality below removes whitespace before comparing the full ordered sequence. It establishes character content and order for these examples; it does not establish identical spacing or a universal reading-order guarantee. Each supplied reference DOCX has the same normalized text sequence as its paired PDF.

## Payslip test

Inputs: supplied `Aniket Gawande_July.pdf` and `Aniket Gawande_July.docx`.

| Category           | Observed result                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Text accuracy      | 637 of 637 non-whitespace characters preserved in exactly the same sequence. Labels, amounts, and payment information remain text.                                                                                                                                                   |
| Layout             | One A4 page retained. Company heading, outer grid, earnings/deductions area, totals, and lower payment area retain their overall arrangement. Grid height and vertical spacing differ slightly.                                                                                      |
| Tables             | One real 20-row Word table. The reference also has 20 rows. Output contains 65 physical XML cells including merge continuations; the reference has 75. Their internal grid decompositions differ. The reconstruction reports 64 substantive cells, 26 of which span rows or columns. |
| Borders            | Outer border and principal grid rules retained. Rules become black single borders; some partial rules in the lower payment area are simplified or absent.                                                                                                                            |
| Alignment          | Centered company/header content, label/value divisions, and numeric columns remain recognizable. Positions and merged regions are approximate rather than identical.                                                                                                                 |
| Editability        | All source text is in Word runs inside table cells. No page image, no document protection, and no external resource relationships. Real Word table structure supports editing individual cell content. Interactive Word/WPS editing was not tested.                                  |
| Fonts              | Helvetica Neue and Times New Roman family hints, sizes, bold, italic, and detected underline retained. Fonts are not embedded. The LibreOffice renderer substituted a serif face for Helvetica Neue despite fallback hints, creating the most obvious visual difference.             |
| Images/backgrounds | Source has vector rules and text, with no photograph. Output contains no image files.                                                                                                                                                                                                |
| Known differences  | Font appearance, grid decomposition, row spacing/height, some partial borders, and exact text placement differ from the reference. The original editable Word structure cannot be recovered exactly from geometry alone.                                                             |

## Bond document test

Inputs: supplied `Bond.pdf` and `Bond.docx`.

| Category          | Observed result                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text accuracy     | 5,921 of 5,921 non-whitespace characters preserved in exactly the same sequence. No missing or extra characters in this comparison.                                                                                                                |
| Layout            | Five A4 pages retained, with the photograph and body on page 1, lists on page 2, table on page 3, and later sections on pages 4–5. No clipping or overlap observed in the final render.                                                            |
| Headings          | Bold section headings and their separation remain visible; heading detection uses size/weight heuristics. Literal section numbers survive.                                                                                                         |
| Paragraph flow    | Body lines are joined into editable flowing paragraphs within each source page. Paragraphs crossing PDF page boundaries remain split. List markers remain literal editable hyphens/numbers rather than automatic numbering.                        |
| Image             | One embedded graphics image preserves the photograph on page 1 at approximately the original size and position. It is resampled within the rendering budget. Source text is excluded from this image layer.                                        |
| Table             | One editable 6-row × 5-column Word table, matching the reference's 30 cells. Text, italic fragments, row/column organization, and principal borders retained. Source separate/double-looking borders become single rules, and row spacing differs. |
| Editability       | Body paragraphs, headings, list text, and all table cell text are Word runs. Photograph remains an image. No document protection or external resource relationships. Interactive Word/WPS editing was not tested.                                  |
| Fonts             | Times New Roman family hint and approximately 16-point body sizing retained, together with detected bold and italic runs. Font availability in the receiving editor still affects rendering.                                                       |
| Page breaks       | Five source page boundaries represented by sections, and final LibreOffice output remains five pages. The reference DOCX places one late heading/paragraph differently across pages 4–5; the converter follows the PDF boundaries.                 |
| Known differences | Some line wrapping, paragraph/table spacing, image resampling, simplified borders, and paragraph splits at page boundaries. Editing can add pages and shift text relative to anchored artwork.                                                     |

## What is reliable, approximate, or unsupported

**Works well on these examples:** selectable digital text, basic emphasis, inferred ruled tables, common merged cells, photographic artwork, local DOCX generation, and source page dimensions/boundaries.

**Approximate:** inferred paragraph boundaries and alignment, original margins, exact font metrics, border styling, image fidelity, decorative layers, and matching the original document's internal structure.

**Unsupported or not established:** image-only/scanned pages, robust OCR layout reconstruction, unruled tables, arbitrary multiple columns, complex scripts/rotation/math, semantic headers and footers, form fields, and precise clipping interactions. A no-text page terminates the conversion rather than returning a screenshot-only result. These broader cases were not validated with the two samples.

Local OCR is feasible using the existing project's Tesseract approach, studied read-only. It is not included here. OCR alone does not recover the original paragraph, table, or font semantics, and would need confidence reporting and more mobile resource testing. No existing OCR file was changed.

There is no general way to guarantee recovery of authoring information absent from a PDF: original Word styles, exact merged-cell decisions, logical list definitions, lost character mappings, and original paragraph boundaries may be unknowable. This is an input-information limitation, not evidence that all such conversion requires a server. Browser-local conversion can be extended, but pixel-identical layout together with unrestricted Word reflow cannot be promised across editors and font installations.

## Verification results

- Build and strict TypeScript checks passed.
- Prettier checks passed; no ESLint configuration is present.
- All five unit tests passed: ruled table/cell assignment, horizontal merge, rectangular vertical merge, rule deduplication/isolated underline behavior, and paragraph grouping (some assertions share a test).
- Built-preview browser checks passed: invalid input, corrupt PDF, 30 MB limit, no-text rejection, 60-page limit, password-protected input, and cancellation. Controls recover and no failed conversion offers a download.
- A 390-pixel viewport showed no horizontal UI overflow. This is a desktop browser viewport test, **not physical Android/iOS testing**.
- Both acceptance conversions completed through the UI. Warm local Mac conversion timings were about 0.66 seconds for the payslip and 1.23 seconds for Bond; these are single observations, not mobile performance claims.
- Captured requests during the conversions and error suite contained no document upload or external request; only local application resources were requested. The converter has no backend conversion endpoint.
- Both DOCX ZIPs passed CRC checks; every XML/relationship part parsed. Neither output contains protection or external resource relationships. This plus successful LibreOffice rendering is practical package validation, not a complete OOXML schema certification.
- All six final rendered pages were inspected. No clipped or overlapping content was observed. No full-page screenshot containing the editable text was used.
- Microsoft Word, WPS Office, Google Docs, physical Android/iOS, and Safari/WebKit were **not tested for this experiment**. Earlier mobile credit-persistence checks are unrelated.

Before becoming a real 1into1 tool, this needs a broader PDF corpus, Word/WPS open-and-edit checks, physical mobile resource/cancellation tests, stronger layout diagnostics, and an explicit digital-only versus OCR product scope. Keep it separate until those results and the visual compromises are acceptable.

## Local artifacts

Fresh outputs are in `.local/output/payslip-editable.docx` and `.local/output/bond-editable.docx`. Private QA reports, screenshots, and renders are under `.local/`. These artifacts, source inputs, node_modules, and build output are excluded from Git.

## Exact changed-file list

All 19 files below are new, relative to the repository root. No existing tracked file is modified:

```text
experiments/pdf-to-docx/.gitignore
experiments/pdf-to-docx/README.md
experiments/pdf-to-docx/QUALITY_REPORT.md
experiments/pdf-to-docx/index.html
experiments/pdf-to-docx/package.json
experiments/pdf-to-docx/package-lock.json
experiments/pdf-to-docx/tsconfig.json
experiments/pdf-to-docx/vite.config.ts
experiments/pdf-to-docx/src/model.ts
experiments/pdf-to-docx/src/extract.ts
experiments/pdf-to-docx/src/layout.ts
experiments/pdf-to-docx/src/docx.ts
experiments/pdf-to-docx/src/reconstruct.worker.ts
experiments/pdf-to-docx/src/main.ts
experiments/pdf-to-docx/src/style.css
experiments/pdf-to-docx/tests/layout.test.ts
experiments/pdf-to-docx/scripts/check-browser.mjs
experiments/pdf-to-docx/scripts/convert-references.mjs
experiments/pdf-to-docx/scripts/validate-docx.py
```

The original working checkout had a pre-existing `.DS_Store` modification before this experiment; it was left untouched. The separate experiment worktree contains only the additions listed above and is clean after its scoped commit.
