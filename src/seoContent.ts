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
    related: [['/compress-pdf-to-50kb','Start with a 50 KB target'], ['/compress-pdf-to-100kb','Start with a 100 KB target'], ['/remove-pages','Remove unnecessary pages'], ['/split-pdf','Split a large document'], ['/blog/reduce-pdf-for-upload-limit','Read the upload-limit guide']]
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
  '/sign-pdf': {
    title: 'Place a drawn signature on your PDF',
    intro: 'Draw a signature and position it on the page using the preview. The local tool does not require uploading your PDF.',
    steps: ['Open the PDF and go to the page where your signature belongs.', 'Draw your signature, then position and size it using the available preview controls.', 'Download the result and check the signature’s placement before sharing it.'],
    example: 'For a form with a signature line on the last page, navigate to that page before placing the signature. Zoom in to check that it does not cover nearby text.',
    questions: [
      ['Is this a certificate-based digital signature?', 'No. This tool places a visual signature on a PDF. It does not issue a signing certificate or provide identity verification.'],
      ['Can I draw with my finger?', 'Yes, the drawing interface supports touch. Review the downloaded PDF because the final placement matters more than how large it looked on your phone screen.'],
      ['Will the recipient accept it?', 'Check the recipient’s instructions. Some workflows require a specific signing service or certificate rather than a drawn signature.']
    ], related: [['/fill-pdf','Fill supported PDF form fields'], ['/add-text-to-pdf','Add text to a PDF'], ['/protect-pdf','Password-protect a copy']]
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
      ['/add-text-to-pdf','Add text and shapes'],
      ['/sign-pdf','Add a drawn signature'],
      ['/watermark-pdf','Add a watermark'],
      ['/scan-to-pdf','Turn photos into a PDF']
    ]
  },

  '/edit-pdf': {
    title: 'How to edit a PDF with text, whiteout areas and shapes',
    intro: 'Make visual changes to a PDF directly in your browser. Add text, cover existing content and place or resize visual elements without sending the document to a processing server.',
    steps: [
      'Choose the PDF you want to edit.',
      'Add a text box or whiteout area.',
      'Drag the item to the correct position on the PDF.',
      'Resize it using the corner handles.',
      'Adjust text style, size and colour when needed.',
      'Move between pages and repeat your edits.',
      'Save and download the edited PDF.'
    ],
    example: 'To correct a visible value in a PDF, place a whiteout area over the old value and add a new text box in the same position. The rest of the original page remains unchanged.',
    questions: [
      ['Does this replace the original PDF text?', 'This editor makes visual PDF changes using text and overlay elements. It does not attempt to rebuild the original document layout like a Word processor.'],
      ['Does my PDF upload to a processing server?', 'Core editing runs locally in your browser, so the PDF does not need to be uploaded for processing.'],
      ['Can I edit scanned PDFs?', 'Yes. Because the editor uses visual text and overlay elements, it can also be used on scanned PDF pages.'],
      ['Can I edit more than one page?', 'Yes. Use the page controls to move between pages and place edits on the pages you need.']
    ],
    related: [
      ['/annotate-pdf','Draw and annotate a PDF'],
      ['/sign-pdf','Add a signature'],
      ['/watermark-pdf','Add a watermark'],
      ['/redact-pdf','Permanently redact content']
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
    title: 'How to convert a PDF to Markdown for AI and LLM workflows',
    intro: 'Extract readable PDF content into Markdown that is easier to use in notes, documentation and AI workflows. Processing happens in your browser.',
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
      ['/extract-pdf-for-llm','Prepare PDF text for LLM use'],
      ['/ocr-pdf','Make scanned PDF text searchable'],
      ['/pdf-to-text','Extract plain PDF text'],
      ['/ai-summary-pdf','Summarize or chat with a PDF']
    ]
  },

  '/extract-pdf-for-llm': {
    title: 'How to prepare PDF content for an LLM',
    intro: 'Turn PDF content into cleaner Markdown before using it with an AI or LLM workflow. This helps separate document extraction from the AI step.',
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
      ['/pdf-to-markdown','Convert PDF to Markdown'],
      ['/ocr-pdf','OCR a scanned PDF'],
      ['/pdf-to-text','Extract plain text'],
      ['/sanitize-pdf','Remove PDF metadata before sharing']
    ]
  },

  '/bank-statement-to-excel': {
    title: 'How to convert a bank statement PDF to spreadsheet data',
    intro: 'Extract table-style information from a PDF statement into spreadsheet-friendly data. Always verify financial values against the original statement before relying on the result.',
    steps: [
      'Choose the bank statement PDF.',
      'Run the table extraction process.',
      'Review dates, descriptions, debit, credit and balance fields where available.',
      'Export the structured result and open it in your spreadsheet application.',
      'Compare totals and sample transactions against the original PDF.'
    ],
    example: 'For a monthly statement, check the opening balance, several transactions and the closing balance after extraction before using the spreadsheet for analysis or reconciliation.',
    questions: [
      ['Will every bank statement have the same columns?', 'No. Banks use different layouts, column names and statement formats, so extracted results should always be reviewed.'],
      ['Can it work with scanned statements?', 'A scanned statement may require OCR before table extraction can identify usable text.'],
      ['Should I trust extracted financial values automatically?', 'No. Verify important amounts, dates and balances against the original statement before accounting, reporting or financial decisions.'],
      ['Is the statement processed locally?', 'The PDF extraction workflow is designed to process the document in your browser rather than requiring a normal server-side document upload.']
    ],
    related: [
      ['/pdf-to-csv','Extract PDF tables to CSV'],
      ['/ocr-pdf','OCR a scanned statement'],
      ['/sanitize-pdf','Remove metadata from a PDF'],
      ['/pdf-to-markdown','Convert document text to Markdown']
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
      ['/bank-statement-to-excel','Convert a bank statement to spreadsheet data'],
      ['/ocr-pdf','OCR scanned tables'],
      ['/pdf-to-text','Extract raw PDF text'],
      ['/pdf-to-markdown','Convert PDF to Markdown']
    ]
  },

  '/offline-pdf-redaction': {
    title: 'How to permanently redact sensitive information from a PDF',
    intro: 'Remove sensitive visible information from a PDF using a browser-based redaction workflow. Review the downloaded copy carefully before sharing it.',
    steps: [
      'Choose the PDF containing the information you need to remove.',
      'Mark each sensitive area for redaction.',
      'Check every page for names, account numbers, addresses or other confidential content.',
      'Create the redacted PDF.',
      'Download and reopen the result to confirm the information is no longer visible.'
    ],
    example: 'Before sending a bank statement to a third party, redact account numbers and other information that the recipient does not need, then inspect the exported PDF before sharing it.',
    questions: [
      ['Is covering text with a white box the same as redaction?', 'No. A visual cover can leave the underlying information recoverable. Use a dedicated redaction workflow when information must be removed from the output.'],
      ['Is my PDF uploaded for redaction?', 'The redaction workflow is designed to process the document locally in your browser.'],
      ['Should I keep the original PDF?', 'Yes. Keep the unmodified source separately until you have verified the redacted copy.'],
      ['What should I check after redacting?', 'Reopen the downloaded PDF and inspect every redacted area and every page before sharing the file.']
    ],
    related: [
      ['/sanitize-pdf','Remove PDF metadata and hidden traces'],
      ['/edit-pdf','Make visual PDF edits'],
      ['/protect-pdf','Password-protect a PDF'],
      ['/bates-numbering','Add Bates numbers to legal documents']
    ]
  },

  '/sanitize-pdf': {
    title: 'How to sanitize a PDF before sharing it',
    intro: 'Create a cleaner copy of a PDF by removing metadata and other document traces that may not be needed by the recipient.',
    steps: [
      'Choose the PDF you plan to share.',
      'Run the sanitization process.',
      'Download the cleaned copy.',
      'Check the document content and appearance.',
      'Share the sanitized copy rather than your original file.'
    ],
    example: 'Before sending a document outside your organisation, sanitize the PDF to reduce unnecessary metadata, then separately redact any confidential information that appears on the pages.',
    questions: [
      ['Is sanitizing the same as redacting?', 'No. Sanitizing targets metadata or document traces, while redaction removes sensitive visible content. Use both when both types of information matter.'],
      ['Does sanitizing change the visible document?', 'The goal is to preserve the useful document while removing unnecessary metadata or hidden traces, but always inspect the downloaded result.'],
      ['Should I sanitize sensitive documents before sharing?', 'It can be a useful privacy step, but it does not replace reviewing the visible content of the PDF.'],
      ['Does processing require a normal server upload?', 'The core sanitization workflow runs locally in your browser.']
    ],
    related: [
      ['/offline-pdf-redaction','Redact sensitive visible content'],
      ['/edit-metadata','Review or edit PDF metadata'],
      ['/protect-pdf','Password-protect a copy'],
      ['/pdf-to-markdown','Extract document content locally']
    ]
  },

  '/bates-numbering': {
    title: 'How to add Bates numbers to PDF documents',
    intro: 'Apply sequential Bates numbering to PDF pages for legal, discovery, compliance or document-review workflows.',
    steps: [
      'Choose the PDF you need to number.',
      'Set the Bates numbering options and starting value.',
      'Review the placement so numbers do not cover important page content.',
      'Create the numbered PDF.',
      'Check the first, middle and final pages to confirm the sequence.'
    ],
    example: 'A document set beginning at 000001 can be numbered sequentially so each page has a stable reference during legal review or document exchange.',
    questions: [
      ['What are Bates numbers used for?', 'Bates numbering gives document pages sequential identifiers that can make referencing large legal or review sets easier.'],
      ['Should I verify the complete sequence?', 'Yes. Check the beginning, several middle pages and the final page before relying on the numbered document set.'],
      ['Can Bates numbers cover existing content?', 'Poor placement can overlap page content, so review the position before generating the final file.'],
      ['Is the document processed locally?', 'The Bates-numbering workflow runs in your browser rather than requiring a normal document-processing upload.']
    ],
    related: [
      ['/offline-pdf-redaction','Redact confidential information'],
      ['/sanitize-pdf','Sanitize PDF metadata'],
      ['/page-numbers','Add ordinary page numbers'],
      ['/compare-pdf','Compare PDF versions']
    ]
  },

  '/dark-mode-pdf': {
    title: 'How to create a dark mode PDF for easier night reading',
    intro: 'Create a dark-reading copy of a PDF instead of only changing the appearance of the viewer. Keep your original file alongside the converted version.',
    steps: [
      'Choose the PDF you want to read in dark mode.',
      'Run the dark-mode conversion.',
      'Download the converted copy.',
      'Inspect text, images, diagrams and contrast before using it for extended reading.'
    ],
    example: 'A bright study PDF can be converted into a darker reading copy for use at night while the original document remains unchanged.',
    questions: [
      ['Is this just a browser dark theme?', 'No. The tool creates a converted PDF output rather than only changing the surrounding website interface.'],
      ['Will every colour look perfect after conversion?', 'Not necessarily. Images, charts and coloured text can behave differently, so inspect the final file.'],
      ['Does this modify my original PDF?', 'The tool creates a separate output. Keep the original file if you need the original colours or appearance later.'],
      ['Is the PDF uploaded for the conversion?', 'The transformation is performed locally in your browser.']
    ],
    related: [
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
      ['/image-converter','Convert images to other formats or PDF'],
      ['/ocr-pdf','Make scanned PDF text searchable'],
      ['/dark-mode-pdf','Create a dark-reading PDF'],
      ['/compress-pdf','Reduce PDF file size']
    ]
  },

  '/ocr-pdf': {
    title: 'How to make a scanned PDF searchable with OCR',
    intro: 'Use optical character recognition to detect text in scanned PDF pages and create a more searchable document workflow locally in your browser.',
    steps: [
      'Choose a scanned PDF or image-based document.',
      'Start the OCR process and allow the required OCR resources to load.',
      'Review the recognised text or searchable output.',
      'Check names, numbers and important terms against the original scan.',
      'Download or continue with the recognised document workflow.'
    ],
    example: 'A scanned invoice that contains only page images can be processed with OCR before extracting text or attempting table conversion.',
    questions: [
      ['What does OCR do?', 'OCR analyses page images and attempts to recognise the visible characters as text.'],
      ['Will OCR always be completely accurate?', 'No. Accuracy depends on scan quality, resolution, language, fonts, handwriting, skew and image clarity. Important values should always be checked manually.'],
      ['When should I use OCR before another tool?', 'OCR can help before text extraction, Markdown conversion or table extraction when the original PDF contains scanned images instead of selectable text.'],
      ['Does OCR require uploading my document?', 'The OCR workflow uses browser-based processing. Required OCR resources may need to load before local recognition can run.']
    ],
    related: [
      ['/pdf-to-markdown','Convert recognised text to Markdown'],
      ['/pdf-to-csv','Extract table-style data'],
      ['/bank-statement-to-excel','Extract statement data'],
      ['/scan-to-pdf','Create a PDF from document photos']
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
      ['/booklet-pdf','Create a booklet layout'],
      ['/resize-pdf','Change PDF paper size'],
      ['/page-numbers','Add page numbers'],
      ['/compress-pdf','Reduce the finished PDF size']
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
      ['Why does a 50 KB PDF look blurry?', 'Reaching such a small target can require reducing image resolution and JPEG quality aggressively.'],
      ['What should I check before uploading?', 'Reopen the downloaded PDF and inspect small text, identification numbers, signatures, stamps and every page.'],
      ['What if 50 KB is too small for my document?', 'Remove unnecessary pages, split the PDF if permitted, or use a larger accepted limit such as 100 KB or 200 KB.']
    ],
    related: [
      ['/compress-pdf-to-100kb','Try a 100 KB target'],
      ['/remove-pages','Remove unnecessary pages'],
      ['/split-pdf','Split a large document'],
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
      ['Why should I reopen the result?', 'Meeting the file-size limit does not guarantee that small text, stamps or photographs remain clear enough for the recipient.'],
      ['Should I choose 50 KB instead?', 'Only when the portal requires it. If 100 KB is allowed, using the larger permitted size generally leaves more room for readable detail.']
    ],
    related: [
      ['/compress-pdf-to-50kb','Use a stricter 50 KB target'],
      ['/compress-pdf-to-200kb','Try a 200 KB target'],
      ['/scan-to-pdf','Create a PDF from document photos'],
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
      ['/compress-pdf-to-100kb','Use a 100 KB target'],
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
      ['/compress-pdf','Choose another PDF target size'],
      ['/crop-pdf','Crop unnecessary margins'],
      ['/blog/reduce-pdf-for-upload-limit','Read the upload-limit guide']
    ]
  }

};

