import { Button, DropdownMenu, LinkButton } from "@cloudflare/kumo";
import {
  DotsThreeIcon,
  EnvelopeSimpleIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type {
  Organization,
  ProviderConnection,
  ProviderConnectionId,
  SmtpSecurity,
} from "@repo/domain";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";

import { formatDay } from "../audience/format.ts";
import { useDialog } from "../layout/action-dialog.tsx";
import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { DeleteConnectionDialog } from "./delete-connection-dialog.tsx";
import { useProviderConnections } from "./providers-api.ts";
import { TestEmailDialog } from "./test-email-dialog.tsx";

const ENCRYPTION_NAME: Record<SmtpSecurity, string> = {
  none: "Not encrypted",
  starttls: "STARTTLS",
  tls: "TLS",
};

const securityOf = ({ signsIn, smtp }: ProviderConnection) =>
  `${ENCRYPTION_NAME[smtp.security]}, ${signsIn ? "signs in" : "no sign-in"}`;

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

const NoConnection = () => (
  <section className="rounded-xl border border-kumo-fill bg-kumo-base">
    <EmptyState
      actions={
        <LinkButton href="/providers/new" icon={PlusIcon} variant="primary">
          Connect SMTP server
        </LinkButton>
      }
      description="Connect the SMTP server you send with. Amazon SES and Cloudflare Email arrive in a later Mailquilt update."
      title="No provider connected yet"
    />
  </section>
);

const Detail = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <>
    <dt className="text-sm text-kumo-subtle">{label}</dt>
    <dd className="min-w-0 text-base break-words text-kumo-strong">
      {children}
    </dd>
  </>
);

const ConnectionCard = ({
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
  const navigate = useNavigate();
  const headingId = useId();
  const deleting = useDialog();
  const menuButton = useRef<HTMLButtonElement>(null);
  const testButton = useRef<HTMLButtonElement>(null);

  const testing = useDialog(intro !== undefined);
  const [testIntro, setTestIntro] = useState(intro);

  const SecurityIcon =
    connection.smtp.security === "none" ? LockSimpleOpenIcon : LockSimpleIcon;

  return (
    <article
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-kumo-fill bg-kumo-base"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-6 py-5 max-sm:p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-quilt bg-(--mq-block-ink) text-kumo-inverse"
        >
          <EnvelopeSimpleIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="text-base font-semibold break-words text-kumo-strong"
            id={headingId}
          >
            {connection.name}
          </h2>
          <p className="text-sm text-kumo-subtle">
            SMTP server, connected {formatDay(connection.createdAt)}
          </p>
        </div>
        <Button
          className="col-span-full row-start-3 mt-4 w-full justify-center sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:w-auto"
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
            className="col-start-3 row-start-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-kumo-strong hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus data-popup-open:bg-kumo-tint sm:col-start-4"
            ref={menuButton}
            render={
              <button
                aria-label={`More for ${connection.name}`}
                type="button"
              />
            }
          >
            <DotsThreeIcon aria-hidden="true" className="size-5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" className="min-w-44 rounded-xl">
            <DropdownMenu.Item
              icon={PencilSimpleIcon}
              onClick={() =>
                navigate({
                  params: { providerConnectionId: connection.id },
                  to: "/providers/$providerConnectionId/edit",
                })
              }
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
        <dl className="col-span-full row-start-2 mt-5 grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2.5 max-sm:grid-cols-[4.75rem_minmax(0,1fr)] max-sm:gap-x-3">
          <Detail label="Sends as">
            {connection.from.name === undefined ? (
              connection.from.email
            ) : (
              <>
                {connection.from.name}
                <span className="block text-sm text-kumo-subtle">
                  {connection.from.email}
                </span>
              </>
            )}
          </Detail>
          <Detail label="Server">
            {connection.smtp.host}:{connection.smtp.port}
          </Detail>
          <Detail label="Security">
            <SecurityIcon
              aria-hidden="true"
              className="mr-1.5 inline size-4 align-[-0.125rem] text-kumo-subtle"
            />
            {securityOf(connection)}
          </Detail>
        </dl>
      </div>
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
 * The Organization's Provider Connections, two across on wide screens, each
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

  const description = `Mailquilt sends ${organization.name}’s email through your own account, at your provider’s price.`;

  if (connections.data === undefined) {
    return (
      <TablePage description={description} title="Providers">
        <section className="rounded-xl border border-kumo-fill bg-kumo-base">
          <LoadFailed
            onRetry={() => connections.refetch()}
            retrying={connections.isFetching}
            title="Your providers didn’t load"
          />
        </section>
      </TablePage>
    );
  }

  if (connections.data.length === 0) {
    return (
      <TablePage description={description} title="Providers">
        {deleted}
        <NoConnection />
      </TablePage>
    );
  }

  return (
    <TablePage
      actions={
        <LinkButton href="/providers/new" icon={PlusIcon} variant="secondary">
          Connect SMTP server
        </LinkButton>
      }
      description={description}
      title="Providers"
    >
      {deleted}
      <div className="grid gap-4 xl:grid-cols-2">
        {connections.data.map((connection) => (
          <ConnectionCard
            connection={connection}
            defaultTo={testEmailTo}
            intro={introFor(connection, justConnected, justSaved)}
            key={connection.id}
            onDeleted={onDeleted}
            organization={organization}
          />
        ))}
      </div>
    </TablePage>
  );
};
