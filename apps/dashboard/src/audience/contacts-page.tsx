import { Button, Checkbox, Select } from "@cloudflare/kumo";
import {
  CaretLeftIcon,
  CaretRightIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
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

import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { AddContactDialog } from "./add-contact-dialog.tsx";
import { AddToListDialog } from "./add-to-list-dialog.tsx";
import { useContactPage, useLists } from "./audience-api.ts";
import type { ContactSearch } from "./contact-search.ts";
import { DataTable } from "./data-table.tsx";
import { formatCount, formatDay } from "./format.ts";
import {
  ListChip,
  STATUS_LABELS,
  SubscriptionStatusLabel,
} from "./subscription-status.tsx";
import { TableCard, TableEmpty, TableLoadFailed } from "./table-card.tsx";

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

const PINNED_ON_PHONES = {
  email:
    "max-w-[13rem] truncate max-sm:sticky max-sm:left-10 max-sm:z-1 max-sm:bg-(--kumo-table-row-bg) max-sm:shadow-pinned-column sm:max-w-[26rem] md:max-xl:max-w-[15rem]",
  select:
    "w-10 max-sm:sticky max-sm:left-0 max-sm:z-1 max-sm:bg-(--kumo-table-row-bg)",
};

const COLUMN_CLASSES = {
  added: "md:max-xl:hidden",
  email: PINNED_ON_PHONES.email,
  joined: "",
  lists: "",
  select: PINNED_ON_PHONES.select,
  status: "",
};

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
    <span className={CHECKBOX_TARGET_LIKE_KUMO_TABLE}>
      <Checkbox
        aria-label="Select every contact on this page"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
      />
    </span>
  ),
  id: "select",
});

const emailColumn = helper.accessor("email", {
  cell: ({ getValue }) => (
    <span className="font-medium text-kumo-strong">{getValue()}</span>
  ),
  header: "Email",
});