export interface Article { slug: string; title: string; description: string; tool: string; toolLabel: string; sections: { title: string; paragraphs: string[] }[] }
export const ARTICLES: Article[] = [
  {
    slug: 'reduce-pdf-for-upload-limit', title: 'How to reduce a PDF for an upload size limit',
    description: 'Choose a PDF size target, understand KB limits and check readability before submitting a compressed document.',
    tool: '/compress-pdf', toolLabel: 'Open PDF compressor',
    sections: [
      {title: 'Read the upload rule before changing the file', paragraphs: ['Write down the maximum file size, allowed format and any page-count requirement. A portal that accepts JPG will not necessarily accept PDF, and a size error can be different from a password-protection error.', 'Keep the original. Compression can turn text and form fields into page images, so use a copy when the document contains information you may need to edit later.']},
      {title: 'Choose the largest size the portal allows', paragraphs: ['In 1into1, open Compress PDF, choose Target Size and select your KB target. A larger target usually leaves more room for readable text and images. Do not choose 50 KB merely because it is the smallest option if the portal allows 500 KB.', 'There is also a units difference to consider: 1into1 uses 1 KB = 1,024 bytes. A portal using 1 KB = 1,000 bytes may reject an exact 50 KB result of 51,200 bytes. Choose a lower available target when you need extra headroom.']},
      {title: 'Understand what an exact target can cost', paragraphs: ['The compressor measures the complete output. If it is too large, target mode reduces image quality and resolution again. If it is smaller than the requested target, padding brings it to the selected byte size; padding does not add image detail.', 'For example, nine pages at 50 KB have about 5.6 KB each before PDF overhead. Small text and stamps may become unreadable. The format also needs space for its structure, so arbitrary targets are not possible for every document.']},
      {title: 'Inspect the download, not just the success message', paragraphs: ['Open the saved PDF and zoom into names, dates, tables, signatures and stamps. Check every page is present. A file that uploads successfully can still be unsuitable if the recipient cannot read it.', 'If the result is too blurry, remove only unnecessary pages, choose a larger permitted target or split the PDF if separate uploads are accepted. Do not remove required content simply to meet a limit.']},
      {title: 'Keep the document on your device', paragraphs: ['The compression tool processes the PDF locally. Let the app and required resources load before relying on an offline connection. Optional cloud AI and checkout are separate features that need a connection.', 'The target-size compressor is useful for compatibility with upload limits, but it is not a guarantee that every receiving website will accept the result. Check the portal’s own instructions after downloading.']}
    ]
  },
  {
    slug: 'crop-all-pdf-pages', title: 'How to crop the same margins from every PDF page',
    description: 'Apply one crop across a PDF, check mixed page layouts and understand why cropping is different from secure redaction.',
    tool: '/crop-pdf', toolLabel: 'Open PDF crop tool',
    sections: [
      {title: 'Decide whether one crop fits the whole document', paragraphs: ['An all-pages crop works best when every page has similar margins and orientation. Look through the PDF first: a landscape table, a larger diagram or a page number close to an edge may need a different selection.', 'For example, a ten-page scan with the same wide white border is a good candidate for one crop. A collection of receipts with different dimensions is better handled page by page.']},
      {title: 'Set the crop using a representative page', paragraphs: ['Open the PDF in the Crop tool and position the crop box around the content you want to keep. Leave a little space around text instead of drawing exactly against the letters.', 'Use the option to apply the crop to all pages when their layouts match. For mixed layouts, set individual page crops and check each preview before generating the output.']},
      {title: 'Check the saved PDF', paragraphs: ['Download and reopen the result. Inspect the first, middle and last pages, plus any pages with tables or a different orientation. Make sure footnotes, page numbers and signatures are still visible.', 'Keep the source PDF until you have checked the complete result. If an edge is cut off, return to the original and use a larger crop area.']},
      {title: 'Cropping is not redaction', paragraphs: ['Cropping can change the visible page boundary without deleting the content outside it. Do not use it to hide account numbers, addresses or other information that must not remain recoverable.', 'Use a dedicated redaction workflow for information removal and inspect the exported copy. The distinction matters even when the cropped page looks correct in your viewer.']},
      {title: 'Cropping is not compression either', paragraphs: ['Removing visible margins does not necessarily remove the underlying page data or make the file substantially smaller. If your goal is an upload limit, crop for appearance first and then use the compressor if needed.', 'The crop tool runs on your device. On a phone, work with a manageable document size and leave the browser open until the download is ready.']}
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
export function renderBlog(path: string): string {
  if (path === '/blog') return `<section class="blog-list" aria-label="PDF guides">${ARTICLES.map(a=>`<article><p class="guide-category">PRACTICAL PDF GUIDE</p><h2>${link('/blog/'+a.slug,a.title)}</h2><p>${escapeHtml(a.description)}</p>${link('/blog/'+a.slug,'Read guide →')}</article>`).join('')}</section>`;
  const article = ARTICLES.find(a=>path==='/blog/'+a.slug);
  if (!article) return '';
  return `<article class="blog-article"><nav aria-label="Breadcrumb">${link('/blog','All guides')}</nav><p class="article-byline">By the 1into1 team</p><a class="primary-button article-cta" href="${article.tool}">${escapeHtml(article.toolLabel)}</a>${article.sections.map(s=>`<section><h2>${escapeHtml(s.title)}</h2>${s.paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</section>`).join('')}<nav class="guide-related" aria-label="More guides">${ARTICLES.filter(a=>a.slug!==article.slug).map(a=>link('/blog/'+a.slug,a.title)).join('')}</nav></article>`;
}
export function blogMeta(path: string) {
  if(path==='/blog') return {path,title:'PDF guides: upload limits, cropping & privacy | 1into1',heading:'A little help with your PDF.',description:'Practical guides for PDF upload limits, cropping pages and using local document tools.',subheading:'Straightforward answers. Tools you can use right away.'};
  const a=ARTICLES.find(a=>path==='/blog/'+a.slug);
  return a ? {path,title:a.title+' | 1into1',heading:a.title,description:a.description,subheading:a.description} : undefined;
}
