import { Button, Checkbox, Select } from "@cloudflare/kumo";
import { CaretLeftIcon, CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import type {
  Contact,
  ContactId,
  ContactPage,
  List,
  ListId,
  Organization,
  SubscriptionStatus,
} from "@repo/domain";
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { RowSelectionState } from "@tanstack/react-table";
import { Array as Arr } from "effect";
import type { DateTime } from "effect";
import { useMemo, useRef, useState } from "react";

import { useDialog } from "../layout/action-dialog.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { SelectionBar, TableRegion, Toolbar } from "../layout/table-region.tsx";
import { AddContactDialog } from "./add-contact-dialog.tsx";
import { AddToListDialog } from "./add-to-list-dialog.tsx";
import { useContactPage, useLists } from "./audience-api.ts";
import type { ContactSearch } from "./contact-search.ts";
import { DataTable } from "./data-table.tsx";
import type { StackedArea } from "./data-table.tsx";
import { formatCount, formatDay } from "./format.ts";
import {
  ListChip,
  STATUS_LABELS,
  SubscriptionStatusLabel,
} from "./subscription-status.tsx";

const ALL_CONTACTS = "all";

const ALL_STATUSES = "all";

const STATUSES: readonly SubscriptionStatus[] = [
  "subscribed",
  "pending",
  "unsubscribed",
];

const features = tableFeatures({ rowSelectionFeature });

const helper = createColumnHelper<typeof features, Contact>();

const totalOf = (list: List) =>
  list.subscriptions.subscribed +
  list.subscriptions.pending +
  list.subscriptions.unsubscribed;

const COLUMN_CLASSES = {
  added: "whitespace-nowrap sm:max-md:hidden",
  email: "max-w-[26rem] truncate whitespace-nowrap sm:max-xl:max-w-[16rem]",
  joined: "whitespace-nowrap",
  lists: "whitespace-nowrap",
  select: "w-9",
  status: "whitespace-nowrap",
};

const AREAS = {
  added: "side",
  email: "main",
  joined: "side",
  lists: "sub",
  select: "check",
  status: "sub",
} satisfies Record<string, StackedArea>;

const CHECKBOX_TARGET_LIKE_KUMO_TABLE =
  "relative flex leading-none before:absolute before:-inset-3 before:content-['']";

const selectColumn = helper.display({
  cell: ({ row }) => (
    <span className={CHECKBOX_TARGET_LIKE_KUMO_TABLE}>
      <Checkbox
        aria-label={`Select ${row.original.email}`}
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
      />
    </span>
  ),
  header: ({ table }) => (
    <span className="flex items-center gap-3">
      <span className={CHECKBOX_TARGET_LIKE_KUMO_TABLE}>
        <Checkbox
          aria-label="Select every contact on this page"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked)
          }
        />
      </span>
      <span aria-hidden="true" className="text-sm text-kumo-subtle sm:hidden">
        Select all
      </span>
    </span>
  ),
  id: "select",
});

const emailColumn = helper.accessor("email", {
  cell: ({ getValue }) => (
    <span className="font-medium text-kumo-strong" title={getValue()}>
      {getValue()}
    </span>
  ),
  header: "Email",
});

const quietDate = (date: DateTime.Utc) => (
  <span className="text-sm text-kumo-subtle tabular-nums">
    {formatDay(date)}
  </span>
);

