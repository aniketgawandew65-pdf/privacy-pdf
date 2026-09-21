import { jsPDF } from 'jspdf';

export type CodeVectorPdfOptions = {
  code: string;
  title?: string;
  theme?: 'dark' | 'light';
  showLineNumbers?: boolean;
  fontSize?: number;
  pageSize?: 'a4' | 'letter';
  orientation?: 'portrait' | 'landscape';
};

type RGB = [number, number, number];

type HighlightKind =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'function';

type Range = {
  start: number;
  end: number;
  kind: HighlightKind;
};

const KEYWORDS = new Set(
  [
    'const', 'let', 'var', 'function', 'return',
    'import', 'from', 'export', 'default',
    'class', 'extends', 'if', 'else', 'switch',
    'case', 'break', 'for', 'while', 'do',
    'try', 'catch', 'finally', 'throw', 'new',
    'typeof', 'instanceof', 'async', 'await',
    'def', 'elif', 'lambda', 'self', 'with',
    'as', 'yield', 'raise', 'except', 'pass',
    'in', 'is', 'not', 'and', 'or',
    'select', 'where', 'insert', 'into',
    'update', 'delete', 'public', 'private',
    'protected', 'static', 'void', 'int',
    'float', 'double', 'bool', 'struct',
    'impl', 'fn', 'pub', 'type', 'interface',
    'true', 'false', 'null', 'none',
  ]
);

const expandTabs = (
  line: string,
  tabSize = 4
) => {
  let output = '';

  for (const char of line) {
    if (char === '\t') {
      const count =
        tabSize -
        (output.length % tabSize);

      output += ' '.repeat(count);
    } else {
      output += char;
    }
  }

  return output;
};

const findRanges = (
  line: string,
  initialBlockComment = false
): {
  ranges: Range[];
  inBlockComment: boolean;
} => {
  const ranges: Range[] = [];

  const occupied =
    new Array<boolean>(
      line.length
    ).fill(false);

  const add = (
    start: number,
    end: number,
    kind: HighlightKind
  ) => {
    if (
      start < 0 ||
      end <= start
    ) {
      return;
    }

    for (
      let index = start;
      index < end;
      index++
    ) {
      if (occupied[index]) {
        return;
      }
    }

    for (
      let index = start;
      index < end;
      index++
    ) {
      occupied[index] = true;
    }

    ranges.push({
      start,
      end,
      kind,
    });
  };

  let inBlockComment =
    initialBlockComment;

  let index = 0;

  /*
   * Stateful lexical scan.
   *
   * This keeps /* ... *\/ comments highlighted across source
   * lines, while strings are claimed before // or # can be
   * mistaken for comments.
   */
  while (
    index < line.length
  ) {
    if (inBlockComment) {
      const close =
        line.indexOf(
          '*/',
          index
        );

      if (close < 0) {
        add(
          index,
          line.length,
          'comment'
        );

        index =
          line.length;

        break;
      }

      add(
        index,
        close + 2,
        'comment'
      );

      inBlockComment = false;
      index = close + 2;
      continue;
    }

    const char =
      line[index];

    if (
      char === '"' ||
      char === "'" ||
      char === '`'
    ) {
      const quote =
        char;

      let end =
        index + 1;

      while (
        end < line.length
      ) {
        if (
          line[end] === '\\'
        ) {
          end += 2;
          continue;
        }

        if (
          line[end] === quote
        ) {
          end += 1;
          break;
        }

        end += 1;
      }

      add(
        index,
        Math.min(
          end,
          line.length
        ),
        'string'
      );

      index =
        Math.max(
          end,
          index + 1
        );

      continue;
    }

    if (
      char === '/' &&
      line[index + 1] === '*'
    ) {
      const close =
        line.indexOf(
          '*/',
          index + 2
        );

      if (close < 0) {
        add(
          index,
          line.length,
          'comment'
        );

        inBlockComment = true;
        break;
      }

      add(
        index,
        close + 2,
        'comment'
      );

      index =
        close + 2;

      continue;
    }

    if (
      char === '/' &&
      line[index + 1] === '/'
    ) {
      add(
        index,
        line.length,
        'comment'
      );

      break;
    }

    /*
     * Python/shell comment marker.
     *
     * Only treat # as a comment delimiter at the beginning of
     * a line or after whitespace. This avoids coloring CSS
     * values such as #fff and url(#fragment) as comments.
     */
    if (
      char === '#' &&
      (
        index === 0 ||
        /\s/.test(
          line[index - 1]
        )
      )
    ) {
      add(
        index,
        line.length,
        'comment'
      );

      break;
    }

    index += 1;
  }

  /*
   * Keywords / functions.
   */
  const wordRegex =
    /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

  for (
    const match of
    line.matchAll(
      wordRegex
    )
  ) {
    const start =
      match.index || 0;

    const end =
      start +
      match[0].length;

    if (
      occupied[start]
    ) {
      continue;
    }

    if (
      KEYWORDS.has(
        match[0].toLowerCase()
      )
    ) {
      add(
        start,
        end,
        'keyword'
      );

      continue;
    }

    let next =
      end;

    while (
      next < line.length &&
      /\s/.test(
        line[next]
      )
    ) {
      next++;
    }

    if (
      line[next] === '('
    ) {
      add(
        start,
        end,
        'function'
      );
    }
  }

  /*
   * Numbers.
   */
  const numberRegex =
    /\b(?:0x[0-9a-f]+|\d+(?:\.\d+)?)\b/gi;

  for (
    const match of
    line.matchAll(
      numberRegex
    )
  ) {
    const start =
      match.index || 0;

    if (
      occupied[start]
    ) {
      continue;
    }

    add(
      start,
      start +
        match[0].length,
      'number'
    );
  }

  return {
    ranges:
      ranges.sort(
        (a, b) =>
          a.start - b.start
      ),

    inBlockComment,
  };
};


