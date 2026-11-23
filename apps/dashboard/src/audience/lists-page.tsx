import { Button } from "@cloudflare/kumo";
import { CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import type { List, Organization } from "@repo/domain";
import { Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useMemo, useRef } from "react";

import { useDialog } from "../layout/action-dialog.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useLists } from "./audience-api.ts";
import { DataTable } from "./data-table.tsx";
import type { StackedArea } from "./data-table.tsx";
import { formatCount, formatDay } from "./format.ts";
import { NewListDialog } from "./new-list-dialog.tsx";
import { STATUS_LABELS, StatusBlock } from "./subscription-status.tsx";

const features = tableFeatures({});

const helper = createColumnHelper<typeof features, List>();

const NUMBER = "text-right tabular-nums";

const totalOf = (list: List) =>
  list.subscriptions.subscribed +
  list.subscriptions.pending +
  list.subscriptions.unsubscribed;

const share = (count: number, biggest: number) =>
  `${biggest === 0 ? 0 : (count / biggest) * 100}%`;

const MakeUp = ({ biggest, list }: { biggest: number; list: List }) => (
  <span aria-hidden="true" className="mq-makeup">
    {(["subscribed", "pending", "unsubscribed"] as const).map((status) =>
      list.subscriptions[status] === 0 ? null : (
        <i
          data-status={status}
          key={status}
          // SAFETY: a CSS custom property, which React passes through to the style attribute but CSSProperties doesn't list.
          style={
            {
              "--mq-share": share(list.subscriptions[status], biggest),
            } as React.CSSProperties
          }
        />
      )
    )}
  </span>
);

const listColumns = (biggest: number) =>
  helper.columns([
    helper.accessor("name", {
      cell: ({ row }) => (
        <>
          <Link
            className="font-semibold text-kumo-strong after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-kumo-focus"
            search={{ list: row.original.id }}
            to="/contacts"
          >
            {row.original.name}
          </Link>
          <span className="mt-2.5 block max-sm:hidden lg:hidden">
            <MakeUp biggest={biggest} list={row.original} />
          </span>
        </>
      ),
      header: "Name",
    }),
    helper.display({
      cell: ({ row }) => <MakeUp biggest={biggest} list={row.original} />,
      header: () => <span className="sr-only">Make-up</span>,
      id: "makeUp",
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
        <span className="text-sm text-kumo-subtle">
          {formatDay(getValue())}
        </span>
      ),
      header: "Created",
      id: "created",
    }),
    helper.display({
      cell: ({ row }) => {
        const { pending, subscribed, unsubscribed } =
          row.original.subscriptions;

        return (
          <>
            {totalOf(row.original) === 0 ? null : (
              <span className="mb-2 block">
                <MakeUp biggest={biggest} list={row.original} />
              </span>
            )}
            <span className="text-sm text-kumo-subtle tabular-nums">
              <span className="font-medium text-kumo-strong">
                {formatCount(subscribed)}
              </span>{" "}
              subscribed, {formatCount(pending)} pending,{" "}
              {formatCount(unsubscribed)} unsubscribed
            </span>
          </>
        );
      },
      header: () => <span className="sr-only">Summary</span>,
      id: "summary",
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
  created: "whitespace-nowrap max-xl:hidden",
  makeUp: "w-[32%] max-lg:hidden",
  name: "mq-name-with-bar max-w-[24rem] truncate whitespace-nowrap",
  open: "w-8",
  pending: NUMBER,
  subscribed: NUMBER,
  summary: "sm:hidden",
  unsubscribed: NUMBER,
};

const AREAS = {
  created: "hide",
  makeUp: "hide",
  name: "main",
  open: "side",
  pending: "hide",
  subscribed: "hide",
  summary: "sub",
  unsubscribed: "hide",
} satisfies Record<string, StackedArea>;

const ListsTable = ({ lists }: { lists: readonly List[] }) => {
  const biggest = Math.max(...lists.map(totalOf));
  const columns = useMemo(() => listColumns(biggest), [biggest]);

  const table = useTable({
    columns,
    data: lists,
    features,
    getRowId: (list) => list.id,
  });

  return (
    <div className="[&_tbody_tr]:relative">
      <DataTable
        areas={AREAS}
        columnClassNames={COLUMN_CLASSES}
        label="Lists"
        table={table}
      />
    </div>
  );
};

const LEGEND = ["subscribed", "pending", "unsubscribed"] as const;

/**
 * The Organization's Lists, with how many Contacts are subscribed, pending
 * and unsubscribed on each. A row opens Contacts filtered to that List.
 */
export const ListsPage = ({ organization }: { organization: Organization }) => {
  const lists = useLists(organization.id);
  const creating = useDialog();

  const startCreating = () => creating.setOpen(true);

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
        <TableRegion label="Lists">
          <LoadFailed
            onRetry={() => lists.refetch()}
            retrying={lists.isFetching}
            title="Your lists didn’t load"
          />
        </TableRegion>
      );
    }

    if (lists.data.length === 0) {
      return (
        <TableRegion label="Lists">
          <EmptyState
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
        </TableRegion>
      );
    }

    return (
      <>
        <ul
          aria-hidden="true"
          className="-mt-1 mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-kumo-subtle"
        >
          {LEGEND.map((status) => (
            <li className="inline-flex items-center gap-2" key={status}>
              <StatusBlock status={status} />
              {STATUS_LABELS[status]}
            </li>
          ))}
        </ul>
        <TableRegion label="Lists">
          <ListsTable lists={lists.data} />
        </TableRegion>
      </>
    );
  };

  return (
    <TablePage
      actions={
        lists.data === undefined || lists.data.length === 0
          ? undefined
          : newList
      }
      description={`What people agreed to receive from ${organization.name}. A campaign goes to the contacts subscribed to its lists.`}
      title="Lists"
      titleDetail={
        lists.data === undefined || lists.data.length === 0
          ? undefined
          : formatCount(lists.data.length)
      }
    >
      {body()}
      <NewListDialog
        finalFocus={newListButton}
        key={creating.key}
        onExited={creating.handleExited}
        onOpenChange={creating.handleOpenChange}
        open={creating.open}
        organization={organization}
      />
    </TablePage>
  );
};
