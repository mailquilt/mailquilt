import { Button } from "@cloudflare/kumo";
import { CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import type { List, Organization } from "@repo/domain";
import { Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useRef, useState } from "react";

import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { useLists } from "./audience-api.ts";
import { DataTable } from "./data-table.tsx";
import { formatCount, formatDay } from "./format.ts";
import { NewListDialog } from "./new-list-dialog.tsx";
import { TableCard, TableEmpty, TableLoadFailed } from "./table-card.tsx";

const features = tableFeatures({});

const helper = createColumnHelper<typeof features, List>();

const NUMBER = "text-right tabular-nums";

const columns = helper.columns([
  helper.accessor("name", {
    cell: ({ row }) => (
      <Link
        className="font-semibold text-kumo-strong after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-kumo-focus"
        search={{ list: row.original.id }}
        to="/contacts"
      >
        {row.original.name}
      </Link>
    ),
    header: "Name",
  }),
  helper.accessor((list) => list.subscriptions.subscribed, {
    cell: ({ getValue }) => (
      <span className="font-medium text-kumo-strong">
        {formatCount(getValue())}
      </span>
    ),
    header: "Subscribed",
    id: "subscribed",
  }),
  helper.accessor((list) => list.subscriptions.pending, {
    cell: ({ getValue }) => (
      <span className="text-kumo-subtle">{formatCount(getValue())}</span>
    ),
    header: "Pending",
    id: "pending",
  }),
  helper.accessor((list) => list.subscriptions.unsubscribed, {
    cell: ({ getValue }) => (
      <span className="text-kumo-subtle">{formatCount(getValue())}</span>
    ),
    header: "Unsubscribed",
    id: "unsubscribed",
  }),
  helper.accessor("createdAt", {
    cell: ({ getValue }) => (
      <span className="text-sm text-kumo-subtle">{formatDay(getValue())}</span>
    ),
    header: "Created",
    id: "created",
  }),
  helper.display({
    cell: () => (
      <CaretRightIcon
        aria-hidden="true"
        className="ml-auto size-4 text-kumo-subtle"
      />
    ),
    header: () => <span className="sr-only">Open</span>,
    id: "open",
  }),
]);

const COLUMN_CLASSES = {
  created: "md:max-lg:hidden",
  name: "max-w-[24rem] truncate",
  open: "w-10",
  pending: NUMBER,
  subscribed: NUMBER,
  unsubscribed: NUMBER,
};

const ListsTable = ({ lists }: { lists: readonly List[] }) => {
  const table = useTable({
    columns,
    data: lists,
    features,
    getRowId: (list) => list.id,
  });

  return (
    <div className="[&_tbody_tr]:relative [&_tbody_tr:hover]:bg-kumo-elevated [&_tbody_tr:hover]:[--kumo-table-row-bg:var(--color-kumo-elevated)]">
      <DataTable
        columnClassNames={COLUMN_CLASSES}
        label="Lists"
        table={table}
      />
    </div>
  );
};

/**
 * The Organization's Lists, with how many Contacts are subscribed, pending
 * and unsubscribed on each. A row opens Contacts filtered to that List.
 */
export const ListsPage = ({ organization }: { organization: Organization }) => {
  const lists = useLists(organization.id);
  const [creating, setCreating] = useState({ key: 0, open: false });

  const startCreating = () =>
    setCreating(({ key }) => ({ key: key + 1, open: true }));

  const newListButton = useRef<HTMLButtonElement>(null);

  if (lists.isPending && lists.errorUpdatedAt === 0) {
    return <PageAreaLoading label="Loading lists" />;
  }

  const newList = (
    <Button
      icon={PlusIcon}
      onClick={startCreating}
      ref={newListButton}
      variant="primary"
    >
      New list
    </Button>
  );

  const body = () => {
    if (lists.data === undefined) {
      return (
        <TableLoadFailed
          onRetry={() => lists.refetch()}
          retrying={lists.isFetching}
          title="Your lists didn’t load"
        />
      );
    }

    if (lists.data.length === 0) {
      return (
        <TableEmpty
          actions={
            <Button
              icon={PlusIcon}
              onClick={startCreating}
              ref={newListButton}
              variant="primary"
            >
              New list
            </Button>
          }
          description="Make one for each thing people can sign up for, such as a weekly newsletter or product updates."
          title="No lists yet"
        />
      );
    }

    return <ListsTable lists={lists.data} />;
  };

  return (
    <TablePage
      actions={lists.data?.length === 0 ? undefined : newList}
      description={`What people agreed to receive from ${organization.name}. A campaign goes to the contacts subscribed to its lists.`}
      title="Lists"
    >
      <TableCard>{body()}</TableCard>
      <NewListDialog
        finalFocus={newListButton}
        key={creating.key}
        onOpenChange={(open) => setCreating(({ key }) => ({ key, open }))}
        open={creating.open}
        organization={organization}
      />
    </TablePage>
  );
};
