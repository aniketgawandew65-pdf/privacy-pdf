# Local PDF text editor (beta)

Open `/edit-pdf` to change supported existing text. The previous overlay editor is preserved at `/add-text-to-pdf`; `/visual-editor` redirects there in production.

## How it works

The editor parses page content streams, decodes supported font mappings, and replaces `Tj`/`TJ` text instructions. It reuses the original font resource, size, colour and transforms. A final text-position adjustment preserves the next text instruction's starting position. It does not paint a white rectangle over text or rasterize the PDF.

Processing uses the project's existing pdf-lib and PDF.js packages entirely in the browser. No document is uploaded, no new dependency or paid API is needed. Load the app and its resources before disconnecting; the existing service worker caches application assets in production.

## Current boundaries

- 25 MB input limit; one text selection at a time with page navigation, search, preview, comparison, undo and export.
- Supported horizontal simple fonts and Identity-H composite fonts with usable character maps and metrics. Existing subset glyphs are reused.
- Missing/ambiguous glyphs, contextual shaping, right-to-left replacement text, line breaks, and replacements wider than the original advance are rejected.
- No paragraph reflow, direct canvas text selection, image editing, or font/style changes in this editor. Use Add text & shapes for new overlays.
- Scanned image content, outlined text, text inside Form XObjects, quote text operators, inline-image pages, alternate ActualText content, and unsupported fonts remain read-only.
- Internal kerning within an edited TJ selection may change; the following text position is preserved. Review the rendered result before use.
- This is not secure redaction: old content may remain in unreferenced PDF objects. Digital signatures can be invalidated by editing. Keep the source document.
- It is not yet a general Adobe-equivalent editor. Computer-generated origin alone does not guarantee a supported PDF structure.

## Verification

Run `node scripts/test-native-editor.mjs` and `npm run build` from this project folder. The regression script checks real exported text with PDF.js, replacement and following-text positions (including kerning and character/word spacing), subset character reuse, width and missing-character errors, undo and no-text detection.

To exercise a real embedded TrueType font from an independent PDF producer (jsPDF), pass a local TTF path: `node scripts/test-native-editor.mjs /path/to/font.ttf`. The font is used only for local test fixtures in `/tmp`, not bundled into the application.

Browser QA covered loading, editing, original/edited rendering, undo and responsive layout using synthetic documents. A completed native file-save event could not be confirmed in the in-app test browser; check Download in Safari/Chrome before release. Exported PDF bytes passed the separate regression checks.

Compatibility should be tested with representative non-sensitive PDFs from actual users before removing the beta label. No production deployment was performed for this change.
