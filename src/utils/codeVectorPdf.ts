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
  line: string
): Range[] => {
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
      let i = start;
      i < end;
      i++
    ) {
      if (occupied[i]) {
        return;
      }
    }

    for (
      let i = start;
      i < end;
      i++
    ) {
      occupied[i] = true;
    }

    ranges.push({
      start,
      end,
      kind,
    });
  };

  /*
   * Strings first so regex strings such as:
   *
   * r"\bkill\s+myself\b"
   *
   * stay one untouched source range.
   */
  const stringRegex =
    /(["'`])(?:\\.|(?!\1)[^\\])*\1/g;

  for (
    const match of
    line.matchAll(
      stringRegex
    )
  ) {
    const start =
      match.index || 0;

    add(
      start,
      start +
        match[0].length,
      'string'
    );
  }

  /*
   * Comments.
   */
  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    if (occupied[i]) {
      continue;
    }

    if (
      (
        line[i] === '/' &&
        line[i + 1] === '/'
      ) ||
      line[i] === '#'
    ) {
      add(
        i,
        line.length,
        'comment'
      );

      break;
    }
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

    add(
      start,
      start +
        match[0].length,
      'number'
    );
  }

  return ranges.sort(
    (a, b) =>
      a.start - b.start
  );
};

const drawWarning = (
  pdf: jsPDF,
  x: number,
  baseline: number,
  fontSize: number,
  color: RGB
) => {
  const h =
    fontSize * 0.85;

  const w =
    h * 0.95;

  const top =
    baseline -
    h * 0.78;

  pdf.setDrawColor(
    color[0],
    color[1],
    color[2]
  );

  pdf.setLineWidth(
    0.7
  );

  pdf.triangle(
    x + w / 2,
    top,
    x,
    top + h,
    x + w,
    top + h,
    'S'
  );

  pdf.setFont(
    'courier',
    'bold'
  );

  pdf.setFontSize(
    Math.max(
      5,
      fontSize * 0.6
    )
  );

  pdf.text(
    '!',
    x + w / 2,
    baseline -
      h * 0.08,
    {
      align: 'center',
    }
  );

  return w;
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

  const drawExactText =
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
       * Normal source text is written in one run.
       *
       * Only the unsupported warning symbol is handled
       * separately as vector artwork.
       */
      if (
        !value.includes(
          '\u26A0'
        )
      ) {
        pdf.text(
          value,
          codeX,
          y
        );

        return;
      }

      let x =
        codeX;

      let buffer =
        '';

      const flush =
        () => {
          if (!buffer) {
            return;
          }

          pdf.setFont(
            'courier',
            'normal'
          );

          pdf.setFontSize(
            fontSize
          );

          pdf.text(
            buffer,
            x,
            y
          );

          x +=
            pdf.getTextWidth(
              buffer
            );

          buffer = '';
        };

      for (
        let i = 0;
        i < value.length;
        i++
      ) {
        const char =
          value[i];

        if (
          char === '\u26A0'
        ) {
          flush();

          x +=
            drawWarning(
              pdf,
              x,
              y,
              fontSize,
              text
            ) +
            charWidth * 0.3;

          if (
            value[
              i + 1
            ] ===
            '\uFE0F'
          ) {
            i++;
          }

          continue;
        }

        if (
          char ===
            '\uFE0F' ||
          char ===
            '\uFE0E' ||
          char ===
            '\u200D'
        ) {
          continue;
        }

        buffer += char;
      }

      flush();
    };

  let y =
    firstY;

  drawPage();

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

    const ranges =
      findRanges(
        line
      );

    const chunks:
      Array<{
        text: string;
        start: number;
      }> = [];

    if (
      line.length === 0
    ) {
      chunks.push({
        text: '',
        start: 0,
      });
    } else {
      for (
        let start = 0;
        start <
        line.length;
        start +=
        maxChars
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
    }

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

  return new Uint8Array(
    pdf.output(
      'arraybuffer'
    )
  );
}