const allContactsColumns = (lists: readonly List[]) => {
  const names = new Map(lists.map((list) => [list.id, list.name]));
  const nameOf = (listId: ListId) => names.get(listId) ?? "List";

  return helper.columns([
    selectColumn,
    emailColumn,
    helper.accessor("subscriptions", {
      cell: ({ getValue }) => {
        const subscriptions = getValue();

        if (subscriptions.length === 0) {
          return <span className="text-sm text-kumo-subtle">No lists</span>;
        }

        const moreThan = (shown: number) => subscriptions.length - shown;

        return (
          <>
            <span className="sr-only">
              {subscriptions
                .map(
                  (subscription) =>
                    `${nameOf(subscription.listId)}, ${STATUS_LABELS[subscription.status].toLowerCase()}`
                )
                .join("; ")}
            </span>
            <span
              aria-hidden="true"
              className="flex min-w-0 items-center gap-1.5"
              title={subscriptions
                .map((subscription) => nameOf(subscription.listId))
                .join(", ")}
            >
              {subscriptions.slice(0, 2).map((subscription, index) => (
                <span
                  className={
                    index === 0 ? "contents" : "contents max-xl:hidden"
                  }
                  key={subscription.listId}
                >
                  <ListChip
                    name={nameOf(subscription.listId)}
                    status={subscription.status}
                  />
                </span>
              ))}
              {moreThan(1) > 0 ? (
                <span className="text-sm text-kumo-subtle xl:hidden">
                  +{moreThan(1)}
                </span>
              ) : null}
              {moreThan(2) > 0 ? (
                <span className="text-sm text-kumo-subtle max-xl:hidden">
                  +{moreThan(2)}
                </span>
              ) : null}
            </span>
          </>
        );
      },
      header: "Lists",
      id: "lists",
    }),
    helper.accessor("createdAt", {
      cell: ({ getValue }) => quietDate(getValue()),
      header: "Added",
      id: "added",
    }),
  ]);
};

const listColumns = (list: List) => {
  const onList = (contact: Contact) =>
    contact.subscriptions.find((s) => s.listId === list.id);

  return helper.columns([
    selectColumn,
    emailColumn,
    helper.display({
      cell: ({ row }) => {
        const subscription = onList(row.original);

        return subscription === undefined ? null : (
          <SubscriptionStatusLabel status={subscription.status} />
        );
      },
      header: "Status",
      id: "status",
    }),
    helper.display({
      cell: ({ row }) => {
        const subscription = onList(row.original);

        return subscription === undefined
          ? null
          : quietDate(subscription.createdAt);
      },
      header: "Joined list",
      id: "joined",
    }),
  ]);
};

const ListFilter = ({
  list,
  lists,
  onChange,
  totalContacts,
}: {
  list: List | undefined;
  lists: readonly List[];
  onChange: (listId: string) => void;
  totalContacts: number | undefined;
}) => (
  <Select
    aria-label="List"
    className="max-sm:w-full"
    onValueChange={(value) => onChange(String(value))}
    renderValue={() => (
      <span>
        <span className="text-kumo-subtle">List </span>
        {list?.name ?? "All contacts"}
      </span>
    )}
    value={list?.id ?? ALL_CONTACTS}
  >
    <Select.Option
      className="mq-count-option *:first:flex-1"
      value={ALL_CONTACTS}
    >
      <span className="flex w-full justify-between gap-6">
        All contacts
        {totalContacts === undefined ? null : (
          <span className="text-kumo-subtle tabular-nums">
            {formatCount(totalContacts)}
          </span>
        )}
      </span>
    </Select.Option>
    {lists.length === 0 ? null : (
      <Select.Group>
        <Select.GroupLabel>Lists</Select.GroupLabel>
        {lists.map((candidate) => (
          <Select.Option
            className="mq-count-option *:first:flex-1"
            key={candidate.id}
            value={candidate.id}
          >
            <span className="flex w-full justify-between gap-6">
              <span className="truncate">{candidate.name}</span>
              <span className="text-kumo-subtle tabular-nums">
                {formatCount(totalOf(candidate))}
              </span>
            </span>
          </Select.Option>
        ))}
      </Select.Group>
    )}
  </Select>
);

