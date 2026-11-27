import { Button } from "@cloudflare/kumo";
import type {
  Organization,
  Suppression,
  SuppressionReason,
} from "@repo/domain";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useRef, useState } from "react";

import { loadingFirstTime } from "../api.ts";
import { FileArrowUpIcon, LockSimpleIcon, PlusIcon } from "../icons/icons.tsx";
import { useDialog } from "../layout/action-dialog.tsx";
import { Breakable } from "../layout/breakable.tsx";
import { CursorPager } from "../layout/cursor-pager.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useSuppressionPage } from "./audience-api.ts";
import { DataTable } from "./data-table.tsx";
import type { StackedArea } from "./data-table.tsx";
import { formatCount, formatDay } from "./format.ts";
import { ImportSuppressionsDialog } from "./import-suppressions-dialog.tsx";
import { RemoveSuppressionDialog } from "./remove-suppression-dialog.tsx";
import { SuppressAddressesDialog } from "./suppress-addresses-dialog.tsx";
import type { SuppressionSearch } from "./suppression-search.ts";

const REASON_LABELS: Record<SuppressionReason, string> = {
  complaint: "Spam complaint",
  "hard-bounce": "Hard bounce",
  manual: "Added by hand",
  "soft-bounce": "Soft bounces",
};

const REASON_FILLS: Record<SuppressionReason, string> = {
  complaint: "bg-(--mq-patch-pale)",
  "hard-bounce": "bg-(--mq-patch-grey)",
  manual: "bg-(--mq-block-ink)",
  "soft-bounce": "bg-(--mq-patch-grey)",
};

const ReasonLabel = ({
  day,
  reason,
}: {
  day?: string;
  reason: SuppressionReason;
}) => (
  <span className="inline-flex items-center gap-2 text-sm text-kumo-default">
    <span
      aria-hidden="true"
      className={`inline-block size-3 shrink-0 rounded-quilt ${REASON_FILLS[reason]}`}
    />
    <span>
      {REASON_LABELS[reason]}
      {day === undefined ? null : (
        <span className="text-kumo-subtle"> on {day}</span>
      )}
    </span>
  </span>
);

const CantBeRemoved = () => (
  <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-kumo-subtle">
    <LockSimpleIcon aria-hidden="true" className="size-4" />
    Can’t be removed
  </span>
);

const focusOnMount = (element: HTMLElement | null) => element?.focus();

// WARNING: TanStack renders each cell as a component, so new columns remount every row's open dialog; rows carry what the actions need and COLUMNS stays module-level.
interface SuppressionRow {
  readonly suppression: Suppression;
  readonly organization: Organization;
  readonly onRemoved: (email: string) => void;
}

const RemoveAction = ({
  onRemoved,
  organization,
  suppression,
}: SuppressionRow) => {
  const removing = useDialog();
  const button = useRef<HTMLButtonElement>(null);

  return (
    <span className="flex justify-end">
      <Button
        className="-mr-3 max-sm:-my-1.5 max-sm:-ml-3"
        onClick={() => removing.setOpen(true)}
        ref={button}
        variant="ghost"
      >
        Remove
        <span className="sr-only"> suppression of {suppression.email}</span>
      </Button>
      <RemoveSuppressionDialog
        finalFocus={button}
        key={removing.key}
        onExited={removing.handleExited}
        onOpenChange={removing.handleOpenChange}
        onRemoved={onRemoved}
        open={removing.open}
        organization={organization}
        suppression={suppression}
      />
    </span>
  );
};

const features = tableFeatures({});

const helper = createColumnHelper<typeof features, SuppressionRow>();

const COLUMNS = helper.columns([
  helper.accessor((row) => row.suppression.email, {
    cell: ({ getValue }) => (
      <span className="block font-medium text-kumo-strong sm:py-2.5">
        <Breakable value={getValue()} />
      </span>
    ),
    header: "Email",
    id: "email",
  }),
  helper.accessor((row) => row.suppression, {
    cell: ({ getValue }) => {
      const { createdAt, reason } = getValue();

      return (
        <>
          <span className="max-sm:hidden">
            <ReasonLabel reason={reason} />
          </span>
          <span className="sm:hidden">
            <ReasonLabel day={formatDay(createdAt)} reason={reason} />
            {reason === "manual" ? null : (
              <span className="mt-1 flex">
                <CantBeRemoved />
              </span>
            )}
          </span>
        </>
      );
    },
    header: "Reason",
    id: "reason",
  }),
  helper.accessor((row) => row.suppression.createdAt, {
    cell: ({ getValue }) => (
      <span className="text-sm text-kumo-subtle tabular-nums">
        {formatDay(getValue())}
      </span>
    ),
    header: "Suppressed",
    id: "day",
  }),
  helper.display({
    cell: ({ row }) =>
      row.original.suppression.reason === "manual" ? (
        <RemoveAction {...row.original} />
      ) : (
        <span className="max-sm:hidden">
          <CantBeRemoved />
        </span>
      ),
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
  }),
]);

