type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const parseCssColor = (
  value: string | null | undefined
): RgbaColor | null => {
  const input = String(value || '').trim();

  const rgb = input.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );

  if (rgb) {
    return {
      r: Math.max(0, Math.min(255, Number(rgb[1]))),
      g: Math.max(0, Math.min(255, Number(rgb[2]))),
      b: Math.max(0, Math.min(255, Number(rgb[3]))),
      a: rgb[4] === undefined
        ? 1
        : Math.max(0, Math.min(1, Number(rgb[4]))),
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

export const needsRasterExactText = (
  value: string
): boolean =>
  value.includes('\\') ||
  /[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/u.test(value);

export const styleNeedsRasterText = (
  style: CSSStyleDeclaration
): boolean =>
  style.transform !== 'none' ||
  style.writingMode.startsWith('vertical');

const cssContentText = (
  raw: string
): string => {
  const value = raw.trim();

  if (
    !value ||
    value === 'none' ||
    value === 'normal' ||
    value === 'open-quote' ||
    value === 'close-quote'
  ) {
    return '';
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value
      .slice(1, -1)
      .replace(/\\(["'\\])/g, '$1');
  }

  return '';
};

const alphaMarker = (
  index: number
): string => {
  let value = Math.max(1, index);
  let result = '';

  while (value > 0) {
    value -= 1;
    result =
      String.fromCharCode(
        97 + (value % 26)
      ) + result;
    value = Math.floor(value / 26);
  }

  return result;
};

const materializeListMarkers = (
  doc: Document
) => {
  for (
    const list of Array.from(
      doc.querySelectorAll<HTMLOListElement | HTMLUListElement>(
        'ol, ul'
      )
    )
  ) {
    const items = Array.from(
      list.children
    ).filter(
      (child): child is HTMLLIElement =>
        child.tagName === 'LI'
    );

    const start =
      list.tagName === 'OL'
        ? (list as HTMLOListElement).start || 1
        : 1;

    const type =
      list.tagName === 'OL'
        ? list.getAttribute('type') || '1'
        : '';

    items.forEach((item, index) => {
      const existing =
        item.querySelector(
          ':scope > [data-html-pdf-list-marker]'
        );

      if (existing) return;

      const marker =
        doc.createElement('span');

      marker.setAttribute(
        'data-html-pdf-list-marker',
        'true'
      );

      const ordinal = start + index;
      let label = '•';

      if (list.tagName === 'OL') {
        label =
          type === 'a' || type === 'A'
            ? alphaMarker(ordinal)
            : String(ordinal);

        if (type === 'A') {
          label = label.toUpperCase();
        }

        label += '.';
      }

      marker.textContent = label;
      marker.style.display = 'inline-block';
      marker.style.minWidth =
        list.tagName === 'OL'
          ? '1.8em'
          : '1.2em';
      marker.style.marginRight = '0.35em';
      marker.style.textAlign = 'right';

      item.style.listStyle = 'none';

      item.insertBefore(
        marker,
        item.firstChild
      );
    });
  }
};

const materializePseudoContent = (
  doc: Document,
  win: Window
) => {
  for (
    const element of Array.from(
      doc.body.querySelectorAll<HTMLElement>('*')
    )
  ) {
    const addPseudo = (
      pseudo: '::before' | '::after'
    ) => {
      const style =
        win.getComputedStyle(
          element,
          pseudo
        );

      const text =
        cssContentText(
          style.content
        );

      if (!text) return;

      const span =
        doc.createElement('span');

      span.setAttribute(
        'data-html-pdf-pseudo',
        pseudo
      );

      span.textContent = text;
      span.style.color = style.color;
      span.style.fontFamily = style.fontFamily;
      span.style.fontSize = style.fontSize;
      span.style.fontWeight = style.fontWeight;
      span.style.fontStyle = style.fontStyle;
      span.style.letterSpacing = style.letterSpacing;

      if (pseudo === '::before') {
        element.insertBefore(
          span,
          element.firstChild
        );
      } else {
        element.appendChild(span);
      }
    };

    addPseudo('::before');
    addPseudo('::after');
  }

  const style =
    doc.createElement('style');

  style.textContent =
    '[data-html-pdf-pseudo-before]::before{content:none!important}' +
    '[data-html-pdf-pseudo-after]::after{content:none!important}';

  doc.head.appendChild(style);
};

const materializeFormControls = (
  doc: Document,
  win: Window
) => {
  const copyBox = (
    source: HTMLElement,
    target: HTMLElement
  ) => {
    const style =
      win.getComputedStyle(source);

    const rect =
      source.getBoundingClientRect();

    target.style.display =
      source.tagName === 'TEXTAREA'
        ? 'inline-block'
        : 'inline-flex';

    target.style.alignItems = 'center';
    target.style.minWidth =
      String(Math.max(18, rect.width)) + 'px';
    target.style.minHeight =
      String(Math.max(16, rect.height)) + 'px';
    target.style.padding = style.padding;
    target.style.margin = style.margin;
    target.style.border = style.border;
    target.style.borderRadius =
      style.borderRadius;
    target.style.background =
      style.backgroundColor;
    target.style.color = style.color;
    target.style.font = style.font;
    target.style.lineHeight =
      style.lineHeight;
    target.style.verticalAlign =
      style.verticalAlign;
  };

  for (
    const input of Array.from(
      doc.querySelectorAll<HTMLInputElement>(
        'input'
      )
    )
  ) {
    const type =
      (
        input.getAttribute('type') ||
        'text'
      ).toLowerCase();

    if (type === 'hidden') {
      input.remove();
      continue;
    }

    const span =
      doc.createElement('span');

    span.setAttribute(
      'data-html-pdf-form-static',
      type
    );

    if (type === 'checkbox') {
      span.textContent =
        input.checked ? '☑' : '☐';
      span.style.display = 'inline-block';
      span.style.fontSize = '1.05em';
      span.style.lineHeight = '1';
    } else if (type === 'radio') {
      span.textContent =
        input.checked ? '◉' : '○';
      span.style.display = 'inline-block';
      span.style.fontSize = '1.05em';
      span.style.lineHeight = '1';
    } else {
      copyBox(input, span);

      span.textContent =
        type === 'password'
          ? '•'.repeat(
              Math.max(
                1,
                Math.min(
                  12,
                  input.value.length
                )
              )
            )
          : (
              input.value ||
              input.placeholder ||
              ''
            );
    }

    input.replaceWith(span);
  }

  for (
    const select of Array.from(
      doc.querySelectorAll<HTMLSelectElement>(
        'select'
      )
    )
  ) {
    const span =
      doc.createElement('span');

    span.setAttribute(
      'data-html-pdf-form-static',
      'select'
    );

    copyBox(select, span);

    span.textContent =
      Array.from(
        select.selectedOptions
      )
        .map(
          (option) =>
            option.textContent ||
            option.value
        )
        .join(', ') ||
      select.value;

    select.replaceWith(span);
  }

  for (
    const textarea of Array.from(
      doc.querySelectorAll<HTMLTextAreaElement>(
        'textarea'
      )
    )
  ) {
    const box =
      doc.createElement('span');

    box.setAttribute(
      'data-html-pdf-form-static',
      'textarea'
    );

    copyBox(textarea, box);

    box.style.whiteSpace = 'pre-wrap';
    box.style.alignItems = 'flex-start';

    box.textContent =
      textarea.value ||
      textarea.textContent ||
      '';

    textarea.replaceWith(box);
  }
};

export const materializeHtmlPdfStaticDom = (
  doc: Document,
  win: Window
) => {
  materializeListMarkers(doc);
  materializeFormControls(doc, win);
  materializePseudoContent(doc, win);
};

export const sanitizeHtmlPdfSourceDocument = (
  sourceDoc: Document
) => {
  for (
    const image of Array.from(
      sourceDoc.querySelectorAll<HTMLImageElement>(
        'img'
      )
    )
  ) {
    const src =
      image.getAttribute('src') || '';

    if (!/^data:image\//i.test(src)) {
      image.remove();
    }
  }

  for (
    const svg of Array.from(
      sourceDoc.querySelectorAll<SVGElement>(
        'svg'
      )
    )
  ) {
    svg.querySelectorAll(
      'script,iframe,object,embed,foreignObject'
    )
      .forEach(
        (node) =>
          node.remove()
      );
  }

  for (
    const element of Array.from(
      sourceDoc.querySelectorAll<HTMLElement>(
        '*'
      )
    )
  ) {
    for (
      const attribute of Array.from(
        element.attributes
      )
    ) {
      if (
        /^on/i.test(attribute.name) ||
        (
          /^(?:href|xlink:href)$/i.test(
            attribute.name
          ) &&
          /^javascript:/i.test(
            attribute.value.trim()
          )
        )
      ) {
        element.removeAttribute(
          attribute.name
        );
      }
    }
  }

  sourceDoc
    .querySelectorAll(
      'script,link,picture,canvas,video,audio,iframe,object,embed,noscript,template'
    )
    .forEach(
      (node) =>
        node.remove()
    );
};

const splitCssTopLevel = (
  value: string
): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of value) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(
        0,
        depth - 1
      );
    }

    if (
      char === ',' &&
      depth === 0
    ) {
      parts.push(
        current.trim()
      );
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(
      current.trim()
    );
  }

  return parts;
};

export const rasterizeLinearGradient = (
  css: string,
  width: number,
  height: number
): string | null => {
  const match =
    css.match(
      /^linear-gradient\((.*)\)$/i
    );

  if (!match) return null;

  const parts =
    splitCssTopLevel(
      match[1]
    );

  if (parts.length < 2) {
    return null;
  }

  let angle = 180;

  if (
    /deg$/i.test(parts[0])
  ) {
    angle =
      parseFloat(
        parts.shift() ||
        '180'
      ) ||
      180;
  }

  const stops = parts
    .map(
      (part, index) => {
        const stop =
          part.match(
            /^(rgba?\([^)]+\)|#[0-9a-f]{3,8}|[a-z]+)(?:\s+(-?\d+(?:\.\d+)?)%)?$/i
          );

        if (!stop) return null;

        const color =
          parseCssColor(
            stop[1]
          );

        if (!color) return null;

        return {
          color,
          offset:
            stop[2] !== undefined
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    Number(stop[2]) /
                      100
                  )
                )
              : (
                  parts.length === 1
                    ? 0
                    : index /
                      (
                        parts.length -
                        1
                      )
                ),
        };
      }
    )
    .filter(
      (
        stop
      ): stop is {
        color: RgbaColor;
        offset: number;
      } =>
        Boolean(stop)
    );

  if (stops.length < 2) {
    return null;
  }

  const canvas =
    document.createElement(
      'canvas'
    );

  const pixelRatio =
    Math.min(
      2,
      Math.max(
        1,
        window.devicePixelRatio ||
          1
      )
    );

  canvas.width =
    Math.max(
      1,
      Math.min(
        4096,
        Math.ceil(
          width *
          pixelRatio
        )
      )
    );

  canvas.height =
    Math.max(
      1,
      Math.min(
        4096,
        Math.ceil(
          height *
          pixelRatio
        )
      )
    );

  const context =
    canvas.getContext('2d');

  if (!context) return null;

  const radians =
    angle *
    Math.PI /
    180;

  const dx =
    Math.sin(radians);

  const dy =
    -Math.cos(radians);

  const cx =
    canvas.width / 2;

  const cy =
    canvas.height / 2;

  const half =
    Math.abs(dx) *
      canvas.width /
      2 +
    Math.abs(dy) *
      canvas.height /
      2;

  const gradient =
    context.createLinearGradient(
      cx - dx * half,
      cy - dy * half,
      cx + dx * half,
      cy + dy * half
    );

  for (const stop of stops) {
    gradient.addColorStop(
      stop.offset,
      'rgba(' +
        String(stop.color.r) +
        ', ' +
        String(stop.color.g) +
        ', ' +
        String(stop.color.b) +
        ', ' +
        String(stop.color.a) +
        ')'
    );
  }

  context.fillStyle =
    gradient;

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL(
    'image/png'
  );
};

const loadImageSource = (
  src: string
): Promise<HTMLImageElement> =>
  new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      image.onload =
        () =>
          resolve(image);

      image.onerror =
        () =>
          reject(
            new Error(
              'Unable to render embedded HTML image.'
            )
          );

      image.src = src;
    }
  );

