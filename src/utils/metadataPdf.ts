import {
  PDFDocument,
  PDFName,
  PDFRawStream,
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


export type SafePdfMetadataUpdateResult = {
  bytes: Uint8Array;

  /*
   * True only when qpdf had to remove permission/owner encryption
   * so pdf-lib could safely rewrite the metadata.
   *
   * Actual password-to-open PDFs still fail instead.
   */
  permissionProtectionRemoved: boolean;

  /*
   * True when an existing XMP packet was found and its core
   * Title / Author / Subject / Keywords values were synchronized.
   *
   * A missing or unreadable XMP packet is left alone rather than
   * risking unrelated custom metadata.
   */
  xmpSynchronized: boolean;
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


const escapeXmlText =
  (
    value:
      string
  ) =>
    value
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&apos;'
      );


const replaceOrInsertXmpProperty =
  (
    xml:
      string,
    tag:
      string,
    replacement:
      string
  ) => {
    const pattern =
      new RegExp(
        `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,
        'i'
      );

    if (
      pattern.test(
        xml
      )
    ) {
      return xml.replace(
        pattern,
        replacement
      );
    }

    /*
     * Insert new core properties into the first RDF Description.
     * If a packet does not have that standard structure, leave it
     * untouched rather than rewriting unfamiliar XMP.
     */
    const closingDescription =
      /<\/rdf:Description>/i;

    if (
      !closingDescription.test(
        xml
      )
    ) {
      return null;
    }

    return xml.replace(
      closingDescription,
      `  ${replacement}\n </rdf:Description>`
    );
  };


const ensureXmpNamespace =
  (
    xml:
      string,
    prefix:
      'dc' |
      'pdf',
    namespace:
      string
  ) => {
    const namespacePattern =
      new RegExp(
        `xmlns:${prefix}\\s*=`,
        'i'
      );

    if (
      namespacePattern.test(
        xml
      )
    ) {
      return xml;
    }

    return xml.replace(
      /<rdf:Description\b/i,
      `<rdf:Description xmlns:${prefix}="${namespace}"`
    );
  };


/*
 * Synchronize only the four metadata properties that this tool edits.
 *
 * Everything else in the existing XMP packet is preserved verbatim,
 * including custom namespaces/properties such as CreatorTool,
 * rights-management data, workflow fields, etc.
 *
 * If the packet is compressed or uses an unfamiliar representation,
 * we deliberately skip synchronization instead of replacing the whole
 * XMP packet and risking unrelated professional metadata.
 */
const synchronizeExistingXmp =
  (
    pdfDoc:
      PDFDocument,
    metadata:
      SafePdfMetadata
  ):
    boolean => {
    try {
      const metadataEntry =
        pdfDoc.catalog.get(
          PDFName.of(
            'Metadata'
          )
        );

      if (
        !metadataEntry
      ) {
        return false;
      }

      const metadataObject =
        pdfDoc.context.lookup(
          metadataEntry
        );

      if (
        !(
          metadataObject instanceof
          PDFRawStream
        )
      ) {
        return false;
      }

      const sourceBytes =
        metadataObject.getContents();

      /*
       * Most XMP metadata streams are plain UTF-8 XML.
       * Do not attempt to interpret compressed/binary stream bytes
       * as XML: an unreadable packet is safer left unchanged.
       */
      const decoded =
        new TextDecoder(
          'utf-8',
          {
            fatal:
              false,
          }
        ).decode(
          sourceBytes
        );

      if (
        !decoded.includes(
          '<rdf:RDF'
        ) ||
        !decoded.includes(
          '<rdf:Description'
        )
      ) {
        return false;
      }

      let xml =
        decoded;

      xml =
        ensureXmpNamespace(
          xml,
          'dc',
          'http://purl.org/dc/elements/1.1/'
        );

      xml =
        ensureXmpNamespace(
          xml,
          'pdf',
          'http://ns.adobe.com/pdf/1.3/'
        );

      const title =
        escapeXmlText(
          metadata.title ??
            ''
        );

      const author =
        escapeXmlText(
          metadata.author ??
            ''
        );

      const subject =
        escapeXmlText(
          metadata.subject ??
            ''
        );

      const keywords =
        escapeXmlText(
          metadata.keywords ??
            ''
        );

      const replacements:
        Array<
          [
            string,
            string
          ]
        > = [
          [
            'dc:title',
            `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>`,
          ],
          [
            'dc:creator',
            `<dc:creator><rdf:Seq><rdf:li>${author}</rdf:li></rdf:Seq></dc:creator>`,
          ],
          [
            'dc:description',
            `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${subject}</rdf:li></rdf:Alt></dc:description>`,
          ],
          [
            'pdf:Keywords',
            `<pdf:Keywords>${keywords}</pdf:Keywords>`,
          ],
        ];

      for (
        const [
          tag,
          replacement,
        ] of replacements
      ) {
        const next =
          replaceOrInsertXmpProperty(
            xml,
            tag,
            replacement
          );

        if (
          next ===
          null
        ) {
          return false;
        }

        xml =
          next;
      }

      /*
       * Replace only the stream contents. Reuse the existing stream
       * dictionary so /Type, /Subtype and any unrelated dictionary
       * entries remain intact.
       *
       * Remove stale compression/filter entries because the new
       * packet is written as plain UTF-8 XML.
       */
      metadataObject.dict.delete(
        PDFName.of(
          'Filter'
        )
      );

      metadataObject.dict.delete(
        PDFName.of(
          'DecodeParms'
        )
      );

      const replacementStream =
        PDFRawStream.of(
          metadataObject.dict,
          new TextEncoder()
            .encode(
              xml
            )
        );

      const existingRef =
        pdfDoc.context.getObjectRef(
          metadataObject
        );

      if (
        existingRef
      ) {
        pdfDoc.context.assign(
          existingRef,
          replacementStream
        );
      } else {
        pdfDoc.catalog.set(
          PDFName.of(
            'Metadata'
          ),
          pdfDoc.context.register(
            replacementStream
          )
        );
      }

      return true;
    } catch (
      error
    ) {
      console.warn(
        'XMP metadata synchronization skipped:',
        error
      );

      return false;
    }
  };


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
    SafePdfMetadataUpdateResult
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


  let permissionProtectionRemoved =
    false;


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

        permissionProtectionRemoved =
          true;
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


    /*
     * Keep the standard PDF Info dictionary and an existing XMP
     * packet in agreement. This is deliberately additive to the
     * proven writer path: page/content objects are not touched.
     */
    const xmpSynchronized =
      synchronizeExistingXmp(
        pdfDoc,
        metadata
      );


    const bytes =
      await pdfDoc.save(
        {
          useObjectStreams:
            false,

          addDefaultPage:
            false,
        }
      );


    return {
      bytes,
      permissionProtectionRemoved,
      xmpSynchronized,
    };
  } finally {
    sourceBytes =
      null;

    workingBytes =
      null;

    pdfDoc =
      null;
  }
}
