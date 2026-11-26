import { eachOnce, isAddress } from "./addresses.ts";

const SEPARATORS = [",", ";", "\t"] as const;

const ADDRESS_HEADER = /^(?:e-?mail(?: address)?|address)$/iu;

const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff);

const QUOTED = /"[^"]*"/gu;

const separatorOf = (text: string) => {
  const firstLine = text
    .slice(0, text.search(/\r?\n|$/u))
    .replaceAll(QUOTED, "");

  let best: (typeof SEPARATORS)[number] = ",";

  for (const candidate of SEPARATORS) {
    if (firstLine.split(candidate).length > firstLine.split(best).length) {
      best = candidate;
    }
  }

  return best;
};

const rowsOf = (text: string) => {
  const separator = separatorOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let justClosedQuote = false;
  let justEndedWithReturn = false;

  for (const character of text) {
    const newlineAfterReturn = justEndedWithReturn && character === "\n";
    const quoteInsideQuotes = justClosedQuote && character === '"';

    justEndedWithReturn = false;
    justClosedQuote = false;

    if (newlineAfterReturn) {
      continue;
    }

    if (quoted) {
      if (character === '"') {
        quoted = false;
        justClosedQuote = true;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      if (quoteInsideQuotes) {
        cell += '"';
      }

      quoted = true;
    } else if (character === separator) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      justEndedWithReturn = character === "\r";
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

/** A CSV file read for a Suppression import, before a column is chosen. */
export interface CsvFile {
  /** Each column's header, or "Column 2" when the file has no header row. */
  readonly columns: readonly string[];
  /** The column the addresses are taken from unless the member picks another, or none when no column holds one. */
  readonly column: number | undefined;
  /** How many rows hold data, the header and blank rows left out. */
  readonly rows: number;
  readonly data: readonly {
    readonly cells: readonly string[];
    readonly row: number;
  }[];
}

/** One column's addresses, and the rows where it holds none. */
export interface ColumnAddresses {
  /** Each address once, ignoring case, in the spelling it first appears in. */
  readonly addresses: readonly string[];
  /** The rows whose cell in that column isn't an address, numbered as a spreadsheet numbers them. */
  readonly skipped: readonly { readonly row: number; readonly value: string }[];
}

/**
 * Reads a CSV file's text once. The first row is the header when it has no
 * "@" and names the address column, or has a name over every column that
 * holds addresses below it; otherwise it's data. The column suggested is
 * the one headed email, e-mail or address, or else the first with an
 * address in it. Blank rows are passed over.
 */
export const readCsv = (text: string) => {
  const numbered = rowsOf(text.replace(BYTE_ORDER_MARK, ""))
    .map((cells, index) => ({
      cells: cells.map((cell) => cell.trim()),
      row: index + 1,
    }))
    .filter(({ cells }) => cells.some((cell) => cell !== ""));

  const [first] = numbered;

  const rest = numbered.slice(1);
  const width = Math.max(0, ...numbered.map(({ cells }) => cells.length));

  const holdsAddresses = (column: number) =>
    rest.some(({ cells }) => cells[column]?.includes("@") === true);

  const namesEveryAddressColumn = Array.from(
    { length: width },
    (_, column) => first?.cells[column] ?? ""
  ).every((name, column) => name !== "" || !holdsAddresses(column));

  const hasHeader =
    first !== undefined &&
    !first.cells.some((cell) => cell.includes("@")) &&
    (first.cells.some((cell) => ADDRESS_HEADER.test(cell)) ||
      namesEveryAddressColumn);

  const data = hasHeader ? rest : numbered;

  const columns = Array.from({ length: width }, (_, index) => {
    const header = hasHeader ? first.cells[index] : undefined;

    return header === undefined || header === ""
      ? `Column ${index + 1}`
      : header;
  });

  const headed = hasHeader
    ? first.cells.findIndex((cell) => ADDRESS_HEADER.test(cell))
    : -1;

  const withAddresses = columns.findIndex((_, index) =>
    data.some(({ cells }) => isAddress(cells[index]))
  );

  const found = headed === -1 ? withAddresses : headed;

  return {
    column: found === -1 ? undefined : found,
    columns,
    data,
    rows: data.length,
  } satisfies CsvFile;
};

/** The addresses in one column of a file `readCsv` read; any other row whose cell isn't an address is skipped and reported. */
export const addressesIn = (file: CsvFile, column: number) => {
  const found: string[] = [];
  const skipped: { row: number; value: string }[] = [];

  for (const { cells, row } of file.data) {
    const value = cells[column] ?? "";

    if (isAddress(value)) {
      found.push(value);
    } else {
      skipped.push({ row, value });
    }
  }

  return { addresses: eachOnce(found), skipped } satisfies ColumnAddresses;
};
