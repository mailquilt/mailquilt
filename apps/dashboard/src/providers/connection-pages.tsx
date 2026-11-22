import { LinkButton } from "@cloudflare/kumo";
import { CaretLeftIcon } from "@phosphor-icons/react";
import type { Organization, ProviderConnectionId } from "@repo/domain";
import { Link, useNavigate } from "@tanstack/react-router";

import { TableLoadFailed } from "../audience/table-card.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { ConnectionForm } from "./connection-form.tsx";
import {
  useCreateConnection,
  useProviderConnections,
  useUpdateConnection,
} from "./providers-api.ts";

const FormPage = ({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) => (
  <PageFrame>
    <div className="max-w-[44rem]">
      <Link
        className="mb-4 inline-flex items-center gap-1 rounded-sm text-sm text-kumo-subtle hover:text-kumo-strong focus-visible:outline-2 focus-visible:outline-kumo-focus"
        to="/providers"
      >
        <CaretLeftIcon aria-hidden="true" className="size-3.5" />
        Providers
      </Link>
      <h1 className="font-display text-display font-semibold text-kumo-strong">
        {title}
      </h1>
      <p className="mt-1.5 mb-8 text-base text-(--mq-body)">{description}</p>
      {children}
    </div>
  </PageFrame>
);

/** Connects an SMTP server, then opens its test email on Providers. */
export const ConnectPage = ({
  organization,
}: {
  organization: Organization;
}) => {
  const create = useCreateConnection(organization.id);
  const navigate = useNavigate();

  return (
    <FormPage
      description="You’ll send yourself a test email next, to check it works."
      title="Connect an SMTP server"
    >
      <ConnectionForm
        busy={create.isPending}
        busyLabel="Connecting…"
        failure={create.error}
        onSubmit={({ credentials, settings }) =>
          create.mutate(
            credentials === "keep" || credentials === null
              ? settings
              : { ...settings, credentials },
            {
              onSuccess: (connection) => {
                navigate({
                  search: { connected: connection.id },
                  to: "/providers",
                });
              },
            }
          )
        }
        submitLabel="Connect"
      />
    </FormPage>
  );
};

/** Changes a connection's settings, then opens its test email on Providers. */
export const EditPage = ({
  organization,
  providerConnectionId,
}: {
  organization: Organization;
  providerConnectionId: ProviderConnectionId;
}) => {
  const connections = useProviderConnections(organization.id);
  const update = useUpdateConnection(organization.id, providerConnectionId);
  const navigate = useNavigate();

  if (connections.isPending && connections.errorUpdatedAt === 0) {
    return <PageAreaLoading label="Loading the connection" />;
  }

  const connection = connections.data?.find(
    (candidate) => candidate.id === providerConnectionId
  );

  const body = () => {
    if (connections.data === undefined) {
      return (
        <section className="rounded-xl border border-kumo-fill bg-kumo-base">
          <TableLoadFailed
            onRetry={() => connections.refetch()}
            retrying={connections.isFetching}
            title="The connection didn’t load"
          />
        </section>
      );
    }

    if (connection === undefined) {
      return (
        <div className="flex flex-col items-start gap-5">
          <p className="text-base text-(--mq-body)">
            {organization.name} has no such connection. Someone may have deleted
            it.
          </p>
          <LinkButton href="/providers" variant="primary">
            Go to Providers
          </LinkButton>
        </div>
      );
    }

    return (
      <ConnectionForm
        busy={update.isPending}
        busyLabel="Saving…"
        connection={connection}
        failure={update.error}
        onSubmit={({ credentials, settings }) =>
          update.mutate(
            credentials === "keep" ? settings : { ...settings, credentials },
            {
              onSuccess: (saved) => {
                navigate({ search: { saved: saved.id }, to: "/providers" });
              },
            }
          )
        }
        submitLabel="Save changes"
      />
    );
  };

  return (
    <FormPage
      description={
        connection?.signsIn === true
          ? "Changing the host, port or encryption asks for the username and password again."
          : "Change where and how this connection sends."
      }
      title={
        connection === undefined ? "Edit connection" : `Edit ${connection.name}`
      }
    >
      {body()}
    </FormPage>
  );
};
