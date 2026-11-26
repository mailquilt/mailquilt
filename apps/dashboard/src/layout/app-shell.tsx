import type { OrganizationId } from "@repo/domain";

import {
  useContactPage,
  useLists,
  useSuppressionPage,
} from "../audience/audience-api.ts";
import { AccountMenu } from "../auth/account-menu.tsx";
import { useCampaignPage } from "../campaigns/campaigns-api.ts";
import { OrganizationSwitcher } from "../organizations/organization-switcher.tsx";
import { OrganizationsUnavailable } from "../organizations/organizations-unavailable.tsx";
import {
  useOrganizations,
  useOrganizationsStatus,
} from "../organizations/organizations.tsx";
import { useProviderConnections } from "../providers/providers-api.ts";
import { CrashPlaceContext } from "./crash-place.ts";
import { Frame, Navigation } from "./frame.tsx";
import { useAccount } from "./session-gates.tsx";

const OrganizationNavigation = ({
  organizationId,
}: {
  organizationId: OrganizationId;
}) => {
  const campaigns = useCampaignPage(organizationId, {});
  const contacts = useContactPage(organizationId, {});
  const lists = useLists(organizationId);
  const providers = useProviderConnections(organizationId);
  const suppressions = useSuppressionPage(organizationId, {});

  return (
    <Navigation
      counts={{
        campaigns: campaigns.data?.total,
        contacts: contacts.data?.total,
        lists: lists.data?.length,
        providers: providers.data?.length,
        suppressions: suppressions.data?.total,
      }}
    />
  );
};

/**
 * Everything a signed-in person sees: the page in the frame (`Frame`), with
 * their Organization, its navigation counts and their account. Pages own
 * their own layout.
 */
export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const account = useAccount();
  const { active } = useOrganizations();
  const { status } = useOrganizationsStatus();

  return (
    <Frame
      account={<AccountMenu account={account} />}
      navigation={
        active ? (
          <OrganizationNavigation key={active.id} organizationId={active.id} />
        ) : (
          <Navigation counts={{}} />
        )
      }
      organization={active}
      switcher={<OrganizationSwitcher />}
    >
      <CrashPlaceContext value="page">
        {status === "failed" ? <OrganizationsUnavailable /> : children}
      </CrashPlaceContext>
    </Frame>
  );
};
