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
  const verificationBlob =
    new Blob(
      [
        bytes as unknown as BlobPart,
      ],
      {
        type: "application/pdf",
      }
    );

  const {
    pdf: verificationPdf,
    dispose: disposeVerificationPdf,
  } = await loadPdfJsFromBlob(
    verificationBlob
  );

  let worker: any = null;

  const yieldToBrowser =
    () =>
      new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );

  /*
   * Create Tesseract lazily.
   *
   * A document with no selected visual targets no longer pays
   * the cost of starting the OCR engine merely to confirm that
   * the flattened PDF contains no selectable text.
   */
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
            gzip: true,
          } as any
        );

      return worker;
    };

  try {
    const selectedValues =
      selectedFindings
        .map(
          (finding) => {
            const page =
              Number.isInteger(
                finding.page
              ) &&
              Number(
                finding.page
              ) > 0
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
          (item) =>
            item.normalized.length >=
            4
        );

    /*
     * We may use targeted OCR only when EVERY selected finding
     * tells us which page it belongs to.
     *
     * If page metadata is missing for even one target, preserve
     * the original document-global OCR behaviour automatically.
     */
    const useTargetedOcr =
      selectedValues.length > 0 &&
      selectedValues.every(
        (item) =>
          item.page !== null
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

    if (useTargetedOcr) {
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

    let selectableTextFound =
      false;

    /*
     * Leaked values remain document-global.
     *
     * If one occurrence of a selected sensitive value is still
     * readable, that value fails verification exactly as before.
     */
    const leakedNormalized =
      new Set<string>();

    /*
     * Rolling-tail logic remains available for the compatibility
     * full-document OCR path.
     */
    const maxTargetLength =
      selectedValues.reduce(
        (
          max,
          item
        ) =>
          Math.max(
            max,
            item.normalized.length
          ),
        0
      );

    let rollingTail = "";

    /*
     * Hybrid secure-redaction mode only needs to inspect pages
     * which were destructively rebuilt.
     *
     * Legacy callers omit flattenedPages and retain the original
     * full-document verification behaviour.
     */
    const requestedVerificationPages =
      options.flattenedPages &&
      options.flattenedPages.size >
        0
        ? Array.from(
            options.flattenedPages
          )
            .filter(
              (pageNumber) =>
                Number.isInteger(
                  pageNumber
                ) &&
                pageNumber >=
                  1 &&
                pageNumber <=
                  verificationPdf.numPages
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
                verificationPdf.numPages,
            },
            (
              _,
              index
            ) =>
              index + 1
          );

    for (
      let verificationIndex = 0;
      verificationIndex <
        requestedVerificationPages.length;
      verificationIndex++
    ) {
      const pageNumber =
        requestedVerificationPages[
          verificationIndex
        ];

      const page =
        await verificationPdf
          .getPage(
            pageNumber
          );

      try {
        /*
         * =====================================================
         * CHECK 1 — SELECTABLE TEXT
         * =====================================================
         *
         * In legacy/full-flatten mode this runs on every page.
         *
         * In hybrid mode it runs only on pages explicitly marked
         * as flattened by the secure redaction engine.
         *
         * Untouched pages are intentionally allowed to preserve
         * their original selectable/vector content.
         */
        onProgress?.(
          `Final safety verification ${pageNumber} of ${verificationPdf.numPages}…`
        );

        const textContent =
          await page
            .getTextContent();

        const selectableText =
          textContent.items
            .map(
              (item: any) =>
                item?.str || ""
            )
            .join(" ")
            .trim();

        if (
          selectableText.length >
          0
        ) {
          selectableTextFound =
            true;
        }

        /*
         * =====================================================
         * CHECK 2 — VISUAL OCR
         * =====================================================
         *
         * When page locations are known, OCR only pages that
         * actually contain selected sensitive information.
         *
         * Pages without selected findings have nothing for the
         * value-leak OCR check to search for, but they STILL went
         * through the selectable-text check above.
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
          pageTargets.length >
          0
        ) {
          onProgress?.(
            useTargetedOcr
              ? `Safety-checking sensitive page ${pageNumber} of ${verificationPdf.numPages}…`
              : `Final OCR safety verification ${pageNumber} of ${verificationPdf.numPages}…`
          );

          const viewport =
            page.getViewport({
              scale: 1.7,
            });

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            Math.ceil(
              viewport.width
            );

          canvas.height =
            Math.ceil(
              viewport.height
            );

          try {
            const ctx =
              canvas.getContext(
                "2d",
                {
                  alpha: false,
                }
              );

            if (!ctx) {
              throw new Error(
                "Unable to create final safety verification renderer."
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

            await page.render({
              canvasContext:
                ctx,
              viewport,
              canvas,
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
                    text: true,
                  } as any
                );

            const normalizedPageText =
              normalizeForSafetyCheck(
                data?.text ||
                  ""
              );

            /*
             * Targeted mode searches only this page's selected
             * values.
             *
             * Compatibility mode preserves the previous rolling
             * document-global search behaviour.
             */
            const searchableText =
              useTargetedOcr
                ? normalizedPageText
                : (
                    rollingTail +
                    normalizedPageText
                  );

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

            if (
              !useTargetedOcr
            ) {
              if (
                maxTargetLength >
                1
              ) {
                rollingTail =
                  searchableText.slice(
                    -(
                      maxTargetLength -
                      1
                    )
                  );
              } else {
                rollingTail =
                  "";
              }
            }
          } finally {
            /*
             * Drop the pixel backing store immediately.
             * This is especially important on iOS where several
             * large canvas allocations can trigger a tab reload.
             */
            canvas.width = 1;
            canvas.height = 1;

            try {
              canvas.remove();
            } catch (_) {}
          }
        }

        /*
         * Pages skipped by OCR are now extremely cheap, but a
         * very large PDF can still contain hundreds/thousands of
         * text-layer checks. Yield periodically so mobile Safari
         * and Chrome stay responsive.
         */
        if (
          (
            verificationIndex +
            1
          ) %
            10 ===
          0
        ) {
          await yieldToBrowser();
        }
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }
    }

    const leakedValues =
      selectedValues
        .filter(
          (item) =>
            leakedNormalized.has(
              item.normalized
            )
        )
        .map(
          (item) =>
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
  } finally {
    if (worker) {
      try {
        await worker
          .terminate();
      } catch (_) {}
    }

    try {
      await disposeVerificationPdf();
    } catch (_) {}
  }
};
