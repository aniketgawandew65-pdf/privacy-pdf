import {
  loadPdfJsFromBlob,
} from "./pdfjs";

export const normalizeForSafetyCheck = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export type SafetyVerificationTarget = {
  value: string;

  /*
   * Optional page number allows the verifier to OCR only pages
   * that actually contain selected sensitive findings.
   *
   * Callers without page information automatically retain the
   * original full-document OCR verification behaviour.
   */
  page?: number;
};

export type FinalVerificationResult = {
  passed: boolean;
  leakedValues: string[];
  selectableTextFound: boolean;
};

export type FinalVerificationOptions = {
  /*
   * When omitted, preserve the original strict behaviour:
   * every page is expected to be flattened.
   *
   * When supplied, only these pages are required to have no
   * selectable text. This supports the secure hybrid redaction
   * engine where untouched pages intentionally remain lossless.
   */
  flattenedPages?: ReadonlySet<number>;
};

export const verifyFinishedPdf = async (
  bytes: Uint8Array,
  selectedFindings: SafetyVerificationTarget[],
  onProgress?: (message: string) => void,
  options: FinalVerificationOptions = {}
): Promise<FinalVerificationResult> => {
  /*
   * ==========================================================
   * MOBILE-SAFE FINAL PII VERIFIER
   * ==========================================================
   *
   * Security behaviour remains the same:
   *
   * 1. expected flattened pages must contain NO selectable text
   * 2. selected sensitive values must NOT remain visually
   *    readable through OCR
   *
   * Memory architecture changes:
   *
   * - same OCR resolution: 1.7x
   * - pages OCR'd in overlapping strips
   * - no giant full-page OCR bitmap
   * - Tesseract worker hard-reset every short page batch
   * - PDF.js document hard-reset every short page batch
   */

  const verificationBlob =
    new Blob(
      [
        bytes as unknown as
          BlobPart,
      ],
      {
        type:
          "application/pdf",
      }
    );

  const VERIFY_SCALE =
    1.7;

  const VERIFY_BATCH_SIZE =
    4;

  /*
   * Keep an individual verification canvas around
   * ~1.25 million pixels.
   *
   * OCR resolution itself remains 1.7x.
   */
  const MAX_TILE_PIXELS =
    1_250_000;

  /*
   * Enough overlap for text lines / sensitive strings around a
   * strip boundary to appear completely in at least one tile.
   */
  const TILE_OVERLAP =
    128;

  const yieldToMobile =
    (
      delay = 35
    ) =>
      new Promise<void>(
        (
          resolve
        ) =>
          setTimeout(
            resolve,
            delay
          )
      );

  const selectedValues =
    selectedFindings
      .map(
        (
          finding
        ) => {
          const page =
            Number.isInteger(
              finding.page
            ) &&
            Number(
              finding.page
            ) >
              0
              ? Number(
                  finding.page
                )
              : null;

          return {
            original:
              finding.value,
            normalized:
              normalizeForSafetyCheck(
                finding.value
              ),
            page,
          };
        }
      )
      .filter(
        (
          item
        ) =>
          item.normalized
            .length >=
          4
      );

  /*
   * Targeted OCR is safe only when every selected finding has
   * an exact page number.
   *
   * Legacy callers without page metadata automatically retain
   * document-wide checking.
   */
  const useTargetedOcr =
    selectedValues.length >
      0 &&
    selectedValues.every(
      (
        item
      ) =>
        item.page !==
        null
    );

  const targetsByPage =
    new Map<
      number,
      Array<
        (
          typeof selectedValues
        )[number]
      >
    >();

  if (
    useTargetedOcr
  ) {
    for (
      const item of
        selectedValues
    ) {
      const pageNumber =
        item.page!;

      const current =
        targetsByPage.get(
          pageNumber
        ) || [];

      current.push(
        item
      );

      targetsByPage.set(
        pageNumber,
        current
      );
    }
  }

  let totalPages =
    0;

  /*
   * Very short probe to obtain page count.
   *
   * Destroy it immediately before real verification begins.
   */
  {
    const probe =
      await loadPdfJsFromBlob(
        verificationBlob
      );

    try {
      totalPages =
        probe.pdf.numPages;
    } finally {
      await probe.dispose();
    }
  }

  const requestedVerificationPages =
    options.flattenedPages &&
    options.flattenedPages
      .size >
      0
      ? Array.from(
          options
            .flattenedPages
        )
          .filter(
            (
              pageNumber
            ) =>
              Number.isInteger(
                pageNumber
              ) &&
              pageNumber >=
                1 &&
              pageNumber <=
                totalPages
          )
          .sort(
            (
              a,
              b
            ) =>
              a - b
          )
      : Array.from(
          {
            length:
              totalPages,
          },
          (
            _,
            index
          ) =>
            index + 1
        );

  let selectableTextFound =
    false;

  const leakedNormalized =
    new Set<string>();

  /*
   * Compatibility rolling tail for callers which do not provide
   * page-aware targets.
   */
  const maxTargetLength =
    selectedValues.reduce(
      (
        max,
        item
      ) =>
        Math.max(
          max,
          item.normalized
            .length
        ),
      0
    );

  let documentRollingTail =
    "";

  for (
    let batchStart = 0;
    batchStart <
      requestedVerificationPages.length;
    batchStart +=
      VERIFY_BATCH_SIZE
  ) {
    const batchPages =
      requestedVerificationPages.slice(
        batchStart,
        batchStart +
          VERIFY_BATCH_SIZE
      );

    let loaded:
      | Awaited<
          ReturnType<
            typeof loadPdfJsFromBlob
          >
        >
      | null =
      null;

    let worker: any =
      null;

    const getWorker =
      async () => {
        if (worker) {
          return worker;
        }

        const {
          createWorker,
        } =
          await import(
            "tesseract.js"
          );

        worker =
          await createWorker(
            "eng",
            1,
            {
              workerPath:
                "/tessdata/worker.min.js",
              corePath:
                "/tessdata/tesseract-core-simd-lstm.wasm.js",
              langPath:
                "/tessdata",
              gzip:
                true,
            } as any
          );

        return worker;
      };

    try {
      /*
       * Fresh PDF.js session for only this short batch.
       */
      loaded =
        await loadPdfJsFromBlob(
          verificationBlob
        );

      const pdf =
        loaded.pdf;

      for (
        let localIndex = 0;
        localIndex <
          batchPages.length;
        localIndex++
      ) {
        const pageNumber =
          batchPages[
            localIndex
          ];

        const page =
          await pdf.getPage(
            pageNumber
          );

        try {
          /*
           * ===================================================
           * CHECK 1 — SELECTABLE TEXT
           * ===================================================
           *
           * Every page requested for flatten verification must
           * contain no selectable text.
           */
          onProgress?.(
            `Final safety verification ${pageNumber} of ${totalPages}…`
          );

          const textContent =
            await page
              .getTextContent();

          const selectableText =
            textContent.items
              .map(
                (
                  item: any
                ) =>
                  item?.str ||
                  ""
              )
              .join(
                " "
              )
              .trim();

          if (
            selectableText.length >
            0
          ) {
            selectableTextFound =
              true;
          }

          /*
           * ===================================================
           * CHECK 2 — VISUAL OCR
           * ===================================================
           */
          const pageTargets =
            useTargetedOcr
              ? (
                  targetsByPage.get(
                    pageNumber
                  ) || []
                )
              : selectedValues;

          if (
            pageTargets.length ===
            0
          ) {
            continue;
          }

          onProgress?.(
            useTargetedOcr
              ? `Safety-checking sensitive page ${pageNumber} of ${totalPages}…`
              : `Final OCR safety verification ${pageNumber} of ${totalPages}…`
          );

          /*
           * Same 1.7x page resolution as the old verifier.
           *
           * We never allocate the whole bitmap at once.
           */
          const fullViewport =
            page.getViewport({
              scale:
                VERIFY_SCALE,
            });

          const fullWidth =
            Math.max(
              1,
              Math.ceil(
                fullViewport.width
              )
            );

          const fullHeight =
            Math.max(
              1,
              Math.ceil(
                fullViewport.height
              )
            );

          const calculatedHeight =
            Math.floor(
              MAX_TILE_PIXELS /
                fullWidth
            );

          const tileHeight =
            Math.max(
              300,
              Math.min(
                1000,
                calculatedHeight
              )
            );

          /*
           * Rolling text tail catches a sensitive value which OCR
           * happens to divide between adjacent strips.
           */
          let pageRollingTail =
            useTargetedOcr
              ? ""
              : documentRollingTail;

          let tileTop =
            0;

          let tileIndex =
            0;

          while (
            tileTop <
            fullHeight
          ) {
            const tileBottom =
              Math.min(
                fullHeight,
                tileTop +
                  tileHeight
              );

            const currentHeight =
              Math.max(
                1,
                tileBottom -
                  tileTop
              );

            const canvas =
              document.createElement(
                "canvas"
              );

            canvas.width =
              fullWidth;

            canvas.height =
              currentHeight;

            try {
              const ctx =
                canvas.getContext(
                  "2d",
                  {
                    alpha:
                      false,
                  }
                );

              if (!ctx) {
                throw new Error(
                  "Unable to create final safety verification tile."
                );
              }

              ctx.fillStyle =
                "#ffffff";

              ctx.fillRect(
                0,
                0,
                canvas.width,
                canvas.height
              );

              /*
               * Render this strip from the SAME 1.7x viewport.
               */
              await page.render({
                canvasContext:
                  ctx,
                viewport:
                  fullViewport,
                canvas,
                transform: [
                  1,
                  0,
                  0,
                  1,
                  0,
                  -tileTop,
                ],
              } as any).promise;

              const activeWorker =
                await getWorker();

              const {
                data,
              } =
                await activeWorker
                  .recognize(
                    canvas,
                    {},
                    {
                      text:
                        true,
                    } as any
                  );

              const normalizedTileText =
                normalizeForSafetyCheck(
                  data?.text ||
                    ""
                );

              const searchableText =
                pageRollingTail +
                normalizedTileText;

              for (
                const item of
                  pageTargets
              ) {
                if (
                  leakedNormalized.has(
                    item.normalized
                  )
                ) {
                  continue;
                }

                if (
                  searchableText.includes(
                    item.normalized
                  )
                ) {
                  leakedNormalized.add(
                    item.normalized
                  );
                }
              }

              /*
               * Preserve enough characters to detect a target
               * crossing from this tile into the next tile.
               */
              if (
                maxTargetLength >
                1
              ) {
                pageRollingTail =
                  searchableText.slice(
                    -(
                      maxTargetLength -
                      1
                    )
                  );
              } else {
                pageRollingTail =
                  "";
              }
            } finally {
              /*
               * Critical iOS memory release.
               */
              canvas.width =
                1;

              canvas.height =
                1;

              try {
                canvas.remove();
              } catch (_) {}
            }

            tileIndex++;

            if (
              tileBottom >=
              fullHeight
            ) {
              break;
            }

            tileTop =
              Math.max(
                tileTop + 1,
                tileBottom -
                  TILE_OVERLAP
              );

            /*
             * Give Safari a chance to release this tile before
             * another render/OCR allocation begins.
             */
            await yieldToMobile(
              30
            );
          }

          if (
            !useTargetedOcr
          ) {
            documentRollingTail =
              pageRollingTail;
          }

          await yieldToMobile(
            50
          );
        } finally {
          try {
            page.cleanup();
          } catch (_) {}
        }
      }
    } finally {
      /*
       * TRUE HARD RESET after a few verified pages.
       */
      if (worker) {
        try {
          await worker
            .terminate();
        } catch (_) {}

        worker =
          null;
      }

      if (loaded) {
        try {
          await loaded
            .dispose();
        } catch (_) {}

        loaded =
          null;
      }
    }

    if (
      batchStart +
        VERIFY_BATCH_SIZE <
      requestedVerificationPages.length
    ) {
      await yieldToMobile(
        300
      );
    }
  }

  const leakedValues =
    selectedValues
      .filter(
        (
          item
        ) =>
          leakedNormalized.has(
            item.normalized
          )
      )
      .map(
        (
          item
        ) =>
          item.original
      );

  return {
    passed:
      !selectableTextFound &&
      leakedValues.length ===
        0,
    leakedValues,
    selectableTextFound,
  };
};