const StatusFilter = ({
  list,
  onChange,
  status,
}: {
  list: List;
  onChange: (status: string) => void;
  status: SubscriptionStatus | undefined;
}) => (
  <Select
    aria-label={`Status on ${list.name}`}
    className="max-sm:w-full sm:min-w-44"
    onValueChange={(value) => onChange(String(value))}
    renderValue={() => (
      <span>
        <span className="text-kumo-subtle">Status </span>
        {status === undefined ? "All" : STATUS_LABELS[status]}
      </span>
    )}
    value={status ?? ALL_STATUSES}
  >
    <Select.Option
      className="mq-count-option *:first:flex-1"
      value={ALL_STATUSES}
    >
      <span className="flex w-full justify-between gap-6">
        All
        <span className="text-kumo-subtle tabular-nums">
          {formatCount(totalOf(list))}
        </span>
      </span>
    </Select.Option>
    {STATUSES.map((candidate) => (
      <Select.Option
        className="mq-count-option *:first:flex-1"
        key={candidate}
        value={candidate}
      >
        <span className="flex w-full justify-between gap-6">
          <SubscriptionStatusLabel status={candidate} />
          <span className="text-kumo-subtle tabular-nums">
            {formatCount(list.subscriptions[candidate])}
          </span>
        </span>
      </Select.Option>
    ))}
  </Select>
);

const Pager = ({
  loading,
  onPage,
  page,
}: {
  loading: boolean;
  onPage: (cursor: Pick<ContactSearch, "after" | "before">) => void;
  page: ContactPage;
}) => {
  const { next, previous } = page;

  return (
    <nav
      aria-label="Pages of contacts"
      className="flex items-center justify-between gap-3 pt-4 text-sm text-kumo-subtle"
    >
      <span className="tabular-nums">
        {formatCount(page.start + 1)}–
        {formatCount(page.start + page.contacts.length)} of{" "}
        {formatCount(page.total)}
      </span>
      <span className="flex gap-2">
        <Button
          aria-disabled={loading || undefined}
          disabled={previous === null}
          icon={CaretLeftIcon}
          onClick={() => {
            if (!loading && previous !== null) {
              onPage({ before: previous });
            }
          }}
          variant="secondary"
        >
          Previous
        </Button>
        <Button
          aria-disabled={loading || undefined}
          disabled={next === null}
          onClick={() => {
            if (!loading && next !== null) {
              onPage({ after: next });
            }
          }}
          variant="secondary"
        >
          Next
          <CaretRightIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </span>
    </nav>
  );
};

const NoContacts = ({
  addButton,
  list,
  onAdd,
  onShowAll,
  status,
}: {
  addButton: React.RefObject<HTMLButtonElement | null>;
  list: List | undefined;
  onAdd: () => void;
  onShowAll: () => void;
  status: SubscriptionStatus | undefined;
}) => {
  const add = (
    <Button icon={PlusIcon} onClick={onAdd} ref={addButton} variant="primary">
      Add contact
    </Button>
  );

  if (list === undefined) {
    return (
      <EmptyState
        actions={
          <Button
            icon={PlusIcon}
            onClick={onAdd}
            ref={addButton}
            variant="primary"
          >
            Add contact
          </Button>
        }
        description="Add people one at a time for now. Importing a CSV from the tool you use today arrives in a later Mailquilt update."
        title="No contacts yet"
      />
    );
  }

  if (status === undefined) {
    return (
      <EmptyState
        actions={
          <>
            <Button onClick={onShowAll} variant="secondary">
              Show all contacts
            </Button>
            {add}
          </>
        }
        description="Select contacts in All contacts and choose Add to list, or add a new contact straight to this list."
        title={`No one is on ${list.name} yet`}
      />
    );
  }

  return (
    <EmptyState
      actions={
        <Button onClick={onShowAll} variant="secondary">
          Show everyone on {list.name}
        </Button>
      }
      description={`Nobody on ${list.name} is ${STATUS_LABELS[status].toLowerCase()} right now.`}
      title={`No ${STATUS_LABELS[status].toLowerCase()} contacts`}
    />
  );
};

