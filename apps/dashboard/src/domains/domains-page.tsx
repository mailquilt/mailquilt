import { LinkButton } from "@cloudflare/kumo";
import type { Organization, SendingDomain } from "@repo/domain";
import { Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { DateTime } from "effect";
import { useRef, useState } from "react";

import { loadingFirstTime } from "../api.ts";
import { DataTable } from "../audience/data-table.tsx";
import type { StackedArea } from "../audience/data-table.tsx";
import { formatDay } from "../audience/format.ts";
import { PlusIcon } from "../icons/icons.tsx";
import { useDialog } from "../layout/action-dialog.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import {
  checkedWhen,
  recordsOf,
  statusOf,
  summaryOf,
  warningsIn,
} from "./dns-records.ts";
import { DomainStatusLabel } from "./domain-status.tsx";
import { useSendingDomains } from "./domains-api.ts";
import { DomainMenu, RemoveDomainDialog } from "./remove-domain-dialog.tsx";

/** What Domains says about itself, also where a page asks for an Organization first. */
export const DOMAINS_ABOUT =
  "Campaigns are sent only from addresses at a domain here whose DKIM and DMARC records pass. Mailquilt checks again just before each send.";

const ON_OR_AT = /^(?:at|on) /u;

const sentenceCase = (words: string) =>
  `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

const focusOnMount = (element: HTMLElement | null) => element?.focus();

const AddButton = () => (
  <LinkButton href="/domains/new" icon={PlusIcon} variant="primary">
    Add a domain
  </LinkButton>
);

const features = tableFeatures({});

// WARNING: TanStack renders each cell as a component, so new columns would remount every row's open dialog; rows carry what the actions need and COLUMNS stays module-level.
interface DomainRow {
  readonly domain: SendingDomain;
  readonly onRemoved: (domain: string) => void;
  readonly organization: Organization;
}

const RowActions = ({ domain, onRemoved, organization }: DomainRow) => {
  const removing = useDialog();
  const menuButton = useRef<HTMLButtonElement>(null);

  return (
    <span className="flex items-center justify-end">
      <DomainMenu
        domain={domain}
        onRemove={() => removing.setOpen(true)}
        triggerRef={menuButton}
      />
      <RemoveDomainDialog
        domain={domain}
        finalFocus={menuButton}
        key={removing.key}
        onExited={removing.handleExited}
        onOpenChange={removing.handleOpenChange}
        onRemoved={() => onRemoved(domain.domain)}
        open={removing.open}
        organization={organization}
      />
    </span>
  );
};

const helper = createColumnHelper<typeof features, DomainRow>();

const COLUMNS = helper.columns([
  helper.accessor((row) => row.domain.domain, {
    cell: ({ row: { original } }) => (
      <span className="block py-2">
        <Link
          className="block font-medium wrap-anywhere text-kumo-strong underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-kumo-focus"
          params={{ sendingDomainId: original.domain.id }}
          to="/domains/$sendingDomainId"
        >
          {original.domain.domain}
        </Link>
        <span className="block text-sm text-kumo-subtle">
          Added {formatDay(original.domain.createdAt)}
        </span>
      </span>
    ),
    header: "Domain",
    id: "domain",
  }),
  helper.accessor((row) => row.domain, {
    cell: ({ getValue }) => {
      const domain = getValue();
      const records = recordsOf(domain, []);

      return (
        <span className="block py-2">
          <DomainStatusLabel
            status={statusOf(domain)}
            warnings={warningsIn(records)}
          />
          <span className="block pl-5 text-sm text-kumo-subtle">
            {summaryOf(domain, records)}
          </span>
        </span>
      );
    },
    header: "Status",
    id: "status",
  }),
  helper.accessor((row) => row.domain.check, {
    cell: ({ getValue }) => {
      const check = getValue();

      return (
        <span className="text-kumo-default">
          {check === null
            ? "Never"
            : sentenceCase(
                checkedWhen(check.checkedAt, DateTime.nowUnsafe()).replace(
                  ON_OR_AT,
                  ""
                )
              )}
        </span>
      );
    },
    header: "Last checked",
    id: "checked",
  }),
  helper.display({
    cell: ({ row: { original } }) => <RowActions {...original} />,
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
  }),
]);

const COLUMN_CLASSES = {
  actions: "whitespace-nowrap sm:w-px",
  checked: "whitespace-nowrap max-lg:hidden",
  domain: "sm:min-w-[16rem]",
  status: "sm:min-w-[16rem]",
};

const AREAS = {
  actions: "side",
  checked: "hide",
  domain: "main",
  status: "sub",
} satisfies Record<string, StackedArea>;

const DomainsTable = ({
  domains,
  onRemoved,
  organization,
}: {
  domains: readonly SendingDomain[];
  onRemoved: (domain: string) => void;
  organization: Organization;
}) => {
  const table = useTable({
    columns: COLUMNS,
    data: domains.map((domain) => ({ domain, onRemoved, organization })),
    features,
    getRowId: (row) => row.domain.id,
  });

  return (
    <DataTable
      areas={AREAS}
      columnClassNames={COLUMN_CLASSES}
      label="Domains"
      table={table}
    />
  );
};

/** The Organization's Sending Domains, each with its status from its last check. */
export const DomainsPage = ({
  organization,
}: {
  organization: Organization;
}) => {
  const domains = useSendingDomains(organization.id);

  const [lastRemoved, setLastRemoved] = useState<{
    readonly count: number;
    readonly domain: string;
  }>();

  // WARNING: a removed domain's row goes, and its menu button with it, so focus moves to a line saying so, or it would drop to the page.
  const removedNote =
    lastRemoved === undefined ? null : (
      <p
        className="sr-only"
        key={lastRemoved.count}
        ref={focusOnMount}
        tabIndex={-1}
      >
        Removed {lastRemoved.domain}.
      </p>
    );

  const onRemoved = (domain: string) =>
    setLastRemoved((last) => ({ count: (last?.count ?? 0) + 1, domain }));

  if (loadingFirstTime(domains)) {
    return <PageAreaLoading label="Loading the domains" />;
  }

  const empty = domains.data?.length === 0;
  const loaded = domains.data !== undefined;

  const body = () => {
    if (domains.data === undefined) {
      return (
        <LoadFailed
          onRetry={() => domains.refetch()}
          retrying={domains.isFetching}
          title="The domains didn’t load"
        />
      );
    }

    if (domains.data.length === 0) {
      return (
        <EmptyState
          actions={<AddButton />}
          description="Add the domain your Campaigns are sent from, such as the one in news@yourbrand.com. Mailquilt shows the DNS records it needs and checks them."
          title="No domains yet"
        />
      );
    }

    return (
      <DomainsTable
        domains={domains.data}
        onRemoved={onRemoved}
        organization={organization}
      />
    );
  };

  return (
    <TablePage
      actions={loaded && !empty ? <AddButton /> : undefined}
      description={DOMAINS_ABOUT}
      title="Domains"
      titleDetail={
        loaded && !empty ? `${domains.data?.length ?? 0}` : undefined
      }
    >
      {removedNote}
      <TableRegion bordered label="Domains">
        {body()}
      </TableRegion>
    </TablePage>
  );
};
