import {
  loadPdfJsFromBlob,
  pdfjsLib,
} from "./pdfjs";

import {
  redactPDF,
  type PageRedaction,
  type RedactionRect,
} from "./pdfEngine";

/*
 * ============================================================
 * 1into1 LARGE-PDF STREAMING REDACTION
 * ============================================================
 *
 * Small PDFs:
 *   Existing hybrid/vector engine.
 *
 * Large PDFs / many affected pages:
 *   PDF.js -> bounded 2x strips -> burned blackouts
 *          -> incremental PDF -> OPFS.
 *
 * Heavy path characteristics:
 *
 * - 100% browser-local
 * - no server
 * - no upload
 * - no paid engine
 * - no giant final Uint8Array
 * - no giant full-page 2x canvas
 * - page checkpoint after every completed page
 * - resume after Safari process kill
 * - secure destructive flattening
 */

const LARGE_FILE_BYTES =
  20 *
  1024 *
  1024;

const LARGE_REDACTED_PAGE_COUNT =
  12;

const RENDER_SCALE =
  2.0;

const JPEG_QUALITY =
  0.92;

const MAX_STRIP_PIXELS =
  1_100_000;

const PDFJS_BATCH_SIZE =
  4;

const WRITER_TIMEOUT_MS =
  120_000;

type Checkpoint = {
  version: 1;
  totalPages: number;
  directoryName: string;
  outputName: string;

  nextPageIndex: number;
  byteOffset: number;

  nextObjectId: number;

  offsets:
    Array<
      number |
      null
    >;

  pageObjectIds:
    number[];
};

const delay =
  (
    ms = 0
  ) =>
    new Promise<void>(
      (
        resolve
      ) =>
        setTimeout(
          resolve,
          ms
        )
    );

const newRequestId =
  () =>
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

class PdfStreamWriter {
  private worker:
    Worker;

  position:
    number;

  private constructor(
    worker:
      Worker,
    position:
      number
  ) {
    this.worker =
      worker;

    this.position =
      position;
  }

  private request(
    type:
      string,
    payload:
      Record<
        string,
        unknown
      > = {},
    transfer:
      Transferable[] = []
  ): Promise<any> {
    const requestId =
      newRequestId();

    return new Promise(
      (
        resolve,
        reject
      ) => {
        let timeout:
          number;

        const cleanup =
          () => {
            window.clearTimeout(
              timeout
            );

            this.worker
              .removeEventListener(
                "message",
                onMessage
              );

            this.worker
              .removeEventListener(
                "error",
                onError
              );
          };

        const onMessage =
          (
            event:
              MessageEvent
          ) => {
            const result =
              event.data;

            if (
              !result ||
              result.requestId !==
                requestId
            ) {
              return;
            }

            cleanup();

            if (
              result.ok
            ) {
              resolve(
                result
              );
            } else {
              reject(
                new Error(
                  result.error ||
                    "Streaming PDF writer failed."
                )
              );
            }
          };

        const onError =
          (
            event:
              ErrorEvent
          ) => {
            cleanup();

            reject(
              new Error(
                event.message ||
                  "Streaming PDF worker failed."
              )
            );
          };

        timeout =
          window.setTimeout(
            () => {
              cleanup();

              reject(
                new Error(
                  "Streaming PDF writer timed out."
                )
              );
            },
            WRITER_TIMEOUT_MS
          );

        this.worker
          .addEventListener(
            "message",
            onMessage
          );

        this.worker
          .addEventListener(
            "error",
            onError
          );

        this.worker
          .postMessage(
            {
              requestId,
              type,
              ...payload,
            },
            transfer
          );
      }
    );
  }

  static async create(
    directoryName:
      string,
    fileName:
      string,
    truncateTo:
      number
  ) {
    const worker =
      new Worker(
        new URL(
          "../workers/opfsPdfStreamWriter.ts",
          import.meta.url
        ),
        {
          type:
            "module",
        }
      );

    const writer =
      new PdfStreamWriter(
        worker,
        truncateTo
      );

    try {
      const result =
        await writer.request(
          "init",
          {
            directoryName,
            fileName,
            truncateTo,
          }
        );

      writer.position =
        Number(
          result.position ||
            truncateTo
        );

      return writer;
    } catch (
      error
    ) {
      worker.terminate();
      throw error;
    }
  }

