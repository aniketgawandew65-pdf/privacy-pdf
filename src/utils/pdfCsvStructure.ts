import type {
  ExtractedTableResult,
} from './pdfEngine';

type CsvDelimiter =
  | ','
  | ';'
  | '\t';

type BankColumn =
  | 'transactionDate'
  | 'valueDate'
  | 'details'
  | 'debit'
  | 'credit'
  | 'balance';

type BankHeaderMap =
  Partial<
    Record<
      BankColumn,
      number
    >
  >;

const BANK_HEADER = [
  'Transaction Date',
  'Value Date',
  'Details of transaction',
  'Debit',
  'Credit',
  'Balance',
];

const cleanCell = (
  value: unknown
) =>
  String(
    value ?? ''
  )
    .replace(
      /\u0000/g,
      ''
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();

const cleanRow = (
  row: string[]
) => {
  const cleaned =
    row.map(
      cleanCell
    );

  while (
    cleaned.length >
      0 &&
    !cleaned[
      cleaned.length -
        1
    ]
  ) {
    cleaned.pop();
  }

  return cleaned;
};

const DATE_TEST =
  /\b\d{1,2}[-/](?:[A-Za-z]{3}|\d{1,2})[-/]\d{2,4}\b/;

const DATE_GLOBAL =
  /\b\d{1,2}[-/](?:[A-Za-z]{3}|\d{1,2})[-/]\d{2,4}\b/g;

const MONEY_TEST =
  /(?:₹\s*)?-?\d[\d,]*\.\d{2}\b/;

const MONEY_GLOBAL =
  /(?:₹\s*)?-?\d[\d,]*\.\d{2}\b/g;

const WHOLE_MONEY =
  /^\(?\s*(?:₹\s*)?-?\d[\d,]*\.\d{2}\s*(?:CR|DR)?\s*\)?$/i;

const firstDate = (
  value: string
) =>
  value.match(
    DATE_TEST
  )?.[0] || '';

const moneyCell = (
  value: string
) =>
  WHOLE_MONEY.test(
    cleanCell(
      value
    )
  );

const normalizeMoney = (
  value: string
) => {
  const clean =
    cleanCell(
      value
    );

  const match =
    clean.match(
      MONEY_TEST
    );

  return match?.[0] ||
    '';
};

const moneyNumber = (
  value: string
):
  number |
  null => {
  const normalized =
    normalizeMoney(
      value
    );

  if (!normalized) {
    return null;
  }

  const number =
    Number(
      normalized
        .replace(
          /₹/g,
          ''
        )
        .replace(
          /,/g,
          ''
        )
        .trim()
    );

  return Number.isFinite(
    number
  )
    ? number
    : null;
};

const rowText = (
  row: string[]
) =>
  cleanRow(
    row
  )
    .filter(
      Boolean
    )
    .join(
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();

const findHeaderMap = (
  rows: string[][]
):
  BankHeaderMap |
  null => {
  for (
    const rawRow of
    rows
  ) {
    const row =
      cleanRow(
        rawRow
      );

    if (
      row.length <
      4
    ) {
      continue;
    }

    const map:
      BankHeaderMap = {};

    for (
      let index = 0;
      index <
      row.length;
      index++
    ) {
      const value =
        row[index]
          .toLowerCase();

      /*
       * Some bank PDFs expose:
       *
       * "Transaction Date Value Date"
       *
       * as ONE physical PDF text column.
       *
       * Both logical fields therefore legitimately point to
       * the same source column.
       */
      const hasTransactionDate =
        /transaction\s*date/.test(
          value
        );

      const hasValueDate =
        /value\s*date/.test(
          value
        );


      if (
        map.transactionDate ===
          undefined &&
        hasTransactionDate
      ) {
        map.transactionDate =
          index;
      }


      if (
        map.valueDate ===
          undefined &&
        hasValueDate
      ) {
        map.valueDate =
          index;
      }


      if (
        hasTransactionDate ||
        hasValueDate
      ) {
        continue;
      }

      if (
        map.details ===
          undefined &&
        /(details?|description|narration|particulars?|remarks?)/.test(
          value
        )
      ) {
        map.details =
          index;

        continue;
      }

      if (
        map.debit ===
          undefined &&
        /\b(debit|withdrawal|dr)\b/.test(
          value
        )
      ) {
        map.debit =
          index;

        continue;
      }

      if (
        map.credit ===
          undefined &&
        /\b(credit|deposit|cr)\b/.test(
          value
        )
      ) {
        map.credit =
          index;

        continue;
      }

      if (
        map.balance ===
          undefined &&
        /\bbalance\b/.test(
          value
        )
      ) {
        map.balance =
          index;
      }
    }

    const unique =
      new Set(
        Object.values(
          map
        )
      );

    if (
      unique.size >=
        4 &&
      map.details !==
        undefined &&
      map.balance !==
        undefined
    ) {
      return map;
    }
  }

  return null;
};

const looksLikeBankHeader = (
  text: string
) => {
  const lower =
    text.toLowerCase();

  let score = 0;

  if (
    /transaction\s*date/.test(
      lower
    )
  ) {
    score++;
  }

  if (
    /value\s*date/.test(
      lower
    )
  ) {
    score++;
  }

  if (
    /(details?|description|narration|particulars?)/.test(
      lower
    )
  ) {
    score++;
  }

  if (
    /\bdebit\b/.test(
      lower
    )
  ) {
    score++;
  }

  if (
    /\bcredit\b/.test(
      lower
    )
  ) {
    score++;
  }

  if (
    /\bbalance\b/.test(
      lower
    )
  ) {
    score++;
  }

  return score >=
    4;
};

const detectBankStatement = (
  rows: string[][]
) => {
  if (
    findHeaderMap(
      rows
    )
  ) {
    return true;
  }

  let transactionRows =
    0;

  let hasBalanceLabel =
    false;

  for (
    const row of
    rows
  ) {
    const text =
      rowText(
        row
      );

    if (
      /\bbalance\b/i.test(
        text
      )
    ) {
      hasBalanceLabel =
        true;
    }

    if (
      DATE_TEST.test(
        text
      ) &&
      MONEY_TEST.test(
        text
      )
    ) {
      transactionRows++;
    }
  }

  return (
    transactionRows >=
      4 &&
    hasBalanceLabel
  );
};

const isBankNoise = (
  text: string
) => {
  const lower =
    text
      .toLowerCase()
      .trim();

  if (!lower) {
    return true;
  }

  if (
    /^page\s+\d+\s+of\s+\d+/.test(
      lower
    )
  ) {
    return true;
  }

  return (
    /^private\s*&\s*confidential/.test(
      lower
    ) ||
    /^customer\s+no\b/.test(
      lower
    ) ||
    /^ifsc\s+code\b/.test(
      lower
    ) ||
    /^micr\s+code\b/.test(
      lower
    ) ||
    /^branch\s+address\b/.test(
      lower
    ) ||
    /^dear\s+customer\b/.test(
      lower
    ) ||
    /^wholly\s+yours\b/.test(
      lower
    ) ||
    /^team\s+\w+/.test(
      lower
    ) ||
    /^important\s+abbreviations/.test(
      lower
    ) ||
    /^gst\s+related\s+information/.test(
      lower
    ) ||
    /^taxes\s+as\s+per/.test(
      lower
    ) ||
    /^closing\s+balance\s+includes/.test(
      lower
    ) ||
    /^this\s+is\s+a\s+computer\s+generated/.test(
      lower
    ) ||
    /^save\s+with\s+the/.test(
      lower
    ) ||
    /^summary\s+of\s+account\s+statement/.test(
      lower
    ) ||
    /^account\s+name\b/.test(
      lower
    ) ||
    /^account\s+no\b/.test(
      lower
    ) ||
    /^statement\s+period\b/.test(
      lower
    ) ||
    /^currency\b/.test(
      lower
    )
  );
};

const removeTokens = (
  source: string,
  tokens: string[]
) => {
  let result =
    source;

  for (
    const token of
    tokens
  ) {
    if (!token) {
      continue;
    }

    result =
      result.replace(
        token,
        ' '
      );
  }

  return result
    .replace(
      /\s*\|\s*/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
};

const appendDescription = (
  row: string[],
  continuation: string
) => {
  const clean =
    cleanCell(
      continuation
    );

  if (!clean) {
    return;
  }

  row[2] =
    (
      row[2]
        ? `${row[2]} ${clean}`
        : clean
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();
};

const mappedValue = (
  row: string[],
  map: BankHeaderMap,
  key: BankColumn
) => {
  const index =
    map[key];

  if (
    index ===
      undefined ||
    index <
      0 ||
    index >=
      row.length
  ) {
    return '';
  }

  return cleanCell(
    row[index]
  );
};

const normalizeBankRows = (
  inputRows:
    string[][]
):
  string[][] => {
  const rows =
    inputRows
      .map(
        cleanRow
      )
      .filter(
        (
          row
        ) =>
          row.some(
            Boolean
          )
      );

  const headerMap =
    findHeaderMap(
      rows
    );

  const output:
    string[][] = [
      [...BANK_HEADER],
    ];

  let previousTransaction:
    string[] |
    null =
      null;

  let previousBalance:
    number |
    null =
      null;

  for (
    const row of
    rows
  ) {
    const text =
      rowText(
        row
      );

    if (
      !text ||
      looksLikeBankHeader(
        text
      )
    ) {
      continue;
    }

    /*
     * Opening / closing balance are useful accounting rows.
     */
    if (
      /\b(opening|closing)\s+balance\b/i.test(
        text
      )
    ) {
      const money =
        Array.from(
          text.matchAll(
            MONEY_GLOBAL
          )
        )
          .map(
            (
              match
            ) =>
              match[0]
          );

      const balance =
        money[
          money.length -
            1
        ] || '';

      if (balance) {
        const balanceRow = [
          '',
          '',
          /\bopening\s+balance\b/i.test(
            text
          )
            ? 'Opening Balance'
            : 'Closing Balance',
          '',
          '',
          balance,
        ];

        output.push(
          balanceRow
        );

        previousTransaction =
          balanceRow;

        previousBalance =
          moneyNumber(
            balance
          );
      }

      continue;
    }

    if (
      isBankNoise(
        text
      )
    ) {
      continue;
    }

    /*
     * Best path:
     * use the original coordinate column map.
     */
    if (headerMap) {
      const transactionDateSource =
        mappedValue(
          row,
          headerMap,
          'transactionDate'
        );

      const valueDateSource =
        mappedValue(
          row,
          headerMap,
          'valueDate'
        );


      /*
       * DBS and similar statements place both dates inside the
       * same physical PDF coordinate column.
       *
       * Example:
       *
       * 01-Feb-2022 01-Feb-2022 UPI~...
       *
       * Preserve the first date as Transaction Date and the
       * second as Value Date instead of duplicating/dropping one.
       */
      const sharedDateColumn =
        headerMap.transactionDate !==
          undefined &&
        headerMap.transactionDate ===
          headerMap.valueDate;


      const sharedDates =
        sharedDateColumn
          ? (
              transactionDateSource.match(
                DATE_GLOBAL
              ) || []
            )
          : [];


      const transactionDate =
        sharedDates[0] ||
        firstDate(
          transactionDateSource
        );


      const valueDate =
        sharedDates[1] ||
        firstDate(
          valueDateSource
        );

      const debit =
        normalizeMoney(
          mappedValue(
            row,
            headerMap,
            'debit'
          )
        );

      const credit =
        normalizeMoney(
          mappedValue(
            row,
            headerMap,
            'credit'
          )
        );

      const balance =
        normalizeMoney(
          mappedValue(
            row,
            headerMap,
            'balance'
          )
        );

      let details =
        mappedValue(
          row,
          headerMap,
          'details'
        );


      /*
       * When both dates share the first PDF column, that same
       * cell also contains the beginning of the narration.
       *
       * Remove only the two date tokens and prepend the
       * remaining text to the dedicated Details column.
       *
       * This preserves transaction IDs, UPI references,
       * merchant text, ATM references, etc.
       */
      if (
        sharedDateColumn &&
        sharedDates.length >=
          2
      ) {
        const inlineDetails =
          removeTokens(
            transactionDateSource,
            sharedDates.slice(
              0,
              2
            )
          );


        if (
          inlineDetails
        ) {
          details =
            (
              inlineDetails +
              (
                details
                  ? ' ' +
                    details
                  : ''
              )
            )
              .replace(
                /\s+/g,
                ' '
              )
              .trim();
        }
      }

      /*
       * OCR/text layers sometimes place a continuation fragment
       * into a neighbouring nominal column. If it is not a date
       * or money value, keep it as description text.
       */
      const mappedIndexes =
        new Set(
          Object.values(
            headerMap
          )
        );

      for (
        let index = 0;
        index <
        row.length;
        index++
      ) {
        if (
          mappedIndexes.has(
            index
          )
        ) {
          continue;
        }

        const extra =
          cleanCell(
            row[index]
          );

        if (
          !extra ||
          DATE_TEST.test(
            extra
          ) ||
          moneyCell(
            extra
          )
        ) {
          continue;
        }

        details =
          (
            details
              ? `${details} ${extra}`
              : extra
          )
            .replace(
              /\s+/g,
              ' '
            )
            .trim();
      }

      if (
        transactionDate ||
        valueDate
      ) {
        const normalized = [
          transactionDate,
          valueDate,
          details,
          debit,
          credit,
          balance,
        ];

        output.push(
          normalized
        );

        previousTransaction =
          normalized;

        if (balance) {
          previousBalance =
            moneyNumber(
              balance
            );
        }

        continue;
      }

      /*
       * Wrapped narration/reference line.
       */
      if (
        previousTransaction &&
        details &&
        !debit &&
        !credit &&
        !balance
      ) {
        appendDescription(
          previousTransaction,
          details
        );

        continue;
      }
    }

    /*
     * Fallback for scans or PDFs where the source exposes a
     * whole visual row as one text fragment.
     */
    const dates =
      Array.from(
        text.matchAll(
          DATE_GLOBAL
        )
      )
        .map(
          (
            match
          ) =>
            match[0]
        );

    const monies =
      Array.from(
        text.matchAll(
          MONEY_GLOBAL
        )
      )
        .map(
          (
            match
          ) =>
            match[0]
        );

    if (
      dates.length >
        0 &&
      monies.length >
        0
    ) {
      const transactionDate =
        dates[0] ||
        '';

      const valueDate =
        dates[1] ||
        '';

      const balance =
        monies[
          monies.length -
            1
        ] || '';

      const transactionAmounts =
        monies.slice(
          0,
          -1
        );

      let debit = '';
      let credit = '';

      if (
        transactionAmounts.length >=
        2
      ) {
        debit =
          transactionAmounts[0];

        credit =
          transactionAmounts[1];
      } else if (
        transactionAmounts.length ===
        1
      ) {
        const amount =
          transactionAmounts[0];

        const currentBalance =
          moneyNumber(
            balance
          );

        const amountNumber =
          moneyNumber(
            amount
          );

        if (
          previousBalance !==
            null &&
          currentBalance !==
            null &&
          amountNumber !==
            null
        ) {
          const debitExpected =
            previousBalance -
            amountNumber;

          const creditExpected =
            previousBalance +
            amountNumber;

          if (
            Math.abs(
              currentBalance -
              debitExpected
            ) <=
            0.011
          ) {
            debit =
              amount;
          } else if (
            Math.abs(
              currentBalance -
              creditExpected
            ) <=
            0.011
          ) {
            credit =
              amount;
          } else {
            /*
             * If balance arithmetic cannot prove direction,
             * preserve the value rather than inventing Credit.
             */
            debit =
              amount;
          }
        } else {
          debit =
            amount;
        }
      }

      const details =
        removeTokens(
          text,
          [
            ...dates,
            ...monies,
          ]
        )
          .replace(
            /^(transaction\s+date|value\s+date|details?\s+of\s+transaction|description|narration)\s*/i,
            ''
          )
          .trim();

      const normalized = [
        transactionDate,
        valueDate,
        details,
        debit,
        credit,
        balance,
      ];

      output.push(
        normalized
      );

      previousTransaction =
        normalized;

      if (balance) {
        previousBalance =
          moneyNumber(
            balance
          );
      }

      continue;
    }

    /*
     * A non-financial line immediately after a transaction is
     * normally wrapped narration/reference data.
     */
    if (
      previousTransaction &&
      !DATE_TEST.test(
        text
      ) &&
      !MONEY_TEST.test(
        text
      ) &&
      !isBankNoise(
        text
      )
    ) {
      appendDescription(
        previousTransaction,
        text
      );
    }
  }

  return output;
};

const looksLikeHeaderRow = (
  row: string[]
) => {
  const populated =
    row.filter(
      Boolean
    );

  if (
    populated.length <
    2
  ) {
    return false;
  }

  const text =
    populated.join(
      ' '
    );

  if (
    DATE_TEST.test(
      text
    ) ||
    MONEY_TEST.test(
      text
    )
  ) {
    return false;
  }

  const alphaCells =
    populated.filter(
      (
        value
      ) =>
        /[A-Za-z]{2,}/.test(
          value
        )
    ).length;

  return (
    alphaCells /
      populated.length >=
    0.6
  );
};

/*
 * ============================================================
 * BANK DEBIT / CREDIT COLUMN REPAIR
 * ============================================================
 *
 * Some PDF text layers expose transaction rows as:
 *
 * Date | Value Date | Details | Amount | Balance
 *
 * even though the visual table has:
 *
 * Date | Value Date | Details | Debit | Credit | Balance
 *
 * The balance progression lets us recover the direction
 * without guessing:
 *
 * previous - amount = current  -> Debit
 * previous + amount = current  -> Credit
 */
const repairCollapsedBankMoneyColumns = (
  inputRows:
    string[][]
):
  string[][] => {
  let previousBalance:
    number |
    null =
      null;

  return inputRows.map(
    (
      rawRow,
      index
    ) => {
      const row =
        [...rawRow];

      while (
        row.length <
        6
      ) {
        row.push('');
      }

      if (
        index ===
        0
      ) {
        return [
          ...BANK_HEADER,
        ];
      }

      const details =
        cleanCell(
          row[2]
        );

      /*
       * Opening balance establishes the running reference.
       */
      if (
        /\bopening\s+balance\b/i.test(
          details
        )
      ) {
        const balance =
          normalizeMoney(
            row[5] ||
            row[4]
          );

        previousBalance =
          moneyNumber(
            balance
          );

        return [
          '',
          '',
          'Opening Balance',
          '',
          '',
          balance,
        ];
      }

      /*
       * Closing balance always belongs in the Balance column.
       */
      if (
        /\bclosing\s+balance\b/i.test(
          details
        )
      ) {
        const balance =
          normalizeMoney(
            row[5] ||
            row[4]
          );

        return [
          '',
          '',
          'Closing Balance',
          '',
          '',
          balance,
        ];
      }

      const transactionDate =
        firstDate(
          row[0]
        );

      /*
       * Collapsed form produced by some PDF coordinate layers:
       *
       * row[3] = transaction amount
       * row[4] = resulting balance
       * row[5] = blank
       */
      const amount =
        normalizeMoney(
          row[3]
        );

      const possibleBalance =
        normalizeMoney(
          row[4]
        );

      const explicitBalance =
        normalizeMoney(
          row[5]
        );

      if (
        transactionDate &&
        amount &&
        possibleBalance &&
        !explicitBalance
      ) {
        const amountNumber =
          moneyNumber(
            amount
          );

        const currentBalance =
          moneyNumber(
            possibleBalance
          );

        let debit = '';
        let credit = '';

        if (
          previousBalance !==
            null &&
          amountNumber !==
            null &&
          currentBalance !==
            null
        ) {
          const debitBalance =
            previousBalance -
            amountNumber;

          const creditBalance =
            previousBalance +
            amountNumber;

          if (
            Math.abs(
              currentBalance -
              debitBalance
            ) <=
            0.02
          ) {
            debit =
              amount;
          } else if (
            Math.abs(
              currentBalance -
              creditBalance
            ) <=
            0.02
          ) {
            credit =
              amount;
          } else {
            /*
             * Preserve the amount even if a malformed statement
             * prevents balance arithmetic from proving direction.
             */
            debit =
              amount;
          }
        } else {
          debit =
            amount;
        }

        previousBalance =
          currentBalance;

        return [
          cleanCell(
            row[0]
          ),
          cleanCell(
            row[1]
          ),
          details,
          debit,
          credit,
          possibleBalance,
        ];
      }

      /*
       * Already-correct six-column rows remain untouched.
       */
      if (
        transactionDate &&
        explicitBalance
      ) {
        previousBalance =
          moneyNumber(
            explicitBalance
          );
      }

      return row.slice(
        0,
        6
      );
    }
  );
};


const normalizeGenericRows = (
  inputRows:
    string[][]
):
  string[][] => {
  const rows =
    inputRows
      .map(
        cleanRow
      )
      .filter(
        (
          row
        ) =>
          row.some(
            Boolean
          )
      );

  /*
   * Remove repeated page headers only when the complete row is
   * identical. We do not guess at unrelated generic tables.
   */
  const seenHeaders =
    new Set<string>();

  const output:
    string[][] =
      [];

  for (
    const row of
    rows
  ) {
    const signature =
      row
        .map(
          (
            cell
          ) =>
            cell.toLowerCase()
        )
        .join(
          '\u241f'
        );

    if (
      looksLikeHeaderRow(
        row
      )
    ) {
      if (
        seenHeaders.has(
          signature
        )
      ) {
        continue;
      }

      seenHeaders.add(
        signature
      );
    }

    /*
     * Remove meaningless coordinate spacer columns while
     * preserving all actual values.
     */
    if (
      row.length >
        8
    ) {
      const populated =
        row.filter(
          Boolean
        );

      if (
        populated.length <=
        8
      ) {
        output.push(
          populated
        );

        continue;
      }
    }

    output.push(
      row
    );
  }

  return output;
};

const escapeCell = (
  value: string,
  delimiter:
    CsvDelimiter
) => {
  const clean =
    cleanCell(
      value
    );

  if (
    clean.includes(
      delimiter
    ) ||
    clean.includes(
      '"'
    ) ||
    clean.includes(
      '\n'
    ) ||
    clean.includes(
      '\r'
    )
  ) {
    return (
      '"' +
      clean.replace(
        /"/g,
        '""'
      ) +
      '"'
    );
  }

  return clean;
};

const buildResult = (
  rows: string[][],
  delimiter:
    CsvDelimiter
):
  ExtractedTableResult => {
  const cleanRows =
    rows
      .map(
        cleanRow
      )
      .filter(
        (
          row
        ) =>
          row.some(
            Boolean
          )
      );

  return {
    rows:
      cleanRows,

    totalRows:
      cleanRows.length,

    csv:
      cleanRows
        .map(
          (
            row
          ) =>
            row
              .map(
                (
                  cell
                ) =>
                  escapeCell(
                    cell,
                    delimiter
                  )
              )
              .join(
                delimiter
              )
        )
        .join(
          '\r\n'
        ),
  };
};

/*
 * ============================================================
 * PDF -> CSV FINAL STRUCTURE REFINEMENT
 * ============================================================
 *
 * Heavy work stays in the existing extractor:
 * - PDF.js coordinates
 * - OCR
 * - mobile memory recycling
 * - durable per-page restart checkpoints
 *
 * This function only cleans the already extracted rows.
 */
export function refineExtractedTableResult(
  result:
    ExtractedTableResult,
  delimiter:
    CsvDelimiter
):
  ExtractedTableResult {
  const rows =
    result.rows || [];

  if (
    rows.length ===
    0
  ) {
    return result;
  }

  if (
    detectBankStatement(
      rows
    )
  ) {
    const bankRows =
      repairCollapsedBankMoneyColumns(
        normalizeBankRows(
          rows
        )
      );

    return buildResult(
      bankRows,
      delimiter
    );
  }

  return buildResult(
    normalizeGenericRows(
      rows
    ),
    delimiter
  );
}
