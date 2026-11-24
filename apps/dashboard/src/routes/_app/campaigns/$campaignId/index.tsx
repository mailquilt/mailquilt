import { CampaignIdSchema } from "@repo/domain";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { NeedsOrganization } from "../../../../audience/needs-organization.tsx";
import { CampaignPage } from "../../../../campaigns/campaign-page.tsx";
import { CAMPAIGNS_NEED_AN_ORGANIZATION } from "../../../../campaigns/campaign-search.ts";
import { useOrganizations } from "../../../../organizations/organizations.tsx";

const isCampaignId = Schema.is(CampaignIdSchema);

const OneCampaign = () => {
  const { active } = useOrganizations();
  const { campaignId } = Route.useParams();

  if (!isCampaignId(campaignId)) {
    return <Navigate replace to="/campaigns" />;
  }

  if (!active) {
    return (
      <NeedsOrganization
        description={CAMPAIGNS_NEED_AN_ORGANIZATION}
        title="Campaign"
      />
    );
  }

  return (
    <CampaignPage
      campaignId={campaignId}
      key={active.id}
      organization={active}
    />
  );
};

export const Route = createFileRoute("/_app/campaigns/$campaignId/")({
  component: OneCampaign,
  head: () => ({ meta: [{ title: "Campaign – Mailquilt" }] }),
});