  async append(
    input:
      Uint8Array |
      ArrayBuffer
  ) {
    /*
     * Copy only this small chunk before transferring it.
     * We never copy the complete output PDF.
     */
    const buffer =
      input instanceof
        Uint8Array
        ? input.buffer.slice(
            input.byteOffset,
            input.byteOffset +
              input.byteLength
          )
        : input.slice(
            0
          );

    const result =
      await this.request(
        "append",
        {
          data:
            buffer,
        },
        [
          buffer as
            ArrayBuffer,
        ]
      );

    this.position =
      Number(
        result.position
      );
  }

  async text(
    text:
      string
  ) {
    await this.append(
      new TextEncoder()
        .encode(
          text
        )
    );
  }

  async finish() {
    try {
      const result =
        await this.request(
          "finish"
        );

      this.position =
        Number(
          result.position ||
            this.position
        );
    } finally {
      this.worker
        .terminate();
    }
  }

  async abort() {
    try {
      await this.request(
        "abort"
      );
    } catch (_) {
      // Keep partial OPFS data for resume.
    } finally {
      this.worker
        .terminate();
    }
  }
}

const getStoredFile =
  async (
    directoryName:
      string,
    fileName:
      string
  ) => {
    const root =
      await navigator.storage
        .getDirectory();

    const directory =
      await root
        .getDirectoryHandle(
          directoryName
        );

    const handle =
      await directory
        .getFileHandle(
          fileName
        );

    return await handle
      .getFile();
  };

const removeDirectory =
  async (
    directoryName:
      string
  ) => {
    try {
      const root =
        await navigator.storage
          .getDirectory();

      await root.removeEntry(
        directoryName,
        {
          recursive:
            true,
        }
      );
    } catch (_) {
      // Missing directory is fine.
    }
  };

const normalizeMap =
  (
    redactions:
      PageRedaction[]
  ) => {
    const map =
      new Map<
        number,
        RedactionRect[]
      >();

    for (
      const entry of
      redactions
    ) {
      const rects =
        entry.rects
          .map(
            (
              rect
            ) => {
              const x =
                Math.max(
                  0,
                  Math.min(
                    1,
                    rect.x
                  )
                );

              const y =
                Math.max(
                  0,
                  Math.min(
                    1,
                    rect.y
                  )
                );

              const width =
                Math.max(
                  0,
                  Math.min(
                    1 - x,
                    rect.width
                  )
                );

              const height =
                Math.max(
                  0,
                  Math.min(
                    1 - y,
                    rect.height
                  )
                );

              return {
                x,
                y,
                width,
                height,
              };
            }
          )
          .filter(
            (
              rect
            ) =>
              rect.width >
                0 &&
              rect.height >
                0
          );

      if (
        rects.length >
        0
      ) {
        map.set(
          entry.pageIndex,
          rects
        );
      }
    }

    return map;
  };

const localJobHash =
  (
    file:
      File,
    map:
      Map<
        number,
        RedactionRect[]
      >
  ) => {
    const geometry =
      Array.from(
        map.entries()
      )
        .sort(
          (
            a,
            b
          ) =>
            a[0] -
            b[0]
        )
        .map(
          (
            [
              pageIndex,
              rects,
            ]
          ) => ({
            pageIndex,
            rects:
              rects.map(
                (
                  rect
                ) => [
                  rect.x.toFixed(
                    6
                  ),
                  rect.y.toFixed(
                    6
                  ),
                  rect.width.toFixed(
                    6
                  ),
                  rect.height.toFixed(
                    6
                  ),
                ]
              ),
          })
        );

    const source =
      JSON.stringify({
        name:
          file.name,
        size:
          file.size,
        modified:
          file.lastModified,
        geometry,
      });

    let hash =
      0x811c9dc5;

    for (
      let index = 0;
      index <
        source.length;
      index++
    ) {
      hash ^=
        source.charCodeAt(
          index
        );

      hash =
        Math.imul(
          hash,
          0x01000193
        );
    }

    return (
      hash >>> 0
    )
      .toString(
        16
      )
      .padStart(
        8,
        "0"
      );
  };