const requiresUnicodeRaster =
  (
    value: string
  ) =>
    /[^\u0000-\u00FF]/u.test(
      value
    );


const chunkLineSafely = (
  line: string,
  maxChars: number
): Array<{
  text: string;
  start: number;
}> => {
  if (!line.length) {
    return [
      {
        text: '',
        start: 0,
      },
    ];
  }

  /*
   * Keep the original fast path for ordinary ASCII/Latin code.
   */
  if (
    !requiresUnicodeRaster(
      line
    )
  ) {
    const chunks:
      Array<{
        text: string;
        start: number;
      }> = [];

    for (
      let start = 0;
      start < line.length;
      start += maxChars
    ) {
      chunks.push({
        text:
          line.slice(
            start,
            start +
              maxChars
          ),

        start,
      });
    }

    return chunks;
  }

  /*
   * Unicode source must never be sliced through a surrogate
   * pair, combining sequence, emoji modifier or ZWJ cluster.
   *
   * Intl.Segmenter is browser-native and does not require
   * network access. Fall back to code points if unavailable.
   */
  const Segmenter =
    (
      Intl as any
    ).Segmenter;

  const segments:
    Array<{
      segment: string;
      index: number;
    }> =
    Segmenter
      ? Array.from(
          new Segmenter(
            undefined,
            {
              granularity:
                'grapheme',
            }
          ).segment(
            line
          )
        ).map(
          (
            part: any
          ) => ({
            segment:
              part.segment,

            index:
              part.index,
          })
        )
      : (() => {
          const result:
            Array<{
              segment: string;
              index: number;
            }> = [];

          let index = 0;

          for (
            const symbol of
            Array.from(
              line
            )
          ) {
            result.push({
              segment:
                symbol,

              index,
            });

            index +=
              symbol.length;
          }

          return result;
        })();

  const chunks:
    Array<{
      text: string;
      start: number;
    }> = [];

  let current =
    '';

  let currentStart =
    0;

  let visualCount =
    0;

  for (
    const part of
    segments
  ) {
    if (
      current &&
      visualCount >=
        maxChars
    ) {
      chunks.push({
        text:
          current,

        start:
          currentStart,
      });

      current =
        '';

      visualCount =
        0;
    }

    if (!current) {
      currentStart =
        part.index;
    }

    current +=
      part.segment;

    visualCount +=
      1;
  }

  if (current) {
    chunks.push({
      text:
        current,

      start:
        currentStart,
    });
  }

  return chunks;
};


