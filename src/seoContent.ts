// Shared by the browser and static-page builder. No browser APIs or imports.
export interface Guide {
  title: string; intro: string; steps: string[]; example: string;
  questions: [string, string][]; related: [string, string][];
}
export const TOOL_GUIDES: Record<string, Guide> = {
  '/compress-pdf': {
    title: 'How to compress a PDF to a target size',
    intro: 'Choose a KB target for an upload limit, or use Standard compression when keeping detail matters more than an exact size. Your PDF is processed on your device.',
    steps: ['Choose your PDF above and select Target Size.', 'Set the target in KB. Check the clarity warning, especially for documents with many scanned pages.', 'Compress, download, and reopen the result. Check small text, signatures and stamps before submitting it.'],
    example: 'A 50 KB limit shared across nine pages leaves about 5.6 KB per page before PDF overhead. That is a very small image budget. A one-page form and a nine-page scan can look very different at the same target.',
    questions: [
      ['Will the result match the KB I choose?', 'Target mode reduces image quality and resolution until the result fits, then pads a smaller result to the selected byte size. This tool uses 1 KB = 1,024 bytes. A valid multi-page PDF still has a minimum size; not every document can fit every target.'],
      ['Why does the compressed PDF look blurry?', 'Very small targets require fewer pixels and stronger JPEG compression. Try a larger allowed size, remove unnecessary pages first, or split the document if the receiving site allows it.'],
      ['Will text remain selectable?', 'This compressor renders pages as images. Selectable text, interactive form fields and existing digital-signature validation may not survive. Keep the original file.'],
      ['What if the upload portal still rejects it?', 'Some portals use 1 KB = 1,000 bytes, while this tool uses 1,024. Choose a lower available target for some headroom and check the portal’s file-type and page-count rules too.']
    ],
    related: [
      ['/compress-pdf-to-50kb','Compress to a 50 KB target'],
      ['/compress-pdf-to-100kb','Compress to a 100 KB target'],
      ['/compress-pdf-to-200kb','Compress to a 200 KB target'],
      ['/compress-pdf-to-300kb','Compress to a 300 KB target'],
      ['/compress-pdf-to-500kb','Compress to a 500 KB target'],
      ['/compress-pdf-to-1mb','Compress to a 1 MB target'],
      ['/compress-pdf-to-2mb','Compress to a 2 MB target'],
      ['/blog/reduce-pdf-for-upload-limit','Read the upload-limit guide'],
      ['/blog/india-pdf-upload-size-limits-2026','Check verified India upload limits']
    ]
  },
  '/pdf-to-word': {
    title: 'Convert PDF to Word without uploading your file',
    intro: 'Turn a computer-created PDF into an editable Word DOCX directly in your browser. The PDF stays on your device while text, detected tables and artwork are reconstructed locally.',
    steps: ['Choose a PDF with selectable text. Scanned or image-only pages need OCR first.', 'Select Convert to Word. The conversion runs locally in your browser without sending the PDF to a document-processing server.', 'Download the editable DOCX and review important text, tables, numbers and page layout in your Word editor before sharing or editing.'],
    example: 'A digital bank statement or business report can become editable Word content while preserving text, detected tables, logos and background artwork where the source structure allows it. Font substitution and editing can still change wrapping or spacing.',
    questions: [
      ['Can I convert a PDF to Word without uploading it?', 'Yes. For supported digital PDFs, reading, layout reconstruction and DOCX generation happen locally in your browser, so the document is not uploaded to a conversion server.'],
      ['Is the resulting Word document editable?', 'Yes. Reconstructed text and detected tables are created as editable Word content where possible, while visual artwork is preserved separately when it cannot be represented as normal editable text.'],
      ['Do I need to sign up to use PDF to Word?', 'No signup is required to start converting supported PDFs. Your normal task allowance still applies.'],
      ['Is every PDF supported?', 'No. This tool is designed for computer-created PDFs with selectable text. Scanned pages, missing character mappings and unusually complex layouts can require OCR or manual review.'],
      ['Are there size limits?', 'Mobile and tablet support up to 150 MB per task. Desktop has no arbitrary file-size or page-count cap; available device resources and page complexity determine practical capacity.'],
      ['Will it look identical in Word?', 'Not always. Text and tables remain editable, but fonts, wrapping, transformed artwork and complex formatting can differ between Word editors. Review the result before relying on exact layout.']
    ],
    related: [
      ['/blog/pdf-to-word-without-losing-formatting','Understand PDF-to-Word formatting preservation'],
      ['/blog/scanned-pdf-to-word-ocr-first','Convert a scanned PDF with OCR first'],
      ['/ocr-pdf','OCR scanned or image-only PDFs first'],
      ['/pdf-to-csv','Extract PDF tables to Excel-ready data'],
      ['/edit-pdf','Edit the PDF directly in your browser'],
      ['/pdf-to-markdown','Convert PDF to Markdown locally'],
      ['/blog/pdf-privacy-comparison-2026','Compare browser-local and server PDF processing']
    ]
  },
  '/crop-pdf': {
    title: 'Crop one page or apply the same crop to an entire PDF',
    intro: 'Trim unwanted margins with a visual crop box. Apply one selection across pages when the document uses a consistent layout.',
    steps: ['Open your PDF and position the crop box around the area you want to keep.', 'Choose whether to apply the crop to all pages. Review pages with a different size, rotation or layout.', 'Generate and download the cropped PDF, then check the first, middle and last pages.'],
    example: 'For a ten-page scan with the same wide border on every page, set the crop once and apply it to all pages. If page five contains a wider table, adjust pages individually instead.',
    questions: [
      ['Does cropping securely remove hidden information?', 'No. Cropping changes the visible page boundary and can leave content outside that boundary in the file. Use the Redact tool when information must be removed from the visible document output.'],
      ['Will this make my PDF much smaller?', 'Not necessarily. Changing page boundaries can preserve the original page content. Use compression separately if you have an upload size limit.'],
      ['Can I use it on a phone?', 'Yes. Use the preview controls to position the crop and review the downloaded result. Smaller documents are easier to handle on phones with limited memory.']
    ], related: [['/redact-pdf','Redact sensitive areas'], ['/resize-pdf','Change PDF paper size'], ['/blog/crop-all-pdf-pages','Read the all-pages crop guide']]
  },
  '/merge-pdf': {
    title: 'Merge PDF files in the order you need',
    intro: 'Combine separate PDF documents into one file without sending the documents to an upload server.',
    steps: ['Select the PDFs you want to combine.', 'Arrange the files in their final reading order before merging.', 'Download the combined PDF and check page count and document order.'],
    example: 'Put a cover letter first, supporting documents second and a reference sheet last. If only part of a source file is needed, split it before merging.',
    questions: [
      ['Does merging also compress the files?', 'Merging and compression are different operations. A merged document may still be too large for an upload portal; compress the result separately if necessary.'],
      ['Do I need an account?', 'No account is needed to use the local merge tool. Keep the browser open until the result is ready.'],
      ['What about password-protected PDFs?', 'Unlock a protected file with its password before merging it. Keep signed originals because modifying a signed document can invalidate its signature.']
    ], related: [['/organize-pdf','Reorder individual pages'], ['/compress-pdf','Compress the merged result'], ['/split-pdf','Extract the pages you need']]
  },
  '/fill-pdf': {
    title: 'How to fill and flatten an interactive PDF form',
    intro: 'Fill supported AcroForm fields directly in your browser. The current tool edits text fields, checkboxes and dropdowns, then lets you keep the form interactive or flatten the filled fields into a static finished copy.',
    steps: [
      'Choose a PDF that already contains interactive form fields.',
      'Wait while the tool detects supported text fields, checkboxes and dropdowns.',
      'Enter or select the values you need.',
      'Leave Flatten Form enabled for a static finished copy, or turn it off when the form should stay editable.',
      'Save the PDF, reopen it, and confirm the filled values and form behavior before submitting or sharing it.'
    ],
    example: 'A fillable application PDF with name and address text fields, an agreement checkbox and a country dropdown can be completed in the browser. Flatten it for a final static copy, or keep it interactive if the recipient still needs editable fields.',
    questions: [
      ['Which fields can 1into1 fill?', 'The current Fill PDF tool supports AcroForm text fields, checkboxes and dropdowns. Other field types are not presented as editable inputs by this workflow.'],
      ['Can it fill a scanned or flat PDF with no form fields?', 'No. If no native AcroForm fields are detected, use a visual text, annotation or signature workflow instead of the interactive form filler.'],
      ['What does Flatten Form do?', 'Flattening keeps the filled field appearance in the PDF while removing the interactive form widgets so the fields are no longer normal editable form controls.'],
      ['Can I keep the PDF form editable?', 'Yes. Turn Flatten Form off before saving. The output keeps the interactive AcroForm so supported fields remain form controls.'],
      ['Does flattening make the entire PDF impossible to edit?', 'No. Flattening removes normal form-field interactivity; it should not be treated as DRM or a guarantee that specialized PDF editors cannot alter page content.'],
      ['Is the PDF uploaded?', 'The form-filling workflow runs locally in your browser.']
    ],
    related: [
      ['/blog/fill-interactive-pdf-form-vs-flat-pdf','Interactive PDF form vs flat PDF'],
      ['/blog/flatten-pdf-form-fields-vs-keep-editable','Flatten fields or keep them editable'],
      ['/sign-pdf','Add a drawn signature'],
      ['/annotate-pdf','Add text and annotations to a flat page'],
      ['/protect-pdf','Password-protect a finished copy']
    ]
  },

  '/sign-pdf': {
    title: 'Place a drawn signature on your PDF',
    intro: 'Draw a signature and position it on the page using the preview. The local tool does not require uploading your PDF.',
    steps: ['Open the PDF and go to the page where your signature belongs.', 'Draw your signature, then position and size it using the available preview controls.', 'Download the result and check the signature’s placement before sharing it.'],
    example: 'For a form with a signature line on the last page, navigate to that page before placing the signature. Zoom in to check that it does not cover nearby text.',
    questions: [
      ['Is this a certificate-based digital signature?', 'No. This tool places a visual signature on a PDF. It does not issue a signing certificate or provide identity verification.'],
      ['Can I draw with my finger?', 'Yes, the drawing interface supports touch. Review the downloaded PDF because the final placement matters more than how large it looked on your phone screen.'],
      ['Will the recipient accept it?', 'Check the recipient’s instructions. Some workflows require a specific signing service or certificate rather than a drawn signature.']
    ], related: [['/blog/fill-interactive-pdf-form-vs-flat-pdf','Interactive form vs flat PDF'], ['/fill-pdf','Fill supported PDF form fields'], ['/edit-pdf','Add text and shapes to a PDF'], ['/protect-pdf','Password-protect a copy']]
  },
  '/heic-to-jpg': {
    title: 'Convert an iPhone HEIC photo to JPG',
    intro: 'Use JPG when a website or recipient cannot open a supported HEIC photo. Conversion runs in your browser after the required converter has loaded.',
    steps: ['Choose a HEIC image from your device.', 'Run the conversion and wait for the JPG result.', 'Download and open the JPG to check orientation, colours and detail.'],
    example: 'If an application form accepts JPG images but your iPhone photo is HEIC, convert the image first. If the portal has a size limit, reduce the resulting JPG separately.',
    questions: [
      ['Does every HEIC file work?', 'No converter supports every possible encoding equally. If a file fails, try exporting it as JPEG from the device that created it.'],
      ['Will the JPG be smaller?', 'Not necessarily. HEIC is an efficient format, so the JPG may be larger. Conversion improves compatibility; compression is a separate step.'],
      ['Can I turn the photo into a PDF?', 'Yes. Convert to JPG first if needed, then open Image to PDF to arrange your photos into a document.']
    ], related: [['/compress-image','Reduce the JPG size'], ['/image-to-pdf','Turn photos into a PDF'], ['/pdf-to-jpg','Convert PDF pages into images']]
  },
  '/annotate-pdf': {
    title: 'How to annotate a PDF with text, highlights and drawings',
    intro: 'Add notes, freehand drawings, highlights, rectangles, circles and arrows directly to a PDF in your browser without sending the document to a processing server.',
    steps: [
      'Choose the PDF you want to annotate.',
      'Select Text, Pen, Highlight, Rectangle, Circle or Arrow.',
      'Place or draw the annotation directly on the PDF page.',
      'Move, resize or delete annotations until the page looks right.',
      'Use the page controls to annotate additional pages.',
      'Create and download the annotated PDF, then reopen it to check the final placement.'
    ],
    example: 'For a contract that needs review notes, highlight an important sentence, add an arrow beside a clause and place a short text note next to it. The downloaded PDF keeps those annotations visibly applied to the page.',
    questions: [
      ['Are my PDF files uploaded to a server?', 'No document-processing upload is required. Annotation is performed locally in your browser.'],
      ['Can I annotate scanned PDFs?', 'Yes. You can add text, drawings, highlights and shapes over scanned PDF pages as long as the document can be opened in your browser.'],
      ['Will the annotations appear on mobile?', 'The annotations are applied directly to the downloaded PDF page instead of relying on viewer-specific interactive form controls, which improves consistency across desktop and mobile PDF viewers.'],
      ['Can I annotate multiple pages?', 'Yes. Move between pages with the page controls and add different annotations to each page.'],
      ['What tools are available?', 'The editor supports text, freehand pen drawing, highlighting, rectangles, circles and arrows.']
    ],
    related: [
      ['/edit-pdf','Add text and shapes'],
      ['/sign-pdf','Add a drawn signature'],
      ['/watermark-pdf','Add a watermark'],
      ['/scan-to-pdf','Turn photos into a PDF']
    ]
  },

  '/edit-pdf': {
    title: 'How to add text overlays and whiteout areas to a PDF',
    intro: 'Use the visual editor when you need to place new text on top of a PDF or cover a visible area with a white rectangle. This is overlay editing: it does not rewrite the original text objects underneath.',
    steps: [
      'Open the PDF in the visual editor and go to the page you want to change.',
      'Choose Add Text for a movable text box or Whiteout for a plain white rectangle.',
      'Drag the overlay into position and resize it with the edge or corner handles.',
      'For text, choose font, size, color, style, alignment and whether to erase the visible area underneath with a white background.',
      'Repeat on other pages as needed.',
      'Save changes and inspect the downloaded PDF before replacing the original.'
    ],
    example: 'To correct a visible name on a non-sensitive form, place a whiteout rectangle over the old visible name and add a new text overlay above it. Do not use this technique to hide confidential information that must be permanently removed.',
    questions: [
      ['Does this edit the original PDF text object?', 'No. The current workflow adds new overlays on top of the page. A white background can visually cover what is underneath, but the tool does not rewrite the original text object in place.'],
      ['What can I add?', 'The current overlay model supports text boxes and whiteout rectangles. It does not currently add arbitrary images or generic vector shapes.'],
      ['Can I move and resize overlays?', 'Yes. Text and whiteout items can be dragged and resized. Keyboard arrow keys can also nudge a selected item for fine positioning.'],
      ['What text formatting is available?', 'Text overlays support Helvetica, Times or Courier; font sizes from 1 to 72; color; bold; italic; underline; strikethrough; left/center/right alignment; and an optional white background.'],
      ['Does it support Unicode text overlays?', 'Not reliably on every path. For clean unencrypted PDFs, the native vector save path keeps printable ASCII characters and strips other characters from overlay text.'],
      ['Is Whiteout secure redaction?', 'No. Whiteout is a visual covering tool. Use the dedicated Redact PDF workflow when sensitive content must be removed rather than merely covered.'],
      ['Does the editor preserve the original PDF structure?', 'Clean unencrypted PDFs use a native overlay path that keeps the source PDF and adds the overlays. Protected or incompatible PDFs can fall back to a rendered image-based reconstruction.'],
      ['Is the PDF uploaded?', 'The editing workflow runs locally in your browser.']
    ],
    related: [
      ['/blog/add-text-to-pdf-with-visual-overlays','Add text to a PDF with visual overlays'],
      ['/blog/pdf-whiteout-vs-redaction','Whiteout vs secure redaction'],
      ['/redact-pdf','Permanently redact sensitive PDF content'],
      ['/fill-pdf','Fill existing interactive form fields'],
      ['/edit-metadata','Edit PDF title, author and metadata']
    ]
  },

  '/html-to-pdf': {
    title: 'How to convert self-contained HTML into a PDF locally',
    intro: 'Paste HTML markup or upload an .html/.htm file, choose A4, US Letter or 80mm receipt output, and generate the PDF locally. The tool does not fetch or render a live webpage URL.',
    steps: [
      'Paste HTML into the editor or upload an .html/.htm file.',
      'Choose A4, US Letter or 80mm Thermal Receipt.',
      'Choose portrait or landscape for A4 and Letter.',
      'Use self-contained HTML: inline styles, embedded style blocks, SVG and data-image assets work more reliably than external dependencies.',
      'Convert and download the PDF, then inspect layout, images, links and page breaks.'
    ],
    example: 'A self-contained invoice with inline CSS and a base64-embedded logo can be converted to A4 PDF without sending the HTML to a rendering server. A remote stylesheet or remote image is not fetched by the converter.',
    questions: [
      ['Can I paste HTML code directly?', 'Yes. Paste mode converts the markup currently in the editor.'],
      ['Can I upload an HTML file?', 'Yes. The current interface accepts .html and .htm files.'],
      ['Can I paste a webpage URL?', 'No. The tool converts HTML source, not a live URL. It does not crawl or fetch an external webpage.'],
      ['Are scripts executed?', 'No. Script elements, inline event-handler attributes and javascript: links are removed before styled document rendering.'],
      ['Do external stylesheets load?', 'No. External link-based stylesheets are removed. Use inline styles or an embedded style block for self-contained formatting.'],
      ['Do remote images load?', 'No. Image elements whose source is not a data:image URL are removed by the styled HTML sanitizer. Embed important images as data URLs.'],
      ['Is receipt output rendered the same way as A4 or Letter?', 'No. Receipt mode uses a simpler semantic document renderer for headings, text, tables, rules and embedded data images. A4 and Letter use the richer styled renderer.'],
      ['Is the HTML uploaded?', 'The conversion runs locally in your browser.']
    ],
    related: [
      ['/blog/convert-html-file-to-pdf-locally','Convert an HTML file to PDF locally'],
      ['/blog/html-file-to-pdf-vs-webpage-to-pdf','HTML file to PDF vs webpage to PDF'],
      ['/text-to-pdf','Turn plain text into a PDF'],
      ['/code-to-pdf','Create a syntax-highlighted code PDF'],
      ['/pdf-to-image','Render finished PDF pages as images']
    ]
  },

  '/csv-to-pdf': {
    title: 'How to convert CSV, TSV or pasted spreadsheet data to PDF',
    intro: 'Turn delimited spreadsheet data into a paginated PDF table locally. Upload CSV or TSV, or paste cells copied from a spreadsheet, then choose page size, orientation and table style.',
    steps: [
      'Upload a .csv or .tsv file, or paste spreadsheet cells directly into the editor.',
      'Optionally add a document title.',
      'Choose A4 or US Letter and select Auto, Portrait or Landscape orientation.',
      'Choose Striped Rows, Clean Minimal or Emerald Modern.',
      'Convert and inspect the output, especially wide columns, long values and page breaks.'
    ],
    example: 'A seven-column sales export can be uploaded as CSV. With Auto orientation, 1into1 chooses landscape because the detected table has more than five columns, then splits extra-wide column groups into readable PDF panels when necessary.',
    questions: [
      ['Does the tool support TSV as well as CSV?', 'Yes. The parser detects whether the first record is more strongly tab-delimited or comma-delimited and supports both .csv and .tsv uploads.'],
      ['Can I paste cells from Excel or Google Sheets?', 'Yes. Pasted tabular text can be parsed directly, so copied tab-separated spreadsheet cells work without first saving a file.'],
      ['Does it handle commas inside quoted CSV fields?', 'Yes. The parser understands quoted fields, escaped double quotes and line breaks inside quoted fields.'],
      ['How does Auto orientation work?', 'The current UI chooses landscape automatically when the parsed table has more than five columns; otherwise it uses portrait.'],
      ['What happens when the table is too wide for one page?', 'The renderer keeps a readable minimum column width and can split columns into multiple horizontal panels instead of shrinking every column until the text becomes unreadable.'],
      ['Does the first row become the table header?', 'Yes. The current renderer treats the first parsed row as the header and repeats that header on continuation pages.'],
      ['Does CSV preserve Excel formulas, charts or formatting?', 'No. CSV and TSV contain delimited values rather than full workbook formatting, charts or formulas. The PDF is built from the parsed cell text.'],
      ['Is the spreadsheet data uploaded?', 'The parsing and PDF generation run locally in your browser.']
    ],
    related: [
      ['/blog/convert-csv-or-tsv-to-pdf-table','Convert CSV or TSV to a PDF table'],
      ['/blog/wide-csv-table-to-pdf-landscape','Make wide CSV tables readable in PDF'],
      ['/pdf-to-csv','Extract table-like PDF content to CSV'],
      ['/html-to-pdf','Convert a self-contained HTML table to PDF'],
      ['/text-to-pdf','Create a formatted text PDF']
    ]
  },

  '/code-to-pdf': {
    title: 'How to convert source code to a syntax-highlighted PDF',
    intro: 'Paste source code or upload a text source file, then create an A4 or US Letter PDF locally with optional line numbers, dark or light styling and safe handling for long lines.',
    steps: [
      'Paste source code into the editor or upload a source file that can be read as text.',
      'Optionally set a header title such as main.py or query.sql.',
      'Choose Dark (Terminal) or Light (Print).',
      'Choose portrait or landscape, A4 or US Letter, and 7.5pt, 8.5pt or 10pt text.',
      'Keep line numbers enabled when you need stable references during review.',
      'Convert and inspect wrapped long lines, special characters and page breaks.'
    ],
    example: 'A Python or JavaScript source file can be exported as a dark A4 PDF with line numbers. If individual lines are too wide, they are split into continuation chunks instead of being cut off at the right edge.',
    questions: [
      ['Does the tool auto-detect the programming language?', 'No. The current highlighter is generic rather than a full language parser. It recognizes common keywords, strings, comments, numbers and function-like names across several coding styles.'],
      ['Which code files can I upload?', 'The current file picker does not restrict extensions. The selected file must be readable as text; examples shown in the interface include .js, .ts, .py and .json.'],
      ['Can I remove line numbers?', 'Yes. Line numbers are optional and enabled by default.'],
      ['What font sizes are available?', 'The current controls offer 7.5pt Compact, 8.5pt Standard and 10pt Large.'],
      ['What happens to tabs?', 'Tabs are expanded to four-space tab stops before layout so indentation stays predictable in the PDF.'],
      ['What happens to very long code lines?', 'Long lines are split into safe chunks based on the available page width. The original source line number is shown on the first chunk only.'],
      ['Is the PDF fully vector text?', 'Ordinary Latin/ASCII lines use vector text. Lines containing broader Unicode or backslashes can use a local raster fallback to preserve visible fidelity, so not every line is guaranteed to remain selectable.'],
      ['Does the tool compile or run the code?', 'No. It formats source text for PDF output; it does not execute, compile or validate the program.'],
      ['Is the source code uploaded?', 'The conversion runs locally in your browser.']
    ],
    related: [
      ['/blog/convert-source-code-to-pdf-with-syntax-highlighting','Convert source code to a highlighted PDF'],
      ['/blog/print-long-code-to-pdf-with-line-numbers','Print long code with line numbers'],
      ['/html-to-pdf','Convert self-contained HTML to PDF'],
      ['/text-to-pdf','Create a formatted text PDF'],
      ['/pdf-to-text','Extract text from a PDF']
    ]
  },

  '/text-to-pdf': {
    title: 'How to turn formatted text into an A4 PDF locally',
    intro: 'Write or paste rich text into the browser editor, format the document, preview discrete A4 pages, insert manual page breaks when needed, and export the pages as a visual PDF.',
    steps: [
      'Type text directly or paste formatted document content into the editor.',
      'Choose a base font or format selected text with font family, size, color, bold, italic or underline.',
      'Use alignment, lists and other editor controls to structure the document.',
      'Insert a manual page break where you need a new A4 page to begin.',
      'Review the discrete A4 preview and page count.',
      'Download the PDF and inspect every page before sharing it.'
    ],
    example: 'A short proposal pasted from a document editor can keep headings, lists, emphasis and alignment while 1into1 normalizes foreign font sizing and layout CSS into its own A4 page model.',
    questions: [
      ['Which page size does Text to PDF use?', 'The current tool exports fixed portrait A4 pages.'],
      ['Can I add manual page breaks?', 'Yes. The editor inserts a dedicated page-break marker that the paginator uses to start a new A4 page.'],
      ['Which font sizes are available?', 'The current toolbar offers 8, 10, 12, 14, 16, 18, 24 and 32pt choices.'],
      ['Which base fonts are available?', 'Sans-Serif, Serif, Georgia and Monospace presets are available, and selected text can also receive the toolbar font choice.'],
      ['What formatting can survive a rich-text paste?', 'Semantic document structure such as headings, lists, tables, blockquotes and emphasis can survive after sanitization. Useful styles such as color, background, weight, style, alignment and decoration can remain, while foreign font sizing, margins, dimensions and layout CSS are normalized.'],
      ['Can pasted content load remote images or scripts?', 'No. Executable markup and remote-resource elements are stripped. Raster images are allowed only when embedded as data:image PNG, JPEG or WebP content.'],
      ['Is the final PDF searchable or selectable?', 'Not as native PDF text. Each A4 page is rendered to a JPEG-backed page image before being embedded into the PDF, so the output behaves like an image-based document.'],
      ['Is the document uploaded?', 'The editor and PDF generation run locally in your browser.']
    ],
    related: [
      ['/blog/convert-formatted-text-to-pdf-locally','Convert formatted text to PDF locally'],
      ['/blog/paste-rich-text-to-pdf-clean-formatting','Paste rich text into a clean PDF layout'],
      ['/html-to-pdf','Convert self-contained HTML to PDF'],
      ['/code-to-pdf','Create a source-code PDF'],
      ['/ocr-pdf','Add searchable text to an image-based PDF afterward']
    ]
  },

  '/ai-summary-pdf': {
    title: 'How to summarize and chat with a PDF using your own AI endpoint',
    intro: '1into1 extracts the PDF text locally first. Only after you approve the data-sharing notice does the browser send a limited document excerpt and recent chat messages directly to the AI endpoint you selected.',
    steps: [
      'Choose the PDF you want to summarize or question.',
      'Wait while the text is extracted locally. Pages with little usable text can use the local OCR fallback.',
      'Choose Groq, OpenAI, OpenRouter, DeepSeek, or a custom OpenAI-compatible endpoint.',
      'Enter your own API key when the selected cloud provider requires one, or configure a local custom endpoint.',
      'Read and check the consent notice, then approve it only if you want to send the excerpt to that provider.',
      'Use Executive Summary, Key Action Items, Explain Like I am 5, or enter your own question.',
      'Review the AI response against the source PDF before relying on important claims.'
    ],
    example: 'A 90-page report can be extracted locally first. When you ask for an executive summary, the current workflow sends only the first 30,000 characters of the extracted text plus recent chat context to the provider you approved, rather than uploading the PDF file itself through a 1into1 AI proxy.',
    questions: [
      ['Is the PDF itself uploaded to the AI provider?', 'The current AI workflow extracts text locally and sends text in the chat request. It does not send the PDF file itself through a 1into1 AI proxy.'],
      ['How much document text is sent?', 'The current request limits the document context to the first 30,000 characters of extracted text.'],
      ['Are earlier chat messages sent too?', 'Yes. The provider request includes up to the six most recent chat messages in addition to the document excerpt.'],
      ['Can scanned PDFs work?', 'The shared extraction pipeline can run local English OCR on pages that do not contain enough usable digital text, then include recognized text in the extracted document output.'],
      ['Do I have to consent before anything is sent?', 'Yes. The send action stops until the current cloud data-sharing notice is checked. Consent resets when the file, provider or custom endpoint changes.'],
      ['Where is my API key stored?', 'The current app keeps the third-party API key in browser session storage rather than persistent local storage. Provider, custom model and custom endpoint preferences can be stored locally in the browser.'],
      ['Does 1into1 proxy the AI request?', 'No. The browser calls the configured provider or custom endpoint directly with fetch. Provider terms, retention policies, quotas and charges apply separately.'],
      ['Can I use a local AI server?', 'Yes. The Custom / Local option defaults to an OpenAI-compatible localhost endpoint and can be changed. A custom endpoint does not require a key unless your server requires one.'],
      ['Will the AI always be correct?', 'No. The prompt asks the model to answer from the supplied document excerpt, but model outputs can still be incomplete or wrong. Verify important answers against the PDF.']
    ],
    related: [
      ['/blog/summarize-pdf-with-your-own-ai-api-key','Summarize a PDF with your own AI API key'],
      ['/blog/what-data-ai-pdf-summarizer-sends','See exactly what data is sent to the AI provider'],
      ['/extract-pdf-for-llm','Prepare PDF text for another LLM workflow'],
      ['/pdf-to-markdown','Convert a PDF to reviewable Markdown first'],
      ['/ocr-pdf','OCR scanned PDF pages before another workflow']
    ]
  },

  '/scan-to-pdf': {
    title: 'How to scan documents into a PDF on your device',
    intro: 'Capture a document with your camera or choose existing photos, arrange the pages and create a PDF without sending the document to a processing server.',
    steps: [
      'Use Scan with camera on a phone or tablet, or choose existing document photos from your device.',
      'Rotate pages that are sideways and move pages up or down until the document is in the correct reading order.',
      'Choose Original, Grayscale or B&W depending on the document, then create and download the PDF.'
    ],
    example: 'For a three-page signed form, photograph each page in order, rotate any sideways image, use Grayscale or B&W if the paper has uneven lighting, and check the downloaded PDF before submitting it.',
    questions: [
      ['Are my scanned documents uploaded?', 'No document-processing upload is required. The selected images are processed in your browser and assembled into the PDF on your device.'],
      ['Can I scan multiple pages?', 'Yes. Add several camera captures or photos, then reorder them before creating the PDF.'],
      ['What is the difference between Grayscale and B&W?', 'Grayscale removes colour while keeping shades of grey. B&W increases contrast more strongly and can work well for receipts and text documents, but always check the downloaded result for readability.'],
      ['Can I use this on a computer?', 'Yes. On a computer you can choose existing document photos. Direct camera capture depends on the browser and device, so it is most useful on phones and tablets.'],
      ['Does scanning automatically remove the background or straighten perspective?', 'This version converts and enhances the captured page but does not automatically detect document edges or correct perspective. Keep the document reasonably straight when taking the photo.']
    ],
    related: [
      ['/image-to-pdf','Turn existing images into a PDF'],
      ['/compress-pdf','Reduce the scanned PDF size'],
      ['/ocr-pdf','Make scanned text searchable'],
      ['/grayscale-pdf','Convert an existing PDF to grayscale']
    ]
  }
,

  '/pdf-to-markdown': {
    title: 'How to convert selectable PDF text to Markdown privately',
    intro: 'Extract selectable PDF text into Markdown with optional heading and list detection, then copy or download the result for notes, documentation or AI workflows. Processing happens in your browser.',
    steps: [
      'Choose the PDF you want to convert.',
      'Let the tool extract the document text and structure.',
      'Review the generated Markdown for headings, paragraphs and formatting.',
      'Copy or download the Markdown and check important sections against the original PDF.'
    ],
    example: 'A research report can be converted to Markdown before pasting selected sections into an LLM. This gives you cleaner text than repeatedly copying individual PDF pages.',
    questions: [
      ['Why use Markdown instead of plain text?', 'Markdown keeps lightweight structure such as headings and paragraphs, which can make extracted content easier to read and reuse.'],
      ['Can I use the output with ChatGPT or other LLMs?', 'Yes. Review the extracted content first, then use the sections you need with the AI service of your choice.'],
      ['Is the PDF uploaded for conversion?', 'The PDF-to-Markdown extraction workflow runs locally in your browser.'],
      ['Will every PDF convert perfectly?', 'No. Complex layouts, scans, columns and unusual fonts can require manual review. OCR may help when the PDF contains scanned images instead of selectable text.']
    ],
    related: [
      ['/blog/pdf-to-markdown-for-rag','Prepare Markdown for a RAG workflow'],
      ['/blog/scanned-pdf-to-markdown-ocr-first','Convert a scanned PDF to Markdown with OCR first'],
      ['/extract-pdf-for-llm','Prepare PDF text for LLM use'],
      ['/ocr-pdf','Make scanned PDF text searchable'],
      ['/pdf-to-text','Extract plain PDF text'],
      ['/ai-summary-pdf','Summarize or chat with a PDF']
    ]
  },

  '/extract-pdf-for-llm': {
    title: 'How to prepare PDF Markdown for ChatGPT, Claude and other LLMs',
    intro: 'Extract selectable PDF text into Markdown locally, review the result, remove sections you do not need, and only then choose what content to use with ChatGPT, Claude, Ollama or another LLM.',
    steps: [
      'Choose the PDF you want to prepare.',
      'Extract the document into Markdown.',
      'Review the output and remove sections you do not need.',
      'Use only the relevant text with your chosen LLM or AI workflow.'
    ],
    example: 'Instead of uploading a 70-page PDF directly to an AI service, extract the document locally, select the relevant chapters and use only that text in your prompt.',
    questions: [
      ['Does this automatically send my PDF to an AI provider?', 'No. The extraction step prepares document text locally. Sending content to an external AI service is a separate action.'],
      ['Why reduce the document before using an LLM?', 'Removing irrelevant pages or sections can make prompts easier to manage and keeps the AI input focused on the material you actually need.'],
      ['What if the PDF is scanned?', 'Run OCR first when the PDF contains page images without a usable text layer.'],
      ['Can I download the result?', 'Use the available Markdown output controls to save or copy the extracted content for your workflow.']
    ],
    related: [
      ['/blog/pdf-to-markdown-for-rag','Use PDF Markdown in a RAG pipeline'],
      ['/blog/scanned-pdf-to-markdown-ocr-first','Prepare scanned PDFs with OCR first'],
      ['/pdf-to-markdown','Convert PDF to Markdown'],
      ['/ocr-pdf','OCR a scanned PDF'],
      ['/pdf-to-text','Extract plain text'],
      ['/sanitize-pdf','Remove PDF metadata before sharing']
    ]
  },

  '/document-data-extractor': {
    title: 'How to extract structured PDF data into Excel or CSV',
    intro: 'Turn table-style information from digital or scanned PDFs into editable rows and columns, review the detected structure, and export the result as spreadsheet data.',
    steps: [
      'Choose the PDF containing the information you want to extract.',
      'Let the tool inspect the document structure and use OCR when needed.',
      'Review the detected sections, rows and columns.',
      'Correct any cells that need adjustment.',
      'Export the reviewed data to CSV or Excel.'
    ],
    example: 'A multi-page report containing tables can be processed page by page, reviewed as structured rows, corrected where OCR or layout detection needs help, and then exported for spreadsheet work without manually retyping every cell.',
    questions: [
      ['Can it work with scanned PDFs?', 'Yes. The extractor supports scanned documents with page-aware OCR fallback, although scan quality and complex layouts can affect recognition accuracy.'],
      ['Will every PDF table extract perfectly?', 'No. PDFs describe page layout rather than guaranteed spreadsheet structure. Multi-column pages, unusual spacing, poor scans and merged cells can require manual correction.'],
      ['Can I edit the extracted result?', 'Yes. Review and edit detected cells before exporting the structured data.'],
      ['What export formats are available?', 'The extracted data can be exported for spreadsheet use in CSV or Excel format.'],
      ['Is the document processed locally?', 'The extraction workflow is designed to process the document in your browser rather than requiring a normal server-side document upload.']
    ],
    related: [
      ['/blog/extract-pdf-tables-to-excel','Extract PDF tables into Excel-ready data'],
      ['/blog/scanned-pdf-tables-to-excel-ocr','Extract scanned PDF tables with OCR'],
      ['/bank-statement-to-excel','Extract bank-statement data'],
      ['/pdf-to-csv','Extract PDF tables to CSV'],
      ['/ocr-pdf','Make scanned PDF text searchable'],
      ['/pdf-to-markdown','Convert PDF content to Markdown']
    ]
  },

  '/bank-statement-to-excel': {
    title: 'How to convert a bank statement PDF into Excel-ready CSV',
    intro: 'Extract table-style transactions from a text-based bank statement PDF into CSV or TSV, then open the exported file in Excel, Google Sheets or another spreadsheet application. Verify financial values against the original statement.',
    steps: [
      'Choose a text-based bank statement PDF.',
      'Run the table extraction process.',
      'Review detected dates, descriptions, debit, credit and balance columns where available.',
      'Export the result as CSV or TSV.',
      'Open it in Excel or another spreadsheet application and compare important transactions and balances with the original PDF.'
    ],
    example: 'For a monthly statement, export the detected rows to CSV, open the file in Excel, then compare the opening balance, several debits and credits, and the closing balance against the original PDF before using the data for reconciliation.',
    questions: [
      ['Does this create a native XLSX file?', 'This workflow exports spreadsheet-ready CSV or TSV rather than a native XLSX workbook. CSV and TSV files can be opened directly in Excel and most spreadsheet applications.'],
      ['Will every bank statement have the same columns?', 'No. Banks use different layouts, column names and statement formats, so the detected rows and columns should always be reviewed.'],
      ['What if the bank statement is scanned?', 'This table extractor works from usable PDF text. Run OCR first when a scanned statement contains page images instead of selectable text.'],
      ['Should I trust extracted financial values automatically?', 'No. Verify important amounts, dates, debits, credits and balances against the original statement before accounting, reporting or financial decisions.'],
      ['Is the statement processed locally?', 'The extraction workflow is designed to process the PDF in your browser rather than requiring a normal server-side document upload.']
    ],
    related: [
      ['/blog/bank-statement-pdf-to-csv','Convert a bank statement PDF to CSV'],
      ['/blog/scanned-bank-statement-to-excel-ocr','Handle a scanned bank statement with OCR first'],
      ['/pdf-to-csv','Extract PDF tables to CSV'],
      ['/ocr-pdf','OCR a scanned statement'],
      ['/document-data-extractor','Extract more complex document data'],
      ['/blog/redact-bank-statement-pdf','Redact a bank statement before sharing'],
      ['/sanitize-pdf','Remove PDF metadata before sharing']
    ]
  },

  '/pdf-to-csv': {
    title: 'How to extract PDF tables into CSV or Excel-ready data',
    intro: 'Convert table-style PDF content into structured spreadsheet data that can be reviewed in Excel, Google Sheets or another spreadsheet application.',
    steps: [
      'Choose a PDF containing table-style data.',
      'Run the extraction process.',
      'Review the detected rows and columns.',
      'Export the result to a spreadsheet-friendly format.',
      'Check important values against the source PDF.'
    ],
    example: 'An invoice or financial report with rows of dates and amounts can be extracted into structured data, then checked and sorted in a spreadsheet.',
    questions: [
      ['Does this convert every visual PDF table perfectly?', 'No. Table extraction depends on the PDF layout. Merged cells, unusual spacing, scans and complex multi-column designs can require cleanup.'],
      ['What if the PDF contains scanned pages?', 'Use OCR first so text can be detected before attempting structured extraction.'],
      ['Can I use it for bank statements?', 'Yes, and the dedicated Bank Statement to Excel page provides a workflow focused on financial statement extraction.'],
      ['Should I verify the exported data?', 'Yes. Always compare important rows, totals and values with the original PDF.']
    ],
    related: [
      ['/blog/extract-pdf-tables-to-excel','Learn how PDF table extraction works'],
      ['/blog/scanned-pdf-tables-to-excel-ocr','Handle scanned tables with OCR'],
      ['/bank-statement-to-excel','Convert a bank statement to spreadsheet data'],
      ['/ocr-pdf','OCR scanned tables'],
      ['/pdf-to-text','Extract raw PDF text'],
      ['/pdf-to-word','Convert PDF to editable Word without uploading'],
      ['/pdf-to-markdown','Convert PDF to Markdown']
    ]
  },

  '/private-pii-secrets-auto-redactor': {
    title: 'How to find and redact PII and exposed secrets before sharing a file',
    intro: 'Scan supported PDF, TXT and CSV files for common personal information, financial identifiers and credential patterns, review every detected item, and create a redacted copy locally in your browser.',
    steps: [
      'Choose the PDF, TXT or CSV file you want to review.',
      'Run the local sensitive-information scan.',
      'Review each finding rather than automatically trusting every match.',
      'Select the items that should be removed.',
      'Create the redacted copy and inspect the result before sharing it.'
    ],
    example: 'A document prepared for an external recipient may contain an email address, phone number, account identifier or exposed credential. Scan the file first, review the detected items, redact only the sensitive findings you intend to remove, and verify the finished copy.',
    questions: [
      ['What kinds of information can the scanner detect?', 'The tool supports multiple personal, financial and secret patterns, including items such as email addresses, phone numbers, credit-card patterns, government identifiers, bank identifiers, IP addresses and several common credential or token formats. Detection coverage varies by format, so manual review is still important.'],
      ['Does a detected match always mean the information is sensitive?', 'No. Pattern detection can produce matches that are legitimate document content. Review every finding before selecting it for redaction.'],
      ['Can it scan more than PDFs?', 'Yes. The workflow supports PDF, TXT and CSV files. PDF findings can be mapped to document pages, while text-based files use text positions.'],
      ['Does the file need to be uploaded to a processing server?', 'The scanning and redaction workflow is designed to run locally in your browser.'],
      ['Should I still inspect the redacted file?', 'Yes. Reopen the finished copy and verify that the intended information is removed while required document content remains readable.']
    ],
    related: [
      ['/redact-pdf','Permanently redact visible PDF content'],
      ['/sanitize-pdf','Remove PDF metadata and hidden traces'],
      ['/protect-pdf','Password-protect a PDF'],
      ['/extract-pdf-for-llm','Prepare PDF content before using an LLM'],
      ['/blog/pdf-privacy-comparison-2026','Compare PDF processing privacy models']
    ]
  },

  '/sanitize-pdf': {
    title: 'How to deep-sanitize a PDF before sharing it',
    intro: 'Create a clean PDF from the visible page appearance while intentionally removing hidden and interactive document data such as metadata, annotations, forms, attachments, scripts and invisible text layers.',
    steps: [
      'Choose the PDF you want to clean.',
      'Run Deep Sanitize in your browser.',
      'The visible pages are rebuilt into a new PDF.',
      'Download the sanitized copy.',
      'Reopen it and confirm the visible page content is correct before sharing.'
    ],
    example: 'A PDF prepared inside several applications may contain author metadata, comments, form values, attachments, scripts or an OCR text layer. Deep Sanitize rebuilds the visible page appearance while removing those interactive and hidden elements.',
    questions: [
      ['What does Deep Sanitize remove?', 'The workflow is designed to remove document metadata, XMP and custom information keys, embedded files, comments and annotations, forms and hidden values, JavaScript and actions, links, bookmarks and invisible or OCR text layers.'],
      ['Will selectable text remain selectable?', 'No. Deep Sanitize intentionally rebuilds the visible page appearance and removes selectable or OCR text layers along with other hidden and interactive data.'],
      ['Is sanitizing the same as redacting?', 'No. Sanitize removes hidden and interactive document data. Permanent Redaction is the appropriate workflow for visible confidential information that must be blacked out.'],
      ['Should I keep the original PDF?', 'Yes. Sanitization intentionally removes document features, so keep your original separately until you have checked the cleaned copy.'],
      ['Is the PDF uploaded for sanitization?', 'The sanitization workflow runs locally in your browser.']
    ],
    related: [
      ['/blog/pdf-metadata-editor-vs-deep-sanitize','Metadata editing vs deep sanitization'],
      ['/blog/how-to-edit-pdf-title-author-keywords','Edit selected PDF metadata fields'],
      ['/redact-pdf','Permanently redact visible information'],
      ['/edit-metadata','Edit selected PDF metadata fields'],
      ['/protect-pdf','Password-protect the sanitized copy'],
      ['/private-pii-secrets-auto-redactor','Scan for supported PII and secrets'],
      ['/blog/pdf-privacy-comparison-2026','Read the 2026 PDF privacy comparison']
    ]
  },



  '/protect-pdf': {
    title: 'How to password-protect a PDF locally',
    intro: 'Create an encrypted copy that requires a password to open. The current 1into1 Protect PDF workflow uses 128-bit PDF encryption locally and does not expose separate printing, copying or editing-permission controls.',
    steps: [
      'Choose the PDF you want to protect.',
      'Enter and confirm the document password.',
      'Run Encrypt & Protect PDF.',
      'Download the protected copy.',
      'Close and reopen the downloaded file in a normal PDF reader to verify that the password is required.'
    ],
    example: 'A confidential report can be protected with a password before it is shared. The recipient needs that password to open the encrypted copy.',
    questions: [
      ['What kind of password does 1into1 add?', 'The current tool uses the entered password as the document-open/user password and also as the owner password while applying 128-bit PDF encryption.'],
      ['Can I separately block printing, copying or editing?', 'No. The current Protect PDF interface does not expose separate permissions controls for printing, copying or editing.'],
      ['Does protection rasterize or OCR the PDF?', 'No. The qpdf-based protection worker performs a content-preserving encryption rewrite rather than rendering pages into images.'],
      ['Can I protect a PDF that already has a password?', 'Unlock the existing protection first, then apply the new password.'],
      ['Is the PDF uploaded?', 'The protection workflow runs locally in a dedicated browser Worker.']
    ],
    related: [
      ['/blog/how-to-password-protect-pdf-locally','Password-protect a PDF locally'],
      ['/blog/pdf-open-password-vs-permissions-password','Open password vs permissions password'],
      ['/blog/remove-known-pdf-password-locally','Remove a known PDF password locally'],
      ['/unlock-pdf','Remove existing PDF password protection'],
      ['/sanitize-pdf','Remove hidden data before sharing'],
      ['/redact-pdf','Permanently redact visible sensitive content']
    ]
  },

  '/unlock-pdf': {
    title: 'How to remove a known PDF password locally',
    intro: 'Unlock a PDF when you already know the current password. The file is authenticated locally, each decrypted page is rendered, and a fresh unencrypted image-based PDF is created for download.',
    steps: [
      'Choose the password-protected PDF.',
      'Enter the current document password.',
      'Run Unlock & Remove Password.',
      'Download the unlocked copy.',
      'Reopen the result and verify every page before deleting or replacing the protected original.'
    ],
    example: 'If you own a protected statement and know its password, you can create an unlocked copy for a workflow that cannot process encrypted PDFs. Keep the original protected file separately until the rebuilt copy is verified.',
    questions: [
      ['Can this unlock a PDF without knowing the password?', 'No. The current workflow requires the existing password. It is not a password-cracking tool.'],
      ['What happens after the password is accepted?', 'The decrypted pages are rendered and rebuilt into a fresh unencrypted PDF rather than preserving the original encrypted object structure.'],
      ['Will searchable or selectable text remain?', 'No. The rebuilt output uses JPEG-backed page images, so selectable text, OCR text layers, form fields and other interactive structures are not preserved as normal PDF objects.'],
      ['Does it preserve the visible page appearance?', 'The tool renders every decrypted page at high resolution and places the rendered page image into the new PDF. Always inspect the result because rendering can differ from the original internal structure.'],
      ['Is the PDF uploaded?', 'The unlock workflow runs locally in your browser.'],
      ['Can I use this on a file I am not authorized to access?', 'Use the tool only for documents you own or are legally authorized to decrypt.']
    ],
    related: [
      ['/blog/remove-known-pdf-password-locally','Remove a known PDF password locally'],
      ['/blog/what-changes-when-you-unlock-pdf','Understand what changes after unlocking'],
      ['/protect-pdf','Add password protection again'],
      ['/merge-pdf','Merge the unlocked copy'],
      ['/pdf-to-text','Check whether text is selectable after conversion']
    ]
  },

  '/edit-metadata': {
    title: 'How to edit PDF title, author, subject and keywords',
    intro: 'Review and change selected document metadata fields locally before saving a new PDF copy.',
    steps: [
      'Choose the PDF whose metadata you want to review.',
      'Inspect the current title, author, subject and keywords.',
      'Change the fields you want to update.',
      'Save the metadata changes.',
      'Download the updated PDF and keep the original separately until you have checked it.'
    ],
    example: 'Before publishing a document, replace an internal working title and author value with the public title and appropriate author information, then save a new copy.',
    questions: [
      ['Which metadata fields can I edit?', 'The current editor supports PDF title, author, subject and keywords.'],
      ['Does this remove all hidden PDF data?', 'No. Edit Metadata changes selected document-information fields. Use Deep Sanitize when you need to remove a wider range of metadata, attachments, forms, annotations, scripts and hidden text layers.'],
      ['Is the PDF uploaded to edit metadata?', 'The metadata editing workflow runs locally in your browser.'],
      ['Should I overwrite my only copy?', 'Keep the original separately until you have confirmed the metadata and visible document content in the updated file.']
    ],
    related: [
      ['/blog/how-to-edit-pdf-title-author-keywords','Change PDF title, author and keywords'],
      ['/blog/pdf-metadata-editor-vs-deep-sanitize','Understand metadata editing vs deep sanitization'],
      ['/sanitize-pdf','Deep-sanitize PDF hidden data'],
      ['/protect-pdf','Password-protect a PDF'],
      ['/redact-pdf','Remove visible sensitive information'],
      ['/pdf-to-text','Extract selectable PDF text']
    ]
  },

  '/bates-numbering': {
    title: 'How to add Bates numbers to PDF documents for legal review',
    intro: 'Stamp sequential Bates identifiers onto PDF pages for legal discovery, document production, compliance and review workflows while processing the document locally.',
    steps: [
      'Choose the PDF you need to Bates stamp.',
      'Set the prefix, suffix, starting number and number of digits.',
      'Choose the stamp position and font size.',
      'Create the numbered PDF.',
      'Check the first, middle and final pages to confirm numbering and placement.'
    ],
    example: 'Starting at 1 with the prefix CONF- and six digits produces CONF-000001, CONF-000002 and so on. A consistent identifier makes individual pages easier to reference during document review.',
    questions: [
      ['What is Bates numbering?', 'Bates numbering applies a unique sequential identifier to document pages so individual pages can be referenced consistently during legal discovery, review or document production.'],
      ['Can I choose the Bates prefix and starting number?', 'Yes. Set a prefix, optional suffix, starting number and digit padding before generating the stamped PDF.'],
      ['Where can the Bates number be placed?', 'Choose the available page position and font size, then inspect the output to make sure the stamp does not cover important content.'],
      ['Is Bates numbering different from ordinary page numbers?', 'Yes. Ordinary pagination usually describes page order inside one document. Bates identifiers are commonly used as stable references during legal or document-production workflows.'],
      ['Is the PDF uploaded for Bates stamping?', 'The Bates-numbering workflow runs locally in your browser rather than requiring a normal server-side document upload.']
    ],
    related: [
      ['/blog/bates-numbering-for-legal-discovery','Use Bates numbering for legal discovery'],
      ['/blog/bates-numbering-vs-page-numbers','Understand Bates numbers vs page numbers'],
      ['/redact-pdf','Redact confidential information'],
      ['/sanitize-pdf','Sanitize PDF metadata'],
      ['/page-numbers','Add ordinary page numbers'],
      ['/compare-pdf','Compare PDF versions']
    ]
  },

  '/dark-mode-pdf': {
    title: 'How to create a permanent dark mode PDF',
    intro: 'Create a downloadable dark-reading copy of a PDF instead of only changing the viewer interface. Choose OLED pitch black, classic RGB inversion or warm sepia, then keep the original file separately.',
    steps: [
      'Choose the PDF you want to convert.',
      'Select OLED Pitch Black, Classic Inversion or Warm Sepia.',
      'Check the first-page preview and switch modes if images or charts become difficult to read.',
      'Convert the document and download the new PDF.',
      'Reopen the result and verify text, images, diagrams and page order.'
    ],
    example: 'A bright study PDF can be turned into an image-based dark-reading copy that stays dark when opened in another PDF viewer, while the original PDF remains unchanged.',
    questions: [
      ['Is this just a viewer dark theme?', 'No. The tool renders and recolors the PDF pages, then builds a separate downloadable PDF from the transformed page images.'],
      ['Will text remain selectable or searchable?', 'No. Dark Mode rebuilds each page as a JPEG-backed image page, so selectable or OCR text layers do not remain searchable in the converted copy. Keep the original when you need text selection.'],
      ['What is the difference between the three modes?', 'Classic Inversion applies an RGB negative, OLED Pitch Black maps very bright areas to black and very dark areas to soft white while inverting mid-tones, and Warm Sepia applies a sepia colour transform.'],
      ['Will photographs and charts keep their original colours?', 'No. The selected transform is applied to the rendered page, including images and charts, so inspect the preview and final output carefully.'],
      ['Is the PDF uploaded for the conversion?', 'The transformation is performed locally in your browser.']
    ],
    related: [
      ['/blog/how-to-make-pdf-dark-mode-permanent','Create a permanent dark-mode PDF'],
      ['/blog/invert-pdf-colors-vs-oled-vs-sepia','Compare inversion, OLED and sepia modes'],
      ['/grayscale-pdf','Create a grayscale PDF'],
      ['/pdf-to-image','Convert PDF pages to images'],
      ['/ocr-pdf','Make scanned PDF text searchable'],
      ['/compress-pdf','Reduce PDF file size']
    ]
  },

  '/image-converter': {
    title: 'How to convert images between JPG, PNG, WebP, HEIC and PDF',
    intro: 'Convert common image formats directly in your browser. Create PDF files from images or convert supported images into JPG, PNG or WebP without a normal server-side file upload.',
    steps: [
      'Choose one or more supported images from your device.',
      'Select the output format you need.',
      'Reorder multiple images when creating a combined document.',
      'Adjust quality when the selected output format supports it.',
      'Convert and download the result, then check image quality and orientation.'
    ],
    example: 'Several iPhone HEIC photos can be converted into JPG files for compatibility, or arranged in order and combined into a single PDF.',
    questions: [
      ['Which image formats are supported?', 'The converter supports common formats including JPG, PNG, WebP and supported HEIC or HEIF images. Available output options depend on the selected workflow.'],
      ['Can I convert several images together?', 'Yes. Multiple images can be selected and reordered, especially when creating a PDF from a group of images.'],
      ['Can I control image quality?', 'Quality controls are available for supported lossy image formats such as JPG and WebP.'],
      ['Are the images uploaded for normal conversion?', 'The conversion workflow runs in your browser after the required local resources have loaded.']
    ],
    related: [
      ['/pdf-to-image','Convert PDF pages into images'],
      ['/scan-to-pdf','Create a PDF from document photos'],
      ['/compress-image','Reduce image file size'],
      ['/grayscale-pdf','Create a grayscale PDF']
    ]
  },

  '/pdf-to-image': {
    title: 'How to convert PDF pages to JPG, PNG or WebP images',
    intro: 'Render PDF pages into image files directly in your browser. Choose a suitable image format depending on compatibility, quality and file-size needs.',
    steps: [
      'Choose the PDF you want to convert.',
      'Select JPG, PNG or WebP as the image output format.',
      'Adjust quality where the selected format supports it.',
      'Convert the PDF pages.',
      'Download individual page images or the available grouped download.'
    ],
    example: 'A three-page PDF can be rendered into three PNG images for a presentation, or into JPG files when smaller image size and broad compatibility matter more.',
    questions: [
      ['Should I choose JPG, PNG or WebP?', 'JPG is widely compatible and useful for photographic pages, PNG is useful when lossless image quality matters, and WebP can provide efficient modern image compression.'],
      ['Does each PDF page become a separate image?', 'Yes. PDF pages are rendered individually so you can download the page images you need.'],
      ['Can scanned PDFs be converted?', 'Yes. Scanned pages can be rendered as images because the conversion works from the visual PDF page.'],
      ['Is the PDF uploaded for conversion?', 'Page rendering is performed locally in your browser.']
    ],
    related: [
      ['/blog/extract-images-vs-pdf-to-image','Understand embedded-image extraction vs page rendering'],
      ['/extract-images','Extract embedded raster images instead'],
      ['/image-converter','Convert images to other formats or PDF'],
      ['/ocr-pdf','Make scanned PDF text searchable'],
      ['/dark-mode-pdf','Create a dark-reading PDF'],
      ['/compress-pdf','Reduce PDF file size']
    ]
  },

  '/ocr-pdf': {
    title: 'How to OCR a scanned PDF and make it searchable',
    intro: 'Run English optical character recognition locally and create a downloadable PDF with an invisible text layer. The visible scan stays in place while recognised words become searchable and selectable.',
    steps: [
      'Choose the scanned or image-based PDF.',
      'Start OCR and allow the required local OCR resources to load.',
      'Let each page be recognised and rebuilt with its searchable text layer.',
      'Download the searchable PDF.',
      'Open the result and test Ctrl+F or Cmd+F, then verify important names and numbers against the scan.'
    ],
    example: 'A scanned seven-page invoice bundle may look correct but contain no selectable text. OCR can preserve the visible page images while adding recognised text beneath them so you can search for an invoice number or copy a line of text.',
    questions: [
      ['What does OCR PDF mean?', 'OCR reads characters from scanned page images and converts the recognised words into machine-readable text.'],
      ['Will the searchable PDF look different?', 'The workflow keeps the visible scanned page and adds an invisible coordinate-based text layer beneath it, so the document appearance is intended to remain unchanged while search and text selection become available.'],
      ['Which OCR language is currently supported?', 'The current searchable-PDF workflow provides English OCR.'],
      ['Will OCR always be completely accurate?', 'No. Accuracy depends on scan resolution, contrast, fonts, skew, handwriting and image clarity. Verify important values manually.'],
      ['Does OCR upload my PDF?', 'The OCR operation runs in your browser. Required application or OCR resources may need to load before local processing is available.']
    ],
    related: [['/blog/deskew-pdf-before-ocr','Straighten tilted scans before OCR'], ['/blog/scanned-bank-statement-to-excel-ocr','Extract a scanned bank statement with OCR'], ['/blog/scanned-pdf-tables-to-excel-ocr','Extract scanned tables into spreadsheet data'], ['/blog/scanned-pdf-to-markdown-ocr-first','Convert a scanned PDF to Markdown'], ['/blog/scanned-pdf-to-word-ocr-first','Turn a scanned PDF into editable Word'], 
      ['/pdf-to-markdown','Convert recognised PDF text to Markdown'],
      ['/pdf-to-csv','Extract table-style data'],
      ['/bank-statement-to-excel','Extract statement data'],
      ['/scan-to-pdf','Create a PDF from document photos']
    ]
  },

  '/grayscale-pdf': {
    title: 'How to convert a PDF to grayscale or pure black and white',
    intro: 'Create a monochrome copy locally. Use Smooth Grayscale when you want many gray tones, or Pure B&W when you want only black and white pixels with an adjustable threshold.',
    steps: [
      'Choose the PDF you want to convert.',
      'Select Smooth Grayscale or Pure B&W (Photocopy).',
      'If you choose Pure B&W, adjust the Scan Contrast Threshold while checking the first-page preview.',
      'Convert the document and download the new PDF.',
      'Reopen several pages and verify photos, diagrams, light text and fine lines before printing or sharing.'
    ],
    example: 'A colour report with photographs can use Smooth Grayscale to retain tonal detail, while a text-heavy scan can use Pure B&W with a tuned threshold for stronger photocopy-style contrast.',
    questions: [
      ['What is the difference between grayscale and pure black and white?', 'Grayscale keeps many intermediate gray tones. Pure B&W uses only black or white pixels, determined by the selected luminance threshold.'],
      ['What does the threshold slider do?', 'In Pure B&W mode, pixels darker than the threshold become black and lighter pixels become white. The current control ranges from 50 to 200.'],
      ['Will text remain selectable or searchable?', 'No. The converter renders each page and rebuilds the output from JPEG-backed page images, so normal selectable or OCR text layers do not remain searchable in the converted copy.'],
      ['Does this preserve vector graphics?', 'No. The visible page is rendered before the grayscale or black-and-white transform is applied. Keep the original when you need editable or vector content.'],
      ['Is the PDF uploaded?', 'The conversion runs locally in your browser.']
    ],
    related: [
      ['/blog/how-to-convert-pdf-to-grayscale','Convert a PDF to grayscale'],
      ['/blog/grayscale-vs-black-and-white-pdf','Grayscale vs pure black-and-white PDF'],
      ['/dark-mode-pdf','Create a dark-reading PDF'],
      ['/pdf-to-image','Render PDF pages as images'],
      ['/compress-pdf','Compress the converted PDF']
    ]
  },

  '/resize-pdf': {
    title: 'How to resize PDF pages to A4, Letter, Legal, A3 or A5',
    intro: 'Standardize every page to a chosen paper size locally. Choose proportional Fit, Center Original without scaling, or Fill Page stretching, and optionally keep landscape source pages in landscape orientation.',
    steps: [
      'Choose the PDF whose page size you want to standardize.',
      'Select A4, US Letter, Legal, A3 or A5.',
      'Choose Fit to Page, Center Original or Fill Page.',
      'Leave Auto-Detect Orientation enabled when landscape pages should stay landscape.',
      'Resize the PDF, download the result and inspect margins, clipping or distortion on several pages.'
    ],
    example: 'A mixed document can be standardized to A4. Fit to Page scales each page proportionally and centers it, while Auto-Detect Orientation keeps wide landscape pages on landscape A4 sheets.',
    questions: [
      ['What does Fit to Page do?', 'It scales the source page proportionally until it fits inside the target page and centers it. Different page proportions can leave margins.'],
      ['What does Center Original do?', 'It keeps the original content size and centers it on the new page. If the source is larger than the target page, some content can fall outside the new page boundary.'],
      ['What does Fill Page do?', 'It stretches the source width and height independently to fill the target page. This removes empty margins but can distort the original proportions.'],
      ['Does Resize always preserve selectable vector text?', 'Clean PDFs use a vector-preserving page embedding path. Complex or protected PDFs can fall back to high-resolution rendered pages for compatibility, so vector/selectable text is not guaranteed for every file.'],
      ['Which page sizes are supported?', 'The current presets are A4, US Letter, Legal, A3 and A5.'],
      ['Is the PDF uploaded?', 'The resize workflow runs locally in your browser.']
    ],
    related: [
      ['/blog/resize-pdf-to-a4-or-letter','Resize a PDF to A4 or Letter'],
      ['/blog/pdf-resize-fit-vs-center-vs-stretch','Choose Fit, Center or Stretch'],
      ['/crop-pdf','Crop visible page boundaries'],
      ['/nup-pdf','Place multiple pages on one sheet'],
      ['/booklet-pdf','Create a printable booklet']
    ]
  },

  '/nup-pdf': {
    title: 'How to place multiple PDF pages on one sheet',
    intro: 'Create an N-Up PDF by arranging multiple document pages onto each output sheet. This can reduce printed sheet count or create compact reference copies.',
    steps: [
      'Choose the PDF you want to arrange.',
      'Select how many source pages should appear on each output sheet.',
      'Review the page order and layout.',
      'Create the N-Up PDF.',
      'Open the result and check readability before printing.'
    ],
    example: 'A presentation can be arranged four pages per sheet to create a compact handout while preserving the original slide order.',
    questions: [
      ['What does N-Up mean?', 'N-Up places multiple original pages onto one output sheet, such as two or four pages per sheet.'],
      ['Will text become smaller?', 'Yes. Fitting multiple pages onto one sheet reduces each page visually, so check small text before printing.'],
      ['Is N-Up the same as booklet layout?', 'No. N-Up simply places several pages on a sheet, while booklet imposition rearranges pages specifically for folding and booklet printing.'],
      ['Does the PDF need to be uploaded?', 'The N-Up transformation runs locally in your browser.']
    ],
    related: [
      ['/blog/booklet-imposition-vs-two-pages-per-sheet','Booklet imposition vs two pages per sheet'],
      ['/booklet-pdf','Create a booklet layout'],
      ['/resize-pdf','Change PDF paper size'],
      ['/page-numbers','Add page numbers'],
      ['/compress-pdf','Reduce the finished PDF size']
    ]
  },

  '/rotate-pdf': {
    title: 'How to permanently rotate an entire PDF',
    intro: 'Apply the same 90°, 180° or 270° clockwise rotation to every page and save the orientation into a new PDF. Use Organize PDF instead when only selected pages need different rotations.',
    steps: [
      'Choose the PDF you want to rotate.',
      'Select 90°, 180° or 270° clockwise.',
      'Check the first-page live preview.',
      'Rotate the PDF and download the new copy.',
      'Reopen the result in another viewer to confirm the saved orientation.'
    ],
    example: 'If every page in a scanned document is sideways, choose +90° once and create a new PDF whose pages open in that corrected orientation.',
    questions: [
      ['Is this rotation permanent?', 'Yes. The downloaded PDF stores the changed page orientation instead of only rotating the temporary viewer display.'],
      ['Can I rotate only one page with this standalone tool?', 'No. The current Rotate PDF interface applies one selected angle to the whole PDF. Use Organize PDF when individual pages need different rotations.'],
      ['What angles are available?', 'The standalone tool offers +90°, +180° and +270° clockwise rotations.'],
      ['Does rotation reduce quality?', 'For normal unencrypted PDFs, the standard path changes page rotation without intentionally re-rendering the page content. Internally encrypted PDFs can use a rendered compatibility path, so keep the original when exact vector or text preservation matters.'],
      ['Is rotation the same as deskewing?', 'No. Rotate fixes quarter-turn or upside-down orientation. Deskew corrects small tilts such as a page leaning by a few degrees.'],
      ['Is the PDF uploaded?', 'The rotation workflow runs locally in your browser.']
    ],
    related: [
      ['/blog/how-to-rotate-pdf-permanently','Permanently rotate a PDF'],
      ['/blog/rotate-pdf-vs-deskew','Rotate PDF vs Deskew'],
      ['/blog/rotate-selected-pdf-pages-vs-whole-document','Rotate selected pages vs the whole PDF'],
      ['/deskew-pdf','Straighten a slightly tilted scan'],
      ['/organize-pdf','Rotate or reorder individual pages'],
      ['/scan-to-pdf','Create a PDF from document photos']
    ]
  },

  '/organize-pdf': {
    title: 'How to reorder, rotate and delete PDF pages visually',
    intro: 'Use page thumbnails to rearrange one PDF, rotate individual pages in 90-degree steps, and remove pages you do not want before saving a new organized copy locally.',
    steps: [
      'Choose the PDF you want to organize.',
      'Drag page thumbnails into the order you want, or use the move-earlier and move-later controls.',
      'Rotate any individual page clockwise in 90-degree steps when its orientation is wrong.',
      'Delete pages that should not appear in the final document.',
      'Save and download the organized PDF, then verify page order and orientation.'
    ],
    example: 'A scanned packet with pages 1, 3, 2, a sideways page 4 and an unwanted blank page can be reordered, page 4 rotated, and the blank page deleted in one visual workflow.',
    questions: [
      ['Can I reorder pages by dragging them?', 'Yes. Drag page cards to new positions. The tool also provides move-earlier and move-later buttons.'],
      ['Can I rotate only one page?', 'Yes. Each page card has its own clockwise rotation control, applied in 90-degree steps.'],
      ['Can I delete unwanted pages?', 'Yes. Deleting a page removes it from the configuration used to build the downloaded copy.'],
      ['Can I insert or duplicate pages here?', 'No. The current Organize PDF workflow reorders, rotates and removes pages from one source PDF; it does not insert or duplicate pages.'],
      ['Does organizing preserve selectable vector content?', 'Clean unencrypted PDFs use the native page-copy path. Protected or incompatible inputs can fall back to high-resolution rendered pages, so exact vector or text preservation is not guaranteed for every file.'],
      ['Is the PDF uploaded?', 'The organize workflow runs locally in your browser.']
    ],
    related: [
      ['/blog/how-to-reorder-pdf-pages-visually','Reorder PDF pages visually'],
      ['/blog/rotate-selected-pdf-pages-vs-whole-document','Rotate selected pages vs the whole PDF'],
      ['/rotate-pdf','Rotate every page by one angle'],
      ['/remove-pages','Remove pages with a dedicated page-removal workflow'],
      ['/split-pdf','Split one PDF into separate files']
    ]
  },

  '/deskew-pdf': {
    title: 'How to straighten a crooked scanned PDF',
    intro: 'Correct a small consistent tilt in a scanned PDF locally. Use the first-page preview to estimate or fine-tune one angle, then apply that selected correction across the document.',
    steps: [
      'Choose the scanned PDF you want to straighten.',
      'Use Auto-Detect Tilt on the first-page preview or adjust the angle manually.',
      'Fine-tune the correction between -10° and +10° while watching the preview.',
      'Straighten and download the PDF.',
      'Inspect several pages to confirm the same correction angle is suitable across the document.'
    ],
    example: 'If a scanner feeder produced a ten-page document with the same slight clockwise lean on every page, estimate the tilt from page 1, fine-tune it if needed, then apply that angle to the full PDF.',
    questions: [
      ['Does Auto-Detect check every page?', 'No. The current Auto-Detect control estimates the tilt from the first-page preview. The selected angle is then applied across the PDF, so inspect multiple pages when the scan may have inconsistent skew.'],
      ['Can I adjust the angle manually?', 'Yes. Fine Tilt Angle allows adjustments from -10° to +10° in 0.2° steps.'],
      ['Does straightening run OCR?', 'No. Deskew changes page alignment. Use OCR PDF separately when you need a searchable text layer.'],
      ['Can deskewing help before OCR?', 'Yes when skew is interfering with text-line alignment. OCR systems such as Tesseract document deskewing as a useful preprocessing step for skewed scans.'],
      ['Is the PDF uploaded for straightening?', 'The Deskew PDF workflow runs locally in your browser.']
    ],
    related: [
      ['/blog/how-to-straighten-crooked-scanned-pdf','Straighten a crooked scanned PDF'],
      ['/blog/deskew-pdf-before-ocr','Deskew a PDF before OCR'],
      ['/blog/rotate-pdf-vs-deskew','Rotate PDF vs Deskew'],
      ['/ocr-pdf','Run OCR after straightening'],
      ['/rotate-pdf','Rotate pages by 90 degrees'],
      ['/scan-to-pdf','Create a PDF from scans or photos']
    ]
  },

  '/booklet-pdf': {
    title: 'How to create a printable booklet from a PDF',
    intro: 'Rearrange PDF pages into booklet imposition order for double-sided printing and folding. Always test the final print layout before producing many copies.',
    steps: [
      'Choose the PDF you want to turn into a booklet.',
      'Generate the booklet page arrangement.',
      'Download and review the imposed PDF.',
      'Check page pairing and orientation.',
      'Print a small test copy before printing the complete booklet.'
    ],
    example: 'An eight-page document can be reordered into booklet spreads so that, after duplex printing and folding, the pages appear in normal reading order.',
    questions: [
      ['Why are booklet pages rearranged?', 'Booklet printing requires pages to be placed in a different order on the printed sheets so they appear correctly after folding.'],
      ['Should I test-print first?', 'Yes. Printer duplex settings, binding edge and orientation can affect the result, so a short test is recommended.'],
      ['Is booklet layout the same as N-Up?', 'No. N-Up reduces several pages onto a sheet without necessarily creating the page order required for folding a booklet.'],
      ['Is the document processed locally?', 'The booklet arrangement is created in your browser without requiring a normal server-side document upload.']
    ],
    related: [
      ['/blog/how-to-print-pdf-as-booklet','Print a PDF as a folded booklet'],
      ['/blog/booklet-imposition-vs-two-pages-per-sheet','Booklet imposition vs two pages per sheet'],
      ['/nup-pdf','Place multiple pages on each sheet'],
      ['/resize-pdf','Resize PDF pages'],
      ['/page-numbers','Add page numbers'],
      ['/compress-pdf','Compress the final booklet PDF']
    ]
  },

  '/compress-pdf-to-50kb': {
    title: 'How to compress a PDF to a 50 KB target',
    intro: 'A 50 KB PDF is an extremely small target, useful when an upload portal enforces a strict file-size limit. Expect stronger quality reduction, especially on multi-page scans.',
    steps: [
      'Choose the PDF you need to submit.',
      'Select the 50 KB target.',
      'Run compression and download the result.',
      'Zoom in on names, numbers, signatures and stamps.',
      'If important content becomes unreadable, remove unnecessary pages or use a larger limit when the receiving portal allows it.'
    ],
    example: 'A one-page application form has much more room for readable detail at 50 KB than a ten-page scanned document. The more pages you squeeze into the same 50 KB budget, the less image data is available per page.',
    questions: [
      ['Is 50 KB suitable for a multi-page PDF?', 'Sometimes, but it is a very restrictive target. Longer scanned documents can lose substantial clarity because the available file-size budget is shared across all pages.'],
      ['Does the tool make the PDF exactly 50 KB?', 'Target mode works toward the selected byte size and can pad a smaller result, but every valid PDF has structural overhead and not every document can realistically fit every target. Always check the finished size and quality.'],
      ['Why does a 50 KB PDF look blurry?', 'Reaching such a small target can require reducing image resolution and JPEG quality aggressively.'],
      ['What should I check before uploading?', 'Reopen the downloaded PDF and inspect small text, identification numbers, signatures, stamps and every page.'],
      ['What if 50 KB is too small for my document?', 'Remove unnecessary pages, split the PDF if permitted, or use a larger accepted limit such as 100 KB or 200 KB.']
    ],
    related: [
      ['/compress-pdf','Choose a custom PDF target'],
      ['/compress-pdf-to-100kb','Try a 100 KB target'],
      ['/compress-pdf-to-200kb','Try a 200 KB target'],
      ['/compress-pdf-to-300kb','Try a 300 KB target'],
      ['/remove-pages','Remove unnecessary pages'],
      ['/blog/reduce-pdf-for-upload-limit','Read the upload-limit guide']
    ]
  },

  '/compress-pdf-to-100kb': {
    title: 'How to compress a PDF to a 100 KB target',
    intro: 'A 100 KB target is commonly useful for application forms, certificates and other documents submitted to portals with strict upload limits.',
    steps: [
      'Choose the PDF you need to reduce.',
      'Select the 100 KB target.',
      'Compress and download the new PDF.',
      'Check that text, photographs, signatures and stamps are still readable.',
      'Submit the verified copy while keeping your original document separately.'
    ],
    example: 'A two-page certificate or application document can often tolerate a 100 KB target better than a large scanned report. Always judge the downloaded result rather than only checking its file size.',
    questions: [
      ['Is 100 KB enough for a PDF?', 'It depends on page count and content. Text-heavy or short documents generally have an easier quality trade-off than long image-heavy scans.'],
      ['Can I use this for application portals?', 'Yes when the portal accepts PDF and specifies a size around 100 KB. Always follow the portal’s exact file-type and size rules.'],
      ['Does the tool target exactly 100 KB?', 'Target mode works toward the selected byte size and can pad a smaller result. PDF structure and document complexity can make some targets impractical, so check the downloaded file before submitting it.'],
      ['Why should I reopen the result?', 'Meeting the file-size limit does not guarantee that small text, stamps or photographs remain clear enough for the recipient.'],
      ['Should I choose 50 KB instead?', 'Only when the portal requires it. If 100 KB is allowed, using the larger permitted size generally leaves more room for readable detail.']
    ],
    related: [
      ['/compress-pdf-to-50kb','Use a stricter 50 KB target'],
      ['/compress-pdf-to-200kb','Try a 200 KB target'],
      ['/compress-pdf-to-300kb','Try a 300 KB target'],
      ['/compress-pdf-to-500kb','Try a 500 KB target'],
      ['/compress-pdf','Choose a custom PDF target'],
      ['/blog/reduce-pdf-for-upload-limit','Read the upload-limit guide']
    ]
  },

  '/compress-pdf-to-200kb': {
    title: 'How to compress a PDF to a 200 KB target',
    intro: 'A 200 KB target gives documents more room for readable text and images while still meeting many restricted upload-size requirements.',
    steps: [
      'Choose the PDF you want to reduce.',
      'Select the 200 KB target.',
      'Run compression and download the result.',
      'Inspect image quality and small text.',
      'Confirm the final file meets the receiving website’s stated limit before uploading.'
    ],
    example: 'For a several-page application PDF containing text and a few scanned images, 200 KB may preserve noticeably more detail than a 50 KB or 100 KB target.',
    questions: [
      ['When should I choose 200 KB instead of 100 KB?', 'Choose the largest size the receiving portal permits. A larger target usually provides more room for document clarity.'],
      ['Can a long PDF fit into 200 KB?', 'It may, but page count, scans, photographs and graphics affect how much quality reduction is required.'],
      ['Will compression preserve interactive PDF features?', 'The target-size compressor may rasterize pages, so selectable text, form fields or existing digital-signature validation may not survive. Keep the original.'],
      ['What if the portal says maximum 200 KB?', 'Check how the portal defines KB and leave some headroom if necessary. Different systems can calculate kilobytes differently.']
    ],
    related: [
      ['/compress-pdf-to-50kb','Use a 50 KB target'],
      ['/compress-pdf-to-100kb','Use a 100 KB target'],
      ['/compress-pdf-to-300kb','Use a 300 KB target'],
      ['/compress-pdf-to-500kb','Use a 500 KB target'],
      ['/remove-pages','Remove pages before compression'],
      ['/compress-pdf','Choose a custom PDF size']
    ]
  },

  '/compress-pdf-to-500kb': {
    title: 'How to compress a PDF to a 500 KB target',
    intro: 'A 500 KB target provides substantially more room for page detail than very small limits, making it more suitable for longer PDFs, scanned pages and documents containing images.',
    steps: [
      'Choose the PDF you need to reduce.',
      'Select the 500 KB target.',
      'Compress and download the result.',
      'Review the first, middle and final pages.',
      'Check photographs, tables, signatures and fine text before sending the file.'
    ],
    example: 'A multi-page document with scanned signatures or photographs may remain much more readable at 500 KB than at 100 KB, while still fitting a portal or email attachment restriction.',
    questions: [
      ['Why choose 500 KB when smaller options exist?', 'Use the largest size your destination permits. More available bytes generally allow the compressor to preserve more detail.'],
      ['Is 500 KB good for scanned PDFs?', 'It can provide a more practical quality budget than very small targets, although results still depend on page count, resolution and image complexity.'],
      ['Will the output always look identical to the original?', 'No. File-size reduction can change image quality and resolution, so inspect the downloaded copy.'],
      ['Can I choose a size other than 500 KB?', 'Yes. Use the main Compress PDF tool when you need another supported target or standard compression instead.']
    ],
    related: [
      ['/compress-pdf-to-200kb','Use a smaller 200 KB target'],
      ['/compress-pdf-to-300kb','Use a smaller 300 KB target'],
      ['/compress-pdf-to-1mb','Use a larger 1 MB target'],
      ['/compress-pdf-to-2mb','Use a larger 2 MB target'],
      ['/compress-pdf','Choose another PDF target size'],
      ['/crop-pdf','Crop unnecessary margins'],
      ['/blog/reduce-pdf-for-upload-limit','Read the upload-limit guide']
    ]
  },

  '/compress-pdf-to-300kb': {
    title: 'How to compress a PDF to a 300 KB target',
    intro: 'A 300 KB target sits between very restrictive application limits and larger attachment limits, giving short documents and moderate scans more room to remain readable.',
    steps: [
      'Choose the PDF you need to reduce.',
      'Use the 300 KB target already selected for this page.',
      'Compress and download the result.',
      'Reopen the file and inspect small text, signatures, stamps and images.',
      'Confirm the receiving portal accepts a file at or below its stated limit.'
    ],
    example: 'A short application packet with text, signatures and a few scanned elements may retain more useful detail at 300 KB than at 100 KB or 200 KB while still fitting a restricted upload portal.',
    questions: [
      ['When is a 300 KB target useful?', 'Use it when the receiving website allows around 300 KB and you want more quality headroom than smaller targets provide. Always follow the destination’s exact rule.'],
      ['Does 300 KB guarantee good quality?', 'No. Page count, photographs, scans and graphics determine how aggressively the PDF must be reduced. Inspect the downloaded copy before submitting it.'],
      ['Will the tool upload my PDF to a processing server?', 'The compression workflow runs locally in your browser for supported files.'],
      ['What if the PDF cannot realistically fit 300 KB?', 'Remove unnecessary pages, split the document if the destination permits it, or use a larger allowed limit. A valid PDF has structural overhead and not every document can fit every target.']
    ],
    related: [
      ['/compress-pdf-to-200kb','Try a stricter 200 KB target'],
      ['/compress-pdf-to-500kb','Try a larger 500 KB target'],
      ['/compress-pdf-to-1mb','Try a 1 MB target'],
      ['/compress-pdf','Choose another target size'],
      ['/blog/reduce-pdf-for-upload-limit','Read the upload-limit guide']
    ]
  },

  '/compress-pdf-to-1mb': {
    title: 'How to compress a PDF to a 1 MB target',
    intro: 'A 1 MB target gives documents considerably more room for readable text and images than very small KB limits and is useful for email attachments, forms and document portals that accept files around this size.',
    steps: [
      'Choose the PDF you want to reduce.',
      'Use the 1 MB target selected for this page.',
      'Compress and download the result.',
      'Check the output size and reopen the PDF.',
      'Review important text, tables, photographs and signatures before sending or uploading it.'
    ],
    example: 'A longer scan or report that becomes too blurry at 200 KB or 500 KB may preserve substantially more detail when the receiving system allows a 1 MB file.',
    questions: [
      ['How does this tool define 1 MB?', 'This compressor uses 1 KB = 1,024 bytes, so the 1 MB route targets 1,024 KB. Some portals calculate limits differently, so leave headroom when their rule is strict.'],
      ['Is 1 MB better than 500 KB?', 'If the destination permits 1 MB, the larger target generally gives the compressor more room to preserve useful page detail.'],
      ['Can I use this for email attachments?', 'Yes when a smaller attachment is useful, but email providers and recipients have their own limits. Check the final file size before sending it.'],
      ['Will interactive PDF features remain intact?', 'Target-size compression may rasterize pages, so selectable text, form fields or existing digital-signature validation may not survive. Keep the original file.']
    ],
    related: [
      ['/compress-pdf-to-500kb','Use a smaller 500 KB target'],
      ['/compress-pdf-to-2mb','Use a larger 2 MB target'],
      ['/compress-pdf-to-300kb','Use a 300 KB target'],
      ['/compress-pdf','Choose another target size'],
      ['/blog/reduce-pdf-for-upload-limit','Read the upload-limit guide']
    ]
  },

  '/compress-pdf-to-2mb': {
    title: 'How to compress a PDF to a 2 MB target',
    intro: 'A 2 MB target is useful when a portal or recipient allows a larger file and preserving document clarity matters more than forcing the PDF into a very small KB budget.',
    steps: [
      'Choose the PDF you want to reduce.',
      'Use the 2 MB target selected for this page.',
      'Run compression and download the result.',
      'Reopen the output and check representative pages.',
      'Verify the final size against the destination’s limit before uploading or sending it.'
    ],
    example: 'A multi-page scan containing photographs, stamps or tables can often retain more detail at 2 MB than at 500 KB or 1 MB when the receiving system permits the larger file.',
    questions: [
      ['How does this tool define 2 MB?', 'This compressor uses 1 KB = 1,024 bytes, so the 2 MB route targets 2,048 KB. A destination may use a different file-size convention.'],
      ['Should I use 2 MB if a portal allows it?', 'Use the largest limit that meets the destination’s rules when preserving readability is important, then verify the downloaded output.'],
      ['Can every PDF be reduced to 2 MB?', 'No. Very large or image-heavy documents can still require substantial reduction, and some PDFs have practical minimum sizes.'],
      ['Does the document leave my device?', 'The supported compression workflow runs locally in your browser rather than uploading the PDF to a document-processing server.']
    ],
    related: [
      ['/compress-pdf-to-1mb','Use a smaller 1 MB target'],
      ['/compress-pdf-to-500kb','Use a smaller 500 KB target'],
      ['/compress-pdf-to-300kb','Use a stricter 300 KB target'],
      ['/compress-pdf','Choose another target size'],
      ['/split-pdf','Split a large document when permitted']
    ]
  },

  "/split-pdf": {
    title: "How to split a PDF into separate pages or ranges",
    intro: "Split a PDF when you only need certain pages, want smaller separate files, or need to divide one document into logical sections.",
    steps: [
      "Choose the PDF you want to split.",
      "Select individual pages or page ranges.",
      "Create the separate PDF files.",
      "Download the results and open them to confirm the correct pages were included.",
      "Keep the original PDF until you have verified every output file."
    ],
    example: "A 20-page report can be divided into pages 1–5, 6–12 and 13–20 so each section can be shared separately.",
    questions: [
      ["Can I extract only one page?", "Yes. Select a single page when you only need one part of the original document."],
      ["Can I split by page range?", "Yes. Page ranges are useful when the document contains several sections that should become separate PDFs."],
      ["Will splitting reduce file size?", "Each output may be smaller because it contains fewer pages, although the exact size depends on the original PDF."],
      ["Should I keep the original file?", "Yes. Keep the complete source document until you confirm all split files are correct."]
    ],
    related: [
      ["/merge-pdf","Merge PDF files again"],
      ["/remove-pages","Delete unwanted pages"],
      ["/organize-pdf","Reorder PDF pages"],
      ["/compress-pdf","Compress the resulting PDF"]
    ]
  },

  '/redact-pdf': {
    title: 'How to permanently redact sensitive information from a PDF',
    intro: 'Mark sensitive visible areas, burn blackouts into the rendered PDF output and verify the finished document before downloading it. This is different from simply placing a removable shape over text.',
    steps: [
      'Choose the PDF containing the confidential information.',
      'Draw redaction boxes over every area that must be removed.',
      'Review each page and adjust the boxes if needed.',
      'Burn the blackouts into the redacted PDF output.',
      'Let the final safety verification complete, then download and reopen the finished file.'
    ],
    example: 'Before sharing a bank statement, place redaction boxes over account numbers or other details the recipient does not need. Generate the permanent redacted copy, wait for verification and inspect the downloaded PDF again before sending it.',
    questions: [
      ['Is drawing a normal black or white rectangle enough?', 'No. A normal visual overlay may leave underlying document information recoverable. This workflow creates the redacted page output with the selected blackouts burned into it.'],
      ['Does the tool verify the redacted result?', 'Yes. The finished PDF goes through a final blackout verification step before the normal download becomes available.'],
      ['Does redaction upload my PDF?', 'The redaction workflow processes the PDF locally in your browser.'],
      ['Should I keep my original PDF?', 'Yes. Keep the original separately until you have inspected and approved the redacted copy.'],
      ['Does redaction remove document metadata too?', 'Redaction focuses on visible information. Use Deep Sanitize separately when you also need to remove metadata, forms, attachments, scripts or hidden document data.']
    ],
    related: [
      ['/blog/how-to-permanently-redact-pdf','Learn what makes PDF redaction permanent'],
      ['/blog/redact-pdf-without-uploading','Redact a confidential PDF without uploading it'],
      ['/blog/redact-bank-statement-pdf','Redact sensitive bank-statement details'],
      ['/sanitize-pdf','Deep-sanitize hidden PDF data'],
      ['/private-pii-secrets-auto-redactor','Scan for supported PII and secrets'],
      ['/protect-pdf','Password-protect the finished PDF'],
      ['/bates-numbering','Add Bates numbers to legal documents']
    ]
  },

  "/repair-pdf": {
    title: "How to repair a damaged or unreadable PDF",
    intro: "A repair workflow can help rebuild a PDF that no longer opens correctly because its internal structure has become damaged or inconsistent.",
    steps: [
      "Choose the damaged PDF.",
      "Run the repair or rebuild process.",
      "Download the reconstructed PDF.",
      "Open the new file and check every page.",
      "Compare important content with the original source if another copy is available."
    ],
    example: "A PDF that fails to open after an interrupted transfer may sometimes be rebuilt into a readable copy if enough of the original document structure remains intact.",
    questions: [
      ["Can every corrupted PDF be repaired?", "No. Recovery depends on what parts of the file are damaged and whether enough readable document data remains."],
      ["Will repaired pages always look identical?", "Not necessarily. Always inspect the repaired file carefully because damaged content may be incomplete."],
      ["Should I overwrite the original?", "No. Keep the original damaged file separately until you have confirmed the repaired copy is usable."],
      ["What if repair does not work?", "Try obtaining another copy from the original source, backup, sender or export process."]
    ],
    related: [
      ["/blog/pdf-wont-open-corrupted-or-viewer-problem","Diagnose why a PDF will not open"],
      ["/blog/what-pdf-repair-can-and-cannot-recover","Understand what PDF repair can recover"],
      ["/compare-pdf","Compare the repaired PDF with another copy"],
      ["/pdf-to-image","Render PDF pages as images"],
      ["/pdf-to-text","Check whether text can be extracted"],
      ["/compress-pdf","Create a smaller verified copy"]
    ]
  },

  '/extract-images': {
    title: 'How to extract embedded images from a PDF',
    intro: 'Scan a PDF for embedded raster images and export the decoded images as PNG files at their detected pixel dimensions, without rendering the entire page as an image.',
    steps: [
      'Choose the PDF containing the photos, figures or raster graphics you want.',
      'Run Scan & Extract Embedded Images.',
      'Review the images found and their pixel dimensions.',
      'Download individual PNG files or download all extracted images as a ZIP.',
      'Use PDF to Image instead when you need whole PDF pages rendered as JPG, PNG or WebP.'
    ],
    example: 'If a report contains a 2400×1600 embedded photograph placed inside a page layout, Extract Images can recover that raster image at the decoded 2400×1600 pixel dimensions rather than creating a screenshot of the entire PDF page.',
    questions: [
      ['Does this export the original JPEG file bytes?', 'Not necessarily. The current extractor decodes supported embedded raster images through the PDF rendering layer and exports them as PNG files at the detected pixel dimensions.'],
      ['Does it preserve the embedded image dimensions?', 'Yes for successfully extracted raster images. The output records the decoded image width and height and exports the bitmap at those pixel dimensions.'],
      ['Will it extract vector drawings?', 'No. The extractor targets embedded raster images. Pure vector artwork is different from an embedded bitmap image.'],
      ['What if no images are found?', 'The PDF may contain only vector drawings, text or image structures the current extractor cannot decode. Use PDF to Image when you need the visible page itself as an image.'],
      ['Is the PDF uploaded?', 'The extraction workflow runs locally in your browser.']
    ],
    related: [
      ['/blog/extract-images-from-pdf-without-screenshots','Extract PDF images without taking screenshots'],
      ['/blog/extract-images-vs-pdf-to-image','Extract Images vs PDF to Image'],
      ['/pdf-to-image','Render whole PDF pages as images'],
      ['/compress-image','Compress extracted image files'],
      ['/image-converter','Convert images to another format']
    ]
  },

  "/compare-pdf": {
    title: "How to compare two PDF files side by side or with an overlay",
    intro: "Load two PDF versions locally and inspect them page by page using side-by-side viewing or an adjustable visual overlay.",
    steps: [
      "Choose the first PDF version.",
      "Choose the second PDF version.",
      "Start the comparison.",
      "Switch between Side by Side and Overlay modes.",
      "Navigate page by page and adjust zoom or overlay opacity when you need a closer visual check."
    ],
    example: "When a revised contract or report comes back, open the original and revised PDFs together. Read them side by side for broader review, then use the overlay to inspect small layout or visual changes.",
    questions: [
      ["Does Compare PDF automatically understand legal text changes?", "No. This is a visual PDF comparison workflow. It displays the documents side by side or as an overlay so you can inspect visible differences yourself."],
      ["What is overlay mode?", "Overlay mode places the rendered versions together and lets you adjust opacity, which can make shifts and other visual differences easier to notice."],
      ["Can the PDFs have different page counts?", "The viewer navigates through the available pages of the two documents, so inspect the complete comparison when document lengths differ."],
      ["Are both PDFs processed locally?", "The comparison workflow loads and renders both PDFs in your browser."]
    ],
    related: [
      ["/blog/compare-two-pdf-versions-side-by-side","Compare two PDF versions side by side"],
      ["/blog/pdf-overlay-comparison-vs-text-diff","Understand visual overlay vs text diff"],
      ["/bates-numbering","Add Bates numbers for document review"],
      ["/redact-pdf","Redact a reviewed PDF"],
      ["/edit-pdf","Make visual PDF edits"],
      ["/organize-pdf","Reorder or remove PDF pages"]
    ]
  },

  "/pdf-to-text": {
    title: "How to extract text from a PDF",
    intro: "Extract PDF text when you need reusable plain text for notes, search, analysis or another document workflow.",
    steps: [
      "Choose the PDF containing the text you need.",
      "Run the text extraction process.",
      "Review the extracted text for missing sections or unusual reading order.",
      "Copy or save the text you need.",
      "Check important names, numbers and paragraphs against the original PDF."
    ],
    example: "A long report can be converted into plain text so selected paragraphs can be searched, copied into notes or processed further.",
    questions: [
      ["Why is some text missing?", "Scanned PDFs may contain page images instead of selectable text and may require OCR first."],
      ["Why is the reading order different?", "Complex columns, tables and positioned text can be stored in an order that differs from the visible page layout."],
      ["Should I use Markdown instead?", "Use Markdown when lightweight structure such as headings and lists is useful. Plain text is better when you only need the words."],
      ["Can I extract text from a scan?", "Use OCR first when the document contains images of text rather than an actual text layer."]
    ],
    related: [
      ["/ocr-pdf","Recognize text in scanned PDFs"],
      ["/pdf-to-markdown","Convert PDF to structured Markdown"],
      ["/extract-pdf-for-llm","Prepare PDF text for LLM workflows"],
      ["/pdf-to-csv","Extract table-style data"]
    ]
  },

  "/image-to-pdf": {
    title: "How to convert images to a PDF",
    intro: "Combine images into a PDF when you want photos, scans, receipts or screenshots stored and shared as one document.",
    steps: [
      "Choose the images you want to include.",
      "Arrange them in the correct order.",
      "Create the PDF.",
      "Download and open the result.",
      "Check page order, orientation and image clarity."
    ],
    example: "Several photographed pages of a signed document can be arranged in reading order and combined into one PDF for easier sharing.",
    questions: [
      ["Can I combine multiple images into one PDF?", "Yes. Arrange the images in the order you want before creating the PDF."],
      ["What image formats can I use?", "The available image workflows support common browser-friendly formats, and the main Image to PDF & other formats tool provides additional format options."],
      ["Will image quality change?", "PDF creation may affect image dimensions or compression depending on the workflow, so inspect the final document."],
      ["What if I photographed a paper document?", "Use the Scan to PDF workflow when you want document-photo features designed specifically for scanned pages."]
    ],
    related: [
      ["/image-converter","Convert image formats"],
      ["/scan-to-pdf","Turn document photos into PDF"],
      ["/compress-image","Reduce image size first"],
      ["/pdf-to-image","Convert PDF pages back to images"]
    ]
  },

  "/pdf-to-jpg": {
    title: "How to convert PDF pages to JPG images",
    intro: "Convert PDF pages to JPG when you need individual page images for previews, sharing, presentations or image-based workflows.",
    steps: [
      "Choose the PDF you want to convert.",
      "Render the PDF pages as JPG images.",
      "Review the image quality.",
      "Download the page images you need.",
      "Check small text and detailed graphics before using the images."
    ],
    example: "A brochure PDF can be converted page by page into JPG images for use in a presentation or social preview.",
    questions: [
      ["Does each PDF page become a separate JPG?", "Yes. Page-based conversion creates an image representation of each converted PDF page."],
      ["Should I use JPG or PNG?", "JPG is useful for photographs and smaller image files, while PNG can preserve sharper graphics and text at the cost of larger files."],
      ["Can I convert to formats other than JPG?", "Use the PDF to Image tool when you want JPG, PNG or WebP options."],
      ["Will text remain selectable?", "No. A JPG is an image representation of the PDF page rather than a selectable PDF text layer."]
    ],
    related: [
      ["/pdf-to-image","Convert PDF to JPG, PNG or WebP"],
      ["/image-converter","Convert between image formats"],
      ["/compress-image","Reduce exported image size"],
      ["/pdf-to-text","Extract selectable PDF text instead"]
    ]
  },

  "/compress-image": {
    title: "How to compress an image to a smaller file size",
    intro: "Compress images when a website, form, email or application requires a smaller JPG, PNG, WebP or supported image file.",
    steps: [
      "Choose the image you want to reduce.",
      "Select the available quality or target-size option.",
      "Compress the image.",
      "Download and reopen the result.",
      "Check text, faces and fine detail before uploading or sharing it."
    ],
    example: "A large phone photo can be reduced before uploading it to a form that accepts only a small image attachment.",
    questions: [
      ["Why does image compression reduce quality?", "Smaller files often require removing image detail or increasing lossy compression, especially when the target is much smaller than the source."],
      ["Should I use the smallest possible file?", "Use the largest size the destination allows when visual clarity matters."],
      ["What is EXIF metadata?", "EXIF can contain camera details, timestamps and sometimes location information. Remove it when that information is unnecessary or sensitive."],
      ["Can I compress several image formats?", "The image tools support common image formats including JPG, PNG, WebP and supported HEIC workflows."]
    ],
    related: [
      ["/image-converter","Convert image formats"],
      ["/heic-to-jpg","Convert HEIC to JPG"],
      ["/image-to-pdf","Combine images into a PDF"],
      ["/scan-to-pdf","Create PDFs from document photos"]
    ]
  },

  "/remove-pages": {
    title: "How to remove unwanted pages from a PDF",
    intro: "Delete pages from a PDF when you only want to keep the relevant parts of a document before sharing, storing or compressing it.",
    steps: [
      "Choose the PDF you want to edit.",
      "Select the pages you want to remove.",
      "Create the new PDF.",
      "Download and reopen the result.",
      "Confirm that every required page is still present."
    ],
    example: "A 12-page document can be reduced to the six pages needed for an application by removing blank, duplicate or irrelevant pages.",
    questions: [
      ["Can I remove several pages at once?", "Yes. Select the unwanted pages before creating the cleaned PDF."],
      ["Will page removal reduce file size?", "Usually, because the new PDF contains fewer pages, although the exact reduction depends on the removed content."],
      ["Can I recover a deleted page afterward?", "Create the edited PDF from a copy and keep the original source so you can restore pages if needed."],
      ["Should I use Split PDF instead?", "Use Split PDF when you want several separate files. Use Remove Pages when you want one PDF with selected pages deleted."]
    ],
    related: [
      ["/split-pdf","Split a PDF into separate files"],
      ["/organize-pdf","Reorder PDF pages"],
      ["/merge-pdf","Combine PDFs"],
      ["/compress-pdf","Compress the cleaned PDF"]
    ]
  },

  "/page-numbers": {
    title: "How to add page numbers to a PDF",
    intro: "Add page numbers when a PDF needs clear pagination for printing, review, references or document organization.",
    steps: [
      "Choose the PDF you want to number.",
      "Select the available page-number position and formatting options.",
      "Apply the numbering.",
      "Download and inspect the new PDF.",
      "Check that numbers do not overlap important document content."
    ],
    example: "A report assembled from several source files can receive consistent page numbering before it is circulated for review.",
    questions: [
      ["Can page numbers cover existing text?", "They can if the chosen position overlaps existing page content, so inspect several pages after applying them."],
      ["Should the first page always be numbered?", "That depends on your document. Some reports omit visible numbering on title pages while others number every page."],
      ["Can I number a PDF after merging files?", "Yes. Numbering after the final merge can provide one continuous sequence across the complete document."],
      ["Should I keep the unnumbered original?", "Yes. Keeping the source gives you flexibility if you later need a different numbering style."]
    ],
    related: [
      ["/merge-pdf","Merge files before numbering"],
      ["/bates-numbering","Add Bates numbers to document sets"],
      ["/booklet-pdf","Create a printable booklet"],
      ["/nup-pdf","Place several pages on one sheet"]
    ]
  },

  "/watermark-pdf": {
    title: "How to add a text watermark to a PDF",
    intro: "Add a watermark when a PDF needs a visible label such as Confidential, Draft, Sample or another document status.",
    steps: [
      "Choose the PDF you want to watermark.",
      "Enter the watermark text.",
      "Apply the watermark to the document.",
      "Download the new PDF.",
      "Review several pages to make sure the watermark is visible without hiding important content."
    ],
    example: "A draft proposal can be marked DRAFT on each page before it is circulated internally for review.",
    questions: [
      ["Does a watermark prevent copying?", "No. A watermark is primarily a visible document label and should not be treated as access control."],
      ["Can I use a watermark for confidential files?", "Yes as a visible warning, but use password protection and appropriate sharing controls when access itself must be restricted."],
      ["Should the watermark cover the document text?", "It should remain visible without making the underlying content difficult to read."],
      ["Can I remove a watermark later?", "Keep an original unwatermarked copy so you can create a different version when needed."]
    ],
    related: [
      ["/protect-pdf","Password protect the PDF"],
      ["/page-numbers","Add page numbers"],
      ["/edit-pdf","Make other visual edits"],
      ["/sanitize-pdf","Remove document metadata"]
    ]
  }

};

