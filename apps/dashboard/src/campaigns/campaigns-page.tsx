import { LinkButton } from "@cloudflare/kumo";
import type {
  CampaignSummary,
  List,
  Organization,
  ProviderConnection,
} from "@repo/domain";
import { Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";

import { useLists } from "../audience/audience-api.ts";
import { DataTable } from "../audience/data-table.tsx";
import type { StackedArea } from "../audience/data-table.tsx";
import { formatCount, formatDay } from "../audience/format.ts";
import { PlusIcon } from "../icons/icons.tsx";
import { CursorPager } from "../layout/cursor-pager.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useProviderConnections } from "../providers/providers-api.ts";
import { formatSince } from "./campaign-dates.ts";
import type { CampaignSearch } from "./campaign-search.ts";
import { CampaignSetupNeeded, isReadyToWrite } from "./campaign-setup.tsx";
import { CampaignStatusLabel } from "./campaign-status.tsx";
import { useCampaignPage } from "./campaigns-api.ts";

const DESCRIPTION =
  "Email you send once to everyone subscribed to a list, through your own provider.";

const NewCampaignButton = () => (
  <LinkButton href="/campaigns/new" icon={PlusIcon} variant="primary">
    New campaign
  </LinkButton>
);

interface CampaignRow {
  readonly campaign: CampaignSummary;
  readonly listName: string;
}

const dateOf = (campaign: CampaignSummary) => {
  if (campaign.status === "sent" && campaign.sentAt !== null) {
    return {
      line: `sent ${formatDay(campaign.sentAt)}`,
      short: formatDay(campaign.sentAt),
    };
  }

  if (campaign.status === "sending" && campaign.sendingStartedAt !== null) {
    const since = formatSince(campaign.sendingStartedAt);

    return { line: `started ${since}`, short: `Started ${since}` };
  }

  const created = formatDay(campaign.createdAt);

  return { line: `created ${created}`, short: `Created ${created}` };
};

const features = tableFeatures({});

const helper = createColumnHelper<typeof features, CampaignRow>();

const COLUMNS = helper.columns([
  helper.accessor((row) => row.campaign.subject, {
    cell: ({ row }) => (
      <Link
        className="font-medium text-kumo-strong after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus max-sm:line-clamp-2"
        params={{ campaignId: row.original.campaign.id }}
        title={row.original.campaign.subject}
        to="/campaigns/$campaignId"
      >
        {row.original.campaign.subject}
      </Link>
    ),
    header: "Subject",
    id: "subject",
  }),
  helper.accessor((row) => row.campaign.status, {
    cell: ({ getValue }) => <CampaignStatusLabel status={getValue()} />,
    header: "Status",
    id: "status",
  }),
  helper.accessor((row) => row.listName, {
    header: "List",
    id: "list",
  }),
  helper.accessor((row) => row.campaign, {
    cell: ({ getValue }) => {
      const campaign = getValue();

      return campaign.status === "sent" ? (
        <span className="font-medium text-kumo-strong">
          {formatCount(campaign.recipients.sent)}
        </span>
      ) : null;
    },
    header: "Sent to",
    id: "sentTo",
  }),
  helper.accessor((row) => row.campaign, {
    cell: ({ getValue }) => (
      <span className="text-sm text-kumo-subtle tabular-nums">
        {dateOf(getValue()).short}
      </span>
    ),
    header: "Date",
    id: "date",
  }),
  helper.display({
    cell: ({ row }) => (
      <span className="text-sm text-kumo-subtle">
        {row.original.listName}, {dateOf(row.original.campaign).line}
      </span>
    ),
    header: () => <span className="sr-only">Summary</span>,
    id: "summary",
  }),
]);

const COLUMN_CLASSES = {
  date: "w-36 whitespace-nowrap max-md:hidden",
  list: "max-w-64 truncate whitespace-nowrap text-kumo-default max-lg:hidden",
  sentTo: "text-right whitespace-nowrap tabular-nums max-xl:hidden",
  status: "w-32 whitespace-nowrap max-sm:w-auto",
  subject:
    "w-full max-w-0 truncate whitespace-nowrap max-sm:w-auto max-sm:max-w-none max-sm:whitespace-normal max-sm:wrap-anywhere",
  summary: "wrap-anywhere sm:hidden",
};

const AREAS = {
  date: "hide",
  list: "hide",
  sentTo: "hide",
  status: "side",
  subject: "main",
  summary: "sub",
} satisfies Record<string, StackedArea>;

const CampaignsTable = ({ rows }: { rows: readonly CampaignRow[] }) => {
  const table = useTable({
    columns: COLUMNS,
    data: rows,
    features,
    getRowId: (row) => row.campaign.id,
  });

  return (
    <div className="[&_tbody_tr]:relative">
      <DataTable
        areas={AREAS}
        columnClassNames={COLUMN_CLASSES}
        label="Campaigns"
        table={table}
      />
    </div>
  );
};

const NoCampaigns = ({
  connections,
  lists,
}: {
  connections: readonly ProviderConnection[];
  lists: readonly List[];
}) => {
  if (!isReadyToWrite(connections, lists)) {
    return <CampaignSetupNeeded connections={connections} lists={lists} />;
  }

  const [only] = connections;

  return (
    <EmptyState
      actions={<NewCampaignButton />}
      description={`Paste the HTML from your email editor, choose a list, and send it through ${connections.length === 1 && only !== undefined ? only.name : "your provider"}.`}
      title="No campaigns yet"
    />
  );
};

/**
 * The Organization's Campaigns, newest first, as a table: each one's subject,
 * status, List, how many it was sent to, and when. It pages through the URL,
 * like Contacts. Before the first Campaign, it says what's missing: a
 * Provider Connection, a List, or neither.
 */
export const CampaignsPage = ({
  onSearch,
  organization,
  search,
}: {
  onSearch: (search: CampaignSearch) => void;
  organization: Organization;
  search: CampaignSearch;
}) => {
  const page = useCampaignPage(organization.id, search);
  const lists = useLists(organization.id);
  const connections = useProviderConnections(organization.id);

  const loading = [page, lists, connections].some(
    (query) => query.isPending && query.errorUpdatedAt === 0
  );

  if (loading) {
    return <PageAreaLoading label="Loading campaigns" />;
  }

  const total = page.data?.total ?? 0;

  const body = () => {
    if (
      page.data === undefined ||
      lists.data === undefined ||
      connections.data === undefined
    ) {
      return (
        <TableRegion bordered label="Campaigns">
          <LoadFailed
            onRetry={() => {
              for (const query of [page, lists, connections]) {
                if (query.isError) {
                  query.refetch();
                }
              }
            }}
            retrying={
              page.isFetching || lists.isFetching || connections.isFetching
            }
            title="Your campaigns didn’t load"
          />
        </TableRegion>
      );
    }

    if (total === 0) {
      return (
        <TableRegion bordered label="Campaigns">
          <NoCampaigns connections={connections.data} lists={lists.data} />
        </TableRegion>
      );
    }

    const names = new Map(lists.data.map((list) => [list.id, list.name]));
    const shown = page.data;

    return (
      <TableRegion
        bordered
        busy={page.isPlaceholderData}
        footer={
          <CursorPager
            label="Pages of campaigns"
            loading={page.isPlaceholderData}
            next={shown.next}
            onPage={onSearch}
            previous={shown.previous}
            shown={shown.campaigns.length}
            start={shown.start}
            total={shown.total}
          />
        }
        label="Campaigns"
      >
        <CampaignsTable
          rows={shown.campaigns.map((campaign) => ({
            campaign,
            listName: names.get(campaign.listId) ?? "A deleted list",
          }))}
        />
      </TableRegion>
    );
  };

  return (
    <TablePage
      actions={total === 0 ? undefined : <NewCampaignButton />}
      description={DESCRIPTION}
      title="Campaigns"
      titleDetail={total === 0 ? undefined : formatCount(total)}
    >
      {body()}
    </TablePage>
  );
};
