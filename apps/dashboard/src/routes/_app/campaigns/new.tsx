import { createFileRoute } from "@tanstack/react-router";

import { NeedsOrganization } from "../../../audience/needs-organization.tsx";
import { NewCampaignPage } from "../../../campaigns/campaign-form-pages.tsx";
import { CAMPAIGNS_NEED_AN_ORGANIZATION } from "../../../campaigns/campaign-search.ts";
import { useOrganizations } from "../../../organizations/organizations.tsx";

const NewCampaign = () => {
  const { active } = useOrganizations();

  if (!active) {
    return (
      <NeedsOrganization
        description={CAMPAIGNS_NEED_AN_ORGANIZATION}
        title="New campaign"
      />
    );
  }

  return <NewCampaignPage key={active.id} organization={active} />;
};

export const Route = createFileRoute("/_app/campaigns/new")({
  component: NewCampaign,
  head: () => ({ meta: [{ title: "New campaign – Mailquilt" }] }),
});