export const rasterizeImageSource = async (
  src: string,
  width: number,
  height: number
): Promise<string | null> => {
  try {
    const image =
      await loadImageSource(src);

    const pixelRatio =
      Math.min(
        2,
        Math.max(
          1,
          window.devicePixelRatio ||
            1
        )
      );

    const canvas =
      document.createElement(
        'canvas'
      );

    canvas.width =
      Math.max(
        1,
        Math.min(
          4096,
          Math.ceil(
            width *
            pixelRatio
          )
        )
      );

    canvas.height =
      Math.max(
        1,
        Math.min(
          4096,
          Math.ceil(
            height *
            pixelRatio
          )
        )
      );

    const context =
      canvas.getContext('2d');

    if (!context) return null;

    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL(
      'image/png'
    );
  } catch (_) {
    return null;
  }
};


export type RasterizedBoxShadow = {
  dataUrl: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export const rasterizeBoxShadow = (
  boxShadow: string,
  width: number,
  height: number,
  borderRadius: number
): RasterizedBoxShadow | null => {
  const value =
    String(
      boxShadow ||
      ''
    ).trim();

  if (
    !value ||
    value === 'none' ||
    value.includes(
      'inset'
    )
  ) {
    return null;
  }

  const first =
    value
      .split(/,(?![^(]*\))/)
      [0]
      ?.trim() ||
    '';

  const colorMatch =
    first.match(
      /(rgba?\([^)]+\)|#[0-9a-f]{3,8})/i
    );

  if (
    !colorMatch
  ) {
    return null;
  }

  const color =
    parseCssColor(
      colorMatch[1]
    );

  if (
    !color ||
    color.a <=
      0.001
  ) {
    return null;
  }

  const numericPart =
    first
      .replace(
        colorMatch[0],
        ' '
      )
      .trim();

  const lengths =
    numericPart
      .match(
        /-?\d+(?:\.\d+)?px/g
      )
      ?.map(
        (
          token
        ) =>
          Number(
            token.replace(
              /px$/i,
              ''
            )
          )
      ) ||
    [];

  if (
    lengths.length <
      2
  ) {
    return null;
  }

  const offsetX =
    lengths[0] ||
    0;

  const offsetY =
    lengths[1] ||
    0;

  const blur =
    Math.max(
      0,
      lengths[2] ||
      0
    );

  const spread =
    lengths[3] ||
    0;

  const padX =
    Math.ceil(
      blur *
        2 +
      Math.abs(
        offsetX
      ) +
      Math.max(
        0,
        spread
      ) +
      4
    );

  const padY =
    Math.ceil(
      blur *
        2 +
      Math.abs(
        offsetY
      ) +
      Math.max(
        0,
        spread
      ) +
      4
    );

  const cssWidth =
    Math.max(
      1,
      width +
      padX *
        2
    );

  const cssHeight =
    Math.max(
      1,
      height +
      padY *
        2
    );

  const pixelRatio =
    Math.min(
      2,
      Math.max(
        1,
        window.devicePixelRatio ||
          1
      )
    );

  const canvas =
    document.createElement(
      'canvas'
    );

  canvas.width =
    Math.max(
      1,
      Math.min(
        4096,
        Math.ceil(
          cssWidth *
          pixelRatio
        )
      )
    );

  canvas.height =
    Math.max(
      1,
      Math.min(
        4096,
        Math.ceil(
          cssHeight *
          pixelRatio
        )
      )
    );

  const context =
    canvas.getContext(
      '2d'
    );

  if (
    !context
  ) {
    return null;
  }

  context.scale(
    pixelRatio,
    pixelRatio
  );

  const x =
    padX +
    spread;

  const y =
    padY +
    spread;

  const w =
    Math.max(
      1,
      width -
      spread *
        2
    );

  const h =
    Math.max(
      1,
      height -
      spread *
        2
    );

  const radius =
    Math.max(
      0,
      Math.min(
        borderRadius,
        w /
          2,
        h /
          2
      )
    );

  const paintShape =
    () => {
      context.beginPath();

      if (
        radius >
          0 &&
        'roundRect' in
          context
      ) {
        (
          context as
            CanvasRenderingContext2D & {
              roundRect:
                (
                  x: number,
                  y: number,
                  w: number,
                  h: number,
                  radii:
                    number
                ) =>
                  void;
            }
        ).roundRect(
          x,
          y,
          w,
          h,
          radius
        );
      } else {
        context.rect(
          x,
          y,
          w,
          h
        );
      }
    };

  context.shadowColor =
    'rgba(' +
    String(
      color.r
    ) +
    ', ' +
    String(
      color.g
    ) +
    ', ' +
    String(
      color.b
    ) +
    ', ' +
    String(
      color.a
    ) +
    ')';

  context.shadowBlur =
    blur;

  context.shadowOffsetX =
    offsetX;

  context.shadowOffsetY =
    offsetY;

  context.fillStyle =
    'rgba(0,0,0,1)';

  paintShape();
  context.fill();

  context.save();
  context.globalCompositeOperation =
    'destination-out';
  context.shadowColor =
    'rgba(0,0,0,0)';
  context.shadowBlur =
    0;
  context.shadowOffsetX =
    0;
  context.shadowOffsetY =
    0;

  paintShape();
  context.fillStyle =
    'rgba(0,0,0,1)';
  context.fill();
  context.restore();

  return {
    dataUrl:
      canvas.toDataURL(
        'image/png'
      ),
    offsetX:
      padX,
    offsetY:
      padY,
    width:
      cssWidth,
    height:
      cssHeight,
  };
};

export const rasterizeTextLine = (
  text: string,
  style: CSSStyleDeclaration,
  width: number,
  height: number,
  clipOffsetX = 0,
  ellipsis = false
): string | null => {
  const pixelRatio =
    Math.min(
      2,
      Math.max(
        1,
        window.devicePixelRatio ||
          1
      )
    );

  const canvas =
    document.createElement(
      'canvas'
    );

  canvas.width =
    Math.max(
      1,
      Math.min(
        4096,
        Math.ceil(
          width *
          pixelRatio
        )
      )
    );

  canvas.height =
    Math.max(
      1,
      Math.min(
        1024,
        Math.ceil(
          Math.max(
            height,
            parseFloat(
              style.fontSize ||
              '16'
            ) *
              1.35
          ) *
          pixelRatio
        )
      )
    );

  const context =
    canvas.getContext('2d');

  if (!context) return null;

  context.scale(
    pixelRatio,
    pixelRatio
  );

  const fontSize =
    Math.max(
      6,
      parseFloat(
        style.fontSize ||
        '16'
      ) ||
      16
    );

  context.font =
    (style.fontStyle || 'normal') +
    ' ' +
    (style.fontWeight || '400') +
    ' ' +
    String(fontSize) +
    'px ' +
    (style.fontFamily || 'Arial') +
    ', "Noto Sans", "Arial Unicode MS", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

  context.textBaseline =
    'alphabetic';

  context.direction =
    style.direction === 'rtl'
      ? 'rtl'
      : 'ltr';

  context.textAlign =
    style.direction === 'rtl'
      ? 'right'
      : 'left';

  const color =
    parseCssColor(
      style.color
    ) || {
      r: 24,
      g: 24,
      b: 27,
      a: 1,
    };

  context.fillStyle =
    'rgba(' +
    String(color.r) +
    ', ' +
    String(color.g) +
    ', ' +
    String(color.b) +
    ', ' +
    String(color.a) +
    ')';

  let output = text;

  const availableWidth =
    Math.max(
      1,
      width
    );

  if (
    ellipsis &&
    context.measureText(output)
      .width >
      availableWidth
  ) {
    const suffix = '…';

    while (
      output.length > 1 &&
      context.measureText(
        output + suffix
      ).width >
        availableWidth
    ) {
      output =
        Array.from(output)
          .slice(0, -1)
          .join('');
    }

    output += suffix;
  }

  if (
    style.writingMode.startsWith(
      'vertical'
    )
  ) {
    context.textAlign = 'center';
    context.direction = 'ltr';

    const graphemes =
      typeof Intl !== 'undefined' &&
      'Segmenter' in Intl
        ? Array.from(
            new Intl.Segmenter(
              undefined,
              {
                granularity:
                  'grapheme',
              }
            ).segment(output),
            (
              item
            ) =>
              item.segment
          )
        : Array.from(output);

    let y =
      fontSize;

    for (
      const grapheme of
      graphemes
    ) {
      context.fillText(
        grapheme,
        availableWidth / 2,
        y
      );

      y +=
        fontSize *
        1.05;

      if (
        y >
        height
      ) {
        break;
      }
    }

    return canvas.toDataURL(
      'image/png'
    );
  }

  const transform =
    style.transform;

  if (
    transform &&
    transform !== 'none'
  ) {
    const match =
      transform.match(
        /^matrix\(([^)]+)\)$/
      );

    if (
      match
    ) {
      const values =
        match[1]
          .split(',')
          .map(
            (
              value
            ) =>
              Number(
                value.trim()
              )
          );

      if (
        values.length >= 2 &&
        values.every(
          Number.isFinite
        )
      ) {
        const angle =
          Math.atan2(
            values[1],
            values[0]
          );

        const measuredWidth =
          Math.max(
            1,
            context.measureText(
              output
            ).width +
              4
          );

        const sourceHeight =
          Math.max(
            fontSize *
              1.45,
            height
          );

        const sourceCanvas =
          document.createElement(
            'canvas'
          );

        sourceCanvas.width =
          Math.max(
            1,
            Math.ceil(
              measuredWidth *
              pixelRatio
            )
          );

        sourceCanvas.height =
          Math.max(
            1,
            Math.ceil(
              sourceHeight *
              pixelRatio
            )
          );

        const sourceContext =
          sourceCanvas.getContext(
            '2d'
          );

        if (
          sourceContext
        ) {
          sourceContext.scale(
            pixelRatio,
            pixelRatio
          );

          sourceContext.font =
            context.font;

          sourceContext.textBaseline =
            'alphabetic';

          sourceContext.direction =
            style.direction ===
              'rtl'
              ? 'rtl'
              : 'ltr';

          sourceContext.textAlign =
            style.direction ===
              'rtl'
              ? 'right'
              : 'left';

          sourceContext.fillStyle =
            context.fillStyle;

          sourceContext.fillText(
            output,
            style.direction ===
              'rtl'
              ? measuredWidth -
                2
              : 2,
            Math.min(
              sourceHeight -
                2,
              fontSize *
                1.08
            )
          );

          const cos =
            Math.abs(
              Math.cos(
                angle
              )
            );

          const sin =
            Math.abs(
              Math.sin(
                angle
              )
            );

          const rotatedWidth =
            Math.max(
              1,
              measuredWidth *
                cos +
              sourceHeight *
                sin +
              6
            );

          const rotatedHeight =
            Math.max(
              1,
              measuredWidth *
                sin +
              sourceHeight *
                cos +
              6
            );

          const rotatedCanvas =
            document.createElement(
              'canvas'
            );

          rotatedCanvas.width =
            Math.max(
              1,
              Math.ceil(
                rotatedWidth *
                pixelRatio
              )
            );

          rotatedCanvas.height =
            Math.max(
              1,
              Math.ceil(
                rotatedHeight *
                pixelRatio
              )
            );

          const rotatedContext =
            rotatedCanvas.getContext(
              '2d'
            );

          if (
            rotatedContext
          ) {
            rotatedContext.scale(
              pixelRatio,
              pixelRatio
            );

            rotatedContext.translate(
              rotatedWidth /
                2,
              rotatedHeight /
                2
            );

            rotatedContext.rotate(
              angle
            );

            rotatedContext.drawImage(
              sourceCanvas,
              -measuredWidth /
                2,
              -sourceHeight /
                2,
              measuredWidth,
              sourceHeight
            );

            return rotatedCanvas.toDataURL(
              'image/png'
            );
          }
        }
      }
    }
  }

  const x =
    style.direction === 'rtl'
      ? availableWidth -
        1 +
        clipOffsetX
      : 1 +
        clipOffsetX;

  const y =
    Math.min(
      height *
        0.82,
      fontSize *
        1.05
    );

  context.fillText(
    output,
    x,
    y
  );

  return canvas.toDataURL(
    'image/png'
  );
};