const pdfNumber =
  (
    value:
      number
  ) => {
    const rounded =
      value.toFixed(
        4
      );

    const trimmed =
      rounded.replace(
        /\.?0+$/,
        ""
      );

    return (
      trimmed ||
      "0"
    );
  };

const saveCheckpoint =
  (
    key:
      string,
    checkpoint:
      Checkpoint
  ) => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(
          checkpoint
        )
      );
    } catch (_) {
      /*
       * Processing still works without crash-resume
       * if storage quota blocks this tiny metadata entry.
       */
    }
  };

const loadCheckpoint =
  (
    key:
      string
  ):
    Checkpoint |
    null => {
    try {
      const raw =
        localStorage.getItem(
          key
        );

      if (!raw) {
        return null;
      }

      const parsed =
        JSON.parse(
          raw
        ) as
          Checkpoint;

      if (
        parsed.version !==
        1
      ) {
        return null;
      }

      return parsed;
    } catch (_) {
      return null;
    }
  };

const clearCheckpoint =
  (
    key:
      string
  ) => {
    try {
      localStorage.removeItem(
        key
      );
    } catch (_) {}
  };

const streamLargeRedaction =
  async (
    file:
      File,
    redactions:
      PageRedaction[],
    onProgress?:
      (
        current:
          number,
        total:
          number
      ) => void
  ):
    Promise<File> => {
    if (
      typeof navigator ===
        "undefined" ||
      !navigator.storage ||
      typeof navigator.storage
        .getDirectory !==
        "function"
    ) {
      throw new Error(
        "Large-file local streaming storage is unavailable in this browser."
      );
    }

    const redactionMap =
      normalizeMap(
        redactions
      );

    let totalPages =
      0;

    /*
     * Short PDF.js probe only.
     */
    {
      const probe =
        await loadPdfJsFromBlob(
          file,
          {
            stopAtErrors:
              false,
          }
        );

      try {
        totalPages =
          probe.pdf
            .numPages;
      } finally {
        await probe
          .dispose();
      }
    }

    const hash =
      localJobHash(
        file,
        redactionMap
      );

    const directoryName =
      `redact-stream-${hash}`;

    const outputName =
      `${
        file.name.replace(
          /\.pdf$/i,
          ""
        ) ||
        "document"
      }-redacted.pdf`;

    const checkpointKey =
      `oneinto1-redact-checkpoint-${hash}`;

    let checkpoint =
      loadCheckpoint(
        checkpointKey
      );

    /*
     * Validate resumable partial output before trusting it.
     */
    if (
      checkpoint
    ) {
      try {
        const stored =
          await getStoredFile(
            directoryName,
            outputName
          );

        const valid =
          checkpoint.totalPages ===
            totalPages &&
          checkpoint.directoryName ===
            directoryName &&
          checkpoint.outputName ===
            outputName &&
          checkpoint.byteOffset >=
            0 &&
          stored.size >=
            checkpoint.byteOffset;

        if (
          !valid
        ) {
          checkpoint =
            null;
        }
      } catch (_) {
        checkpoint =
          null;
      }
    }

    if (
      !checkpoint
    ) {
      clearCheckpoint(
        checkpointKey
      );

      await removeDirectory(
        directoryName
      );

      checkpoint = {
        version:
          1,

        totalPages,

        directoryName,

        outputName,

        nextPageIndex:
          0,

        byteOffset:
          0,

        nextObjectId:
          3,

        offsets:
          [
            null,
            null,
            null,
          ],

        pageObjectIds:
          [],
      };
    }

    const writer =
      await PdfStreamWriter.create(
        directoryName,
        outputName,
        checkpoint.byteOffset
      );

    const markObject =
      (
        objectId:
          number
      ) => {
        checkpoint!.offsets[
          objectId
        ] =
          writer.position;
      };

    try {
      if (
        checkpoint.byteOffset ===
        0
      ) {
        await writer.text(
          "%PDF-1.7\n%1into1-local-stream\n"
        );

        checkpoint.byteOffset =
          writer.position;

        saveCheckpoint(
          checkpointKey,
          checkpoint
        );
      }

      while (
        checkpoint.nextPageIndex <
        totalPages
      ) {
        const batchStart =
          checkpoint.nextPageIndex;

        const batchEnd =
          Math.min(
            totalPages,
            batchStart +
              PDFJS_BATCH_SIZE
          );

        const loaded =
          await loadPdfJsFromBlob(
            file,
            {
              stopAtErrors:
                false,
            }
          );

        try {
          for (
            let pageIndex =
              batchStart;
            pageIndex <
              batchEnd;
            pageIndex++
          ) {
            /*
             * A checkpoint can only advance after an entire
             * page has been written.
             */
            if (
              pageIndex !==
              checkpoint.nextPageIndex
            ) {
              break;
            }

            onProgress?.(
              pageIndex +
                1,
              totalPages
            );

            const page =
              await loaded.pdf
                .getPage(
                  pageIndex +
                    1
                );

            try {
              const unscaled =
                page.getViewport({
                  scale:
                    1.0,
                });

              const viewport =
                page.getViewport({
                  scale:
                    RENDER_SCALE,
                });

              const fullWidth =
                Math.max(
                  1,
                  Math.ceil(
                    viewport.width
                  )
                );

              const fullHeight =
                Math.max(
                  1,
                  Math.ceil(
                    viewport.height
                  )
                );

              const calculatedHeight =
                Math.floor(
                  MAX_STRIP_PIXELS /
                    fullWidth
                );

              const stripHeight =
                Math.max(
                  128,
                  Math.min(
                    fullHeight,
                    calculatedHeight
                  )
                );

              const xObjects:
                Array<{
                  name:
                    string;
                  objectId:
                    number;
                }> =
                [];

              const commands:
                string[] =
                [];

              let stripIndex =
                0;

              for (
                let top =
                  0;
                top <
                  fullHeight;
                top +=
                  stripHeight
              ) {
                const height =
                  Math.min(
                    stripHeight,
                    fullHeight -
                      top
                  );

                const canvas =
                  document
                    .createElement(
                      "canvas"
                    );

                canvas.width =
                  fullWidth;

                canvas.height =
                  height;

                const context =
                  canvas.getContext(
                    "2d",
                    {
                      alpha:
                        false,
                    }
                  );

                if (
                  !context
                ) {
                  throw new Error(
                    "Unable to create secure-redaction strip."
                  );
                }

                try {
                  context.fillStyle =
                    "#ffffff";

                  context.fillRect(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                  );

                  await (
                    page.render({
                      canvasContext:
                        context as any,

                      viewport,

                      /*
                       * Render only this horizontal portion of
                       * the page into the small canvas.
                       */
                      transform: [
                        1,
                        0,
                        0,
                        1,
                        0,
                        -top,
                      ],

                      annotationMode:
                        (
                          pdfjsLib as
                            any
                        )
                          .AnnotationMode
                          ?.ENABLE ??
                        2,
                    } as any) as any
                  ).promise;

                  /*
                   * Securely burn every redaction intersecting
                   * this strip.
                   */
                  const rects =
                    redactionMap.get(
                      pageIndex
                    ) || [];

                  if (
                    rects.length >
                    0
                  ) {
                    context.fillStyle =
                      "#000000";

                    for (
                      const rect of
                      rects
                    ) {
                      const left =
                        rect.x *
                        fullWidth;

                      const right =
                        (
                          rect.x +
                          rect.width
                        ) *
                        fullWidth;

                      const rectTop =
                        rect.y *
                        fullHeight;

                      const rectBottom =
                        (
                          rect.y +
                          rect.height
                        ) *
                        fullHeight;

                      const clippedTop =
                        Math.max(
                          top,
                          rectTop
                        );

                      const clippedBottom =
                        Math.min(
                          top +
                            height,
                          rectBottom
                        );

                      if (
                        clippedBottom <=
                        clippedTop
                      ) {
                        continue;
                      }

                      context.fillRect(
                        left,
                        clippedTop -
                          top,
                        Math.max(
                          1,
                          right -
                            left
                        ),
                        Math.max(
                          1,
                          clippedBottom -
                            clippedTop
                        )
                      );
                    }
                  }

                  const jpeg =
                    await new Promise<
                      Blob
                    >(
                      (
                        resolve,
                        reject
                      ) => {
                        canvas.toBlob(
                          (
                            blob
                          ) => {
                            if (
                              blob
                            ) {
                              resolve(
                                blob
                              );
                            } else {
                              reject(
                                new Error(
                                  `Unable to encode page ${pageIndex + 1}.`
                                )
                              );
                            }
                          },
                          "image/jpeg",
                          JPEG_QUALITY
                        );
                      }
                    );

                  const jpegBytes =
                    await jpeg
                      .arrayBuffer();

                  const imageObjectId =
                    checkpoint
                      .nextObjectId++;

                  markObject(
                    imageObjectId
                  );

                  await writer.text(
                    `${imageObjectId} 0 obj\n` +
                    `<< /Type /XObject /Subtype /Image ` +
                    `/Width ${canvas.width} ` +
                    `/Height ${canvas.height} ` +
                    `/ColorSpace /DeviceRGB ` +
                    `/BitsPerComponent 8 ` +
                    `/Filter /DCTDecode ` +
                    `/Length ${jpegBytes.byteLength} >>\n` +
                    `stream\n`
                  );

                  await writer.append(
                    jpegBytes
                  );

                  await writer.text(
                    "\nendstream\nendobj\n"
                  );

                  const resourceName =
                    `Im${stripIndex}`;

                  xObjects.push({
                    name:
                      resourceName,

                    objectId:
                      imageObjectId,
                  });

                  const stripPoints =
                    (
                      height /
                      fullHeight
                    ) *
                    unscaled.height;

                  const yPoints =
                    unscaled.height -
                    (
                      (
                        top +
                        height
                      ) /
                      fullHeight
                    ) *
                      unscaled.height;

                  commands.push(
                    "q\n" +
                    `${pdfNumber(unscaled.width)} 0 0 ` +
                    `${pdfNumber(stripPoints)} 0 ` +
                    `${pdfNumber(yPoints)} cm\n` +
                    `/${resourceName} Do\n` +
                    "Q\n"
                  );

                  stripIndex++;
                } finally {
                  canvas.width =
                    1;

                  canvas.height =
                    1;

                  try {
                    canvas.remove();
                  } catch (_) {}
                }

                /*
                 * Give iOS time to release backing pixel memory.
                 */
                await delay(
                  20
                );
              }

              const contentText =
                commands.join(
                  ""
                );

              const contentBytes =
                new TextEncoder()
                  .encode(
                    contentText
                  );

              const contentObjectId =
                checkpoint
                  .nextObjectId++;

              markObject(
                contentObjectId
              );

              await writer.text(
                `${contentObjectId} 0 obj\n` +
                `<< /Length ${contentBytes.byteLength} >>\n` +
                `stream\n`
              );

              await writer.append(
                contentBytes
              );

              await writer.text(
                "\nendstream\nendobj\n"
              );

              const pageObjectId =
                checkpoint
                  .nextObjectId++;

              markObject(
                pageObjectId
              );

              const resources =
                xObjects
                  .map(
                    (
                      item
                    ) =>
                      `/${item.name} ${item.objectId} 0 R`
                  )
                  .join(
                    " "
                  );

              await writer.text(
                `${pageObjectId} 0 obj\n` +
                `<< /Type /Page ` +
                `/Parent 2 0 R ` +
                `/MediaBox [0 0 ${pdfNumber(unscaled.width)} ${pdfNumber(unscaled.height)}] ` +
                `/Resources << /ProcSet [/PDF /ImageC] ` +
                `/XObject << ${resources} >> >> ` +
                `/Contents ${contentObjectId} 0 R >>\n` +
                `endobj\n`
              );

              checkpoint
                .pageObjectIds
                .push(
                  pageObjectId
                );

              /*
               * COMMIT THIS PAGE.
               *
               * If Safari dies after this point, the next run
               * starts at the following page.
               */
              checkpoint.nextPageIndex =
                pageIndex +
                1;

              checkpoint.byteOffset =
                writer.position;

              saveCheckpoint(
                checkpointKey,
                checkpoint
              );
            } finally {
              try {
                page.cleanup();
              } catch (_) {}
            }

            await delay(
              75
            );
          }
        } finally {
          await loaded
            .dispose();
        }

        await delay(
          250
        );
      }

      /*
       * Write page tree and catalog only after all pages exist.
       * Forward references to object 2 are legal PDF syntax.
       */

      markObject(
        2
      );

      await writer.text(
        `2 0 obj\n` +
        `<< /Type /Pages ` +
        `/Count ${checkpoint.totalPages} ` +
        `/Kids [` +
        checkpoint
          .pageObjectIds
          .map(
            (
              id
            ) =>
              `${id} 0 R`
          )
          .join(
            " "
          ) +
        `] >>\n` +
        `endobj\n`
      );

      markObject(
        1
      );

      await writer.text(
        `1 0 obj\n` +
        `<< /Type /Catalog /Pages 2 0 R >>\n` +
        `endobj\n`
      );

      const xrefOffset =
        writer.position;

      const maxObjectId =
        checkpoint
          .nextObjectId -
        1;

      let xref =
        `xref\n0 ${maxObjectId + 1}\n`;

      xref +=
        "0000000000 65535 f \n";

      for (
        let objectId =
          1;
        objectId <=
          maxObjectId;
        objectId++
      ) {
        const offset =
          checkpoint
            .offsets[
              objectId
            ];

        if (
          typeof offset ===
            "number" &&
          Number.isFinite(
            offset
          )
        ) {
          xref +=
            `${Math.floor(offset)
              .toString()
              .padStart(
                10,
                "0"
              )} 00000 n \n`;
        } else {
          xref +=
            "0000000000 00000 f \n";
        }
      }

      xref +=
        `trailer\n` +
        `<< /Size ${maxObjectId + 1} /Root 1 0 R >>\n` +
        `startxref\n` +
        `${xrefOffset}\n` +
        `%%EOF\n`;

      await writer.text(
        xref
      );

      await writer.finish();

      clearCheckpoint(
        checkpointKey
      );

      const output =
        await getStoredFile(
          directoryName,
          outputName
        );

      /*
       * Browser-backed OPFS File.
       * No complete output ArrayBuffer is created.
       */
      return new File(
        [
          output,
        ],
        outputName,
        {
          type:
            "application/pdf",

          lastModified:
            Date.now(),
        }
      );
    } catch (
      error
    ) {
      /*
       * Preserve the checkpoint and the complete pages already
       * written. Next attempt resumes instead of restarting.
       */
      try {
        await writer.abort();
      } catch (_) {}

      throw error;
    }
  };

export async function redactPDFToFile(
  file:
    File,
  redactions:
    PageRedaction[],
  onProgress?:
    (
      current:
        number,
      total:
        number
    ) => void
):
  Promise<File> {
  const redactionMap =
    normalizeMap(
      redactions
    );

  const useStreaming =
    file.size >=
      LARGE_FILE_BYTES ||
    redactionMap.size >=
      LARGE_REDACTED_PAGE_COUNT;

  if (
    useStreaming
  ) {
    return await streamLargeRedaction(
      file,
      redactions,
      onProgress
    );
  }

  /*
   * Preserve the existing vector/hybrid result for normal files.
   */
  const bytes =
    await redactPDF(
      file,
      redactions,
      onProgress
    );

  const base =
    file.name.replace(
      /\.pdf$/i,
      ""
    ) ||
    "document";

  return new File(
    [
      bytes as unknown as
        BlobPart,
    ],
    `${base}-redacted.pdf`,
    {
      type:
        "application/pdf",

      lastModified:
        Date.now(),
    }
  );
}