const COLUMN_CLASSES = {
  actions: "whitespace-nowrap text-right max-sm:self-start sm:w-px",
  day: "w-px whitespace-nowrap pr-10 sm:max-md:hidden",
  email: "min-w-0 sm:max-w-[34rem]",
  reason: "whitespace-nowrap",
};

const AREAS = {
  actions: "side",
  day: "hide",
  email: "main",
  reason: "sub",
} satisfies Record<string, StackedArea>;

const SuppressionsTable = ({ rows }: { rows: readonly SuppressionRow[] }) => {
  const table = useTable({
    columns: COLUMNS,
    data: rows,
    features,
    getRowId: (row) => row.suppression.id,
  });

  return (
    <DataTable
      areas={AREAS}
      columnClassNames={COLUMN_CLASSES}
      label="Suppressions"
      table={table}
    />
  );
};

/**
 * The Organization's Suppressions, newest first, as a table: each address,
 * why it's Suppressed and since when. Members Suppress addresses by hand or
 * from a CSV file, and remove the ones added by hand; a bounce or complaint
 * can't be removed. It pages through the URL, like Contacts.
 */
export const SuppressionsPage = ({
  onSearch,
  organization,
  search,
}: {
  onSearch: (search: SuppressionSearch) => void;
  organization: Organization;
  search: SuppressionSearch;
}) => {
  const page = useSuppressionPage(organization.id, search);
  const adding = useDialog();
  const importing = useDialog();
  const addButton = useRef<HTMLButtonElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);

  const [lastRemoved, setLastRemoved] = useState<{
    readonly count: number;
    readonly email: string;
  }>();

  const onRemoved = (email: string) =>
    setLastRemoved((last) => ({ count: (last?.count ?? 0) + 1, email }));

  if (loadingFirstTime(page)) {
    return <PageAreaLoading label="Loading suppressions" />;
  }

  const importCsv = (
    <Button
      icon={FileArrowUpIcon}
      onClick={() => importing.setOpen(true)}
      ref={importButton}
      variant="secondary"
    >
      Import CSV
    </Button>
  );

  const suppress = (
    <Button
      icon={PlusIcon}
      onClick={() => adding.setOpen(true)}
      ref={addButton}
      variant="primary"
    >
      Suppress addresses
    </Button>
  );

  const total = page.data?.total ?? 0;

  const body = () => {
    if (page.data === undefined) {
      return (
        <TableRegion bordered label="Suppressions">
          <LoadFailed
            onRetry={() => page.refetch()}
            retrying={page.isFetching}
            title="Your suppressions didn’t load"
          />
        </TableRegion>
      );
    }

    if (total === 0) {
      return (
        <TableRegion bordered label="Suppressions">
          <EmptyState
            actions={
              <>
                {suppress}
                {importCsv}
              </>
            }
            description="Suppress an address to keep every campaign away from it, such as someone who asked not to be emailed again, or import the list from the tool you used before."
            title="No suppressed addresses yet"
          />
        </TableRegion>
      );
    }

    const shown = page.data;

    return (
      <TableRegion
        bordered
        busy={page.isPlaceholderData}
        footer={
          <CursorPager
            label="Pages of suppressions"
            loading={page.isPlaceholderData}
            next={shown.next}
            onPage={onSearch}
            previous={shown.previous}
            shown={shown.suppressions.length}
            start={shown.start}
            total={shown.total}
          />
        }
        label="Suppressions"
      >
        <SuppressionsTable
          rows={shown.suppressions.map((suppression) => ({
            onRemoved,
            organization,
            suppression,
          }))}
        />
      </TableRegion>
    );
  };

  return (
    <TablePage
      actions={
        total === 0 ? undefined : (
          <div className="flex flex-wrap-reverse gap-2 *:whitespace-nowrap max-sm:*:grow max-sm:*:justify-center">
            {importCsv}
            {suppress}
          </div>
        )
      }
      description={`Addresses no campaign from ${organization.name} will reach, whatever lists they’re on and whether or not they’re a contact.`}
      title="Suppressions"
      titleDetail={total === 0 ? undefined : formatCount(total)}
    >
      {lastRemoved === undefined ? null : (
        <p
          className="sr-only"
          key={lastRemoved.count}
          ref={focusOnMount}
          tabIndex={-1}
        >
          Removed the suppression of {lastRemoved.email}.
        </p>
      )}
      {body()}
      <SuppressAddressesDialog
        finalFocus={addButton}
        key={adding.key}
        onExited={adding.handleExited}
        onOpenChange={adding.handleOpenChange}
        open={adding.open}
        organization={organization}
      />
      <ImportSuppressionsDialog
        finalFocus={importButton}
        key={importing.key}
        onExited={importing.handleExited}
        onOpenChange={importing.handleOpenChange}
        open={importing.open}
        organization={organization}
      />
    </TablePage>
  );
};
