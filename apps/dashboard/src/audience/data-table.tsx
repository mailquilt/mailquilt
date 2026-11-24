/* oxlint-disable jsx-a11y/prefer-tag-over-role -- WARNING: on phones the rows restack with display: grid, which drops table semantics in Safari, so each tr and td keeps its role explicitly. */
import { Table } from "@cloudflare/kumo";
import type { ReactTable, RowData, TableFeatures } from "@tanstack/react-table";

/**
 * Where a column goes when rows stack into lines on phones: the
 * checkbox, the main line, the second line, beside the main line, a line of
 * its own under the rest, or not shown.
 */
export type StackedArea = "check" | "main" | "sub" | "side" | "foot" | "hide";

/**
 * A TanStack table drawn with Kumo's `Table` and its default header, with
 * 48px hairline rows and selected rows tinted. On phones each row restacks into lines, its columns placed by
 * `areas`, instead of the table scrolling sideways. `columnClassNames` lays
 * out a column's header and cells by its id; how a value looks belongs to
 * its cell.
 */
export const DataTable = <
  TFeatures extends TableFeatures,
  TData extends RowData,
>({
  areas,
  columnClassNames,
  isSelected,
  label,
  table,
}: {
  areas: Readonly<Record<string, StackedArea>>;
  columnClassNames: Readonly<Record<string, string>>;
  isSelected?: (rowId: string) => boolean;
  label: string;
  table: ReactTable<TFeatures, TData>;
}) => (
  <Table
    aria-label={label}
    className={`mq-table mq-stack ${Object.values(areas).includes("check") ? "" : "mq-no-check"}`}
  >
    <Table.Header>
      {table.getHeaderGroups().map((group) => (
        <Table.Row key={group.id}>
          {group.headers.map((header) => (
            <Table.Head
              className={columnClassNames[header.column.id]}
              data-area={areas[header.column.id]}
              key={header.id}
            >
              {header.isPlaceholder ? null : (
                <table.FlexRender header={header} />
              )}
            </Table.Head>
          ))}
        </Table.Row>
      ))}
    </Table.Header>
    <Table.Body>
      {table.getRowModel().rows.map((row) => (
        <Table.Row
          data-selected={isSelected?.(row.id) ? "" : undefined}
          key={row.id}
          role="row"
        >
          {row.getAllCells().map((cell) => (
            <Table.Cell
              className={columnClassNames[cell.column.id]}
              data-area={areas[cell.column.id]}
              key={cell.id}
              role="cell"
            >
              <table.FlexRender cell={cell} />
            </Table.Cell>
          ))}
        </Table.Row>
      ))}
    </Table.Body>
  </Table>
);
