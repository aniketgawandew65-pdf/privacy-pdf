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
    ], related: [['/fill-pdf','Fill supported PDF form fields'], ['/edit-pdf','Add text to a PDF'], ['/protect-pdf','Password-protect a copy']]
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
  '/create-fillable-pdf': {
    title: 'How to turn a regular PDF into a fillable form',
    intro: 'Place interactive fields on an existing PDF and create a reusable form directly in your browser. The document is processed locally on your device.',
    steps: [
      'Open the PDF and choose the page where a field belongs.',
      'Add a text field, checkbox, dropdown, radio group, date field or signature placeholder, then drag and resize it into position.',
      'Give each field a meaningful name, configure dropdown or radio options when needed, then create and download the fillable PDF.'
    ],
    example: 'For an application form, you might add text fields for name and email, a date field for the application date, a dropdown for department, radio choices for Yes or No, and a signature placeholder at the bottom.',
    questions: [
      ['Is the downloaded PDF actually fillable?', 'Yes. Text fields, checkboxes, dropdowns, radio groups and date fields are written as interactive PDF form fields rather than being flattened into page text.'],
      ['Are my documents uploaded?', 'No document-processing upload is required. Field placement and PDF generation happen in your browser using local PDF processing.'],
      ['What does the Signature field do?', 'It creates a visible signature placeholder, not a certificate-based cryptographic digital-signature field. Use the Sign PDF tool if you want to place a drawn signature afterward.'],
      ['Can I add fields on several pages?', 'Yes. Move between pages and add fields wherever they are required. Fields placed on other pages are preserved while you continue editing.'],
      ['Can I resize fields on a phone?', 'Yes. The editor uses pointer controls that work with mouse, touch and supported styluses. For precise placement on a small screen, zooming the browser or using landscape orientation can help.']
    ],
    related: [
      ['/fill-pdf','Fill and flatten an existing PDF form'],
      ['/sign-pdf','Place a drawn signature'],
      ['/edit-pdf','Add or replace visible PDF text'],
      ['/protect-pdf','Password-protect the finished form']
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
  const guide = TOOL_GUIDES[path.startsWith('/compress-pdf-to-') ? '/compress-pdf' : path];
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