export async function generateCodeVectorPDF(
  options: CodeVectorPdfOptions
): Promise<Uint8Array> {
  const {
    code,
    title = '',
    theme = 'dark',
    showLineNumbers = true,
    fontSize = 8.5,
    pageSize = 'a4',
    orientation = 'portrait',
  } = options;

  if (!code.trim()) {
    throw new Error(
      'No source code detected to convert.'
    );
  }

  const pdf =
    new jsPDF({
      orientation,
      unit: 'pt',
      format: pageSize,
      compress: true,
    });

  /*
   * QA marker: lets us verify that a generated preview PDF
   * came from this exact Unicode/source-fidelity renderer.
   */
  pdf.setProperties({
    creator:
      '1into1 Code PDF exact-render-v2',
  });

  const pageWidth =
    pdf.internal.pageSize
      .getWidth();

  const pageHeight =
    pdf.internal.pageSize
      .getHeight();

  const margin = 28;

  const isDark =
    theme === 'dark';

  const bg: RGB =
    isDark
      ? [15, 23, 42]
      : [255, 255, 255];

  const text: RGB =
    isDark
      ? [226, 232, 240]
      : [15, 23, 42];

  const gutterBg: RGB =
    isDark
      ? [24, 33, 54]
      : [248, 250, 252];

  const gutterBorder: RGB =
    isDark
      ? [51, 65, 85]
      : [226, 232, 240];

  const gutterText: RGB =
    [148, 163, 184];

  const headerBg: RGB =
    isDark
      ? [30, 41, 59]
      : [241, 245, 249];

  const headerText: RGB =
    isDark
      ? [56, 189, 248]
      : [14, 116, 144];

  /*
   * Syntax highlighting is drawn as subtle vector
   * backgrounds.
   *
   * The actual source code is then written ONCE.
   *
   * This avoids token-by-token spacing drift and protects:
   *
   * \s+
   * \b
   * regex
   * quotes
   * punctuation
   * whitespace
   */
  const highlight:
    Record<
      HighlightKind,
      RGB
    > =
      isDark
        ? {
            keyword:
              [76, 29, 49],

            string:
              [17, 66, 57],

            comment:
              [45, 55, 72],

            number:
              [74, 48, 25],

            function:
              [30, 58, 92],
          }
        : {
            keyword:
              [254, 226, 226],

            string:
              [204, 251, 241],

            comment:
              [241, 245, 249],

            number:
              [255, 237, 213],

            function:
              [219, 234, 254],
          };

  pdf.setFont(
    'courier',
    'normal'
  );

  pdf.setFontSize(
    fontSize
  );

  const charWidth =
    pdf.getTextWidth(
      'M'
    );

  const rawLines =
    code.split(
      /\r\n|\n|\r/
    );

  const lineDigits =
    Math.max(
      2,
      String(
        rawLines.length
      ).length
    );

  const gutterWidth =
    showLineNumbers
      ? (
          lineDigits +
          2
        ) *
          charWidth +
        10
      : 0;

  const codeX =
    margin +
    gutterWidth +
    6;

  const codeWidth =
    pageWidth -
    margin * 2 -
    gutterWidth -
    10;

  /*
   * One-character safety margin prevents right-edge clipping.
   */
  const maxChars =
    Math.max(
      12,
      Math.floor(
        codeWidth /
        charWidth
      ) - 1
    );

  const lineHeight =
    fontSize * 1.42;

  const firstY =
    margin +
    (
      title.trim()
        ? 26
        : 8
    );

  const bottom =
    pageHeight -
    margin -
    18;

  const drawPage =
    () => {
      pdf.setFillColor(
        bg[0],
        bg[1],
        bg[2]
      );

      pdf.rect(
        0,
        0,
        pageWidth,
        pageHeight,
        'F'
      );

      if (
        title.trim()
      ) {
        pdf.setFillColor(
          headerBg[0],
          headerBg[1],
          headerBg[2]
        );

        pdf.rect(
          margin,
          margin - 12,
          pageWidth -
            margin * 2,
          20,
          'F'
        );

        pdf.setDrawColor(
          gutterBorder[0],
          gutterBorder[1],
          gutterBorder[2]
        );

        pdf.line(
          margin,
          margin + 8,
          pageWidth -
            margin,
          margin + 8
        );

        pdf.setFont(
          'courier',
          'bold'
        );

        pdf.setFontSize(
          9
        );

        pdf.setTextColor(
          headerText[0],
          headerText[1],
          headerText[2]
        );

        pdf.text(
          `// ${title.trim()}`,
          margin + 8,
          margin + 2
        );
      }

      if (
        showLineNumbers
      ) {
        pdf.setFillColor(
          gutterBg[0],
          gutterBg[1],
          gutterBg[2]
        );

        pdf.rect(
          margin,
          margin + 12,
          gutterWidth,
          pageHeight -
            margin * 2 -
            12,
          'F'
        );

        pdf.setDrawColor(
          gutterBorder[0],
          gutterBorder[1],
          gutterBorder[2]
        );

        pdf.line(
          margin +
            gutterWidth,
          margin + 12,
          margin +
            gutterWidth,
          pageHeight -
            margin
        );
      }
    };

  const unicodeRasterCache =
    new Map<
      string,
      {
        dataUrl: string;
        alias: string;
      }
    >();


  const hashString =
    (
      value: string
    ) => {
      let hash =
        2166136261;

      for (
        let index = 0;
        index < value.length;
        index++
      ) {
        hash ^=
          value.charCodeAt(
            index
          );

        hash =
          Math.imul(
            hash,
            16777619
          );
      }

      return (
        hash >>>
        0
      ).toString(
        36
      );
    };


  const drawVectorExactText =
    (
      value: string,
      y: number
    ) => {
      pdf.setFont(
        'courier',
        'normal'
      );

      pdf.setFontSize(
        fontSize
      );

      pdf.setTextColor(
        text[0],
        text[1],
        text[2]
      );

      /*
       * PDF literal strings use backslash as an escape marker.
       * Writing regex-heavy source as one PDF string can make
       * viewers/text extractors reinterpret sequences such as
       * \\s or \\b. Split every source backslash into its own
       * text run at the exact monospace grid position.
       */
      let runStart =
        0;

      for (
        let index = 0;
        index < value.length;
        index++
      ) {
        if (
          value[index] !==
          '\\'
        ) {
          continue;
        }

        if (
          index >
          runStart
        ) {
          pdf.text(
            value.slice(
              runStart,
              index
            ),
            codeX +
              runStart *
                charWidth,
            y
          );
        }

        pdf.text(
          '\\',
          codeX +
            index *
              charWidth,
          y
        );

        runStart =
          index + 1;
      }

      if (
        runStart <
        value.length
      ) {
        pdf.text(
          value.slice(
            runStart
          ),
          codeX +
            runStart *
              charWidth,
          y
        );
      }
    };


  const drawRasterExactText =
    (
      value: string,
      y: number
    ) => {
      if (
        typeof document ===
        'undefined'
      ) {
        drawVectorExactText(
          value,
          y
        );

        return;
      }

      const cacheKey =
        [
          theme,
          fontSize,
          codeWidth,
          value,
        ].join(
          '|'
        );

      let cached =
        unicodeRasterCache.get(
          cacheKey
        );

      if (!cached) {
        const scale =
          4;

        const canvas =
          document.createElement(
            'canvas'
          );

        canvas.width =
          Math.max(
            1,
            Math.ceil(
              codeWidth *
                scale
            )
          );

        canvas.height =
          Math.max(
            1,
            Math.ceil(
              lineHeight *
                1.25 *
                scale
            )
          );

        const context =
          canvas.getContext(
            '2d'
          );

        if (!context) {
          drawVectorExactText(
            value,
            y
          );

          return;
        }

        context.scale(
          scale,
          scale
        );

        context.clearRect(
          0,
          0,
          codeWidth,
          lineHeight *
            1.25
        );

        context.font =
          `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Noto Sans Mono", "Noto Sans", "Kohinoor Devanagari", "Kohinoor Bangla", "Tamil Sangam MN", "Nirmala UI", "Hiragino Sans", "Yu Gothic", "PingFang SC", "Microsoft YaHei", "Apple SD Gothic Neo", "Malgun Gothic", "Geeza Pro", "Segoe UI", "Arial Hebrew", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;

        context.textBaseline =
          'alphabetic';

        context.textAlign =
          'left';

        context.direction =
          'ltr';

        context.fillStyle =
          `rgb(${text[0]}, ${text[1]}, ${text[2]})`;

        const measured =
          context.measureText(
            value
          ).width;

        const maxWidth =
          Math.max(
            1,
            codeWidth -
              1
          );

        if (
          measured >
          maxWidth
        ) {
          context.save();

          context.scale(
            maxWidth /
              measured,
            1
          );

          context.fillText(
            value,
            0,
            fontSize
          );

          context.restore();
        } else {
          context.fillText(
            value,
            0,
            fontSize
          );
        }

        cached = {
          dataUrl:
            canvas.toDataURL(
              'image/png'
            ),

          alias:
            `code-u-${hashString(
              cacheKey
            )}`,
        };

        unicodeRasterCache.set(
          cacheKey,
          cached
        );

        canvas.width =
          1;

        canvas.height =
          1;
      }

      pdf.addImage(
        cached.dataUrl,
        'PNG',
        codeX,
        y -
          fontSize *
            0.9,
        codeWidth,
        lineHeight *
          1.05,
        cached.alias,
        'FAST'
      );
    };


  const drawExactText =
    (
      value: string,
      y: number
    ) => {
      /*
       * jsPDF's built-in Courier path is reliable for ordinary
       * ASCII source, but PDF literal-string escaping and the
       * WinAnsi font path are not reliable enough for:
       *
       * - regex/backslash-heavy code (\\s, \\b, \\/)
       * - global Unicode scripts
       * - emoji / combining / ZWJ sequences
       *
       * Render only those exceptional lines through the browser
       * canvas. Ordinary code remains selectable vector text.
       */
      if (
        requiresUnicodeRaster(
          value
        ) ||
        value.includes(
          '\\'
        )
      ) {
        drawRasterExactText(
          value,
          y
        );

        return;
      }

      drawVectorExactText(
        value,
        y
      );
    };

  let y =
    firstY;

  drawPage();

  let inBlockComment =
    false;

  for (
    let lineIndex = 0;
    lineIndex <
    rawLines.length;
    lineIndex++
  ) {
    /*
     * Tabs expand only for visual layout.
     * No other source normalization occurs.
     */
    const line =
      expandTabs(
        rawLines[
          lineIndex
        ]
      );

    const rangeResult =
      findRanges(
        line,
        inBlockComment
      );

    const ranges =
      rangeResult.ranges;

    inBlockComment =
      rangeResult.inBlockComment;

    const chunks =
      chunkLineSafely(
        line,
        maxChars
      );

    for (
      let chunkIndex = 0;
      chunkIndex <
      chunks.length;
      chunkIndex++
    ) {
      if (
        y +
          lineHeight >
        bottom
      ) {
        pdf.addPage();

        drawPage();

        y = firstY;
      }

      if (
        showLineNumbers
      ) {
        pdf.setFont(
          'courier',
          'normal'
        );

        pdf.setFontSize(
          fontSize
        );

        pdf.setTextColor(
          gutterText[0],
          gutterText[1],
          gutterText[2]
        );

        if (
          chunkIndex === 0
        ) {
          pdf.text(
            String(
              lineIndex + 1
            ).padStart(
              lineDigits,
              ' '
            ),
            margin + 4,
            y
          );
        }
      }

      const chunk =
        chunks[
          chunkIndex
        ];

      const chunkEnd =
        chunk.start +
        chunk.text.length;

      /*
       * Draw syntax highlight backgrounds first.
       */
      for (
        const range of
        ranges
      ) {
        const start =
          Math.max(
            range.start,
            chunk.start
          );

        const end =
          Math.min(
            range.end,
            chunkEnd
          );

        if (
          end <= start
        ) {
          continue;
        }

        const color =
          highlight[
            range.kind
          ];

        pdf.setFillColor(
          color[0],
          color[1],
          color[2]
        );

        pdf.rect(
          codeX +
            (
              start -
              chunk.start
            ) *
              charWidth,
          y -
            fontSize * 0.82,
          (
            end -
            start
          ) *
            charWidth,
          fontSize * 1.08,
          'F'
        );
      }

      /*
       * Write exact visible source on top only once.
       */
      drawExactText(
        chunk.text,
        y
      );

      y +=
        lineHeight;
    }
  }

  const pages =
    pdf.getNumberOfPages();

  for (
    let page = 1;
    page <= pages;
    page++
  ) {
    pdf.setPage(
      page
    );

    pdf.setFont(
      'courier',
      'normal'
    );

    pdf.setFontSize(
      8
    );

    pdf.setTextColor(
      gutterText[0],
      gutterText[1],
      gutterText[2]
    );

    pdf.text(
      `Page ${page} of ${pages}`,
      pageWidth -
        margin,
      pageHeight -
        12,
      {
        align:
          'right',
      }
    );
  }

  unicodeRasterCache.clear();

  return new Uint8Array(
    pdf.output(
      'arraybuffer'
    )
  );
}
