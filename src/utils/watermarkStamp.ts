import {
  PDFDocument,
} from 'pdf-lib';

import type {
  WatermarkOptions,
} from './pdfEngine';


export type WatermarkPageSize = {
  width: number;
  height: number;
};


const loadImage =
  async (
    dataUrl: string
  ): Promise<HTMLImageElement> =>
    await new Promise(
      (
        resolve,
        reject
      ) => {
        const image =
          new Image();

        image.onload =
          () =>
            resolve(
              image
            );

        image.onerror =
          () =>
            reject(
              new Error(
                'Unable to load watermark image.'
              )
            );

        image.src =
          dataUrl;
      }
    );


const paintWatermark =
  async (
    ctx:
      CanvasRenderingContext2D,

    pageWidth:
      number,

    pageHeight:
      number,

    options:
      WatermarkOptions,

    logo:
      HTMLImageElement |
      null
  ) => {
    const opacity =
      options.opacity ??
      0.25;

    const angleDeg =
      options.angle ??
      -45;

    const previewPageWidth =
      Math.max(
        1,
        options.previewPageWidth ??
          460
      );


    ctx.save();


    try {
      ctx.globalAlpha =
        opacity;


      let posX =
        pageWidth /
        2;

      let posY =
        pageHeight /
        2;


      if (
        options.position ===
        'top'
      ) {
        posY =
          pageHeight *
          0.14;
      }


      if (
        options.position ===
        'bottom'
      ) {
        posY =
          pageHeight *
          0.86;
      }


      ctx.translate(
        posX,
        posY
      );


      ctx.rotate(
        (
          angleDeg *
          Math.PI
        ) /
          180
      );


      if (
        options.type ===
          'text' &&
        options.text?.trim()
      ) {
        const scaleNormalization =
          pageWidth /
          previewPageWidth;


        const previewFontSize =
          (
            options.fontSize ??
            48
          ) *
          0.46;


        const finalFontSize =
          previewFontSize *
          scaleNormalization;


        let fontFamilyCSS =
          'Helvetica, Arial, sans-serif';


        if (
          options.fontFamily ===
          'TimesRoman'
        ) {
          fontFamilyCSS =
            '"Times New Roman", Times, serif';
        }


        if (
          options.fontFamily ===
          'Courier'
        ) {
          fontFamilyCSS =
            '"Courier New", Courier, monospace';
        }


        ctx.font =
          `bold ${finalFontSize}px ${fontFamilyCSS}`;


        ctx.fillStyle =
          options.colorHex ||
          '#dc2626';


        ctx.textBaseline =
          'middle';


        const text =
          options.text.trim();


        const spacingPx =
          (
            options.letterSpacing ??
            0
          ) *
          6 *
          scaleNormalization;


        const chars =
          text.split('');


        let totalWidth =
          0;


        const widths =
          chars.map(
            (
              char
            ) => {
              const width =
                ctx.measureText(
                  char
                ).width;

              totalWidth +=
                width;

              return width;
            }
          );


        totalWidth +=
          spacingPx *
          Math.max(
            0,
            chars.length -
              1
          );


        let currentX =
          -totalWidth /
          2;


        chars.forEach(
          (
            char,
            index
          ) => {
            ctx.fillText(
              char,
              currentX,
              0
            );


            currentX +=
              widths[index] +
              spacingPx;
          }
        );


        return;
      }


      if (
        options.type ===
          'image' &&
        logo
      ) {
        const scaleNormalization =
          pageWidth /
          previewPageWidth;


        const previewLogoWidth =
          (
            options.fontSize ??
            50
          ) *
          2.2;


        const logoWidth =
          previewLogoWidth *
          scaleNormalization;


        const sourceWidth =
          Math.max(
            1,
            logo.naturalWidth ||
              logo.width ||
              1
          );


        const sourceHeight =
          Math.max(
            1,
            logo.naturalHeight ||
              logo.height ||
              1
          );


        const logoHeight =
          logoWidth *
          (
            sourceHeight /
            sourceWidth
          );


        ctx.drawImage(
          logo,
          -logoWidth /
            2,
          -logoHeight /
            2,
          logoWidth,
          logoHeight
        );
      }
    } finally {
      ctx.restore();
    }
  };


export const buildWatermarkStampPdf =
  async (
    pageSizes:
      WatermarkPageSize[],

    options:
      WatermarkOptions
  ): Promise<Uint8Array> => {
    if (
      pageSizes.length ===
      0
    ) {
      throw new Error(
        'Unable to determine PDF page sizes.'
      );
    }


    const stampDoc =
      await PDFDocument.create();


    const overlayCache =
      new Map<
        string,
        any
      >();


    const logo =
      (
        options.type ===
          'image' &&
        options.imageDataUrl
      )
        ? await loadImage(
            options.imageDataUrl
          )
        : null;


    for (
      let pageIndex = 0;
      pageIndex <
        pageSizes.length;
      pageIndex++
    ) {
      const size =
        pageSizes[
          pageIndex
        ];

      const width =
        Math.max(
          1,
          size.width
        );

      const height =
        Math.max(
          1,
          size.height
        );


      const page =
        stampDoc.addPage([
          width,
          height,
        ]);


      const cacheKey =
        `${width.toFixed(3)}x${height.toFixed(3)}`;


      let overlay =
        overlayCache.get(
          cacheKey
        );


      if (!overlay) {
        const scale =
          2;


        const canvas =
          document.createElement(
            'canvas'
          );


        canvas.width =
          Math.max(
            1,
            Math.ceil(
              width *
                scale
            )
          );


        canvas.height =
          Math.max(
            1,
            Math.ceil(
              height *
                scale
            )
          );


        const ctx =
          canvas.getContext(
            '2d'
          );


        if (!ctx) {
          throw new Error(
            'Unable to create watermark layer.'
          );
        }


        /*
         * Transparent canvas:
         * ONLY the watermark is painted.
         * Original PDF content never enters this canvas.
         */
        ctx.setTransform(
          scale,
          0,
          0,
          scale,
          0,
          0
        );


        await paintWatermark(
          ctx,
          width,
          height,
          options,
          logo
        );


        const png =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              canvas.toBlob(
                (
                  blob
                ) => {
                  if (blob) {
                    resolve(
                      blob
                    );
                  } else {
                    reject(
                      new Error(
                        'Unable to encode watermark layer.'
                      )
                    );
                  }
                },
                'image/png'
              );
            }
          );


        const bytes =
          await png.arrayBuffer();


        overlay =
          await stampDoc.embedPng(
            bytes
          );


        overlayCache.set(
          cacheKey,
          overlay
        );


        canvas.width =
          1;

        canvas.height =
          1;
      }


      page.drawImage(
        overlay,
        {
          x: 0,
          y: 0,
          width,
          height,
        }
      );


      /*
       * Creating hundreds/thousands of tiny overlay pages is
       * CPU work on the UI thread even though the original PDF
       * itself stays in the qpdf Worker.
       *
       * Give the browser regular event-loop opportunities so a
       * large stamp document never makes the tab appear hung.
       */
      if (
        (
          pageIndex +
          1
        ) %
          8 ===
        0
      ) {
        await new Promise<void>(
          (
            resolve
          ) =>
            setTimeout(
              resolve,
              0
            )
        );
      }
    }


    return await stampDoc.save({
      useObjectStreams:
        false,

      addDefaultPage:
        false,

      objectsPerTick:
        10,
    });
  };
