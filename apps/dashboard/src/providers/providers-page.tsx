import { Badge, Button, DropdownMenu, LinkButton } from "@cloudflare/kumo";
import type {
  Organization,
  ProviderConnection,
  ProviderConnectionId,
  SmtpSecurity,
} from "@repo/domain";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Predicate } from "effect";
import { useEffect, useRef, useState } from "react";

import { loadingFirstTime } from "../api.ts";
import { DataTable } from "../audience/data-table.tsx";
import type { StackedArea } from "../audience/data-table.tsx";
import { formatCount, formatDay } from "../audience/format.ts";
import {
  DotsThreeIcon,
  EnvelopeBlockIcon,
  EnvelopeSimpleIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MegaphoneIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "../icons/icons.tsx";
import { useDialog } from "../layout/action-dialog.tsx";
import { Breakable } from "../layout/breakable.tsx";
import { EmptyState, LoadFailed, SlotArt } from "../layout/empty-state.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import { useConfirmationToast, useProblemToast } from "../layout/toast.tsx";
import { DeleteConnectionDialog } from "./delete-connection-dialog.tsx";
import {
  useMakeCampaignDefault,
  useProviderConnections,
} from "./providers-api.ts";
import { TestEmailDialog } from "./test-email-dialog.tsx";

const ENCRYPTION_NAME: Record<SmtpSecurity, string> = {
  none: "Not encrypted",
  starttls: "STARTTLS",
  tls: "TLS",
};

const securityOf = (connection: ProviderConnection, signIn: string) => {
  if (connection.provider === "cloudflare") {
    return "HTTPS, with an API token";
  }

  return connection.provider === "ses"
    ? "HTTPS, with an access key"
    : `${ENCRYPTION_NAME[connection.smtp.security]}, ${signIn}`;
};

const focusOnMount = (element: HTMLElement | null) => element?.focus();

const introFor = (
  connection: ProviderConnection,
  justConnected?: ProviderConnectionId,
  justSaved?: ProviderConnectionId
) => {
  if (connection.id === justConnected) {
    return `${connection.name} is connected. Send yourself a test to check it works.`;
  }

  if (connection.id === justSaved) {
    return `Saved ${connection.name}. Send yourself a test to check it still works.`;
  }
};

const ConnectButton = () => (
  <LinkButton href="/providers/new" icon={PlusIcon} variant="primary">
    Connect a provider
  </LinkButton>
);

const PROVIDER_NAME: Record<ProviderConnection["provider"], string> = {
  cloudflare: "Cloudflare Email",
  ses: "Amazon SES",
  smtp: "SMTP server",
};

const rateOf = (connection: ProviderConnection) => {
  if (connection.emailsPerMinute !== null) {
    return `${formatCount(connection.emailsPerMinute)} emails a minute`;
  }

  return connection.provider === "ses"
    ? "Your SES account’s limit"
    : "No limit";
};

const sendsThrough = (connection: ProviderConnection) => {
  if (connection.provider === "cloudflare") {
    return "Cloudflare Email";
  }

  return connection.provider === "ses"
    ? `Amazon SES, ${connection.ses.region}`
    : `${connection.smtp.host}:${connection.smtp.port}`;
};

const makeDefaultProblem = (error: Error) => {
  if (Predicate.isTagged(error, "SignInRequired")) {
    return "You’ve been signed out. Sign in again, then try again.";
  }

  return Predicate.isTagged(error, "ProviderConnectionNotFound")
    ? "It no longer exists. Someone may have deleted it."
    : "Mailquilt couldn’t reach its server. Check your connection, then try again.";
};

const features = tableFeatures({});

// WARNING: TanStack renders each cell as a component, so new columns remount every row's open dialog; rows carry what the actions need and COLUMNS stays module-level.
interface ConnectionRow {
  readonly canMakeDefault: boolean;
  readonly connection: ProviderConnection;
  readonly defaultTo: string;
  readonly intro?: string;
  readonly onDeleted: (name: string) => void;
  readonly organization: Organization;
}

const ConnectionActions = ({
  canMakeDefault,
  connection,
  defaultTo,
  intro,
  onDeleted,
  organization,
}: ConnectionRow) => {
  const deleting = useDialog();
  const menuButton = useRef<HTMLButtonElement>(null);
  const testButton = useRef<HTMLButtonElement>(null);

  const testing = useDialog(intro !== undefined);
  const [testIntro, setTestIntro] = useState(intro);
  const makeDefault = useMakeCampaignDefault(organization.id);
  const confirmations = useConfirmationToast();
  const problem = useProblemToast(`make-default-${connection.id}`);

  const makeItDefault = () =>
    makeDefault.mutate(connection.id, {
      onError: (error) =>
        problem.show({
          description: makeDefaultProblem(error),
          title: `${connection.name} isn’t the default yet`,
        }),
      onSuccess: () => {
        problem.clear();
        confirmations.add({
          title: `New Campaigns now start with ${connection.name}`,
        });
      },
    });

  return (
    <span className="flex items-center justify-end gap-1">
      <Button
        icon={PaperPlaneTiltIcon}
        onClick={() => {
          setTestIntro(undefined);
          testing.setOpen(true);
        }}
        ref={testButton}
        variant="secondary"
      >
        Send test
        <span className="sr-only"> for {connection.name}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenu.Trigger
          className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-kumo-strong hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus data-popup-open:bg-kumo-tint"
          ref={menuButton}
          render={
            <button aria-label={`More for ${connection.name}`} type="button" />
          }
        >
          <DotsThreeIcon aria-hidden="true" className="size-5" weight="bold" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" className="min-w-44 rounded-xl">
          {canMakeDefault ? (
            <DropdownMenu.Item icon={MegaphoneIcon} onClick={makeItDefault}>
              Make default for new Campaigns
            </DropdownMenu.Item>
          ) : null}
          {connection.provider === "ses" ? (
            <DropdownMenu.Item
              href={`/providers/${connection.id}/bounces`}
              icon={EnvelopeBlockIcon}
            >
              Bounces and complaints
            </DropdownMenu.Item>
          ) : null}
          {connection.provider === "cloudflare" ? null : (
            <DropdownMenu.Item
              href={`/providers/${connection.id}/edit`}
              icon={PencilSimpleIcon}
            >
              Edit
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            icon={TrashIcon}
            onClick={() => deleting.setOpen(true)}
            variant="danger"
          >
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
      <TestEmailDialog
        connection={connection}
        defaultTo={defaultTo}
        finalFocus={testButton}
        intro={testIntro}
        key={testing.key}
        onExited={testing.handleExited}
        onOpenChange={testing.handleOpenChange}
        open={testing.open}
        organization={organization}
      />
      <DeleteConnectionDialog
        connection={connection}
        finalFocus={menuButton}
        onDeleted={onDeleted}
        key={deleting.key}
        onExited={deleting.handleExited}
        onOpenChange={deleting.handleOpenChange}
        open={deleting.open}
        organization={organization}
      />
    </span>
  );
};

const helper = createColumnHelper<typeof features, ConnectionRow>();

const COLUMNS = helper.columns([
  helper.accessor((row) => row.connection.name, {
    cell: ({ row }) => (
      <span className="flex items-center gap-3 py-2">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-(--mq-block-ink) text-kumo-inverse max-sm:hidden"
        >
          <EnvelopeSimpleIcon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium wrap-anywhere text-kumo-strong">
            {row.original.connection.name}
          </span>
          <span className="block text-sm text-kumo-subtle">
            {PROVIDER_NAME[row.original.connection.provider]}, connected{" "}
            <span className="whitespace-nowrap">
              {formatDay(row.original.connection.createdAt)}
            </span>
          </span>
          {row.original.connection.defaultForCampaigns ? (
            <span className="mt-1.5 block">
              <Badge variant="secondary">Default for new Campaigns</Badge>
            </span>
          ) : null}
        </span>
      </span>
    ),
    header: "Name",
    id: "name",
  }),
  helper.accessor((row) => row.connection.from, {
    cell: ({ getValue }) => {
      const from = getValue();

      return from.name === undefined ? (
        <Breakable value={from.email} />
      ) : (
        <span className="block py-2">
          {from.name}
          <span className="block text-sm text-kumo-subtle">
            <Breakable value={from.email} />
          </span>
        </span>
      );
    },
    header: "Sends as",
    id: "sendsAs",
  }),
  helper.accessor((row) => row.connection, {
    cell: ({ getValue }) => {
      const connection = getValue();

      return (
        <span className="block py-2">
          <span className="block">
            <Breakable value={sendsThrough(connection)} />
          </span>
          <span className="block text-sm text-kumo-subtle">
            {rateOf(connection)}
          </span>
        </span>
      );
    },
    header: "Server",
    id: "server",
  }),
  helper.accessor((row) => row.connection, {
    cell: ({ getValue }) => {
      const connection = getValue();

      const SecurityIcon =
        connection.provider === "smtp" && connection.smtp.security === "none"
          ? LockSimpleOpenIcon
          : LockSimpleIcon;

      const signIn =
        connection.provider === "smtp" && connection.signsIn
          ? "with sign-in"
          : "without sign-in";

      const security = securityOf(connection, signIn);

      return (
        <span className="inline-flex items-center gap-1.5">
          <SecurityIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-kumo-subtle"
          />
          {security}
        </span>
      );
    },
    header: "Security",
    id: "security",
  }),
  helper.display({
    cell: ({ row }) => <ConnectionActions {...row.original} />,
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
  }),
]);

const COLUMN_CLASSES = {
  actions: "whitespace-nowrap sm:w-px",
  name: "sm:min-w-[14rem]",
  security: "whitespace-nowrap max-[90rem]:hidden",
  sendsAs: "text-kumo-default xl:min-w-48",
  server: "text-kumo-default max-xl:hidden xl:min-w-48",
};

const AREAS = {
  actions: "foot",
  name: "main",
  security: "hide",
  sendsAs: "sub",
  server: "hide",
} satisfies Record<string, StackedArea>;

const ConnectionsTable = ({ rows }: { rows: readonly ConnectionRow[] }) => {
  const table = useTable({
    columns: COLUMNS,
    data: rows,
    features,
    getRowId: (row) => row.connection.id,
  });

  return (
    <DataTable
      areas={AREAS}
      columnClassNames={COLUMN_CLASSES}
      label="Provider connections"
      table={table}
    />
  );
};

/**
 * The Organization's Provider Connections, in a bordered table like Contacts
 * and Lists: who each sends as, its server and security, Send test, and its
 * Edit and Delete, and for SES the steps that bring its bounces and
 * complaints to Mailquilt. A connection that was just connected or saved opens its test by
 * itself, as the next step.
 */
export const ProvidersPage = ({
  justConnected,
  justSaved,
  onNewsShown,
  organization,
  testEmailTo,
}: {
  justConnected?: ProviderConnectionId;
  justSaved?: ProviderConnectionId;
  /**
   * Called once the connections have drawn, with the news of one just
   * connected or saved shown in its card, so the URL can forget it.
   */
  onNewsShown?: () => void;
  organization: Organization;
  /** Where a test email goes unless the person changes it: their own address. */
  testEmailTo: string;
}) => {
  const connections = useProviderConnections(organization.id);
  const shown = connections.data !== undefined;

  useEffect(() => {
    if (shown) {
      onNewsShown?.();
    }
  }, [onNewsShown, shown]);

  const [lastDeleted, setLastDeleted] = useState<{
    readonly count: number;
    readonly name: string;
  }>();

  const deleted =
    lastDeleted === undefined ? null : (
      <p
        className="sr-only"
        key={lastDeleted.count}
        ref={focusOnMount}
        tabIndex={-1}
      >
        Deleted {lastDeleted.name}.
      </p>
    );

  const onDeleted = (name: string) =>
    setLastDeleted((last) => ({ count: (last?.count ?? 0) + 1, name }));

  if (loadingFirstTime(connections)) {
    return <PageAreaLoading label="Loading providers" />;
  }

  const connected = connections.data ?? [];

  const body = () => {
    if (connections.data === undefined) {
      return (
        <LoadFailed
          onRetry={() => connections.refetch()}
          retrying={connections.isFetching}
          title="Your providers didn’t load"
        />
      );
    }

    if (connected.length === 0) {
      return (
        <EmptyState
          actions={<ConnectButton />}
          description="Connect your Amazon SES account, or the SMTP server you send with."
          title="No provider connected yet"
        />
      );
    }

    return (
      <ConnectionsTable
        rows={connected.map((connection) => ({
          canMakeDefault: !connection.defaultForCampaigns,
          connection,
          defaultTo: testEmailTo,
          intro: introFor(connection, justConnected, justSaved),
          onDeleted,
          organization,
        }))}
      />
    );
  };

  return (
    <TablePage
      actions={connected.length === 0 ? undefined : <ConnectButton />}
      description={`${organization.name} sends through these, at your provider’s own price. Mailquilt never sends your email itself.`}
      title="Providers"
      titleDetail={
        connected.length === 0 ? undefined : `${connected.length} connected`
      }
    >
      {deleted}
      <TableRegion bordered label="Providers">
        {body()}
      </TableRegion>
      {connected.length === 0 ? null : (
        <p className="mt-4 flex items-center gap-3 text-sm text-pretty text-kumo-subtle">
          <span className="shrink-0">
            <SlotArt size={20} />
          </span>
          <span>
            <span className="font-medium text-kumo-default">
              Cloudflare Email
            </span>{" "}
            connects directly in a later Mailquilt update.
          </span>
        </p>
      )}
    </TablePage>
  );
};
