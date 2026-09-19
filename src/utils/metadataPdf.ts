import {
  PDFDocument,
} from 'pdf-lib';

import createQpdfModule
  from '@neslinesli93/qpdf-wasm';

import qpdfWasmUrl
  from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';


export type SafePdfMetadata = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
};


type QpdfModule = {
  FS: {
    writeFile:
      (
        path: string,
        data: Uint8Array
      ) => void;

    readFile:
      (
        path: string
      ) => Uint8Array;

    unlink?:
      (
        path: string
      ) => void;
  };

  callMain:
    (
      args: string[]
    ) =>
      number |
      void;
};


const yieldToBrowser =
  async () =>
    await new Promise<void>(
      (
        resolve
      ) =>
        setTimeout(
          resolve,
          0
        )
    );


const isPdfBytes =
  (
    bytes:
      Uint8Array
  ) =>
    bytes.length >=
      5 &&
    bytes[0] ===
      0x25 &&
    bytes[1] ===
      0x50 &&
    bytes[2] ===
      0x44 &&
    bytes[3] ===
      0x46 &&
    bytes[4] ===
      0x2d;


/*
 * ============================================================
 * PERMISSION-ENCRYPTED / OWNER-LOCKED PDF NORMALIZER
 * ============================================================
 *
 * Some bank/government PDFs contain an /Encrypt dictionary but
 * open normally because their USER password is empty.
 *
 * Those documents are not "password protected" from the user's
 * perspective.
 *
 * pdf-lib cannot safely rewrite them directly.
 *
 * qpdf can open them locally with an empty user password and
 * produce a structurally equivalent unencrypted PDF.
 *
 * Actual password-to-open PDFs fail here and are rejected.
 *
 * Nothing is uploaded.
 * No page is rasterized.
 */
const normalizeWithoutOpenPassword =
  async (
    source:
      Uint8Array
  ):
    Promise<
      Uint8Array
    > => {
    const stdout:
      string[] =
        [];

    const stderr:
      string[] =
        [];

    let qpdf:
      QpdfModule |
      null =
        null;

    const inputPath =
      '/metadata-source.pdf';

    const outputPath =
      '/metadata-normalized.pdf';

    try {
      qpdf =
        await createQpdfModule(
          {
            locateFile:
              () =>
                qpdfWasmUrl,

            noInitialRun:
              true,

            print:
              (
                message:
                  unknown
              ) => {
                stdout.push(
                  String(
                    message
                  )
                );
              },

            printErr:
              (
                message:
                  unknown
              ) => {
                stderr.push(
                  String(
                    message
                  )
                );
              },
          } as any
        ) as
          unknown as
          QpdfModule;


      qpdf.FS.writeFile(
        inputPath,
        source
      );


      try {
        /*
         * Empty --password means:
         *
         * "Open this PDF exactly as a normal PDF viewer does
         * when no password prompt is required."
         *
         * --decrypt removes the owner/permission encryption
         * layer before pdf-lib performs the metadata edit.
         */
        qpdf.callMain(
          [
            inputPath,

            '--password=',

            '--decrypt',

            '--warning-exit-0',

            outputPath,
          ]
        );
      } catch (
        error:
          any
      ) {
        /*
         * Some Emscripten builds represent normal exit(0)
         * as an exception object.
         */
        if (
          Number(
            error?.status
          ) !==
          0
        ) {
          const details =
            [
              ...stderr,
              ...stdout,
              String(
                error?.message ||
                error ||
                ''
              ),
            ]
              .join(
                '\n'
              )
              .toLowerCase();


          if (
            /invalid password|incorrect password|password required|requires.*password|password.*incorrect/.test(
              details
            )
          ) {
            throw new Error(
              'PASSWORD_PROTECTED_PDF'
            );
          }


          throw new Error(
            'QPDF_RECOVERY_FAILED'
          );
        }
      }


      let rawOutput:
        Uint8Array;

      try {
        rawOutput =
          qpdf.FS.readFile(
            outputPath
          );
      } catch {
        const details =
          [
            ...stderr,
            ...stdout,
          ]
            .join(
              '\n'
            )
            .toLowerCase();


        if (
          /invalid password|incorrect password|password required|requires.*password/.test(
            details
          )
        ) {
          throw new Error(
            'PASSWORD_PROTECTED_PDF'
          );
        }


        throw new Error(
          'QPDF_RECOVERY_FAILED'
        );
      }


      /*
       * Copy out of WASM memory before the qpdf instance and
       * its virtual filesystem are released.
       */
      const normalized =
        new Uint8Array(
          rawOutput.length
        );

      normalized.set(
        rawOutput
      );


      if (
        !isPdfBytes(
          normalized
        )
      ) {
        throw new Error(
          'QPDF_RECOVERY_FAILED'
        );
      }


      return normalized;
    } finally {
      if (qpdf) {
        try {
          qpdf.FS.unlink?.(
            inputPath
          );
        } catch (_) {}

        try {
          qpdf.FS.unlink?.(
            outputPath
          );
        } catch (_) {}
      }

      qpdf = null;
    }
  };


