# PDF to PowerPoint: isolated local converter

Base: production main c9f772e9d2b408b39916cc937a2f06f3ec502e58. Branch: feature/pdf-to-powerpoint.

## Reference analysis

The supplied rent PDF has ten image-only A4 pages. The reference deck contains 31 text shapes and three small pictures on slide one, with nine image-only slides after it. This implies OCR on the first source scan. Its locally rendered first slide changes the source fonts and contains recognition/spacing differences. Scan images are approximately 1,500–1,700 by 2,200–2,600 pixels. Source PDF: 3,744,098 bytes; reference PPTX: 4,625,147 bytes.

The supplied bank reference is a six-slide June 2026 statement, while the first supplied source PDF is a seven-page February 2022 statement. They cannot establish page-for-page accuracy. The reference deck has 394 text/shape objects, two native tables, three JPEG resources, portrait dimensions, and 12,643 text characters. It demonstrates useful editable reconstruction mixed with artwork. A matching PDF has been requested; no matching-input claim should be made until it is supplied.

## Decision

Use the installed PDF.js 6.3.289 package (Apache-2.0) through a dedicated, owned worker. Do not import or modify the Word/OCR/data-extraction engines. Read File ranges rather than copying the entire source buffer. Process, render and release one page at a time.

Generate the limited PresentationML feature set needed for conversion directly, packaging XML and media incrementally with the existing MIT-licensed fflate dependency. A dedicated worker compresses XML and passes already-compressed images through. The main thread receives transferable output chunks and creates a Blob after completion. No base64 media copies or accumulated decoded page canvases are needed. The completed compressed download still consumes local memory.

PptxGenJS was evaluated: it supports browsers, native text/tables/images, custom layouts and MIT licensing. Its general-purpose in-memory deck model and string-based media interface are less suitable here than a small, independently tested streaming package writer. Officegen is principally a Node generation option. Remote conversion services conflict with the required local core workflow. No dependency upgrades are required.

Sources:
- https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
- https://github.com/mozilla/pdf.js/blob/master/LICENSE
- https://github.com/gitbrent/PptxGenJS
- https://gitbrent.github.io/PptxGenJS/docs/api-text.html
- https://github.com/101arrowz/fflate
- https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document

## Output policy

One selected PDF page becomes one slide. Automatic mode reconstructs reliable visible digital text and preserves artwork separately. Scans and unsupported object arrangements retain rendered appearance. A fidelity option preserves every selected page visually. No automatic OCR or invented text. Mixed sizes fit proportionally, centered in a deck based on the first selected page, with white margins instead of cropping. Font substitution and complex-script/editability limitations must be reported.

The page range is sorted into source order and deduplicated. Only safe ordinary hyperlinks are copied; document scripts, actions, embedded attachments and external content fetches are not carried into the deck.

## Integration boundary

Add a new component, isolated engine, package worker, tests and documentation. Only additive routing/navigation, SEO/tool-copy, sitemap and capacity-registry changes. Reuse the existing file-size guard, task gate, exclusive-processing lock and object-URL lifecycle unchanged. Selection, failure, cancellation and download do not consume tasks; successful conversion consumes one.

No source filenames or contents are sent to analytics. Existing app analytics remain the shared app's responsibility. All converter assets are bundled and eligible for existing PWA caching. Offline behavior is tested after assets have loaded.

## Verification

ZIP/relationship/XML checks, source-order and slide-count checks, editable text and media assertions, pixel/geometry limits, invalid/encrypted/cancel tests, synthetic torture fixtures and local reference benchmarks. Render outputs with bundled LibreOffice and compare to source renders. Test credit and network behavior in the browser, phone-sized viewports, and offline conversion. Read-only smoke checks of Word, PDF-to-Image, OCR and a manipulation tool; stop and report an existing-tool failure without changing that tool.

## Reader compatibility and local assets

The final package writer emits known-size local ZIP headers one entry at a time. The initial data-descriptor streaming ZIP passed CRC/relationship checks but the bundled LibreOffice reader rejected it. Repacking identical XML/media with known-size headers opened successfully; the final browser writer now uses that compatible representation directly. fflate still computes compression/CRC, and only central-directory records survive between pages.

PDF.js CMaps, standard fonts and WASM decoders are an explicit local allowlist. Each becomes a lazy inline-data JavaScript asset, which the existing PWA precaches without changing global cache rules. PDF-provided URLs cannot select arbitrary rendering resources. Editable text does not embed fonts; image-preserved content uses PDF.js rendering and available PDF/system fonts.

Complete PDF text objects are omitted during artwork rendering, preserving cursor semantics for any text left in artwork. A later painted object or preserved text run that overlaps an earlier candidate prevents that candidate from being lifted over it. Invisible OCR, clipped text, rotated text, complex scripts and ambiguous Unicode mappings remain artwork. Extremely dense analysis falls back per page instead of freezing in a quadratic reconstruction pass.


## Quality revision — 24 September 2026

Known face names take precedence over generic PDF family flags. Substitute families remain Arial, Times New Roman and Courier New. A bounded short-fragment tracking rule accounts for a two-character run concentrating its width difference into one gap; longer runs and unsafe Unicode keep their earlier limits. No font files are embedded.

Before rendering mutates numeric paths into Path2D, snapshot safe axis-aligned strokes. Migrate only complete rectangular grids with uniform solid borders, a single fully contained text run per cell, and all page text safely extracted. Reject partial/internal borders, annotations, later overpainting and ambiguous paths. Remove complete drawing operators, retain backgrounds as artwork, and serialize native DrawingML table cells with explicit dimensions/margins/borders. Decorative fills remain artwork and do not follow a resized table. Dense/vector-heavy analysis is bounded and optional.

A single full-page raster can cap its rendering scale at source pixel density. A strict operator allowlist and full-page axis-aligned transform check prevent reducing resolution on mixed/vector/annotated pages. All existing device limits still apply.

Native table support is validated by actual LibreOffice rendering as well as XML/cell assertions. Office table rows have reader-dependent minimum text heights, so the initial implementation requires comfortable single-run containment and explicit cell margins; it does not guess merged/multiline geometry. See [Microsoft table sizing guidance](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-a-table-column-or-row-in-powerpoint).
