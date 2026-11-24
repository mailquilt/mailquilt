import { Button, DropdownMenu, LinkButton } from "@cloudflare/kumo";
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
import { useEffect, useRef, useState } from "react";

import { DataTable } from "../audience/data-table.tsx";
import type { StackedArea } from "../audience/data-table.tsx";
import { formatDay } from "../audience/format.ts";
import {
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
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
import { DeleteConnectionDialog } from "./delete-connection-dialog.tsx";
import { useProviderConnections } from "./providers-api.ts";
import { TestEmailDialog } from "./test-email-dialog.tsx";

const ENCRYPTION_NAME: Record<SmtpSecurity, string> = {
  none: "Not encrypted",
  starttls: "STARTTLS",
  tls: "TLS",
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
    Connect SMTP server
  </LinkButton>
);

const features = tableFeatures({});

// WARNING: TanStack renders each cell as a component, so new columns remount every row's open dialog; rows carry what the actions need and COLUMNS stays module-level.
interface ConnectionRow {
  readonly connection: ProviderConnection;
  readonly defaultTo: string;
  readonly intro?: string;
  readonly onDeleted: (name: string) => void;
  readonly organization: Organization;
}

const ConnectionActions = ({
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
          <DropdownMenu.Item
            href={`/providers/${connection.id}/edit`}
            icon={PencilSimpleIcon}
          >
            Edit
          </DropdownMenu.Item>
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
            <span className="max-sm:hidden">SMTP server, connected</span>
            <span className="sm:hidden">Connected</span>{" "}
            <span className="whitespace-nowrap">
              {formatDay(row.original.connection.createdAt)}
            </span>
          </span>
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
  helper.accessor((row) => row.connection.smtp, {
    cell: ({ getValue }) => (
      <Breakable value={`${getValue().host}:${getValue().port}`} />
    ),
    header: "Server",
    id: "server",
  }),
  helper.accessor((row) => row.connection, {
    cell: ({ getValue }) => {
      const connection = getValue();

      const SecurityIcon =
        connection.smtp.security === "none"
          ? LockSimpleOpenIcon
          : LockSimpleIcon;

      return (
        <span className="inline-flex items-center gap-1.5">
          <SecurityIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-kumo-subtle"
          />
          {ENCRYPTION_NAME[connection.smtp.security]},{" "}
          {connection.signsIn ? "with sign-in" : "without sign-in"}
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
  actions: "side",
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
 * Edit and Delete. A connection that was just connected or saved opens its test by
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

  if (connections.isPending && connections.errorUpdatedAt === 0) {
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
          description="Connect the SMTP server you send with. Connecting Amazon SES and Cloudflare Email directly, without SMTP, arrives in a later Mailquilt update."
          title="No provider connected yet"
        />
      );
    }

    return (
      <ConnectionsTable
        rows={connected.map((connection) => ({
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
              Amazon SES and Cloudflare Email
            </span>{" "}
            connect directly in a later Mailquilt update. Until then, connect
            their SMTP settings here.
          </span>
        </p>
      )}
    </TablePage>
  );
};