const quietDate = (date: DateTime.Utc) => (
  <span className="text-sm text-kumo-subtle">{formatDay(date)}</span>
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
              className="flex items-center gap-1.5"
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
}: {
  list: List | undefined;
  lists: readonly List[];
  onChange: (listId: string) => void;
}) => (
  <Select
    aria-label="List"
    className="max-sm:w-full sm:min-w-48"
    onValueChange={(value) => onChange(String(value))}
    renderValue={() => (
      <span>
        <span className="text-kumo-subtle">List </span>
        {list?.name ?? "All contacts"}
      </span>
    )}
    value={list?.id ?? ALL_CONTACTS}
  >
    <Select.Option value={ALL_CONTACTS}>All contacts</Select.Option>
    {lists.length === 0 ? null : (
      <Select.Group>
        <Select.GroupLabel>Lists</Select.GroupLabel>
        {lists.map((candidate) => (
          <Select.Option
            className="*:first:flex-1"
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
    <Select.Option className="*:first:flex-1" value={ALL_STATUSES}>
      <span className="flex w-full justify-between gap-6">
        All
        <span className="text-kumo-subtle tabular-nums">
          {formatCount(totalOf(list))}
        </span>
      </span>
    </Select.Option>
    {STATUSES.map((candidate) => (
      <Select.Option
        className="*:first:flex-1"
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
      className="flex w-full items-center justify-between gap-3"
    >
      <span className="tabular-nums">
        {formatCount(page.start + 1)}–
        {formatCount(page.start + page.contacts.length)} of{" "}
        {formatCount(page.total)}
      </span>
      <span className="flex gap-2">
        <Button
          disabled={loading || previous === null}
          icon={CaretLeftIcon}
          onClick={() => {
            if (previous !== null) {
              onPage({ before: previous });
            }
          }}
          size="sm"
          variant="secondary"
        >
          Previous
        </Button>
        <Button
          disabled={loading || next === null}
          onClick={() => {
            if (next !== null) {
              onPage({ after: next });
            }
          }}
          size="sm"
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
    <Button icon={PlusIcon} onClick={onAdd} variant="primary">
      Add contact
    </Button>
  );

  if (list === undefined) {
    return (
      <TableEmpty
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
      <TableEmpty
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
    <TableEmpty
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
}) => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [addingToList, setAddingToList] = useState({ key: 0, open: false });
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

  const filters =
    selected.length > 0 ? (
      <>
        <span className="px-1.5 font-semibold text-kumo-strong tabular-nums">
          {formatCount(selected.length)} selected
        </span>
        <Button
          disabled={lists.length === 0}
          onClick={() =>
            setAddingToList(({ key }) => ({ key: key + 1, open: true }))
          }
          ref={addToListButton}
          variant="secondary"
        >
          Add to list
        </Button>
        <span className="flex-1" />
        <Button
          aria-label="Clear selection"
          className="max-sm:px-2"
          onClick={() => setRowSelection({})}
          variant="ghost"
        >
          <XIcon aria-hidden="true" className="size-4 sm:hidden" />
          <span className="max-sm:hidden">Clear selection</span>
        </Button>
      </>
    ) : (
      <>
        <ListFilter
          list={list}
          lists={lists}
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
    <TableCard
      busy={query.isPlaceholderData}
      footer={
        page.total === 0 ? undefined : (
          <Pager
            loading={query.isPlaceholderData}
            onPage={(cursor) =>
              onSearch({ list: search.list, status: search.status, ...cursor })
            }
            page={page}
          />
        )
      }
      toolbarTinted={selected.length > 0}
      toolbar={
        page.total === 0 && search.list === undefined ? undefined : (
          <div className="flex w-full flex-wrap items-center gap-2">
            {filters}
          </div>
        )
      }
    >
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
      {Arr.isReadonlyArrayNonEmpty(selected) ? (
        <AddToListDialog
          contactIds={selected}
          finalFocus={addToListButton}
          lists={lists}
          key={addingToList.key}
          onOpenChange={(open) => setAddingToList(({ key }) => ({ key, open }))}
          open={addingToList.open}
          organization={organization}
        />
      ) : null}
    </TableCard>
  );
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
  const [adding, setAdding] = useState({ key: 0, open: false });

  const startAdding = () =>
    setAdding(({ key }) => ({ key: key + 1, open: true }));

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
        <TableCard>
          <TableEmpty
            actions={
              <Button onClick={() => onSearch({})} variant="secondary">
                Show all contacts
              </Button>
            }
            description="It may belong to another organization, or the link is out of date."
            title={`That list isn’t in ${organization.name}`}
          />
        </TableCard>
      );
    }

    if (lists.data === undefined || page.data === undefined) {
      return (
        <TableCard>
          <TableLoadFailed
            onRetry={retry}
            retrying={lists.isFetching || page.isFetching}
            title="Your contacts didn’t load"
          />
        </TableCard>
      );
    }

    return (
      <ContactsTable
        addContactButton={addContactButton}
        key={JSON.stringify(shownSearch)}
        list={list}
        lists={lists.data}
        onAddContact={startAdding}
        onSearch={onSearch}
        organization={organization}
        page={page.data}
        query={page}
        search={search}
        shownList={shownList}
      />
    );
  };

  const hasNoContactsAtAll =
    page.data?.total === 0 && search.list === undefined;

  return (
    <TablePage
      actions={
        hasNoContactsAtAll ? undefined : (
          <Button
            icon={PlusIcon}
            onClick={startAdding}
            ref={addContactButton}
            variant="primary"
          >
            Add contact
          </Button>
        )
      }
      description={`Everyone in ${organization.name}’s audience. Each address appears once.`}
      title="Contacts"
    >
      {body()}
      <AddContactDialog
        finalFocus={addContactButton}
        lists={lists.data ?? []}
        key={adding.key}
        onOpenChange={(open) => setAdding(({ key }) => ({ key, open }))}
        open={adding.open}
        organization={organization}
        preselected={list === undefined ? [] : [list.id]}
      />
    </TablePage>
  );
};
