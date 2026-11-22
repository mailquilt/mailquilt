import { Button, DropdownMenu, LinkButton } from "@cloudflare/kumo";
import {
  DotsThreeIcon,
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

import { TableLoadFailed } from "../audience/table-card.tsx";
import { QuiltSlot } from "../brand/quilt-block.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TablePage } from "../layout/table-page.tsx";
import { DeleteConnectionDialog } from "./delete-connection-dialog.tsx";
import { useProviderConnections } from "./providers-api.ts";
import { TestEmailPanel } from "./test-email-panel.tsx";

const ENCRYPTION_NAME: Record<SmtpSecurity, string> = {
  none: "None",
  starttls: "STARTTLS",
  tls: "TLS",
};

const senderOf = ({ from }: ProviderConnection) =>
  from.name === undefined ? from.email : `${from.name} <${from.email}>`;

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
  <section className="rounded-xl border border-kumo-fill bg-kumo-base px-6 py-5 max-sm:p-4">
    <div className="flex gap-4 max-sm:flex-col">
      <QuiltSlot className="size-10 shrink-0" />
      <div className="flex max-w-[44rem] flex-col">
        <h2 className="text-lg font-semibold text-kumo-strong">
          No provider connected yet
        </h2>
        <p className="mt-1 text-base text-(--mq-body)">
          Connect the SMTP server you send with. Your provider lists its host,
          port and sign-in, often under “SMTP settings”.
        </p>
        <LinkButton
          className="mt-4 w-fit max-sm:w-full max-sm:justify-center"
          href="/providers/new"
          icon={PlusIcon}
          variant="primary"
        >
          Connect SMTP server
        </LinkButton>
      </div>
    </div>
    <p className="mt-5 border-t border-kumo-hairline pt-4 text-sm text-kumo-subtle">
      Amazon SES and Cloudflare Email arrive in a later Mailquilt update.
    </p>
  </section>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-sm text-kumo-subtle">{label}</dt>
    <dd className="mt-0.5 text-base break-words text-kumo-strong">{value}</dd>
  </div>
);

const ConnectionCard = ({
  connection,
  defaultTo,
  intro: introWhenShown,
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

  const [panel, setPanel] = useState({
    intro: introWhenShown,
    open: introWhenShown !== undefined,
  });

  const panelId = useId();
  const { intro } = panel;
  const testing = panel.open;

  const setTesting = (open: boolean) =>
    setPanel({ intro: open ? intro : undefined, open });

  const [deleting, setDeleting] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  return (
    <article
      aria-labelledby={headingId}
      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-1 rounded-xl border border-kumo-fill bg-kumo-base px-6 py-5 max-sm:p-4"
    >
      <div className="col-start-1 row-start-1 mr-2 flex min-w-0 items-center gap-2">
        <h2
          className="truncate text-lg font-semibold text-kumo-strong"
          id={headingId}
        >
          {connection.name}
        </h2>
        <span className="shrink-0 rounded-md border border-kumo-fill px-1.5 text-sm font-medium text-kumo-subtle">
          SMTP
        </span>
      </div>
      <Button
        aria-controls={testing ? panelId : undefined}
        aria-expanded={testing}
        className="col-span-3 row-start-3 mt-4 h-11 w-full justify-center sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:h-9 sm:w-auto"
        onClick={() => setTesting(!testing)}
        variant="secondary"
      >
        {testing ? "Hide test" : "Send test email"}
      </Button>
      <div className="col-start-3 row-start-1">
        <DropdownMenu>
          <DropdownMenu.Trigger
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-kumo-strong hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus data-popup-open:bg-kumo-tint"
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
              onClick={() => setDeleting(true)}
              variant="danger"
            >
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
      <dl className="col-span-3 row-start-2 mt-4 grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,1.4fr)] lg:gap-4">
        <Detail
          label="Server"
          value={`${connection.smtp.host}:${connection.smtp.port}`}
        />
        <Detail
          label="Encryption"
          value={ENCRYPTION_NAME[connection.smtp.security]}
        />
        <Detail label="Sends as" value={senderOf(connection)} />
      </dl>
      {testing ? (
        <div className="col-span-3 row-start-4 sm:row-start-3" id={panelId}>
          <TestEmailPanel
            connection={connection}
            defaultTo={defaultTo}
            intro={intro}
            organization={organization}
          />
        </div>
      ) : null}
      <DeleteConnectionDialog
        connection={connection}
        finalFocus={menuButton}
        onDeleted={onDeleted}
        onOpenChange={setDeleting}
        open={deleting}
        organization={organization}
      />
    </article>
  );
};

/**
 * The Organization's Provider Connections, each with its server, encryption
 * and sender, a test email and its Edit and Delete. A connection that was
 * just connected or saved opens its test by itself, as the next step.
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
          <TableLoadFailed
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
      <div className="flex flex-col gap-4">
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
