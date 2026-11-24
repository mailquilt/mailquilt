import { LinkButton } from "@cloudflare/kumo";
import type { List, ProviderConnection } from "@repo/domain";

import { PlusIcon } from "../icons/icons.tsx";
import { EmptyState } from "../layout/empty-state.tsx";

const ConnectButton = () => (
  <LinkButton href="/providers/new" icon={PlusIcon} variant="primary">
    Connect SMTP server
  </LinkButton>
);

/**
 * What's missing before a Campaign can be written: a Provider Connection to
 * send it through, a List to send it to, or both, with where to get each.
 * Nothing when both are there.
 */
export const CampaignSetupNeeded = ({
  connections,
  lists,
}: {
  connections: readonly ProviderConnection[];
  lists: readonly List[];
}) => {
  const noConnection = connections.length === 0;
  const noList = lists.length === 0;

  if (noConnection && noList) {
    return (
      <EmptyState
        actions={
          <>
            <LinkButton href="/lists" variant="secondary">
              Go to Lists
            </LinkButton>
            <ConnectButton />
          </>
        }
        description="A campaign goes out through your own provider, to the contacts subscribed to a list. Connect a provider and make a list, then come back to write it."
        title="Two things before your first campaign"
      />
    );
  }

  if (noConnection) {
    return (
      <EmptyState
        actions={<ConnectButton />}
        description="Campaigns go out through your own provider. Connect an SMTP server, then come back to write your first campaign."
        title="Connect a provider first"
      />
    );
  }

  if (noList) {
    return (
      <EmptyState
        actions={
          <LinkButton href="/lists" variant="primary">
            Go to Lists
          </LinkButton>
        }
        description="A campaign goes to the contacts subscribed to one list. Make one and add contacts to it, then come back."
        title="Make a list first"
      />
    );
  }

  return null;
};

/** Whether there's a Provider Connection and a List to write a Campaign with. */
export const isReadyToWrite = (
  connections: readonly ProviderConnection[],
  lists: readonly List[]
) => connections.length > 0 && lists.length > 0;