/*
 * ============================================================
 * SAFE UNIVERSAL METADATA WRITER
 * ============================================================
 *
 * PATH A:
 * Normal PDF -> pdf-lib directly.
 *
 * PATH B:
 * Owner/permission encrypted but NO open password ->
 * qpdf structural normalization -> pdf-lib.
 *
 * PATH C:
 * Actual password-to-open PDF ->
 * PASSWORD_PROTECTED_PDF.
 *
 * No rasterization is used.
 */
export async function updatePDFMetadataSafe(
  file: File,
  metadata:
    SafePdfMetadata
):
  Promise<
    Uint8Array
  > {
  let sourceBytes:
    Uint8Array |
    null =
      new Uint8Array(
        await file.arrayBuffer()
      );

  let workingBytes:
    Uint8Array |
    null =
      sourceBytes;

  let pdfDoc:
    PDFDocument |
    null =
      null;


  try {
    /*
     * Fast/native path first.
     */
    try {
      pdfDoc =
        await PDFDocument.load(
          workingBytes,
          {
            updateMetadata:
              false,
          }
        );


      /*
       * Defensive check in case a future pdf-lib version loads
       * an encrypted document without throwing.
       */
      if (
        pdfDoc.isEncrypted
      ) {
        pdfDoc = null;

        throw new Error(
          'NORMALIZE_REQUIRED'
        );
      }
    } catch (
      nativeError
    ) {
      pdfDoc = null;

      await yieldToBrowser();


      /*
       * Do NOT use pdf-lib ignoreEncryption and save.
       *
       * Instead, let qpdf genuinely decrypt/normalize files
       * that open without a user password.
       */
      try {
        workingBytes =
          await normalizeWithoutOpenPassword(
            sourceBytes
          );
      } catch (
        qpdfError:
          any
      ) {
        if (
          qpdfError?.message ===
          'PASSWORD_PROTECTED_PDF'
        ) {
          throw qpdfError;
        }


        /*
         * If qpdf also cannot normalize it, do not produce a
         * questionable/corrupted output.
         */
        console.warn(
          'Metadata normalization failure:',
          nativeError,
          qpdfError
        );

        throw new Error(
          'QPDF_RECOVERY_FAILED'
        );
      }


      /*
       * Original encrypted source is no longer required once
       * qpdf has produced the clean structural copy.
       */
      sourceBytes =
        null;


      await yieldToBrowser();


      try {
        pdfDoc =
          await PDFDocument.load(
            workingBytes,
            {
              updateMetadata:
                false,
            }
          );
      } catch (
        normalizedError
      ) {
        console.warn(
          'Normalized metadata PDF could not be parsed:',
          normalizedError
        );

        throw new Error(
          'QPDF_RECOVERY_FAILED'
        );
      }


      if (
        pdfDoc.isEncrypted
      ) {
        throw new Error(
          'QPDF_RECOVERY_FAILED'
        );
      }
    }


    /*
     * PDF is fully parsed.
     * Drop our explicit complete-file references before save.
     */
    sourceBytes =
      null;

    workingBytes =
      null;


    await yieldToBrowser();


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
    sourceBytes =
      null;

    workingBytes =
      null;

    pdfDoc =
      null;
  }
}
