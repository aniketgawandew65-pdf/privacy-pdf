import {
  PDFDocument,
} from 'pdf-lib';

export type SafePdfMetadata = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
};

/*
 * Safe metadata-only PDF writer.
 *
 * Critical rule:
 * Never save a document that was loaded with
 * ignoreEncryption: true.
 */
export async function updatePDFMetadataSafe(
  file: File,
  metadata: SafePdfMetadata
): Promise<Uint8Array> {
  let sourceBuffer:
    | ArrayBuffer
    | null =
      await file.arrayBuffer();

  let pdfDoc:
    | PDFDocument
    | null =
      null;

  try {
    try {
      pdfDoc =
        await PDFDocument.load(
          sourceBuffer,
          {
            updateMetadata:
              false,
          }
        );
    } catch (
      originalError
    ) {
      /*
       * Probe encrypted/protected PDFs only.
       *
       * We NEVER save the document loaded through this
       * ignoreEncryption probe.
       */
      try {
        const probe =
          await PDFDocument.load(
            sourceBuffer,
            {
              ignoreEncryption:
                true,
              updateMetadata:
                false,
            }
          );

        if (
          probe.isEncrypted
        ) {
          throw new Error(
            'ENCRYPTED_PDF'
          );
        }
      } catch (
        probeError: any
      ) {
        if (
          probeError?.message ===
          'ENCRYPTED_PDF'
        ) {
          throw probeError;
        }
      }

      throw originalError;
    }

    if (
      pdfDoc.isEncrypted
    ) {
      throw new Error(
        'ENCRYPTED_PDF'
      );
    }

    /*
     * pdf-lib has parsed the source, so release our extra
     * complete ArrayBuffer reference before serialization.
     */
    sourceBuffer = null;

    await new Promise<void>(
      (
        resolve
      ) =>
        setTimeout(
          resolve,
          0
        )
    );

    if (
      metadata.title !==
      undefined
    ) {
      pdfDoc.setTitle(
        metadata.title
      );
    }

    if (
      metadata.author !==
      undefined
    ) {
      pdfDoc.setAuthor(
        metadata.author
      );
    }

    if (
      metadata.subject !==
      undefined
    ) {
      pdfDoc.setSubject(
        metadata.subject
      );
    }

    if (
      metadata.keywords !==
      undefined
    ) {
      pdfDoc.setKeywords(
        metadata.keywords
          .split(',')
          .map(
            (
              keyword
            ) =>
              keyword.trim()
          )
          .filter(Boolean)
      );
    }

    pdfDoc.setModificationDate(
      new Date()
    );

    return await pdfDoc.save(
      {
        useObjectStreams:
          false,

        addDefaultPage:
          false,
      }
    );
  } finally {
    sourceBuffer = null;
    pdfDoc = null;
  }
}
