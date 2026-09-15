import {
  loadPdfJsFromBlob,
} from "./pdfjs";

export const normalizeForSafetyCheck = (
  value: string
) =>
  value
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ""
    );

export type SafetyVerificationRegion = {
  /*
   * Normalized browser/page coordinates.
   * 0.0 -> 1.0
   *
   * Same coordinate system used by redactPDF().
   */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SafetyVerificationTarget = {
  /*
   * Stable finding ID lets Private PII identify the EXACT
   * redaction which failed verification.
   */
  id?: string;

  value: string;
  page?: number;

  /*
   * Exact expected blackout position in the finished PDF.
   *
   * Private PII supplies this for every automatic finding.
   */
  region?: SafetyVerificationRegion;
};

export type FinalVerificationResult = {
  passed: boolean;

  /*
   * Retained for compatibility with existing callers/UI.
   *
   * These values now correspond to targets whose final blackout
   * could not be confirmed.
   */
  leakedValues: string[];

  /*
   * Exact IDs are more precise than matching duplicate values.
   */
  failedTargetIds: string[];

  selectableTextFound: boolean;
};

export type FinalVerificationOptions = {
  /*
   * Hybrid secure redaction leaves untouched pages vector/lossless.
   *
   * Only pages listed here are expected to have been destructively
   * flattened by the secure redaction engine.
   *
   * If omitted, every page is treated as flattened.
   */
  flattenedPages?: ReadonlySet<number>;
};

const clamp01 = (
  value: number
) =>
  Math.max(
    0,
    Math.min(
      1,
      value
    )
  );

export const verifyFinishedPdf = async (
  source:
    | Uint8Array
    | Blob,
  selectedFindings:
    SafetyVerificationTarget[],
  onProgress?: (
    message: string
  ) => void,
  options:
    FinalVerificationOptions =
      {}
): Promise<FinalVerificationResult> => {
  /*
   * ==========================================================
   * DETERMINISTIC FINAL REDACTION VERIFIER
   * ==========================================================
   *
   * IMPORTANT:
   *
   * This deliberately does NOT run OCR.
   *
   * The heavy OCR scanner has already located the sensitive
   * information and created exact page-space boxes.
   *
   * redactPDF() then permanently burns those boxes into
   * rasterized redacted pages.
   *
   * The final job is therefore:
   *
   *   A) verify the affected page contains no selectable text
   *   B) verify the exact expected redaction pixels are black
   *
   * This validates the FINISHED output without another
   * Tesseract/WASM pass.
   */

  const verificationBlob =
    source instanceof Blob
      ? source
      : new Blob(
          [
            source as unknown as
              BlobPart,
          ],
          {
            type:
              "application/pdf",
          }
        );

  /*
   * No high-resolution OCR is required.
   *
   * 1.15x gives plenty of pixels for reliable blackout sampling
   * while keeping memory dramatically below the old 1.7x OCR
   * verifier.
   */
  const VERIFY_SCALE =
    1.15;

  /*
   * Hard-reset PDF.js regularly on mobile.
   *
   * There is no Tesseract worker anymore.
   */
  const PAGE_BATCH_SIZE =
    6;

  const yieldToMobile =
    (
      delay = 30
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

  /*
   * Short probe to get page count.
   */
  let totalPages =
    0;

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

  /*
   * Normalize target metadata.
   */
  const targets =
    selectedFindings.map(
      (
        finding,
        index
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
          id:
            finding.id ||
            `verification-${index}`,
          value:
            finding.value,
          page,
          region:
            finding.region ||
            null,
        };
      }
    );

  const targetsByPage =
    new Map<
      number,
      typeof targets
    >();

  for (
    const target of
      targets
  ) {
    if (
      target.page ===
      null
    ) {
      continue;
    }

    const current =
      targetsByPage.get(
        target.page
      ) || [];

    current.push(
      target
    );

    targetsByPage.set(
      target.page,
      current
    );
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

  const failedTargetIds =
    new Set<string>();

  const failedValues =
    new Map<
      string,
      string
    >();

  let selectableTextFound =
    false;

  /*
   * Fail safely if a target that is supposed to be verified
   * does not contain enough geometry information.
   *
   * Never silently pass an un-verifiable selected finding.
   */
  for (
    const target of
      targets
  ) {
    if (
      target.page ===
        null ||
      !target.region
    ) {
      failedTargetIds.add(
        target.id
      );

      failedValues.set(
        target.id,
        target.value
      );
    }
  }

  /*
   * ==========================================================
   * VERIFY SHORT PAGE BATCHES
   * ==========================================================
   */
  for (
    let batchStart = 0;
    batchStart <
      requestedVerificationPages
        .length;
    batchStart +=
      PAGE_BATCH_SIZE
  ) {
    const batchPages =
      requestedVerificationPages.slice(
        batchStart,
        batchStart +
          PAGE_BATCH_SIZE
      );

    let loaded:
      | Awaited<
          ReturnType<
            typeof loadPdfJsFromBlob
          >
        >
      | null =
      null;

    try {
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

        onProgress?.(
          `Verifying secure blackout page ${pageNumber} of ${totalPages}…`
        );

        const page =
          await pdf.getPage(
            pageNumber
          );

        try {
          /*
           * ===================================================
           * CHECK 1 — FLATTENED PAGE MUST HAVE NO TEXT LAYER
           * ===================================================
           */
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

            /*
             * A page expected to be destructively flattened
             * should contain no selectable text.
             *
             * If that invariant fails, every selected finding
             * on this page becomes a concrete manual-review
             * item so the suggestion box is never empty.
             */
            const pageFailureTargets =
              targetsByPage.get(
                pageNumber
              ) || [];

            for (
              const target of
                pageFailureTargets
            ) {
              failedTargetIds.add(
                target.id
              );

              failedValues.set(
                target.id,
                target.value
              );
            }
          }

          const pageTargets =
            targetsByPage.get(
              pageNumber
            ) || [];

          if (
            pageTargets.length ===
            0
          ) {
            continue;
          }

          /*
           * ===================================================
           * CHECK 2 — RENDER ONLY THE AREA AROUND BLACKOUTS
           * ===================================================
           *
           * Instead of rendering/OCRing the complete page,
           * calculate one bounding crop containing this page's
           * expected redaction boxes.
           */
          const validRegions =
            pageTargets
              .map(
                (
                  target
                ) => {
                  const region =
                    target.region;

                  if (!region) {
                    return null;
                  }

                  const x =
                    clamp01(
                      region.x
                    );

                  const y =
                    clamp01(
                      region.y
                    );

                  const width =
                    Math.max(
                      0,
                      Math.min(
                        1 - x,
                        region.width
                      )
                    );

                  const height =
                    Math.max(
                      0,
                      Math.min(
                        1 - y,
                        region.height
                      )
                    );

                  if (
                    width <=
                      0 ||
                    height <=
                      0
                  ) {
                    failedTargetIds.add(
                      target.id
                    );

                    failedValues.set(
                      target.id,
                      target.value
                    );

                    return null;
                  }

                  return {
                    target,
                    x,
                    y,
                    width,
                    height,
                  };
                }
              )
              .filter(
                Boolean
              ) as Array<{
                target:
                  (
                    typeof targets
                  )[number];
                x: number;
                y: number;
                width: number;
                height: number;
              }>;

          if (
            validRegions.length ===
            0
          ) {
            continue;
          }

          /*
           * Small margin around all expected boxes.
           *
           * The sampled verification itself still checks the
           * INSIDE of each exact blackout box.
           */
          const cropMargin =
            0.01;

          const cropLeft =
            Math.max(
              0,
              Math.min(
                ...validRegions.map(
                  (
                    region
                  ) =>
                    region.x
                )
              ) -
                cropMargin
            );

          const cropTop =
            Math.max(
              0,
              Math.min(
                ...validRegions.map(
                  (
                    region
                  ) =>
                    region.y
                )
              ) -
                cropMargin
            );

          const cropRight =
            Math.min(
              1,
              Math.max(
                ...validRegions.map(
                  (
                    region
                  ) =>
                    region.x +
                    region.width
                )
              ) +
                cropMargin
            );

          const cropBottom =
            Math.min(
              1,
              Math.max(
                ...validRegions.map(
                  (
                    region
                  ) =>
                    region.y +
                    region.height
                )
              ) +
                cropMargin
            );

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

          const cropLeftPx =
            Math.floor(
              cropLeft *
                fullWidth
            );

          const cropTopPx =
            Math.floor(
              cropTop *
                fullHeight
            );

          const cropRightPx =
            Math.ceil(
              cropRight *
                fullWidth
            );

          const cropBottomPx =
            Math.ceil(
              cropBottom *
                fullHeight
            );

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            Math.max(
              1,
              cropRightPx -
                cropLeftPx
            );

          canvas.height =
            Math.max(
              1,
              cropBottomPx -
                cropTopPx
            );

          try {
            const ctx =
              canvas.getContext(
                "2d",
                {
                  alpha:
                    false,
                  willReadFrequently:
                    true,
                }
              );

            if (!ctx) {
              throw new Error(
                "Unable to create final blackout verification renderer."
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
             * Render only this page crop.
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
                -cropLeftPx,
                -cropTopPx,
              ],
            } as any).promise;

            /*
             * =================================================
             * VERIFY EVERY EXPECTED BLACKOUT
             * =================================================
             *
             * We sample the INNER portion of the expected box.
             *
             * Ignoring a small edge avoids JPEG anti-aliasing /
             * compression around the rectangle boundary.
             */
            for (
              const region of
                validRegions
            ) {
              const insetRatio =
                0.16;

              const innerLeft =
                (
                  region.x +
                  region.width *
                    insetRatio
                ) *
                  fullWidth -
                cropLeftPx;

              const innerTop =
                (
                  region.y +
                  region.height *
                    insetRatio
                ) *
                  fullHeight -
                cropTopPx;

              const innerRight =
                (
                  region.x +
                  region.width *
                    (
                      1 -
                      insetRatio
                    )
                ) *
                  fullWidth -
                cropLeftPx;

              const innerBottom =
                (
                  region.y +
                  region.height *
                    (
                      1 -
                      insetRatio
                    )
                ) *
                  fullHeight -
                cropTopPx;

              const sampleX =
                Math.max(
                  0,
                  Math.floor(
                    innerLeft
                  )
                );

              const sampleY =
                Math.max(
                  0,
                  Math.floor(
                    innerTop
                  )
                );

              const sampleRight =
                Math.min(
                  canvas.width,
                  Math.ceil(
                    innerRight
                  )
                );

              const sampleBottom =
                Math.min(
                  canvas.height,
                  Math.ceil(
                    innerBottom
                  )
                );

              const sampleWidth =
                Math.max(
                  1,
                  sampleRight -
                    sampleX
                );

              const sampleHeight =
                Math.max(
                  1,
                  sampleBottom -
                    sampleY
                );

              let imageData:
                ImageData;

              try {
                imageData =
                  ctx.getImageData(
                    sampleX,
                    sampleY,
                    sampleWidth,
                    sampleHeight
                  );
              } catch (_) {
                failedTargetIds.add(
                  region.target
                    .id
                );

                failedValues.set(
                  region.target
                    .id,
                  region.target
                    .value
                );

                continue;
              }

              const data =
                imageData.data;

              /*
               * Cap work for very large boxes while still
               * sampling thousands of pixels.
               */
              const pixelCount =
                sampleWidth *
                sampleHeight;

              const stride =
                Math.max(
                  1,
                  Math.floor(
                    Math.sqrt(
                      pixelCount /
                        6000
                    )
                  )
                );

              let sampled =
                0;

              let darkPixels =
                0;

              for (
                let y = 0;
                y <
                  sampleHeight;
                y += stride
              ) {
                for (
                  let x = 0;
                  x <
                    sampleWidth;
                  x += stride
                ) {
                  const offset =
                    (
                      y *
                        sampleWidth +
                      x
                    ) *
                    4;

                  const r =
                    data[
                      offset
                    ];

                  const g =
                    data[
                      offset +
                        1
                    ];

                  const b =
                    data[
                      offset +
                        2
                    ];

                  /*
                   * Standard perceived luminance approximation.
                   */
                  const luminance =
                    (
                      r *
                        299 +
                      g *
                        587 +
                      b *
                        114
                    ) /
                    1000;

                  sampled++;

                  /*
                   * Burned black at JPEG 0.92 remains far below
                   * this threshold even with compression.
                   */
                  if (
                    luminance <
                    95
                  ) {
                    darkPixels++;
                  }
                }
              }

              const darkRatio =
                sampled >
                0
                  ? darkPixels /
                    sampled
                  : 0;

              /*
               * A proper burned blackout should be almost
               * entirely dark.
               *
               * Normal black text on a white page cannot reach
               * this ratio, so an unredacted text region fails.
               */
              if (
                darkRatio <
                0.82
              ) {
                failedTargetIds.add(
                  region.target
                    .id
                );

                failedValues.set(
                  region.target
                    .id,
                  region.target
                    .value
                );
              }
            }
          } finally {
            /*
             * Release crop backing store immediately.
             */
            canvas.width =
              1;

            canvas.height =
              1;

            try {
              canvas.remove();
            } catch (_) {}
          }

          await yieldToMobile(
            20
          );
        } finally {
          try {
            page.cleanup();
          } catch (_) {}
        }
      }
    } finally {
      /*
       * Full PDF.js hard reset every short batch.
       */
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
        PAGE_BATCH_SIZE <
      requestedVerificationPages
        .length
    ) {
      await yieldToMobile(
        120
      );
    }
  }

  const failedIds =
    Array.from(
      failedTargetIds
    );

  const leakedValues =
    failedIds
      .map(
        (
          id
        ) =>
          failedValues.get(
            id
          ) || ""
      )
      .filter(
        Boolean
      );

  return {
    passed:
      !selectableTextFound &&
      failedIds.length ===
        0,

    leakedValues,

    failedTargetIds:
      failedIds,

    selectableTextFound,
  };
};