const ContactsTable = ({
  addContactButton,
  list,
  lists,
  onAddContact,
  onSearch,
  organization,
  page,
  query,
  search,
  shownList,
  shownSearchKey,
  totalContacts,
}: {
  addContactButton: React.RefObject<HTMLButtonElement | null>;
  list: List | undefined;
  lists: readonly List[];
  onAddContact: () => void;
  onSearch: (search: ContactSearch) => void;
  organization: Organization;
  page: ContactPage;
  query: ReturnType<typeof useContactPage>;
  search: ContactSearch;
  shownList: List | undefined;
  shownSearchKey: string;
  totalContacts: number | undefined;
}) => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectionFor, setSelectionFor] = useState(shownSearchKey);
  const addingToList = useDialog();

  if (selectionFor !== shownSearchKey) {
    setSelectionFor(shownSearchKey);
    setRowSelection({});
    addingToList.setOpen(false);
  }

  const addToListButton = useRef<HTMLButtonElement>(null);

  const columns = useMemo(
    () =>
      shownList === undefined
        ? allContactsColumns(lists)
        : listColumns(shownList),
    [shownList, lists]
  );

  const table = useTable({
    columns,
    data: page.contacts,
    features,
    getRowId: (contact) => contact.id,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  });

  const selected = Arr.filter(
    page.contacts.map((contact) => contact.id),
    (id): id is ContactId => rowSelection[id] === true
  );

  const filters = (
    <>
      <ListFilter
        list={list}
        lists={lists}
        totalContacts={totalContacts}
        onChange={(value) =>
          onSearch(
            value === ALL_CONTACTS
              ? {}
              : { list: lists.find((l) => l.id === value)?.id }
          )
        }
      />
      {list === undefined ? null : (
        <StatusFilter
          list={list}
          onChange={(value) =>
            onSearch({
              list: list.id,
              status: STATUSES.find((status) => status === value),
            })
          }
          status={search.status}
        />
      )}
    </>
  );

  const showAll = () =>
    onSearch(search.status === undefined ? {} : { list: list?.id });

  return (
    <>
      {page.total === 0 && shownList === undefined ? null : (
        <Toolbar>{filters}</Toolbar>
      )}
      <SelectionBar
        actions={
          <button
            className="mq-selbar-button"
            data-strong=""
            disabled={lists.length === 0}
            onClick={() => addingToList.setOpen(true)}
            ref={addToListButton}
            type="button"
          >
            Add to list
          </button>
        }
        count={selected.length}
        label="Selected contacts"
        onClear={() => {
          setRowSelection({});
          document
            .querySelector<HTMLElement>(
              '[aria-label="Select every contact on this page"]'
            )
            ?.focus();
        }}
      />
      <TableRegion busy={query.isPlaceholderData} label="Contacts">
        {page.total === 0 ? (
          <NoContacts
            addButton={addContactButton}
            list={shownList}
            onAdd={onAddContact}
            onShowAll={showAll}
            status={search.status}
          />
        ) : (
          <DataTable
            areas={AREAS}
            columnClassNames={COLUMN_CLASSES}
            isSelected={(id) => rowSelection[id] === true}
            label={
              shownList === undefined
                ? "Contacts"
                : `Contacts on ${shownList.name}`
            }
            table={table}
          />
        )}
      </TableRegion>
      {page.total === 0 ? null : (
        <Pager
          loading={query.isPlaceholderData}
          onPage={(cursor) =>
            onSearch({ list: search.list, status: search.status, ...cursor })
          }
          page={page}
        />
      )}
      {Arr.isReadonlyArrayNonEmpty(selected) ? (
        <AddToListDialog
          contactIds={selected}
          finalFocus={addToListButton}
          lists={lists}
          key={addingToList.key}
          onExited={addingToList.handleExited}
          onOpenChange={addingToList.handleOpenChange}
          open={addingToList.open}
          organization={organization}
        />
      ) : null}
    </>
  );
};

