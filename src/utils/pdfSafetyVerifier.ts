import { pdfjsLib } from "./pdfjs";

export const normalizeForSafetyCheck = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export type SafetyVerificationTarget = {
  value: string;
};

export type FinalVerificationResult = {
  passed: boolean;
  leakedValues: string[];
  selectableTextFound: boolean;

  /*
   * Supplementary review metadata only.
   *
   * Key   = normalized sensitive value
   * Value = pages where final OCR could still read it
   *
   * IMPORTANT:
   * This does NOT control pass/fail.
   * Existing whole-document safety logic remains authoritative.
   */
  leakedPagesByValue: Record<string, number[]>;
};

export const verifyFinishedPdf = async (
  bytes: Uint8Array,
  selectedFindings: SafetyVerificationTarget[],
  onProgress?: (message: string) => void
): Promise<FinalVerificationResult> => {
  const verificationPdf = await pdfjsLib.getDocument({
    data: bytes.slice(),
  }).promise;

  let worker: any = null;

  try {
    const selectedValues = selectedFindings
      .map((finding) => ({
        original: finding.value,
        normalized: normalizeForSafetyCheck(finding.value),
      }))
      .filter((item) => item.normalized.length >= 4);

    let selectableTextFound = false;
    let visibleText = "";

    // Page-specific OCR evidence for the review UI only.
    const leakedPagesByValue: Record<string, number[]> = {};

    const { createWorker } = await import("tesseract.js");

    worker = await createWorker(
      "eng",
      1,
      {
        workerPath: "/tessdata/worker.min.js",
        corePath: "/tessdata/tesseract-core-simd-lstm.wasm.js",
        langPath: "/tessdata",
        gzip: true,
      } as any
    );

    for (
      let pageNumber = 1;
      pageNumber <= verificationPdf.numPages;
      pageNumber++
    ) {
      onProgress?.(
        `Final safety verification ${pageNumber} of ${verificationPdf.numPages}…`
      );

      const page =
        await verificationPdf.getPage(pageNumber);

      const textContent =
        await page.getTextContent();

      const selectableText =
        textContent.items
          .map((item: any) => item?.str || "")
          .join(" ")
          .trim();

      if (selectableText.length > 0) {
        selectableTextFound = true;
      }

      const viewport =
        page.getViewport({ scale: 1.7 });

      const canvas =
        document.createElement("canvas");

      canvas.width =
        Math.ceil(viewport.width);

      canvas.height =
        Math.ceil(viewport.height);

      const ctx =
        canvas.getContext("2d", {
          alpha: false,
        });

      if (!ctx) {
        throw new Error(
          "Unable to create final safety verification renderer."
        );
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      await page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      } as any).promise;

      const { data } =
        await worker.recognize(
          canvas,
          {},
          {
            text: true,
          } as any
        );

      const pageVisibleText =
        normalizeForSafetyCheck(
          data?.text || ""
        );

      for (const item of selectedValues) {
        if (
          pageVisibleText.includes(
            item.normalized
          )
        ) {
          const pages =
            leakedPagesByValue[item.normalized] || [];

          if (!pages.includes(pageNumber)) {
            pages.push(pageNumber);
          }

          leakedPagesByValue[item.normalized] =
            pages;
        }
      }

      /*
       * Keep the original whole-document verification
       * completely unchanged.
       */
      visibleText +=
        ` ${data?.text || ""}`;

      canvas.width = 1;
      canvas.height = 1;
    }

    const normalizedVisibleText =
      normalizeForSafetyCheck(
        visibleText
      );

    const leakedValues =
      selectedValues
        .filter((item) =>
          normalizedVisibleText.includes(
            item.normalized
          )
        )
        .map((item) => item.original);

    return {
      passed:
        !selectableTextFound &&
        leakedValues.length === 0,
      leakedValues,
      selectableTextFound,
      leakedPagesByValue,
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (_) {}
    }

    try {
      await verificationPdf.destroy();
    } catch (_) {}
  }
};
