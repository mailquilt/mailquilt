import { ContactEmail } from "@repo/domain";
import { Schema } from "effect";

const isAddress = Schema.is(ContactEmail);

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

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === separator) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

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

/** What a CSV file holds for a Suppression import. */
export interface CsvAddresses {
  /** Each column's header, or "Column 2" when the file has no header row. */
  readonly columns: readonly string[];
  /** The column the addresses come from, or none when no column holds one. */
  readonly column: number | undefined;
  /** Each address once, ignoring case, in the spelling it first appears in. */
  readonly addresses: readonly string[];
  /** The rows whose cell in that column isn't an address, numbered as a spreadsheet numbers them. */
  readonly skipped: readonly { readonly row: number; readonly value: string }[];
}

/**
 * Reads the email addresses in a CSV file's text. A first row with no "@"
 * in it is the header. The addresses come from `chosen`, or else
 * the column headed email, e-mail or address, or else the first column with
 * an address in it. Blank rows are passed over; any other row whose cell
 * isn't an address is skipped and reported.
 */
export const addressesInCsv = (text: string, chosen?: number) => {
  const numbered = rowsOf(text.replace(BYTE_ORDER_MARK, ""))
    .map((cells, index) => ({
      cells: cells.map((cell) => cell.trim()),
      row: index + 1,
    }))
    .filter(({ cells }) => cells.some((cell) => cell !== ""));

  const [first] = numbered;

  const hasHeader =
    first !== undefined && !first.cells.some((cell) => cell.includes("@"));

  const data = hasHeader ? numbered.slice(1) : numbered;
  const width = Math.max(0, ...numbered.map(({ cells }) => cells.length));

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
  const column = chosen ?? (found === -1 ? undefined : found);

  if (column === undefined) {
    return {
      addresses: [],
      column,
      columns,
      skipped: [],
    } satisfies CsvAddresses;
  }

  const byLowerCase = new Map<string, string>();
  const skipped: { row: number; value: string }[] = [];

  for (const { cells, row } of data) {
    const value = cells[column] ?? "";

    if (!isAddress(value)) {
      skipped.push({ row, value });
    } else if (!byLowerCase.has(value.toLowerCase())) {
      byLowerCase.set(value.toLowerCase(), value);
    }
  }

  return {
    addresses: [...byLowerCase.values()],
    column,
    columns,
    skipped,
  } satisfies CsvAddresses;
};