export interface ArticleComparisonRow {
  service: string;
  processing: string;
  deletion: string;
  localOption: string;
  sourceLabel: string;
  sourceUrl: string;
}
export interface ArticleSource {
  label: string;
  url: string;
  detail: string;
}
export interface Article {
  slug: string;
  title: string;
  description: string;
  tool: string;
  toolLabel: string;
  category?: string;
  published?: string;
  updated?: string;
  methodology?: string;
  datasetUrl?: string;
  datasetLabel?: string;
  comparison?: ArticleComparisonRow[];
  sources?: ArticleSource[];
  sections: { title: string; paragraphs: string[] }[];
}
export const ARTICLES: Article[] = [
  {
    slug: 'reduce-pdf-for-upload-limit', title: 'How to reduce a PDF for an upload size limit',
    description: 'Choose a PDF size target, understand KB limits and check readability before submitting a compressed document.',
    tool: '/compress-pdf', toolLabel: 'Open PDF compressor',
    category: 'PDF COMPRESSION GUIDE',
    sections: [
      {title: 'Read the upload rule before changing the file', paragraphs: ['Write down the maximum file size, allowed format and any page-count requirement. A portal that accepts JPG will not necessarily accept PDF, and a size error can be different from a password-protection error.', 'Keep the original. Compression can turn text and form fields into page images, so use a copy when the document contains information you may need to edit later.']},
      {title: 'Choose the largest size the portal allows', paragraphs: ['In 1into1, open Compress PDF, choose Target Size and select your KB target. A larger target usually leaves more room for readable text and images. Do not choose 50 KB merely because it is the smallest option if the portal allows 500 KB.', 'There is also a units difference to consider: 1into1 uses 1 KB = 1,024 bytes. A portal using 1 KB = 1,000 bytes may reject an exact 50 KB result of 51,200 bytes. Choose a lower available target when you need extra headroom.']},
      {title: 'Understand what an exact target can cost', paragraphs: ['The compressor measures the complete output. If it is too large, target mode reduces image quality and resolution again. If it is smaller than the requested target, padding brings it to the selected byte size; padding does not add image detail.', 'For example, nine pages at 50 KB have about 5.6 KB each before PDF overhead. Small text and stamps may become unreadable. The format also needs space for its structure, so arbitrary targets are not possible for every document.']},
      {title: 'Inspect the download, not just the success message', paragraphs: ['Open the saved PDF and zoom into names, dates, tables, signatures and stamps. Check every page is present. A file that uploads successfully can still be unsuitable if the recipient cannot read it.', 'If the result is too blurry, remove only unnecessary pages, choose a larger permitted target or split the PDF if separate uploads are accepted. Do not remove required content simply to meet a limit.']},
      {title: 'Keep the document on your device', paragraphs: ['The compression tool processes the PDF locally. Let the app and required resources load before relying on an offline connection. Optional cloud AI and checkout are separate features that need a connection.', 'The target-size compressor is useful for compatibility with upload limits, but it is not a guarantee that every receiving website will accept the result. Check the portal’s own instructions after downloading.']}
    ]
  },
  {
    slug: 'bank-statement-pdf-to-csv',
    title: 'How to Convert a Bank Statement PDF to CSV for Excel',
    description: 'Extract transaction rows from a text-based bank statement PDF into CSV, review dates and balances, and open the result in Excel without a normal document upload.',
    tool: '/bank-statement-to-excel',
    toolLabel: 'Open Bank Statement to Excel',
    category: 'BANK STATEMENT GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Why CSV is useful for bank statements',
        paragraphs: [
          'A bank statement PDF is designed to be read, not sorted. CSV turns detected transaction rows into a spreadsheet-friendly format so dates, descriptions, debits, credits and balances can be filtered or reviewed in Excel, Google Sheets and other spreadsheet applications.',
          '1into1 exports spreadsheet-ready CSV or TSV rather than a native XLSX workbook. That distinction matters: the file opens in Excel, but you should not expect the same formatting or workbook features as a hand-built .xlsx file.'
        ]
      },
      {
        title: 'Use a text-based statement when possible',
        paragraphs: [
          'Statements downloaded directly from online banking often contain selectable text. Those are the best candidates for local table extraction because the converter can work from the PDF text layer rather than guessing characters from an image.',
          'If you cannot select any text because the statement is a scan or photograph, run OCR first. OCR can introduce digit errors, so financial values from scanned documents need especially careful review.'
        ]
      },
      {
        title: 'Check the extracted transaction columns',
        paragraphs: [
          'After extraction, review the detected date, description, debit, credit and balance fields where available. Banks use different layouts and column labels, and wrapped descriptions can make a visual statement harder to interpret automatically.',
          'Compare the opening balance, several transactions and the closing balance against the original PDF before using the CSV for reconciliation, accounting, tax work or reporting.'
        ]
      },
      {
        title: 'Open the CSV in Excel',
        paragraphs: [
          'Download the CSV or TSV and open it in Excel or another spreadsheet application. You can then sort transactions, filter descriptions, calculate totals or import the data into another workflow.',
          'Keep the original statement beside the spreadsheet while checking the result. Extraction is a productivity aid, not a substitute for validating important financial records.'
        ]
      },
      {
        title: 'Keep sensitive statement data local',
        paragraphs: [
          'The supported bank-statement extraction workflow runs in the browser rather than requiring a normal server-side document upload. That is useful for financial files containing account details, balances and transaction history.',
          'For scanned statements, the OCR step should also be completed before extraction, and the final spreadsheet should still be checked against the original statement.'
        ]
      }
    ]
  },
  {
    slug: 'scanned-bank-statement-to-excel-ocr',
    title: 'Scanned Bank Statement to Excel: OCR First, Then Extract',
    description: 'Learn how to prepare an image-only bank statement with OCR before extracting transactions into CSV or TSV that opens in Excel.',
    tool: '/ocr-pdf',
    toolLabel: 'Make the scanned statement searchable',
    category: 'BANK STATEMENT GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Why a scanned statement needs OCR first',
        paragraphs: [
          'A scanned bank statement may look identical to a normal PDF on screen while containing no usable text layer underneath. A transaction extractor cannot reliably identify dates, descriptions and amounts from text that does not exist in the PDF.',
          'OCR adds searchable text to the page images. Once the statement has a usable text layer, the extracted text can be passed to the bank-statement workflow.'
        ]
      },
      {
        title: 'Make the statement searchable',
        paragraphs: [
          'Open the OCR tool, choose the scanned PDF and create a searchable copy. Review several names, dates and amounts in the OCR result before moving on.',
          'Poor scans, skewed pages, unusual fonts, stamps and low-resolution images can all reduce recognition accuracy. If critical digits are visibly wrong after OCR, do not rely on the extracted spreadsheet.'
        ]
      },
      {
        title: 'Extract the transaction table after OCR',
        paragraphs: [
          'Open the searchable result in Bank Statement to Excel. The workflow extracts table-style transaction data into CSV or TSV that can be opened in Excel, Google Sheets or another spreadsheet application.',
          'Different banks use different statement layouts, so column detection should always be reviewed rather than assumed to be perfect.'
        ]
      },
      {
        title: 'Verify numbers before accounting use',
        paragraphs: [
          'OCR can confuse characters such as 0 and O, 1 and I, or misread punctuation in amounts. Compare important dates, debits, credits and balances against the original scanned statement.',
          'For financial records, checking a few representative transactions is not enough when the spreadsheet will be used for reconciliation or reporting. Review the rows and totals that matter to your workflow.'
        ]
      },
      {
        title: 'Keep both copies',
        paragraphs: [
          'Keep the original scan as the source record and the OCR/searchable copy as a working document. Keep the extracted CSV or TSV separately so corrections do not overwrite the source.',
          'This gives you a clear path back to the original page whenever a spreadsheet value looks suspicious.'
        ]
      }
    ]
  },
  {
    slug: 'how-to-permanently-redact-pdf',
    title: 'How to Permanently Redact a PDF: Black Out Text Safely',
    description: 'Learn why drawing a black rectangle is not enough, how permanent PDF redaction works, and how to verify sensitive text is no longer recoverable.',
    tool: '/redact-pdf',
    toolLabel: 'Open Redact PDF',
    category: 'PDF REDACTION GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A black rectangle is not automatically a redaction',
        paragraphs: [
          'Covering text with a normal shape can make information look hidden while leaving the underlying PDF text or image data intact. A recipient may still be able to select, copy, search or extract the supposedly hidden content.',
          'Permanent redaction needs to remove the sensitive information from the shared output rather than merely place another object over it.'
        ]
      },
      {
        title: 'Mark every area that must disappear',
        paragraphs: [
          'Open the PDF in the Redact tool and draw redaction boxes over names, account numbers, addresses, signatures, images or other visible information that the recipient should not receive.',
          'Review every page before applying the redactions. Headers, footers and repeated identifiers can appear more than once in a document.'
        ]
      },
      {
        title: 'Burn the redaction into the output',
        paragraphs: [
          '1into1 rebuilds the redacted page output with the selected blackouts burned into it. This avoids the common mistake of leaving a removable overlay above recoverable content.',
          'The trade-off is intentional: rasterized redacted pages can lose selectable text and interactive PDF features. Keep the original document separately.'
        ]
      },
      {
        title: 'Verify the downloaded PDF',
        paragraphs: [
          'Reopen the finished file rather than trusting only the editor preview. Try selecting or searching for a portion of the information you removed and inspect the page visually at useful zoom levels.',
          '1into1 also performs a final blackout verification step before the normal redacted download becomes available, but you should still inspect the finished copy before sharing sensitive material.'
        ]
      },
      {
        title: 'Redaction and sanitization solve different problems',
        paragraphs: [
          'Redaction is for visible content you intentionally remove. Sanitization is for hidden document data such as metadata, attachments, scripts, forms, annotations and hidden text layers.',
          'If the document contains both visible secrets and hidden document traces, redact the visible information first and use Deep Sanitize as a separate final step.'
        ]
      }
    ]
  },
  {
    slug: 'redact-pdf-without-uploading',
    title: 'How to Redact a PDF Without Uploading the File',
    description: 'Redact confidential PDF content locally in your browser so the document does not need to be sent to a normal processing server.',
    tool: '/redact-pdf',
    toolLabel: 'Redact a PDF locally',
    category: 'PDF PRIVACY GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Why no-upload redaction matters',
        paragraphs: [
          'Redaction is usually used on documents that are sensitive by definition: bank statements, contracts, IDs, legal records, financial reports and other material containing private information.',
          'A local browser workflow avoids sending the normal PDF file to a document-processing server for the redaction operation. The file stays on the device while the supported local workflow runs.'
        ]
      },
      {
        title: 'Load the PDF locally',
        paragraphs: [
          'Open Redact PDF and choose the document from your device. The browser reads the file locally for the supported redaction workflow instead of first transferring it to a remote converter.',
          'Once the app and required resources are already loaded, supported local workflows can continue without relying on a document-upload round trip.'
        ]
      },
      {
        title: 'Mark only the information that must be removed',
        paragraphs: [
          'Draw blackout regions over the confidential text, numbers or images. Zoom in when working with small account numbers, addresses, signatures or identifiers.',
          'Do not assume one occurrence is the only occurrence. Check repeated headers, footers and later pages before applying the final redactions.'
        ]
      },
      {
        title: 'Create and verify the redacted copy',
        paragraphs: [
          'Generate the redacted PDF and reopen the downloaded copy. The selected areas should be burned into the resulting page output rather than left as removable shapes.',
          'Search, select and visually inspect the finished file before sharing it. Keep the original PDF unchanged in case the redaction selection needs to be corrected.'
        ]
      },
      {
        title: 'Use sanitization when hidden data also matters',
        paragraphs: [
          'A visually redacted document can still contain metadata or other hidden structures that are unrelated to the blackout boxes. If those traces also need to be removed, use the separate Deep Sanitize workflow.',
          'This distinction keeps the jobs clear: Redact removes selected visible information; Sanitize rebuilds the document to remove supported hidden data and interactive structures.'
        ]
      }
    ]
  },
  {
    slug: 'redact-bank-statement-pdf',
    title: 'How to Redact a Bank Statement PDF Before Sharing It',
    description: 'Permanently remove account numbers and other unnecessary private details from a bank statement PDF while keeping the information the recipient actually needs.',
    tool: '/redact-pdf',
    toolLabel: 'Redact a bank statement',
    category: 'BANK STATEMENT PRIVACY',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Start with what the recipient actually needs',
        paragraphs: [
          'A landlord, lender, accountant, employer, visa office or other recipient may need different parts of a bank statement. Ask for the exact requirement before hiding information so the document still proves what it is supposed to prove.',
          'Do not remove balances, transactions or identity details automatically. Keep the fields required for the stated purpose and remove only information the recipient does not need.'
        ]
      },
      {
        title: 'Common details people may need to protect',
        paragraphs: [
          'Depending on the purpose, sensitive fields can include full account numbers, routing or sort-code information, customer IDs, card numbers, addresses and transaction descriptions containing private details.',
          'The correct choice depends on the recipient and the document requirement. Redaction should protect unnecessary information without changing the financial evidence the recipient legitimately asked to review.'
        ]
      },
      {
        title: 'Use permanent redaction, not a drawing tool',
        paragraphs: [
          'A black rectangle drawn in an ordinary editor can leave the original statement text underneath. For financial documents, that visual-only approach can create a serious privacy mistake.',
          'Use Redact PDF to mark the areas, burn the blackouts into the resulting page output and create a separate redacted copy.'
        ]
      },
      {
        title: 'Check every page and repeated identifier',
        paragraphs: [
          'Bank statements often repeat the account number, customer number or address in headers and footers. Review all pages rather than redacting only the first page.',
          'After downloading, reopen the file and inspect the redacted areas. Search for a portion of the removed identifier where the output remains searchable, and visually confirm every intended occurrence is gone.'
        ]
      },
      {
        title: 'Keep the original statement separately',
        paragraphs: [
          'Do not overwrite the source bank statement. Keep the original as the financial record and share only the reviewed redacted copy.',
          'If you also need spreadsheet data from the statement, use Bank Statement to Excel separately and verify extracted financial values against the original document.'
        ]
      }
    ]
  },
  {
    slug: 'pdf-to-word-without-losing-formatting',
    title: 'How to Convert PDF to Word Without Losing Formatting',
    description: 'Learn what formatting can realistically survive PDF-to-Word conversion, why layouts break, and how to get a cleaner editable DOCX from a digital PDF.',
    tool: '/pdf-to-word',
    toolLabel: 'Convert PDF to editable Word',
    category: 'PDF TO WORD GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Start with the right kind of PDF',
        paragraphs: [
          'A computer-created PDF with selectable text is the best source for an editable Word conversion. The PDF still contains characters, coordinates and drawing information that a converter can use to reconstruct paragraphs, tables and page artwork.',
          'A scanned PDF is different because the page may contain only an image. If you cannot select the words in the original file, run OCR first rather than expecting a normal PDF-to-Word conversion to recover text that is not present.'
        ]
      },
      {
        title: 'Why Word cannot reproduce every PDF perfectly',
        paragraphs: [
          'PDF and Word store documents differently. PDF is primarily a fixed page description, while Word uses editable paragraphs, styles, tables and flowing layout. Conversion therefore requires reconstructing document structure from positioned PDF content.',
          'That reconstruction can preserve a great deal of useful formatting, but exact visual identity is not guaranteed. Font substitution, text wrapping, multi-column layouts, transformed graphics and unusually complex pages can still move or reflow in Word.'
        ]
      },
      {
        title: 'Preserve editability instead of turning every page into an image',
        paragraphs: [
          'A DOCX that looks identical because each page is inserted as one large picture is not genuinely useful when you need to edit the words. A better conversion keeps text and detected tables editable where the source allows it and preserves artwork separately when it cannot be represented as normal Word content.',
          '1into1 reconstructs digital PDFs into editable DOCX content locally in the browser. Review the result in Word because editability and perfect visual fidelity are sometimes competing goals.'
        ]
      },
      {
        title: 'Check tables, fonts and page breaks first',
        paragraphs: [
          'After conversion, inspect the areas most likely to reveal layout differences: tables, multi-column sections, headings, page breaks, logos and paragraphs using uncommon fonts.',
          'Compare important numbers and text with the PDF before making further edits. If a specific page is extremely visual, preserving its appearance may matter more than making every element freely editable.'
        ]
      },
      {
        title: 'Know when manual cleanup is normal',
        paragraphs: [
          'No converter can recreate structure that the PDF never stored explicitly. A complex PDF may need small corrections in Word even when the text and major layout are reconstructed successfully.',
          'For best results, start from a digital PDF with selectable text, use OCR only when necessary, and keep the original PDF beside the DOCX while reviewing the conversion.'
        ]
      }
    ]
  },
  {
    slug: 'scanned-pdf-to-word-ocr-first',
    title: 'Scanned PDF to Word: Use OCR First, Then Convert to DOCX',
    description: 'Turn an image-only scanned PDF into editable Word by making the scan searchable with OCR first, then converting the resulting text-aware PDF to DOCX.',
    tool: '/ocr-pdf',
    toolLabel: 'OCR the scanned PDF first',
    category: 'PDF TO WORD GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A scanned PDF may contain no real text',
        paragraphs: [
          'A scan can look like a normal document while every page is actually a picture. If the letters cannot be selected, a normal PDF-to-Word converter has no text layer to reconstruct into editable paragraphs.',
          'OCR solves that first problem by recognising characters in the page image and adding searchable text to the PDF.'
        ]
      },
      {
        title: 'Run OCR before PDF-to-Word conversion',
        paragraphs: [
          'Open the scanned document in Searchable OCR and create a searchable copy. Review names, dates, numbers and several representative paragraphs before moving to Word conversion.',
          'Scan quality matters. Blur, skew, low contrast, compression artefacts and unusual fonts can cause recognition mistakes, so the OCR result should be checked before it becomes the source for an editable DOCX.'
        ]
      },
      {
        title: 'Convert the searchable PDF to DOCX',
        paragraphs: [
          'Once the PDF contains a usable text layer, open the searchable result in PDF to Word. The converter can then reconstruct editable text and detected tables from the digital content rather than treating the whole page as one picture.',
          'The Word file can still require cleanup because OCR accuracy and PDF layout reconstruction are separate problems. A correct character can still wrap differently in Word, while an OCR mistake remains a wrong character until corrected.'
        ]
      },
      {
        title: 'Verify numbers and names carefully',
        paragraphs: [
          'OCR errors matter most in information such as account numbers, invoice values, dates, IDs, names and legal text. Compare those fields with the original scan before relying on the Word document.',
          'If the output will be used for financial, legal or administrative work, review the complete set of critical values rather than checking only one page.'
        ]
      },
      {
        title: 'Keep the original scan',
        paragraphs: [
          'Keep the original scanned PDF as the source record, the searchable OCR copy as an intermediate working file and the DOCX as the editable result.',
          'That three-step workflow makes it easier to trace any recognition or formatting problem back to the correct stage without overwriting the source document.'
        ]
      }
    ]
  },
  {
    slug: 'pdf-to-markdown-for-rag',
    title: 'PDF to Markdown for RAG: Prepare Cleaner AI Context',
    description: 'Learn why Markdown can be easier to chunk and review than raw PDF text for RAG workflows, and how to prepare a PDF without sending the document directly to an AI provider.',
    tool: '/extract-pdf-for-llm',
    toolLabel: 'Prepare PDF Markdown for an LLM',
    category: 'AI DOCUMENT GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Why PDF is awkward input for retrieval workflows',
        paragraphs: [
          'PDF is designed to preserve page appearance. It can store text as positioned items rather than as the clean heading, paragraph and list structure a retrieval pipeline would ideally ingest.',
          'Before chunking a document for retrieval, it is useful to turn the relevant content into a simpler text format that can be inspected and cleaned.'
        ]
      },
      {
        title: 'Why Markdown is useful as an intermediate format',
        paragraphs: [
          'Markdown keeps lightweight structure such as headings, paragraphs and lists while remaining plain text. That makes it easier to read, edit and divide into logical sections than a raw copy-paste dump from a PDF.',
          '1into1 extracts selectable PDF text into Markdown locally and can detect some heading and list structure. Complex layouts, tables, columns and unusual fonts still need review because a PDF does not always expose semantic structure cleanly.'
        ]
      },
      {
        title: 'Review before chunking or embedding',
        paragraphs: [
          'Do not send the first extracted output straight into a production RAG index. Remove irrelevant front matter, repeated page furniture and sections that do not belong in the knowledge base, and check that the reading order makes sense.',
          'If a document contains complex tables whose row and column relationships matter, use a structured data workflow or manual review rather than assuming every visual table has been reconstructed perfectly as Markdown.'
        ]
      },
      {
        title: 'Use only the context you actually need',
        paragraphs: [
          'A 100-page document does not always need to become one giant AI input. After extraction, you can keep only the chapters or sections relevant to the retrieval system or task you are building.',
          'The local extraction step does not automatically send the PDF or the generated Markdown to ChatGPT, Claude or another provider. Passing the reviewed content to an external AI service is a separate action.'
        ]
      },
      {
        title: 'Handle scans before Markdown conversion',
        paragraphs: [
          'Image-only PDFs need OCR because there may be no selectable text to extract. Create a searchable copy first, verify important characters, and then convert the text-aware document into Markdown.',
          'For RAG or other AI workflows, OCR errors can become retrieval errors later. Names, numbers, formulas and domain-specific terms deserve extra checking before indexing.'
        ]
      }
    ]
  },
  {
    slug: 'scanned-pdf-to-markdown-ocr-first',
    title: 'Scanned PDF to Markdown: OCR First, Then Convert',
    description: 'Convert an image-only scanned PDF into Markdown by creating a searchable OCR copy first, then extracting and reviewing the text locally.',
    tool: '/ocr-pdf',
    toolLabel: 'OCR the scanned PDF first',
    category: 'PDF TO MARKDOWN GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Why scanned PDFs need an extra step',
        paragraphs: [
          'A scanned PDF can contain page images without a usable text layer. A Markdown converter cannot reliably extract headings and paragraphs from text that does not exist as characters in the document.',
          'OCR recognises the visible characters and creates searchable text. That searchable result can then be used as the source for Markdown extraction.'
        ]
      },
      {
        title: 'Create a searchable PDF with OCR',
        paragraphs: [
          'Open the scan in Searchable OCR and process the pages. Afterward, test whether names, dates and representative sentences can be searched or selected in the OCR result.',
          'Poor contrast, blur, skew and compression artefacts can reduce recognition accuracy. If important text is wrong at the OCR stage, converting it to Markdown will preserve the mistake rather than fix it.'
        ]
      },
      {
        title: 'Convert the searchable copy to Markdown',
        paragraphs: [
          'Open the searchable result in PDF to Markdown and extract the document text. Review the generated headings, paragraphs and lists before copying or downloading the Markdown.',
          'The conversion is most reliable when the OCR reading order is sensible. Multi-column scans, complex forms and heavily visual pages can still require manual cleanup.'
        ]
      },
      {
        title: 'Check the details that matter',
        paragraphs: [
          'Numbers, names, identifiers, formulas and specialist terminology deserve particular attention because a single OCR error can change the meaning of the extracted Markdown.',
          'If the Markdown will be used with an LLM or retrieval system, correct those errors before the content is indexed or pasted into another service.'
        ]
      },
      {
        title: 'Keep the workflow local until you choose otherwise',
        paragraphs: [
          'The OCR and Markdown-preparation steps are designed to run locally in the browser for supported workflows. The document is not automatically sent to an AI provider.',
          'After reviewing the Markdown, you decide whether to keep it as a local note, use it in documentation, or pass selected content to an external AI or RAG system.'
        ]
      }
    ]
  },
  {
    slug: 'extract-pdf-tables-to-excel',
    title: 'How to Extract Tables from PDF to Excel',
    description: 'Extract rows and columns from a digital PDF into editable spreadsheet data, review the detected structure, and export the result for Excel or CSV workflows.',
    tool: '/document-data-extractor',
    toolLabel: 'Extract PDF tables',
    category: 'PDF DATA EXTRACTION',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A PDF table is not the same as an Excel table',
        paragraphs: [
          'A PDF can make rows and columns look perfectly aligned while storing the page as positioned text and drawing instructions rather than as real spreadsheet cells.',
          'Table extraction therefore has to infer structure from coordinates, spacing, rules and repeated patterns before the values can become editable spreadsheet data.'
        ]
      },
      {
        title: 'Start with a digital PDF when possible',
        paragraphs: [
          'A computer-created PDF with selectable text is usually easier to extract than a scan because the characters already exist in the document.',
          'If the page is image-only, OCR is required first or as part of a workflow that supports OCR fallback. Scan quality can affect both character recognition and the ability to reconstruct the correct table structure.'
        ]
      },
      {
        title: 'Review rows and columns before exporting',
        paragraphs: [
          'Check that headings, dates, descriptions, amounts and totals have landed in the intended columns. Merged cells, multi-line rows, sparse tables and borderless layouts are common reasons a visual table can be interpreted incorrectly.',
          '1into1 lets you review and edit detected structured data before export so you can correct obvious extraction issues rather than treating the first result as final.'
        ]
      },
      {
        title: 'Choose the export that fits your workflow',
        paragraphs: [
          'Structured data can be exported for spreadsheet use, including CSV or Excel output where supported by the extractor. A CSV focuses on rows and values, while an Excel workbook can be more convenient for direct spreadsheet editing.',
          'Decorative PDF formatting is not the same thing as usable spreadsheet structure. The important goal is usually to preserve the correct row-and-column relationships and values.'
        ]
      },
      {
        title: 'Verify important numbers against the source PDF',
        paragraphs: [
          'For financial reports, invoices, research tables or operational data, compare totals and representative rows with the original PDF before using the spreadsheet for analysis or reporting.',
          'Extraction saves retyping time, but complex PDFs can still require correction. Keep the original PDF as the source of truth while reviewing the exported data.'
        ]
      }
    ]
  },
  {
    slug: 'scanned-pdf-tables-to-excel-ocr',
    title: 'Scanned PDF to Excel: Extract Tables with OCR',
    description: 'Extract table data from a scanned PDF by using OCR to recognise the page text, then review the detected rows and columns before exporting to Excel or CSV.',
    tool: '/document-data-extractor',
    toolLabel: 'Extract data from a scanned PDF',
    category: 'PDF DATA EXTRACTION',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Why scanned tables are harder to extract',
        paragraphs: [
          'A scanned PDF is often just an image of a table. The rows, columns and values are visible to a person, but there may be no selectable text or spreadsheet structure inside the file.',
          'OCR first has to recognise the characters. The extraction workflow then has to infer which recognised values belong together as rows and columns.'
        ]
      },
      {
        title: 'Use OCR on image-only pages',
        paragraphs: [
          'For scanned documents, use a workflow with OCR support or create a searchable PDF first. Check names, dates and numeric values in the OCR result because recognition errors can become spreadsheet errors later.',
          'Blur, skew, shadows, low contrast and compression damage can reduce OCR accuracy. Clean scans usually produce more reliable table extraction than camera photos or heavily degraded pages.'
        ]
      },
      {
        title: 'Reconstruct the table after text recognition',
        paragraphs: [
          'Once text is available, the extractor uses page layout and detected positions to organise values into structured rows and columns.',
          'Ruled tables are often easier to interpret than loose multi-column layouts, but merged headers, wrapped descriptions and multi-line cells can still need manual correction.'
        ]
      },
      {
        title: 'Review before exporting to Excel or CSV',
        paragraphs: [
          'Inspect the extracted table before download. Pay particular attention to decimal points, negative signs, dates, totals and values that are visually close together in the scan.',
          'Correct any cells that need adjustment, then export the reviewed result to the spreadsheet format supported by your workflow.'
        ]
      },
      {
        title: 'Do not treat OCR output as verified financial data',
        paragraphs: [
          'A single recognition mistake can change a number significantly. If the spreadsheet will be used for accounting, financial analysis, compliance or reporting, compare the important values against the original scan.',
          'Keep the original PDF unchanged and use the extracted spreadsheet as a working copy rather than as the only record.'
        ]
      }
    ]
  },
  {
    slug: 'summarize-pdf-with-your-own-ai-api-key',
    title: 'How to Summarize a PDF with Your Own AI API Key',
    description: 'Extract PDF text locally, choose your own AI provider or compatible endpoint, approve the data-sharing notice, and summarize or question the document.',
    tool: '/ai-summary-pdf',
    toolLabel: 'Open AI PDF Summarizer',
    category: 'AI PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'The PDF is read locally before any AI request',
        paragraphs: [
          '1into1 first opens the PDF in the browser and extracts page text locally. Pages with very little digital text can use the shared local English OCR fallback before the document text is assembled.',
          'This separates document reading from the later AI network request.'
        ]
      },
      {
        title: 'Choose the endpoint that should receive the excerpt',
        paragraphs: [
          'The current interface includes presets for Groq, OpenAI, OpenRouter and DeepSeek, plus a Custom / Local option for an OpenAI-compatible endpoint such as a local model server.',
          'Cloud providers normally require your own API key. A custom endpoint can be used without a key when the server itself does not require authorization.'
        ]
      },
      {
        title: 'Consent is required before the provider request starts',
        paragraphs: [
          'The Send workflow checks the data-sharing consent box before it performs the model lookup or chat request. Changing the file, provider or custom endpoint clears that consent so the destination must be approved again.',
          'The browser Fetch API is what sends the request to the configured endpoint; there is no 1into1 AI relay in this component.'
        ]
      },
      {
        title: 'The document context is capped at 30,000 characters',
        paragraphs: [
          'Before building the system prompt, the current tool takes the extracted document text and keeps the first 30,000 characters. That excerpt becomes the document context supplied to the chosen model.',
          'For long PDFs, later sections beyond that character limit are therefore not part of the current AI request unless the workflow is changed in a future version.'
        ]
      },
      {
        title: 'Treat the answer as an assistant response, not the source of record',
        paragraphs: [
          'The system instruction tells the model to answer from the provided excerpt and to say when the answer is not present, but that does not eliminate model error.',
          'Check names, numbers, obligations, dates and other important conclusions against the original PDF before acting on them.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — Fetch API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API', detail: 'Documents browser-side network requests using fetch, the mechanism the current AI workflow uses to call the configured endpoint.' },
      { label: 'MDN — Window.sessionStorage', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage', detail: 'Explains browser session storage, which the current component uses for the third-party API key.' }
    ]
  },
  {
    slug: 'what-data-ai-pdf-summarizer-sends',
    title: 'What Data Does the AI PDF Summarizer Send to the Provider?',
    description: 'See the exact privacy boundary: local PDF extraction first, explicit consent, up to 30,000 document characters, recent chat messages, and direct browser-to-provider requests.',
    tool: '/ai-summary-pdf',
    toolLabel: 'Review AI PDF Summarizer',
    category: 'AI PRIVACY GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'The source PDF file is processed locally first',
        paragraphs: [
          'The current component passes the selected PDF into 1into1’s local text-extraction pipeline. Digital page text is read in the browser, and low-text or scanned pages can use the local OCR path.',
          'The resulting text is kept in application memory for the AI workflow.'
        ]
      },
      {
        title: 'Nothing is sent until the consent box is checked',
        paragraphs: [
          'If consent is not checked, the send function stops and shows a notice instead of contacting the selected AI provider for the chat workflow.',
          'Consent is tied to the current file and destination choice: selecting another PDF, provider or custom endpoint clears it.'
        ]
      },
      {
        title: 'The provider receives a text excerpt and recent conversation context',
        paragraphs: [
          'The system prompt contains up to the first 30,000 characters of extracted document text. The chat payload also includes up to the six most recent messages from the current conversation.',
          'The PDF binary itself is not attached to that chat request by the current component.'
        ]
      },
      {
        title: 'The request goes directly from the browser to the configured endpoint',
        paragraphs: [
          'The component uses browser fetch calls against the provider URL or the custom endpoint entered by the user. Authentication is sent as a bearer token when an API key is present.',
          'Because the destination is a third party or your own server, its own privacy, retention, security, rate-limit and billing rules govern what happens after the request reaches it.'
        ]
      },
      {
        title: 'API key storage is separate from provider preferences',
        paragraphs: [
          'The third-party API key is written to session storage, while the selected provider, custom model and custom endpoint can be stored in persistent browser local storage.',
          'MDN notes that session storage belongs to the current page session, while local storage persists across browser sessions unless it is cleared or browser policy removes it.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — Using the Fetch API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch', detail: 'Explains request URLs, methods, headers and bodies for browser fetch requests.' },
      { label: 'MDN — Web Storage API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API', detail: 'Explains the difference between sessionStorage and localStorage used for key and preference storage in the browser.' }
    ]
  },
  {
    slug: 'add-text-to-pdf-with-visual-overlays',
    title: 'How to Add Text to a PDF with Visual Overlays',
    description: 'Place, move, resize and format new text on top of existing PDF pages locally, and understand why overlay editing is different from changing the original text object.',
    tool: '/edit-pdf',
    toolLabel: 'Open the Visual PDF Editor',
    category: 'PDF EDITING GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Overlay editing adds new content on top of the page',
        paragraphs: [
          'The current 1into1 Visual Editor does not select and rewrite an existing PDF text object. Instead, it places a new text box at a page-relative position and saves that overlay into the output PDF.',
          'This is useful for visible corrections, labels and additions when a full object-level PDF editor is not required.'
        ]
      },
      {
        title: 'Move and resize the text box visually',
        paragraphs: [
          'Each overlay uses page-relative coordinates, so you can drag it into position and resize it using edge or corner handles in the page preview.',
          'For fine placement on desktop, the selected item can also be nudged with the arrow keys; holding Shift uses a larger step.'
        ]
      },
      {
        title: 'Match the surrounding document with basic text formatting',
        paragraphs: [
          'Text overlays can use Helvetica, Times or Courier with bold and italic variants. The editor also exposes color, underline, strikethrough and left, center or right alignment.',
          'Font size is editable from 1 to 72, and the optional Erase Underneath setting draws a white rectangle behind the new text.'
        ]
      },
      {
        title: 'A white background creates a visual replacement, not object-level editing',
        paragraphs: [
          'When Erase Underneath is enabled, the renderer draws a white rectangle first and then draws the replacement text on top. The original underlying source object is not rewritten by the native overlay path.',
          'Adobe distinguishes adding or changing text in a full PDF editor from simply placing content over a page; true object-level editing can depend on the original font and document structure.'
        ]
      },
      {
        title: 'Check text fidelity before relying on the result',
        paragraphs: [
          'For ordinary unencrypted PDFs, overlay text is saved as native PDF text but the current renderer sanitizes it to printable ASCII. Broader Unicode characters can therefore be removed from the overlay on that path.',
          'Protected or incompatible PDFs can instead use a page-rendering fallback, which burns the visual overlays into reconstructed JPEG-backed pages. Reopen the result and verify every edited area.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Add new text', url: 'https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/add-text.html', detail: 'Adobe documents adding, formatting, resizing and moving new text in a PDF editor.' },
      { label: 'Adobe Acrobat — Change, replace or delete text', url: 'https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/modify-text.html', detail: 'Shows object-level PDF text editing, which is different from the overlay approach used by the current 1into1 Visual Editor.' }
    ]
  },
  {
    slug: 'pdf-whiteout-vs-redaction',
    title: 'PDF Whiteout vs Redaction: Why Covering Text Is Not Enough',
    description: 'Learn the difference between visually covering PDF content with a white rectangle and permanently removing sensitive information with a real redaction workflow.',
    tool: '/edit-pdf',
    toolLabel: 'Open the Visual PDF Editor',
    category: 'PDF PRIVACY GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Whiteout changes what the page looks like',
        paragraphs: [
          'The Visual Editor whiteout item is a plain white rectangle placed over a selected area. On the normal native save path, the original PDF remains underneath while the rectangle is added above it.',
          'That can be useful for cosmetic cleanup or visible replacement, but it is not a security guarantee.'
        ]
      },
      {
        title: 'Redaction is meant to remove sensitive content',
        paragraphs: [
          'A proper redaction workflow is designed to permanently remove the marked visible content when the redaction is applied, rather than only covering it.',
          'Adobe describes redaction as permanently hiding sensitive text or images and separately recommends sanitization for hidden information such as metadata, embedded content or scripts.'
        ]
      },
      {
        title: 'Do not use visual whiteout for secrets or personal data',
        paragraphs: [
          'If a bank account number, identity number, address, confidential clause or other sensitive value must not remain recoverable, use the dedicated Redact PDF tool instead of the Visual Editor whiteout box.',
          'The visual editor is best treated as a presentation and correction tool, not a privacy-removal tool.'
        ]
      },
      {
        title: 'Rendered fallback does not turn Whiteout into a redaction feature',
        paragraphs: [
          'For protected or incompatible PDFs, the Visual Editor can rebuild pages from rendered images and burn overlays into those page images.',
          'Even then, the workflow is not designed or audited as a comprehensive redaction-and-sanitization process, so it should not be used as a substitute for the dedicated redaction workflow.'
        ]
      },
      {
        title: 'Use the right 1into1 tool for the intent',
        paragraphs: [
          'Use Visual Editor when the goal is to add text, correct visible presentation or cover a non-sensitive area.',
          'Use Redact PDF when the goal is to permanently remove sensitive visible information, and use Sanitize PDF when hidden document data also needs attention.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Redact sensitive content in PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redact.html', detail: 'Adobe documents applying redaction to permanently remove confidential visible content.' },
      { label: 'Adobe Acrobat — About redacting and sanitizing PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redacting-sanitizing.html', detail: 'Explains the difference between visible-content redaction and removing hidden document information through sanitization.' }
    ]
  },
  {
    slug: 'convert-formatted-text-to-pdf-locally',
    title: 'How to Convert Formatted Text to PDF Locally',
    description: 'Write or paste rich text, format it in a browser editor, preview discrete A4 pages, add manual page breaks, and export a visual PDF locally.',
    tool: '/text-to-pdf',
    toolLabel: 'Create a Text PDF',
    category: 'TEXT PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Use the browser editor for the document itself',
        paragraphs: [
          '1into1 Text to PDF is an editor-first workflow rather than a file converter. You type or paste the document content into an editable rich-text surface and format it before export.',
          'The editor supports common document controls such as font family, font size, color, bold, italic, underline, alignment and lists.'
        ]
      },
      {
        title: 'Preview the document as discrete A4 pages',
        paragraphs: [
          'The paginator measures the sanitized document against a fixed A4 layout and separates it into page-sized containers before export.',
          'The preview displays each sheet individually with Page X of Y numbering so you can inspect where content breaks before creating the PDF.'
        ]
      },
      {
        title: 'Add a manual page break when automatic flow is not enough',
        paragraphs: [
          'Automatic pagination is useful for normal paragraphs, lists and tables, but reports and letters sometimes need a deliberate new-page boundary.',
          'The editor inserts a page-break marker for that purpose. CSS defines break-before as a way to force or avoid breaks before a generated box.'
        ]
      },
      {
        title: 'The PDF is rendered visually, not as native text objects',
        paragraphs: [
          'During download, each prepared A4 page is rendered into a browser canvas, encoded as JPEG and embedded as a full-page image in a fresh PDF.',
          'This gives the downloaded file the same visual page model as the preview, but selectable or searchable native PDF text is not preserved.'
        ]
      },
      {
        title: 'Use OCR afterward when searchability matters',
        paragraphs: [
          'If the finished document must support text search or selection, run OCR on the image-based PDF afterward.',
          'Keep the editor source until you have verified the visual PDF because OCR can add a text layer later, but it cannot recover the original rich-text editing structure.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — contenteditable', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/contenteditable', detail: 'Documents editable HTML content surfaces used for rich-text authoring in the browser.' },
      { label: 'MDN — break-before', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/break-before', detail: 'Explains forcing page or column breaks before an element in paged or fragmented layouts.' }
    ]
  },
  {
    slug: 'paste-rich-text-to-pdf-clean-formatting',
    title: 'How to Paste Rich Text into a Clean PDF Layout',
    description: 'Paste formatted content from Word, WPS or the web while keeping useful document structure and stripping risky or layout-breaking markup before A4 PDF export.',
    tool: '/text-to-pdf',
    toolLabel: 'Paste text into the PDF editor',
    category: 'TEXT PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Rich-text paste can carry far more than visible words',
        paragraphs: [
          'Clipboard HTML from office editors and websites can include fonts, sizes, dimensions, margins, layout rules and executable or remote-resource markup in addition to the visible document content.',
          'A clean PDF editor should preserve useful document meaning without blindly inheriting every piece of source-page CSS.'
        ]
      },
      {
        title: '1into1 sanitizes the pasted HTML first',
        paragraphs: [
          'The sanitizer allows document-oriented elements such as paragraphs, headings, lists, tables, blockquotes, preformatted text, horizontal rules and bounded embedded images.',
          'It removes scripts, stylesheets, iframes, objects, embeds, metadata tags, SVG, MathML and other disallowed active or external structures.'
        ]
      },
      {
        title: 'Useful formatting survives while foreign layout CSS is normalized',
        paragraphs: [
          'The paste-normalization step keeps useful presentation properties such as text color, background color, font weight, font style, alignment and text decoration.',
          'It deliberately removes pasted font-family, font-size, margins, dimensions, flex/layout properties and related presentation rules so the content follows the Text-to-PDF A4 typography instead of importing an entire foreign page layout.'
        ]
      },
      {
        title: 'Remote images are not fetched',
        paragraphs: [
          'Image elements are retained only when their source is an embedded data:image PNG, JPEG or WebP payload. Ordinary remote image URLs are removed rather than requested.',
          'That makes pasted content more self-contained and avoids depending on external image servers during document creation.'
        ]
      },
      {
        title: 'Preview before export because the page model changes',
        paragraphs: [
          'A Word or webpage layout is not the same as a fixed A4 browser editor. After paste normalization, inspect headings, tables, lists, emphasis and page breaks in the preview.',
          'The final export uses the normalized A4 preview as the visual source for the image-based PDF pages.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — ClipboardEvent.clipboardData', url: 'https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent/clipboardData', detail: 'Documents access to clipboard data transferred during copy-and-paste events.' },
      { label: 'MDN — HTML contenteditable', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/contenteditable', detail: 'Explains browser-editable HTML regions used for document editing and rich-text input.' }
    ]
  },
  {
    slug: 'convert-source-code-to-pdf-with-syntax-highlighting',
    title: 'How to Convert Source Code to PDF with Syntax Highlighting',
    description: 'Paste or upload source code, add optional line numbers, choose a dark or light theme, and create a readable A4 or Letter PDF locally.',
    tool: '/code-to-pdf',
    toolLabel: 'Convert code to PDF',
    category: 'CODE PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Start with pasted code or a readable source file',
        paragraphs: [
          '1into1 Code to PDF accepts code pasted directly into the editor or a file selected from your device. Uploaded files are read as text rather than compiled or executed.',
          'Use an optional header title when the PDF needs to identify the source file, module or snippet.'
        ]
      },
      {
        title: 'Highlighting is generic, not a full language parser',
        paragraphs: [
          'The renderer marks common keyword patterns, quoted strings, line and block comments, numbers and function-like names. Its keyword set spans several familiar programming styles, including JavaScript-like, Python-like, SQL-like and typed-language terms.',
          'There is no programming-language selector and no claim that every token will match an IDE or compiler-grade syntax grammar.'
        ]
      },
      {
        title: 'Choose the PDF layout for reading or printing',
        paragraphs: [
          'Use Dark (Terminal) for a dark code-page appearance or Light (Print) for a white-background version. A4 and US Letter are both available in portrait or landscape.',
          'The current font-size choices are 7.5pt, 8.5pt and 10pt, so landscape plus the smaller sizes can give wide source lines more horizontal room.'
        ]
      },
      {
        title: 'Whitespace and indentation need deliberate handling',
        paragraphs: [
          'Source code depends on spaces, tabs and line breaks for readability, and sometimes for program meaning. MDN documents how whitespace-preserving layouts differ from normal collapsed text rendering.',
          '1into1 expands tab characters to four-space tab stops before laying out the source, then keeps code lines separate rather than flowing them like ordinary prose.'
        ]
      },
      {
        title: 'Verify special characters in the final PDF',
        paragraphs: [
          'Most ordinary Latin or ASCII source is written as vector PDF text. Lines containing broader Unicode or backslashes can be rendered locally as images to avoid corrupting visible characters or escape-heavy source.',
          'Check regex-heavy lines, multilingual comments, emoji and unusual symbols after export when exact visual fidelity matters.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — white-space CSS property', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/white-space', detail: 'Explains preserving spaces, tabs and line breaks versus collapsing ordinary text whitespace.' },
      { label: 'MDN — tab-size CSS property', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/tab-size', detail: 'Documents tab-width concepts used when presenting indented preformatted text.' }
    ]
  },
  {
    slug: 'print-long-code-to-pdf-with-line-numbers',
    title: 'How to Print Long Code to PDF with Line Numbers',
    description: 'Create a readable source-code PDF with optional line numbers, landscape layout and safe long-line chunking instead of cutting code off at the page edge.',
    tool: '/code-to-pdf',
    toolLabel: 'Create a code PDF',
    category: 'CODE PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Line numbers make printed code easier to reference',
        paragraphs: [
          'When reviewers discuss a printed or shared code listing, line numbers provide stable reference points that are easier to cite than visual positions on a page.',
          '1into1 includes a dedicated line-number gutter by default, and you can turn it off when the PDF is intended only for presentation.'
        ]
      },
      {
        title: 'Landscape gives long lines more room',
        paragraphs: [
          'Portrait pages leave less horizontal space for monospace source. Switching to landscape increases the width available to each source line.',
          'A4 and US Letter are both supported, and the 7.5pt Compact setting fits more characters per line than 8.5pt or 10pt.'
        ]
      },
      {
        title: 'Long lines are chunked instead of clipped',
        paragraphs: [
          'The renderer calculates how many monospace characters fit in the current code area and splits wider lines into sequential chunks.',
          'Only the first chunk displays the original source line number, so continuation chunks remain visually tied to that same source line instead of pretending to be new numbered lines.'
        ]
      },
      {
        title: 'Unicode chunks are split by grapheme when possible',
        paragraphs: [
          'Breaking a Unicode string at an arbitrary UTF-16 position can split a surrogate pair or combined character sequence. The current renderer uses the browser Intl.Segmenter grapheme API when available for Unicode lines and falls back to code-point iteration otherwise.',
          'This reduces the risk of breaking emoji, combining marks or joined character sequences at a page-width boundary.'
        ]
      },
      {
        title: 'Syntax color stays behind the source text',
        paragraphs: [
          'The highlighter draws subtle background regions for detected keywords, strings, comments, numbers and function-like names, then writes the visible source once on top.',
          'That design avoids reconstructing a code line from individually spaced colored tokens, which helps protect punctuation and whitespace alignment.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — Handling whitespace', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Text/Whitespace', detail: 'Explains why source-code whitespace such as spaces, tabs and line feeds needs explicit preservation rules.' },
      { label: 'MDN — Intl.Segmenter', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter', detail: 'Documents locale-sensitive segmentation, including grapheme segmentation used to avoid splitting complex Unicode character sequences.' }
    ]
  },
  {
    slug: 'convert-csv-or-tsv-to-pdf-table',
    title: 'How to Convert CSV or TSV to a PDF Table',
    description: 'Upload comma- or tab-delimited data, or paste spreadsheet cells, then turn the values into a paginated A4 or Letter PDF table locally.',
    tool: '/csv-to-pdf',
    toolLabel: 'Convert CSV to PDF',
    category: 'SPREADSHEET PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'CSV and TSV are delimited text, not full workbooks',
        paragraphs: [
          'CSV stores fields separated by commas, while tab-delimited text uses tab characters between fields. Microsoft documents both as text formats for exchanging worksheet values.',
          'That also means workbook styling, charts and many spreadsheet-specific features are not part of the delimited data itself.'
        ]
      },
      {
        title: 'Upload a file or paste the cells directly',
        paragraphs: [
          '1into1 accepts .csv and .tsv files, and it also accepts pasted spreadsheet data. Copying a block of cells from Excel or Google Sheets commonly produces tab-separated text that can be parsed directly.',
          'The parser checks the first record and chooses tabs when there are more tab separators than commas outside quoted fields.'
        ]
      },
      {
        title: 'Quoted CSV fields are parsed before the PDF is built',
        paragraphs: [
          'The parser supports quoted fields, doubled quotation marks inside a quoted field, and record separators that appear inside quoted content.',
          'RFC 4180 describes the common CSV convention of enclosing fields in double quotes when they contain commas, line breaks or quotes.'
        ]
      },
      {
        title: 'The first row is used as the PDF table header',
        paragraphs: [
          'After parsing, the first row becomes the header row and the remaining rows become table data. The renderer repeats the header on continuation pages.',
          'Add a document title when the PDF needs context beyond the column headings.'
        ]
      },
      {
        title: 'Choose A4 or Letter and check the final pagination',
        paragraphs: [
          'The converter can create A4 or US Letter output with portrait, landscape or automatic orientation. Long values wrap inside cells and very tall rows can continue across pages.',
          'Reopen the PDF and verify headers, wrapped text, Unicode content and any rows whose cell values contain line breaks.'
        ]
      }
    ],
    sources: [
      { label: 'RFC 4180 — Common Format and MIME Type for CSV Files', url: 'https://www.rfc-editor.org/rfc/rfc4180.html', detail: 'Documents common CSV conventions including comma-separated records and quoted fields.' },
      { label: 'Microsoft Excel — Import or export text and CSV files', url: 'https://support.microsoft.com/en-us/excel/get-started/import-or-export-text-txt-or-csv-files', detail: 'Microsoft distinguishes comma-separated CSV from tab-delimited text and explains their use for worksheet data exchange.' }
    ]
  },
  {
    slug: 'wide-csv-table-to-pdf-landscape',
    title: 'How to Put a Wide CSV Table into a Readable PDF',
    description: 'Use landscape orientation and horizontal column panels so wide CSV or TSV data stays readable instead of being squeezed into tiny columns.',
    tool: '/csv-to-pdf',
    toolLabel: 'Convert a wide table to PDF',
    category: 'SPREADSHEET PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Wide tables need more than smaller text',
        paragraphs: [
          'A spreadsheet with many columns can become unreadable if every column is simply shrunk to fit one portrait page.',
          '1into1 keeps a minimum readable column width and treats table width as a layout problem rather than endlessly reducing the text size.'
        ]
      },
      {
        title: 'Auto orientation switches wide tables to landscape',
        paragraphs: [
          'The current Auto setting counts the parsed columns. Tables with more than five columns use landscape; tables with five or fewer use portrait.',
          'You can override that decision manually when the content inside the cells makes a different orientation more suitable.'
        ]
      },
      {
        title: 'Very wide tables are split into horizontal panels',
        paragraphs: [
          'When the desired column widths exceed the printable width, the renderer groups columns into multiple horizontal panels instead of forcing every column onto one sheet.',
          'For suitable tables with more than two columns, the first column can repeat on later panels as an anchor so rows remain easier to identify.'
        ]
      },
      {
        title: 'Headers repeat on continuation pages',
        paragraphs: [
          'Each vertical continuation page redraws the current panel header before continuing the data rows.',
          'The PDF also carries global Page X of Y numbering across all panels and continuation pages, which helps when a large table spans many sheets.'
        ]
      },
      {
        title: 'Remember that CSV does not contain workbook presentation',
        paragraphs: [
          'If you exported the source from Excel, CSV carries text and values rather than the original workbook formatting, graphics or objects. Microsoft explicitly warns that formatting is not retained in CSV and text formats.',
          'The PDF theme, widths, wrapping and pagination are therefore generated by the converter rather than copied from the workbook appearance.'
        ]
      }
    ],
    sources: [
      { label: 'Microsoft Excel — Save a workbook to text or CSV', url: 'https://support.microsoft.com/en-us/excel/save-a-workbook-to-text-format-txt-or-csv', detail: 'Explains that CSV and text exports preserve delimited values but do not retain workbook formatting.' },
      { label: 'Microsoft Excel — Formatting not transferred to CSV/text', url: 'https://support.microsoft.com/en-us/excel/excel-formatting-and-features-that-are-not-transferred-to-other-file-formats', detail: 'Documents formatting and feature loss when worksheet data is saved as CSV or tab-delimited text.' }
    ]
  },
  {
    slug: 'convert-html-file-to-pdf-locally',
    title: 'How to Convert an HTML File to PDF Locally',
    description: 'Paste HTML or upload an .html file, keep the source self-contained, choose A4, Letter or receipt output, and create the PDF in your browser.',
    tool: '/html-to-pdf',
    toolLabel: 'Convert HTML to PDF',
    category: 'HTML TO PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Start with HTML source, not a webpage URL',
        paragraphs: [
          '1into1 HTML to PDF accepts markup you paste into the editor or an .html/.htm file you choose from your device.',
          'It is not a URL-to-PDF crawler. If all you have is a website address, first obtain or prepare the HTML content you are authorized to use.'
        ]
      },
      {
        title: 'Keep the document self-contained',
        paragraphs: [
          'The styled A4 and Letter workflow parses the HTML locally, removes executable and externally dependent elements, and lays out the remaining document content into PDF pages.',
          'Inline style attributes and embedded style blocks are safer choices than linked stylesheets. Important raster images should be embedded as data:image URLs instead of relying on remote image addresses.'
        ]
      },
      {
        title: 'Choose A4, Letter or receipt output',
        paragraphs: [
          'A4 and US Letter can be generated in portrait or landscape. These modes use the richer styled renderer and aim to preserve readable text as PDF text where the supported layout allows it.',
          'The 80mm Thermal Receipt mode uses a simpler semantic renderer designed around document blocks such as headings, paragraphs, tables, rules and embedded data images.'
        ]
      },
      {
        title: 'Scripts are removed rather than executed',
        paragraphs: [
          'The converter removes script elements, inline event handlers and javascript: links before rendering. It also removes iframes, objects, embeds and similar active content.',
          'This means the output represents the static document content, not the result of running a web application.'
        ]
      },
      {
        title: 'Inspect the PDF after conversion',
        paragraphs: [
          'HTML and PDF have different layout models, so complex CSS can paginate differently from a browser tab. Check page breaks, tables, images, links, fonts and any layout that depends on exact browser behavior.',
          'For the most predictable result, simplify the source and keep required assets inside the HTML itself.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — DOMParser.parseFromString()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString', detail: 'Documents parsing HTML strings into a DOM document, the starting point for the local HTML processing workflow.' },
      { label: 'MDN — data: URLs', url: 'https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data', detail: 'Explains embedding data directly inside a URL, the supported approach for self-contained raster image sources in the converter.' }
    ]
  },
  {
    slug: 'html-file-to-pdf-vs-webpage-to-pdf',
    title: 'HTML File to PDF vs Webpage to PDF: What Is the Difference?',
    description: 'Understand why converting HTML source is different from capturing a live webpage URL, especially for CSS, remote images, scripts and dynamic content.',
    tool: '/html-to-pdf',
    toolLabel: 'Open HTML to PDF',
    category: 'HTML TO PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'HTML-file conversion starts from source markup',
        paragraphs: [
          'An HTML-file converter reads markup you provide directly. It does not need to navigate to a website first.',
          '1into1 supports pasted HTML and uploaded .html/.htm files, then parses and renders that source locally.'
        ]
      },
      {
        title: 'Webpage-to-PDF tools usually start from a URL',
        paragraphs: [
          'A webpage-to-PDF service typically loads a live URL in a browser-like environment, waits for styles, images and scripts, and then prints or captures the rendered page.',
          'That is a different capability from the current 1into1 HTML to PDF tool, which does not accept or fetch a live webpage URL.'
        ]
      },
      {
        title: 'External dependencies are the biggest practical difference',
        paragraphs: [
          'A live webpage can request linked CSS, fonts, remote images and JavaScript from other servers. A self-contained HTML document can carry the formatting and assets it needs inside the source.',
          '1into1 intentionally removes external stylesheet links and non-data image sources from its styled renderer, so externally hosted assets should not be expected to appear.'
        ]
      },
      {
        title: 'Dynamic JavaScript output is not reproduced',
        paragraphs: [
          'Client-side applications can generate content only after JavaScript executes. Because 1into1 strips scripts and event handlers, it converts static document markup rather than executing the application.',
          'If the information exists only after a live app runs, export or capture that content into self-contained HTML before using this converter.'
        ]
      },
      {
        title: 'Choose the workflow based on the source you control',
        paragraphs: [
          'Use HTML to PDF when you control the markup and can make the document self-contained. It is useful for invoices, receipts, reports, email-style documents and generated HTML templates.',
          'Use a true webpage-to-PDF browser renderer when the task specifically requires loading a public or authenticated URL with its live network assets and runtime behavior.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — DOMParser', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DOMParser', detail: 'Describes parsing markup supplied as a string into a DOM rather than navigating a browser to a remote URL.' },
      { label: 'MDN — HTML script element', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script', detail: 'Documents executable script content, which the current 1into1 HTML conversion sanitizer removes instead of executing.' }
    ]
  },
  {
    slug: 'how-to-reorder-pdf-pages-visually',
    title: 'How to Reorder PDF Pages Visually',
    description: 'Rearrange PDF pages with thumbnails, rotate individual pages, remove unwanted pages, and save the new order locally in your browser.',
    tool: '/organize-pdf',
    toolLabel: 'Organize PDF pages',
    category: 'PDF PAGE GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Thumbnail view makes page order easier to verify',
        paragraphs: [
          'A visual organizer renders each page as a thumbnail so you can see the current sequence before changing it. This is especially useful for scanned packets where pages were captured out of order.',
          'Adobe’s Organize Pages workflow similarly uses page thumbnails for moving, rotating and deleting pages.'
        ]
      },
      {
        title: 'Drag pages into the sequence you need',
        paragraphs: [
          'In 1into1, drag a page card to a new position. The output configuration follows that new thumbnail order when the PDF is rebuilt.',
          'You can also use the move-earlier and move-later controls when precise one-step movement is easier than dragging.'
        ]
      },
      {
        title: 'Rotate individual pages without rotating the whole document',
        paragraphs: [
          'Each thumbnail has its own clockwise rotate button. Pressing it adds another 90-degree rotation to that specific page.',
          'That is different from the standalone Rotate PDF tool, which applies one selected angle to every page in the document.'
        ]
      },
      {
        title: 'Delete pages before creating the new PDF',
        paragraphs: [
          'Removing a thumbnail excludes that source page from the configuration used for the output PDF.',
          'Use this for blank scans, duplicate captures or pages that should not be included in the final copy. Keep the original source until the new document has been checked.'
        ]
      },
      {
        title: 'Check structure-sensitive content after organizing',
        paragraphs: [
          'For clean unencrypted files, 1into1 copies the selected source pages into the new order and applies the requested rotations without intentionally rasterizing the page content.',
          'Protected or incompatible PDFs can use a rendered-image fallback. In either case, verify page references, links, bookmarks, forms and other structure-sensitive behavior if those features matter to your workflow.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Organize pages', url: 'https://helpx.adobe.com/acrobat/web/edit-pdfs/organize-documents/organize-pages.html', detail: 'Adobe documents thumbnail-based page reordering, individual-page rotation and deletion.' },
      { label: 'Adobe Acrobat — Rearrange PDF pages', url: 'https://www.adobe.com/in/acrobat/how-to/rearrange-pdf-pages.html', detail: 'Shows drag-and-drop page reordering and organizing PDF pages into a new sequence.' }
    ]
  },
  {
    slug: 'rotate-selected-pdf-pages-vs-whole-document',
    title: 'Rotate Selected PDF Pages vs the Whole Document',
    description: 'Choose Organize PDF when only certain pages need rotation, or Rotate PDF when every page needs the same 90°, 180° or 270° correction.',
    tool: '/organize-pdf',
    toolLabel: 'Rotate selected pages',
    category: 'PDF PAGE GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Use Organize PDF when only some pages are sideways',
        paragraphs: [
          'A mixed-orientation PDF may contain one landscape scan or a few upside-down pages inside an otherwise correct document.',
          'Organize PDF gives each page its own rotation control, so you can correct those pages without changing the orientation of pages that are already right.'
        ]
      },
      {
        title: 'Use Rotate PDF when the whole document has the same error',
        paragraphs: [
          'The standalone Rotate PDF tool applies one selected +90°, +180° or +270° clockwise correction across the entire document.',
          'That is more direct when every page came from a scanner or export in the same wrong orientation.'
        ]
      },
      {
        title: 'Page-specific rotation follows the reordered page',
        paragraphs: [
          'In Organize PDF, each page card carries its own original page index and rotation value. If you move that page to another position, its selected rotation moves with it into the output configuration.',
          'This lets you reorder and fix orientation during the same review instead of performing two separate whole-document operations.'
        ]
      },
      {
        title: 'Both workflows save the orientation into a new PDF',
        paragraphs: [
          'These are saved document changes, not temporary viewer rotations. The downloaded copy stores the requested page rotation or rebuilt page orientation.',
          'Adobe also distinguishes temporary Rotate View from saved page rotation in its page-organizing tools.'
        ]
      },
      {
        title: 'Keep the source until the result is verified',
        paragraphs: [
          'After rotating selected pages, reopen the new PDF and inspect pages around every changed location. Confirm page order as well as orientation.',
          'If an input requires the compatibility fallback, also verify text selection or other interactive features that may matter.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Rotate pages in PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/rotate-pages.html', detail: 'Adobe documents rotating selected pages or page ranges and saving the resulting orientation.' },
      { label: 'Adobe Acrobat — Organize pages on the web', url: 'https://helpx.adobe.com/acrobat/web/edit-pdfs/organize-documents/organize-pages.html', detail: 'Shows page-specific rotation alongside rearranging and deleting pages.' }
    ]
  },
  {
    slug: 'how-to-rotate-pdf-permanently',
    title: 'How to Rotate a PDF Permanently',
    description: 'Save a 90°, 180° or 270° rotation into a new PDF so the corrected orientation remains when the file is reopened or shared.',
    tool: '/rotate-pdf',
    toolLabel: 'Rotate the whole PDF',
    category: 'PDF PAGE GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Viewer rotation can be temporary',
        paragraphs: [
          'Some PDF viewers let you rotate what you see on screen without changing the actual page orientation stored in the document.',
          'Adobe explicitly distinguishes Rotate View, which is temporary, from rotating pages through Organize Pages and saving the PDF, which changes the document orientation.'
        ]
      },
      {
        title: 'Choose the quarter-turn that fixes the document',
        paragraphs: [
          'The standalone 1into1 Rotate PDF tool offers +90°, +180° and +270° clockwise. The first-page preview shows the selected orientation before the full document is processed.',
          'Use +90° or +270° for sideways documents and +180° when every page is upside down.'
        ]
      },
      {
        title: 'The same rotation is applied to every page',
        paragraphs: [
          'The current Rotate PDF interface passes one angle to the whole document, so every page receives the same additional rotation.',
          'That makes it a good fit for documents scanned consistently in the wrong orientation. When only a few pages are wrong, use Organize PDF for page-specific changes instead.'
        ]
      },
      {
        title: 'Normal PDFs use the vector-preserving rotation path',
        paragraphs: [
          'For ordinary unencrypted PDFs, 1into1 changes the page rotation value and saves a new PDF rather than intentionally turning every page into an image.',
          'Internally encrypted inputs can require a rendered compatibility path, so verify text selection and page quality when exact structure preservation matters.'
        ]
      },
      {
        title: 'Reopen the downloaded file to verify the change',
        paragraphs: [
          'Open the result in another viewer or browser after downloading it. The corrected orientation should still be present because the change is saved into the output PDF rather than being only a viewer preference.',
          'Keep the original until you have checked page order, orientation and important content.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Rotate pages in PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/rotate-pages.html', detail: 'Adobe documents saved page rotation and separately notes that Rotate View is only temporary.' },
      { label: 'Adobe Acrobat — Adjusting PDF views', url: 'https://helpx.adobe.com/acrobat/using/adjusting-pdf-views.html', detail: 'Explains that rotating the page view changes only the display and is not the same as saving the page orientation.' }
    ]
  },
  {
    slug: 'rotate-pdf-vs-deskew',
    title: 'Rotate PDF vs Deskew: Which Fix Does a Scanned Page Need?',
    description: 'Use PDF rotation for sideways or upside-down pages and deskew for small scan tilt. Learn which correction matches each orientation problem.',
    tool: '/rotate-pdf',
    toolLabel: 'Rotate a PDF',
    category: 'SCANNED PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Rotate fixes quarter-turn orientation errors',
        paragraphs: [
          'Use Rotate PDF when the document is sideways or upside down and needs a 90°, 180° or 270° correction.',
          'This is an orientation problem: the page is facing the wrong direction as a whole.'
        ]
      },
      {
        title: 'Deskew fixes a small angular lean',
        paragraphs: [
          'Use Deskew PDF when text lines are almost horizontal but lean by a few degrees because the paper entered a scanner or camera slightly crooked.',
          'Adobe describes deskewing as automatically straightening tilted scanned pages, which is different from a quarter-turn page rotation.'
        ]
      },
      {
        title: 'Do not use a 90-degree tool for a 2-degree problem',
        paragraphs: [
          'A small scan tilt needs fine correction, not a quarter-turn. Likewise, a page that is fully sideways should be rotated rather than adjusted a few tenths of a degree at a time.',
          'Choosing the correct tool avoids unnecessary transformations and makes the preview easier to interpret.'
        ]
      },
      {
        title: 'The standalone Rotate tool changes every page',
        paragraphs: [
          '1into1 Rotate PDF applies the selected 90°, 180° or 270° angle across the entire document.',
          '1into1 Deskew also uses one selected fine angle across the PDF, estimated from the first-page preview. If pages need different corrections, separate or organize them before applying the appropriate fix.'
        ]
      },
      {
        title: 'Correct orientation before OCR when possible',
        paragraphs: [
          'OCR works best when the page is oriented and aligned sensibly before recognition. A sideways page should be rotated first; a slightly tilted scan can benefit from deskewing before OCR.',
          'Adobe’s scanned-PDF settings list Deskew as a scan-enhancement step, while rotation is handled as page orientation.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Rotate pages in PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/rotate-pages.html', detail: 'Documents 90-degree page rotation used to correct PDF orientation.' },
      { label: 'Adobe Acrobat — Improve scanned PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/scanned-pdf-settings.html', detail: 'Defines Deskew as automatically straightening tilted scanned pages.' }
    ]
  },
  {
    slug: 'remove-known-pdf-password-locally',
    title: 'How to Remove a Known PDF Password Locally',
    description: 'Remove password protection from a PDF you are authorized to access, without uploading the document, and understand what the unlocked output contains.',
    tool: '/unlock-pdf',
    toolLabel: 'Unlock a PDF locally',
    category: 'PDF SECURITY GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'You need the current password',
        paragraphs: [
          'Removing legitimate PDF password protection is different from guessing or bypassing an unknown password. The current 1into1 workflow requires you to enter the existing password before the document can be decrypted.',
          'Adobe likewise requires the relevant password or authorization when removing document security from a protected PDF.'
        ]
      },
      {
        title: 'The document is decrypted locally in the browser',
        paragraphs: [
          '1into1 authenticates the encrypted PDF in the browser using the password you provide. The source file does not need to be uploaded to a normal document-processing server for the unlock step.',
          'If the password is incorrect, the workflow stops rather than creating an unlocked copy.'
        ]
      },
      {
        title: 'The unlocked output is rebuilt from rendered pages',
        paragraphs: [
          'After authentication, the tool renders each decrypted page and places that page image into a new, unencrypted PDF.',
          'This deliberately avoids carrying the original encrypted object graph into the output, but it also means the result is not a structure-preserving decryption of the original file.'
        ]
      },
      {
        title: 'Searchable text and form controls do not survive',
        paragraphs: [
          'Because the new PDF is built from page images, selectable text, OCR text layers, links, form fields and other interactive PDF structures are not preserved as normal objects.',
          'If those features matter, keep the protected original and use a different authorized decryption workflow that preserves the original PDF structure.'
        ]
      },
      {
        title: 'Verify the unlocked copy before using it',
        paragraphs: [
          'Open the downloaded PDF without entering a password and inspect the first, middle and last pages. Check important numbers, signatures, stamps and image detail.',
          'Keep the original protected file until you are satisfied that the rebuilt copy is visually complete and suitable for the next workflow.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Remove passwords from PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/protect-documents/protect-with-passwords/remove-passwords-from-pdfs.html', detail: 'Adobe documents removing document-open and permissions passwords when the required authorization is available.' },
      { label: 'Adobe Acrobat — Unlock a PDF', url: 'https://www.adobe.com/acrobat/how-to/unlock-pdf.html', detail: 'Adobe explains authorized password removal and distinguishes document-open password removal from permissions-password removal.' }
    ]
  },
  {
    slug: 'what-changes-when-you-unlock-pdf',
    title: 'What Changes When You Unlock a PDF in 1into1?',
    description: 'Learn why the current Unlock PDF workflow creates a fresh image-based PDF, what is removed with the encryption, and which original PDF features do not survive.',
    tool: '/unlock-pdf',
    toolLabel: 'Open Unlock PDF',
    category: 'PDF SECURITY GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'The password protection is not copied into the new file',
        paragraphs: [
          'The output is a newly created PDF that does not carry forward the source encryption dictionary. The downloaded copy can therefore be opened without the original document password.',
          'That is the main purpose of the Unlock PDF workflow.'
        ]
      },
      {
        title: 'Each source page is rendered before rebuilding',
        paragraphs: [
          'Instead of rewriting the original encrypted PDF objects in place, 1into1 renders each decrypted page at high resolution and embeds the rendered result into a fresh page.',
          'This makes the output visually oriented rather than structurally identical to the encrypted source.'
        ]
      },
      {
        title: 'Text selection and interactivity are lost',
        paragraphs: [
          'The rebuilt pages are JPEG-backed images. Native selectable text, OCR text layers, hyperlinks, form fields, annotations and similar interactive structures are not preserved as their original PDF objects.',
          'The visible appearance can remain readable, but the document behaves more like a scanned PDF afterward.'
        ]
      },
      {
        title: 'Unlocking is different from changing PDF permissions in place',
        paragraphs: [
          'Adobe distinguishes removing a document-open password from removing permissions restrictions such as editing and printing controls.',
          'The current 1into1 tool does not expose a granular permissions editor. It accepts a password and produces a fresh unencrypted image-based copy.'
        ]
      },
      {
        title: 'Choose the workflow based on what you need afterward',
        paragraphs: [
          'Use this Unlock PDF workflow when the priority is obtaining an unencrypted visual copy for authorized viewing, sharing or a downstream process that rejects encrypted files.',
          'If you need to preserve form fields, links, searchable text or original vector objects, use an authorized decryption tool that preserves the original PDF structure instead.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Remove passwords from PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/protect-documents/protect-with-passwords/remove-passwords-from-pdfs.html', detail: 'Shows that document-open passwords and permissions restrictions are separate security settings.' },
      { label: 'Adobe PDF Services — Security and password-protected PDFs', url: 'https://developer.adobe.com/document-services/docs/overview/security', detail: 'Describes user/document-open passwords and owner/permissions restrictions as distinct PDF security mechanisms.' }
    ]
  },
  {
    slug: 'how-to-password-protect-pdf-locally',
    title: 'How to Password-Protect a PDF Locally',
    description: 'Encrypt a PDF with a password in your browser, understand what the password protects, and verify the finished file before sharing it.',
    tool: '/protect-pdf',
    toolLabel: 'Protect a PDF with a password',
    category: 'PDF SECURITY GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A document-open password controls access to the PDF',
        paragraphs: [
          'A PDF document-open password, also called a user password, requires the recipient to enter the password before the file can be opened in a conforming reader.',
          'Adobe distinguishes this from a permissions password, which is used to control or change restrictions such as printing, editing or copying.'
        ]
      },
      {
        title: '1into1 applies 128-bit password protection locally',
        paragraphs: [
          'The Protect PDF tool sends the original browser File to a dedicated local Worker and applies qpdf-based 128-bit protection without first uploading the document to a normal processing server.',
          'The entered password is used as both the user password and owner password in the current implementation.'
        ]
      },
      {
        title: 'The page content is preserved rather than rasterized',
        paragraphs: [
          'Protection is an encryption rewrite, not a page-conversion workflow. The tool does not intentionally render every page to JPEG, run OCR or flatten the visible page content as part of password protection.',
          'That makes Protect PDF different from sanitization, grayscale conversion or some compatibility fallbacks that rebuild rendered pages.'
        ]
      },
      {
        title: 'Use a strong password and share it separately',
        paragraphs: [
          'A weak password can undermine otherwise valid encryption. Use a password that is difficult to guess and avoid reusing a password already associated with the same recipient or document.',
          'When practical, send the protected file and its password through different communication channels so the password is not bundled with the document itself.'
        ]
      },
      {
        title: 'Verify the downloaded copy before sending it',
        paragraphs: [
          'Close the protected file, reopen it in the PDF viewer that matters to your recipient and confirm that the password prompt appears.',
          'Keep the original unprotected file separately. If the source PDF is already encrypted, unlock it first before applying a new password.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Encrypt PDFs with passwords', url: 'https://helpx.adobe.com/acrobat/desktop/protect-documents/protect-with-passwords/add-passwords-to-pdfs.html', detail: 'Adobe documents document-open passwords and separate permissions controls for printing, editing and copying.' },
      { label: 'Adobe PDF Services — PDF document security and permissions', url: 'https://developer.adobe.com/document-services/docs/overview/security', detail: 'Explains the distinction between document-open/user passwords and permissions/owner passwords.' }
    ]
  },
  {
    slug: 'pdf-open-password-vs-permissions-password',
    title: 'PDF Open Password vs Permissions Password: What Is the Difference?',
    description: 'Understand the difference between a PDF document-open password and a permissions or owner password, and what the current 1into1 Protect PDF tool actually applies.',
    tool: '/protect-pdf',
    toolLabel: 'Open Protect PDF',
    category: 'PDF SECURITY GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A document-open password controls who can open the file',
        paragraphs: [
          'The document-open password is the credential a reader asks for before displaying the encrypted PDF. Adobe also refers to it as the user password.',
          'This is the password type most people mean when they say they want to password-protect a PDF before sharing it.'
        ]
      },
      {
        title: 'A permissions password controls security settings',
        paragraphs: [
          'A permissions password, also called an owner or master password, is used with restrictions such as whether a reader may print, edit or copy PDF content.',
          'Adobe treats those restrictions separately from the password that is required simply to open the document.'
        ]
      },
      {
        title: '1into1 currently uses one password for both roles',
        paragraphs: [
          'The current Protect PDF implementation passes the same user-entered password as both the user password and owner password while applying 128-bit encryption.',
          'The interface does not currently expose separate permission switches or a second independent owner-password field.'
        ]
      },
      {
        title: 'Do not assume permissions restrictions are enforced',
        paragraphs: [
          'Because 1into1 does not expose granular permission settings, do not describe the current tool as separately disabling printing, copying or editing.',
          'When a workflow specifically requires those permission controls, use a PDF security tool that lets you configure them explicitly.'
        ]
      },
      {
        title: 'Password protection and redaction solve different problems',
        paragraphs: [
          'Encryption controls access to the file. It does not remove confidential text that becomes visible after an authorized recipient opens the document.',
          'Use permanent redaction to remove visible sensitive information and sanitization to remove broader hidden data when those are part of the sharing requirement.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe PDF Services — Protect PDF', url: 'https://developer.adobe.com/document-services/docs/overview/pdf-services-api/howtos/protect-pdf', detail: 'Adobe documents user passwords, owner passwords, AES encryption and optional granular PDF permissions.' },
      { label: 'Adobe Acrobat — Password security policies', url: 'https://helpx.adobe.com/acrobat/desktop/protect-documents/security-policies/create-password-policy.html', detail: 'Adobe documents document-open and permissions-password settings as separate security concepts.' }
    ]
  },
  {
    slug: 'fill-interactive-pdf-form-vs-flat-pdf',
    title: 'Fillable PDF Form vs Flat PDF: Why the Fields Matter',
    description: 'Learn how an interactive AcroForm differs from a flat or scanned PDF, which field types 1into1 can fill, and what to do when no native fields exist.',
    tool: '/fill-pdf',
    toolLabel: 'Fill a PDF form',
    category: 'PDF FORM GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'An interactive PDF form contains real form fields',
        paragraphs: [
          'A fillable PDF contains interactive controls that a PDF reader can identify separately from the visible page. Adobe describes fillable fields such as text inputs, checkboxes and other selectable controls that react when the pointer moves over them.',
          '1into1 reads the PDF AcroForm structure and turns supported fields into browser inputs so you can fill them without manually positioning text over the page.'
        ]
      },
      {
        title: 'The current 1into1 filler supports three field types',
        paragraphs: [
          'The Fill PDF tool currently edits AcroForm text fields, checkboxes and dropdowns. It reads existing values where available and writes your new values back into those supported controls.',
          'Other field types are not presented as editable controls in this workflow, so a document can contain form fields that 1into1 detects but does not currently let you change.'
        ]
      },
      {
        title: 'A flat PDF can look like a form without being fillable',
        paragraphs: [
          'A scanned application or exported document may contain boxes and lines that visually resemble a form even though there are no interactive fields underneath.',
          'Adobe calls these flat forms: the page has visible form-like content but not native fillable controls. 1into1 Fill PDF will report that no interactive form fields were detected in that case.'
        ]
      },
      {
        title: 'Use a visual editing workflow for flat forms',
        paragraphs: [
          'When a PDF is flat, an AcroForm filler has nothing to populate. Use a tool that places visible text, annotations or a drawn signature onto the page instead.',
          'If you need a reusable interactive form rather than a one-time completed copy, the document must first be prepared with actual form fields.'
        ]
      },
      {
        title: 'Check the saved PDF in the viewer that matters',
        paragraphs: [
          'After filling the form, preview or reopen the downloaded file and verify the text, checkbox states and dropdown selections.',
          'If the recipient requires the fields to remain editable, save without flattening. If the form is final, flattening can remove the normal interactive controls while keeping the filled appearance.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Check if a PDF form is fillable', url: 'https://helpx.adobe.com/acrobat/desktop/work-with-pdf-forms/fill-sign-forms/check-fillability.html', detail: 'Adobe explains how interactive fillable fields differ from ordinary page content.' },
      { label: 'Adobe Acrobat — Fill and sign flat forms', url: 'https://helpx.adobe.com/acrobat/desktop/work-with-pdf-forms/fill-sign-forms/flat-forms.html', detail: 'Adobe defines flat forms as scanned or non-interactive PDFs and uses a different visual fill-and-sign workflow for them.' }
    ]
  },
  {
    slug: 'flatten-pdf-form-fields-vs-keep-editable',
    title: 'Flatten PDF Form Fields or Keep Them Editable?',
    description: 'Understand what PDF form flattening changes, when to keep an AcroForm interactive, and what the 1into1 Flatten Form option actually does.',
    tool: '/fill-pdf',
    toolLabel: 'Fill and flatten a form',
    category: 'PDF FORM GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Keeping the form editable preserves interactive controls',
        paragraphs: [
          'When Flatten Form is turned off, 1into1 saves the filled PDF while retaining the AcroForm structure. Supported fields remain normal form controls that a compatible PDF reader can continue to edit.',
          'Choose this when the recipient still needs to revise answers, complete additional fields or reuse the form.'
        ]
      },
      {
        title: 'Flattening removes normal form-field interactivity',
        paragraphs: [
          'When flattening is enabled, the filled field appearance is applied to the page and the interactive form widgets are removed from the finished copy.',
          'Adobe describes flattening similarly: the graphical appearance remains, but the form field is no longer interactive.'
        ]
      },
      {
        title: '1into1 also cleans stale form-widget references',
        paragraphs: [
          'After flattening, the tool removes remaining Widget annotation references that can be left behind by some form structures, while preserving unrelated normal annotations when possible.',
          'It then copies the flattened pages into a fresh PDF document so stale AcroForm objects from the source are not intentionally carried into the static finished copy.'
        ]
      },
      {
        title: 'Flattening is not the same as document security',
        paragraphs: [
          'A flattened field is no longer a normal interactive form control, but flattening should not be treated as encryption, access control or a promise that no PDF editor can alter the page.',
          'Use password protection and appropriate sharing controls when you need access restrictions rather than only a static form appearance.'
        ]
      },
      {
        title: 'Keep an editable original before flattening',
        paragraphs: [
          'Flattening is best treated as a finalization step. Keep the original interactive form separately if you may need to change the answers later.',
          'Adobe likewise recommends retaining the original because interactive elements cannot simply be restored from a flattened final copy.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — How to flatten a PDF', url: 'https://www.adobe.com/in/acrobat/roc/blog/how-to-flatten-a-pdf.html', detail: 'Adobe explains flattening as integrating interactive elements into static document content and recommends saving an original copy first.' },
      { label: 'Adobe AEM Forms — Flattening forms', url: 'https://helpx.adobe.com/pdf/aem-forms/6-3/ddxRef.pdf', detail: 'Adobe documentation defines flattened form fields as retaining graphical appearance while no longer remaining interactive.' }
    ]
  },
  {
    slug: 'resize-pdf-to-a4-or-letter',
    title: 'How to Resize a PDF to A4 or US Letter',
    description: 'Standardize PDF page dimensions to A4 or US Letter, understand why margins can appear, and keep portrait and landscape pages oriented correctly.',
    tool: '/resize-pdf',
    toolLabel: 'Resize PDF pages',
    category: 'PDF PAGE SIZE GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Changing page size is different from changing print settings',
        paragraphs: [
          'A viewer can scale a PDF only when it is printed, but that does not necessarily rewrite the PDF page dimensions. Adobe Acrobat, for example, offers Fit and other page-sizing options in the Print dialog.',
          '1into1 Resize PDF creates a new PDF whose pages use the selected target size, so the standardized page dimensions travel with the downloaded file.'
        ]
      },
      {
        title: 'Choose A4 or Letter as the target standard',
        paragraphs: [
          'Select A4 when the receiving workflow requires the ISO-style page size, or US Letter when that is the required paper format. The tool also supports Legal, A3 and A5.',
          'A4 and Letter do not have the same proportions, so a proportional fit cannot simultaneously fill both dimensions without either leaving margins or cropping or distorting content.'
        ]
      },
      {
        title: 'Fit to Page preserves the source proportions',
        paragraphs: [
          'Fit to Page calculates one proportional scale factor so the entire source page fits inside the target dimensions, then centers the result.',
          'This avoids stretching, but a thin white band can remain on one axis when the source and target page shapes differ.'
        ]
      },
      {
        title: 'Keep landscape pages landscape when needed',
        paragraphs: [
          'With Auto-Detect Orientation enabled, a landscape source page uses the landscape version of the selected target size while portrait pages use portrait orientation.',
          'That is useful for mixed documents containing portrait letters and landscape spreadsheets or diagrams.'
        ]
      },
      {
        title: 'Check whether the file stayed vector-based',
        paragraphs: [
          'For clean PDFs, 1into1 embeds and scales the original PDF page into the new target page, preserving vector content through the normal path.',
          'Complex or protected PDFs can use a rendered-image compatibility fallback instead. Reopen the result and test text selection when selectable vector text matters to your workflow.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Adjust page size for printing', url: 'https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/page-size.html', detail: 'Adobe documents Fit, Actual Size, Shrink Oversized Pages and Custom Scale as print-time page-sizing options.' },
      { label: 'Adobe Acrobat — Print PDFs with mixed page sizes', url: 'https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/mixed-sizes.html', detail: 'Adobe documents workflows for PDFs containing mixed Letter, Legal and other page sizes.' }
    ]
  },
  {
    slug: 'pdf-resize-fit-vs-center-vs-stretch',
    title: 'Resize PDF: Fit to Page vs Center Original vs Stretch',
    description: 'Understand the three PDF resize placement modes: proportional fit, original-size centering, and full-page stretching, including their trade-offs.',
    tool: '/resize-pdf',
    toolLabel: 'Open Resize PDF',
    category: 'PDF PAGE SIZE GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Fit to Page scales proportionally',
        paragraphs: [
          'Fit uses the smaller of the horizontal and vertical scale ratios, so the complete source page fits inside the target page without changing its aspect ratio.',
          'Because the proportions of formats such as A4 and Letter differ, proportional fit can leave margins on two sides. That is expected rather than a failed resize.'
        ]
      },
      {
        title: 'Center Original does not scale the content',
        paragraphs: [
          'Center Original places the source page at its existing width and height in the middle of the new target page.',
          'When the target page is larger, this can add surrounding space. When the target is smaller, parts of the original can extend beyond the new page boundary and become clipped from view.'
        ]
      },
      {
        title: 'Fill Page stretches to both target dimensions',
        paragraphs: [
          'Fill Page sets the source width to the target width and the source height to the target height independently.',
          'That removes the proportional-fit margins, but it can make circles oval, alter image proportions and change the apparent shape of text or diagrams.'
        ]
      },
      {
        title: 'Resize and crop solve different problems',
        paragraphs: [
          'Resizing creates a new target page size and places or scales the existing page content inside it. Cropping changes the visible page boundary around existing content.',
          'If the goal is standard paper dimensions such as A4 or Letter, use Resize. If the goal is trimming excess margins or showing a smaller region of the existing page, use Crop.'
        ]
      },
      {
        title: 'Compare the output against the source',
        paragraphs: [
          'After resizing, inspect pages with edge-to-edge graphics, forms, barcodes or scale-sensitive drawings. Fit can add margins, Center can clip oversized pages, and Stretch can distort proportions.',
          'Adobe’s print sizing guidance similarly separates Fit from Actual Size and other scaling choices because each option changes how content relates to the paper boundary.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Adjust page size for printing', url: 'https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/page-size.html', detail: 'Explains Fit, Actual Size, Shrink Oversized Pages and Custom Scale and the trade-offs between fitting and clipping.' },
      { label: 'Adobe Acrobat — Print settings', url: 'https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/print-settings.html', detail: 'Documents automatic portrait/landscape handling for mixed-layout documents.' }
    ]
  },
  {
    slug: 'how-to-convert-pdf-to-grayscale',
    title: 'How to Convert a PDF to Grayscale for Printing',
    description: 'Turn a colour PDF into smooth grayscale locally, preserve tonal differences in photos and diagrams, and understand what changes in the output.',
    tool: '/grayscale-pdf',
    toolLabel: 'Convert PDF to grayscale',
    category: 'PDF PRINTING GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Grayscale keeps shades between black and white',
        paragraphs: [
          'Grayscale does not mean that every pixel becomes only black or white. It removes colour while retaining different brightness levels as shades of gray.',
          'Adobe makes the same distinction: grayscale preserves tonal transitions and detail, while pure black-and-white uses only two tones.'
        ]
      },
      {
        title: 'Use grayscale for photos, diagrams and shaded documents',
        paragraphs: [
          'When a PDF contains photographs, gradients, shaded tables or colour-coded diagrams that still need tonal separation after colour is removed, Smooth Grayscale is usually the safer starting point.',
          'The first-page preview lets you inspect the result before converting the whole document.'
        ]
      },
      {
        title: '1into1 converts the rendered page, not the original vector colours',
        paragraphs: [
          'The tool renders each PDF page, converts every rendered pixel to a luminance-based gray value, and then writes the transformed page into a new PDF.',
          'This makes the visible grayscale appearance permanent in the downloaded copy, but the result is image-based rather than a vector-preserving colour-space rewrite.'
        ]
      },
      {
        title: 'Selectable text does not survive the grayscale conversion',
        paragraphs: [
          'Because each page is rebuilt from a JPEG image, selectable text, OCR text layers, links and other interactive page structures are not preserved as normal PDF objects.',
          'Keep the original PDF if you need search, copy-and-paste, editable forms or original vector content.'
        ]
      },
      {
        title: 'Check the final file before printing',
        paragraphs: [
          'Review several pages containing fine lines, light text, photographs and charts. Tonal detail can look different on paper than it does on a screen.',
          'If you actually need a hard photocopy look with no gray tones, switch to Pure B&W rather than assuming grayscale and black-and-white are identical.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — How to make a PDF black and white', url: 'https://www.adobe.com/uk/acrobat/resources/pdf-to-greyscale.html', detail: 'Adobe distinguishes grayscale from pure black-and-white and explains why grayscale retains tonal detail.' },
      { label: 'Adobe Acrobat India — Convert PDF to black and white', url: 'https://www.adobe.com/in/acrobat/roc/blog/convert-pdf-to-black-and-white.html', detail: 'Discusses grayscale and black-and-white conversion for print-oriented PDF workflows.' }
    ]
  },
  {
    slug: 'grayscale-vs-black-and-white-pdf',
    title: 'Grayscale vs Black and White PDF: What Is the Difference?',
    description: 'Understand smooth grayscale versus thresholded two-tone black-and-white output, when to use each, and how the threshold affects a photocopy-style PDF.',
    tool: '/grayscale-pdf',
    toolLabel: 'Choose grayscale or B&W',
    category: 'PDF PRINTING GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Grayscale uses many gray tones',
        paragraphs: [
          'A grayscale page can represent dark gray, medium gray, light gray and many intermediate levels between black and white.',
          'That tonal range helps retain detail in photographs, shaded charts, scanned signatures and anti-aliased text edges.'
        ]
      },
      {
        title: 'Pure black and white uses only two pixel values',
        paragraphs: [
          'Pure B&W is a threshold operation. Each rendered pixel is measured for brightness and then assigned either black or white.',
          'There are no intermediate gray tones, so the result looks more like a high-contrast photocopy than a grayscale photograph.'
        ]
      },
      {
        title: 'The threshold controls what becomes black',
        paragraphs: [
          'In 1into1 Pure B&W mode, pixels darker than the selected threshold become black and lighter pixels become white. The control ranges from 50 to 200 and defaults to 135.',
          'Lower values make fewer pixels black and can thin text. Higher values darken more of the page, which can help faint scans but may also swallow light details.'
        ]
      },
      {
        title: 'Choose based on the source document',
        paragraphs: [
          'Use Smooth Grayscale when photographs, soft shading or tonal differences matter. Use Pure B&W when you want high-contrast text-and-line output and can accept loss of gray detail.',
          'Preview page 1 and inspect the final file because no single threshold is ideal for every scanner, background tone or document type.'
        ]
      },
      {
        title: 'Both modes create an image-based PDF',
        paragraphs: [
          'The current 1into1 workflow renders the source pages and rebuilds the output using JPEG-backed page images in both modes.',
          'The distinction is therefore about the pixel transform: grayscale keeps intermediate gray values, while Pure B&W reduces those rendered pixels to black or white.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — How to make a PDF black and white', url: 'https://www.adobe.com/uk/acrobat/resources/pdf-to-greyscale.html', detail: 'Explains the difference between grayscale tonal depth and two-tone black-and-white output.' },
      { label: 'Smallpdf — Print PDFs in black and white', url: 'https://smallpdf.com/blog/print-pdfs-black-white-quick-guide', detail: 'Provides a recent practical explanation of grayscale versus pure black-and-white output.' }
    ]
  },
  {
    slug: 'how-to-make-pdf-dark-mode-permanent',
    title: 'How to Make a PDF Dark Mode Permanently',
    description: 'Create a downloadable dark-reading copy that stays dark in other PDF viewers, and understand how that differs from a viewer-only dark theme.',
    tool: '/dark-mode-pdf',
    toolLabel: 'Convert PDF to dark mode',
    category: 'PDF READING GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Viewer dark mode and a dark PDF are not the same thing',
        paragraphs: [
          'A PDF viewer can change its own interface or apply accessibility colours while leaving the PDF file itself unchanged. Adobe Acrobat, for example, offers display themes and a Replace Document Colors accessibility preference.',
          'That is useful when you only need a different appearance on one device. It does not necessarily create a new PDF whose pages are permanently dark.'
        ]
      },
      {
        title: 'A permanent dark copy changes the rendered pages',
        paragraphs: [
          '1into1 Dark Mode renders each PDF page, applies the selected colour transformation and writes the transformed page back into a new PDF.',
          'Because the recoloured pixels are part of the downloaded output, the dark appearance travels with that copy when it is opened in another normal PDF viewer.'
        ]
      },
      {
        title: 'Choose a mode before converting the whole document',
        paragraphs: [
          'OLED Pitch Black is designed around strong black backgrounds and soft light text, Classic Inversion creates an RGB negative, and Warm Sepia creates an amber-toned reading copy.',
          'Use the first-page preview to see how the selected mode affects text, photographs, charts and coloured highlights before running the full conversion.'
        ]
      },
      {
        title: 'The converted copy becomes image-based',
        paragraphs: [
          'The dark-mode workflow renders each page and encodes the transformed result as a JPEG image inside a new PDF page. That means the output prioritizes the recoloured visual appearance rather than preserving selectable text or interactive PDF structure.',
          'Keep the original PDF when you still need search, copy-and-paste, form fields, links or the untouched original colours.'
        ]
      },
      {
        title: 'Verify the final PDF before relying on it',
        paragraphs: [
          'Reopen the converted file and check several pages, especially pages containing photographs, coloured diagrams or light-on-light content.',
          'A colour transform that works well for a mostly black-and-white study document may be less suitable for a photo-heavy report, so retain the original as the authoritative copy.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Change display themes', url: 'https://helpx.adobe.com/acrobat/desktop/get-started/preferences-and-settings/change-display.html', detail: 'Adobe documents application display themes as a viewing-interface preference.' },
      { label: 'Adobe Acrobat Reader — Accessibility features', url: 'https://helpx.adobe.com/reader/desktop/accessibility-features.html', detail: 'Documents Replace Document Colors as a viewer accessibility preference for text and background colours.' }
    ]
  },
  {
    slug: 'invert-pdf-colors-vs-oled-vs-sepia',
    title: 'Invert PDF Colors vs OLED Dark Mode vs Sepia',
    description: 'Compare classic RGB inversion, OLED pitch-black processing and warm sepia so you can choose the right PDF colour transformation for reading.',
    tool: '/dark-mode-pdf',
    toolLabel: 'Try PDF Dark Mode',
    category: 'PDF READING GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Classic inversion flips every RGB colour',
        paragraphs: [
          'Classic Inversion applies a direct RGB negative to every rendered pixel: each red, green and blue channel is replaced by its opposite value.',
          'That can turn black text on white into light text on dark, but it also inverts photographs, coloured charts, logos and highlights.'
        ]
      },
      {
        title: 'OLED Pitch Black uses luminance thresholds',
        paragraphs: [
          '1into1 OLED mode is not the same formula as a simple RGB negative. Very bright pixels are mapped to black, very dark pixels become soft white, and mid-range pixels are inverted.',
          'The goal is a stronger black-background reading copy for documents where the main content is dark text on light pages. Coloured illustrations can still change significantly.'
        ]
      },
      {
        title: 'Warm Sepia changes the page to amber tones',
        paragraphs: [
          'Sepia mode applies a standard sepia-style colour transform to each rendered pixel rather than turning the page black.',
          'It is useful when you want a warmer reading copy but do not want a full negative-style appearance.'
        ]
      },
      {
        title: 'All three modes affect the whole rendered page',
        paragraphs: [
          'The transformation is applied after the PDF page is rendered, so text, images, diagrams, backgrounds and other visible page content are transformed together.',
          'There is no promise that photographs or brand colours remain faithful to the original. Use the preview and inspect the downloaded copy.'
        ]
      },
      {
        title: 'These modes create a new image-based PDF',
        paragraphs: [
          'The transformed page is encoded as JPEG and placed into a new PDF page. This makes the visual colour change permanent in the output but removes normal text selection and searchability.',
          'If you only want a temporary viewing preference while keeping the source PDF untouched and selectable, a viewer accessibility setting such as Acrobat Replace Document Colors may be a better fit.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat Reader — Replace Document Colors', url: 'https://helpx.adobe.com/reader/desktop/accessibility-features.html', detail: 'Shows a viewer-level alternative for applying high-contrast text and background colours without rewriting the PDF pages.' },
      { label: 'Adobe Acrobat — Change display themes', url: 'https://helpx.adobe.com/acrobat/desktop/get-started/preferences-and-settings/change-display.html', detail: 'Explains Acrobat interface themes, which are distinct from permanently recolouring PDF page content.' }
    ]
  },
  {
    slug: 'how-to-edit-pdf-title-author-keywords',
    title: 'How to Edit PDF Title, Author, Subject and Keywords',
    description: 'Change selected PDF document properties locally, understand what each metadata field means, and know what metadata editing does not remove.',
    tool: '/edit-metadata',
    toolLabel: 'Edit PDF metadata',
    category: 'PDF METADATA GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'PDF metadata is separate from the visible page',
        paragraphs: [
          'A PDF can store descriptive document properties such as Title, Author, Subject and Keywords separately from the text and images you see on the page.',
          'Adobe Acrobat exposes these values in Document Properties. Changing them can correct an outdated title, wrong author name or publishing keywords without intentionally editing the visible page content.'
        ]
      },
      {
        title: 'Review the existing values before changing them',
        paragraphs: [
          'Open the PDF in 1into1 Edit Metadata and inspect the four supported fields: Title, Author, Subject and Keywords.',
          'The editor pre-fills the values it can read so you can correct only the properties that need to change rather than rewriting the whole document identity.'
        ]
      },
      {
        title: 'Save the selected document properties',
        paragraphs: [
          'Enter the new values and save an updated copy. The metadata writer updates the standard PDF document-information fields and sets a new modification date.',
          'When the PDF already contains a readable standard XMP packet, 1into1 also attempts to synchronize the matching core title, author, subject and keyword values while preserving unrelated XMP properties.'
        ]
      },
      {
        title: 'Metadata editing is not the same as removing hidden data',
        paragraphs: [
          'Changing Title or Author does not remove comments, attachments, forms, JavaScript, bookmarks, hidden text or other document structures.',
          'If your goal is privacy before external sharing rather than correcting document properties, use Deep Sanitize instead of assuming a metadata editor cleans the entire PDF.'
        ]
      },
      {
        title: 'Check the downloaded copy',
        paragraphs: [
          'Reopen the saved PDF and inspect its document properties in your usual viewer. Keep the original separately until you have confirmed the updated values and normal visible content.',
          'Some PDFs contain unusual or unreadable XMP structures. 1into1 avoids replacing unfamiliar XMP wholesale when it cannot synchronize it safely.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Document properties and metadata overview', url: 'https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-pdf-properties/pdf-properties.html', detail: 'Adobe documents PDF Description properties including Title, Author, Subject, Keywords and additional metadata.' },
      { label: 'Adobe Acrobat — About redacting and sanitizing PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redacting-sanitizing.html', detail: 'Distinguishes document metadata from broader hidden information that may require sanitization.' }
    ]
  },
  {
    slug: 'pdf-metadata-editor-vs-deep-sanitize',
    title: 'PDF Metadata Editor vs Deep Sanitize: What Gets Removed?',
    description: 'Understand the difference between changing selected PDF properties and rebuilding a PDF to remove broader hidden and interactive document data before sharing.',
    tool: '/sanitize-pdf',
    toolLabel: 'Deep sanitize a PDF',
    category: 'PDF PRIVACY GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A metadata editor changes selected document properties',
        paragraphs: [
          'Use Edit Metadata when the PDF is otherwise correct and you only need to change Title, Author, Subject or Keywords.',
          'That workflow preserves the document as a normal PDF and does not intentionally strip the rest of its structure simply because one descriptive field was changed.'
        ]
      },
      {
        title: 'Hidden PDF data can exist outside those four fields',
        paragraphs: [
          'Adobe lists many kinds of potentially hidden information in PDFs, including metadata, comments, hidden layers, attachments, form data, bookmarks, links, actions and JavaScript.',
          'That is why clearing an Author field is not equivalent to sanitizing a document before distribution.'
        ]
      },
      {
        title: '1into1 Deep Sanitize rebuilds visible pages into a fresh PDF',
        paragraphs: [
          'Deep Sanitize renders the visible appearance of each page, then creates a brand-new PDF from those clean page images instead of carrying the source document object graph forward.',
          'The output intentionally removes selectable or OCR text layers and interactive structures along with metadata. It also clears newly generated document-info identifiers before saving the final copy.'
        ]
      },
      {
        title: 'The privacy trade-off is loss of interactivity and selectable text',
        paragraphs: [
          'Because Deep Sanitize creates image-based pages, selectable text, form fields, comments, attachments, bookmarks, scripts and similar interactive features do not survive as working PDF structures.',
          'Use it when removing hidden and interactive data matters more than preserving those features. Keep the original if you still need editable forms or searchable text.'
        ]
      },
      {
        title: 'Visible secrets still require redaction',
        paragraphs: [
          'Sanitization is not a substitute for covering confidential information that is visibly printed on the page. A name, account number or paragraph that is part of the visible page appearance will remain visible in the sanitized page image.',
          'Use Permanent Redaction for visible confidential content, and Deep Sanitize when you also need to remove hidden and interactive document data.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Sanitize PDFs and remove hidden content', url: 'https://helpx.adobe.com/ca/acrobat/desktop/protect-documents/redact-pdfs/sanitize.html', detail: 'Adobe describes sanitization as removing metadata, comments, hidden layers and other hidden information before sharing.' },
      { label: 'Adobe Acrobat — About redacting and sanitizing PDFs', url: 'https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redacting-sanitizing.html', detail: 'Explains the difference between redaction of visible content and sanitization of hidden document data.' }
    ]
  },
  {
    slug: 'compare-two-pdf-versions-side-by-side',
    title: 'How to Compare Two PDF Versions Side by Side',
    description: 'Review an original PDF and a revised PDF page by page with side-by-side viewing, zoom and local browser processing.',
    tool: '/compare-pdf',
    toolLabel: 'Compare two PDFs',
    category: 'PDF COMPARISON GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Use side-by-side view for broad document review',
        paragraphs: [
          'Side-by-side comparison is useful when you need to read an original PDF next to a revised copy and visually check page layout, wording, signatures, stamps, diagrams or other visible changes.',
          '1into1 loads both files locally and displays the corresponding pages together so you can move through the document without uploading the PDFs to a normal server-side comparison service.'
        ]
      },
      {
        title: 'Start with the same page in both documents',
        paragraphs: [
          'Choose the original PDF as Document A and the revised PDF as Document B, then begin the comparison. Page navigation follows the larger of the two page counts, so extra or missing pages can still be reviewed.',
          'If one document has been reordered substantially, visual page-by-page comparison becomes harder because page 5 in one file may no longer correspond to page 5 in the other.'
        ]
      },
      {
        title: 'Use zoom for small visual details',
        paragraphs: [
          'Increase zoom when you need to inspect fine changes such as shifted text blocks, altered figures, signature placement, margins or small formatting differences.',
          'A visual review can reveal changes that are difficult to notice when opening the two PDFs in separate tabs and switching back and forth.'
        ]
      },
      {
        title: 'Switch to overlay when alignment matters',
        paragraphs: [
          'When both versions use nearly the same page geometry, overlay mode can make moved or changed elements easier to see because the rendered pages are combined into one high-contrast comparison view.',
          'Use side by side for reading and context, then switch to overlay for a closer visual check of pages that should align.'
        ]
      },
      {
        title: 'Visual comparison is not a semantic legal diff',
        paragraphs: [
          '1into1 Compare PDF is a visual review tool. It does not classify insertions, deletions or legal wording changes, and it does not generate a formal change report.',
          'Adobe Acrobat Pro provides a more advanced Compare Files workflow that analyzes document differences and can produce a detailed comparison report. Use the workflow that matches the level of review you need.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Compare two versions of a PDF file', url: 'https://helpx.adobe.com/acrobat/using/compare-documents.html', detail: 'Documents Acrobat Pro comparison, side-by-side result review and automated difference reporting.' },
      { label: 'MDN — Canvas compositing operations', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation', detail: 'Documents browser canvas compositing modes used to combine rendered images for visual comparison.' }
    ]
  },
  {
    slug: 'pdf-overlay-comparison-vs-text-diff',
    title: 'PDF Overlay Comparison vs Text Diff: What Is the Difference?',
    description: 'Understand the difference between visual pixel-overlay comparison and semantic text-difference analysis when reviewing two PDF versions.',
    tool: '/compare-pdf',
    toolLabel: 'Open Compare PDF',
    category: 'PDF COMPARISON GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A visual overlay compares rendered pages',
        paragraphs: [
          'A visual overlay starts from how each PDF page looks after rendering. The two page images are combined so areas that match behave differently from areas whose pixels differ.',
          'This approach is useful for layout changes, moved elements, altered graphics, signatures, stamps and other visible differences.'
        ]
      },
      {
        title: '1into1 uses a difference compositing view',
        paragraphs: [
          'In overlay mode, 1into1 renders both PDF pages and combines them using the browser canvas difference compositing operation together with an adjustable blend level.',
          'MDN describes difference compositing as subtracting the corresponding layer colors so changed areas become visually distinct. The result is a visual aid rather than a text-aware change report.'
        ]
      },
      {
        title: 'A text diff analyses document content differently',
        paragraphs: [
          'A semantic or text comparison tries to understand changed text, formatting or document structure rather than only comparing the rendered appearance.',
          'Adobe Acrobat Pro, for example, can analyze two PDF versions and report categories of differences. That is a different capability from a browser-local visual overlay.'
        ]
      },
      {
        title: 'Overlay works best when pages align',
        paragraphs: [
          'Visual overlays are easiest to interpret when the two versions have similar page dimensions, page order and overall layout. If content reflows heavily, many pixels can change even when the underlying meaning changed only slightly.',
          'For heavily restructured documents, side-by-side reading may be more useful than relying on the overlay alone.'
        ]
      },
      {
        title: 'Use both views for different questions',
        paragraphs: [
          'Use side by side when you want to read both versions in context. Use overlay when you want to spot visual movement or changed appearance on corresponding pages.',
          'If you need an automated legal redline or a machine-generated list of wording changes, use a dedicated semantic comparison system rather than treating a visual overlay as equivalent.'
        ]
      }
    ],
    sources: [
      { label: 'MDN — globalCompositeOperation', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation', detail: 'Defines the Canvas 2D difference compositing operation used for high-contrast visual blending.' },
      { label: 'Adobe Acrobat — Compare two versions of a PDF file', url: 'https://helpx.adobe.com/acrobat/using/compare-documents.html', detail: 'Explains automated PDF difference analysis, comparison reports and side-by-side result review in Acrobat Pro.' }
    ]
  },
  {
    slug: 'extract-images-from-pdf-without-screenshots',
    title: 'How to Extract Images from a PDF Without Taking Screenshots',
    description: 'Recover embedded raster images from a PDF at their decoded pixel dimensions instead of cropping or screenshotting the visible page.',
    tool: '/extract-images',
    toolLabel: 'Extract embedded PDF images',
    category: 'PDF IMAGE GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A PDF page can contain separate image objects',
        paragraphs: [
          'A PDF page is not always one flat picture. It can combine text, vector graphics and sampled raster images as separate objects positioned on the page.',
          'Adobe’s PDF reference describes image XObjects as sampled visual images such as photographs. That means a photograph visible inside a report may exist as its own raster object rather than only as part of a page screenshot.'
        ]
      },
      {
        title: 'Extract the embedded raster image instead of the page',
        paragraphs: [
          'A screenshot captures whatever pixels are currently rendered on screen, including page background, text and surrounding layout. Embedded-image extraction targets the raster image object itself.',
          '1into1 scans the PDF page operations for supported embedded and inline image objects, decodes them and exports the extracted bitmap as a PNG.'
        ]
      },
      {
        title: 'What full resolution means in this tool',
        paragraphs: [
          'For a successfully decoded image, the extractor keeps the detected bitmap width and height and creates the PNG at those pixel dimensions. It does not intentionally downscale the image to the size at which it happened to appear on the PDF page.',
          'The output is not necessarily the original compressed JPEG or WebP byte stream. The image is decoded and written as PNG, so “full resolution” here refers to the extracted bitmap dimensions rather than preservation of the original file encoding.'
        ]
      },
      {
        title: 'Vector graphics are different',
        paragraphs: [
          'Logos, diagrams or illustrations in a PDF can be drawn as vector instructions instead of stored as raster images. A raster-image extractor may therefore find nothing even though the page visibly contains graphics.',
          'If you need the complete visible page, including vector artwork and text, use PDF to Image to render the whole page instead.'
        ]
      },
      {
        title: 'Download individually or as a ZIP',
        paragraphs: [
          'After scanning, review the extracted gallery and pixel dimensions. Download one PNG when you need a specific figure, or package all found images into a ZIP.',
          'For sensitive reports or documents, local browser processing also avoids the ordinary workflow of uploading the source PDF to a remote extraction service.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Export images from PDFs', url: 'https://helpx.adobe.com/in/acrobat/using/exporting-pdfs-file-formats.html', detail: 'Adobe distinguishes exporting individual raster images from exporting complete PDF pages and notes that vector objects are not raster-image exports.' },
      { label: 'Adobe PDF Reference 1.5 — External Objects', url: 'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.5_v6.pdf', detail: 'Defines image XObjects as sampled visual images such as photographs stored as self-contained graphics objects.' }
    ]
  },
  {
    slug: 'extract-images-vs-pdf-to-image',
    title: 'Extract Images vs PDF to Image: Which One Do You Need?',
    description: 'Choose between recovering embedded raster images from inside a PDF and rendering each complete PDF page as JPG, PNG or WebP.',
    tool: '/extract-images',
    toolLabel: 'Extract images from a PDF',
    category: 'PDF IMAGE GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Extract Images targets objects inside the page',
        paragraphs: [
          'Use Extract Images when you want photographs, figures or other supported raster images that are embedded inside the PDF.',
          'The result is a set of PNG files representing the decoded raster objects the extractor can identify, rather than a picture of every PDF page.'
        ]
      },
      {
        title: 'PDF to Image renders the entire page',
        paragraphs: [
          'Use PDF to Image when you need each page exactly as it appears visually, including text, vector drawings, backgrounds, annotations that render visibly and embedded pictures.',
          'That workflow converts the composed page into a JPG, PNG or WebP image. It is the right choice for page thumbnails, presentation slides, social sharing or archiving page appearance.'
        ]
      },
      {
        title: 'Why screenshots are a third, less precise workflow',
        paragraphs: [
          'A screenshot depends on the current display size and can include browser chrome, margins or a scaled page preview. It may also capture far fewer pixels than an embedded photograph contains.',
          'If the goal is a photo from inside the PDF, extraction is usually more direct. If the goal is the complete page, page rendering is more reproducible than a manual screenshot.'
        ]
      },
      {
        title: 'Not every visible graphic is an extractable image',
        paragraphs: [
          'PDF pages can contain vector shapes, text and raster images together. Adobe documents raster images and vector objects as different kinds of page content.',
          'If a logo or diagram is vector-based, Extract Images may not return it as a bitmap. Rendering the page with PDF to Image will still capture the visible vector artwork as part of the page image.'
        ]
      },
      {
        title: 'Choose based on what you want to reuse',
        paragraphs: [
          'Choose Extract Images for individual embedded raster assets. Choose PDF to Image for whole-page output.',
          'If you are unsure, scan with Extract Images first. When no suitable bitmap is found, switch to PDF to Image for a rendered page copy.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Export images from PDFs', url: 'https://helpx.adobe.com/in/acrobat/using/exporting-pdfs-file-formats.html', detail: 'Separates exporting individual images from saving complete PDF pages to an image format.' },
      { label: 'Adobe Acrobat Reader — Copy content from PDFs', url: 'https://helpx.adobe.com/reader/desktop/copy-content-pdfs.html', detail: 'Explains selecting individual images and separately describes the Snapshot tool for copying a rendered page area as an image.' }
    ]
  },
  {
    slug: 'how-to-straighten-crooked-scanned-pdf',
    title: 'How to Straighten a Crooked Scanned PDF',
    description: 'Fix a consistently tilted scanned PDF by estimating the skew from a page preview, fine-tuning the angle and applying the correction locally in your browser.',
    tool: '/deskew-pdf',
    toolLabel: 'Straighten a scanned PDF',
    category: 'SCANNED PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Deskew fixes small tilt, not page orientation',
        paragraphs: [
          'Deskewing is for pages that lean by a few degrees because the paper entered a scanner or camera slightly crooked. A page that is sideways by 90 degrees is an orientation problem and should be rotated instead.',
          '1into1 Deskew PDF is designed for fine correction between -10° and +10°, with a live first-page preview before you create the output.'
        ]
      },
      {
        title: 'Estimate the angle from the first-page preview',
        paragraphs: [
          'Choose the PDF and use Auto-Detect Tilt to estimate a correction from the rendered first page. The preview rotates immediately so you can see whether the text baseline looks level.',
          'Auto-Detect currently evaluates the first-page preview rather than independently measuring every page. This works best when the scanner introduced a similar tilt throughout the document.'
        ]
      },
      {
        title: 'Fine-tune before applying the correction',
        paragraphs: [
          'If the automatic estimate is slightly off, adjust the angle manually in 0.2-degree steps. Use horizontal text lines, table rules or page edges as visual references.',
          'Avoid over-correcting. The goal is to make the document level, not to rotate a page more than necessary.'
        ]
      },
      {
        title: 'Check several pages after straightening',
        paragraphs: [
          'The selected angle is applied across the PDF, so reopen the result and inspect pages from the beginning, middle and end of the document.',
          'If different pages lean in different directions, one document-wide angle may not be appropriate. In that case, separate the affected pages or use a workflow that supports page-by-page correction.'
        ]
      },
      {
        title: 'Keep the original until the output is verified',
        paragraphs: [
          'For ordinary unprotected PDFs, 1into1 can apply the correction to existing page content without intentionally re-encoding the normal vector/text content. More complex files may require a compatibility path.',
          'Keep the original scan separately until you have checked page edges, text, images and any important document details in the straightened copy.'
        ]
      }
    ],
    sources: [
      { label: 'Tesseract OCR — Improving the quality of the output', url: 'https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html', detail: 'Explains rotation and deskewing for scanned pages and notes that excessive skew can significantly reduce line-segmentation quality.' },
      { label: 'ABBYY FineReader Engine — Skew correction', url: 'https://support.abbyy.com/hc/en-us/articles/360003293640-Skew-correction-deskew-in-FineReader-Engine', detail: 'Describes skew in scanner/camera images and deskewing as a preprocessing step for OCR quality.' }
    ]
  },
  {
    slug: 'deskew-pdf-before-ocr',
    title: 'Deskew PDF Before OCR: Why Straight Text Lines Matter',
    description: 'Learn when to straighten a tilted scan before OCR, how skew affects text-line recognition, and when deskewing is unnecessary.',
    tool: '/deskew-pdf',
    toolLabel: 'Deskew before OCR',
    category: 'OCR PREPARATION GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'OCR works from page image geometry as well as characters',
        paragraphs: [
          'OCR does not only identify individual letter shapes. It also has to segment the page into lines, words and regions so the recognised characters can be assembled in the correct order.',
          'When text lines are noticeably tilted, that layout analysis becomes harder. Tesseract documentation specifically warns that excessive skew can significantly reduce line-segmentation quality.'
        ]
      },
      {
        title: 'Straighten the scan before recognising text',
        paragraphs: [
          'If the pages share a small consistent tilt, straighten the PDF first and then run OCR on the corrected copy. The aim is to make text lines horizontal enough for the OCR engine to analyse them cleanly.',
          'ABBYY also treats skew correction as document-image preprocessing and describes deskewing skewed scanner or camera images to improve OCR quality.'
        ]
      },
      {
        title: 'Do not confuse deskew with 90-degree rotation',
        paragraphs: [
          'Deskew addresses small angular errors such as a page leaning 2 degrees. A page that is sideways or upside down needs orientation correction instead.',
          'Use Rotate PDF for quarter-turn orientation problems, and Deskew PDF for fine tilt correction.'
        ]
      },
      {
        title: 'One angle is best for consistently skewed documents',
        paragraphs: [
          '1into1 estimates tilt from the first-page preview and applies the selected angle across the PDF. That is appropriate when a scanner feeder produced a consistent lean across the batch.',
          'If every page has a different tilt, verify the output carefully because a single correction cannot independently deskew each page.'
        ]
      },
      {
        title: 'Run OCR only after the page alignment looks right',
        paragraphs: [
          'After straightening, open the corrected PDF and inspect several text lines. Then use OCR PDF to create the searchable text layer.',
          'Deskewing does not guarantee perfect OCR. Resolution, contrast, noise, font shape and scan quality still affect recognition, so verify important names and numbers against the visible document.'
        ]
      }
    ],
    sources: [
      { label: 'Tesseract OCR — Improving the quality of the output', url: 'https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html', detail: 'Documents rotation/deskewing as image preprocessing and explains the effect of skew on line segmentation and OCR quality.' },
      { label: 'ABBYY FineReader PDF User Guide', url: 'https://help.abbyy.com/assets/en-us/finereader/16/Users_Guide.pdf', detail: 'Lists deskewing and page-orientation correction among preprocessing steps used when scan defects reduce OCR quality.' }
    ]
  },
  {
    slug: 'how-to-print-pdf-as-booklet',
    title: 'How to Print a PDF as a Booklet: Double-Sided, Fold & Staple',
    description: 'Turn a normal PDF into saddle-stitch booklet spreads, understand why pages are reordered, and check duplex printing before folding and stapling.',
    tool: '/booklet-pdf',
    toolLabel: 'Create a printable booklet',
    category: 'PDF PRINTING GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'A booklet needs printer spreads, not normal page order',
        paragraphs: [
          'A standard PDF usually stores pages in reading order. A folded booklet has to place different page numbers beside each other on the physical sheet so that the pages return to normal order after double-sided printing and folding.',
          'This rearrangement is called booklet imposition. The first and last pages share a sheet, and the remaining pages are paired around them according to the saddle-stitch sequence.'
        ]
      },
      {
        title: 'Choose the output sheet size before imposing',
        paragraphs: [
          '1into1 Booklet PDF can create A4 Landscape or US Letter Landscape printer spreads. Each output side contains two imposed document pages positioned for a center fold.',
          'Use the paper format that matches the sheets you intend to print on, then generate the imposed PDF rather than resizing the document after imposition.'
        ]
      },
      {
        title: 'Why blank pages may be added',
        paragraphs: [
          'A folded saddle-stitch booklet uses four document pages per physical sheet: two on the front and two on the back. That means the imposed page count has to resolve into groups of four.',
          'When the source PDF does not have a multiple-of-four page count, 1into1 pads the booklet with blank pages so the final folds can still produce the correct reading order.'
        ]
      },
      {
        title: 'Print double-sided and test the binding direction',
        paragraphs: [
          'Print the imposed PDF on both sides of the sheet and use the duplex or binding setting that keeps the back side upright after the sheet is folded. Printer terminology varies, so use a one-sheet test before printing the full job.',
          'Adobe also recommends checking booklet subset and binding settings for duplex or manual two-pass booklet printing. A test print catches reversed backs or upside-down pages before paper is wasted.'
        ]
      },
      {
        title: 'Fold, staple and verify the finished booklet',
        paragraphs: [
          'After printing, keep the sheets in order, fold them through the center and staple along the fold for a simple saddle-stitched booklet.',
          'Check the cover, center spread and final page before producing multiple copies. Paper thickness, printer margins and scaling can affect the physical result even when the page order is correct.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Print booklets', url: 'https://helpx.adobe.com/acrobat/desktop/print-documents/booklets-posters-banners/print-booklets.html', detail: 'Explains booklet page arrangement, duplex or manual printing, booklet subsets and binding settings.' },
      { label: 'Adobe Acrobat — About booklet printing', url: 'https://helpx.adobe.com/in/acrobat/desktop/print-documents/booklets-posters-banners/about-booklets-printing.html', detail: 'Describes automatic booklet page ordering, two pages per sheet, folding and stapling.' }
    ]
  },
  {
    slug: 'booklet-imposition-vs-two-pages-per-sheet',
    title: 'Booklet Imposition vs Two Pages Per Sheet: What Is the Difference?',
    description: 'Learn why saddle-stitch booklet imposition changes page order while ordinary two-pages-per-sheet or N-up printing keeps normal sequence.',
    tool: '/booklet-pdf',
    toolLabel: 'Open Booklet PDF',
    category: 'PDF PRINTING GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Two pages per sheet is mainly a space-saving layout',
        paragraphs: [
          'Ordinary two-pages-per-sheet printing places multiple source pages on one sheet while generally keeping their normal reading sequence. It is useful for handouts, drafts and reducing paper use.',
          'If you simply fold an ordinary two-up printout in half, the pages will usually not appear in the correct booklet order.'
        ]
      },
      {
        title: 'Booklet imposition deliberately changes page order',
        paragraphs: [
          'A saddle-stitch booklet pairs pages according to their final physical position after printing, folding and stapling. For example, the outside sheet places the final page beside page 1 rather than placing pages 1 and 2 together.',
          'That changed sequence is the key difference between a booklet workflow and a normal N-up layout.'
        ]
      },
      {
        title: 'Booklets work in four-page groups',
        paragraphs: [
          'Each physical sheet contributes four finished booklet pages because there are two imposed pages on the front and two on the back.',
          '1into1 therefore pads the source with blank pages when necessary so the page count can be imposed into complete saddle-stitch sheets.'
        ]
      },
      {
        title: 'Use N-Up when you do not plan to fold the sheets',
        paragraphs: [
          'Choose N-Up when the goal is to fit several pages onto a sheet in a compact handout or reference layout. Choose Booklet PDF when the printed sheets will be folded through the center and read as a bound booklet.',
          'The two workflows can look similar on screen because both may show two pages side by side, but the page sequence solves a different physical printing problem.'
        ]
      },
      {
        title: 'Print settings still matter after imposition',
        paragraphs: [
          'Correct page order does not guarantee a correct physical booklet if the printer flips the back side in the wrong direction or applies unexpected scaling.',
          'Use the appropriate duplex and binding settings for your printer and make a small test copy before producing the full booklet.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat — Print booklets', url: 'https://helpx.adobe.com/acrobat/desktop/print-documents/booklets-posters-banners/print-booklets.html', detail: 'Documents booklet-specific arrangement, duplex printing and binding controls.' },
      { label: 'Adobe InDesign — Booklet printing settings', url: 'https://helpx.adobe.com/indesign/desktop/print/print-booklets/booklet-printing-settings.html', detail: 'Describes printer spreads and booklet-imposition settings such as saddle stitch, margins, spacing and bleed.' }
    ]
  },
  {
    slug: 'pdf-wont-open-corrupted-or-viewer-problem',
    title: 'PDF Won’t Open: Corrupted File or Viewer Problem?',
    description: 'Diagnose a PDF that will not open by separating file corruption from viewer, password, security and incomplete-download problems before attempting repair.',
    tool: '/repair-pdf',
    toolLabel: 'Try Repair PDF',
    category: 'PDF REPAIR GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'First confirm that the PDF itself is the problem',
        paragraphs: [
          'A PDF that will not open is not automatically corrupted. The issue can also come from the viewer, browser, local security settings, a password requirement or an incomplete download.',
          'Try the file in another trusted PDF reader and, when possible, obtain a fresh copy from the original source before changing the document.'
        ]
      },
      {
        title: 'Re-download or recreate the file when you can',
        paragraphs: [
          'If a download stopped early or a transfer failed, the safest fix is usually to download the document again because repair software cannot recreate bytes that never arrived.',
          'If you own the source document, exporting a fresh PDF from the original application can also be more reliable than trying to recover a damaged copy.'
        ]
      },
      {
        title: 'Password and security errors are different from corruption',
        paragraphs: [
          'A password-protected PDF may be structurally healthy even though it cannot be opened without the correct password. Likewise, a viewer can block a file for security or compatibility reasons without the document being damaged.',
          'Use the error message and another trusted reader to distinguish access problems from a genuinely malformed PDF before running a repair workflow.'
        ]
      },
      {
        title: 'Use repair when the internal PDF structure is damaged',
        paragraphs: [
          'A PDF contains structural information that tells a reader where document objects are stored. If cross-reference information, trailer data or related structure becomes inconsistent, a tolerant repair process may be able to rebuild a readable copy when the underlying page data is still present.',
          '1into1 Repair PDF works locally in the browser and attempts recovery without requiring a normal server-side document upload.'
        ]
      },
      {
        title: 'Verify every repaired document',
        paragraphs: [
          'A repaired file opening successfully does not prove that every page, image, form field or piece of text survived unchanged. Inspect the beginning, middle and end of the recovered copy and verify important content.',
          'Keep the original damaged file and any known-good source separately until you are satisfied that the recovered PDF contains what you need.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe Acrobat Help — Can’t open PDF', url: 'https://helpx.adobe.com/acrobat/kb/cant-open-pdf.html', detail: 'Adobe troubleshooting guidance distinguishes corruption from viewer, password, security and application problems.' },
      { label: 'Adobe Acrobat — How to repair a PDF file', url: 'https://www.adobe.com/in/acrobat/roc/blog/repair-corrupted-pdf-file-quickly.html', detail: 'Describes common corruption symptoms, interrupted downloads and recovery or recreation options.' }
    ]
  },
  {
    slug: 'what-pdf-repair-can-and-cannot-recover',
    title: 'What PDF Repair Can and Cannot Recover',
    description: 'Understand the difference between damaged PDF structure and missing document data, what cross-reference repair can help with, and why every recovered file needs verification.',
    tool: '/repair-pdf',
    toolLabel: 'Open Repair PDF',
    category: 'PDF REPAIR GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Repair works best when the data still exists',
        paragraphs: [
          'PDF repair is most useful when the document bytes are largely present but the internal structure that connects them has become inconsistent or unreadable.',
          'If part of the file is genuinely missing because a download or copy was truncated, no repair tool can reconstruct information that is no longer present. A fresh download or original source is preferable whenever available.'
        ]
      },
      {
        title: 'Why cross-reference information matters',
        paragraphs: [
          'The PDF file format uses cross-reference information so a reader can locate indirect objects efficiently, together with trailer information that points to important document structures.',
          'Damage around these structures can make a file fail even when useful page objects remain elsewhere in the document. Rebuilding readable structure can sometimes make those surviving objects accessible again.'
        ]
      },
      {
        title: 'Use the least destructive recovery that works',
        paragraphs: [
          'A repair workflow should preserve the original document structure when possible and fall back to salvage only when a normal reconstruction cannot produce a usable PDF.',
          '1into1 uses a two-stage recovery approach: it first attempts a lossless structural rebuild and can fall back to page-stream salvage when the normal structure cannot be recovered.'
        ]
      },
      {
        title: 'Some problems are not repair problems',
        paragraphs: [
          'Password protection, unsupported viewer features, local application problems and security restrictions can prevent a PDF from opening even when the file is not corrupted.',
          'Diagnose those cases separately instead of repeatedly rewriting a healthy document.'
        ]
      },
      {
        title: 'Recovery is not the same as verification',
        paragraphs: [
          'After repair, reopen the downloaded PDF and check page count, visible content, important numbers, forms and any other information that matters to your workflow.',
          'For legal, financial or archival documents, compare the repaired copy with another known-good version whenever one is available.'
        ]
      }
    ],
    sources: [
      { label: 'Adobe PDF Reference — File Structure', url: 'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.3.pdf', detail: 'Documents the PDF header, body, cross-reference table and trailer structure used to locate document objects.' },
      { label: 'Adobe Acrobat Help — Can’t open PDF', url: 'https://helpx.adobe.com/acrobat/kb/cant-open-pdf.html', detail: 'Provides troubleshooting guidance for damaged files and other causes of PDF opening failures.' }
    ]
  },
  {
    slug: 'bates-numbering-for-legal-discovery',
    title: 'Bates Numbering for Legal Discovery: Prefixes, Padding & Placement',
    description: 'Learn how Bates identifiers are structured for document production, how prefixes and zero-padding work, and what to check before sharing a numbered PDF.',
    tool: '/bates-numbering',
    toolLabel: 'Add Bates numbers to a PDF',
    category: 'LEGAL PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'What Bates numbering is used for',
        paragraphs: [
          'Bates numbering gives pages unique sequential identifiers so lawyers, reviewers and document-production teams can refer to the same page consistently across a matter or production.',
          'The exact convention depends on the receiving party, court or production protocol. Before stamping a document set, confirm the required prefix, starting number, digit width and placement.'
        ]
      },
      {
        title: 'Choose a consistent numbering format',
        paragraphs: [
          'A Bates label commonly combines a prefix with a zero-padded sequence number, such as ACME-000001. The U.S. Department of Justice Antitrust Division recommends a consistent format across a production and describes sequence numbers of 6–8 digits as a general example.',
          '1into1 lets you set the prefix, optional suffix, starting number and digit padding so the stamped identifier matches the convention you need.'
        ]
      },
      {
        title: 'Continue the sequence deliberately',
        paragraphs: [
          'If one PDF ends at CONF-000250 and the next document should continue the same production, start the next PDF at 251 rather than resetting the sequence.',
          'Court guidance can also require continuous numbering across multiple volumes. Keep a record of the last identifier used so later documents do not create gaps or duplicate numbers.'
        ]
      },
      {
        title: 'Place the stamp where it stays readable',
        paragraphs: [
          'The Bates number should not cover source text, signatures, exhibits or other important content. Court-specific requirements can also dictate a particular margin or placement.',
          'Choose the available position and font size, then inspect the first, middle and final pages of the stamped PDF before sharing or filing it.'
        ]
      },
      {
        title: 'Review the output before production',
        paragraphs: [
          'Check that the sequence starts at the intended value, increments correctly, uses the expected prefix or suffix and remains visible on pages with different orientations or margins.',
          'If the document also needs redaction or sanitization, complete those privacy steps deliberately and keep an unchanged source copy so the production can be audited if needed.'
        ]
      }
    ],
    sources: [
      { label: 'U.S. Department of Justice Antitrust Division — Electronic Production Letter', url: 'https://www.justice.gov/atr/electronic-production-letter-attachment-1', detail: 'Describes consistent Bates-number formats and sequence-number conventions for electronic productions.' },
      { label: 'U.S. Court of Appeals for the Fourth Circuit — Bates Numbering Instructions', url: 'https://www.ca4.uscourts.gov/docs/pdfs/appendixpagination-briefcitationguide.pdf', detail: 'Provides practical Bates-numbering instructions including prefix, digit count, start number and placement guidance.' }
    ]
  },
  {
    slug: 'bates-numbering-vs-page-numbers',
    title: 'Bates Numbers vs Page Numbers: What Is the Difference?',
    description: 'Understand when ordinary PDF page numbers are enough and when Bates identifiers are more useful for legal review, document production and cross-file references.',
    tool: '/bates-numbering',
    toolLabel: 'Add Bates numbers to a PDF',
    category: 'LEGAL PDF GUIDE',
    published: '2026-09-24',
    updated: '2026-09-24',
    sections: [
      {
        title: 'Page numbers describe location',
        paragraphs: [
          'Ordinary page numbers usually tell a reader where a page sits inside one document: page 1, page 2, page 3 and so on.',
          'They are useful for navigation, reading and citation inside a single PDF, but the same page number can appear in many different files.'
        ]
      },
      {
        title: 'Bates numbers identify pages within a larger set',
        paragraphs: [
          'A Bates identifier is designed to give a page a unique reference within a document production or review set. A label such as CASE-000127 can still identify that page even when documents are split, merged or reviewed separately.',
          'That is why Bates numbering is common in discovery and document-production workflows where many files need one consistent reference system.'
        ]
      },
      {
        title: 'Prefixes and padding add context',
        paragraphs: [
          'Bates numbering can include a party or matter prefix plus a fixed-width sequence number. Zero-padding makes identifiers sort consistently and helps keep the format stable as the production grows.',
          'Ordinary pagination usually does not need that extra identity layer because it only describes position within the current document.'
        ]
      },
      {
        title: 'You can use both when the workflow requires it',
        paragraphs: [
          'A PDF can contain normal page numbers for readers and Bates identifiers for legal or production reference. They solve different problems, so one does not automatically replace the other.',
          'If both are present, choose positions that do not overlap and follow any filing or production specification supplied by the recipient.'
        ]
      },
      {
        title: 'Choose the tool based on the job',
        paragraphs: [
          'Use Page Numbers when you simply need readable pagination inside one PDF. Use Bates Numbering when pages need stable sequential identifiers for a legal, compliance or document-production workflow.',
          'When the numbering convention matters externally, the receiving court, firm or production protocol should determine the final format.'
        ]
      }
    ],
    sources: [
      { label: 'U.S. Court of Appeals for the Fourth Circuit — Brief & Appendix Requirements', url: 'https://www.ca4.uscourts.gov/AppellateProcedureGuide/Briefing/briefapxreq.html', detail: 'Shows a court workflow using Bates-style appendix pagination with prefixes and continuous numbering.' },
      { label: 'U.S. Department of Justice Antitrust Division — Electronic Production Letter', url: 'https://www.justice.gov/atr/electronic-production-letter-attachment-1', detail: 'Explains Bates numbering as a consistent identifier used in electronic document production.' }
    ]
  },
  {
    slug: 'crop-all-pdf-pages', title: 'How to crop the same margins from every PDF page',
    description: 'Apply one crop across a PDF, check mixed page layouts and understand why cropping is different from secure redaction.',
    tool: '/crop-pdf', toolLabel: 'Open PDF crop tool',
    category: 'PDF PAGE GUIDE',
    sections: [
      {title: 'Decide whether one crop fits the whole document', paragraphs: ['An all-pages crop works best when every page has similar margins and orientation. Look through the PDF first: a landscape table, a larger diagram or a page number close to an edge may need a different selection.', 'For example, a ten-page scan with the same wide white border is a good candidate for one crop. A collection of receipts with different dimensions is better handled page by page.']},
      {title: 'Set the crop using a representative page', paragraphs: ['Open the PDF in the Crop tool and position the crop box around the content you want to keep. Leave a little space around text instead of drawing exactly against the letters.', 'Use the option to apply the crop to all pages when their layouts match. For mixed layouts, set individual page crops and check each preview before generating the output.']},
      {title: 'Check the saved PDF', paragraphs: ['Download and reopen the result. Inspect the first, middle and last pages, plus any pages with tables or a different orientation. Make sure footnotes, page numbers and signatures are still visible.', 'Keep the source PDF until you have checked the complete result. If an edge is cut off, return to the original and use a larger crop area.']},
      {title: 'Cropping is not redaction', paragraphs: ['Cropping can change the visible page boundary without deleting the content outside it. Do not use it to hide account numbers, addresses or other information that must not remain recoverable.', 'Use a dedicated redaction workflow for information removal and inspect the exported copy. The distinction matters even when the cropped page looks correct in your viewer.']},
      {title: 'Cropping is not compression either', paragraphs: ['Removing visible margins does not necessarily remove the underlying page data or make the file substantially smaller. If your goal is an upload limit, crop for appearance first and then use the compressor if needed.', 'The crop tool runs on your device. On a phone, work with a manageable document size and leave the browser open until the download is ready.']}
    ]
  },
  {
    slug: 'india-pdf-upload-size-limits-2026',
    title: 'India PDF Upload Size Limits (2026): Government & Application Portals',
    description: 'A sourced 2026 directory of PDF upload-size limits published by Indian government, regulatory and application portals, with official links and practical compression guidance.',
    tool: '/compress-pdf',
    toolLabel: 'Compress a PDF to the required size',
    category: 'PDF UPLOAD LIMIT RESEARCH',
    published: '2026-09-24',
    updated: '2026-09-24',
    methodology: 'Verified on 24 September 2026 from the official pages and manuals linked below. Each row describes a specific document field or workflow, not a universal limit for the entire organisation. Portal rules can change, so the current official instruction should always take precedence.',
    datasetUrl: '/research/india-pdf-upload-size-limits-2026.csv',
    datasetLabel: 'Download upload-limit data (CSV)',
    sections: [
      {
        title: 'Why PDF upload limits vary so much',
        paragraphs: [
          'Indian application portals do not use one standard PDF limit. In the official sources reviewed for this directory, requirements range from a few hundred kilobytes to many megabytes, and the same organisation can use different limits for different document fields.',
          'That is why the correct strategy is to read the exact upload instruction first, keep the original file, and compress only as far as the destination requires. Choosing an unnecessarily tiny target can make names, stamps, signatures or scanned certificates difficult to read.'
        ]
      },
      {
        title: '200 KB to 500 KB limits are still common',
        paragraphs: [
          'The Indian Visa Online document-upload page currently specifies PDF documents between 10 KB and 500 KB. The Press Registrar General of India user manual uses a 300 KB maximum for several owner and publisher document fields, while Kerala State Medical Council instructions require supporting certificates in PDF format at a maximum of 500 KB.',
          'RRCAT also states a 500 KB PDF limit for uploaded score cards in its 2026 Ph.D. application instructions. These examples show why exact-size searches such as 300 KB and 500 KB remain useful rather than being arbitrary SEO variations.'
        ]
      },
      {
        title: '1 MB and 2 MB are common application limits',
        paragraphs: [
          'GST registration guidance lists a 1 MB maximum for the proof-of-appointment upload for an authorised signatory. A recent Passport Seva applicant-portal SOP published by an Indian mission also states a 1 MB total supporting-document limit.',
          'FSSAI recruitment pages allow a resume in PDF or Word format up to 2 MB. The NCPCR chairperson/member application requires Aadhaar and date-of-birth PDFs below 2 MB, and Maharashtra State Information Commission instructions list a 2 MB maximum upload size for its online second-appeal workflow.'
        ]
      },
      {
        title: 'Some portals allow 5 MB, 10 MB or more',
        paragraphs: [
          'Punjab Land Records currently allows an optional grievance supporting document in PDF format up to 5 MB. The Telecommunication Engineering Centre control-lab form allows PDF or DOCX supporting documents up to 10 MB.',
          'SEBI’s settlement-application portal illustrates why users must read each field separately: it allows an ITR PDF up to 20 MB while the PAN-card PDF on the same form is limited to 500 KB.'
        ]
      },
      {
        title: 'How to use this directory',
        paragraphs: [
          'Find the exact portal and document type in the downloadable dataset, open the official source, and confirm the rule is still current. Then choose the largest permitted target that meets the requirement so the document keeps as much readable detail as possible.',
          '1into1 uses 1 KB = 1,024 bytes. Some receiving systems may calculate limits differently or apply additional rules such as page count, password protection, filename restrictions or image dimensions. Leave headroom when a portal is strict and always reopen the compressed PDF before submitting it.'
        ]
      }
    ],
    sources: [
      { label: 'Indian Visa Online — Document Upload', url: 'https://indianvisaonline.gov.in/visa/DocumentUpload', detail: 'PDF documents: minimum 10 KB, maximum 500 KB.' },
      { label: 'Press Registrar General of India — Owner/Applicant/Publisher User Manual', url: 'https://prgi.gov.in/sites/default/files/2024-06/prgi_user_manual_version_owner-appliccant-publisher.pdf', detail: 'Several uploaded document fields permit PDF/JPG/JPEG/PNG up to 300 KB.' },
      { label: 'Kerala State Medical Council — Upload instructions', url: 'https://automation.medicalcouncil.kerala.gov.in/instructions.xhtml', detail: 'Supporting certificates in PDF format: maximum 500 KB.' },
      { label: 'RRCAT — Ph.D. Programme 2026 instructions', url: 'https://www.rrcat.gov.in/hrd/advt/phdonline.html', detail: 'Score-card PDF: up to 500 KB.' },
      { label: 'GST Portal — Registration guide', url: 'https://tutorial.gst.gov.in/userguide/registration/Apply_for_Registration_Normal_Taxpayer.htm', detail: 'Proof of appointment upload: PDF/JPEG up to 1 MB in the cited workflow.' },
      { label: 'Consulate General of India Belfast — Passport Seva document-upload SOP', url: 'https://www.cgibelfast.gov.in/content/SOP-for-document-uploading-in-Applicant-Portal.pdf', detail: 'Supporting documents: PDF, total upload maximum 1 MB.' },
      { label: 'FSSAI — FFRC Recruitment Portal', url: 'https://sites.fssai.gov.in/ffrcrecruitment/applyonline.php', detail: 'Resume: PDF or Word, maximum 2 MB.' },
      { label: 'NCPCR — Chairperson / Member application', url: 'https://ncpcrvacancies.wcd.gov.in/', detail: 'Aadhaar and date-of-birth PDF uploads: less than 2 MB.' },
      { label: 'Maharashtra State Information Commission — Second Appeal', url: 'https://sic.maharashtra.gov.in/SICOnline/SecondAppeal/SecondAppealNew.aspx', detail: 'Allowed upload types include PDF; maximum file size 2 MB.' },
      { label: 'Punjab Land Records — Grievance', url: 'https://jamabandi.punjab.gov.in/Grievance.aspx', detail: 'Supporting document: PDF, maximum 5 MB.' },
      { label: 'Telecommunication Engineering Centre — Control Lab Form', url: 'https://tec.gov.in/control-lab-form', detail: 'Supporting document: PDF or DOCX, maximum 10 MB.' },
      { label: 'SEBI — Settlement Application', url: 'https://siportal.sebi.gov.in/intermediary/settlementApplication.html', detail: 'ITR PDF up to 20 MB; PAN-card PDF up to 500 KB.' }
    ]
  },
  {
    slug: 'pdf-privacy-comparison-2026',
    title: 'Where does your PDF go? A 2026 privacy comparison of online PDF tools',
    description: 'Compare browser-local and server-based PDF processing models, published file-deletion windows and offline options using official vendor documentation.',
    tool: '/privacy',
    toolLabel: 'Read the 1into1 privacy policy',
    category: 'PDF PRIVACY RESEARCH',
    published: '2026-09-23',
    updated: '2026-09-23',
    methodology: 'Reviewed on 23 September 2026 using official vendor documentation linked below. This comparison describes the documented data path and retention model of online PDF workflows. It is not a security score or an overall product ranking. Policies and product behavior can change, and some vendors offer both online and desktop or client-side products.',
    datasetUrl: '/research/pdf-privacy-comparison-2026.csv',
    datasetLabel: 'Download comparison data (CSV)',
    comparison: [
      {
        service: '1into1 PDF',
        processing: 'Core local workflows process the document in the browser on the user’s device. Optional cloud AI and checkout are separate networked features.',
        deletion: 'Core local document workflows do not require a normal document-processing server upload, so there is no server-side file-retention window for those workflows.',
        localOption: 'Yes. Local browser processing is the default for core tools; many workflows can continue after the app and required resources have loaded.',
        sourceLabel: '1into1 Privacy',
        sourceUrl: '/privacy'
      },
      {
        service: 'Smallpdf',
        processing: 'Its online tools upload documents to Smallpdf infrastructure and protect transfers with TLS.',
        deletion: 'Smallpdf says files used with free tools are permanently deleted after one hour. Files intentionally stored in an account follow account-storage controls.',
        localOption: 'This row describes Smallpdf’s online tools and their published server-processing model.',
        sourceLabel: 'Smallpdf safety guide',
        sourceUrl: 'https://smallpdf.com/blog/is-smallpdf-safe'
      },
      {
        service: 'iLovePDF',
        processing: 'Its web service processes uploaded files on iLovePDF servers.',
        deletion: 'Its privacy policy says processed content files are deleted within two hours, with separate terms applying to iLoveSign.',
        localOption: 'This row covers the web service and its published server-retention policy.',
        sourceLabel: 'iLovePDF privacy policy',
        sourceUrl: 'https://www.ilovepdf.com/help/privacy'
      },
      {
        service: 'Sejda',
        processing: 'Sejda’s online service uploads files over an encrypted connection for processing.',
        deletion: 'Sejda states that online files are automatically deleted after two hours.',
        localOption: 'Sejda also offers a Desktop product for offline work where files do not leave the computer.',
        sourceLabel: 'Sejda online editor',
        sourceUrl: 'https://www.sejda.com/pdf-editor'
      },
      {
        service: 'PDF24',
        processing: 'PDF24 says its online tools process documents on PDF24 servers.',
        deletion: 'Uploaded files used by the online tools are automatically deleted from the server after one hour.',
        localOption: 'PDF24 Creator is offered as a Windows desktop alternative that works locally and offline.',
        sourceLabel: 'PDF24 FAQ',
        sourceUrl: 'https://tools.pdf24.org/en/faq'
      },
      {
        service: 'Adobe Acrobat online',
        processing: 'Adobe says Acrobat online services upload files to Adobe cloud storage.',
        deletion: 'If a user does not sign in, Adobe says the uploaded file is deleted from its servers within a short period. Signed-in users can choose to save files to their Adobe account.',
        localOption: 'This row covers Acrobat online services rather than the separate desktop Acrobat application.',
        sourceLabel: 'Adobe Acrobat online FAQ',
        sourceUrl: 'https://helpx.adobe.com/document-cloud/faq/try-acrobat-online-services.html'
      },
      {
        service: 'PDFgear secure browser tools',
        processing: 'PDFgear describes a set of secure client-side PDF tools that process directly in the browser without uploading the PDF.',
        deletion: 'For the client-side tools described on that page, PDFgear says files remain on the user’s device rather than being stored by the service.',
        localOption: 'Yes for the client-side tool set described by PDFgear; the page says those tools can function without internet after opening.',
        sourceLabel: 'PDFgear secure tools',
        sourceUrl: 'https://www.pdfgear.com/secure-pdf-tools/'
      }
    ],
    sections: [
      {
        title: 'Local processing and server processing are different data paths',
        paragraphs: [
          'A browser-based interface does not automatically mean a document stays in the browser. Some web PDF services upload the file to a processing server, while other workflows execute the document operation locally with JavaScript, WebAssembly or browser APIs.',
          'Both models can be designed with security controls. The practical privacy difference is where the document travels, which systems receive a copy, and whether a server-retention policy becomes part of the workflow.'
        ]
      },
      {
        title: 'Deletion windows matter only after a file is uploaded',
        paragraphs: [
          'Smallpdf, iLovePDF, Sejda and PDF24 publish server-deletion windows for their online workflows. Those policies are useful because they tell users how long an uploaded processing copy is expected to remain after the task.',
          'A deletion window is not the same thing as local processing. With a local workflow, the document-processing step does not create the same server-side copy in the first place. With a server workflow, transport encryption and deletion controls are the relevant safeguards.'
        ]
      },
      {
        title: 'Several vendors now offer both models',
        paragraphs: [
          'The market is not simply local versus cloud by company name. Sejda offers an online service and a separate desktop application. PDF24 offers server-based online tools and the local PDF24 Creator. PDFgear publishes a client-side subset of secure browser tools. Adobe offers online services as well as separate desktop software.',
          'That is why privacy comparisons should identify the exact workflow being discussed instead of applying one label to every product a company offers.'
        ]
      },
      {
        title: 'For sensitive documents, check the data path before choosing a tool',
        paragraphs: [
          'Bank statements, contracts, identity documents, legal files and confidential business records can contain information that users may prefer not to transmit unless necessary. Before processing a sensitive document, check whether the specific tool says the file stays on-device or is uploaded, how transfers are protected, how long server copies are retained and whether an offline alternative exists.',
          'No processing model removes the need to review the output. Redacted documents should be reopened and verified, extracted financial values should be checked against the source, and any tool handling sensitive material should be used within the policies and requirements that apply to the user’s organization.'
        ]
      },
      {
        title: 'What this comparison does not claim',
        paragraphs: [
          'This page does not claim that a server-based service is unsafe, and it does not score or rank the companies. A mature cloud service can use strong encryption, access controls, certifications and deletion systems. Local processing instead minimizes the document-processing data path by keeping supported work on the user’s device.',
          'The table is a snapshot of public vendor documentation reviewed on the date shown above. If a provider changes its architecture, retention policy or product scope, its own current documentation should take precedence.'
        ]
      }
    ],
    sources: [
      { label: '1into1 PDF — Privacy policy', url: '/privacy', detail: 'Local document processing, optional cloud features and browser storage.' },
      { label: 'Smallpdf — Is Smallpdf Safe?', url: 'https://smallpdf.com/blog/is-smallpdf-safe', detail: 'Online transfer, server location and one-hour deletion policy for free-tool files.' },
      { label: 'iLovePDF — Privacy Policy', url: 'https://www.ilovepdf.com/help/privacy', detail: 'Processing and two-hour deletion policy for content files, with stated exceptions.' },
      { label: 'Sejda — Online PDF Editor', url: 'https://www.sejda.com/pdf-editor', detail: 'Encrypted upload, two-hour deletion and Desktop offline alternative.' },
      { label: 'PDF24 — FAQ', url: 'https://tools.pdf24.org/en/faq', detail: 'Online server processing, one-hour deletion and PDF24 Creator offline option.' },
      { label: 'Adobe — Acrobat online services FAQ', url: 'https://helpx.adobe.com/document-cloud/faq/try-acrobat-online-services.html', detail: 'Adobe cloud upload behavior and deletion/storage conditions for online services.' },
      { label: 'PDFgear — Secure Online Tools', url: 'https://www.pdfgear.com/secure-pdf-tools/', detail: 'Client-side browser tool set and no-upload claims for those tools.' }
    ]
  }
];

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const link = (path: string, label: string) => `<a href="${escapeHtml(path)}">${escapeHtml(label)}</a>`;
export function renderGuide(path: string): string {
  const guide = TOOL_GUIDES[path] || TOOL_GUIDES[path.startsWith('/compress-pdf-to-') ? '/compress-pdf' : path];
  if (!guide) return '';
  return `<section class="seo-guide" aria-label="Tool instructions"><h2>${escapeHtml(guide.title)}</h2><p>${escapeHtml(guide.intro)}</p><ol>${guide.steps.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ol><div class="guide-example"><h3>A practical example</h3><p>${escapeHtml(guide.example)}</p></div><h3>Common questions</h3>${guide.questions.map(([q,a])=>`<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join('')}<nav class="guide-related" aria-label="Related tools and guides">${guide.related.map(([p,l])=>link(p,l)).join('')}</nav></section>`;
}
function relatedArticlesFor(article: Article): Article[] {
  const candidates = ARTICLES.filter(candidate => candidate.slug !== article.slug);

  const sameTool = candidates.filter(candidate => candidate.tool === article.tool);
  const sameCategory = candidates.filter(
    candidate =>
      candidate.tool !== article.tool &&
      Boolean(article.category) &&
      candidate.category === article.category
  );

  return [...sameTool, ...sameCategory].slice(0, 6);
}

export function renderBlog(path: string): string {
  if (path === '/blog') return `<section class="blog-list" aria-label="PDF guides">${ARTICLES.map(a=>`<article><p class="guide-category">${escapeHtml(a.category || 'PRACTICAL PDF GUIDE')}</p><h2>${link('/blog/'+a.slug,a.title)}</h2><p>${escapeHtml(a.description)}</p>${link('/blog/'+a.slug,(a.comparison || a.datasetUrl) ? 'Read research →' : 'Read guide →')}</article>`).join('')}</section>`;
  const article = ARTICLES.find(a=>path==='/blog/'+a.slug);
  if (!article) return '';
  const dateLine = article.updated
    ? `<p class="article-byline">By the 1into1 team · Updated ${escapeHtml(article.updated)}</p>`
    : '<p class="article-byline">By the 1into1 team</p>';

  const datasetLink = article.datasetUrl
    ? `<a class="research-download" href="${escapeHtml(article.datasetUrl)}" download>${escapeHtml(article.datasetLabel || 'Download research data (CSV)')}</a>`
    : '';

  const comparison = article.comparison?.length
    ? `<section class="research-comparison" aria-labelledby="research-comparison-heading"><h2 id="research-comparison-heading">At-a-glance processing and retention comparison</h2>${article.methodology ? `<p class="research-methodology">${escapeHtml(article.methodology)}</p>` : ''}<div class="research-table-wrap"><table class="research-table"><thead><tr><th>Service</th><th>Document processing path</th><th>Published deletion / retention</th><th>Local or offline option</th><th>Source</th></tr></thead><tbody>${article.comparison.map(row=>`<tr><th scope="row">${escapeHtml(row.service)}</th><td>${escapeHtml(row.processing)}</td><td>${escapeHtml(row.deletion)}</td><td>${escapeHtml(row.localOption)}</td><td><a href="${escapeHtml(row.sourceUrl)}"${row.sourceUrl.startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer"'}>${escapeHtml(row.sourceLabel)}</a></td></tr>`).join('')}</tbody></table></div></section>`
    : '';

  const sources = article.sources?.length
    ? `<section class="research-sources"><h2>Official sources reviewed</h2><ol>${article.sources.map(source=>`<li><a href="${escapeHtml(source.url)}"${source.url.startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer"'}>${escapeHtml(source.label)}</a><span>${escapeHtml(source.detail)}</span></li>`).join('')}</ol></section>`
    : '';

  return `<article class="blog-article"><nav aria-label="Breadcrumb">${link('/blog','All guides')}</nav>${dateLine}<a class="primary-button article-cta" href="${article.tool}">${escapeHtml(article.toolLabel)}</a>${datasetLink}${comparison}${article.sections.map(s=>`<section><h2>${escapeHtml(s.title)}</h2>${s.paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</section>`).join('')}${sources}<nav class="guide-related" aria-label="More guides">${relatedArticlesFor(article).map(a=>link('/blog/'+a.slug,a.title)).join('')}</nav></article>`;
}
export function blogMeta(path: string) {
  if(path==='/blog') return {path,title:'PDF guides: AI, edit, text, code & privacy | 1into1',heading:'A little help with your PDF.',description:'Practical guides for AI PDF summarization, visual editing, text and code conversion, OCR, redaction, password security and local privacy.',subheading:'Straightforward answers. Tools you can use right away.'};
  const a=ARTICLES.find(a=>path==='/blog/'+a.slug);
  return a ? {path,title:a.title+' | 1into1',heading:a.title,description:a.description,subheading:a.description} : undefined;
}
