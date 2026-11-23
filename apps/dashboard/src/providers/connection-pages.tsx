import { LinkButton } from "@cloudflare/kumo";
import type { Organization, ProviderConnectionId } from "@repo/domain";
import { useNavigate } from "@tanstack/react-router";

import { EmptyState, LoadFailed } from "../layout/empty-state.tsx";
import { PageFrame } from "../layout/page-frame.tsx";
import { PageHeader } from "../layout/page-header.tsx";
import { PageAreaLoading } from "../layout/page-states.tsx";
import { TableRegion } from "../layout/table-region.tsx";
import {
  ConnectionForm,
  connectionFailureMessage,
} from "./connection-form.tsx";
import {
  useCreateConnection,
  useProviderConnections,
  useUpdateConnection,
} from "./providers-api.ts";

const SENDER_DESCRIPTION =
  "Who email sent through this connection is from. Your provider must allow this address.";

const SENDER_EXAMPLE = { email: "news@example.com", name: "Acme News" };

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
    <div className="max-w-[60rem]">
      <PageHeader
        crumbs={[{ href: "/providers", label: "Providers" }]}
        description={description}
        title={title}
      />
    </div>
    {children}
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
        cancelHref="/providers"
        failureMessage={connectionFailureMessage(create.error)}
        senderDescription={SENDER_DESCRIPTION}
        senderExample={SENDER_EXAMPLE}
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
        <TableRegion label="Connection">
          <LoadFailed
            onRetry={() => connections.refetch()}
            retrying={connections.isFetching}
            title="The connection didn’t load"
          />
        </TableRegion>
      );
    }

    if (connection === undefined) {
      return (
        <TableRegion label="Connection">
          <EmptyState
            actions={
              <LinkButton href="/providers" variant="primary">
                Go to Providers
              </LinkButton>
            }
            description={`${organization.name} has no such connection. Someone may have deleted it.`}
            title="This connection isn’t here"
          />
        </TableRegion>
      );
    }

    return (
      <ConnectionForm
        busy={update.isPending}
        key={providerConnectionId}
        busyLabel="Saving…"
        connection={connection}
        cancelHref="/providers"
        failureMessage={connectionFailureMessage(update.error)}
        senderDescription={SENDER_DESCRIPTION}
        senderExample={SENDER_EXAMPLE}
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
