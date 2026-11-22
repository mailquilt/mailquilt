import { Table } from "@cloudflare/kumo";
import type { ReactTable, RowData, TableFeatures } from "@tanstack/react-table";

const ROW_HAIRLINE =
  "[&>td]:border-b [&>td]:border-kumo-hairline last:[&>td]:border-b-0";

const ROW_WITHOUT_STRIPES = `${ROW_HAIRLINE} even:bg-kumo-base even:[--kumo-table-row-bg:var(--color-kumo-base)]`;

/**
 * A TanStack table drawn with Kumo's `Table`: a compact header, hairline
 * rows, and selected rows tinted. `columnClassNames` lays out a column's
 * header and cells by its id, such as pinning it on phones; how a value looks
 * belongs to its cell. It scrolls sideways when the columns don't fit.
 */
export const DataTable = <
  TFeatures extends TableFeatures,
  TData extends RowData,
>({
  columnClassNames,
  isSelected,
  label,
  table,
}: {
  columnClassNames: Readonly<Record<string, string>>;
  isSelected?: (rowId: string) => boolean;
  label: string;
  table: ReactTable<TFeatures, TData>;
}) => (
  <div className="overflow-x-auto">
    <Table
      aria-label={label}
      className="[&_td]:h-13 [&_td]:py-0 [&_th]:text-sm"
    >
      <Table.Header variant="compact">
        {table.getHeaderGroups().map((group) => (
          <Table.Row className={ROW_HAIRLINE} key={group.id}>
            {group.headers.map((header) => (
              <Table.Head
                className={`whitespace-nowrap ${columnClassNames[header.column.id] ?? ""}`}
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
            className={
              isSelected?.(row.id) ? ROW_HAIRLINE : ROW_WITHOUT_STRIPES
            }
            key={row.id}
            variant={isSelected?.(row.id) ? "selected" : "default"}
          >
            {row.getAllCells().map((cell) => (
              <Table.Cell
                className={`whitespace-nowrap ${columnClassNames[cell.column.id] ?? ""}`}
                key={cell.id}
              >
                <table.FlexRender cell={cell} />
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  </div>
);
