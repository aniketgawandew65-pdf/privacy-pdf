import { jsPDF } from 'jspdf';

type HtmlVectorColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const parseCssColor = (
  value: string | null | undefined
): HtmlVectorColor | null => {
  const input = String(value || '').trim().toLowerCase();

  if (
    !input ||
    input === 'transparent' ||
    input === 'rgba(0, 0, 0, 0)' ||
    input === 'rgba(0,0,0,0)'
  ) {
    return null;
  }

  const rgb = input.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/
  );

  if (rgb) {
    return {
      r: Math.max(0, Math.min(255, Number(rgb[1]))),
      g: Math.max(0, Math.min(255, Number(rgb[2]))),
      b: Math.max(0, Math.min(255, Number(rgb[3]))),
      a: Math.max(
        0,
        Math.min(
          1,
          rgb[4] === undefined ? 1 : Number(rgb[4])
        )
      ),
    };
  }

  const hex = input.match(
    /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
  );

  if (!hex) return null;

  let valueHex = hex[1];

  if (valueHex.length === 3) {
    valueHex = valueHex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  return {
    r: parseInt(valueHex.slice(0, 2), 16),
    g: parseInt(valueHex.slice(2, 4), 16),
    b: parseInt(valueHex.slice(4, 6), 16),
    a:
      valueHex.length === 8
        ? parseInt(valueHex.slice(6, 8), 16) / 255
        : 1,
  };
};

const blendColor = (
  foreground: HtmlVectorColor,
  background: HtmlVectorColor
): [number, number, number] => {
  const alpha = foreground.a;

  return [
    Math.round(
      foreground.r * alpha +
        background.r * (1 - alpha)
    ),
    Math.round(
      foreground.g * alpha +
        background.g * (1 - alpha)
    ),
    Math.round(
      foreground.b * alpha +
        background.b * (1 - alpha)
    ),
  ];
};

const COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  'gray-200': '#e5e7eb',
  'gray-300': '#d1d5db',
  'gray-400': '#9ca3af',
  'gray-500': '#6b7280',
  'gray-600': '#4b5563',
  'gray-700': '#374151',
  'gray-800': '#1f2937',
  'gray-900': '#111827',
  'zinc-200': '#e4e4e7',
  'zinc-300': '#d4d4d8',
  'zinc-400': '#a1a1aa',
  'zinc-500': '#71717a',
  'zinc-700': '#3f3f46',
  'zinc-800': '#27272a',
  'zinc-900': '#18181b',
  'purple-300': '#d8b4fe',
  'purple-400': '#c084fc',
  'purple-500': '#a855f7',
  'purple-600': '#9333ea',
  'purple-700': '#7e22ce',
  'purple-900': '#581c87',
  'emerald-400': '#34d399',
  'emerald-500': '#10b981',
  'emerald-600': '#059669',
};