const headerAddsContact = (
  lists: readonly List[] | undefined,
  page: ContactPage | null | undefined,
  search: ContactSearch
) => {
  if (lists === undefined || page === undefined || page === null) {
    return false;
  }

  const emptyStateOffersAdd = page.total === 0 && search.status === undefined;

  return !emptyStateOffersAdd;
};

const countOf = (
  lists: readonly List[] | undefined,
  page: ContactPage | null | undefined,
  shownList: List | undefined
) => {
  if (lists === undefined || page === undefined || page === null) {
    return;
  }

  const count = shownList === undefined ? page.total : totalOf(shownList);

  if (count === 0) {
    return;
  }

  return shownList === undefined
    ? formatCount(count)
    : `${formatCount(count)} on this list`;
};

/**
 * Everyone in the Organization, as a table. The List filter narrows it to
 * one List and adds each Contact's status on it, with a status filter; both
 * live in the URL. Rows can be selected and added to a List together.
 */
export const ContactsPage = ({
  onSearch,
  organization,
  search,
}: {
  onSearch: (search: ContactSearch) => void;
  organization: Organization;
  search: ContactSearch;
}) => {
  const lists = useLists(organization.id);
  const page = useContactPage(organization.id, search);
  const everyone = useContactPage(organization.id, {});
  const adding = useDialog();

  const startAdding = () => adding.setOpen(true);

  const addContactButton = useRef<HTMLButtonElement>(null);
  const [shownSearch, setShownSearch] = useState(search);

  const searchKey = JSON.stringify(search);

  if (
    page.data !== undefined &&
    !page.isPlaceholderData &&
    JSON.stringify(shownSearch) !== searchKey
  ) {
    setShownSearch(search);
  }

  const list = lists.data?.find((candidate) => candidate.id === search.list);

  const shownList = lists.data?.find(
    (candidate) => candidate.id === shownSearch.list
  );

  if (
    (lists.isPending && lists.errorUpdatedAt === 0) ||
    (page.isPending && page.errorUpdatedAt === 0)
  ) {
    return <PageAreaLoading label="Loading contacts" />;
  }

  const retry = () => {
    if (lists.isError) {
      lists.refetch();
    }

    page.refetch();
  };

  const body = () => {
    if (page.data === null) {
      return (
        <TableRegion label="Contacts">
          <EmptyState
            actions={
              <Button onClick={() => onSearch({})} variant="secondary">
                Show all contacts
              </Button>
            }
            description="It may belong to another organization, or the link is out of date."
            title={`That list isn’t in ${organization.name}`}
          />
        </TableRegion>
      );
    }

    if (lists.data === undefined || page.data === undefined) {
      return (
        <TableRegion label="Contacts">
          <LoadFailed
            onRetry={retry}
            retrying={lists.isFetching || page.isFetching}
            title="Your contacts didn’t load"
          />
        </TableRegion>
      );
    }

    return (
      <ContactsTable
        addContactButton={addContactButton}
        list={list}
        lists={lists.data}
        onAddContact={startAdding}
        onSearch={onSearch}
        organization={organization}
        page={page.data}
        query={page}
        search={search}
        shownList={shownList}
        shownSearchKey={JSON.stringify(shownSearch)}
        totalContacts={everyone.data?.total}
      />
    );
  };

  return (
    <TablePage
      actions={
        headerAddsContact(lists.data, page.data, shownSearch) ? (
          <Button
            icon={PlusIcon}
            onClick={startAdding}
            ref={addContactButton}
            variant="primary"
          >
            Add contact
          </Button>
        ) : undefined
      }
      description={`Everyone in ${organization.name}’s audience. Each address appears once.`}
      title="Contacts"
      titleDetail={countOf(lists.data, page.data, shownList)}
    >
      {body()}
      <AddContactDialog
        finalFocus={addContactButton}
        lists={lists.data ?? []}
        key={adding.key}
        onExited={adding.handleExited}
        onOpenChange={adding.handleOpenChange}
        open={adding.open}
        organization={organization}
        preselected={list === undefined ? [] : [list.id]}
      />
    </TablePage>
  );
};
