export type DelimitedData = string[][];

const detectDelimiter = (raw: string): ',' | '\t' => {
  let inQuotes = false;
  let commas = 0;
  let tabs = 0;

  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];

    if (char === '"') {
      if (inQuotes && raw[index + 1] === '"') {
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes) {
      if (char === ',') commas += 1;
      else if (char === '\t') tabs += 1;
      else if (char === '\r' || char === '\n') break;
    }
  }

  return tabs > commas ? '\t' : ',';
};

export const parseDelimitedData = (
  raw: string
): DelimitedData => {
  if (!raw) return [];

  const input = raw.replace(/^\uFEFF/, '');
  if (!input.length) return [];

  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];

  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let justEndedRecord = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    justEndedRecord = true;
  };

  for (
    let index = 0;
    index < input.length;
    index++
  ) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }

      justEndedRecord = false;
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
      justEndedRecord = false;
      continue;
    }

    if (char === delimiter) {
      pushField();
      justEndedRecord = false;
      continue;
    }

    if (char === '\r' || char === '\n') {
      pushRow();

      if (
        char === '\r' &&
        input[index + 1] === '\n'
      ) {
        index += 1;
      }

      continue;
    }

    field += char;
    justEndedRecord = false;
  }

  if (
    !justEndedRecord ||
    row.length > 0 ||
    field.length > 0
  ) {
    pushField();
    rows.push(row);
  }

  if (
    rows.length === 1 &&
    rows[0].length === 1 &&
    rows[0][0] === ''
  ) {
    return [];
  }

  return rows;
};