const colorValue = (
  raw: string
): string | null => {
  const arbitrary = raw.match(
    /^\[#([0-9a-f]{3,8})\](?:\/(\d{1,3}))?$/i
  );

  if (arbitrary) {
    const base = `#${arbitrary[1]}`;

    const opacity = arbitrary[2]
      ? Math.max(
          0,
          Math.min(
            100,
            Number(arbitrary[2])
          )
        ) / 100
      : 1;

    const parsed =
      parseCssColor(base);

    if (
      !parsed ||
      opacity >= 0.999
    ) {
      return base;
    }

    return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${opacity})`;
  }

  const normal = raw.match(
    /^([a-z]+-\d+)(?:\/(\d{1,3}))?$/i
  );

  if (!normal) {
    return COLORS[raw] || null;
  }

  const base =
    COLORS[normal[1]];

  if (!base) return null;

  const opacity = normal[2]
    ? Math.max(
        0,
        Math.min(
          100,
          Number(normal[2])
        )
      ) / 100
    : 1;

  if (opacity >= 0.999) {
    return base;
  }

  const parsed =
    parseCssColor(base);

  if (!parsed) return base;

  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${opacity})`;
};

const spacingPx = (
  raw: string
): number | null => {
  if (
    !/^-?\d+(?:\.\d+)?$/.test(raw)
  ) {
    return null;
  }

  return Number(raw) * 4;
};

const applyUtilityClasses = (
  doc: Document
) => {
  const setSpacing = (
    element: HTMLElement,
    prefix: string,
    value: number
  ) => {
    const px =
      `${value}px`;

    if (prefix === 'm') {
      element.style.margin = px;
    } else if (prefix === 'mt') {
      element.style.marginTop = px;
    } else if (prefix === 'mr') {
      element.style.marginRight = px;
    } else if (prefix === 'mb') {
      element.style.marginBottom = px;
    } else if (prefix === 'ml') {
      element.style.marginLeft = px;
    } else if (prefix === 'mx') {
      element.style.marginLeft = px;
      element.style.marginRight = px;
    } else if (prefix === 'my') {
      element.style.marginTop = px;
      element.style.marginBottom = px;
    } else if (prefix === 'p') {
      element.style.padding = px;
    } else if (prefix === 'pt') {
      element.style.paddingTop = px;
    } else if (prefix === 'pr') {
      element.style.paddingRight = px;
    } else if (prefix === 'pb') {
      element.style.paddingBottom = px;
    } else if (prefix === 'pl') {
      element.style.paddingLeft = px;
    } else if (prefix === 'px') {
      element.style.paddingLeft = px;
      element.style.paddingRight = px;
    } else if (prefix === 'py') {
      element.style.paddingTop = px;
      element.style.paddingBottom = px;
    }
  };

  const applySpace = (
    element: HTMLElement,
    axis: 'x' | 'y',
    amount: number
  ) => {
    const children =
      Array.from(
        element.children
      ) as HTMLElement[];

    children.forEach(
      (
        child,
        index
      ) => {
        if (index === 0) return;

        if (axis === 'x') {
          child.style.marginLeft =
            `${amount}px`;
        } else {
          child.style.marginTop =
            `${amount}px`;
        }
      }
    );
  };

  const fontSizes:
    Record<
      string,
      string
    > = {
      'text-xs': '12px',
      'text-sm': '14px',
      'text-base': '16px',
      'text-lg': '18px',
      'text-xl': '20px',
      'text-2xl': '24px',
      'text-3xl': '30px',
      'text-4xl': '36px',
      'text-5xl': '48px',
      'text-6xl': '60px',
      'text-7xl': '72px',
    };

  const maxWidths:
    Record<
      string,
      string
    > = {
      'max-w-2xl': '672px',
      'max-w-3xl': '768px',
      'max-w-4xl': '896px',
      'max-w-5xl': '1024px',
      'max-w-6xl': '1152px',
      'max-w-7xl': '1280px',
    };

  const radii:
    Record<
      string,
      string
    > = {
      'rounded-xl': '12px',
      'rounded-2xl': '16px',
      'rounded-full': '9999px',
    };

  for (
    const element of
    Array.from(
      doc.querySelectorAll<HTMLElement>(
        '[class]'
      )
    )
  ) {
    for (
      const rawToken of
      Array.from(
        element.classList
      )
    ) {
      if (
        rawToken.startsWith(
          'hover:'
        ) ||
        rawToken.startsWith(
          'active:'
        ) ||
        rawToken.startsWith(
          'group-hover:'
        ) ||
        rawToken.startsWith(
          'focus:'
        )
      ) {
        continue;
      }

      let token =
        rawToken;

      const responsive =
        token.match(
          /^(sm|md|lg|xl|2xl):(.+)$/
        );

      if (responsive) {
        token =
          responsive[2];
      }

      if (
        token === 'hidden'
      ) {
        element.style.display =
          'none';
        continue;
      }

      if (
        token === 'block'
      ) {
        element.style.display =
          'block';
        continue;
      }

      if (
        token ===
        'inline-block'
      ) {
        element.style.display =
          'inline-block';
        continue;
      }

      if (
        token === 'flex'
      ) {
        element.style.display =
          'flex';
        continue;
      }

      if (
        token ===
        'inline-flex'
      ) {
        element.style.display =
          'inline-flex';
        continue;
      }

      if (
        token === 'grid'
      ) {
        element.style.display =
          'grid';
        continue;
      }

      if (
        token === 'flex-col'
      ) {
        element.style.flexDirection =
          'column';
        continue;
      }

      if (
        token === 'flex-row'
      ) {
        element.style.flexDirection =
          'row';
        continue;
      }

      if (
        token === 'grid-cols-1'
      ) {
        element.style.gridTemplateColumns =
          'repeat(1, minmax(0, 1fr))';
        continue;
      }

      if (
        token === 'grid-cols-2'
      ) {
        element.style.gridTemplateColumns =
          'repeat(2, minmax(0, 1fr))';
        continue;
      }

      if (
        token === 'grid-cols-3'
      ) {
        element.style.gridTemplateColumns =
          'repeat(3, minmax(0, 1fr))';
        continue;
      }

      if (
        token === 'w-full'
      ) {
        element.style.width =
          '100%';
        continue;
      }

      if (
        token === 'w-auto'
      ) {
        element.style.width =
          'auto';
        continue;
      }

      if (
        token === 'h-full'
      ) {
        element.style.height =
          '100%';
        continue;
      }

      if (
        token ===
        'min-h-screen'
      ) {
        element.style.minHeight =
          '900px';
        continue;
      }

      const minHeight =
        token.match(
          /^min-h-\[(\d+(?:\.\d+)?)px\]$/
        );

      if (minHeight) {
        element.style.minHeight =
          `${minHeight[1]}px`;
        continue;
      }

      if (
        token === 'container'
      ) {
        element.style.width =
          '100%';

        element.style.maxWidth =
          '1280px';

        element.style.marginLeft =
          'auto';

        element.style.marginRight =
          'auto';

        continue;
      }

      if (
        token === 'mx-auto'
      ) {
        element.style.marginLeft =
          'auto';

        element.style.marginRight =
          'auto';

        continue;
      }

      if (
        token ===
        'text-left'
      ) {
        element.style.textAlign =
          'left';
        continue;
      }

      if (
        token ===
        'text-center'
      ) {
        element.style.textAlign =
          'center';
        continue;
      }

      if (
        token === 'uppercase'
      ) {
        element.style.textTransform =
          'uppercase';
        continue;
      }

      if (
        token ===
        'font-normal'
      ) {
        element.style.fontWeight =
          '400';
        continue;
      }

      if (
        token ===
        'font-medium'
      ) {
        element.style.fontWeight =
          '500';
        continue;
      }

      if (
        token ===
        'font-semibold'
      ) {
        element.style.fontWeight =
          '600';
        continue;
      }

      if (
        token ===
        'font-bold'
      ) {
        element.style.fontWeight =
          '700';
        continue;
      }

      if (
        token ===
        'font-extrabold'
      ) {
        element.style.fontWeight =
          '800';
        continue;
      }

      if (
        token ===
        'leading-snug'
      ) {
        element.style.lineHeight =
          '1.375';
        continue;
      }

      if (
        token ===
        'leading-relaxed'
      ) {
        element.style.lineHeight =
          '1.625';
        continue;
      }

      if (
        token ===
        'tracking-tight'
      ) {
        element.style.letterSpacing =
          '-0.025em';
        continue;
      }

      if (
        token ===
        'tracking-wider'
      ) {
        element.style.letterSpacing =
          '0.05em';
        continue;
      }

      if (
        token ===
        'tracking-widest'
      ) {
        element.style.letterSpacing =
          '0.1em';
        continue;
      }

      const arbitraryTracking =
        token.match(
          /^tracking-\[(-?\d+(?:\.\d+)?)em\]$/
        );

      if (
        arbitraryTracking
      ) {
        element.style.letterSpacing =
          `${arbitraryTracking[1]}em`;
        continue;
      }

      const arbitraryLeading =
        token.match(
          /^leading-\[(\d+(?:\.\d+)?)\]$/
        );

      if (
        arbitraryLeading
      ) {
        element.style.lineHeight =
          arbitraryLeading[1];
        continue;
      }

      const arbitraryFontSize =
        token.match(
          /^text-\[(\d+(?:\.\d+)?)px\]$/
        );

      if (
        arbitraryFontSize
      ) {
        element.style.fontSize =
          `${arbitraryFontSize[1]}px`;
        continue;
      }

      if (
        fontSizes[token]
      ) {
        element.style.fontSize =
          fontSizes[token];
        continue;
      }

      if (
        maxWidths[token]
      ) {
        element.style.maxWidth =
          maxWidths[token];
        continue;
      }

      if (
        radii[token]
      ) {
        element.style.borderRadius =
          radii[token];
        continue;
      }

      if (
        token === 'border'
      ) {
        element.style.borderStyle =
          'solid';

        element.style.borderWidth =
          '1px';

        continue;
      }

      if (
        token === 'border-t'
      ) {
        element.style.borderTopStyle =
          'solid';

        element.style.borderTopWidth =
          '1px';

        continue;
      }

      if (
        token === 'border-b'
      ) {
        element.style.borderBottomStyle =
          'solid';

        element.style.borderBottomWidth =
          '1px';

        continue;
      }

      if (
        token ===
        'bg-transparent'
      ) {
        element.style.backgroundColor =
          'transparent';
        continue;
      }

      if (
        token ===
          'overflow-hidden' ||
        token ===
          'overflow-x-hidden'
      ) {
        element.style.overflow =
          'hidden';
        continue;
      }

      if (
        token === 'fixed' ||
        token === 'sticky'
      ) {
        element.style.position =
          'static';
        continue;
      }

      if (
        token === 'relative'
      ) {
        element.style.position =
          'relative';
        continue;
      }

      if (
        token ===
        'aspect-video'
      ) {
        element.style.aspectRatio =
          '16 / 9';
        continue;
      }

      if (
        token ===
        'items-start'
      ) {
        element.style.alignItems =
          'flex-start';
        continue;
      }

      if (
        token ===
        'items-center'
      ) {
        element.style.alignItems =
          'center';
        continue;
      }

      if (
        token ===
        'items-end'
      ) {
        element.style.alignItems =
          'flex-end';
        continue;
      }

      if (
        token ===
        'items-baseline'
      ) {
        element.style.alignItems =
          'baseline';
        continue;
      }

      if (
        token ===
        'justify-center'
      ) {
        element.style.justifyContent =
          'center';
        continue;
      }

      if (
        token ===
        'justify-between'
      ) {
        element.style.justifyContent =
          'space-between';
        continue;
      }

      const gap =
        token.match(
          /^gap-(\d+(?:\.\d+)?)$/
        );

      if (gap) {
        const amount =
          spacingPx(
            gap[1]
          );

        if (
          amount !== null
        ) {
          element.style.gap =
            `${amount}px`;
        }

        continue;
      }

      const space =
        token.match(
          /^space-([xy])-(\d+(?:\.\d+)?)$/
        );

      if (space) {
        const amount =
          spacingPx(
            space[2]
          );

        if (
          amount !== null
        ) {
          applySpace(
            element,
            space[1] as
              | 'x'
              | 'y',
            amount
          );
        }

        continue;
      }

      const spacing =
        token.match(
          /^(m[trblxy]?|p[trblxy]?)-(\d+(?:\.\d+)?)$/
        );

      if (spacing) {
        const amount =
          spacingPx(
            spacing[2]
          );

        if (
          amount !== null
        ) {
          setSpacing(
            element,
            spacing[1],
            amount
          );
        }

        continue;
      }

      const textColor =
        token.match(
          /^text-(.+)$/
        );

      if (
        textColor &&
        !token.startsWith(
          'text-['
        )
      ) {
        const value =
          colorValue(
            textColor[1]
          );

        if (value) {
          element.style.color =
            value;
          continue;
        }
      }

      const background =
        token.match(
          /^bg-(.+)$/
        );

      if (background) {
        const value =
          colorValue(
            background[1]
          );

        if (value) {
          element.style.backgroundColor =
            value;
          continue;
        }
      }

      const borderColor =
        token.match(
          /^border-(.+)$/
        );

      if (borderColor) {
        const value =
          colorValue(
            borderColor[1]
          );

        if (value) {
          element.style.borderColor =
            value;
          continue;
        }
      }

      const arbitraryText =
        token.match(
          /^text-(\[#[0-9a-f]{3,8}\](?:\/\d{1,3})?)$/i
        );

      if (arbitraryText) {
        const value =
          colorValue(
            arbitraryText[1]
          );

        if (value) {
          element.style.color =
            value;
        }

        continue;
      }
    }
  }
};

const cleanVectorText = (
  value: string
): string =>
  value
    .replace(
      /[\u{1F000}-\u{1FAFF}]/gu,
      ''
    )
    .replace(
      /[\uFE0E\uFE0F\u200D]/g,
      ''
    )
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
      ''
    );

export async function generateStyledVectorHtmlPDF(
  options: {
    html: string;
    pageSize: 'a4' | 'letter';
    orientation:
      | 'portrait'
      | 'landscape';
    onProgress?: (
      current: number,
      total: number,
      stage: string
    ) => void;
  }
): Promise<Uint8Array> {
  const {
    html,
    pageSize,
    orientation,
    onProgress,
  } = options;

  onProgress?.(
    0,
    4,
    'Preparing styled HTML...'
  );

  const sourceDoc =
    new DOMParser()
      .parseFromString(
        html,
        'text/html'
      );

  sourceDoc
    .querySelectorAll(
      'script,link,img,picture,svg,canvas,video,audio,iframe,object,embed,noscript,template'
    )
    .forEach(
      (node) =>
        node.remove()
    );

  const safetyStyle =
    sourceDoc
      .createElement(
        'style'
      );

  safetyStyle.textContent = `
    * {
      animation: none !important;
      transition: none !important;
    }

    html,
    body {
      overflow: visible !important;
    }

    body {
      margin: 0 !important;
    }

    .reveal-on-scroll {
      opacity: 1 !important;
      transform: none !important;
    }

    #particle-canvas,
    #mouse-spotlight,
    #custom-cursor-dot,
    #custom-cursor-ring {
      display: none !important;
    }
  `;

  sourceDoc.head.appendChild(
    safetyStyle
  );

  const iframe =
    document.createElement(
      'iframe'
    );

  const viewportWidth =
    orientation ===
    'landscape'
      ? 1120
      : 900;

  iframe.setAttribute(
    'sandbox',
    'allow-same-origin'
  );

  iframe.setAttribute(
    'aria-hidden',
    'true'
  );

  iframe.style.position =
    'fixed';

  iframe.style.left =
    '-100000px';

  iframe.style.top =
    '0';

  iframe.style.width =
    `${viewportWidth}px`;

  iframe.style.height =
    '1200px';

  iframe.style.border =
    '0';

  iframe.style.pointerEvents =
    'none';

  iframe.style.zIndex =
    '-2147483647';

  document.body.appendChild(
    iframe
  );

  try {
    const loaded =
      new Promise<void>(
        (
          resolve,
          reject
        ) => {
          const timeout =
            window.setTimeout(
              () =>
                reject(
                  new Error(
                    'HTML preview renderer timed out.'
                  )
                ),
              10000
            );

          iframe.onload =
            () => {
              window.clearTimeout(
                timeout
              );

              resolve();
            };
        }
      );

    iframe.srcdoc =
      sourceDoc
        .documentElement
        .outerHTML;

    await loaded;

    const doc =
      iframe.contentDocument;

    const win =
      iframe.contentWindow;

    if (
      !doc ||
      !win ||
      !doc.body
    ) {
      throw new Error(
        'Unable to create local styled HTML renderer.'
      );
    }

    applyUtilityClasses(
      doc
    );

    await new Promise<void>(
      (
        resolve
      ) =>
        win.requestAnimationFrame(
          () =>
            win.requestAnimationFrame(
              () =>
                resolve()
            )
        )
    );

    try {
      await (
        doc as
          Document & {
            fonts?:
              FontFaceSet;
          }
      ).fonts?.ready;
    } catch (_) {}

    onProgress?.(
      1,
      4,
      'Measuring vector layout...'
    );

    const body =
      doc.body;

    const htmlElement =
      doc.documentElement;

    const contentHeight =
      Math.max(
        body.scrollHeight,
        body.offsetHeight,
        htmlElement.scrollHeight,
        htmlElement.offsetHeight,
        1
      );

    const isLandscape =
      orientation ===
      'landscape';

    const pageWidth =
      pageSize ===
      'letter'
        ? isLandscape
          ? 792
          : 612
        : isLandscape
          ? 841.89
          : 595.28;

    const pageHeight =
      pageSize ===
      'letter'
        ? isLandscape
          ? 612
          : 792
        : isLandscape
          ? 595.28
          : 841.89;

    const margin =
      18;

    const usableWidth =
      pageWidth -
      margin * 2;

    const usableHeight =
      pageHeight -
      margin * 2;

    const scale =
      usableWidth /
      viewportWidth;

    const pageSlicePx =
      usableHeight /
      scale;

    const pageCount =
      Math.max(
        1,
        Math.ceil(
          contentHeight /
            pageSlicePx
        )
      );

    const pdf =
      new jsPDF({
        orientation,
        unit: 'pt',
        format: [
          pageWidth,
          pageHeight,
        ],
        compress:
          true,
      });

    while (
      pdf.getNumberOfPages() <
      pageCount
    ) {
      pdf.addPage(
        [
          pageWidth,
          pageHeight,
        ],
        orientation
      );
    }

    const bodyStyle =
      win.getComputedStyle(
        body
      );

    const htmlStyle =
      win.getComputedStyle(
        htmlElement
      );

    const pageBackground =
      parseCssColor(
        bodyStyle
          .backgroundColor
      ) ||
      parseCssColor(
        htmlStyle
          .backgroundColor
      ) || {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      };

    const opaqueBackground:
      HtmlVectorColor = {
        r:
          pageBackground.r,
        g:
          pageBackground.g,
        b:
          pageBackground.b,
        a: 1,
      };

    for (
      let pageIndex = 0;
      pageIndex <
      pageCount;
      pageIndex++
    ) {
      pdf.setPage(
        pageIndex + 1
      );

      pdf.setFillColor(
        opaqueBackground.r,
        opaqueBackground.g,
        opaqueBackground.b
      );

      pdf.rect(
        0,
        0,
        pageWidth,
        pageHeight,
        'F'
      );
    }

    const bodyRect =
      body
        .getBoundingClientRect();

    const rootTop =
      bodyRect.top;

    const rootLeft =
      bodyRect.left;

    const drawAcrossPages = (
      rect: DOMRect,
      draw: (
        pageIndex: number,
        x: number,
        y: number,
        width: number,
        height: number
      ) => void
    ) => {
      const xPx =
        rect.left -
        rootLeft;

      const yPx =
        rect.top -
        rootTop;

      const widthPx =
        rect.width;

      const heightPx =
        rect.height;

      if (
        !Number.isFinite(
          xPx
        ) ||
        !Number.isFinite(
          yPx
        ) ||
        widthPx <= 0 ||
        heightPx <= 0
      ) {
        return;
      }

      const startPage =
        Math.max(
          0,
          Math.floor(
            yPx /
              pageSlicePx
          )
        );

      const endPage =
        Math.min(
          pageCount - 1,
          Math.floor(
            Math.max(
              yPx,
              yPx +
                heightPx -
                0.01
            ) /
              pageSlicePx
          )
        );

      for (
        let pageIndex =
          startPage;
        pageIndex <=
        endPage;
        pageIndex++
      ) {
        const sliceTop =
          pageIndex *
          pageSlicePx;

        const sliceBottom =
          sliceTop +
          pageSlicePx;

        const clippedTop =
          Math.max(
            yPx,
            sliceTop
          );

        const clippedBottom =
          Math.min(
            yPx +
              heightPx,
            sliceBottom
          );

        if (
          clippedBottom <=
          clippedTop
        ) {
          continue;
        }

        draw(
          pageIndex,
          margin +
            xPx *
              scale,
          margin +
            (
              clippedTop -
              sliceTop
            ) *
              scale,
          widthPx *
            scale,
          (
            clippedBottom -
            clippedTop
          ) *
            scale
        );
      }
    };

    onProgress?.(
      2,
      4,
      'Drawing vector styles...'
    );

    const elements =
      Array.from(
        doc.body
          .querySelectorAll<HTMLElement>(
            '*'
          )
      );

    for (
      const element of
      elements
    ) {
      const style =
        win.getComputedStyle(
          element
        );

      if (
        style.display ===
          'none' ||
        style.visibility ===
          'hidden' ||
        Number(
          style.opacity ||
            '1'
        ) <= 0.001
      ) {
        continue;
      }

      const rect =
        element
          .getBoundingClientRect();

      if (
        rect.width <
          1 ||
        rect.height <
          1 ||
        rect.bottom <
          rootTop ||
        rect.top -
          rootTop >
          contentHeight
      ) {
        continue;
      }

      const background =
        parseCssColor(
          style
            .backgroundColor
        );

      const borderColor =
        parseCssColor(
          style.borderColor
        );

      const borderWidth =
        Math.max(
          parseFloat(
            style.borderTopWidth ||
              '0'
          ) || 0,
          parseFloat(
            style.borderRightWidth ||
              '0'
          ) || 0,
          parseFloat(
            style.borderBottomWidth ||
              '0'
          ) || 0,
          parseFloat(
            style.borderLeftWidth ||
              '0'
          ) || 0
        );

      const radius =
        Math.max(
          0,
          parseFloat(
            style.borderRadius ||
              '0'
          ) || 0
        ) *
        scale;

      if (
        background &&
        background.a >
          0.01
      ) {
        const [
          r,
          g,
          b,
        ] =
          blendColor(
            background,
            opaqueBackground
          );

        drawAcrossPages(
          rect,
          (
            pageIndex,
            x,
            y,
            width,
            height
          ) => {
            pdf.setPage(
              pageIndex +
                1
            );

            pdf.setFillColor(
              r,
              g,
              b
            );

            if (
              radius >
                1 &&
              height >
                radius *
                  1.5
            ) {
              const safeRadius =
                Math.min(
                  radius,
                  width / 2,
                  height / 2
                );

              pdf.roundedRect(
                x,
                y,
                width,
                height,
                safeRadius,
                safeRadius,
                'F'
              );
            } else {
              pdf.rect(
                x,
                y,
                width,
                height,
                'F'
              );
            }
          }
        );
      }

      if (
        borderColor &&
        borderColor.a >
          0.01 &&
        borderWidth >
          0.1
      ) {
        const [
          r,
          g,
          b,
        ] =
          blendColor(
            borderColor,
            opaqueBackground
          );

        drawAcrossPages(
          rect,
          (
            pageIndex,
            x,
            y,
            width,
            height
          ) => {
            pdf.setPage(
              pageIndex +
                1
            );

            pdf.setDrawColor(
              r,
              g,
              b
            );

            pdf.setLineWidth(
              Math.max(
                0.35,
                borderWidth *
                  scale
              )
            );

            if (
              radius >
                1 &&
              height >
                radius *
                  1.5
            ) {
              const safeRadius =
                Math.min(
                  radius,
                  width / 2,
                  height / 2
                );

              pdf.roundedRect(
                x,
                y,
                width,
                height,
                safeRadius,
                safeRadius,
                'S'
              );
            } else {
              pdf.rect(
                x,
                y,
                width,
                height,
                'S'
              );
            }
          }
        );
      }
    }

    onProgress?.(
      3,
      4,
      'Writing selectable text...'
    );

    const walker =
      doc.createTreeWalker(
        body,
        NodeFilter.SHOW_TEXT
      );

    let node:
      Node |
      null =
        walker.nextNode();

    while (node) {
      const textNode =
        node as Text;

      const parent =
        textNode
          .parentElement;

      const rawText =
        textNode
          .nodeValue ||
        '';

      if (
        parent &&
        rawText.trim()
      ) {
        const style =
          win.getComputedStyle(
            parent
          );

        if (
          style.display !==
            'none' &&
          style.visibility !==
            'hidden' &&
          Number(
            style.opacity ||
              '1'
          ) >
            0.001
        ) {
          const color =
            parseCssColor(
              style.color
            ) || {
              r: 24,
              g: 24,
              b: 27,
              a: 1,
            };

          const [
            textR,
            textG,
            textB,
          ] =
            blendColor(
              color,
              opaqueBackground
            );

          const family =
            style
              .fontFamily
              .toLowerCase();

          const font =
            family.includes(
              'mono'
            ) ||
            family.includes(
              'courier'
            )
              ? 'courier'
              : family.includes(
                    'serif'
                  ) &&
                  !family.includes(
                    'sans-serif'
                  )
                ? 'times'
                : 'helvetica';

          const weight =
            parseInt(
              style.fontWeight ||
                '400',
              10
            ) ||
            400;

          const italic =
            style.fontStyle ===
              'italic' ||
            style.fontStyle ===
              'oblique';

          const fontStyle =
            weight >=
            600
              ? italic
                ? 'bolditalic'
                : 'bold'
              : italic
                ? 'italic'
                : 'normal';

          const fontSize =
            Math.max(
              6,
              parseFloat(
                style.fontSize ||
                  '16'
              ) ||
                16
            );

          const words =
            /\S+/g;

          let match:
            RegExpExecArray |
            null;

          while (
            (
              match =
                words.exec(
                  rawText
                )
            ) !==
            null
          ) {
            const range =
              doc.createRange();

            range.setStart(
              textNode,
              match.index
            );

            range.setEnd(
              textNode,
              match.index +
                match[0].length
            );

            for (
              const rect of
              Array.from(
                range
                  .getClientRects()
              )
            ) {
              if (
                rect.width <=
                  0 ||
                rect.height <=
                  0
              ) {
                continue;
              }

              const yPx =
                rect.top -
                rootTop;

              const xPx =
                rect.left -
                rootLeft;

              if (
                yPx <
                  0 ||
                yPx >
                  contentHeight
              ) {
                continue;
              }

              const pageIndex =
                Math.max(
                  0,
                  Math.min(
                    pageCount -
                      1,
                    Math.floor(
                      (
                        yPx +
                        rect.height *
                          0.5
                      ) /
                        pageSlicePx
                    )
                  )
                );

              const pageLocalY =
                yPx -
                pageIndex *
                  pageSlicePx;

              let word =
                cleanVectorText(
                  match[0]
                );

              if (
                style.textTransform ===
                'uppercase'
              ) {
                word =
                  word.toUpperCase();
              } else if (
                style.textTransform ===
                'lowercase'
              ) {
                word =
                  word.toLowerCase();
              }

              if (!word) {
                continue;
              }

              pdf.setPage(
                pageIndex +
                  1
              );

              pdf.setFont(
                font,
                fontStyle
              );

              pdf.setFontSize(
                Math.max(
                  5,
                  fontSize *
                    scale
                )
              );

              pdf.setTextColor(
                textR,
                textG,
                textB
              );

              pdf.text(
                word,
                margin +
                  xPx *
                    scale,
                margin +
                  (
                    pageLocalY +
                    rect.height *
                      0.82
                  ) *
                    scale
              );
            }

            range.detach?.();
          }
        }
      }

      node =
        walker.nextNode();
    }

    for (
      const anchor of
      Array.from(
        doc.querySelectorAll<HTMLAnchorElement>(
          'a[href]'
        )
      )
    ) {
      const href =
        anchor.getAttribute(
          'href'
        ) ||
        '';

      if (
        !/^(https?:|mailto:|tel:)/i.test(
          href
        )
      ) {
        continue;
      }

      for (
        const rect of
        Array.from(
          anchor
            .getClientRects()
        )
      ) {
        const yPx =
          rect.top -
          rootTop;

        const xPx =
          rect.left -
          rootLeft;

        if (
          yPx <
            0 ||
          yPx >
            contentHeight ||
          rect.width <=
            0 ||
          rect.height <=
            0
        ) {
          continue;
        }

        const pageIndex =
          Math.max(
            0,
            Math.min(
              pageCount -
                1,
              Math.floor(
                (
                  yPx +
                  rect.height *
                    0.5
                ) /
                  pageSlicePx
              )
            )
          );

        const pageLocalY =
          yPx -
          pageIndex *
            pageSlicePx;

        pdf.setPage(
          pageIndex +
            1
        );

        pdf.link(
          margin +
            xPx *
              scale,
          margin +
            pageLocalY *
              scale,
          rect.width *
            scale,
          rect.height *
            scale,
          {
            url:
              href,
          }
        );
      }
    }

    onProgress?.(
      4,
      4,
      'Finalizing styled PDF...'
    );

    return new Uint8Array(
      pdf.output(
        'arraybuffer'
      )
    );
  } finally {
    iframe.remove();
  }
}
