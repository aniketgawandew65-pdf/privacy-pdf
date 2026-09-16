/*
 * ============================================================
 * 1into1 SHARED MOBILE OCR CORE
 * ============================================================
 *
 * Shared recognition contract for tools that need local OCR:
 *
 * - Private PII
 * - Searchable OCR
 * - later: Universal / Markdown where appropriate
 *
 * Important:
 * Tesseract.js does NOT reliably expose positional word geometry
 * unless structured outputs are explicitly requested.
 *
 * Never call worker.recognize(image) directly in heavy tools.
 */

export const MOBILE_OCR_SCALE =
  1.6;

export const MOBILE_OCR_MAX_TILE_PIXELS =
  1_400_000;

export const MOBILE_OCR_TILE_OVERLAP =
  96;


export type MobileOcrWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};


const parseHocrBbox =
  (
    title:
      string |
      null
  ):
    Omit<
      MobileOcrWord,
      'text'
    > |
    null => {
    if (!title) {
      return null;
    }


    const match =
      title.match(
        /bbox\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/
      );


    if (!match) {
      return null;
    }


    return {
      x0:
        Number(
          match[1]
        ),

      y0:
        Number(
          match[2]
        ),

      x1:
        Number(
          match[3]
        ),

      y1:
        Number(
          match[4]
        ),
    };
  };


/*
 * THIS is the important shared recognition contract.
 *
 * It is the same structured-output request already proven by
 * Private PII.
 */
export const recognizeMobileOcrTile =
  async (
    worker:
      any,

    image:
      any
  ): Promise<any> =>
    await worker.recognize(
      image,
      {},
      {
        text:
          true,

        blocks:
          true,

        hocr:
          true,
      }
    );


/*
 * Extract positioned OCR words robustly across Tesseract
 * versions.
 *
 * Priority:
 *
 * 1. hOCR
 * 2. structured blocks
 * 3. legacy data.words
 */
export const extractMobileOcrLines =
  (
    data:
      any
  ):
    MobileOcrWord[][] => {
    const result:
      MobileOcrWord[][] =
      [];


    // ========================================================
    // 1. hOCR
    // ========================================================

    if (
      typeof data?.hocr ===
        'string' &&
      data.hocr.trim()
    ) {
      try {
        const doc =
          new DOMParser()
            .parseFromString(
              data.hocr,
              'text/html'
            );


        const lineElements =
          Array.from(
            doc.querySelectorAll(
              '.ocr_line, .ocrx_line'
            )
          );


        for (
          const lineElement of
          lineElements
        ) {
          const words:
            MobileOcrWord[] =
            [];


          const wordElements =
            Array.from(
              lineElement
                .querySelectorAll(
                  '.ocrx_word'
                )
            );


          for (
            const wordElement of
            wordElements
          ) {
            const text =
              wordElement
                .textContent
                ?.trim() ||
              '';


            const bbox =
              parseHocrBbox(
                wordElement
                  .getAttribute(
                    'title'
                  )
              );


            if (
              !text ||
              !bbox
            ) {
              continue;
            }


            words.push({
              text,
              ...bbox,
            });
          }


          if (
            words.length >
            0
          ) {
            result.push(
              words
            );
          }
        }
      } catch (_) {
        /*
         * Continue to structured fallback.
         */
      }
    }


    if (
      result.length >
      0
    ) {
      return result;
    }


    // ========================================================
    // 2. STRUCTURED BLOCKS
    // ========================================================

    if (
      Array.isArray(
        data?.blocks
      )
    ) {
      for (
        const block of
        data.blocks
      ) {
        const paragraphs =
          Array.isArray(
            block?.paragraphs
          )
            ? block.paragraphs
            : [];


        for (
          const paragraph of
          paragraphs
        ) {
          const lines =
            Array.isArray(
              paragraph?.lines
            )
              ? paragraph.lines
              : [];


          for (
            const line of
            lines
          ) {
            const rawWords =
              Array.isArray(
                line?.words
              )
                ? line.words
                : [];


            const words:
              MobileOcrWord[] =
              [];


            for (
              const word of
              rawWords
            ) {
              const text =
                String(
                  word?.text ||
                  ''
                ).trim();


              const bbox =
                word?.bbox;


              if (
                !text ||
                !bbox ||
                !Number.isFinite(
                  bbox.x0
                ) ||
                !Number.isFinite(
                  bbox.y0
                ) ||
                !Number.isFinite(
                  bbox.x1
                ) ||
                !Number.isFinite(
                  bbox.y1
                )
              ) {
                continue;
              }


              words.push({
                text,

                x0:
                  bbox.x0,

                y0:
                  bbox.y0,

                x1:
                  bbox.x1,

                y1:
                  bbox.y1,
              });
            }


            if (
              words.length >
              0
            ) {
              result.push(
                words
              );
            }
          }
        }
      }
    }


    if (
      result.length >
      0
    ) {
      return result;
    }


    // ========================================================
    // 3. LEGACY data.words
    // ========================================================

    if (
      Array.isArray(
        data?.words
      )
    ) {
      const groups =
        new Map<
          string,
          MobileOcrWord[]
        >();


      for (
        const word of
        data.words
      ) {
        const text =
          String(
            word?.text ||
            ''
          ).trim();


        const bbox =
          word?.bbox;


        if (
          !text ||
          !bbox ||
          !Number.isFinite(
            bbox.x0
          ) ||
          !Number.isFinite(
            bbox.y0
          ) ||
          !Number.isFinite(
            bbox.x1
          ) ||
          !Number.isFinite(
            bbox.y1
          )
        ) {
          continue;
        }


        const key =
          word?.line_num !=
            null
            ? `${
                word.block_num ??
                0
              }:${
                word.par_num ??
                0
              }:${
                word.line_num
              }`
            : `fallback-${
                Math.round(
                  bbox.y0 /
                  12
                )
              }`;


        const current =
          groups.get(
            key
          ) ||
          [];


        current.push({
          text,

          x0:
            bbox.x0,

          y0:
            bbox.y0,

          x1:
            bbox.x1,

          y1:
            bbox.y1,
        });


        groups.set(
          key,
          current
        );
      }


      return Array.from(
        groups.values()
      );
    }


    return result;
  };


export const flattenMobileOcrWords =
  (
    data:
      any
  ):
    MobileOcrWord[] =>
      extractMobileOcrLines(
        data
      ).flat();
