import { LinkButton } from "@cloudflare/kumo";
import type {
  Organization,
  ProviderConnection,
  ProviderConnectionId,
} from "@repo/domain";
import { useNavigate } from "@tanstack/react-router";

import { loadingFirstTime } from "../api.ts";
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

const SES_SENDER_DESCRIPTION =
  "Who email sent through this connection is from. It must be an address or domain verified in SES.";

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
    <div className="mq-capped">
      <PageHeader
        crumbs={[{ href: "/providers", label: "Providers" }]}
        description={description}
        title={title}
      />
    </div>
    {children}
  </PageFrame>
);

const senderDescription = (provider: "smtp" | "ses") =>
  provider === "ses" ? SES_SENDER_DESCRIPTION : SENDER_DESCRIPTION;

/** Connects an SMTP server or an SES account, then opens its test email on Providers. */
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
      title="Connect a provider"
    >
      <ConnectionForm
        busy={create.isPending}
        busyLabel="Connecting…"
        cancelHref="/providers"
        chooseProvider
        failureMessage={(provider) =>
          connectionFailureMessage(create.error, provider)
        }
        onProviderChange={() => create.reset()}
        senderDescription={senderDescription}
        senderExample={SENDER_EXAMPLE}
        sendingRate
        onSubmit={(connection) =>
          create.mutate(connection, {
            onSuccess: (created) => {
              navigate({
                search: { connected: created.id },
                to: "/providers",
              });
            },
          })
        }
        submitLabel="Connect"
      />
    </FormPage>
  );
};

const editDescription = (connection: ProviderConnection | undefined) => {
  if (connection?.provider === "ses") {
    return "Changing the Region asks for the access key again.";
  }

  return connection?.signsIn === true
    ? "Changing the host, port or encryption asks for the username and password again."
    : "Change where and how this connection sends.";
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

  if (loadingFirstTime(connections)) {
    return <PageAreaLoading label="Loading the connection" />;
  }

  const connection = connections.data?.find(
    (candidate) => candidate.id === providerConnectionId
  );

  const body = () => {
    if (connections.data === undefined) {
      return (
        <div className="mq-capped">
          <TableRegion label="Connection">
            <LoadFailed
              onRetry={() => connections.refetch()}
              retrying={connections.isFetching}
              title="The connection didn’t load"
            />
          </TableRegion>
        </div>
      );
    }

    if (connection === undefined) {
      return (
        <div className="mq-capped">
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
        </div>
      );
    }

    return (
      <ConnectionForm
        busy={update.isPending}
        key={providerConnectionId}
        busyLabel="Saving…"
        connection={connection}
        cancelHref="/providers"
        failureMessage={(provider) =>
          connectionFailureMessage(update.error, provider)
        }
        senderDescription={senderDescription}
        senderExample={SENDER_EXAMPLE}
        sendingRate
        onSubmit={(changes) =>
          update.mutate(changes, {
            onSuccess: (saved) => {
              navigate({ search: { saved: saved.id }, to: "/providers" });
            },
          })
        }
        submitLabel="Save changes"
      />
    );
  };

  return (
    <FormPage
      description={editDescription(connection)}
      title={
        connection === undefined ? "Edit connection" : `Edit ${connection.name}`
      }
    >
      {body()}
    </FormPage>
  );
};
