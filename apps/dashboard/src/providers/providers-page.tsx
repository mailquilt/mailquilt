import { Button, DropdownMenu, LinkButton } from "@cloudflare/kumo";
import type {
  Organization,
  ProviderConnection,
  ProviderConnectionId,
  SmtpSecurity,
} from "@repo/domain";
import { useEffect, useId, useRef, useState } from "react";

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

const Detail = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <div className="min-w-0 max-sm:contents">
    <dt className="text-sm text-kumo-subtle max-sm:pt-px">{label}</dt>
    <dd className="mt-0.5 min-w-0 text-base break-words text-kumo-strong max-sm:mt-0">
      {children}
    </dd>
  </div>
);

const ConnectionRow = ({
  connection,
  defaultTo,
  intro,
  onDeleted,
  organization,
}: {
  connection: ProviderConnection;
  defaultTo: string;
  intro?: string;
  onDeleted: (name: string) => void;
  organization: Organization;
}) => {
  const headingId = useId();
  const deleting = useDialog();
  const menuButton = useRef<HTMLButtonElement>(null);
  const testButton = useRef<HTMLButtonElement>(null);

  const testing = useDialog(intro !== undefined);
  const [testIntro, setTestIntro] = useState(intro);

  const SecurityIcon =
    connection.smtp.security === "none" ? LockSimpleOpenIcon : LockSimpleIcon;

  return (
    <article aria-labelledby={headingId} className="mq-conn">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-quilt bg-(--mq-block-ink) text-kumo-inverse [grid-area:icon]"
      >
        <EnvelopeSimpleIcon className="size-5" />
      </span>
      <div className="min-w-0 [grid-area:name]">
        <h2
          className="text-base leading-5 font-semibold break-words text-kumo-strong"
          id={headingId}
        >
          {connection.name}
        </h2>
        <p className="mt-0.5 text-sm text-kumo-subtle">
          SMTP server, connected {formatDay(connection.createdAt)}
        </p>
      </div>
      <Button
        className="mq-conn-test"
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
          className="mq-conn-menu flex size-9 cursor-pointer items-center justify-center rounded-lg text-kumo-strong hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus data-popup-open:bg-kumo-tint"
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
      <dl className="mq-conn-details">
        <Detail label="Sends as">
          {connection.from.name === undefined ? (
            <Breakable value={connection.from.email} />
          ) : (
            <>
              {connection.from.name}
              <span className="block text-sm text-kumo-subtle">
                <Breakable value={connection.from.email} />
              </span>
            </>
          )}
        </Detail>
        <Detail label="Server">
          <Breakable
            value={`${connection.smtp.host}:${connection.smtp.port}`}
          />
        </Detail>
        <Detail label="Security">
          <SecurityIcon
            aria-hidden="true"
            className="mr-1.5 inline size-3.5 align-[-0.125rem] text-kumo-subtle"
          />
          {ENCRYPTION_NAME[connection.smtp.security]},{" "}
          <span className="whitespace-nowrap">
            {connection.signsIn ? "with sign-in" : "without sign-in"}
          </span>
        </Detail>
      </dl>
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
    </article>
  );
};

/**
 * The Organization's Provider Connections, as open rows on the page, each
 * with who it sends as, its server and security, Send test, and its Edit and
 * Delete. A connection that was just connected or saved opens its test by
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

  const description = `${organization.name} sends through these, at your provider’s own price. Mailquilt never sends your email itself.`;

  if (connections.data === undefined) {
    return (
      <TablePage description={description} title="Providers">
        <TableRegion label="Providers">
          <LoadFailed
            onRetry={() => connections.refetch()}
            retrying={connections.isFetching}
            title="Your providers didn’t load"
          />
        </TableRegion>
      </TablePage>
    );
  }

  if (connections.data.length === 0) {
    return (
      <TablePage description={description} title="Providers">
        {deleted}
        <TableRegion label="Providers">
          <EmptyState
            actions={<ConnectButton />}
            description="Connect the SMTP server you send with. Connecting Amazon SES and Cloudflare Email directly, without SMTP, arrives in a later Mailquilt update."
            title="No provider connected yet"
          />
        </TableRegion>
      </TablePage>
    );
  }

  return (
    <TablePage
      actions={<ConnectButton />}
      description={description}
      title="Providers"
      titleDetail={`${connections.data.length} connected`}
    >
      {deleted}
      <section
        aria-label="Connections"
        className="mq-bleed border-t border-kumo-hairline"
      >
        {connections.data.map((connection) => (
          <ConnectionRow
            connection={connection}
            defaultTo={testEmailTo}
            intro={introFor(connection, justConnected, justSaved)}
            key={connection.id}
            onDeleted={onDeleted}
            organization={organization}
          />
        ))}
      </section>
      <p className="mt-7 flex items-center gap-4 text-base text-pretty text-kumo-subtle">
        <span className="shrink-0">
          <SlotArt size={28} />
        </span>
        <span>
          <span className="font-medium text-kumo-default">
            Connecting Amazon SES and Cloudflare Email directly
          </span>
          , without SMTP, arrives in a later Mailquilt update. Until then,
          connect their SMTP settings here.
        </span>
      </p>
    </TablePage>
  );
};
